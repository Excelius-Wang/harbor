use super::mutations::{add_issue_sub_issue_with_client, IssueSubIssueMutation};
use super::*;
use crate::github::issue_related::{
    test_support::{assert_rest_request, issue_json, mock_github, MockResponse},
    RelatedIssueRequest,
};

fn relationship_request(page: u32) -> RelatedIssueRequest<'static> {
    RelatedIssueRequest::new("octocat", "hello-world", 7, page).expect("valid request")
}

fn sub_issue_mutation() -> IssueSubIssueMutation<'static> {
    IssueSubIssueMutation::new("octocat", "hello-world", 7, 42).expect("valid sub-issue mutation")
}

#[test]
fn sub_issue_mutation_requires_a_nonzero_existing_issue_number() {
    assert!(IssueSubIssueMutation::new("octocat", "hello-world", 7, 0).is_err());
}

#[tokio::test]
async fn transport_adds_an_unparented_same_repository_issue_without_replacing_a_parent() {
    let mutation = sub_issue_mutation();
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 7, "completed").to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 42, "completed").to_string(),
        },
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({"message": "Not Found"}).to_string(),
        },
        MockResponse {
            status: "201 Created",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 42, "completed").to_string(),
        },
    ])
    .await;

    add_issue_sub_issue_with_client(&client, mutation)
        .await
        .expect("sub-issue added");
    server.await.expect("mock server");

    let requests = requests.lock().expect("requests");
    assert_rest_request(&requests[0], "/repos/octocat/hello-world/issues/7");
    assert_rest_request(&requests[1], "/repos/octocat/hello-world/issues/42");
    assert_rest_request(&requests[2], "/repos/octocat/hello-world/issues/42/parent");
    assert!(requests[3].starts_with("POST /repos/octocat/hello-world/issues/7/sub_issues HTTP/1.1"));
    let body = requests[3]
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .expect("request body");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(body).expect("payload JSON"),
        serde_json::json!({"sub_issue_id": 42, "replace_parent": false})
    );
}

#[tokio::test]
async fn transport_rejects_a_sub_issue_that_already_has_a_parent_before_writing() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 7, "completed").to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 42, "completed").to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "roadmap", 3, "completed").to_string(),
        },
    ])
    .await;

    let error = add_issue_sub_issue_with_client(&client, sub_issue_mutation())
        .await
        .expect_err("existing parent must prevent a write");
    server.await.expect("mock server");

    assert!(
        error.to_string().contains("already has a parent"),
        "{error}"
    );
    assert_eq!(requests.lock().expect("requests").len(), 3);
}

#[tokio::test]
async fn transport_rejects_a_pull_request_before_writing_a_sub_issue_relationship() {
    let mut pull_request = issue_json("octocat", "hello-world", 42, "completed");
    pull_request["pull_request"] = serde_json::json!({"url": "https://api.github.com/pulls/42"});
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 7, "completed").to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: pull_request.to_string(),
        },
    ])
    .await;

    let error = add_issue_sub_issue_with_client(&client, sub_issue_mutation())
        .await
        .expect_err("pull requests cannot become sub-issues");
    server.await.expect("mock server");

    assert!(error.to_string().contains("Issue"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[test]
fn request_requires_an_issue_and_positive_page() {
    let request = relationship_request(2);
    assert_eq!((request.issue_number, request.page), (7, 2));
    assert!(RelatedIssueRequest::new("octocat", "hello-world", 0, 1).is_err());
    assert!(RelatedIssueRequest::new("octocat", "hello-world", 7, 0).is_err());
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
