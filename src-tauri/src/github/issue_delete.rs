use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, is_github_permission_message, is_github_rate_limit_message,
    issue_related::{graphql_node_id_is_valid, issue_url_matches, IssueGraphQlRequest},
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_DELETE_STATUS_QUERY: &str = r#"
query HarborIssueDeleteStatus($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
    issue(number: $number) {
      id
      number
      url
      viewerCanDelete
      repository { id nameWithOwner }
    }
  }
}
"#;

const DELETE_ISSUE_MUTATION: &str = r#"
mutation HarborDeleteIssue($issueId: ID!) {
  result: deleteIssue(input: { issueId: $issueId }) {
    repository { id nameWithOwner }
  }
}
"#;

const ISSUE_DELETE_POSTFLIGHT_QUERY: &str = r#"
query HarborIssueDeletePostflight($owner: String!, $repository: String!, $issueId: ID!) {
  repository(owner: $owner, name: $repository) { id nameWithOwner }
  node(id: $issueId) { __typename }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueDeleteStatus {
    pub repository_id: String,
    pub repository_full_name: String,
    pub issue_node_id: String,
    pub number: u64,
    pub viewer_can_delete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueDeletion {
    pub repository_id: String,
    pub repository_full_name: String,
    pub issue_node_id: String,
    pub number: u64,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueDeleteMutation<'a> {
    request: IssueGraphQlRequest<'a>,
}

impl<'a> IssueDeleteMutation<'a> {
    pub(crate) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        expected_issue_node_id: &'a str,
    ) -> Result<Self, AppError> {
        Ok(Self {
            request: IssueGraphQlRequest::new(
                owner,
                repository,
                issue_number,
                expected_issue_node_id,
            )?,
        })
    }
}

#[async_trait]
pub(crate) trait GitHubIssueDeleteClient: Send + Sync {
    async fn issue_delete_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueDeleteStatus, AppError>;

    async fn delete_issue(
        &self,
        token: &str,
        mutation: IssueDeleteMutation<'_>,
    ) -> Result<GitHubIssueDeletion, AppError>;
}

impl GitHubService {
    pub async fn issue_delete_status(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueDeleteStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .issue_delete_status(&token, owner, repository, issue_number)
            .await
    }

    pub async fn delete_issue(
        &self,
        mutation: IssueDeleteMutation<'_>,
    ) -> Result<GitHubIssueDeletion, AppError> {
        let token = self.load_access_token().await?;
        self.client.delete_issue(&token, mutation).await
    }
}

#[async_trait]
impl GitHubIssueDeleteClient for OctocrabGitHubClient {
    async fn issue_delete_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueDeleteStatus, AppError> {
        let client = authenticated_client(token)?;
        load_issue_delete_status_with_client(&client, owner, repository, issue_number).await
    }

    async fn delete_issue(
        &self,
        token: &str,
        mutation: IssueDeleteMutation<'_>,
    ) -> Result<GitHubIssueDeletion, AppError> {
        let client = issue_delete_client(token)?;
        delete_issue_with_client(&client, mutation).await
    }
}

fn issue_delete_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

pub(crate) async fn load_issue_delete_status_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<GitHubIssueDeleteStatus, AppError> {
    let number = i32::try_from(issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    let payload = serde_json::json!({
        "query": ISSUE_DELETE_STATUS_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "number": number,
        }
    });
    let response: IssueDeleteStatusResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    status_from_graphql(response, owner, repository, issue_number)
}

pub(crate) async fn delete_issue_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueDeleteMutation<'_>,
) -> Result<GitHubIssueDeletion, AppError> {
    let status = load_issue_delete_status_with_client(
        client,
        mutation.request.owner,
        mutation.request.repository,
        mutation.request.issue_number,
    )
    .await?;
    ensure_delete_preflight(&status, mutation)?;

    let payload = serde_json::json!({
        "query": DELETE_ISSUE_MUTATION,
        "variables": { "issueId": mutation.request.expected_issue_node_id }
    });
    let response: IssueDeleteMutationResponse = client
        .graphql(&payload)
        .await
        .map_err(|error| post_write_error(github_error(error)))?;
    let repository = response
        .result
        .and_then(|result| result.repository)
        .ok_or_else(|| write_may_have_persisted("GitHub did not return the source repository"))?;
    if repository.id != status.repository_id
        || !repository
            .name_with_owner
            .eq_ignore_ascii_case(&status.repository_full_name)
    {
        return Err(write_may_have_persisted(
            "the mutation response did not match the source repository",
        ));
    }

    confirm_issue_deleted(client, &status)
        .await
        .map_err(post_write_error)?;
    Ok(GitHubIssueDeletion {
        repository_id: status.repository_id,
        repository_full_name: status.repository_full_name,
        issue_node_id: status.issue_node_id,
        number: status.number,
    })
}

fn ensure_delete_preflight(
    status: &GitHubIssueDeleteStatus,
    mutation: IssueDeleteMutation<'_>,
) -> Result<(), AppError> {
    if status.issue_node_id != mutation.request.expected_issue_node_id
        || status.number != mutation.request.issue_number
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the selected Issue identity changed; refresh before trying again".to_string(),
        ));
    }
    if !status.viewer_can_delete {
        return Err(AppError::GitHubPermission(
            "repository admin permission and GitHub Issue deletion policy are required".to_string(),
        ));
    }
    Ok(())
}

