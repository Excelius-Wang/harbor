use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue_related::{
        graphql_node_id_is_valid, issue_url_matches, split_repository_full_name,
        IssueGraphQlRequest,
    },
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_DUPLICATE_QUERY: &str = r#"
query HarborIssueDuplicate($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    issue(number: $number) {
      id
      number
      state
      stateReason(enableDuplicate: true)
      duplicateOf {
        id
        number
        title
        url
        repository {
          nameWithOwner
        }
      }
    }
  }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueDuplicateReference {
    pub owner: String,
    pub repository: String,
    pub full_name: String,
    pub repository_url: String,
    pub issue_number: u64,
    pub title: String,
    pub url: String,
}

#[async_trait]
pub(crate) trait GitHubIssueDuplicateClient: Send + Sync {
    async fn issue_duplicate(
        &self,
        token: &str,
        request: IssueGraphQlRequest<'_>,
    ) -> Result<Option<GitHubIssueDuplicateReference>, AppError>;
}

impl GitHubService {
    pub async fn issue_duplicate(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        expected_issue_node_id: &str,
    ) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
        let request =
            IssueGraphQlRequest::new(owner, repository, issue_number, expected_issue_node_id)?;
        let token = self.load_access_token().await?;
        self.client.issue_duplicate(&token, request).await
    }
}

#[async_trait]
impl GitHubIssueDuplicateClient for OctocrabGitHubClient {
    async fn issue_duplicate(
        &self,
        token: &str,
        request: IssueGraphQlRequest<'_>,
    ) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
        let client = authenticated_client(token)?;
        load_issue_duplicate_with_client(&client, request).await
    }
}

async fn load_issue_duplicate_with_client(
    client: &octocrab::Octocrab,
    request: IssueGraphQlRequest<'_>,
) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
    let payload = issue_duplicate_payload(request)?;
    let response: IssueDuplicateQuery = client.graphql(&payload).await.map_err(github_error)?;
    duplicate_from_graphql(response, request)
}

fn issue_duplicate_payload(
    request: IssueGraphQlRequest<'_>,
) -> Result<serde_json::Value, AppError> {
    let number = i32::try_from(request.issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    Ok(serde_json::json!({
        "query": ISSUE_DUPLICATE_QUERY,
        "variables": {
            "owner": request.owner,
            "repository": request.repository,
            "number": number,
        }
    }))
}

fn duplicate_from_graphql(
    response: IssueDuplicateQuery,
    request: IssueGraphQlRequest<'_>,
) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
    let repository_node = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue repository".to_string())
    })?;
    if repository_node.id.trim().is_empty()
        || !repository_node
            .name_with_owner
            .eq_ignore_ascii_case(&format!("{}/{}", request.owner, request.repository))
    {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue repository".to_string(),
        ));
    }

    let issue = repository_node
        .issue
        .ok_or_else(|| AppError::GitHub("GitHub did not return the requested Issue".to_string()))?;
    if issue.id != request.expected_issue_node_id || issue.number != request.issue_number {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue for the duplicate reference".to_string(),
        ));
    }
    if issue.state != "CLOSED" || issue.state_reason.as_deref() != Some("DUPLICATE") {
        return Ok(None);
    }

    let duplicate = issue.duplicate_of.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the canonical duplicate Issue".to_string())
    })?;
    canonical_reference(duplicate, request.expected_issue_node_id)
        .map(Some)
        .map_err(|message| {
            AppError::GitHub(format!(
                "GitHub returned an invalid duplicate Issue: {message}"
            ))
        })
}

fn canonical_reference(
    issue: GraphQlDuplicateIssue,
    source_issue_node_id: &str,
) -> Result<GitHubIssueDuplicateReference, &'static str> {
    if !graphql_node_id_is_valid(&issue.id) || issue.id == source_issue_node_id {
        return Err("the canonical Issue identity is invalid");
    }
    if issue.number == 0 || issue.title.trim().is_empty() {
        return Err("the canonical Issue fields are invalid");
    }
    let (owner, repository) = split_repository_full_name(&issue.repository.name_with_owner)
        .ok_or("the canonical Issue repository is invalid")?;
    if !issue_url_matches(
        &issue.url,
        "github.com",
        &format!("/{owner}/{repository}/issues/{}", issue.number),
    ) {
        return Err("the canonical Issue URL is invalid");
    }

    Ok(GitHubIssueDuplicateReference {
        repository_url: format!("https://github.com/{owner}/{repository}"),
        full_name: issue.repository.name_with_owner,
        owner,
        repository,
        issue_number: issue.number,
        title: issue.title,
        url: issue.url,
    })
}

#[derive(Deserialize)]
struct IssueDuplicateQuery {
    repository: Option<GraphQlDuplicateRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDuplicateRepository {
    id: String,
    name_with_owner: String,
    issue: Option<GraphQlDuplicateSourceIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDuplicateSourceIssue {
    id: String,
    number: u64,
    state: String,
    state_reason: Option<String>,
    duplicate_of: Option<GraphQlDuplicateIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDuplicateIssue {
    id: String,
    number: u64,
    title: String,
    url: String,
    repository: GraphQlDuplicateIssueRepository,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDuplicateIssueRepository {
    name_with_owner: String,
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueDuplicateClient for super::tests::FakeGitHubClient {
    async fn issue_duplicate(
        &self,
        token: &str,
        request: IssueGraphQlRequest<'_>,
    ) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (request.owner, request.repository, request.issue_number),
            ("octocat", "hello-world", 7)
        );
        assert_eq!(request.expected_issue_node_id, "I_7");
        Ok(None)
    }
}

#[cfg(test)]
mod tests;
