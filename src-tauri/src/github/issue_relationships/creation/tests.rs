use super::{create_issue_sub_issue_with_client, IssueSubIssueCreateMutation};
use crate::{
    error::AppError,
    github::issue_related::test_support::{
        assert_rest_request, issue_json, mock_github, MockResponse,
    },
};

fn create_mutation() -> IssueSubIssueCreateMutation<'static> {
    IssueSubIssueCreateMutation::new(
        "octocat",
        "hello-world",
        7,
        "Child work",
        "Track the child work here.",
    )
    .expect("valid create mutation")
}

fn preflight_response(
    viewer_can_create_issues: bool,
    blank_issues_enabled: bool,
    viewer_permission: &str,
) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_octocat_hello-world",
                "nameWithOwner": "octocat/hello-world",
                "hasIssuesEnabled": true,
                "isBlankIssuesEnabled": blank_issues_enabled,
                "viewerCanCreateIssues": viewer_can_create_issues,
                "viewerPermission": viewer_permission,
                "issue": {
                    "id": "I_octocat_hello-world_7",
                    "number": 7
                }
            }
        }
    })
    .to_string()
}

fn create_response(repository: &str, issue_number: u64) -> String {
    serde_json::json!({
        "data": {
            "createIssue": {
                "issue": {
                    "id": format!("I_octocat_{repository}_{issue_number}"),
                    "number": issue_number,
                    "url": format!("https://github.com/octocat/{repository}/issues/{issue_number}"),
                    "repository": {
                        "id": "R_octocat_hello-world",
                        "nameWithOwner": format!("octocat/{repository}")
                    }
                }
            }
        }
    })
    .to_string()
}

fn graphql_payload(request: &str) -> serde_json::Value {
    let body = request
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .expect("request body");
    serde_json::from_str(body).expect("GraphQL payload")
}

#[test]
fn create_mutation_requires_a_parent_issue_and_title() {
    assert!(
        IssueSubIssueCreateMutation::new("octocat", "hello-world", 0, "Child work", "Body",)
            .is_err()
    );
    assert!(IssueSubIssueCreateMutation::new("octocat", "hello-world", 7, "  ", "Body").is_err());
}

#[tokio::test]
async fn transport_creates_a_same_repository_sub_issue_in_one_graphql_mutation() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response(true, true, "WRITE"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: create_response("hello-world", 42),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 42, "completed").to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 7, "completed").to_string(),
        },
    ])
    .await;

    let created = create_issue_sub_issue_with_client(&client, create_mutation())
        .await
        .expect("sub-issue created");
    server.await.expect("mock server");

    assert_eq!(created.issue.number, 42);
    assert_eq!(created.repository.full_name, "octocat/hello-world");
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 4);
    assert!(requests[0].starts_with("POST /graphql HTTP/1.1"));
    assert!(requests[1].starts_with("POST /graphql HTTP/1.1"));
    let preflight = graphql_payload(&requests[0]);
    assert_eq!(
        preflight["variables"],
        serde_json::json!({
            "owner": "octocat",
            "repository": "hello-world",
            "issueNumber": 7
        })
    );
    let mutation = graphql_payload(&requests[1]);
    assert!(mutation["query"]
        .as_str()
        .is_some_and(|query| query.contains("parentIssueId: $parentIssueId")));
    assert_eq!(
        mutation["variables"],
        serde_json::json!({
            "repositoryId": "R_octocat_hello-world",
            "parentIssueId": "I_octocat_hello-world_7",
            "title": "Child work",
            "body": "Track the child work here."
        })
    );
    assert_rest_request(&requests[2], "/repos/octocat/hello-world/issues/42");
    assert_rest_request(&requests[3], "/repos/octocat/hello-world/issues/42/parent");
    assert!(!requests.iter().any(|request| {
        request.starts_with("POST /repos/octocat/hello-world/issues HTTP/1.1")
            || request.starts_with("POST /repos/octocat/hello-world/issues/7/sub_issues HTTP/1.1")
    }));
}

#[tokio::test]
async fn transport_rejects_missing_create_permission_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: preflight_response(false, true, "READ"),
    }])
    .await;

    let error = create_issue_sub_issue_with_client(&client, create_mutation())
        .await
        .expect_err("create permission is required");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubPermission(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_respects_the_blank_issue_creation_policy_before_writing() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: preflight_response(true, false, "READ"),
    }])
    .await;

    let error = create_issue_sub_issue_with_client(&client, create_mutation())
        .await
        .expect_err("blank Issue creation is disabled");
    server.await.expect("mock server");

    assert!(error.to_string().contains("blank Issues"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn transport_does_not_fallback_after_the_atomic_mutation_fails() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response(true, true, "WRITE"),
        },
        MockResponse {
            status: "500 Internal Server Error",
            headers: vec![],
            body: serde_json::json!({"message": "temporary failure"}).to_string(),
        },
    ])
    .await;

    create_issue_sub_issue_with_client(&client, create_mutation())
        .await
        .expect_err("failed mutation must remain failed");
    server.await.expect("mock server");

    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_rejects_an_unexpected_created_issue_before_postflight() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response(true, true, "WRITE"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: create_response("roadmap", 42),
        },
    ])
    .await;

    let error = create_issue_sub_issue_with_client(&client, create_mutation())
        .await
        .expect_err("unexpected repository must be rejected");
    server.await.expect("mock server");

    assert!(error.to_string().contains("unexpected identity"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_reports_an_unconfirmed_parent_relationship() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: preflight_response(true, true, "WRITE"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: create_response("hello-world", 42),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 42, "completed").to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_json("octocat", "hello-world", 8, "completed").to_string(),
        },
    ])
    .await;

    let error = create_issue_sub_issue_with_client(&client, create_mutation())
        .await
        .expect_err("the parent relationship must be confirmed");
    server.await.expect("mock server");

    assert!(error.to_string().contains("could not confirm"), "{error}");
    assert_eq!(requests.lock().expect("requests").len(), 4);
}
