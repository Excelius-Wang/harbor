use std::collections::HashSet;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue::GitHubIssueState,
    issue_related::{
        graphql_node_id_is_valid, issue_url_matches, split_repository_full_name,
        IssueGraphQlRequest,
    },
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_TRACKING_PAGE_SIZE: i32 = 30;
const TRACKED_ISSUES_QUERY: &str = r#"
query HarborIssueTracking(
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
      trackedIssues(first: $first, after: $after) {
        nodes {
          id
          number
          title
          url
          state
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

const TRACKED_IN_ISSUES_QUERY: &str = r#"
query HarborIssueTracking(
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
      trackedInIssues(first: $first, after: $after) {
        nodes {
          id
          number
          title
          url
          state
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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubIssueTrackingDirection {
    Tracked,
    TrackedBy,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTrackingRepository {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub url: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTrackingReference {
    pub node_id: String,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: GitHubIssueState,
    pub repository: GitHubIssueTrackingRepository,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTrackingPage {
    pub direction: GitHubIssueTrackingDirection,
    pub issues: Vec<GitHubIssueTrackingReference>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueTrackingRequest<'a> {
    issue: IssueGraphQlRequest<'a>,
    direction: GitHubIssueTrackingDirection,
    after: Option<&'a str>,
}

impl<'a> IssueTrackingRequest<'a> {
    pub(crate) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        expected_issue_node_id: &'a str,
        direction: GitHubIssueTrackingDirection,
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
            direction,
            after,
        })
    }
}

#[async_trait]
pub(crate) trait GitHubIssueTrackingClient: Send + Sync {
    async fn issue_tracking(
        &self,
        token: &str,
        request: IssueTrackingRequest<'_>,
    ) -> Result<GitHubIssueTrackingPage, AppError>;
}

impl GitHubService {
    pub async fn issue_tracking(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        expected_issue_node_id: &str,
        direction: GitHubIssueTrackingDirection,
        after: Option<&str>,
    ) -> Result<GitHubIssueTrackingPage, AppError> {
        let request = IssueTrackingRequest::new(
            owner,
            repository,
            issue_number,
            expected_issue_node_id,
            direction,
            after,
        )?;
        let token = self.load_access_token().await?;
        self.client.issue_tracking(&token, request).await
    }
}

#[async_trait]
impl GitHubIssueTrackingClient for OctocrabGitHubClient {
    async fn issue_tracking(
        &self,
        token: &str,
        request: IssueTrackingRequest<'_>,
    ) -> Result<GitHubIssueTrackingPage, AppError> {
        let client = authenticated_client(token)?;
        load_issue_tracking_with_client(&client, request).await
    }
}

async fn load_issue_tracking_with_client(
    client: &octocrab::Octocrab,
    request: IssueTrackingRequest<'_>,
) -> Result<GitHubIssueTrackingPage, AppError> {
    let payload = issue_tracking_payload(request)?;
    let response: IssueTrackingQuery = client.graphql(&payload).await.map_err(github_error)?;
    issue_tracking_from_graphql(response, request)
}

fn issue_tracking_payload(
    request: IssueTrackingRequest<'_>,
) -> Result<serde_json::Value, AppError> {
    let number = i32::try_from(request.issue.issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    let query = match request.direction {
        GitHubIssueTrackingDirection::Tracked => TRACKED_ISSUES_QUERY,
        GitHubIssueTrackingDirection::TrackedBy => TRACKED_IN_ISSUES_QUERY,
    };
    Ok(serde_json::json!({
        "query": query,
        "variables": {
            "owner": request.issue.owner,
            "repository": request.issue.repository,
            "number": number,
            "first": ISSUE_TRACKING_PAGE_SIZE,
            "after": request.after,
        }
    }))
}

fn issue_tracking_from_graphql(
    response: IssueTrackingQuery,
    request: IssueTrackingRequest<'_>,
) -> Result<GitHubIssueTrackingPage, AppError> {
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
            "GitHub returned a different Issue for tracking relationships".to_string(),
        ));
    }

    let connection = match request.direction {
        GitHubIssueTrackingDirection::Tracked => issue.tracked_issues,
        GitHubIssueTrackingDirection::TrackedBy => issue.tracked_in_issues,
    }
    .ok_or_else(|| {
        AppError::GitHub("GitHub did not return Issue tracking relationships".to_string())
    })?;
    let mut issue_ids = HashSet::with_capacity(connection.nodes.len());
    let issues = connection
        .nodes
        .into_iter()
        .map(|node| {
            let node = node.ok_or_else(|| {
                AppError::GitHub("GitHub returned an empty tracked Issue".to_string())
            })?;
            let reference = issue_tracking_reference(node)?;
            if reference.node_id == request.issue.expected_issue_node_id
                || (reference.number == request.issue.issue_number
                    && reference
                        .repository
                        .owner
                        .eq_ignore_ascii_case(request.issue.owner)
                    && reference
                        .repository
                        .name
                        .eq_ignore_ascii_case(request.issue.repository))
            {
                return Err(AppError::GitHub(
                    "GitHub returned the current Issue in tracking relationships".to_string(),
                ));
            }
            if !issue_ids.insert(reference.node_id.clone()) {
                return Err(AppError::GitHub(
                    "GitHub returned a duplicate tracked Issue".to_string(),
                ));
            }
            Ok(reference)
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    let next_cursor = if connection.page_info.has_next_page {
        let cursor = connection.page_info.end_cursor.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the next tracked Issue cursor".to_string())
        })?;
        if !valid_cursor(&cursor) {
            return Err(AppError::GitHub(
                "GitHub returned an invalid tracked Issue cursor".to_string(),
            ));
        }
        Some(cursor)
    } else {
        None
    };

    Ok(GitHubIssueTrackingPage {
        direction: request.direction,
        issues,
        next_cursor,
    })
}

fn issue_tracking_reference(
    issue: GraphQlTrackedIssue,
) -> Result<GitHubIssueTrackingReference, AppError> {
    if !graphql_node_id_is_valid(&issue.id)
        || issue.number == 0
        || issue.title.trim().is_empty()
        || !graphql_node_id_is_valid(&issue.repository.id)
    {
        return Err(invalid_tracked_issue());
    }
    let (owner, repository) = split_repository_full_name(&issue.repository.name_with_owner)
        .ok_or_else(invalid_tracked_issue)?;
    if !issue_url_matches(
        &issue.url,
        "github.com",
        &format!("/{owner}/{repository}/issues/{}", issue.number),
    ) {
        return Err(AppError::GitHub(
            "GitHub returned an invalid tracked Issue URL".to_string(),
        ));
    }
    let state = match issue.state {
        GraphQlIssueState::Open => GitHubIssueState::Open,
        GraphQlIssueState::Closed => GitHubIssueState::Closed,
    };
    let repository_url = format!("https://github.com/{owner}/{repository}");
    Ok(GitHubIssueTrackingReference {
        node_id: issue.id,
        number: issue.number,
        title: issue.title,
        url: issue.url,
        state,
        repository: GitHubIssueTrackingRepository {
            owner,
            name: repository.clone(),
            full_name: issue.repository.name_with_owner,
            url: repository_url,
        },
    })
}

fn valid_cursor(value: &str) -> bool {
    !value.is_empty() && value.len() <= 1_024 && !value.chars().any(char::is_control)
}

fn invalid_tracked_issue() -> AppError {
    AppError::GitHub("GitHub returned an invalid tracked Issue".to_string())
}

#[derive(Deserialize)]
struct IssueTrackingQuery {
    repository: Option<GraphQlTrackingRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlTrackingRepository {
    id: String,
    name_with_owner: String,
    issue: Option<GraphQlTrackingSourceIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlTrackingSourceIssue {
    id: String,
    number: u64,
    tracked_issues: Option<GraphQlTrackingConnection>,
    tracked_in_issues: Option<GraphQlTrackingConnection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlTrackingConnection {
    nodes: Vec<Option<GraphQlTrackedIssue>>,
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
struct GraphQlTrackedIssue {
    id: String,
    number: u64,
    title: String,
    url: String,
    state: GraphQlIssueState,
    repository: GraphQlTrackedIssueRepository,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlTrackedIssueRepository {
    id: String,
    name_with_owner: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum GraphQlIssueState {
    Open,
    Closed,
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueTrackingClient for super::tests::FakeGitHubClient {
    async fn issue_tracking(
        &self,
        token: &str,
        request: IssueTrackingRequest<'_>,
    ) -> Result<GitHubIssueTrackingPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(request.issue.expected_issue_node_id, "I_7");
        Ok(GitHubIssueTrackingPage {
            direction: request.direction,
            issues: Vec::new(),
            next_cursor: None,
        })
    }
}

#[cfg(test)]
mod tests;
