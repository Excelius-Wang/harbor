use super::*;

#[async_trait]
impl GitHubPullRequestAutoMergeClient for super::super::super::tests::FakeGitHubClient {
    async fn pull_request_auto_merge_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        use super::super::super::GitHubClient;

        let pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        Ok(GitHubPullRequestAutoMergeStatus {
            state: GitHubPullRequestAutoMergeState::Available,
            head_sha: pull_request.head_sha,
            merge_state_status: pull_request.mergeable_state,
            allowed_merge_methods: vec![
                GitHubPullRequestMergeMethod::Merge,
                GitHubPullRequestMergeMethod::Squash,
                GitHubPullRequestMergeMethod::Rebase,
            ],
            merge_method: None,
            enabled_at: None,
            enabled_by: None,
            viewer_can_enable: true,
            viewer_can_disable: false,
        })
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
        let mut status = self
            .pull_request_auto_merge_status(token, owner, repository, pull_request_number)
            .await?;
        ensure_auto_merge_can_be_enabled(&status, expected_head_sha, merge_method)?;
        status.state = GitHubPullRequestAutoMergeState::Enabled;
        status.merge_method = Some(merge_method);
        status.enabled_at = Some("2026-08-27T14:00:00Z".to_string());
        status.enabled_by = Some("octocat".to_string());
        status.viewer_can_enable = false;
        status.viewer_can_disable = true;
        Ok(status)
    }

    async fn disable_pull_request_auto_merge(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
        self.pull_request_auto_merge_status(token, owner, repository, pull_request_number)
            .await
    }
}

fn query_response(
    repository_auto_merge: bool,
    pull_request: serde_json::Value,
) -> PullRequestAutoMergeStatusQuery {
    serde_json::from_value(serde_json::json!({
        "repository": {
            "autoMergeAllowed": repository_auto_merge,
            "mergeCommitAllowed": true,
            "squashMergeAllowed": true,
            "rebaseMergeAllowed": false,
            "pullRequest": pull_request,
        }
    }))
    .expect("auto-merge query response")
}

fn pull_request_response() -> serde_json::Value {
    serde_json::json!({
        "id": "PR_kwDOexample",
        "state": "OPEN",
        "isDraft": false,
        "merged": false,
        "headRefOid": "abc1234",
        "mergeStateStatus": "BLOCKED",
        "viewerCanEnableAutoMerge": true,
        "viewerCanDisableAutoMerge": false,
        "isMergeQueueEnabled": false,
        "isInMergeQueue": false,
        "mergeQueueEntry": null,
        "autoMergeRequest": null,
    })
}

#[test]
fn status_query_keeps_repository_policy_and_viewer_capabilities() {
    let payload = auto_merge_status_payload("octocat", "hello-world", 12);

    assert_eq!(payload["variables"]["owner"], "octocat");
    assert_eq!(payload["variables"]["repository"], "hello-world");
    assert_eq!(payload["variables"]["pullRequestNumber"], 12);
    let query = payload["query"].as_str().expect("status query");
    assert!(query.contains("autoMergeAllowed"));
    assert!(query.contains("viewerCanEnableAutoMerge"));
    assert!(query.contains("isMergeQueueEnabled"));
    assert!(query.contains("mergeQueueEntry"));
}

