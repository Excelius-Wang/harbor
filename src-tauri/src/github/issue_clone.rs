use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue_related::{graphql_node_id_is_valid, issue_url_matches},
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_CLONE_STATUS_QUERY: &str = r#"
query HarborIssueCloneStatus($owner: String!, $repository: String!, $issueNumber: Int!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    hasIssuesEnabled
    isBlankIssuesEnabled
    viewerCanCreateIssues
    viewerPermission
    issue(number: $issueNumber) {
      id
      number
      title
      body
      state
      repository { id nameWithOwner }
    }
  }
}
"#;

const CREATE_ISSUE_CLONE_MUTATION: &str = r#"
mutation HarborCloneIssue($repositoryId: ID!, $title: String!, $body: String) {
  createIssue(input: {
    repositoryId: $repositoryId
    title: $title
    body: $body
  }) {
    issue {
      id
      number
      title
      body
      url
      state
      repository { id nameWithOwner }
    }
  }
}
"#;

const ISSUE_CLONE_POSTFLIGHT_QUERY: &str = r#"
query HarborIssueClonePostflight($issueId: ID!) {
  node(id: $issueId) {
    __typename
    ... on Issue {
      id
      number
      title
      body
      url
      state
      repository { id nameWithOwner }
    }
  }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueCloneStatus {
    pub repository_id: String,
    pub repository_full_name: String,
    pub issue_node_id: String,
    pub issue_number: u64,
    pub title: String,
    pub body: Option<String>,
    pub source_open: bool,
    pub destination_allows_blank_issues: bool,
    pub viewer_can_clone: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueClone {
    pub repository_id: String,
    pub repository_full_name: String,
    pub source_issue_node_id: String,
    pub source_issue_number: u64,
    pub target_issue_node_id: String,
    pub target_issue_number: u64,
    pub target_issue_url: String,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueCloneMutation<'a> {
    pub(crate) owner: &'a str,
    pub(crate) repository: &'a str,
    pub(crate) issue_number: u64,
    pub(crate) expected_issue_node_id: &'a str,
    pub(crate) title: &'a str,
    pub(crate) body: &'a str,
}

#[async_trait]
pub(crate) trait GitHubIssueCloneClient: Send + Sync {
    async fn issue_clone_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueCloneStatus, AppError>;

    async fn clone_issue(
        &self,
        token: &str,
        mutation: IssueCloneMutation<'_>,
    ) -> Result<GitHubIssueClone, AppError>;
}

impl GitHubService {
    pub async fn issue_clone_status(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueCloneStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .issue_clone_status(&token, owner, repository, issue_number)
            .await
    }

    pub async fn clone_issue(
        &self,
        mutation: IssueCloneMutation<'_>,
    ) -> Result<GitHubIssueClone, AppError> {
        let token = self.load_access_token().await?;
        self.client.clone_issue(&token, mutation).await
    }
}

#[async_trait]
impl GitHubIssueCloneClient for OctocrabGitHubClient {
    async fn issue_clone_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueCloneStatus, AppError> {
        let client = authenticated_client(token)?;
        load_issue_clone_status_with_client(&client, owner, repository, issue_number).await
    }

    async fn clone_issue(
        &self,
        token: &str,
        mutation: IssueCloneMutation<'_>,
    ) -> Result<GitHubIssueClone, AppError> {
        let read_client = authenticated_client(token)?;
        let status = load_issue_clone_status_with_client(
            &read_client,
            mutation.owner,
            mutation.repository,
            mutation.issue_number,
        )
        .await?;
        ensure_clone_preflight(&status, mutation)?;

        let write_client = issue_clone_client(token)?;
        let created = execute_clone(&write_client, mutation, &status).await?;
        let postflight = load_issue_clone_postflight(&write_client, &created.target_issue_node_id)
            .await
            .map_err(|error| post_write_error(error, created.target_issue_number))?;
        ensure_clone_postflight(&postflight, &created, mutation, &status)?;
        Ok(created)
    }
}

async fn load_issue_clone_status_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<GitHubIssueCloneStatus, AppError> {
    let number = i32::try_from(issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    let payload = serde_json::json!({
        "query": ISSUE_CLONE_STATUS_QUERY,
        "variables": { "owner": owner, "repository": repository, "issueNumber": number },
    });
    let response: IssueCloneStatusResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    let repository_node = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue clone repository".to_string())
    })?;
    ensure_repository_identity(
        &repository_node.id,
        &repository_node.name_with_owner,
        owner,
        repository,
    )?;
    let source = repository_node
        .issue
        .ok_or_else(|| AppError::GitHub("GitHub did not return the Issue to clone".to_string()))?;
    if source.number != issue_number
        || !graphql_node_id_is_valid(&source.id)
        || source.repository.id != repository_node.id
        || !source
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&repository_node.name_with_owner)
    {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected Issue clone source".to_string(),
        ));
    }
    let source_open = source.state.eq_ignore_ascii_case("OPEN");
    let maintainer_can_create_blank_issue = matches!(
        repository_node.viewer_permission.as_deref(),
        Some("WRITE" | "MAINTAIN" | "ADMIN")
    );
    let destination_allows_blank_issues =
        repository_node.is_blank_issues_enabled || maintainer_can_create_blank_issue;
    let viewer_can_clone = source_open
        && repository_node.has_issues_enabled
        && repository_node.viewer_can_create_issues
        && destination_allows_blank_issues
        && matches!(
            repository_node.viewer_permission.as_deref(),
            Some("TRIAGE" | "WRITE" | "MAINTAIN" | "ADMIN")
        );
    Ok(GitHubIssueCloneStatus {
        repository_id: repository_node.id,
        repository_full_name: repository_node.name_with_owner,
        issue_node_id: source.id,
        issue_number: source.number,
        title: source.title,
        body: source.body,
        source_open,
        destination_allows_blank_issues,
        viewer_can_clone,
    })
}

