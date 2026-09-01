use super::*;
use crate::github::issue_related::test_support::{mock_github, MockResponse};

#[async_trait]
impl GitHubIssueCloneClient for super::super::tests::FakeGitHubClient {
    async fn issue_clone_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueCloneStatus, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(GitHubIssueCloneStatus {
            repository_id: "R_1".to_string(),
            repository_full_name: "octocat/hello-world".to_string(),
            issue_node_id: "I_7".to_string(),
            issue_number: 7,
            title: "Current Issue".to_string(),
            body: Some("Current body".to_string()),
            source_open: true,
            destination_allows_blank_issues: true,
            viewer_can_clone: true,
        })
    }

    async fn clone_issue(
        &self,
        token: &str,
        mutation: IssueCloneMutation<'_>,
    ) -> Result<GitHubIssueClone, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                mutation.owner,
                mutation.repository,
                mutation.issue_number,
                mutation.expected_issue_node_id,
                mutation.title,
                mutation.body,
            ),
            (
                "octocat",
                "hello-world",
                7,
                "I_7",
                "Cloned Issue",
                "Cloned body",
            )
        );
        Ok(GitHubIssueClone {
            repository_id: "R_1".to_string(),
            repository_full_name: "octocat/hello-world".to_string(),
            source_issue_node_id: "I_7".to_string(),
            source_issue_number: 7,
            target_issue_node_id: "I_8".to_string(),
            target_issue_number: 8,
            target_issue_url: "https://github.com/octocat/hello-world/issues/8".to_string(),
        })
    }
}

#[test]
fn clone_queries_use_the_current_issue_and_repository_contract() {
    assert!(ISSUE_CLONE_STATUS_QUERY.contains("viewerCanCreateIssues"));
    assert!(ISSUE_CLONE_STATUS_QUERY.contains("isBlankIssuesEnabled"));
    assert!(ISSUE_CLONE_STATUS_QUERY.contains("issue(number: $issueNumber)"));
    assert!(CREATE_ISSUE_CLONE_MUTATION.contains("createIssue"));
    assert!(CREATE_ISSUE_CLONE_MUTATION.contains("repositoryId: $repositoryId"));
    assert!(ISSUE_CLONE_POSTFLIGHT_QUERY.contains("node(id: $issueId)"));
}

#[test]
fn clone_preflight_requires_open_source_blank_issues_and_triage_access() {
    let mutation = IssueCloneMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_7",
        title: "Cloned Issue",
        body: "Cloned body",
    };
    let status = GitHubIssueCloneStatus {
        repository_id: "R_1".to_string(),
        repository_full_name: "octocat/hello-world".to_string(),
        issue_node_id: "I_7".to_string(),
        issue_number: 7,
        title: "Current Issue".to_string(),
        body: Some("Current body".to_string()),
        source_open: true,
        destination_allows_blank_issues: true,
        viewer_can_clone: true,
    };
    assert!(ensure_clone_preflight(&status, mutation).is_ok());

    let mut closed = status.clone();
    closed.source_open = false;
    assert!(matches!(
        ensure_clone_preflight(&closed, mutation),
        Err(AppError::Validation(message)) if message.contains("open Issues")
    ));

    let mut denied = status.clone();
    denied.viewer_can_clone = false;
    assert!(matches!(
        ensure_clone_preflight(&denied, mutation),
        Err(AppError::GitHubPermission(_))
    ));
}

