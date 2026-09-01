use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue_related::{graphql_node_id_is_valid, issue_url_matches, IssueGraphQlRequest},
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_TRANSFER_STATUS_QUERY: &str = r#"
query HarborIssueTransferStatus(
  $sourceOwner: String!
  $sourceRepository: String!
  $sourceNumber: Int!
  $targetOwner: String!
  $targetRepository: String!
) {
  source: repository(owner: $sourceOwner, name: $sourceRepository) {
    id
    nameWithOwner
    url
    isPrivate
    viewerPermission
    owner { id }
    sourceIssue: issue(number: $sourceNumber) {
      id
      number
      url
      state
      viewerCanUpdate
      repository { id nameWithOwner }
    }
  }
  target: repository(owner: $targetOwner, name: $targetRepository) {
    id
    nameWithOwner
    url
    isPrivate
    viewerPermission
    owner { id }
    defaultBranchRef { name }
  }
}
"#;

const ISSUE_TRANSFER_MUTATION: &str = r#"
mutation HarborTransferIssue($issueId: ID!, $repositoryId: ID!) {
  result: transferIssue(input: {
    issueId: $issueId
    repositoryId: $repositoryId
    createLabelsIfMissing: false
  }) {
    issue {
      id
      number
      url
      state
      repository { id nameWithOwner url }
    }
  }
}
"#;

const ISSUE_TRANSFER_POSTFLIGHT_QUERY: &str = r#"
query HarborIssueTransferPostflight(
  $issueId: ID!
  $targetOwner: String!
  $targetRepository: String!
  $targetNumber: Int!
) {
  node(id: $issueId) {
    __typename
    ... on Issue {
      id
      number
      url
      repository { id nameWithOwner }
    }
  }
  target: repository(owner: $targetOwner, name: $targetRepository) {
    id
    nameWithOwner
    issue(number: $targetNumber) {
      id
      number
      url
      repository { id nameWithOwner }
    }
  }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTransferStatus {
    pub source_repository_id: String,
    pub source_repository_full_name: String,
    pub source_issue_node_id: String,
    pub source_issue_number: u64,
    pub source_issue_open: bool,
    pub source_private: bool,
    pub source_viewer_can_transfer: bool,
    pub target_repository_id: String,
    pub target_repository_full_name: String,
    pub target_repository_url: String,
    pub target_default_branch: String,
    pub target_private: bool,
    pub target_viewer_can_transfer: bool,
    pub same_owner: bool,
    pub private_compatible: bool,
    pub viewer_can_transfer: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTransfer {
    pub source_repository_id: String,
    pub source_repository_full_name: String,
    pub source_issue_node_id: String,
    pub source_issue_number: u64,
    pub target_repository_id: String,
    pub target_repository_full_name: String,
    pub target_repository_url: String,
    pub target_default_branch: String,
    pub target_issue_node_id: String,
    pub target_issue_number: u64,
    pub target_issue_url: String,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueTransferMutation<'a> {
    request: IssueGraphQlRequest<'a>,
    target_owner: &'a str,
    target_repository: &'a str,
}

impl<'a> IssueTransferMutation<'a> {
    pub(crate) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        target_owner: &'a str,
        target_repository: &'a str,
        expected_issue_node_id: &'a str,
    ) -> Result<Self, AppError> {
        if target_owner.trim().is_empty() || target_repository.trim().is_empty() {
            return Err(AppError::Validation(
                "the target repository is required".to_string(),
            ));
        }
        Ok(Self {
            request: IssueGraphQlRequest::new(
                owner,
                repository,
                issue_number,
                expected_issue_node_id,
            )?,
            target_owner,
            target_repository,
        })
    }
}

#[async_trait]
pub(crate) trait GitHubIssueTransferClient: Send + Sync {
    async fn issue_transfer_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        target_owner: &str,
        target_repository: &str,
    ) -> Result<GitHubIssueTransferStatus, AppError>;

    async fn transfer_issue(
        &self,
        token: &str,
        mutation: IssueTransferMutation<'_>,
    ) -> Result<GitHubIssueTransfer, AppError>;
}