fn ensure_clone_preflight(
    status: &GitHubIssueCloneStatus,
    mutation: IssueCloneMutation<'_>,
) -> Result<(), AppError> {
    if !status.issue_node_id.eq(mutation.expected_issue_node_id) {
        return Err(AppError::GitHubIssueStateConflict(
            "the source Issue changed; refresh before cloning".to_string(),
        ));
    }
    if !status.source_open {
        return Err(AppError::Validation(
            "only open Issues can be cloned".to_string(),
        ));
    }
    if !status.destination_allows_blank_issues {
        return Err(AppError::Validation(
            "the destination repository does not allow blank Issues".to_string(),
        ));
    }
    if !status.viewer_can_clone {
        return Err(AppError::GitHubPermission(
            "triage access and Issue creation permission are required to clone an Issue"
                .to_string(),
        ));
    }
    if mutation.title.trim().is_empty() {
        return Err(AppError::Validation(
            "cloned Issue title must not be empty".to_string(),
        ));
    }
    Ok(())
}

async fn execute_clone(
    client: &octocrab::Octocrab,
    mutation: IssueCloneMutation<'_>,
    status: &GitHubIssueCloneStatus,
) -> Result<GitHubIssueClone, AppError> {
    let payload = serde_json::json!({
        "query": CREATE_ISSUE_CLONE_MUTATION,
        "variables": {
            "repositoryId": status.repository_id,
            "title": mutation.title,
            "body": mutation.body,
        },
    });
    let response: CreateIssueCloneResponse =
        client.graphql(&payload).await.map_err(clone_write_error)?;
    let created = response
        .create_issue
        .and_then(|payload| payload.issue)
        .ok_or_else(|| {
            AppError::GitHub(
                "GitHub did not return the cloned Issue; it may have been created, so refresh the Issue list before retrying"
                    .to_string(),
            )
        })?;
    validate_created_identity(&created, status, mutation)
}

async fn load_issue_clone_postflight(
    client: &octocrab::Octocrab,
    issue_id: &str,
) -> Result<ClonedIssue, AppError> {
    let payload = serde_json::json!({
        "query": ISSUE_CLONE_POSTFLIGHT_QUERY,
        "variables": { "issueId": issue_id },
    });
    let response: IssueClonePostflightResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    response.node.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the cloned Issue after creation".to_string())
    })
}