async fn confirm_issue_deleted(
    client: &octocrab::Octocrab,
    status: &GitHubIssueDeleteStatus,
) -> Result<(), AppError> {
    let (owner, repository) = status
        .repository_full_name
        .split_once('/')
        .ok_or_else(|| invalid_snapshot("repository full name"))?;
    let payload = serde_json::json!({
        "query": ISSUE_DELETE_POSTFLIGHT_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "issueId": status.issue_node_id,
        }
    });
    let response: octocrab::GraphqlResponse<IssueDeletePostflightData> = client
        .post("/graphql", Some(&payload))
        .await
        .map_err(github_error)?;
    let (data, expected_missing_node) = match response {
        octocrab::GraphqlResponse::Ok(response) => (response.data, true),
        octocrab::GraphqlResponse::Err(response) => {
            let expected =
                !response.errors.is_empty() && response.errors.iter().all(is_missing_node_error);
            if !expected {
                return Err(graphql_errors_error(&response.errors));
            }
            let data = response.data.ok_or_else(|| {
                AppError::GitHub("GitHub did not return deletion postflight data".to_string())
            })?;
            (data, expected)
        }
    };
    let repository = data.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the repository after deletion".to_string())
    })?;
    if repository.id != status.repository_id
        || !repository
            .name_with_owner
            .eq_ignore_ascii_case(&status.repository_full_name)
        || data.node.is_some()
        || !expected_missing_node
    {
        return Err(AppError::GitHub(
            "GitHub did not confirm that the Issue was deleted".to_string(),
        ));
    }
    Ok(())
}

fn is_missing_node_error(error: &octocrab::GraphqlError) -> bool {
    let node_path = matches!(
        error.path.as_deref(),
        Some([octocrab::GraphqlPathSegment::Path(segment)]) if segment == "node"
    );
    node_path
        && error
            .message
            .starts_with("Could not resolve to a node with the global id")
}

fn graphql_errors_error(errors: &[octocrab::GraphqlError]) -> AppError {
    let message = errors
        .iter()
        .map(|error| error.message.as_str())
        .collect::<Vec<_>>()
        .join("; ");
    if is_github_rate_limit_message(&message) {
        AppError::GitHubRateLimited(message)
    } else if is_github_permission_message(&message) {
        AppError::GitHubPermission(message)
    } else {
        AppError::GitHub(message)
    }
}

fn write_may_have_persisted(message: &str) -> AppError {
    AppError::GitHubIssueDeletionConflict(format!(
        "{message}; the Issue deletion may have persisted"
    ))
}

fn post_write_error(error: AppError) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => write_may_have_persisted(&error.to_string()),
    }
}

fn status_from_graphql(
    response: IssueDeleteStatusResponse,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<GitHubIssueDeleteStatus, AppError> {
    let repository_snapshot = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue repository".to_string())
    })?;
    let expected_full_name = format!("{owner}/{repository}");
    if !graphql_node_id_is_valid(&repository_snapshot.id)
        || !repository_snapshot
            .name_with_owner
            .eq_ignore_ascii_case(&expected_full_name)
    {
        return Err(invalid_snapshot("repository identity"));
    }
    let issue = repository_snapshot
        .issue
        .ok_or_else(|| AppError::GitHub("GitHub did not return the selected Issue".to_string()))?;
    let expected_path = format!(
        "/{}/issues/{issue_number}",
        repository_snapshot.name_with_owner
    );
    if !graphql_node_id_is_valid(&issue.id)
        || issue.number != issue_number
        || issue.repository.id != repository_snapshot.id
        || !issue
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&repository_snapshot.name_with_owner)
        || !issue_url_matches(&issue.url, "github.com", &expected_path)
    {
        return Err(invalid_snapshot("Issue identity"));
    }
    Ok(GitHubIssueDeleteStatus {
        repository_id: repository_snapshot.id,
        repository_full_name: repository_snapshot.name_with_owner,
        issue_node_id: issue.id,
        number: issue.number,
        viewer_can_delete: repository_snapshot.viewer_permission.as_deref() == Some("ADMIN")
            && issue.viewer_can_delete,
    })
}

fn invalid_snapshot(part: &str) -> AppError {
    AppError::GitHub(format!("GitHub returned an invalid {part}"))
}

#[derive(Deserialize)]
struct IssueDeleteStatusResponse {
    repository: Option<GraphQlRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlRepository {
    id: String,
    name_with_owner: String,
    viewer_permission: Option<String>,
    issue: Option<GraphQlIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlIssue {
    id: String,
    number: u64,
    url: String,
    viewer_can_delete: bool,
    repository: GraphQlRepositoryIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlRepositoryIdentity {
    id: String,
    name_with_owner: String,
}

#[derive(Deserialize)]
struct IssueDeleteMutationResponse {
    result: Option<IssueDeleteMutationPayload>,
}

#[derive(Deserialize)]
struct IssueDeleteMutationPayload {
    repository: Option<GraphQlRepositoryIdentity>,
}

#[derive(Deserialize)]
struct IssueDeletePostflightData {
    repository: Option<GraphQlRepositoryIdentity>,
    node: Option<GraphQlDeletedNode>,
}

#[derive(Deserialize)]
struct GraphQlDeletedNode {
    #[serde(rename = "__typename")]
    _type_name: String,
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueDeleteClient for super::tests::FakeGitHubClient {
    async fn issue_delete_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueDeleteStatus, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(GitHubIssueDeleteStatus {
            repository_id: "R_1".to_string(),
            repository_full_name: "octocat/hello-world".to_string(),
            issue_node_id: "I_7".to_string(),
            number: 7,
            viewer_can_delete: true,
        })
    }

    async fn delete_issue(
        &self,
        token: &str,
        mutation: IssueDeleteMutation<'_>,
    ) -> Result<GitHubIssueDeletion, AppError> {
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
        Ok(GitHubIssueDeletion {
            repository_id: "R_1".to_string(),
            repository_full_name: "octocat/hello-world".to_string(),
            issue_node_id: "I_7".to_string(),
            number: 7,
        })
    }
}

#[cfg(test)]
mod tests;
