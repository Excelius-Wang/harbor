use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::super::{
    authenticated_client, github_error, AppError, GitHubPullRequestMergeMethod, GitHubService,
    OctocrabGitHubClient,
};
use super::graphql_pull_request_number;

const PULL_REQUEST_AUTO_MERGE_STATUS_QUERY: &str = r#"
query HarborPullRequestAutoMergeStatus(
  $owner: String!
  $repository: String!
  $pullRequestNumber: Int!
) {
  repository(owner: $owner, name: $repository) {
    autoMergeAllowed
    mergeCommitAllowed
    squashMergeAllowed
    rebaseMergeAllowed
    pullRequest(number: $pullRequestNumber) {
      id
      state
      isDraft
      merged
      headRefOid
      mergeStateStatus
      viewerCanEnableAutoMerge
      viewerCanDisableAutoMerge
      isMergeQueueEnabled
      isInMergeQueue
      mergeQueueEntry { id }
      autoMergeRequest {
        mergeMethod
        enabledAt
        enabledBy { login }
      }
    }
  }
}
"#;

const ENABLE_PULL_REQUEST_AUTO_MERGE_MUTATION: &str = r#"
mutation HarborEnablePullRequestAutoMerge(
  $pullRequestId: ID!
  $mergeMethod: PullRequestMergeMethod!
  $expectedHeadOid: GitObjectID!
) {
  enablePullRequestAutoMerge(input: {
    pullRequestId: $pullRequestId
    mergeMethod: $mergeMethod
    expectedHeadOid: $expectedHeadOid
  }) {
    pullRequest {
      id
      autoMergeRequest {
        mergeMethod
        enabledAt
        enabledBy { login }
      }
    }
  }
}
"#;

const DISABLE_PULL_REQUEST_AUTO_MERGE_MUTATION: &str = r#"
mutation HarborDisablePullRequestAutoMerge($pullRequestId: ID!) {
  disablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) {
    pullRequest {
      id
      autoMergeRequest { mergeMethod }
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestAutoMergeState {
    Enabled,
    Available,
    RepositoryDisabled,
    MergeQueue,
    Draft,
    Closed,
    Merged,
    NotNeeded,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestAutoMergeStatus {
    pub state: GitHubPullRequestAutoMergeState,
    pub head_sha: String,
    pub merge_state_status: Option<String>,
    pub allowed_merge_methods: Vec<GitHubPullRequestMergeMethod>,
    pub merge_method: Option<GitHubPullRequestMergeMethod>,
    pub enabled_at: Option<String>,
    pub enabled_by: Option<String>,
    pub viewer_can_enable: bool,
    pub viewer_can_disable: bool,
}

#[async_trait]
pub(crate) trait GitHubPullRequestAutoMergeClient: Send + Sync {
    async fn pull_request_auto_merge_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError>;

    async fn enable_pull_request_auto_merge(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
        merge_method: GitHubPullRequestMergeMethod,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError>;

    async fn disable_pull_request_auto_merge(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError>;
}

#[async_trait]
impl GitHubPullRequestAutoMergeClient for OctocrabGitHubClient {
    async fn pull_request_auto_merge_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        let client = authenticated_client(token)?;
        Ok(
            fetch_auto_merge_snapshot(&client, owner, repository, pull_request_number)
                .await?
                .status,
        )
    }

    async fn enable_pull_request_auto_merge(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
        merge_method: GitHubPullRequestMergeMethod,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        let client = authenticated_client(token)?;
        let current =
            fetch_auto_merge_snapshot(&client, owner, repository, pull_request_number).await?;
        if current.status.state == GitHubPullRequestAutoMergeState::Enabled
            && current.status.merge_method == Some(merge_method)
        {
            return Ok(current.status);
        }
        ensure_auto_merge_can_be_enabled(&current.status, expected_head_sha, merge_method)?;

        let payload = enable_auto_merge_payload(&current.node_id, expected_head_sha, merge_method);
        let response: PullRequestAutoMergeMutation = client
            .graphql(&payload)
            .await
            .map_err(auto_merge_mutation_error)?;
        ensure_enabled_mutation_response(response, &current.node_id, merge_method)?;

        let updated =
            fetch_auto_merge_snapshot(&client, owner, repository, pull_request_number).await?;
        if updated.status.state != GitHubPullRequestAutoMergeState::Enabled
            || updated.status.merge_method != Some(merge_method)
        {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "GitHub did not persist the requested auto-merge configuration".to_string(),
            ));
        }
        Ok(updated.status)
    }

    async fn disable_pull_request_auto_merge(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        let client = authenticated_client(token)?;
        let current =
            fetch_auto_merge_snapshot(&client, owner, repository, pull_request_number).await?;
        if current.status.state == GitHubPullRequestAutoMergeState::MergeQueue {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "the pull request uses a merge queue, which must be managed separately".to_string(),
            ));
        }
        if current.status.state != GitHubPullRequestAutoMergeState::Enabled {
            return Ok(current.status);
        }
        if !current.status.viewer_can_disable {
            return Err(AppError::GitHubPermission(
                "the signed-in account cannot disable auto-merge for this pull request".to_string(),
            ));
        }

        let payload = disable_auto_merge_payload(&current.node_id);
        let response: PullRequestAutoMergeMutation = client
            .graphql(&payload)
            .await
            .map_err(auto_merge_mutation_error)?;
        ensure_disabled_mutation_response(response, &current.node_id)?;

        let updated =
            fetch_auto_merge_snapshot(&client, owner, repository, pull_request_number).await?;
        if updated.status.state == GitHubPullRequestAutoMergeState::Enabled {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "GitHub did not remove the pull request auto-merge request".to_string(),
            ));
        }
        Ok(updated.status)
    }
}

