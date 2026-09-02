use super::*;
use crate::error::AppError;
use crate::github::issue_related::test_support::{assert_rest_request, mock_github, MockResponse};

#[async_trait::async_trait]
impl GitHubIssueTypeClient for super::super::tests::FakeGitHubClient {
    async fn issue_types(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<Vec<GitHubIssueType>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(status(None, true).available_issue_types)
    }

    async fn issue_type_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(status(None, true))
    }

    async fn update_issue_type(
        &self,
        token: &str,
        mutation: IssueTypeMutation<'_>,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(mutation.expected_issue_node_id, "I_7");
        Ok(status(mutation.issue_type_node_id, true))
    }
}

fn status(current: Option<&str>, viewer_can_type: bool) -> GitHubIssueTypeStatus {
    GitHubIssueTypeStatus {
        repository_id: "R_1".to_string(),
        repository_full_name: "octocat/hello-world".to_string(),
        issue_node_id: "I_7".to_string(),
        issue_number: 7,
        current_issue_type: current.map(|node_id| GitHubIssueType {
            id: None,
            node_id: node_id.to_string(),
            name: "Bug".to_string(),
            description: Some("An unexpected problem".to_string()),
        }),
        available_issue_types: vec![GitHubIssueType {
            id: Some(410),
            node_id: "IT_bug".to_string(),
            name: "Bug".to_string(),
            description: Some("An unexpected problem".to_string()),
        }],
        viewer_can_type,
    }
}

#[test]
fn issue_type_payload_uses_the_official_mutation_and_nullable_id() {
    let payload = issue_type_update_payload("I_7", None);
    assert_eq!(payload["variables"]["issueId"], "I_7");
    assert!(payload["variables"]["issueTypeId"].is_null());
    assert!(payload["query"]
        .as_str()
        .expect("mutation")
        .contains("updateIssueIssueType"));
}

#[test]
fn issue_types_parse_numeric_and_graphql_identity_without_duplicates() {
    let values = serde_json::json!([
        {
            "id": 410,
            "node_id": "IT_bug",
            "name": "Bug",
            "description": "An unexpected problem"
        },
        {
            "id": 411,
            "node_id": "IT_task",
            "name": "Task",
            "description": null
        }
    ]);
    let parsed = issue_types_from_rest_value(values).expect("issue types");
    assert_eq!(parsed[0].id, Some(410));
    assert_eq!(parsed[0].node_id, "IT_bug");
    assert_eq!(parsed[1].description, None);
    assert!(issue_types_from_rest_value(serde_json::json!([
        {"id": 410, "node_id": "IT_bug", "name": "Bug"},
        {"id": 411, "node_id": "IT_bug", "name": "Task"}
    ]))
    .is_err());
}

#[test]
fn issue_type_preflight_rejects_stale_identity_permission_noop_and_unknown_type() {
    let current = status(Some("IT_bug"), true);
    let stale = IssueTypeMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_other",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: None,
    };
    assert!(matches!(
        ensure_issue_type_preflight(&current, stale),
        Err(AppError::GitHubIssueStateConflict(_))
    ));

    let denied = IssueTypeMutation {
        expected_issue_node_id: "I_7",
        issue_type_node_id: None,
        ..stale
    };
    assert!(matches!(
        ensure_issue_type_preflight(&status(Some("IT_bug"), false), denied),
        Err(AppError::GitHubPermission(_))
    ));

    let noop = IssueTypeMutation {
        expected_issue_node_id: "I_7",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: Some("IT_bug"),
        ..stale
    };
    assert!(matches!(
        ensure_issue_type_preflight(&current, noop),
        Err(AppError::Validation(_))
    ));

    let unknown = IssueTypeMutation {
        expected_issue_node_id: "I_7",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: Some("IT_unknown"),
        ..stale
    };
    assert!(matches!(
        ensure_issue_type_preflight(&current, unknown),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn issue_type_serialization_keeps_frontend_field_names() {
    let value = serde_json::to_value(status(None, true)).expect("status JSON");
    assert_eq!(value["repositoryId"], "R_1");
    assert_eq!(value["issueNodeId"], "I_7");
    assert_eq!(value["availableIssueTypes"][0]["nodeId"], "IT_bug");
    assert_eq!(value["viewerCanType"], true);
}

#[test]
fn issue_type_postflight_requires_the_selected_type_to_persist() {
    let status = status(Some("IT_bug"), true);
    let returned = IssueTypeIssue {
        id: "I_7".to_string(),
        number: 7,
        viewer_can_type: Some(true),
        issue_type: Some(IssueTypeNode {
            id: "IT_task".to_string(),
            name: "Task".to_string(),
            description: None,
        }),
        repository: Some(IssueTypeRepositoryIdentity {
            id: "R_1".to_string(),
            name_with_owner: "octocat/hello-world".to_string(),
        }),
    };
    let mutation = IssueTypeMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_7",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: Some("IT_task"),
    };
    assert!(matches!(
        ensure_issue_type_postflight(&status, &returned, mutation),
        Err(AppError::GitHub(_))
    ));
}

fn graphql_status_response(
    issue_type_id: &str,
    issue_type_name: &str,
    viewer_can_type: Option<bool>,
) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "issue": {
                    "id": "I_7",
                    "number": 7,
                    "viewerCanType": viewer_can_type,
                    "issueType": {
                        "id": issue_type_id,
                        "name": issue_type_name,
                        "description": null
                    }
                }
            }
        }
    })
    .to_string()
}

