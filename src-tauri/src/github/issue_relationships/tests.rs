use std::sync::{Arc, Mutex};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

use super::*;

struct MockResponse {
    status: &'static str,
    headers: Vec<(&'static str, &'static str)>,
    body: String,
}

fn issue_json(owner: &str, repository: &str, number: u64, state_reason: &str) -> serde_json::Value {
    serde_json::json!({
        "id": number,
        "node_id": format!("I_{owner}_{repository}_{number}"),
        "url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}"),
        "repository_url": format!("https://api.github.com/repos/{owner}/{repository}"),
        "labels_url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}/labels{{/name}}"),
        "comments_url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}/comments"),
        "events_url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}/events"),
        "html_url": format!("https://github.com/{owner}/{repository}/issues/{number}"),
        "number": number,
        "state": "closed",
        "state_reason": state_reason,
        "title": format!("Issue {number}"),
        "body": "Issue body",
        "user": {
            "login": "octocat",
            "id": 1,
            "node_id": "U_1",
            "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
            "gravatar_id": "",
            "url": "https://api.github.com/users/octocat",
            "html_url": "https://github.com/octocat",
            "followers_url": "https://api.github.com/users/octocat/followers",
            "following_url": "https://api.github.com/users/octocat/following{/other_user}",
            "gists_url": "https://api.github.com/users/octocat/gists{/gist_id}",
            "starred_url": "https://api.github.com/users/octocat/starred{/owner}{/repo}",
            "subscriptions_url": "https://api.github.com/users/octocat/subscriptions",
            "organizations_url": "https://api.github.com/users/octocat/orgs",
            "repos_url": "https://api.github.com/users/octocat/repos",
            "events_url": "https://api.github.com/users/octocat/events{/privacy}",
            "received_events_url": "https://api.github.com/users/octocat/received_events",
            "type": "User",
            "site_admin": false
        },
        "labels": [],
        "assignee": null,
        "assignees": [],
        "milestone": null,
        "locked": false,
        "comments": 2,
        "pull_request": null,
        "closed_at": "2026-08-30T08:01:00Z",
        "created_at": "2026-08-24T08:00:00Z",
        "updated_at": "2026-08-30T08:01:00Z"
    })
}

async fn mock_github(
    responses: Vec<MockResponse>,
) -> (
    octocrab::Octocrab,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
    let address = listener.local_addr().expect("mock address");
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&requests);
    let server = tokio::spawn(async move {
        for response in responses {
            let (mut stream, _) = listener.accept().await.expect("mock accept");
            let mut buffer = Vec::new();
            loop {
                let mut chunk = [0_u8; 1024];
                let read = stream.read(&mut chunk).await.expect("mock read");
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            captured
                .lock()
                .expect("request lock")
                .push(String::from_utf8(buffer).expect("request utf8"));
            let headers = response
                .headers
                .into_iter()
                .map(|(name, value)| format!("{name}: {value}\r\n"))
                .collect::<String>();
            let payload = format!(
                "HTTP/1.1 {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.status,
                headers,
                response.body.len(),
                response.body
            );
            stream
                .write_all(payload.as_bytes())
                .await
                .expect("mock write");
        }
    });
    let client = octocrab::Octocrab::builder()
        .base_uri(format!("http://{address}"))
        .expect("mock base uri")
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("mock client");
    (client, requests, server)
}

fn assert_rest_request(request: &str, route: &str) {
    assert!(request.starts_with(&format!("GET {route} HTTP/1.1")));
    let request = request.to_ascii_lowercase();
    assert!(request.contains("accept: application/vnd.github+json"));
    assert!(request.contains("x-github-api-version: 2026-03-10"));
}

fn relationship_request(page: u32) -> IssueRelationshipsRequest<'static> {
    IssueRelationshipsRequest::new("octocat", "hello-world", 7, page).expect("valid request")
}

#[test]
fn request_requires_an_issue_and_positive_page() {
    let request = relationship_request(2);
    assert_eq!((request.issue_number, request.page), (7, 2));
    assert!(IssueRelationshipsRequest::new("octocat", "hello-world", 0, 1).is_err());
    assert!(IssueRelationshipsRequest::new("octocat", "hello-world", 7, 0).is_err());
}

#[test]
fn routes_match_githubs_issue_relationship_endpoints() {
    assert_eq!(
        parent_route(relationship_request(1)),
        "/repos/octocat/hello-world/issues/7/parent"
    );
    assert_eq!(
        sub_issues_route(relationship_request(2)),
        "/repos/octocat/hello-world/issues/7/sub_issues?per_page=30&page=2"
    );
}