impl GitHubService {
    pub async fn issue_transfer_status(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        target_owner: &str,
        target_repository: &str,
    ) -> Result<GitHubIssueTransferStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .issue_transfer_status(
                &token,
                owner,
                repository,
                issue_number,
                target_owner,
                target_repository,
            )
            .await
    }

    pub async fn transfer_issue(
        &self,
        mutation: IssueTransferMutation<'_>,
    ) -> Result<GitHubIssueTransfer, AppError> {
        let token = self.load_access_token().await?;
        self.client.transfer_issue(&token, mutation).await
    }
}

#[async_trait]
impl GitHubIssueTransferClient for OctocrabGitHubClient {
    async fn issue_transfer_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        target_owner: &str,
        target_repository: &str,
    ) -> Result<GitHubIssueTransferStatus, AppError> {
        let client = authenticated_client(token)?;
        load_issue_transfer_status_with_client(
            &client,
            owner,
            repository,
            issue_number,
            target_owner,
            target_repository,
        )
        .await
    }

    async fn transfer_issue(
        &self,
        token: &str,
        mutation: IssueTransferMutation<'_>,
    ) -> Result<GitHubIssueTransfer, AppError> {
        let client = issue_transfer_client(token)?;
        transfer_issue_with_client(&client, mutation).await
    }
}

fn issue_transfer_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

pub(crate) async fn load_issue_transfer_status_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
    target_owner: &str,
    target_repository: &str,
) -> Result<GitHubIssueTransferStatus, AppError> {
    let source_number = graphql_issue_number(issue_number)?;
    let payload = serde_json::json!({
        "query": ISSUE_TRANSFER_STATUS_QUERY,
        "variables": {
            "sourceOwner": owner,
            "sourceRepository": repository,
            "sourceNumber": source_number,
            "targetOwner": target_owner,
            "targetRepository": target_repository,
        }
    });
    let response: IssueTransferStatusResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    status_from_graphql(
        response,
        owner,
        repository,
        issue_number,
        target_owner,
        target_repository,
    )
}

pub(crate) async fn transfer_issue_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueTransferMutation<'_>,
) -> Result<GitHubIssueTransfer, AppError> {
    let status = load_issue_transfer_status_with_client(
        client,
        mutation.request.owner,
        mutation.request.repository,
        mutation.request.issue_number,
        mutation.target_owner,
        mutation.target_repository,
    )
    .await?;
    ensure_transfer_preflight(&status, mutation)?;

    let payload = serde_json::json!({
        "query": ISSUE_TRANSFER_MUTATION,
        "variables": {
            "issueId": mutation.request.expected_issue_node_id,
            "repositoryId": status.target_repository_id,
        }
    });
    let response: IssueTransferMutationResponse = client
        .graphql(&payload)
        .await
        .map_err(|error| post_write_error(github_error(error)))?;
    let issue = response
        .result
        .and_then(|result| result.issue)
        .ok_or_else(|| write_may_have_persisted("GitHub did not return the transferred Issue"))?;
    ensure_transfer_response(&issue, &status, mutation)?;

    let transfer = GitHubIssueTransfer {
        source_repository_id: status.source_repository_id.clone(),
        source_repository_full_name: status.source_repository_full_name.clone(),
        source_issue_node_id: status.source_issue_node_id.clone(),
        source_issue_number: status.source_issue_number,
        target_repository_id: status.target_repository_id.clone(),
        target_repository_full_name: status.target_repository_full_name.clone(),
        target_repository_url: status.target_repository_url.clone(),
        target_default_branch: status.target_default_branch.clone(),
        target_issue_node_id: issue.id.clone(),
        target_issue_number: issue.number,
        target_issue_url: issue.url.clone(),
    };
    confirm_issue_transferred(
        client,
        &transfer,
        mutation.target_owner,
        mutation.target_repository,
    )
    .await
    .map_err(post_write_error)?;
    Ok(transfer)
}

