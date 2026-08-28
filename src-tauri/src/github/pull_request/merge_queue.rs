use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::super::{
    authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient,
};
use super::graphql_pull_request_number;

const PULL_REQUEST_MERGE_QUEUE_STATUS_QUERY: &str = r#"
query HarborPullRequestMergeQueueStatus(
  $owner: String!
  $repository: String!
  $pullRequestNumber: Int!
) {
  repository(owner: $owner, name: $repository) {
    viewerPermission
    pullRequest(number: $pullRequestNumber) {
      id
      state
      isDraft
      merged
      headRefOid
      baseRefName
      mergeStateStatus
      isMergeQueueEnabled
      isInMergeQueue
      mergeQueueEntry {
        id
        position
        state
        enqueuedAt
        enqueuer { login }
        estimatedTimeToMerge
        jump
        headCommit { oid }
        mergeQueue { url }
      }
    }
  }
}
"#;

const ENQUEUE_PULL_REQUEST_MUTATION: &str = r#"
mutation HarborEnqueuePullRequest(
  $pullRequestId: ID!
  $expectedHeadOid: GitObjectID!
) {
  enqueuePullRequest(input: {
    pullRequestId: $pullRequestId
    expectedHeadOid: $expectedHeadOid
  }) {
    mergeQueueEntry {
      id
      position
      state
      pullRequest { id headRefOid }
    }
  }
}
"#;

