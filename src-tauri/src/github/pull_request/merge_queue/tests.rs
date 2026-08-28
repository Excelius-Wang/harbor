use super::*;

#[async_trait]
impl GitHubPullRequestMergeQueueClient for super::super::super::tests::FakeGitHubClient {
    async fn pull_request_merge_queue_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        use super::super::super::GitHubClient;

        let pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        Ok(GitHubPullRequestMergeQueueStatus {
            state: GitHubPullRequestMergeQueueState::Available,
            head_sha: pull_request.head_sha,
            base_ref: pull_request.base_ref,
            merge_state_status: pull_request.mergeable_state,
            queue_url: Some(format!(
                "https://github.com/{owner}/{repository}/queue/main"
            )),
            entry: None,
            viewer_can_enqueue: true,
            viewer_can_dequeue: false,
        })
    }

    async fn enqueue_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        let mut status = self
            .pull_request_merge_queue_status(token, owner, repository, pull_request_number)
            .await?;
        ensure_pull_request_can_be_enqueued(&status, expected_head_sha)?;
        status.state = GitHubPullRequestMergeQueueState::Queued;
        status.entry = Some(GitHubPullRequestMergeQueueEntry {
            id: "MQE_example".to_string(),
            position: 3,
            state: GitHubPullRequestMergeQueueEntryState::Queued,
            enqueued_at: "2026-08-27T15:00:00Z".to_string(),
            enqueued_by: "octocat".to_string(),
            estimated_time_to_merge_seconds: Some(420),
            head_sha: Some(expected_head_sha.to_string()),
            jump: false,
        });
        status.viewer_can_enqueue = false;
        status.viewer_can_dequeue = true;
        Ok(status)
    }

    async fn dequeue_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
        self.pull_request_merge_queue_status(token, owner, repository, pull_request_number)
            .await
    }
}

fn query_response(
    viewer_permission: Option<&str>,
    pull_request: serde_json::Value,
) -> PullRequestMergeQueueStatusQuery {
    serde_json::from_value(serde_json::json!({
        "repository": {
            "viewerPermission": viewer_permission,
            "pullRequest": pull_request,
        }
    }))
    .expect("merge queue query response")
}

fn pull_request_response() -> serde_json::Value {
    serde_json::json!({
        "id": "PR_kwDOexample",
        "state": "OPEN",
        "isDraft": false,
        "merged": false,
        "headRefOid": "abc1234",
        "baseRefName": "main",
        "mergeStateStatus": "CLEAN",
        "isMergeQueueEnabled": true,
        "isInMergeQueue": false,
        "mergeQueueEntry": null,
    })
}

#[test]
fn status_query_uses_githubs_queue_capability_and_entry_fields() {
    let payload = merge_queue_status_payload("octocat", "hello-world", 12);

    assert_eq!(payload["variables"]["owner"], "octocat");
    assert_eq!(payload["variables"]["repository"], "hello-world");
    assert_eq!(payload["variables"]["pullRequestNumber"], 12);
    let query = payload["query"].as_str().expect("status query");
    assert!(query.contains("viewerPermission"));
    assert!(query.contains("isMergeQueueEnabled"));
    assert!(query.contains("isInMergeQueue"));
    assert!(query.contains("estimatedTimeToMerge"));
}

#[test]
fn available_status_requires_write_access_and_passing_requirements() {
    let snapshot =
        merge_queue_snapshot_from_query(query_response(Some("WRITE"), pull_request_response()))
            .expect("available merge queue status");
    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestMergeQueueState::Available
    );
    assert!(snapshot.status.viewer_can_enqueue);
    assert_eq!(snapshot.status.base_ref, "main");

    let read_only =
        merge_queue_snapshot_from_query(query_response(Some("READ"), pull_request_response()))
            .expect("read-only merge queue status");
    assert_eq!(
        read_only.status.state,
        GitHubPullRequestMergeQueueState::Unavailable
    );
    assert!(!read_only.status.viewer_can_enqueue);

    let mut waiting = pull_request_response();
    waiting["mergeStateStatus"] = serde_json::json!("BLOCKED");
    let waiting = merge_queue_snapshot_from_query(query_response(Some("MAINTAIN"), waiting))
        .expect("waiting merge queue status");
    assert_eq!(
        waiting.status.state,
        GitHubPullRequestMergeQueueState::Waiting
    );
}