fn ensure_transfer_preflight(
    status: &GitHubIssueTransferStatus,
    mutation: IssueTransferMutation<'_>,
) -> Result<(), AppError> {
    if status.source_issue_node_id != mutation.request.expected_issue_node_id
        || status.source_issue_number != mutation.request.issue_number
        || !status
            .source_repository_full_name
            .eq_ignore_ascii_case(&format!(
                "{}/{}",
                mutation.request.owner, mutation.request.repository
            ))
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the selected Issue identity changed; refresh before trying again".to_string(),
        ));
    }
    if !status.source_issue_open || !status.same_owner || !status.private_compatible {
        return Err(AppError::GitHubIssueStateConflict(
            "GitHub only transfers open Issues within the same owner, and private Issues cannot move to a public repository".to_string(),
        ));
    }
    if !status.source_viewer_can_transfer || !status.target_viewer_can_transfer {
        return Err(AppError::GitHubPermission(
            "write access to both the source and target repositories is required to transfer an Issue".to_string(),
        ));
    }
    if !status.viewer_can_transfer {
        return Err(AppError::GitHubIssueStateConflict(
            "the selected Issue cannot be transferred to that repository".to_string(),
        ));
    }
    Ok(())
}

fn ensure_transfer_response(
    issue: &TransferIssue,
    status: &GitHubIssueTransferStatus,
    mutation: IssueTransferMutation<'_>,
) -> Result<(), AppError> {
    let expected_target = format!("{}/{}", mutation.target_owner, mutation.target_repository);
    if !graphql_node_id_is_valid(&issue.id)
        || issue.number == 0
        || issue.state != "OPEN"
        || issue.repository.id != status.target_repository_id
        || !issue
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&status.target_repository_full_name)
        || !issue_url_matches(
            &issue.url,
            "github.com",
            &format!("/{expected_target}/issues/{}", issue.number),
        )
        || !issue
            .repository
            .url
            .as_deref()
            .is_none_or(|url| repository_url_matches(url, &status.target_repository_full_name))
    {
        return Err(write_may_have_persisted(
            "the mutation response did not match the target Issue",
        ));
    }
    Ok(())
}

async fn confirm_issue_transferred(
    client: &octocrab::Octocrab,
    transfer: &GitHubIssueTransfer,
    target_owner: &str,
    target_repository: &str,
) -> Result<(), AppError> {
    let target_number = graphql_issue_number(transfer.target_issue_number)?;
    let payload = serde_json::json!({
        "query": ISSUE_TRANSFER_POSTFLIGHT_QUERY,
        "variables": {
            "issueId": transfer.target_issue_node_id,
            "targetOwner": target_owner,
            "targetRepository": target_repository,
            "targetNumber": target_number,
        }
    });
    let response: IssueTransferPostflightResponse = client
        .graphql(&payload)
        .await
        .map_err(|error| post_write_error(github_error(error)))?;
    let node = match response.node {
        Some(TransferPostflightNode::Issue(issue)) => issue,
        Some(TransferPostflightNode::Other) | None => {
            return Err(write_may_have_persisted(
                "the transferred Issue could not be resolved after the write",
            ));
        }
    };
    let target_repository = response.target.ok_or_else(|| {
        write_may_have_persisted("the target repository could not be resolved after the write")
    })?;
    let target = target_repository.issue.ok_or_else(|| {
        write_may_have_persisted("the target Issue could not be resolved after the write")
    })?;
    if node.id != transfer.target_issue_node_id
        || node.number != transfer.target_issue_number
        || target.id != transfer.target_issue_node_id
        || target.number != transfer.target_issue_number
        || node.repository.id != transfer.target_repository_id
        || target.repository.id != transfer.target_repository_id
        || target_repository.id != transfer.target_repository_id
        || !target_repository
            .name_with_owner
            .eq_ignore_ascii_case(&transfer.target_repository_full_name)
        || !node
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&transfer.target_repository_full_name)
        || !target
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&transfer.target_repository_full_name)
        || !issue_url_matches(
            &node.url,
            "github.com",
            &format!(
                "/{}/issues/{}",
                transfer.target_repository_full_name, transfer.target_issue_number
            ),
        )
        || !issue_url_matches(
            &target.url,
            "github.com",
            &format!(
                "/{}/issues/{}",
                transfer.target_repository_full_name, transfer.target_issue_number
            ),
        )
    {
        return Err(write_may_have_persisted(
            "the postflight did not match the transferred Issue",
        ));
    }
    Ok(())
}

