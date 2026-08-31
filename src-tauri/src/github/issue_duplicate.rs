use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    github_error,
    issue::GitHubIssue,
    issue_related::{
        graphql_node_id_is_valid, issue_url_matches, split_repository_full_name,
        IssueGraphQlRequest,
    },
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

mod mutations;

use mutations::{
    mark_issue_duplicate_with_client, unmark_issue_duplicate_with_client,
    IssueDuplicateMarkMutation, IssueDuplicateMutation,
};

const ISSUE_DUPLICATE_QUERY: &str = r#"
query HarborIssueDuplicate($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
    issue(number: $number) {
      id
      number
      state
      stateReason
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
    pub viewer_can_unmark: bool,
}

#[async_trait]
pub(crate) trait GitHubIssueDuplicateClient: Send + Sync {
    async fn issue_duplicate(
        &self,
        token: &str,
        request: IssueGraphQlRequest<'_>,
    ) -> Result<Option<GitHubIssueDuplicateReference>, AppError>;

    async fn unmark_issue_duplicate(
        &self,
        token: &str,
        mutation: IssueDuplicateMutation<'_>,
    ) -> Result<GitHubIssue, AppError>;

    async fn mark_issue_duplicate(
        &self,
        token: &str,
        mutation: IssueDuplicateMarkMutation<'_>,
    ) -> Result<GitHubIssue, AppError>;
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

    pub async fn unmark_issue_duplicate(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        expected_issue_node_id: &str,
    ) -> Result<GitHubIssue, AppError> {
        let mutation =
            IssueDuplicateMutation::new(owner, repository, issue_number, expected_issue_node_id)?;
        let token = self.load_access_token().await?;
        self.client.unmark_issue_duplicate(&token, mutation).await
    }

    pub async fn mark_issue_duplicate(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        canonical_issue_number: u64,
        expected_issue_node_id: &str,
    ) -> Result<GitHubIssue, AppError> {
        let mutation = IssueDuplicateMarkMutation::new(
            owner,
            repository,
            issue_number,
            canonical_issue_number,
            expected_issue_node_id,
        )?;
        let token = self.load_access_token().await?;
        self.client.mark_issue_duplicate(&token, mutation).await
    }
}

#[async_trait]
impl GitHubIssueDuplicateClient for OctocrabGitHubClient {
    async fn issue_duplicate(
        &self,
        token: &str,
        request: IssueGraphQlRequest<'_>,
    ) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
        let client = issue_duplicate_client(token)?;
        load_issue_duplicate_with_client(&client, request).await
    }

    async fn unmark_issue_duplicate(
        &self,
        token: &str,
        mutation: IssueDuplicateMutation<'_>,
    ) -> Result<GitHubIssue, AppError> {
        let client = issue_duplicate_client(token)?;
        unmark_issue_duplicate_with_client(&client, mutation).await
    }

    async fn mark_issue_duplicate(
        &self,
        token: &str,
        mutation: IssueDuplicateMarkMutation<'_>,
    ) -> Result<GitHubIssue, AppError> {
        let client = issue_duplicate_client(token)?;
        mark_issue_duplicate_with_client(&client, mutation).await
    }
}

fn issue_duplicate_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

async fn load_issue_duplicate_with_client(
    client: &octocrab::Octocrab,
    request: IssueGraphQlRequest<'_>,
) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
    let snapshot = load_issue_duplicate_snapshot_with_client(client, request).await?;
    duplicate_from_snapshot(snapshot)
}

