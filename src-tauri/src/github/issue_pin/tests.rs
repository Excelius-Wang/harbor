use super::{
    load_pinned_issues_with_client, update_issue_pin_with_client, IssuePinAction, IssuePinMutation,
};
use crate::{
    error::AppError,
    github::issue_related::test_support::{mock_github, MockResponse},
};

fn pinned_issue(number: u64) -> serde_json::Value {
    serde_json::json!({
        "id": format!("PIN_{number}"),
        "pinnedBy": { "login": "hubot" },
        "repository": {
            "id": "R_1",
            "nameWithOwner": "octocat/hello-world"
        },
        "issue": issue(number, &format!("I_{number}"), true)
    })
}

fn issue(number: u64, node_id: &str, is_pinned: bool) -> serde_json::Value {
    serde_json::json!({
        "id": node_id,
        "number": number,
        "title": format!("Issue {number}"),
        "url": format!("https://github.com/octocat/hello-world/issues/{number}"),
        "state": "OPEN",
        "stateReason": null,
        "isPinned": is_pinned,
        "repository": {
            "id": "R_1",
            "nameWithOwner": "octocat/hello-world"
        }
    })
}

fn snapshot_response(
    permission: &str,
    pinned_numbers: &[u64],
    target: Option<(u64, &str, bool)>,
) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "viewerPermission": permission,
                "pinnedIssues": {
                    "totalCount": pinned_numbers.len(),
                    "nodes": pinned_numbers.iter().copied().map(pinned_issue).collect::<Vec<_>>()
                },
                "target": target.map(|(number, node_id, is_pinned)| issue(number, node_id, is_pinned))
            }
        }
    })
    .to_string()
}

fn mutation_response(number: u64, is_pinned: bool) -> String {
    serde_json::json!({
        "data": {
            "result": {
                "issue": issue(number, &format!("I_{number}"), is_pinned)
            }
        }
    })
    .to_string()
}

fn mutation(action: IssuePinAction) -> IssuePinMutation<'static> {
    IssuePinMutation::new("octocat", "hello-world", 7, "I_7", action)
        .expect("valid Issue pin mutation")
}

fn graphql_payload(request: &str) -> serde_json::Value {
    let body = request
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .expect("request body");
    serde_json::from_str(body).expect("GraphQL payload")
}

#[tokio::test]
async fn transport_loads_the_bounded_repository_pinned_issues() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: snapshot_response("READ", &[9, 11], None),
    }])
    .await;

    let page = load_pinned_issues_with_client(&client, "octocat", "hello-world")
        .await
        .expect("pinned Issues");
    server.await.expect("mock server");

    assert_eq!(page.repository_id, "R_1");
    assert_eq!(page.repository_full_name, "octocat/hello-world");
    assert!(!page.viewer_can_manage);
    assert_eq!(
        page.issues
            .iter()
            .map(|issue| issue.number)
            .collect::<Vec<_>>(),
        vec![9, 11]
    );
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 1);
    let payload = graphql_payload(&requests[0]);
    assert_eq!(payload["variables"]["first"], 4);
    assert!(payload["query"]
        .as_str()
        .expect("query")
        .contains("pinnedIssues"));
}

#[tokio::test]
async fn transport_rejects_a_pinned_issue_from_a_different_repository() {
    let response = snapshot_response("WRITE", &[9], None)
        .replace("octocat/hello-world/issues/9", "octocat/other/issues/9");
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: response,
    }])
    .await;

    load_pinned_issues_with_client(&client, "octocat", "hello-world")
        .await
        .expect_err("cross-repository pin must be rejected");
    server.await.expect("mock server");

    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_pins_an_authoritative_issue_and_confirms_the_postflight() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("WRITE", &[9], Some((7, "I_7", false))),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response(7, true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("WRITE", &[9, 7], Some((7, "I_7", true))),
        },
    ])
    .await;

    let page = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect("Issue pinned");
    server.await.expect("mock server");

    assert_eq!(page.issues.len(), 2);
    assert_eq!(page.issues[1].node_id, "I_7");
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 3);
    let payload = graphql_payload(&requests[1]);
    assert!(payload["query"]
        .as_str()
        .expect("mutation")
        .contains("pinIssue"));
    assert_eq!(payload["variables"]["issueId"], "I_7");
}

#[tokio::test]
async fn transport_unpins_an_authoritative_issue_and_confirms_the_postflight() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("ADMIN", &[9, 7], Some((7, "I_7", true))),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response(7, false),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("ADMIN", &[9], Some((7, "I_7", false))),
        },
    ])
    .await;

    let page = update_issue_pin_with_client(&client, mutation(IssuePinAction::Unpin))
        .await
        .expect("Issue unpinned");
    server.await.expect("mock server");

    assert_eq!(page.issues.len(), 1);
    let requests = requests.lock().expect("requests");
    let payload = graphql_payload(&requests[1]);
    assert!(payload["query"]
        .as_str()
        .expect("mutation")
        .contains("unpinIssue"));
}

#[tokio::test]
async fn transport_requires_write_permission_before_updating_a_pin() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: snapshot_response("READ", &[], Some((7, "I_7", false))),
    }])
    .await;

    let error = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect_err("write permission required");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubPermission(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_enforces_githubs_three_pinned_issue_limit_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: snapshot_response("WRITE", &[8, 9, 10], Some((7, "I_7", false))),
    }])
    .await;

    let error = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect_err("pin capacity must be enforced");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_rejects_a_stale_issue_identity_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: snapshot_response("WRITE", &[], Some((7, "I_other", false))),
    }])
    .await;

    let error = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect_err("stale Issue identity");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_does_not_retry_an_ambiguous_pin_write() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("WRITE", &[], Some((7, "I_7", false))),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": null,
                "errors": [{
                    "message": "temporary mutation failure",
                    "locations": null,
                    "path": ["result"],
                    "extensions": null
                }]
            })
            .to_string(),
        },
    ])
    .await;

    let error = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect_err("ambiguous pin write");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueStateConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_preserves_an_explicit_pin_rate_limit_without_retrying() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("WRITE", &[], Some((7, "I_7", false))),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": null,
                "errors": [{
                    "message": "You have exceeded a secondary rate limit",
                    "locations": null,
                    "path": ["result"],
                    "extensions": null
                }]
            })
            .to_string(),
        },
    ])
    .await;

    let error = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect_err("rate limited pin");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubRateLimited(_)), "{error:?}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_rejects_a_mismatched_mutation_response_before_postflight() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("WRITE", &[], Some((7, "I_7", false))),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response(8, true),
        },
    ])
    .await;

    let error = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect_err("mutation Issue identity must match");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueStateConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_reports_an_unconfirmed_pin_after_the_write() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("WRITE", &[], Some((7, "I_7", false))),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response(7, true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: snapshot_response("WRITE", &[], Some((7, "I_7", false))),
        },
    ])
    .await;

    let error = update_issue_pin_with_client(&client, mutation(IssuePinAction::Pin))
        .await
        .expect_err("postflight must confirm the pin");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueStateConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 3);
}