const DEQUEUE_PULL_REQUEST_MUTATION: &str = r#"
mutation HarborDequeuePullRequest($pullRequestId: ID!) {
  dequeuePullRequest(input: { id: $pullRequestId }) {
    mergeQueueEntry {
      id
      pullRequest { id headRefOid }
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestMergeQueueState {
    Available,
    Waiting,
    Queued,
    NotConfigured,
    Draft,
    Closed,
    Merged,
    Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestMergeQueueEntryState {
    AwaitingChecks,
    Locked,
    Mergeable,
    Queued,
    Unmergeable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestMergeQueueEntry {
    pub id: String,
    pub position: u32,
    pub state: GitHubPullRequestMergeQueueEntryState,
    pub enqueued_at: String,
    pub enqueued_by: String,
    pub estimated_time_to_merge_seconds: Option<u32>,
    pub head_sha: Option<String>,
    pub jump: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestMergeQueueStatus {
    pub state: GitHubPullRequestMergeQueueState,
    pub head_sha: String,
    pub base_ref: String,
    pub merge_state_status: Option<String>,
    pub queue_url: Option<String>,
    pub entry: Option<GitHubPullRequestMergeQueueEntry>,
    pub viewer_can_enqueue: bool,
    pub viewer_can_dequeue: bool,
}

#[async_trait]
pub(crate) trait GitHubPullRequestMergeQueueClient: Send + Sync {
    async fn pull_request_merge_queue_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError>;

    async fn enqueue_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError>;

    async fn dequeue_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError>;
}

#[async_trait]
impl GitHubPullRequestMergeQueueClient for OctocrabGitHubClient {
    async fn pull_request_merge_queue_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        let client = authenticated_client(token)?;
        Ok(
            fetch_merge_queue_snapshot(&client, owner, repository, pull_request_number)
                .await?
                .status,
        )
    }

    async fn enqueue_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        let client = authenticated_client(token)?;
        let current =
            fetch_merge_queue_snapshot(&client, owner, repository, pull_request_number).await?;
        if current.status.state == GitHubPullRequestMergeQueueState::Queued {
            return Ok(current.status);
        }
        ensure_pull_request_can_be_enqueued(&current.status, expected_head_sha)?;

        let payload = enqueue_pull_request_payload(&current.node_id, expected_head_sha);
        let response: PullRequestMergeQueueMutation = client
            .graphql(&payload)
            .await
            .map_err(merge_queue_mutation_error)?;
        ensure_enqueued_mutation_response(response, &current.node_id, expected_head_sha)?;

        let updated =
            fetch_merge_queue_snapshot(&client, owner, repository, pull_request_number).await?;
        if updated.status.state != GitHubPullRequestMergeQueueState::Queued
            || updated.status.head_sha != expected_head_sha
        {
            return Err(AppError::GitHubPullRequestMergeQueueConflict(
                "GitHub did not keep the pull request in the merge queue".to_string(),
            ));
        }
        Ok(updated.status)
    }

    async fn dequeue_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        let client = authenticated_client(token)?;
        let current =
            fetch_merge_queue_snapshot(&client, owner, repository, pull_request_number).await?;
        if current.status.state != GitHubPullRequestMergeQueueState::Queued {
            return Ok(current.status);
        }
        if !current.status.viewer_can_dequeue {
            return Err(AppError::GitHubPermission(
                "write access is required to remove this pull request from the merge queue"
                    .to_string(),
            ));
        }

        let payload = dequeue_pull_request_payload(&current.node_id);
        let response: PullRequestMergeQueueMutation = client
            .graphql(&payload)
            .await
            .map_err(merge_queue_mutation_error)?;
        ensure_dequeued_mutation_response(response, &current.node_id)?;

        let updated =
            fetch_merge_queue_snapshot(&client, owner, repository, pull_request_number).await?;
        if updated.status.state == GitHubPullRequestMergeQueueState::Queued {
            return Err(AppError::GitHubPullRequestMergeQueueConflict(
                "GitHub did not remove the pull request from the merge queue".to_string(),
            ));
        }
        Ok(updated.status)
    }
}

impl GitHubService {
    pub async fn pull_request_merge_queue_status(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_merge_queue_status(&token, owner, repository, pull_request_number)
            .await
    }

    pub async fn enqueue_pull_request(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .enqueue_pull_request(
                &token,
                owner,
                repository,
                pull_request_number,
                expected_head_sha,
            )
            .await
    }

    pub async fn dequeue_pull_request(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .dequeue_pull_request(&token, owner, repository, pull_request_number)
            .await
    }
}

struct PullRequestMergeQueueSnapshot {
    node_id: String,
    status: GitHubPullRequestMergeQueueStatus,
}

async fn fetch_merge_queue_snapshot(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<PullRequestMergeQueueSnapshot, AppError> {
    let payload = merge_queue_status_payload(
        owner,
        repository,
        graphql_pull_request_number(pull_request_number)?,
    );
    let response: PullRequestMergeQueueStatusQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    merge_queue_snapshot_from_query(response)
}

fn merge_queue_status_payload(
    owner: &str,
    repository: &str,
    pull_request_number: i32,
) -> serde_json::Value {
    serde_json::json!({
        "query": PULL_REQUEST_MERGE_QUEUE_STATUS_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "pullRequestNumber": pull_request_number,
        }
    })
}

fn enqueue_pull_request_payload(
    pull_request_id: &str,
    expected_head_sha: &str,
) -> serde_json::Value {
    serde_json::json!({
        "query": ENQUEUE_PULL_REQUEST_MUTATION,
        "variables": {
            "pullRequestId": pull_request_id,
            "expectedHeadOid": expected_head_sha,
        }
    })
}

fn dequeue_pull_request_payload(pull_request_id: &str) -> serde_json::Value {
    serde_json::json!({
        "query": DEQUEUE_PULL_REQUEST_MUTATION,
        "variables": { "pullRequestId": pull_request_id }
    })
}

fn merge_queue_snapshot_from_query(
    response: PullRequestMergeQueueStatusQuery,
) -> Result<PullRequestMergeQueueSnapshot, AppError> {
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the merge queue repository state".to_string())
    })?;
    let pull_request = repository.pull_request.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the pull request merge queue state".to_string())
    })?;
    if pull_request.id.trim().is_empty()
        || pull_request.head_ref_oid.trim().is_empty()
        || pull_request.base_ref_name.trim().is_empty()
    {
        return Err(AppError::GitHub(
            "GitHub returned an incomplete pull request merge queue state".to_string(),
        ));
    }

    let viewer_can_write = viewer_can_write(repository.viewer_permission.as_deref());
    let entry = pull_request
        .merge_queue_entry
        .as_ref()
        .map(merge_queue_entry_from_graphql)
        .transpose()?;
    let state = merge_queue_state(&pull_request, viewer_can_write, entry.is_some());
    let queue_url = pull_request
        .merge_queue_entry
        .as_ref()
        .and_then(|entry| entry.merge_queue.as_ref())
        .map(|queue| queue.url.clone());

    Ok(PullRequestMergeQueueSnapshot {
        node_id: pull_request.id,
        status: GitHubPullRequestMergeQueueStatus {
            state,
            head_sha: pull_request.head_ref_oid,
            base_ref: pull_request.base_ref_name,
            merge_state_status: pull_request.merge_state_status,
            queue_url,
            entry,
            viewer_can_enqueue: viewer_can_write
                && state == GitHubPullRequestMergeQueueState::Available,
            viewer_can_dequeue: viewer_can_write
                && state == GitHubPullRequestMergeQueueState::Queued,
        },
    })
}

