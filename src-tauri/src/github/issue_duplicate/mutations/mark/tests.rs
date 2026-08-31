use super::{mark_issue_duplicate_with_client, IssueDuplicateMarkMutation};
use crate::{
    error::AppError,
    github::issue_related::test_support::{
        assert_rest_request, issue_json, mock_github, MockResponse,
    },
};

fn mutation(canonical_issue_number: u64) -> IssueDuplicateMarkMutation<'static> {
    IssueDuplicateMarkMutation::new("octocat", "hello-world", 7, canonical_issue_number, "I_7")
        .expect("valid duplicate mutation")
}

fn preflight_response(source_state: &str, viewer_can_close: bool, canonical_id: &str) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "source": {
                    "id": "I_7",
                    "number": 7,
                    "state": source_state,
                    "stateReason": null,
                    "duplicateOf": null,
                    "viewerCanClose": viewer_can_close
                },
                "canonical": {
                    "id": canonical_id,
                    "number": 9,
                    "title": "Canonical Issue",
                    "url": "https://github.com/octocat/hello-world/issues/9",
                    "stateReason": null,
                    "duplicateOf": null,
                    "repository": {
                        "id": "R_1",
                        "nameWithOwner": "octocat/hello-world"
                    }
                }
            }
        }
    })
    .to_string()
}

fn mutation_response(source_id: &str, canonical_id: &str) -> String {
    serde_json::json!({
        "data": {
            "closeIssue": {
                "issue": {
                    "id": source_id,
                    "number": 7,
                    "state": "CLOSED",
                    "stateReason": "DUPLICATE",
                    "duplicateOf": { "id": canonical_id },
                    "repository": {
                        "id": "R_1",
                        "nameWithOwner": "octocat/hello-world"
                    }
                }
            }
        }
    })
    .to_string()
}

fn duplicate_postflight_response(state_reason: &str, canonical_id: Option<&str>) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "viewerPermission": "WRITE",
                "issue": {
                    "id": "I_7",
                    "number": 7,
                    "state": "CLOSED",
                    "stateReason": state_reason,
                    "duplicateOf": canonical_id.map(|id| serde_json::json!({
                        "id": id,
                        "number": 9,
                        "title": "Canonical Issue",
                        "url": "https://github.com/octocat/hello-world/issues/9",
                        "repository": { "nameWithOwner": "octocat/hello-world" }
                    }))
                }
            }
        }
    })
    .to_string()
}

fn rest_issue() -> String {
    let mut issue = issue_json("octocat", "hello-world", 7, "duplicate");
    issue["node_id"] = serde_json::json!("I_7");
    issue.to_string()
}

fn graphql_payload(request: &str) -> serde_json::Value {
    let body = request
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .expect("request body");
    serde_json::from_str(body).expect("GraphQL payload")
}

#[test]
fn mutation_rejects_the_current_issue_as_its_own_canonical_issue() {
    let error = IssueDuplicateMarkMutation::new("octocat", "hello-world", 7, 7, "I_7")
        .err()
        .expect("self duplicate");

    assert!(matches!(error, AppError::Validation(_)));
}

#[tokio::test]
async fn transport_marks_the_authoritative_same_repository_issue_as_duplicate() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response("OPEN", true, "I_9"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_7", "I_9"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_postflight_response("DUPLICATE", Some("I_9")),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: rest_issue(),
        },
    ])
    .await;

    let issue = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect("duplicate marked");
    server.await.expect("mock server");

    assert_eq!(issue.number, 7);
    assert_eq!(issue.state_reason.as_deref(), Some("duplicate"));
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 4);
    let preflight = graphql_payload(&requests[0]);
    let preflight_query = preflight["query"].as_str().expect("preflight query");
    assert!(preflight_query.contains("viewerCanClose"));
    assert!(preflight_query.contains("canonical: issue"));
    assert!(preflight_query.contains("stateReason"));
    assert!(!preflight_query.contains("enableDuplicate"));
    let mutation = graphql_payload(&requests[1]);
    let query = mutation["query"].as_str().expect("mutation query");
    assert!(query.contains("closeIssue"));
    assert!(query.contains("stateReason: DUPLICATE"));
    assert_eq!(
        mutation["variables"],
        serde_json::json!({ "sourceId": "I_7", "canonicalId": "I_9" })
    );
    assert_rest_request(&requests[3], "/repos/octocat/hello-world/issues/7");
}

#[tokio::test]
async fn transport_rejects_a_closed_source_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: preflight_response("CLOSED", true, "I_9"),
    }])
    .await;

    let error = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("source must be open");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_requires_the_authoritative_close_capability() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: preflight_response("OPEN", false, "I_9"),
    }])
    .await;

    let error = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("close capability required");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubPermission(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_rejects_a_mismatched_canonical_identity_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: preflight_response("OPEN", true, "I_9").replace(
            "https://github.com/octocat/hello-world/issues/9",
            "https://github.com/octocat/other/issues/9",
        ),
    }])
    .await;

    mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("canonical repository identity");
    server.await.expect("mock server");

    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_rejects_a_canonical_issue_that_is_itself_a_duplicate() {
    let mut response: serde_json::Value =
        serde_json::from_str(&preflight_response("OPEN", true, "I_9")).expect("preflight response");
    response["data"]["repository"]["canonical"]["stateReason"] = serde_json::json!("DUPLICATE");
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: response.to_string(),
    }])
    .await;

    let error = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("canonical Issue must be original");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_does_not_retry_or_postflight_an_ambiguous_failed_write() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response("OPEN", true, "I_9"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": null,
                "errors": [{
                    "message": "temporary mutation failure",
                    "locations": null,
                    "path": ["closeIssue"],
                    "extensions": null
                }]
            })
            .to_string(),
        },
    ])
    .await;

    let error = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("ambiguous write failure");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueStateConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_preserves_an_explicit_mark_rate_limit_without_retrying() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response("OPEN", true, "I_9"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": null,
                "errors": [{
                    "message": "You have exceeded a secondary rate limit",
                    "locations": null,
                    "path": ["closeIssue"],
                    "extensions": null
                }]
            })
            .to_string(),
        },
    ])
    .await;

    let error = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("rate limited mark");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubRateLimited(_)), "{error:?}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_rejects_a_mismatched_mark_response_before_postflight() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response("OPEN", true, "I_9"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_8", "I_9"),
        },
    ])
    .await;

    let error = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("mutation source identity");
    server.await.expect("mock server");

    assert!(error.to_string().contains("may have persisted"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_reports_an_unconfirmed_duplicate_after_the_write() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response("OPEN", true, "I_9"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_7", "I_9"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_postflight_response("COMPLETED", None),
        },
    ])
    .await;

    let error = mark_issue_duplicate_with_client(&client, mutation(9))
        .await
        .expect_err("postflight must confirm duplicate");
    server.await.expect("mock server");

    assert!(error.to_string().contains("may have persisted"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 3);
}
