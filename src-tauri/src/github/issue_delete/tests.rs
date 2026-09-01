use super::{delete_issue_with_client, load_issue_delete_status_with_client, IssueDeleteMutation};
use crate::{
    error::AppError,
    github::issue_related::test_support::{mock_github, MockResponse},
};

fn status_response(permission: &str, viewer_can_delete: bool, node_id: &str) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "viewerPermission": permission,
                "issue": {
                    "id": node_id,
                    "number": 7,
                    "url": "https://github.com/octocat/hello-world/issues/7",
                    "viewerCanDelete": viewer_can_delete,
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

fn mutation_response(repository_id: &str, full_name: &str) -> String {
    serde_json::json!({
        "data": {
            "result": {
                "repository": {
                    "id": repository_id,
                    "nameWithOwner": full_name
                }
            }
        }
    })
    .to_string()
}

fn deleted_postflight_response() -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world"
            },
            "node": null
        },
        "errors": [{
            "message": "Could not resolve to a node with the global id of 'I_7'",
            "locations": [{ "line": 1, "column": 1 }],
            "path": ["node"],
            "extensions": null
        }]
    })
    .to_string()
}

fn mutation() -> IssueDeleteMutation<'static> {
    IssueDeleteMutation::new("octocat", "hello-world", 7, "I_7")
        .expect("valid Issue delete mutation")
}

fn graphql_payload(request: &str) -> serde_json::Value {
    let body = request
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .expect("request body");
    serde_json::from_str(body).expect("GraphQL payload")
}

#[tokio::test]
async fn transport_loads_authoritative_delete_status() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response("ADMIN", true, "I_7"),
    }])
    .await;

    let status = load_issue_delete_status_with_client(&client, "octocat", "hello-world", 7)
        .await
        .expect("delete status");
    server.await.expect("mock server");

    assert_eq!(status.repository_id, "R_1");
    assert_eq!(status.repository_full_name, "octocat/hello-world");
    assert_eq!(status.issue_node_id, "I_7");
    assert_eq!(status.number, 7);
    assert!(status.viewer_can_delete);
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_deletes_an_authoritative_issue_and_confirms_the_node_is_gone() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("ADMIN", true, "I_7"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("R_1", "octocat/hello-world"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: deleted_postflight_response(),
        },
    ])
    .await;

    let deletion = delete_issue_with_client(&client, mutation())
        .await
        .expect("Issue deleted");
    server.await.expect("mock server");

    assert_eq!(deletion.repository_id, "R_1");
    assert_eq!(deletion.repository_full_name, "octocat/hello-world");
    assert_eq!(deletion.issue_node_id, "I_7");
    assert_eq!(deletion.number, 7);
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 3);
    let mutation_payload = graphql_payload(&requests[1]);
    assert!(mutation_payload["query"]
        .as_str()
        .expect("mutation")
        .contains("deleteIssue"));
    assert_eq!(mutation_payload["variables"]["issueId"], "I_7");
    let postflight_payload = graphql_payload(&requests[2]);
    assert_eq!(postflight_payload["variables"]["issueId"], "I_7");
}

#[tokio::test]
async fn transport_requires_authoritative_delete_permission_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response("ADMIN", false, "I_7"),
    }])
    .await;

    let error = delete_issue_with_client(&client, mutation())
        .await
        .expect_err("delete permission required");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubPermission(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_rejects_a_stale_issue_node_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response("ADMIN", true, "I_changed"),
    }])
    .await;

    let error = delete_issue_with_client(&client, mutation())
        .await
        .expect_err("stale Issue identity");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueDeletionConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_does_not_retry_an_ambiguous_delete_write() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("ADMIN", true, "I_7"),
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

    let error = delete_issue_with_client(&client, mutation())
        .await
        .expect_err("ambiguous delete write");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueDeletionConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_preserves_an_explicit_delete_rate_limit() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("ADMIN", true, "I_7"),
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

    let error = delete_issue_with_client(&client, mutation())
        .await
        .expect_err("rate limited delete");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubRateLimited(_)), "{error:?}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_rejects_a_mismatched_delete_response() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("ADMIN", true, "I_7"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("R_other", "octocat/other"),
        },
    ])
    .await;

    let error = delete_issue_with_client(&client, mutation())
        .await
        .expect_err("mutation repository identity must match");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueDeletionConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_reports_an_issue_that_still_resolves_after_deletion() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("ADMIN", true, "I_7"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("R_1", "octocat/hello-world"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": {
                    "repository": {
                        "id": "R_1",
                        "nameWithOwner": "octocat/hello-world"
                    },
                    "node": { "__typename": "Issue" }
                }
            })
            .to_string(),
        },
    ])
    .await;

    let error = delete_issue_with_client(&client, mutation())
        .await
        .expect_err("postflight must confirm deletion");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueDeletionConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 3);
}

#[tokio::test]
async fn postflight_preserves_an_explicit_delete_rate_limit() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("ADMIN", true, "I_7"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("R_1", "octocat/hello-world"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": {
                    "repository": null,
                    "node": null
                },
                "errors": [{
                    "message": "You have exceeded a secondary rate limit",
                    "locations": null,
                    "path": ["repository"],
                    "extensions": null
                }]
            })
            .to_string(),
        },
    ])
    .await;

    let error = delete_issue_with_client(&client, mutation())
        .await
        .expect_err("rate limited postflight");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubRateLimited(_)), "{error:?}");
    assert_eq!(requests.lock().expect("requests").len(), 3);
}