fn issue_types_response() -> String {
    serde_json::json!([
        {
            "id": 410,
            "node_id": "IT_bug",
            "name": "Bug",
            "description": "An unexpected problem"
        },
        {
            "id": 411,
            "node_id": "IT_task",
            "name": "Task",
            "description": null
        }
    ])
    .to_string()
}

fn graphql_update_response() -> String {
    serde_json::json!({
        "data": {
            "updateIssueIssueType": {
                "issue": {
                    "id": "I_7",
                    "number": 7,
                    "viewerCanType": true,
                    "issueType": {
                        "id": "IT_task",
                        "name": "Task",
                        "description": null
                    },
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

#[tokio::test]
async fn transport_updates_type_and_confirms_the_postflight_state() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: graphql_status_response("IT_bug", "Bug", Some(true)),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_types_response(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: graphql_update_response(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: graphql_status_response("IT_task", "Task", Some(true)),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_types_response(),
        },
    ])
    .await;
    let status = load_issue_type_status_with_client(&client, "octocat", "hello-world", 7)
        .await
        .expect("issue type status");
    let mutation = IssueTypeMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_7",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: Some("IT_task"),
    };
    let returned = execute_issue_type_update(&client, mutation, &status)
        .await
        .expect("issue type mutation");
    let postflight = load_issue_type_status_with_client(&client, "octocat", "hello-world", 7)
        .await
        .expect("postflight status");
    ensure_issue_type_postflight(&postflight, &returned, mutation).expect("confirmed type");
    server.await.expect("mock server");

    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 5);
    assert!(requests[0].contains("HarborIssueTypeStatus"));
    assert_rest_request(&requests[1], "/repos/octocat/hello-world/issue-types");
    assert!(requests[2].contains("HarborUpdateIssueType"));
    assert!(requests[3].contains("HarborIssueTypeStatus"));
    assert_rest_request(&requests[4], "/repos/octocat/hello-world/issue-types");
}

#[tokio::test]
async fn missing_issue_type_catalog_is_empty_for_personal_repositories() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "404 Not Found",
        headers: vec![],
        body: serde_json::json!({"message": "Not Found"}).to_string(),
    }])
    .await;

    let types = load_issue_types_with_client(&client, "octocat", "hello-world")
        .await
        .expect("unsupported issue types are empty");
    assert!(types.is_empty());
    server.await.expect("mock server");

    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 1);
    assert_rest_request(&requests[0], "/repos/octocat/hello-world/issue-types");
}

#[tokio::test]
async fn nullable_issue_type_capability_fails_closed() {
    let (client, _requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: graphql_status_response("IT_bug", "Bug", None),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: issue_types_response(),
        },
    ])
    .await;
    let status = load_issue_type_status_with_client(&client, "octocat", "hello-world", 7)
        .await
        .expect("issue type status");
    assert!(!status.viewer_can_type);
    server.await.expect("mock server");
}

#[tokio::test]
async fn issue_type_client_does_not_retry_transport_failures() {
    use std::time::Duration;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        time::timeout,
    };

    let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
    let address = listener.local_addr().expect("mock address");
    let server = tokio::spawn(async move {
        let mut request_count = 0;
        loop {
            let accepted = timeout(Duration::from_secs(2), listener.accept()).await;
            let Ok(Ok((mut stream, _))) = accepted else {
                break;
            };
            request_count += 1;
            let mut buffer = [0_u8; 4096];
            let _ = timeout(Duration::from_secs(1), stream.read(&mut buffer)).await;
            let response =
                "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            stream
                .write_all(response.as_bytes())
                .await
                .expect("mock write");
        }
        request_count
    });
    let client = issue_type_client_with_base(
        "github-user-access-token",
        Some(&format!("http://{address}")),
    )
    .expect("no-retry client");
    let payload = serde_json::json!({
        "query": "query HarborRetryProbe { viewer { login } }",
        "variables": {},
    });
    let result: Result<serde_json::Value, _> = client.graphql(&payload).await;
    assert!(result.is_err());
    assert_eq!(server.await.expect("mock server"), 1);
}

#[test]
fn issue_type_postflight_preserves_permission_and_rate_limit_errors() {
    let permission = post_write_error(
        AppError::GitHubPermission("write access required".to_string()),
        7,
    );
    assert!(matches!(permission, AppError::GitHubPermission(_)));

    let rate_limit = post_write_error(
        AppError::GitHubRateLimited("secondary limit".to_string()),
        7,
    );
    assert!(matches!(rate_limit, AppError::GitHubRateLimited(_)));

    let transport = post_write_error(AppError::GitHub("connection reset".to_string()), 7);
    assert!(matches!(transport, AppError::GitHub(message) if message.contains("Issue #7")));
}