fn merge_queue_state(
    pull_request: &GraphQlMergeQueuePullRequest,
    viewer_can_write: bool,
    has_entry: bool,
) -> GitHubPullRequestMergeQueueState {
    if pull_request.merged || pull_request.state.eq_ignore_ascii_case("MERGED") {
        return GitHubPullRequestMergeQueueState::Merged;
    }
    if !pull_request.state.eq_ignore_ascii_case("OPEN") {
        return GitHubPullRequestMergeQueueState::Closed;
    }
    if pull_request.is_draft {
        return GitHubPullRequestMergeQueueState::Draft;
    }
    if !pull_request.is_merge_queue_enabled {
        return GitHubPullRequestMergeQueueState::NotConfigured;
    }
    if pull_request.is_in_merge_queue || has_entry {
        return GitHubPullRequestMergeQueueState::Queued;
    }
    if !viewer_can_write {
        return GitHubPullRequestMergeQueueState::Unavailable;
    }
    if pull_request
        .merge_state_status
        .as_deref()
        .is_some_and(merge_queue_requirements_passed)
    {
        return GitHubPullRequestMergeQueueState::Available;
    }
    GitHubPullRequestMergeQueueState::Waiting
}

fn merge_queue_requirements_passed(status: &str) -> bool {
    status.eq_ignore_ascii_case("CLEAN") || status.eq_ignore_ascii_case("HAS_HOOKS")
}

fn viewer_can_write(permission: Option<&str>) -> bool {
    permission.is_some_and(|permission| {
        ["WRITE", "MAINTAIN", "ADMIN"]
            .iter()
            .any(|allowed| permission.eq_ignore_ascii_case(allowed))
    })
}

fn merge_queue_entry_from_graphql(
    entry: &GraphQlMergeQueueEntry,
) -> Result<GitHubPullRequestMergeQueueEntry, AppError> {
    if entry.id.trim().is_empty()
        || entry.enqueued_at.trim().is_empty()
        || entry.enqueuer.login.trim().is_empty()
        || entry.position <= 0
        || entry
            .estimated_time_to_merge
            .is_some_and(|seconds| seconds < 0)
        || entry
            .head_commit
            .as_ref()
            .is_some_and(|commit| commit.oid.trim().is_empty())
    {
        return Err(AppError::GitHub(
            "GitHub returned an incomplete merge queue entry".to_string(),
        ));
    }
    Ok(GitHubPullRequestMergeQueueEntry {
        id: entry.id.clone(),
        position: entry.position as u32,
        state: merge_queue_entry_state_from_graphql(&entry.state)?,
        enqueued_at: entry.enqueued_at.clone(),
        enqueued_by: entry.enqueuer.login.clone(),
        estimated_time_to_merge_seconds: entry
            .estimated_time_to_merge
            .map(|seconds| seconds as u32),
        head_sha: entry.head_commit.as_ref().map(|commit| commit.oid.clone()),
        jump: entry.jump,
    })
}

fn merge_queue_entry_state_from_graphql(
    state: &str,
) -> Result<GitHubPullRequestMergeQueueEntryState, AppError> {
    match state {
        "AWAITING_CHECKS" => Ok(GitHubPullRequestMergeQueueEntryState::AwaitingChecks),
        "LOCKED" => Ok(GitHubPullRequestMergeQueueEntryState::Locked),
        "MERGEABLE" => Ok(GitHubPullRequestMergeQueueEntryState::Mergeable),
        "QUEUED" => Ok(GitHubPullRequestMergeQueueEntryState::Queued),
        "UNMERGEABLE" => Ok(GitHubPullRequestMergeQueueEntryState::Unmergeable),
        _ => Err(AppError::GitHub(format!(
            "GitHub returned an unsupported merge queue entry state: {state}"
        ))),
    }
}

fn ensure_pull_request_can_be_enqueued(
    status: &GitHubPullRequestMergeQueueStatus,
    expected_head_sha: &str,
) -> Result<(), AppError> {
    if status.head_sha != expected_head_sha {
        return Err(AppError::GitHubPullRequestMergeQueueConflict(
            "the pull request head changed before it entered the merge queue".to_string(),
        ));
    }
    match status.state {
        GitHubPullRequestMergeQueueState::Available => Ok(()),
        GitHubPullRequestMergeQueueState::Waiting => {
            Err(AppError::GitHubPullRequestMergeQueueConflict(
                "the pull request has not passed every requirement for the merge queue".to_string(),
            ))
        }
        GitHubPullRequestMergeQueueState::Queued => Ok(()),
        GitHubPullRequestMergeQueueState::NotConfigured => {
            Err(AppError::GitHubPullRequestMergeQueueConflict(
                "the base branch does not use a merge queue".to_string(),
            ))
        }
        GitHubPullRequestMergeQueueState::Draft => {
            Err(AppError::GitHubPullRequestMergeQueueConflict(
                "draft pull requests cannot enter the merge queue".to_string(),
            ))
        }
        GitHubPullRequestMergeQueueState::Closed | GitHubPullRequestMergeQueueState::Merged => {
            Err(AppError::GitHubPullRequestMergeQueueConflict(
                "only open pull requests can enter the merge queue".to_string(),
            ))
        }
        GitHubPullRequestMergeQueueState::Unavailable => Err(AppError::GitHubPermission(
            "write access is required to add this pull request to the merge queue".to_string(),
        )),
    }
}

