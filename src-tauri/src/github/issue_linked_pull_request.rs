use std::collections::HashSet;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue_related::{
        graphql_node_id_is_valid, issue_url_matches, split_repository_full_name,
        IssueGraphQlRequest,
    },
    GitHubPullRequestRepository, GitHubPullRequestState, GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const LINKED_PULL_REQUEST_PAGE_SIZE: i32 = 30;
const ISSUE_LINKED_PULL_REQUESTS_QUERY: &str = r#"
query HarborIssueLinkedPullRequests(
  $owner: String!
  $repository: String!
  $number: Int!
  $first: Int!
  $after: String
) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    issue(number: $number) {
      id
      number
      closedByPullRequestsReferences(
        first: $first
        after: $after
        includeClosedPrs: true
      ) {
        nodes {
          id
          number
          title
          url
          state
          isDraft
          merged
          repository {
            id
            nameWithOwner
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLinkedPullRequestReference {
    pub repository: GitHubPullRequestRepository,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: GitHubPullRequestState,
    pub draft: bool,
    pub merged: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLinkedPullRequestPage {
    pub pull_requests: Vec<GitHubIssueLinkedPullRequestReference>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueLinkedPullRequestRequest<'a> {
    issue: IssueGraphQlRequest<'a>,
    after: Option<&'a str>,
}

impl<'a> IssueLinkedPullRequestRequest<'a> {
    fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        expected_issue_node_id: &'a str,
        after: Option<&'a str>,
    ) -> Result<Self, AppError> {
        if after.is_some_and(|cursor| !valid_cursor(cursor)) {
            return Err(AppError::Validation(
                "GraphQL cursor is invalid".to_string(),
            ));
        }
        Ok(Self {
            issue: IssueGraphQlRequest::new(
                owner,
                repository,
                issue_number,
                expected_issue_node_id,
            )?,
            after,
        })
    }
}

#[async_trait]
pub(crate) trait GitHubIssueLinkedPullRequestClient: Send + Sync {
    async fn issue_linked_pull_requests(
        &self,
        token: &str,
        request: IssueLinkedPullRequestRequest<'_>,
    ) -> Result<GitHubIssueLinkedPullRequestPage, AppError>;
}

impl GitHubService {
    pub async fn issue_linked_pull_requests(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        expected_issue_node_id: &str,
        after: Option<&str>,
    ) -> Result<GitHubIssueLinkedPullRequestPage, AppError> {
        let request = IssueLinkedPullRequestRequest::new(
            owner,
            repository,
            issue_number,
            expected_issue_node_id,
            after,
        )?;
        let token = self.load_access_token().await?;
        self.client
            .issue_linked_pull_requests(&token, request)
            .await
    }
}

#[async_trait]
impl GitHubIssueLinkedPullRequestClient for OctocrabGitHubClient {
    async fn issue_linked_pull_requests(
        &self,
        token: &str,
        request: IssueLinkedPullRequestRequest<'_>,
    ) -> Result<GitHubIssueLinkedPullRequestPage, AppError> {
        let client = authenticated_client(token)?;
        load_issue_linked_pull_requests_with_client(&client, request).await
    }
}

async fn load_issue_linked_pull_requests_with_client(
    client: &octocrab::Octocrab,
    request: IssueLinkedPullRequestRequest<'_>,
) -> Result<GitHubIssueLinkedPullRequestPage, AppError> {
    let payload = issue_linked_pull_requests_payload(request)?;
    let response: IssueLinkedPullRequestsQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    linked_pull_requests_from_graphql(response, request)
}

fn issue_linked_pull_requests_payload(
    request: IssueLinkedPullRequestRequest<'_>,
) -> Result<serde_json::Value, AppError> {
    let number = i32::try_from(request.issue.issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    Ok(serde_json::json!({
        "query": ISSUE_LINKED_PULL_REQUESTS_QUERY,
        "variables": {
            "owner": request.issue.owner,
            "repository": request.issue.repository,
            "number": number,
            "first": LINKED_PULL_REQUEST_PAGE_SIZE,
            "after": request.after,
        }
    }))
}

fn linked_pull_requests_from_graphql(
    response: IssueLinkedPullRequestsQuery,
    request: IssueLinkedPullRequestRequest<'_>,
) -> Result<GitHubIssueLinkedPullRequestPage, AppError> {
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue repository".to_string())
    })?;
    if !graphql_node_id_is_valid(&repository.id)
        || !repository.name_with_owner.eq_ignore_ascii_case(&format!(
            "{}/{}",
            request.issue.owner, request.issue.repository
        ))
    {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue repository".to_string(),
        ));
    }

    let issue = repository
        .issue
        .ok_or_else(|| AppError::GitHub("GitHub did not return the requested Issue".to_string()))?;
    if issue.id != request.issue.expected_issue_node_id
        || issue.number != request.issue.issue_number
    {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue for linked pull requests".to_string(),
        ));
    }

    let connection = issue.pull_requests.ok_or_else(|| {
        AppError::GitHub("GitHub did not return linked pull requests".to_string())
    })?;
    let mut pull_request_ids = HashSet::with_capacity(connection.nodes.len());
    let pull_requests = connection
        .nodes
        .into_iter()
        .map(|node| {
            let node = node.ok_or_else(|| {
                AppError::GitHub("GitHub returned an empty linked pull request".to_string())
            })?;
            let reference = linked_pull_request_reference(node)?;
            if !pull_request_ids.insert(reference.id.clone()) {
                return Err(AppError::GitHub(
                    "GitHub returned a duplicate linked pull request".to_string(),
                ));
            }
            Ok(reference.into_public())
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    let next_cursor = if connection.page_info.has_next_page {
        let cursor = connection.page_info.end_cursor.ok_or_else(|| {
            AppError::GitHub(
                "GitHub did not return the next linked pull request cursor".to_string(),
            )
        })?;
        if !valid_cursor(&cursor) {
            return Err(AppError::GitHub(
                "GitHub returned an invalid linked pull request cursor".to_string(),
            ));
        }
        Some(cursor)
    } else {
        None
    };

    Ok(GitHubIssueLinkedPullRequestPage {
        pull_requests,
        next_cursor,
    })
}

fn linked_pull_request_reference(
    pull_request: GraphQlLinkedPullRequest,
) -> Result<ValidatedLinkedPullRequest, AppError> {
    if !graphql_node_id_is_valid(&pull_request.id)
        || pull_request.number == 0
        || pull_request.title.trim().is_empty()
        || !graphql_node_id_is_valid(&pull_request.repository.id)
    {
        return Err(invalid_linked_pull_request());
    }
    let (owner, repository) = split_repository_full_name(&pull_request.repository.name_with_owner)
        .ok_or_else(invalid_linked_pull_request)?;
    if !issue_url_matches(
        &pull_request.url,
        "github.com",
        &format!("/{owner}/{repository}/pull/{}", pull_request.number),
    ) {
        return Err(AppError::GitHub(
            "GitHub returned an invalid linked pull request URL".to_string(),
        ));
    }
    let state = match pull_request.state {
        GraphQlPullRequestState::Open => {
            if pull_request.merged {
                return Err(invalid_linked_pull_request());
            }
            GitHubPullRequestState::Open
        }
        GraphQlPullRequestState::Closed | GraphQlPullRequestState::Merged => {
            GitHubPullRequestState::Closed
        }
    };
    if matches!(pull_request.state, GraphQlPullRequestState::Merged) && !pull_request.merged {
        return Err(invalid_linked_pull_request());
    }

    Ok(ValidatedLinkedPullRequest {
        id: pull_request.id,
        repository: GitHubPullRequestRepository {
            url: format!("https://github.com/{owner}/{repository}"),
            owner,
            name: repository,
            full_name: pull_request.repository.name_with_owner,
        },
        number: pull_request.number,
        title: pull_request.title,
        url: pull_request.url,
        state,
        draft: pull_request.draft,
        merged: pull_request.merged,
    })
}

fn valid_cursor(value: &str) -> bool {
    !value.is_empty() && value.len() <= 1_024 && !value.chars().any(char::is_control)
}

fn invalid_linked_pull_request() -> AppError {
    AppError::GitHub("GitHub returned an invalid linked pull request".to_string())
}

struct ValidatedLinkedPullRequest {
    id: String,
    repository: GitHubPullRequestRepository,
    number: u64,
    title: String,
    url: String,
    state: GitHubPullRequestState,
    draft: bool,
    merged: bool,
}

impl ValidatedLinkedPullRequest {
    fn into_public(self) -> GitHubIssueLinkedPullRequestReference {
        GitHubIssueLinkedPullRequestReference {
            repository: self.repository,
            number: self.number,
            title: self.title,
            url: self.url,
            state: self.state,
            draft: self.draft,
            merged: self.merged,
        }
    }
}

#[derive(Deserialize)]
struct IssueLinkedPullRequestsQuery {
    repository: Option<GraphQlIssueLinkedPullRequestRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlIssueLinkedPullRequestRepository {
    id: String,
    name_with_owner: String,
    issue: Option<GraphQlIssueLinkedPullRequestIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlIssueLinkedPullRequestIssue {
    id: String,
    number: u64,
    #[serde(rename = "closedByPullRequestsReferences")]
    pull_requests: Option<GraphQlLinkedPullRequestConnection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlLinkedPullRequestConnection {
    nodes: Vec<Option<GraphQlLinkedPullRequest>>,
    page_info: GraphQlPageInfo,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlLinkedPullRequest {
    id: String,
    number: u64,
    title: String,
    url: String,
    state: GraphQlPullRequestState,
    #[serde(rename = "isDraft")]
    draft: bool,
    merged: bool,
    repository: GraphQlLinkedPullRequestRepository,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlLinkedPullRequestRepository {
    id: String,
    name_with_owner: String,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum GraphQlPullRequestState {
    Open,
    Closed,
    Merged,
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueLinkedPullRequestClient for super::tests::FakeGitHubClient {
    async fn issue_linked_pull_requests(
        &self,
        token: &str,
        request: IssueLinkedPullRequestRequest<'_>,
    ) -> Result<GitHubIssueLinkedPullRequestPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                request.issue.owner,
                request.issue.repository,
                request.issue.issue_number,
            ),
            ("octocat", "hello-world", 7)
        );
        assert_eq!(request.issue.expected_issue_node_id, "I_7");
        assert_eq!(request.after, None);
        Ok(GitHubIssueLinkedPullRequestPage {
            pull_requests: Vec::new(),
            next_cursor: None,
        })
    }
}

#[cfg(test)]
mod tests;
