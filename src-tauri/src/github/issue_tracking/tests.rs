use super::*;
use crate::github::issue_related::test_support::{mock_github, MockResponse};

fn issue_tracking_response(source_id: &str, direction: &str, has_more: bool) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "issue": {
                    "id": source_id,
                    "number": 7,
                    direction: {
                        "nodes": [{
                            "id": "I_9",
                            "number": 9,
                            "title": "Track me",
                            "url": "https://github.com/octocat/api/issues/9",
                            "state": "OPEN",
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

fn request(
    direction: GitHubIssueTrackingDirection,
    after: Option<&'static str>,
) -> IssueTrackingRequest<'static> {
    IssueTrackingRequest::new("octocat", "hello-world", 7, "I_7", direction, after)
        .expect("issue tracking request")
}

#[tokio::test]
async fn transport_loads_tracked_issues_and_pagination() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: issue_tracking_response("I_7", "trackedIssues", true),
    }])
    .await;

    let page = load_issue_tracking_with_client(
        &client,
        request(GitHubIssueTrackingDirection::Tracked, None),
    )
    .await
    .expect("tracked Issue page");
    server.await.expect("mock server");

    assert_eq!(page.direction, GitHubIssueTrackingDirection::Tracked);
    assert_eq!(page.issues.len(), 1);
    assert_eq!(page.issues[0].node_id, "I_9");
    assert_eq!(page.issues[0].number, 9);
    assert_eq!(page.issues[0].title, "Track me");
    assert_eq!(page.issues[0].repository.full_name, "octocat/api");
    assert_eq!(page.next_cursor.as_deref(), Some("cursor-2"));

    let request = requests.lock().expect("requests");
    assert!(request[0].starts_with("POST /graphql HTTP/1.1"));
    assert!(request[0].contains("trackedIssues"));
}

#[tokio::test]
async fn transport_loads_issues_tracking_the_current_issue() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: issue_tracking_response("I_7", "trackedInIssues", false),
    }])
    .await;

    let page = load_issue_tracking_with_client(
        &client,
        request(GitHubIssueTrackingDirection::TrackedBy, Some("cursor-1")),
    )
    .await
    .expect("tracking Issue page");
    server.await.expect("mock server");

    assert_eq!(page.direction, GitHubIssueTrackingDirection::TrackedBy);
    assert!(page.next_cursor.is_none());
    assert!(requests.lock().expect("requests")[0].contains("trackedInIssues"));
    assert!(requests.lock().expect("requests")[0].contains("cursor-1"));
}

#[tokio::test]
async fn transport_rejects_current_issue_as_a_tracked_issue() {
    let body = issue_tracking_response("I_7", "trackedIssues", false)
        .replace("\"I_9\"", "\"I_7\"")
        .replace("octocat/api/issues/9", "octocat/hello-world/issues/7")
        .replace(
            "\"nameWithOwner\":\"octocat/api\"",
            "\"nameWithOwner\":\"octocat/hello-world\"",
        )
        .replace("\"number\":9", "\"number\":7");
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body,
    }])
    .await;

    let error = load_issue_tracking_with_client(
        &client,
        request(GitHubIssueTrackingDirection::Tracked, None),
    )
    .await
    .expect_err("self tracking relationship");
    server.await.expect("mock server");

    assert!(error.to_string().contains("current Issue"));
}

#[tokio::test]
async fn transport_rejects_a_tracked_issue_with_a_noncanonical_url() {
    let body = issue_tracking_response("I_7", "trackedIssues", false).replace(
        "https://github.com/octocat/api/issues/9",
        "https://github.com/octocat/api/pull/9",
    );
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body,
    }])
    .await;

    let error = load_issue_tracking_with_client(
        &client,
        request(GitHubIssueTrackingDirection::Tracked, None),
    )
    .await
    .expect_err("pull request URL");
    server.await.expect("mock server");

    assert!(error.to_string().contains("tracked Issue URL"));
}

#[tokio::test]
async fn transport_rejects_a_missing_next_cursor() {
    let body = issue_tracking_response("I_7", "trackedIssues", true)
        .replace("\"endCursor\":\"cursor-2\"", "\"endCursor\":null");
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body,
    }])
    .await;

    let error = load_issue_tracking_with_client(
        &client,
        request(GitHubIssueTrackingDirection::Tracked, None),
    )
    .await
    .expect_err("missing next cursor");
    server.await.expect("mock server");

    assert!(error.to_string().contains("next tracked Issue cursor"));
}

#[test]
fn request_rejects_invalid_cursor() {
    let error = IssueTrackingRequest::new(
        "octocat",
        "hello-world",
        7,
        "I_7",
        GitHubIssueTrackingDirection::Tracked,
        Some("bad\n cursor"),
    )
    .err()
    .expect("invalid cursor");

    assert!(error.to_string().contains("cursor"));
}