impl GitHubService {
    pub async fn pull_request_auto_merge_status(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_auto_merge_status(&token, owner, repository, pull_request_number)
            .await
    }

    pub async fn enable_pull_request_auto_merge(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
        merge_method: GitHubPullRequestMergeMethod,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .enable_pull_request_auto_merge(
                &token,
                owner,
                repository,
                pull_request_number,
                expected_head_sha,
                merge_method,
            )
            .await
    }

    pub async fn disable_pull_request_auto_merge(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .disable_pull_request_auto_merge(&token, owner, repository, pull_request_number)
            .await
    }
}

struct PullRequestAutoMergeSnapshot {
    node_id: String,
    status: GitHubPullRequestAutoMergeStatus,
}

async fn fetch_auto_merge_snapshot(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<PullRequestAutoMergeSnapshot, AppError> {
    let payload = auto_merge_status_payload(
        owner,
        repository,
        graphql_pull_request_number(pull_request_number)?,
    );
    let response: PullRequestAutoMergeStatusQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    auto_merge_snapshot_from_query(response)
}

fn auto_merge_status_payload(
    owner: &str,
    repository: &str,
    pull_request_number: i32,
) -> serde_json::Value {
    serde_json::json!({
        "query": PULL_REQUEST_AUTO_MERGE_STATUS_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "pullRequestNumber": pull_request_number,
        }
    })
}

fn enable_auto_merge_payload(
    pull_request_id: &str,
    expected_head_sha: &str,
    merge_method: GitHubPullRequestMergeMethod,
) -> serde_json::Value {
    serde_json::json!({
        "query": ENABLE_PULL_REQUEST_AUTO_MERGE_MUTATION,
        "variables": {
            "pullRequestId": pull_request_id,
            "mergeMethod": merge_method_graphql_name(merge_method),
            "expectedHeadOid": expected_head_sha,
        }
    })
}

fn disable_auto_merge_payload(pull_request_id: &str) -> serde_json::Value {
    serde_json::json!({
        "query": DISABLE_PULL_REQUEST_AUTO_MERGE_MUTATION,
        "variables": { "pullRequestId": pull_request_id }
    })
}

fn auto_merge_snapshot_from_query(
    response: PullRequestAutoMergeStatusQuery,
) -> Result<PullRequestAutoMergeSnapshot, AppError> {
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the auto-merge repository state".to_string())
    })?;
    let allowed_merge_methods = allowed_merge_methods(&repository);
    let repository_auto_merge_allowed = repository.auto_merge_allowed;
    let pull_request = repository.pull_request.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the pull request auto-merge state".to_string())
    })?;
    if pull_request.id.trim().is_empty() || pull_request.head_ref_oid.trim().is_empty() {
        return Err(AppError::GitHub(
            "GitHub returned an incomplete pull request auto-merge state".to_string(),
        ));
    }

    let merge_method = pull_request
        .auto_merge_request
        .as_ref()
        .map(|request| merge_method_from_graphql(&request.merge_method))
        .transpose()?;
    let state = auto_merge_state(repository_auto_merge_allowed, &pull_request);
    let enabled_at = pull_request
        .auto_merge_request
        .as_ref()
        .and_then(|request| request.enabled_at.clone());
    let enabled_by = pull_request
        .auto_merge_request
        .as_ref()
        .and_then(|request| request.enabled_by.as_ref())
        .map(|actor| actor.login.clone());

    Ok(PullRequestAutoMergeSnapshot {
        node_id: pull_request.id,
        status: GitHubPullRequestAutoMergeStatus {
            state,
            head_sha: pull_request.head_ref_oid,
            merge_state_status: pull_request.merge_state_status,
            allowed_merge_methods,
            merge_method,
            enabled_at,
            enabled_by,
            viewer_can_enable: pull_request.viewer_can_enable_auto_merge,
            viewer_can_disable: pull_request.viewer_can_disable_auto_merge,
        },
    })
}