#[test]
fn graphql_pull_request_numbers_reject_values_outside_githubs_int_range() {
    assert_eq!(
        graphql_pull_request_number(12).expect("pull request number"),
        12
    );
    assert!(matches!(
        graphql_pull_request_number(i32::MAX as u64 + 1),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn available_status_keeps_only_repository_allowed_methods() {
    let snapshot = auto_merge_snapshot_from_query(query_response(true, pull_request_response()))
        .expect("auto-merge status");

    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestAutoMergeState::Available
    );
    assert_eq!(
        snapshot.status.allowed_merge_methods,
        [
            GitHubPullRequestMergeMethod::Merge,
            GitHubPullRequestMergeMethod::Squash,
        ]
    );
    assert_eq!(snapshot.status.head_sha, "abc1234");
    assert!(snapshot.status.viewer_can_enable);
}

#[test]
fn enabled_status_keeps_method_actor_and_time() {
    let mut pull_request = pull_request_response();
    pull_request["viewerCanEnableAutoMerge"] = serde_json::json!(false);
    pull_request["viewerCanDisableAutoMerge"] = serde_json::json!(true);
    pull_request["autoMergeRequest"] = serde_json::json!({
        "mergeMethod": "SQUASH",
        "enabledAt": "2026-08-27T14:00:00Z",
        "enabledBy": { "login": "octocat" },
    });

    let snapshot = auto_merge_snapshot_from_query(query_response(true, pull_request))
        .expect("enabled auto-merge status");

    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestAutoMergeState::Enabled
    );
    assert_eq!(
        snapshot.status.merge_method,
        Some(GitHubPullRequestMergeMethod::Squash)
    );
    assert_eq!(snapshot.status.enabled_by.as_deref(), Some("octocat"));
    assert!(snapshot.status.viewer_can_disable);
}

#[test]
fn merge_queue_is_not_reported_as_auto_merge() {
    let mut pull_request = pull_request_response();
    pull_request["isMergeQueueEnabled"] = serde_json::json!(true);
    pull_request["autoMergeRequest"] = serde_json::json!({
        "mergeMethod": "MERGE",
        "enabledAt": null,
        "enabledBy": null,
    });

    let snapshot = auto_merge_snapshot_from_query(query_response(true, pull_request))
        .expect("merge queue status");

    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestAutoMergeState::MergeQueue
    );
}

#[test]
fn repository_setting_has_an_explicit_disabled_state() {
    let snapshot = auto_merge_snapshot_from_query(query_response(false, pull_request_response()))
        .expect("disabled repository status");

    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestAutoMergeState::RepositoryDisabled
    );
}

#[test]
fn clean_pull_request_hides_irrelevant_repository_disabled_state() {
    let mut pull_request = pull_request_response();
    pull_request["mergeStateStatus"] = serde_json::json!("CLEAN");

    let snapshot = auto_merge_snapshot_from_query(query_response(false, pull_request))
        .expect("clean pull request status");

    assert_eq!(
        snapshot.status.state,
        GitHubPullRequestAutoMergeState::NotNeeded
    );
}

#[test]
fn enable_payload_uses_method_and_expected_head_guard() {
    let payload = enable_auto_merge_payload(
        "PR_kwDOexample",
        "abc1234",
        GitHubPullRequestMergeMethod::Rebase,
    );

    assert_eq!(payload["variables"]["pullRequestId"], "PR_kwDOexample");
    assert_eq!(payload["variables"]["mergeMethod"], "REBASE");
    assert_eq!(payload["variables"]["expectedHeadOid"], "abc1234");
    assert!(payload["query"]
        .as_str()
        .expect("enable query")
        .contains("enablePullRequestAutoMerge"));
}

#[test]
fn enable_guard_rejects_stale_head_policy_and_method() {
    let status = auto_merge_snapshot_from_query(query_response(true, pull_request_response()))
        .expect("auto-merge status")
        .status;

    assert!(matches!(
        ensure_auto_merge_can_be_enabled(
            &status,
            "stale-head",
            GitHubPullRequestMergeMethod::Merge,
        ),
        Err(AppError::GitHubPullRequestAutoMergeConflict(_))
    ));
    assert!(matches!(
        ensure_auto_merge_can_be_enabled(&status, "abc1234", GitHubPullRequestMergeMethod::Rebase,),
        Err(AppError::GitHubPullRequestAutoMergeConflict(_))
    ));
}

#[test]
fn mutation_responses_must_match_the_requested_pull_request() {
    let enabled: PullRequestAutoMergeMutation = serde_json::from_value(serde_json::json!({
        "enablePullRequestAutoMerge": {
            "pullRequest": {
                "id": "PR_kwDOexample",
                "autoMergeRequest": {
                    "mergeMethod": "SQUASH",
                    "enabledAt": "2026-08-27T14:00:00Z",
                    "enabledBy": { "login": "octocat" },
                }
            }
        }
    }))
    .expect("enable response");
    ensure_enabled_mutation_response(
        enabled,
        "PR_kwDOexample",
        GitHubPullRequestMergeMethod::Squash,
    )
    .expect("verified enable response");

    let disabled: PullRequestAutoMergeMutation = serde_json::from_value(serde_json::json!({
        "disablePullRequestAutoMerge": {
            "pullRequest": {
                "id": "PR_kwDOexample",
                "autoMergeRequest": null,
            }
        }
    }))
    .expect("disable response");
    ensure_disabled_mutation_response(disabled, "PR_kwDOexample")
        .expect("verified disable response");
}
