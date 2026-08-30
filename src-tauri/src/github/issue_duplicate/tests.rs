use super::*;
use crate::github::issue_related::test_support::{mock_github, MockResponse};

fn duplicate_response(source_id: &str, state_reason: Option<&str>) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "issue": {
                    "id": source_id,
                    "number": 7,
                    "state": "CLOSED",
                    "stateReason": state_reason,
                    "duplicateOf": {
                        "id": "I_9",
                        "number": 9,
                        "title": "Canonical Issue",
                        "url": "https://github.com/octocat/api/issues/9",
                        "repository": { "nameWithOwner": "octocat/api" }
                    }
                }
            }
        }
    })
    .to_string()
}

fn duplicate_request() -> IssueGraphQlRequest<'static> {
    IssueGraphQlRequest::new("octocat", "hello-world", 7, "I_7").expect("duplicate request")
}

#[tokio::test]
async fn transport_loads_the_current_issues_canonical_duplicate_reference() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: duplicate_response("I_7", Some("DUPLICATE")),
    }])
    .await;

    let duplicate = load_issue_duplicate_with_client(&client, duplicate_request())
        .await
        .expect("duplicate reference")
        .expect("canonical duplicate");
    server.await.expect("mock server");

    assert_eq!(duplicate.owner, "octocat");
    assert_eq!(duplicate.repository, "api");
    assert_eq!(duplicate.issue_number, 9);
    assert_eq!(duplicate.title, "Canonical Issue");
    let request = requests.lock().expect("requests");
    assert!(request[0].starts_with("POST /graphql HTTP/1.1"));
    assert!(request[0].contains("duplicateOf"));
}

#[tokio::test]
async fn transport_hides_a_duplicate_reference_after_the_issue_state_changes() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: duplicate_response("I_7", Some("COMPLETED")),
    }])
    .await;

    let duplicate = load_issue_duplicate_with_client(&client, duplicate_request())
        .await
        .expect("current Issue state");
    server.await.expect("mock server");

    assert!(duplicate.is_none());
}

#[tokio::test]
async fn transport_rejects_a_graphql_response_for_a_different_issue() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: duplicate_response("I_8", Some("DUPLICATE")),
    }])
    .await;

    let error = load_issue_duplicate_with_client(&client, duplicate_request())
        .await
        .expect_err("mismatched Issue identity");
    server.await.expect("mock server");

    assert!(error.to_string().contains("different Issue"));
}

#[tokio::test]
async fn transport_rejects_a_canonical_issue_with_a_noncanonical_url() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: duplicate_response("I_7", Some("DUPLICATE")).replace(
            "https://github.com/octocat/api/issues/9",
            "https://github.com/octocat/api/issues/9?redirected=true",
        ),
    }])
    .await;

    let error = load_issue_duplicate_with_client(&client, duplicate_request())
        .await
        .expect_err("noncanonical Issue URL");
    server.await.expect("mock server");

    assert!(error.to_string().contains("canonical Issue URL"));
}