fn validate_created_identity(
    created: &ClonedIssue,
    status: &GitHubIssueCloneStatus,
    mutation: IssueCloneMutation<'_>,
) -> Result<GitHubIssueClone, AppError> {
    if !graphql_node_id_is_valid(&created.id)
        || created.id == status.issue_node_id
        || created.number == 0
        || created.repository.id != status.repository_id
        || !created
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&status.repository_full_name)
        || !created.state.eq_ignore_ascii_case("OPEN")
        || !issue_url_matches(
            &created.url,
            "github.com",
            &format!(
                "/{}/{}/issues/{}",
                mutation.owner, mutation.repository, created.number
            ),
        )
    {
        return Err(AppError::GitHub(
            "GitHub returned a cloned Issue with an unexpected identity".to_string(),
        ));
    }
    Ok(GitHubIssueClone {
        repository_id: status.repository_id.clone(),
        repository_full_name: status.repository_full_name.clone(),
        source_issue_node_id: status.issue_node_id.clone(),
        source_issue_number: status.issue_number,
        target_issue_node_id: created.id.clone(),
        target_issue_number: created.number,
        target_issue_url: created.url.clone(),
    })
}

fn ensure_clone_postflight(
    postflight: &ClonedIssue,
    created: &GitHubIssueClone,
    mutation: IssueCloneMutation<'_>,
    status: &GitHubIssueCloneStatus,
) -> Result<(), AppError> {
    if postflight.id != created.target_issue_node_id
        || postflight.number != created.target_issue_number
        || postflight.repository.id != status.repository_id
        || !postflight
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&status.repository_full_name)
        || !postflight.state.eq_ignore_ascii_case("OPEN")
        || postflight.title != mutation.title
        || postflight.body.as_deref().unwrap_or_default() != mutation.body
        || postflight.url != created.target_issue_url
    {
        return Err(confirmation_error(
            created.target_issue_number,
            "the returned Issue identity or content did not match",
        ));
    }
    Ok(())
}

fn ensure_repository_identity(
    id: &str,
    name_with_owner: &str,
    owner: &str,
    repository: &str,
) -> Result<(), AppError> {
    if !graphql_node_id_is_valid(id)
        || !name_with_owner.eq_ignore_ascii_case(&format!("{owner}/{repository}"))
    {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected Issue clone repository identity".to_string(),
        ));
    }
    Ok(())
}

fn confirmation_error(issue_number: u64, detail: &str) -> AppError {
    AppError::GitHub(format!(
        "GitHub created Issue #{issue_number}, but Harbor could not confirm it ({detail}); refresh the Issue list before retrying"
    ))
}

fn post_write_error(error: AppError, issue_number: u64) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => confirmation_error(issue_number, &error.to_string()),
    }
}

fn clone_write_error(error: octocrab::Error) -> AppError {
    match github_error(error) {
        AppError::GitHubPermission(message) => AppError::GitHubPermission(message),
        AppError::GitHubRateLimited(message) => AppError::GitHubRateLimited(message),
        AppError::GitHub(message) => AppError::GitHub(format!(
            "{message}; GitHub may have created the cloned Issue, so refresh the Issue list before retrying"
        )),
        other => other,
    }
}

fn issue_clone_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    issue_clone_client_with_base(token, None)
}

fn issue_clone_client_with_base(
    token: &str,
    base_uri: Option<&str>,
) -> Result<octocrab::Octocrab, AppError> {
    let builder = octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None);
    let builder = if let Some(base_uri) = base_uri {
        builder
            .base_uri(base_uri)
            .map_err(|error| AppError::GitHub(error.to_string()))?
    } else {
        builder
    };
    builder
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueCloneStatusResponse {
    repository: Option<IssueCloneRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueCloneRepository {
    id: String,
    name_with_owner: String,
    has_issues_enabled: bool,
    is_blank_issues_enabled: bool,
    viewer_can_create_issues: bool,
    viewer_permission: Option<String>,
    issue: Option<SourceIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceIssue {
    id: String,
    number: u64,
    title: String,
    body: Option<String>,
    state: String,
    repository: IssueCloneRepositoryIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateIssueCloneResponse {
    create_issue: Option<CreateIssueClonePayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateIssueClonePayload {
    issue: Option<ClonedIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueClonePostflightResponse {
    node: Option<ClonedIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClonedIssue {
    id: String,
    number: u64,
    title: String,
    body: Option<String>,
    url: String,
    state: String,
    repository: IssueCloneRepositoryIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueCloneRepositoryIdentity {
    id: String,
    name_with_owner: String,
}

#[cfg(test)]
mod tests;
