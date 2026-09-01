use super::{
    load_issue_transfer_status_with_client, transfer_issue_with_client, IssueTransferMutation,
};
use crate::{
    error::AppError,
    github::issue_related::test_support::{mock_github, MockResponse},
};

fn status_response(
    source_permission: &str,
    target_permission: &str,
    source_node_id: &str,
    source_state: &str,
    source_private: bool,
    target_private: bool,
    source_owner_id: &str,
    target_owner_id: &str,
) -> String {
    serde_json::json!({
        "data": {
            "source": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "url": "https://github.com/octocat/hello-world",
                "isPrivate": source_private,
                "viewerPermission": source_permission,
                "owner": { "id": source_owner_id },
                "sourceIssue": {
                    "id": source_node_id,
                    "number": 7,
                    "url": "https://github.com/octocat/hello-world/issues/7",
                    "state": source_state,
                    "viewerCanUpdate": true,
                    "repository": {
                        "id": "R_1",
                        "nameWithOwner": "octocat/hello-world"
                    }
                }
            },
            "target": {
                "id": "R_2",
                "nameWithOwner": "octocat/destination",
                "url": "https://github.com/octocat/destination",
                "isPrivate": target_private,
                "viewerPermission": target_permission,
                "owner": { "id": target_owner_id },
                "defaultBranchRef": { "name": "main" }
            }
        }
    })
    .to_string()
}

fn mutation_response(issue_id: &str, number: u64, repository_id: &str, full_name: &str) -> String {
    serde_json::json!({
        "data": {
            "result": {
                "issue": {
                    "id": issue_id,
                    "number": number,
                    "url": format!("https://github.com/{full_name}/issues/{number}"),
                    "state": "OPEN",
                    "repository": {
                        "id": repository_id,
                        "nameWithOwner": full_name,
                        "url": format!("https://github.com/{full_name}")
                    }
                }
            }
        }
    })
    .to_string()
}

fn postflight_response(
    issue_id: &str,
    number: u64,
    repository_id: &str,
    full_name: &str,
) -> String {
    serde_json::json!({
        "data": {
            "node": {
                "__typename": "Issue",
                "id": issue_id,
                "number": number,
                "url": format!("https://github.com/{full_name}/issues/{number}"),
                "repository": {
                    "id": repository_id,
                    "nameWithOwner": full_name
                }
            },
            "target": {
                "id": repository_id,
                "nameWithOwner": full_name,
                "issue": {
                    "id": issue_id,
                    "number": number,
                    "url": format!("https://github.com/{full_name}/issues/{number}"),
                    "repository": {
                        "id": repository_id,
                        "nameWithOwner": full_name
                    }
                }
            }
        }
    })
    .to_string()
}

fn mutation() -> IssueTransferMutation<'static> {
    IssueTransferMutation::new("octocat", "hello-world", 7, "octocat", "destination", "I_7")
        .expect("valid Issue transfer mutation")
}

fn graphql_payload(request: &str) -> serde_json::Value {
    let body = request
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .expect("request body");
    serde_json::from_str(body).expect("GraphQL payload")
}

#[tokio::test]
async fn transport_loads_transfer_status_and_enforces_the_same_owner_contract() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response("WRITE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_1"),
    }])
    .await;

    let status = load_issue_transfer_status_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        "octocat",
        "destination",
    )
    .await
    .expect("transfer status");
    server.await.expect("mock server");

    assert_eq!(status.source_issue_node_id, "I_7");
    assert_eq!(status.target_repository_id, "R_2");
    assert_eq!(status.target_default_branch, "main");
    assert!(status.same_owner);
    assert!(status.viewer_can_transfer);
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_transfers_an_authoritative_issue_and_confirms_the_target() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("WRITE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_1"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_7", 11, "R_2", "octocat/destination"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: postflight_response("I_7", 11, "R_2", "octocat/destination"),
        },
    ])
    .await;

    let transfer = transfer_issue_with_client(&client, mutation())
        .await
        .expect("Issue transferred");
    server.await.expect("mock server");

    assert_eq!(transfer.source_issue_node_id, "I_7");
    assert_eq!(transfer.target_repository_full_name, "octocat/destination");
    assert_eq!(transfer.target_issue_number, 11);
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 3);
    let mutation_payload = graphql_payload(&requests[1]);
    assert!(mutation_payload["query"]
        .as_str()
        .expect("mutation")
        .contains("transferIssue"));
    assert_eq!(mutation_payload["variables"]["issueId"], "I_7");
    assert_eq!(mutation_payload["variables"]["repositoryId"], "R_2");
}

#[tokio::test]
async fn transport_requires_write_access_to_both_repositories_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response("TRIAGE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_1"),
    }])
    .await;

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("transfer permission required");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubPermission(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_rejects_a_stale_issue_node_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response(
            "WRITE",
            "WRITE",
            "I_changed",
            "OPEN",
            false,
            false,
            "U_1",
            "U_1",
        ),
    }])
    .await;

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("stale Issue identity");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_rejects_private_to_public_transfer() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response("WRITE", "WRITE", "I_7", "OPEN", true, false, "U_1", "U_1"),
    }])
    .await;

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("private Issue cannot move to public repository");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_rejects_a_target_owned_by_another_account() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: status_response("WRITE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_2"),
    }])
    .await;

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("cross-owner transfer");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_does_not_retry_an_ambiguous_transfer_write() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("WRITE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_1"),
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

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("ambiguous transfer write");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueTransferConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_preserves_an_explicit_transfer_rate_limit() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("WRITE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_1"),
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

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("rate limited transfer");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubRateLimited(_)), "{error:?}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_rejects_a_mismatched_target_response() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("WRITE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_1"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("R_other", 11, "R_other", "octocat/other"),
        },
    ])
    .await;

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("target identity must match");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueTransferConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_reports_an_unconfirmed_target_postflight() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response("WRITE", "WRITE", "I_7", "OPEN", false, false, "U_1", "U_1"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: mutation_response("I_7", 11, "R_2", "octocat/destination"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: postflight_response("I_7", 11, "R_other", "octocat/other"),
        },
    ])
    .await;

    let error = transfer_issue_with_client(&client, mutation())
        .await
        .expect_err("postflight must confirm target");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueTransferConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 3);
}
