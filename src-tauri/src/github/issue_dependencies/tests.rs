use super::*;
use crate::github::issue_related::{
    test_support::{assert_rest_request, issue_json, mock_github, MockResponse},
    RelatedIssueRequest,
};

fn dependency_request(page: u32) -> RelatedIssueRequest<'static> {
    RelatedIssueRequest::new("octocat", "hello-world", 7, page).expect("valid request")
}

#[test]
fn routes_match_githubs_directed_issue_dependency_endpoints() {
    assert_eq!(
        blocked_by_route(dependency_request(2)),
        "/repos/octocat/hello-world/issues/7/dependencies/blocked_by?per_page=30&page=2"
    );
    assert_eq!(
        blocking_route(dependency_request(2)),
        "/repos/octocat/hello-world/issues/7/dependencies/blocking?per_page=30&page=2"
    );
}

#[tokio::test]
async fn transport_loads_paginated_cross_repository_dependencies_in_both_directions() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![(
                "Link",
                "<https://api.github.com/repos/octocat/hello-world/issues/7/dependencies/blocked_by?per_page=30&page=3>; rel=\"next\"",
            )],
            body: serde_json::to_string(&vec![issue_json("octocat", "api", 9, "completed")])
                .expect("blocked-by JSON"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::to_string(&vec![issue_json("octocat", "roadmap", 3, "completed")])
                .expect("blocking JSON"),
        },
    ])
    .await;

    let dependencies = load_issue_dependencies_with_client(&client, dependency_request(2))
        .await
        .expect("dependencies");
    server.await.expect("mock server");

    assert_eq!(dependencies.page, 2);
    assert!(dependencies.has_previous);
    assert!(dependencies.has_more);
    assert_eq!(
        dependencies.blocked_by[0].repository.full_name,
        "octocat/api"
    );
    assert_eq!(
        dependencies.blocking[0].repository.full_name,
        "octocat/roadmap"
    );

    let requests = requests.lock().expect("requests");
    assert_rest_request(
        &requests[0],
        "/repos/octocat/hello-world/issues/7/dependencies/blocked_by?per_page=30&page=2",
    );
    assert_rest_request(
        &requests[1],
        "/repos/octocat/hello-world/issues/7/dependencies/blocking?per_page=30&page=2",
    );
}

#[tokio::test]
async fn dependency_payload_cannot_reference_the_current_issue() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: serde_json::to_string(&vec![issue_json("octocat", "hello-world", 7, "completed")])
            .expect("self dependency JSON"),
    }])
    .await;

    let error = load_issue_dependencies_with_client(&client, dependency_request(1))
        .await
        .expect_err("self dependency must fail closed");
    server.await.expect("mock server");

    assert!(error.to_string().contains("current Issue"));
}

#[tokio::test]
async fn duplicate_dependency_identity_is_rejected() {
    let dependency = issue_json("octocat", "api", 9, "completed");
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: serde_json::to_string(&vec![dependency.clone(), dependency])
            .expect("duplicate dependency JSON"),
    }])
    .await;

    let error = load_issue_dependencies_with_client(&client, dependency_request(1))
        .await
        .expect_err("duplicate dependency must fail closed");
    server.await.expect("mock server");

    assert!(error.to_string().contains("duplicate"));
}