#[tokio::test]
async fn transport_loads_parent_and_paginated_cross_repository_children() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "roadmap", 3, "future_reason").to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![(
                "Link",
                "<https://api.github.com/repos/octocat/hello-world/issues/7/sub_issues?per_page=30&page=3>; rel=\"next\"",
            )],
            body: serde_json::to_string(&vec![issue_json("octocat", "api", 9, "completed")])
                .expect("children JSON"),
        },
    ])
    .await;

    let relationships = load_issue_relationships_with_client(&client, relationship_request(2))
        .await
        .expect("relationships");
    server.await.expect("mock server");

    assert_eq!(relationships.page, 2);
    assert!(relationships.has_previous);
    assert!(relationships.has_more);
    let parent = relationships.parent.expect("parent");
    assert_eq!(parent.repository.full_name, "octocat/roadmap");
    assert_eq!(parent.issue.state_reason.as_deref(), Some("future_reason"));
    assert_eq!(
        relationships.sub_issues[0].repository.full_name,
        "octocat/api"
    );
    assert_eq!(relationships.sub_issues[0].issue.number, 9);

    let requests = requests.lock().expect("requests");
    assert_rest_request(&requests[0], "/repos/octocat/hello-world/issues/7/parent");
    assert_rest_request(
        &requests[1],
        "/repos/octocat/hello-world/issues/7/sub_issues?per_page=30&page=2",
    );
}

#[tokio::test]
async fn missing_parent_is_an_empty_relationship_not_a_page_error() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({"message": "Not Found"}).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: "[]".to_string(),
        },
    ])
    .await;

    let relationships = load_issue_relationships_with_client(&client, relationship_request(1))
        .await
        .expect("relationships without a parent");
    server.await.expect("mock server");

    assert!(relationships.parent.is_none());
    assert!(relationships.sub_issues.is_empty());
    assert!(!relationships.has_previous);
    assert!(!relationships.has_more);
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn duplicate_sub_issue_identity_is_rejected() {
    let child = issue_json("octocat", "api", 9, "completed");
    let (client, _requests, server) = mock_github(vec![
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({"message": "Not Found"}).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::to_string(&vec![child.clone(), child])
                .expect("duplicate children JSON"),
        },
    ])
    .await;

    let error = load_issue_relationships_with_client(&client, relationship_request(1))
        .await
        .expect_err("duplicate child must fail closed");
    server.await.expect("mock server");

    assert!(error.to_string().contains("duplicate"));
}

#[tokio::test]
async fn moved_parent_endpoint_preserves_the_issue_moved_error() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "301 Moved Permanently",
        headers: vec![],
        body: serde_json::json!({"message": "Moved Permanently"}).to_string(),
    }])
    .await;

    let error = load_issue_relationships_with_client(&client, relationship_request(1))
        .await
        .expect_err("moved relationship route");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueMoved(_)));
}

#[tokio::test]
async fn relationship_payload_cannot_reference_the_current_issue_as_its_parent() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: issue_json("octocat", "hello-world", 7, "completed").to_string(),
    }])
    .await;

    let error = load_issue_relationships_with_client(&client, relationship_request(1))
        .await
        .expect_err("self-parent relationship");
    server.await.expect("mock server");

    assert!(error.to_string().contains("current Issue"));
}

#[tokio::test]
async fn parent_identity_must_match_its_api_repository_and_number() {
    let mut parent = issue_json("octocat", "roadmap", 3, "completed");
    parent["url"] = serde_json::json!("https://api.github.com/repos/octocat/roadmap/issues/4");
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: parent.to_string(),
    }])
    .await;

    let error = load_issue_relationships_with_client(&client, relationship_request(1))
        .await
        .expect_err("mismatched parent identity");
    server.await.expect("mock server");

    assert!(error.to_string().contains("identity"));
}

#[tokio::test]
async fn sub_issue_identity_must_match_its_html_repository_and_number() {
    let mut child = issue_json("octocat", "api", 9, "completed");
    child["html_url"] = serde_json::json!("https://github.com/octocat/other/issues/9");
    let (client, _requests, server) = mock_github(vec![
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({"message": "Not Found"}).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::to_string(&vec![child]).expect("child JSON"),
        },
    ])
    .await;

    let error = load_issue_relationships_with_client(&client, relationship_request(1))
        .await
        .expect_err("mismatched child identity");
    server.await.expect("mock server");

    assert!(error.to_string().contains("identity"));
}