#[test]
fn created_clone_identity_and_content_are_verified() {
    let status = GitHubIssueCloneStatus {
        repository_id: "R_1".to_string(),
        repository_full_name: "octocat/hello-world".to_string(),
        issue_node_id: "I_7".to_string(),
        issue_number: 7,
        title: "Current Issue".to_string(),
        body: Some("Current body".to_string()),
        source_open: true,
        destination_allows_blank_issues: true,
        viewer_can_clone: true,
    };
    let mutation = IssueCloneMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_7",
        title: "Cloned Issue",
        body: "Cloned body",
    };
    let created = ClonedIssue {
        id: "I_8".to_string(),
        number: 8,
        title: "Cloned Issue".to_string(),
        body: Some("Cloned body".to_string()),
        url: "https://github.com/octocat/hello-world/issues/8".to_string(),
        state: "OPEN".to_string(),
        repository: IssueCloneRepositoryIdentity {
            id: "R_1".to_string(),
            name_with_owner: "octocat/hello-world".to_string(),
        },
    };
    let clone = validate_created_identity(&created, &status, mutation).expect("created clone");
    assert_eq!(clone.target_issue_number, 8);
    assert!(ensure_clone_postflight(&created, &clone, mutation, &status).is_ok());

    let mut mismatched = created;
    mismatched.title = "Unexpected".to_string();
    assert!(ensure_clone_postflight(&mismatched, &clone, mutation, &status).is_err());
}

#[tokio::test]
async fn fake_client_keeps_clone_arguments_and_result_bounded() {
    let client = super::super::tests::FakeGitHubClient;
    let status = client
        .issue_clone_status("github-user-access-token", "octocat", "hello-world", 7)
        .await
        .expect("clone status");
    assert!(status.viewer_can_clone);
    let mutation = IssueCloneMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_7",
        title: "Cloned Issue",
        body: "Cloned body",
    };
    let cloned = client
        .clone_issue("github-user-access-token", mutation)
        .await
        .expect("clone result");
    assert_eq!(cloned.target_issue_number, 8);
}

fn status_response() -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "hasIssuesEnabled": true,
                "isBlankIssuesEnabled": true,
                "viewerCanCreateIssues": true,
                "viewerPermission": "TRIAGE",
                "issue": {
                    "id": "I_7",
                    "number": 7,
                    "title": "Current Issue",
                    "body": "Current body",
                    "state": "OPEN",
                    "repository": { "id": "R_1", "nameWithOwner": "octocat/hello-world" }
                }
            }
        }
    })
    .to_string()
}

fn created_response() -> String {
    serde_json::json!({
        "data": {
            "createIssue": {
                "issue": {
                    "id": "I_8",
                    "number": 8,
                    "title": "Cloned Issue",
                    "body": "Cloned body",
                    "url": "https://github.com/octocat/hello-world/issues/8",
                    "state": "OPEN",
                    "repository": { "id": "R_1", "nameWithOwner": "octocat/hello-world" }
                }
            }
        }
    })
    .to_string()
}

fn postflight_response() -> String {
    serde_json::json!({
        "data": {
            "node": {
                "__typename": "Issue",
                "id": "I_8",
                "number": 8,
                "title": "Cloned Issue",
                "body": "Cloned body",
                "url": "https://github.com/octocat/hello-world/issues/8",
                "state": "OPEN",
                "repository": { "id": "R_1", "nameWithOwner": "octocat/hello-world" }
            }
        }
    })
    .to_string()
}

#[tokio::test]
async fn transport_clones_an_authoritative_issue_and_confirms_identity_and_content() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: status_response(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: created_response(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: postflight_response(),
        },
    ])
    .await;
    let status = load_issue_clone_status_with_client(&client, "octocat", "hello-world", 7)
        .await
        .expect("clone status");
    let mutation = IssueCloneMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_7",
        title: "Cloned Issue",
        body: "Cloned body",
    };
    let cloned = execute_clone(&client, mutation, &status)
        .await
        .expect("created clone");
    let postflight = load_issue_clone_postflight(&client, &cloned.target_issue_node_id)
        .await
        .expect("clone postflight");
    ensure_clone_postflight(&postflight, &cloned, mutation, &status).expect("confirmed clone");
    server.await.expect("mock server");

    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 3);
    assert!(requests[0].contains("HarborIssueCloneStatus"));
    assert!(requests[1].contains("HarborCloneIssue"));
    assert!(requests[2].contains("HarborIssueClonePostflight"));
}

#[tokio::test]
async fn issue_clone_client_does_not_retry_transport_failures() {
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
    let client = issue_clone_client_with_base(
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