pub(super) async fn load_issue_duplicate_snapshot_with_client(
    client: &octocrab::Octocrab,
    request: IssueGraphQlRequest<'_>,
) -> Result<IssueDuplicateSnapshot, AppError> {
    let payload = issue_duplicate_payload(request)?;
    let response: IssueDuplicateQuery = client.graphql(&payload).await.map_err(github_error)?;
    duplicate_snapshot_from_graphql(response, request)
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

fn duplicate_snapshot_from_graphql(
    response: IssueDuplicateQuery,
    request: IssueGraphQlRequest<'_>,
) -> Result<IssueDuplicateSnapshot, AppError> {
    let repository_node = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue repository".to_string())
    })?;
    if !graphql_node_id_is_valid(&repository_node.id)
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
    let viewer_can_unmark =
        repository_viewer_can_write(repository_node.viewer_permission.as_deref());
    let canonical = issue
        .duplicate_of
        .map(|duplicate| {
            let node_id = duplicate.id.clone();
            canonical_reference(duplicate, request.expected_issue_node_id, viewer_can_unmark)
                .map(|reference| CanonicalDuplicate { node_id, reference })
                .map_err(|message| {
                    AppError::GitHub(format!(
                        "GitHub returned an invalid duplicate Issue: {message}"
                    ))
                })
        })
        .transpose()?;
    Ok(IssueDuplicateSnapshot {
        repository_id: repository_node.id,
        repository_full_name: repository_node.name_with_owner,
        viewer_permission: repository_node.viewer_permission,
        issue_node_id: issue.id,
        issue_number: issue.number,
        state: issue.state,
        state_reason: issue.state_reason,
        canonical,
    })
}

fn duplicate_from_snapshot(
    snapshot: IssueDuplicateSnapshot,
) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
    if !snapshot.is_marked_duplicate() {
        return Ok(None);
    }
    snapshot
        .canonical
        .map(|canonical| canonical.reference)
        .map(Some)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the canonical duplicate Issue".to_string())
        })
}

pub(super) struct IssueDuplicateSnapshot {
    pub(super) repository_id: String,
    pub(super) repository_full_name: String,
    pub(super) viewer_permission: Option<String>,
    pub(super) issue_node_id: String,
    pub(super) issue_number: u64,
    pub(super) state: String,
    pub(super) state_reason: Option<String>,
    pub(super) canonical: Option<CanonicalDuplicate>,
}

impl IssueDuplicateSnapshot {
    pub(super) fn is_marked_duplicate(&self) -> bool {
        self.state == "CLOSED" && self.state_reason.as_deref() == Some("DUPLICATE")
    }
}

pub(super) struct CanonicalDuplicate {
    pub(super) node_id: String,
    pub(super) reference: GitHubIssueDuplicateReference,
}

fn canonical_reference(
    issue: GraphQlDuplicateIssue,
    source_issue_node_id: &str,
    viewer_can_unmark: bool,
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
        viewer_can_unmark,
    })
}

fn repository_viewer_can_write(permission: Option<&str>) -> bool {
    matches!(permission, Some("WRITE" | "MAINTAIN" | "ADMIN"))
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
    viewer_permission: Option<String>,
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

    async fn unmark_issue_duplicate(
        &self,
        token: &str,
        mutation: IssueDuplicateMutation<'_>,
    ) -> Result<GitHubIssue, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                mutation.request.owner,
                mutation.request.repository,
                mutation.request.issue_number,
                mutation.request.expected_issue_node_id,
            ),
            ("octocat", "hello-world", 7, "I_7")
        );
        Ok(crate::github::issue::GitHubIssueClient::issue_detail(
            self,
            token,
            mutation.request.owner,
            mutation.request.repository,
            mutation.request.issue_number,
            1,
        )
        .await?
        .issue)
    }

    async fn mark_issue_duplicate(
        &self,
        token: &str,
        mutation: IssueDuplicateMarkMutation<'_>,
    ) -> Result<GitHubIssue, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                mutation.request.owner,
                mutation.request.repository,
                mutation.request.issue_number,
                mutation.canonical_issue_number,
                mutation.request.expected_issue_node_id,
            ),
            ("octocat", "hello-world", 7, 9, "I_7")
        );
        Ok(crate::github::issue::GitHubIssueClient::issue_detail(
            self,
            token,
            mutation.request.owner,
            mutation.request.repository,
            mutation.request.issue_number,
            1,
        )
        .await?
        .issue)
    }
}

#[cfg(test)]
mod tests;