fn auto_merge_state(
    repository_auto_merge_allowed: bool,
    pull_request: &GraphQlAutoMergePullRequest,
) -> GitHubPullRequestAutoMergeState {
    if pull_request.merged || pull_request.state.eq_ignore_ascii_case("MERGED") {
        return GitHubPullRequestAutoMergeState::Merged;
    }
    if !pull_request.state.eq_ignore_ascii_case("OPEN") {
        return GitHubPullRequestAutoMergeState::Closed;
    }
    if pull_request.is_draft {
        return GitHubPullRequestAutoMergeState::Draft;
    }
    if pull_request.is_merge_queue_enabled
        || pull_request.is_in_merge_queue
        || pull_request.merge_queue_entry.is_some()
    {
        return GitHubPullRequestAutoMergeState::MergeQueue;
    }
    if pull_request.auto_merge_request.is_some() {
        return GitHubPullRequestAutoMergeState::Enabled;
    }
    if pull_request
        .merge_state_status
        .as_deref()
        .is_some_and(|status| status.eq_ignore_ascii_case("CLEAN"))
    {
        return GitHubPullRequestAutoMergeState::NotNeeded;
    }
    if !repository_auto_merge_allowed {
        return GitHubPullRequestAutoMergeState::RepositoryDisabled;
    }
    if pull_request.viewer_can_enable_auto_merge {
        return GitHubPullRequestAutoMergeState::Available;
    }
    GitHubPullRequestAutoMergeState::Unavailable
}

fn allowed_merge_methods(
    repository: &GraphQlAutoMergeRepository,
) -> Vec<GitHubPullRequestMergeMethod> {
    let mut methods = Vec::with_capacity(3);
    if repository.merge_commit_allowed {
        methods.push(GitHubPullRequestMergeMethod::Merge);
    }
    if repository.squash_merge_allowed {
        methods.push(GitHubPullRequestMergeMethod::Squash);
    }
    if repository.rebase_merge_allowed {
        methods.push(GitHubPullRequestMergeMethod::Rebase);
    }
    methods
}

fn ensure_auto_merge_can_be_enabled(
    status: &GitHubPullRequestAutoMergeStatus,
    expected_head_sha: &str,
    merge_method: GitHubPullRequestMergeMethod,
) -> Result<(), AppError> {
    if status.head_sha != expected_head_sha {
        return Err(AppError::GitHubPullRequestAutoMergeConflict(
            "the pull request head changed before auto-merge was enabled".to_string(),
        ));
    }
    match status.state {
        GitHubPullRequestAutoMergeState::Available => {}
        GitHubPullRequestAutoMergeState::Enabled => {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "auto-merge is already enabled with a different merge method".to_string(),
            ));
        }
        GitHubPullRequestAutoMergeState::RepositoryDisabled => {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "auto-merge is disabled for this repository".to_string(),
            ));
        }
        GitHubPullRequestAutoMergeState::MergeQueue => {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "the base branch uses a merge queue, which must be managed separately".to_string(),
            ));
        }
        GitHubPullRequestAutoMergeState::Draft => {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "draft pull requests cannot enable auto-merge".to_string(),
            ));
        }
        GitHubPullRequestAutoMergeState::Closed | GitHubPullRequestAutoMergeState::Merged => {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "only open pull requests can enable auto-merge".to_string(),
            ));
        }
        GitHubPullRequestAutoMergeState::NotNeeded => {
            return Err(AppError::GitHubPullRequestAutoMergeConflict(
                "the pull request is already ready for a direct merge".to_string(),
            ));
        }
        GitHubPullRequestAutoMergeState::Unavailable => {
            return Err(AppError::GitHubPermission(
                "auto-merge is unavailable for the signed-in account or current branch policy"
                    .to_string(),
            ));
        }
    }
    if !status.viewer_can_enable {
        return Err(AppError::GitHubPermission(
            "the signed-in account cannot enable auto-merge for this pull request".to_string(),
        ));
    }
    if !status.allowed_merge_methods.contains(&merge_method) {
        return Err(AppError::GitHubPullRequestAutoMergeConflict(
            "the selected merge method is no longer enabled for this repository".to_string(),
        ));
    }
    Ok(())
}