fn status_from_graphql(
    response: IssueTransferStatusResponse,
    owner: &str,
    repository: &str,
    issue_number: u64,
    target_owner: &str,
    target_repository: &str,
) -> Result<GitHubIssueTransferStatus, AppError> {
    let source = response.source.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the source repository".to_string())
    })?;
    let target = response.target.ok_or_else(|| {
        AppError::GitHubIssueStateConflict("the target repository is unavailable".to_string())
    })?;
    let expected_source = format!("{owner}/{repository}");
    let expected_target = format!("{target_owner}/{target_repository}");
    if !valid_repository_snapshot(&source, &expected_source)
        || !valid_repository_snapshot(&target, &expected_target)
    {
        return Err(AppError::GitHubIssueStateConflict(
            "GitHub returned a different source or target repository".to_string(),
        ));
    }
    let issue = source
        .source_issue
        .ok_or_else(|| AppError::GitHub("GitHub did not return the selected Issue".to_string()))?;
    if !graphql_node_id_is_valid(&issue.id)
        || issue.number != issue_number
        || issue.repository.id != source.id
        || !issue
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&source.name_with_owner)
        || !issue_url_matches(
            &issue.url,
            "github.com",
            &format!("/{}/issues/{issue_number}", source.name_with_owner),
        )
    {
        return Err(AppError::GitHubIssueStateConflict(
            "GitHub returned a different source Issue".to_string(),
        ));
    }
    let source_owner = source
        .owner
        .ok_or_else(|| invalid_snapshot("source owner"))?;
    let target_owner_id = target
        .owner
        .ok_or_else(|| invalid_snapshot("target owner"))?;
    let same_owner = source_owner.id == target_owner_id.id;
    let source_viewer_can_transfer =
        has_write_permission(source.viewer_permission.as_deref()) && issue.viewer_can_update;
    let target_viewer_can_transfer = has_write_permission(target.viewer_permission.as_deref());
    let private_compatible = !source.is_private || target.is_private;
    let same_repository = source.id == target.id;
    let source_issue_open = issue.state == "OPEN";
    let target_default_branch = target
        .default_branch_ref
        .and_then(|branch| {
            let name = branch.name.trim().to_string();
            (!name.is_empty() && name.len() <= 255 && !name.chars().any(char::is_control))
                .then_some(name)
        })
        .unwrap_or_else(|| "HEAD".to_string());
    let viewer_can_transfer = source_issue_open
        && source_viewer_can_transfer
        && target_viewer_can_transfer
        && same_owner
        && private_compatible
        && !same_repository;
    Ok(GitHubIssueTransferStatus {
        source_repository_id: source.id,
        source_repository_full_name: source.name_with_owner,
        source_issue_node_id: issue.id,
        source_issue_number: issue.number,
        source_issue_open,
        source_private: source.is_private,
        source_viewer_can_transfer,
        target_repository_id: target.id,
        target_repository_full_name: target.name_with_owner,
        target_repository_url: target.url,
        target_default_branch,
        target_private: target.is_private,
        target_viewer_can_transfer,
        same_owner,
        private_compatible,
        viewer_can_transfer,
    })
}

fn valid_repository_snapshot(snapshot: &TransferRepositorySnapshot, expected: &str) -> bool {
    graphql_node_id_is_valid(&snapshot.id)
        && snapshot.name_with_owner.eq_ignore_ascii_case(expected)
        && repository_url_matches(&snapshot.url, &snapshot.name_with_owner)
}

fn repository_url_matches(value: &str, full_name: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("github.com"))
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.path().eq_ignore_ascii_case(&format!("/{full_name}"))
        && url.query().is_none()
        && url.fragment().is_none()
}

fn has_write_permission(permission: Option<&str>) -> bool {
    matches!(permission, Some("WRITE" | "MAINTAIN" | "ADMIN"))
}

fn graphql_issue_number(number: u64) -> Result<i32, AppError> {
    i32::try_from(number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })
}

fn invalid_snapshot(part: &str) -> AppError {
    AppError::GitHub(format!("GitHub returned an invalid {part}"))
}

fn write_may_have_persisted(message: &str) -> AppError {
    AppError::GitHubIssueTransferConflict(format!(
        "{message}; the Issue transfer may have persisted"
    ))
}

