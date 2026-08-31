use super::*;
use crate::github::issue_related::test_support::{mock_github, MockResponse};

fn linked_pull_requests_response(
    source_id: &str,
    has_more: bool,
    pull_request_state: &str,
    merged: bool,
) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "issue": {
                    "id": source_id,
                    "number": 7,
                    "closedByPullRequestsReferences": {
                        "nodes": [{
                            "id": "PR_9",
                            "number": 9,
                            "title": "Ship API",
                            "url": "https://github.com/octocat/api/pull/9",
                            "state": pull_request_state,
                            "isDraft": false,
                            "merged": merged,
                            "repository": {
                                "id": "R_9",
                                "nameWithOwner": "octocat/api"
                            }
                        }],
                        "pageInfo": {
                            "hasNextPage": has_more,
                            "endCursor": has_more.then_some("cursor-2")
                        }
                    }
                }
            }
        }
    })
    .to_string()
}

fn request(after: Option<&'static str>) -> IssueLinkedPullRequestRequest<'static> {
    IssueLinkedPullRequestRequest::new("octocat", "hello-world", 7, "I_7", after)
        .expect("linked pull request request")
}

#[tokio::test]
async fn transport_loads_a_page_of_current_issues_linked_pull_requests() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: linked_pull_requests_response("I_7", true, "OPEN", false),
    }])
    .await;

    let page = load_issue_linked_pull_requests_with_client(&client, request(None))
        .await
        .expect("linked pull request page");
    server.await.expect("mock server");

    assert_eq!(page.pull_requests.len(), 1);
    assert_eq!(page.pull_requests[0].repository.owner, "octocat");
    assert_eq!(page.pull_requests[0].repository.name, "api");
    assert_eq!(page.pull_requests[0].repository.full_name, "octocat/api");
    assert_eq!(
        page.pull_requests[0].repository.url,
        "https://github.com/octocat/api"
    );
    assert_eq!(page.pull_requests[0].number, 9);
    assert_eq!(page.pull_requests[0].title, "Ship API");
    assert_eq!(page.next_cursor.as_deref(), Some("cursor-2"));
    let request = requests.lock().expect("requests");
    assert!(request[0].starts_with("POST /graphql HTTP/1.1"));
    assert!(request[0].contains("closedByPullRequestsReferences"));
    assert!(request[0].contains("includeClosedPrs"));
}

#[tokio::test]
async fn transport_passes_the_page_cursor_to_github() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: linked_pull_requests_response("I_7", false, "OPEN", false),
    }])
    .await;

    let page = load_issue_linked_pull_requests_with_client(&client, request(Some("cursor-1")))
        .await
        .expect("second linked pull request page");
    server.await.expect("mock server");

    assert!(page.next_cursor.is_none());
    assert!(requests.lock().expect("requests")[0].contains("cursor-1"));
}

#[tokio::test]
async fn transport_preserves_a_merged_linked_pull_request_state() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: linked_pull_requests_response("I_7", false, "MERGED", true),
    }])
    .await;

    let page = load_issue_linked_pull_requests_with_client(&client, request(None))
        .await
        .expect("merged linked pull request page");
    server.await.expect("mock server");

    assert_eq!(page.pull_requests[0].state, GitHubPullRequestState::Closed);
    assert!(page.pull_requests[0].merged);
}

#[tokio::test]
async fn transport_rejects_a_graphql_response_for_a_different_issue() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: linked_pull_requests_response("I_8", false, "OPEN", false),
    }])
    .await;

    let error = load_issue_linked_pull_requests_with_client(&client, request(None))
        .await
        .expect_err("mismatched Issue identity");
    server.await.expect("mock server");

    assert!(error.to_string().contains("different Issue"));
}

#[tokio::test]
async fn transport_rejects_a_linked_pull_request_with_a_noncanonical_url() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: linked_pull_requests_response("I_7", false, "OPEN", false).replace(
            "https://github.com/octocat/api/pull/9",
            "https://github.com/octocat/api/pull/9?redirected=true",
        ),
    }])
    .await;

    let error = load_issue_linked_pull_requests_with_client(&client, request(None))
        .await
        .expect_err("noncanonical linked pull request URL");
    server.await.expect("mock server");

    assert!(error.to_string().contains("linked pull request URL"));
}