fn ensure_enabled_mutation_response(
    response: PullRequestAutoMergeMutation,
    pull_request_id: &str,
    merge_method: GitHubPullRequestMergeMethod,
) -> Result<(), AppError> {
    let pull_request = response
        .enable_pull_request_auto_merge
        .and_then(|payload| payload.pull_request)
        .ok_or_else(|| {
            AppError::GitHubPullRequestAutoMergeConflict(
                "GitHub did not return the enabled auto-merge request".to_string(),
            )
        })?;
    let request = pull_request.auto_merge_request.ok_or_else(|| {
        AppError::GitHubPullRequestAutoMergeConflict(
            "GitHub did not enable auto-merge for the pull request".to_string(),
        )
    })?;
    if pull_request.id != pull_request_id
        || merge_method_from_graphql(&request.merge_method)? != merge_method
    {
        return Err(AppError::GitHubPullRequestAutoMergeConflict(
            "GitHub returned a different auto-merge configuration".to_string(),
        ));
    }
    Ok(())
}

fn ensure_disabled_mutation_response(
    response: PullRequestAutoMergeMutation,
    pull_request_id: &str,
) -> Result<(), AppError> {
    let pull_request = response
        .disable_pull_request_auto_merge
        .and_then(|payload| payload.pull_request)
        .ok_or_else(|| {
            AppError::GitHubPullRequestAutoMergeConflict(
                "GitHub did not return the disabled auto-merge state".to_string(),
            )
        })?;
    if pull_request.id != pull_request_id || pull_request.auto_merge_request.is_some() {
        return Err(AppError::GitHubPullRequestAutoMergeConflict(
            "GitHub did not disable auto-merge for the pull request".to_string(),
        ));
    }
    Ok(())
}

fn merge_method_graphql_name(method: GitHubPullRequestMergeMethod) -> &'static str {
    match method {
        GitHubPullRequestMergeMethod::Merge => "MERGE",
        GitHubPullRequestMergeMethod::Squash => "SQUASH",
        GitHubPullRequestMergeMethod::Rebase => "REBASE",
    }
}

fn merge_method_from_graphql(method: &str) -> Result<GitHubPullRequestMergeMethod, AppError> {
    match method {
        "MERGE" => Ok(GitHubPullRequestMergeMethod::Merge),
        "SQUASH" => Ok(GitHubPullRequestMergeMethod::Squash),
        "REBASE" => Ok(GitHubPullRequestMergeMethod::Rebase),
        _ => Err(AppError::GitHub(format!(
            "GitHub returned an unsupported pull request merge method: {method}"
        ))),
    }
}

fn auto_merge_mutation_error(error: octocrab::Error) -> AppError {
    match error {
        graphql @ octocrab::Error::Graphql { .. } => match github_error(graphql) {
            AppError::GitHub(message) => AppError::GitHubPullRequestAutoMergeConflict(message),
            mapped => mapped,
        },
        other => github_error(other),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestAutoMergeStatusQuery {
    repository: Option<GraphQlAutoMergeRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlAutoMergeRepository {
    auto_merge_allowed: bool,
    merge_commit_allowed: bool,
    squash_merge_allowed: bool,
    rebase_merge_allowed: bool,
    pull_request: Option<GraphQlAutoMergePullRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlAutoMergePullRequest {
    id: String,
    state: String,
    is_draft: bool,
    merged: bool,
    head_ref_oid: String,
    merge_state_status: Option<String>,
    viewer_can_enable_auto_merge: bool,
    viewer_can_disable_auto_merge: bool,
    is_merge_queue_enabled: bool,
    is_in_merge_queue: bool,
    merge_queue_entry: Option<GraphQlNode>,
    auto_merge_request: Option<GraphQlAutoMergeRequest>,
}

#[derive(Deserialize)]
struct GraphQlNode {
    #[allow(dead_code)]
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlAutoMergeRequest {
    merge_method: String,
    #[serde(default)]
    enabled_at: Option<String>,
    #[serde(default)]
    enabled_by: Option<GraphQlActor>,
}

#[derive(Deserialize)]
struct GraphQlActor {
    login: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestAutoMergeMutation {
    #[serde(default)]
    enable_pull_request_auto_merge: Option<PullRequestAutoMergeMutationPayload>,
    #[serde(default)]
    disable_pull_request_auto_merge: Option<PullRequestAutoMergeMutationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestAutoMergeMutationPayload {
    pull_request: Option<PullRequestAutoMergeMutationPullRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestAutoMergeMutationPullRequest {
    id: String,
    #[serde(default)]
    auto_merge_request: Option<GraphQlAutoMergeRequest>,
}

#[cfg(test)]
mod tests;