fn post_write_error(error: AppError) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => write_may_have_persisted(&error.to_string()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueTransferStatusResponse {
    source: Option<TransferRepositorySnapshot>,
    target: Option<TransferRepositorySnapshot>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferRepositorySnapshot {
    id: String,
    name_with_owner: String,
    url: String,
    is_private: bool,
    viewer_permission: Option<String>,
    owner: Option<TransferOwner>,
    default_branch_ref: Option<TransferDefaultBranch>,
    source_issue: Option<TransferSourceIssue>,
}

#[derive(Deserialize)]
struct TransferOwner {
    id: String,
}

#[derive(Deserialize)]
struct TransferDefaultBranch {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferSourceIssue {
    id: String,
    number: u64,
    url: String,
    state: String,
    viewer_can_update: bool,
    repository: TransferRepositoryIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferIssue {
    id: String,
    number: u64,
    url: String,
    state: String,
    repository: TransferIssueRepository,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferIssueRepository {
    id: String,
    name_with_owner: String,
    url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferRepositoryIdentity {
    id: String,
    name_with_owner: String,
}

#[derive(Deserialize)]
struct IssueTransferMutationResponse {
    result: Option<IssueTransferMutationPayload>,
}

#[derive(Deserialize)]
struct IssueTransferMutationPayload {
    issue: Option<TransferIssue>,
}

#[derive(Deserialize)]
struct IssueTransferPostflightResponse {
    node: Option<TransferPostflightNode>,
    target: Option<TransferPostflightRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferPostflightRepository {
    id: String,
    name_with_owner: String,
    issue: Option<TransferPostflightIssue>,
}

#[derive(Deserialize)]
#[serde(tag = "__typename")]
enum TransferPostflightNode {
    Issue(TransferPostflightIssue),
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferPostflightIssue {
    id: String,
    number: u64,
    url: String,
    repository: TransferRepositoryIdentity,
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueTransferClient for super::tests::FakeGitHubClient {
    async fn issue_transfer_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        target_owner: &str,
        target_repository: &str,
    ) -> Result<GitHubIssueTransferStatus, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                owner,
                repository,
                issue_number,
                target_owner,
                target_repository
            ),
            ("octocat", "hello-world", 7, "octocat", "destination")
        );
        Ok(GitHubIssueTransferStatus {
            source_repository_id: "R_1".to_string(),
            source_repository_full_name: "octocat/hello-world".to_string(),
            source_issue_node_id: "I_7".to_string(),
            source_issue_number: 7,
            source_issue_open: true,
            source_private: false,
            source_viewer_can_transfer: true,
            target_repository_id: "R_2".to_string(),
            target_repository_full_name: "octocat/destination".to_string(),
            target_repository_url: "https://github.com/octocat/destination".to_string(),
            target_default_branch: "main".to_string(),
            target_private: false,
            target_viewer_can_transfer: true,
            same_owner: true,
            private_compatible: true,
            viewer_can_transfer: true,
        })
    }

    async fn transfer_issue(
        &self,
        token: &str,
        mutation: IssueTransferMutation<'_>,
    ) -> Result<GitHubIssueTransfer, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                mutation.request.owner,
                mutation.request.repository,
                mutation.request.issue_number,
                mutation.target_owner,
                mutation.target_repository,
                mutation.request.expected_issue_node_id,
            ),
            ("octocat", "hello-world", 7, "octocat", "destination", "I_7")
        );
        Ok(GitHubIssueTransfer {
            source_repository_id: "R_1".to_string(),
            source_repository_full_name: "octocat/hello-world".to_string(),
            source_issue_node_id: "I_7".to_string(),
            source_issue_number: 7,
            target_repository_id: "R_2".to_string(),
            target_repository_full_name: "octocat/destination".to_string(),
            target_repository_url: "https://github.com/octocat/destination".to_string(),
            target_default_branch: "main".to_string(),
            target_issue_node_id: "I_7".to_string(),
            target_issue_number: 11,
            target_issue_url: "https://github.com/octocat/destination/issues/11".to_string(),
        })
    }
}

#[cfg(test)]
mod tests;