fn ensure_enqueued_mutation_response(
    response: PullRequestMergeQueueMutation,
    pull_request_id: &str,
    expected_head_sha: &str,
) -> Result<(), AppError> {
    let entry = response
        .enqueue_pull_request
        .and_then(|payload| payload.merge_queue_entry)
        .ok_or_else(|| {
            AppError::GitHubPullRequestMergeQueueConflict(
                "GitHub did not return the new merge queue entry".to_string(),
            )
        })?;
    let pull_request = entry.pull_request.ok_or_else(|| {
        AppError::GitHubPullRequestMergeQueueConflict(
            "GitHub did not return the enqueued pull request".to_string(),
        )
    })?;
    if entry.id.trim().is_empty()
        || entry.position.is_none_or(|position| position <= 0)
        || entry
            .state
            .as_deref()
            .is_none_or(|state| merge_queue_entry_state_from_graphql(state).is_err())
        || pull_request.id != pull_request_id
        || pull_request.head_ref_oid.as_deref() != Some(expected_head_sha)
    {
        return Err(AppError::GitHubPullRequestMergeQueueConflict(
            "GitHub returned a different merge queue entry".to_string(),
        ));
    }
    Ok(())
}

fn ensure_dequeued_mutation_response(
    response: PullRequestMergeQueueMutation,
    pull_request_id: &str,
) -> Result<(), AppError> {
    let entry = response
        .dequeue_pull_request
        .and_then(|payload| payload.merge_queue_entry)
        .ok_or_else(|| {
            AppError::GitHubPullRequestMergeQueueConflict(
                "GitHub did not return the removed merge queue entry".to_string(),
            )
        })?;
    if entry.id.trim().is_empty()
        || entry
            .pull_request
            .as_ref()
            .is_none_or(|pull_request| pull_request.id != pull_request_id)
    {
        return Err(AppError::GitHubPullRequestMergeQueueConflict(
            "GitHub removed a different pull request from the merge queue".to_string(),
        ));
    }
    Ok(())
}

fn merge_queue_mutation_error(error: octocrab::Error) -> AppError {
    match error {
        graphql @ octocrab::Error::Graphql { .. } => match github_error(graphql) {
            AppError::GitHub(message) => AppError::GitHubPullRequestMergeQueueConflict(message),
            mapped => mapped,
        },
        other => github_error(other),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestMergeQueueStatusQuery {
    repository: Option<GraphQlMergeQueueRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlMergeQueueRepository {
    viewer_permission: Option<String>,
    pull_request: Option<GraphQlMergeQueuePullRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlMergeQueuePullRequest {
    id: String,
    state: String,
    is_draft: bool,
    merged: bool,
    head_ref_oid: String,
    base_ref_name: String,
    merge_state_status: Option<String>,
    is_merge_queue_enabled: bool,
    is_in_merge_queue: bool,
    merge_queue_entry: Option<GraphQlMergeQueueEntry>,
}

#[derive(Deserialize)]
struct GraphQlMergeQueue {
    url: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlMergeQueueEntry {
    id: String,
    position: i32,
    state: String,
    enqueued_at: String,
    enqueuer: GraphQlMergeQueueActor,
    estimated_time_to_merge: Option<i32>,
    jump: bool,
    head_commit: Option<GraphQlMergeQueueCommit>,
    merge_queue: Option<GraphQlMergeQueue>,
}

#[derive(Deserialize)]
struct GraphQlMergeQueueActor {
    login: String,
}

#[derive(Deserialize)]
struct GraphQlMergeQueueCommit {
    oid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestMergeQueueMutation {
    #[serde(default)]
    enqueue_pull_request: Option<PullRequestMergeQueueMutationPayload>,
    #[serde(default)]
    dequeue_pull_request: Option<PullRequestMergeQueueMutationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestMergeQueueMutationPayload {
    merge_queue_entry: Option<PullRequestMergeQueueMutationEntry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestMergeQueueMutationEntry {
    id: String,
    #[serde(default)]
    position: Option<i32>,
    #[serde(default)]
    state: Option<String>,
    pull_request: Option<PullRequestMergeQueueMutationPullRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestMergeQueueMutationPullRequest {
    id: String,
    head_ref_oid: Option<String>,
}

#[cfg(test)]
mod tests;
