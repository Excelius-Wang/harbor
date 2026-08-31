use super::{unmark_issue_duplicate_with_client, IssueDuplicateMutation};
use crate::{
    error::AppError,
    github::issue_related::test_support::{
        assert_rest_request, issue_json, mock_github, MockResponse,
    },
};

fn mutation() -> IssueDuplicateMutation<'static> {
    IssueDuplicateMutation::new("octocat", "hello-world", 7, "I_7")
        .expect("valid duplicate mutation")
}

fn duplicate_response(state_reason: &str, viewer_permission: &str, canonical: bool) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "viewerPermission": viewer_permission,
                "issue": {
                    "id": "I_7",
                    "number": 7,
                    "state": "CLOSED",
                    "stateReason": state_reason,
                    "duplicateOf": canonical.then(|| serde_json::json!({
                        "id": "I_9",
                        "number": 9,
                        "title": "Canonical Issue",
                        "url": "https://github.com/octocat/api/issues/9",
                        "repository": { "nameWithOwner": "octocat/api" }
                    }))
                }
            }
        }
    })
    .to_string()
}

fn mutation_response(issue_id: &str, state_reason: &str) -> String {
    serde_json::json!({
        "data": {
            "unmarkIssueAsDuplicate": {
                "duplicate": {
                    "__typename": "Issue",
                    "id": issue_id,
                    "number": 7,
                    "state": "CLOSED",
                    "stateReason": state_reason,
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

fn rest_issue() -> String {
    let mut issue = issue_json("octocat", "hello-world", 7, "completed");
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

#[tokio::test]
async fn transport_unmarks_the_authoritative_duplicate_in_one_mutation() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_response("DUPLICATE", "WRITE", true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_7", "COMPLETED"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_response("COMPLETED", "WRITE", false),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: rest_issue(),
        },
    ])
    .await;

    let issue = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect("duplicate unmarked");
    server.await.expect("mock server");

    assert_eq!(issue.number, 7);
    assert_eq!(issue.state_reason.as_deref(), Some("completed"));
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 4);
    assert!(requests[0].starts_with("POST /graphql HTTP/1.1"));
    let mutation = graphql_payload(&requests[1]);
    assert!(mutation["query"]
        .as_str()
        .is_some_and(|query| query.contains("unmarkIssueAsDuplicate")));
    assert_eq!(
        mutation["variables"],
        serde_json::json!({
            "duplicateId": "I_7",
            "canonicalId": "I_9"
        })
    );
    assert!(requests[2].starts_with("POST /graphql HTTP/1.1"));
    assert_rest_request(&requests[3], "/repos/octocat/hello-world/issues/7");
}

#[tokio::test]
async fn transport_rejects_a_stale_non_duplicate_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: duplicate_response("COMPLETED", "WRITE", false),
    }])
    .await;

    let error = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect_err("current duplicate state is required");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_requires_repository_write_permission_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: duplicate_response("DUPLICATE", "READ", true),
    }])
    .await;

    let error = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect_err("write permission is required");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubPermission(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_does_not_retry_or_postflight_a_failed_unmark_mutation() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_response("DUPLICATE", "WRITE", true),
        },
        MockResponse {
            status: "500 Internal Server Error",
            headers: vec![],
            body: serde_json::json!({"message": "temporary failure"}).to_string(),
        },
    ])
    .await;

    let error = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect_err("failed mutation must remain failed");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueStateConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_preserves_an_explicit_mutation_rate_limit_without_retrying() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_response("DUPLICATE", "WRITE", true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": null,
                "errors": [{
                    "message": "You have exceeded a secondary rate limit",
                    "locations": null,
                    "path": ["unmarkIssueAsDuplicate"],
                    "extensions": null
                }]
            })
            .to_string(),
        },
    ])
    .await;

    let error = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect_err("rate limited mutation must remain failed");
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
            body: duplicate_response("DUPLICATE", "WRITE", true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_8", "COMPLETED"),
        },
    ])
    .await;

    let error = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect_err("the response identity must match");
    server.await.expect("mock server");

    assert!(error.to_string().contains("may have persisted"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_rejects_a_mutation_response_from_a_different_repository() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_response("DUPLICATE", "WRITE", true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_7", "COMPLETED").replace("\"id\":\"R_1\"", "\"id\":\"R_2\""),
        },
    ])
    .await;

    let error = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect_err("the repository identity must match");
    server.await.expect("mock server");

    assert!(error.to_string().contains("may have persisted"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_reports_an_unconfirmed_unmark_after_the_write() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_response("DUPLICATE", "WRITE", true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_7", "COMPLETED"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: duplicate_response("DUPLICATE", "WRITE", true),
        },
    ])
    .await;

    let error = unmark_issue_duplicate_with_client(&client, mutation())
        .await
        .expect_err("the postflight must confirm the write");
    server.await.expect("mock server");

    assert!(error.to_string().contains("may have persisted"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 3);
}