#[test]
fn queued_status_keeps_authoritative_entry_details() {
    let mut pull_request = pull_request_response();
    pull_request["isInMergeQueue"] = serde_json::json!(true);
    pull_request["mergeQueueEntry"] = serde_json::json!({
        "id": "MQE_example",
        "position": 3,
        "state": "AWAITING_CHECKS",
        "enqueuedAt": "2026-08-27T15:00:00Z",
        "enqueuer": { "login": "octocat" },
        "estimatedTimeToMerge": 420,
        "jump": false,
        "headCommit": { "oid": "queue123" },
        "mergeQueue": { "url": "https://github.com/octocat/hello-world/queue/main" },
    });

    let snapshot = merge_queue_snapshot_from_query(query_response(Some("ADMIN"), pull_request))
        .expect("queued merge queue status");
    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestMergeQueueState::Queued
    );
    assert!(snapshot.status.viewer_can_dequeue);
    let entry = snapshot.status.entry.expect("queue entry");
    assert_eq!(entry.position, 3);
    assert_eq!(
        entry.state,
        GitHubPullRequestMergeQueueEntryState::AwaitingChecks
    );
    assert_eq!(entry.estimated_time_to_merge_seconds, Some(420));
    assert_eq!(entry.head_sha.as_deref(), Some("queue123"));
}

#[test]
fn terminal_and_unconfigured_states_are_explicit() {
    let mut unconfigured = pull_request_response();
    unconfigured["isMergeQueueEnabled"] = serde_json::json!(false);
    let snapshot = merge_queue_snapshot_from_query(query_response(Some("WRITE"), unconfigured))
        .expect("unconfigured queue status");
    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestMergeQueueState::NotConfigured
    );

    let mut draft = pull_request_response();
    draft["isDraft"] = serde_json::json!(true);
    let snapshot = merge_queue_snapshot_from_query(query_response(Some("WRITE"), draft))
        .expect("draft queue status");
    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestMergeQueueState::Draft
    );
}

#[test]
fn enqueue_payload_uses_the_official_stale_head_guard() {
    let payload = enqueue_pull_request_payload("PR_kwDOexample", "abc1234");

    assert_eq!(payload["variables"]["pullRequestId"], "PR_kwDOexample");
    assert_eq!(payload["variables"]["expectedHeadOid"], "abc1234");
    let query = payload["query"].as_str().expect("enqueue mutation");
    assert!(query.contains("enqueuePullRequest"));
    assert!(query.contains("expectedHeadOid"));
}

#[test]
fn dequeue_payload_uses_the_pull_request_node_id() {
    let payload = dequeue_pull_request_payload("PR_kwDOexample");

    assert_eq!(payload["variables"]["pullRequestId"], "PR_kwDOexample");
    assert!(payload["query"]
        .as_str()
        .expect("dequeue mutation")
        .contains("dequeuePullRequest(input: { id: $pullRequestId })"));
}

#[test]
fn enqueue_guard_rejects_stale_or_waiting_pull_requests() {
    let status =
        merge_queue_snapshot_from_query(query_response(Some("WRITE"), pull_request_response()))
            .expect("merge queue status")
            .status;
    assert!(matches!(
        ensure_pull_request_can_be_enqueued(&status, "stale-head"),
        Err(AppError::GitHubPullRequestMergeQueueConflict(_))
    ));

    let mut waiting = status;
    waiting.state = GitHubPullRequestMergeQueueState::Waiting;
    assert!(matches!(
        ensure_pull_request_can_be_enqueued(&waiting, "abc1234"),
        Err(AppError::GitHubPullRequestMergeQueueConflict(_))
    ));
}

#[test]
fn mutation_responses_must_match_the_requested_pull_request() {
    let enqueued: PullRequestMergeQueueMutation = serde_json::from_value(serde_json::json!({
        "enqueuePullRequest": {
            "mergeQueueEntry": {
                "id": "MQE_example",
                "position": 3,
                "state": "QUEUED",
                "pullRequest": { "id": "PR_kwDOexample", "headRefOid": "abc1234" }
            }
        }
    }))
    .expect("enqueue response");
    ensure_enqueued_mutation_response(enqueued, "PR_kwDOexample", "abc1234")
        .expect("verified enqueue response");

    let dequeued: PullRequestMergeQueueMutation = serde_json::from_value(serde_json::json!({
        "dequeuePullRequest": {
            "mergeQueueEntry": {
                "id": "MQE_example",
                "pullRequest": { "id": "PR_kwDOexample", "headRefOid": "abc1234" }
            }
        }
    }))
    .expect("dequeue response");
    ensure_dequeued_mutation_response(dequeued, "PR_kwDOexample")
        .expect("verified dequeue response");
}
