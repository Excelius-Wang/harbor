use std::sync::{Arc, Mutex};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

use super::*;

struct MockResponse {
    status: &'static str,
    body: String,
}

async fn read_request(stream: &mut TcpStream) -> String {
    let mut buffer = Vec::new();
    loop {
        let mut chunk = [0_u8; 1024];
        let read = stream.read(&mut chunk).await.expect("mock read");
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(header_end) = buffer.windows(4).position(|part| part == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&buffer[..header_end]);
            let content_length = headers.lines().find_map(|line| {
                line.split_once(':').and_then(|(name, value)| {
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
            });
            if buffer.len() >= header_end + 4 + content_length.unwrap_or(0) {
                break;
            }
        }
    }
    String::from_utf8(buffer).expect("request utf8")
}

async fn write_response(stream: &mut TcpStream, response: &MockResponse) {
    let payload = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response.status,
        response.body.len(),
        response.body
    );
    stream
        .write_all(payload.as_bytes())
        .await
        .expect("mock write");
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
            let request = read_request(&mut stream).await;
            captured.lock().expect("request lock").push(request);
            write_response(&mut stream, &response).await;
        }
    });
    let base_uri = format!("http://{address}");
    let client =
        build_issue_state_client("github-user-access-token", Some(&base_uri)).expect("mock client");
    (client, requests, server)
}

async fn retry_probe_github() -> (
    octocrab::Octocrab,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
    let address = listener.local_addr().expect("mock address");
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&requests);
    let server = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.expect("mock accept");
            let request = read_request(&mut stream).await;
            let request_number = {
                let mut requests = captured.lock().expect("request lock");
                requests.push(request);
                requests.len()
            };
            let response = match request_number {
                1 => response(
                    "200 OK",
                    issue_json("open", None, "2026-08-30T08:00:00Z", false),
                ),
                2 => response(
                    "200 OK",
                    capability_json("OPEN", None, "2026-08-30T08:00:00Z", true, false),
                ),
                _ => response(
                    "503 Service Unavailable",
                    serde_json::json!({"message": "temporary failure"}).to_string(),
                ),
            };
            write_response(&mut stream, &response).await;
        }
    });
    let base_uri = format!("http://{address}");
    let client = build_issue_state_client("github-user-access-token", Some(&base_uri))
        .expect("retry probe client");
    (client, requests, server)
}

fn author_json() -> serde_json::Value {
    serde_json::json!({
        "login": "octocat",
        "id": 1,
        "node_id": "U_1",
        "avatar_url": "https://github.com/octocat.png",
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
    })
}

fn issue_json(
    state: &str,
    state_reason: Option<&str>,
    updated_at: &str,
    pull_request: bool,
) -> String {
    serde_json::json!({
        "id": 7,
        "node_id": "I_7",
        "url": "https://api.github.com/repos/octocat/hello-world/issues/7",
        "repository_url": "https://api.github.com/repos/octocat/hello-world",
        "labels_url": "https://api.github.com/repos/octocat/hello-world/issues/7/labels{/name}",
        "comments_url": "https://api.github.com/repos/octocat/hello-world/issues/7/comments",
        "events_url": "https://api.github.com/repos/octocat/hello-world/issues/7/events",
        "html_url": "https://github.com/octocat/hello-world/issues/7",
        "number": 7,
        "state": state,
        "state_reason": state_reason,
        "title": "Keep the example focused",
        "body": "Issue body",
        "user": author_json(),
        "labels": [],
        "assignee": null,
        "assignees": [],
        "milestone": null,
        "locked": false,
        "comments": 2,
        "pull_request": pull_request.then(|| serde_json::json!({
            "url": "https://api.github.com/repos/octocat/hello-world/pulls/7",
            "html_url": "https://github.com/octocat/hello-world/pull/7",
            "diff_url": "https://github.com/octocat/hello-world/pull/7.diff",
            "patch_url": "https://github.com/octocat/hello-world/pull/7.patch"
        })),
        "closed_at": (state == "closed").then_some("2026-08-30T08:01:00Z"),
        "created_at": "2026-08-24T08:00:00Z",
        "updated_at": updated_at
    })
    .to_string()
}

fn capability_json(
    state: &str,
    state_reason: Option<&str>,
    updated_at: &str,
    viewer_can_close: bool,
    viewer_can_reopen: bool,
) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "issue": {
                    "id": "I_7",
                    "number": 7,
                    "state": state,
                    "stateReason": state_reason,
                    "updatedAt": updated_at,
                    "viewerCanClose": viewer_can_close,
                    "viewerCanReopen": viewer_can_reopen,
                    "viewerCanUpdate": true
                }
            }
        }
    })
    .to_string()
}

fn mutation(
    expected_state: GitHubIssueState,
    expected_reason: Option<&str>,
    desired_state: GitHubIssueState,
    close_reason: Option<GitHubIssueCloseReason>,
) -> GitHubIssueStateMutation {
    GitHubIssueStateMutation {
        desired_state,
        close_reason,
        expected: GitHubIssueStateExpectation {
            issue_id: 7,
            issue_node_id: "I_7".to_string(),
            state: expected_state,
            state_reason: expected_reason.map(GitHubIssueStateReason::new),
            updated_at: "2026-08-30T08:00:00Z".to_string(),
        },
    }
}

fn response(status: &'static str, body: String) -> MockResponse {
    MockResponse { status, body }
}

fn assert_rest_request(request: &str, method: &str) {
    assert!(request.starts_with(&format!(
        "{method} /repos/octocat/hello-world/issues/7 HTTP/1.1"
    )));
    let lowercase = request.to_ascii_lowercase();
    assert!(lowercase.contains("accept: application/vnd.github+json"));
    assert!(lowercase.contains("x-github-api-version: 2026-03-10"));
}

fn request_json(request: &str) -> serde_json::Value {
    let (_, body) = request.split_once("\r\n\r\n").expect("request body");
    serde_json::from_str(body).expect("request json")
}

#[test]
fn state_payloads_are_exact_and_no_op_transitions_are_rejected() {
    let completed = mutation(
        GitHubIssueState::Open,
        None,
        GitHubIssueState::Closed,
        Some(GitHubIssueCloseReason::Completed),
    );
    let not_planned = mutation(
        GitHubIssueState::Open,
        None,
        GitHubIssueState::Closed,
        Some(GitHubIssueCloseReason::NotPlanned),
    );
    let reopened = mutation(
        GitHubIssueState::Closed,
        Some("duplicate"),
        GitHubIssueState::Open,
        None,
    );

    assert_eq!(
        serde_json::to_value(IssueStatePayload::from_mutation(&completed).expect("completed"))
            .expect("payload"),
        serde_json::json!({"state": "closed", "state_reason": "completed"})
    );
    assert_eq!(
        serde_json::to_value(IssueStatePayload::from_mutation(&not_planned).expect("not planned"))
            .expect("payload"),
        serde_json::json!({"state": "closed", "state_reason": "not_planned"})
    );
    assert_eq!(
        serde_json::to_value(IssueStatePayload::from_mutation(&reopened).expect("reopened"))
            .expect("payload"),
        serde_json::json!({"state": "open", "state_reason": "reopened"})
    );

    let mut no_op = completed;
    no_op.expected.state = GitHubIssueState::Closed;
    assert!(matches!(
        validate_mutation(&no_op),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn unknown_rest_state_reasons_remain_readable() {
    let raw = issue_json(
        "closed",
        Some("future_reason"),
        "2026-08-30T08:01:00Z",
        false,
    );

    let issue = issue_from_rest(rest_issue_from_slice(raw.as_bytes()).expect("future reason"));

    assert_eq!(issue.state, GitHubIssueState::Closed);
    assert_eq!(issue.state_reason.as_deref(), Some("future_reason"));
    assert_eq!(
        serde_json::to_value(issue.state_reason).expect("serialize reason"),
        serde_json::json!("future_reason")
    );
}

#[test]
fn malformed_or_cross_repository_capabilities_are_rejected() {
    let missing: IssueStateCapabilitiesQuery =
        serde_json::from_value(serde_json::json!({"repository": null})).expect("missing fixture");
    assert!(capability_from_graphql(missing, "octocat", "hello-world", 7).is_err());

    let wrong_repository: IssueStateCapabilitiesQuery = serde_json::from_value(
        serde_json::from_str::<serde_json::Value>(&capability_json(
            "OPEN",
            None,
            "2026-08-30T08:00:00Z",
            true,
            false,
        ))
        .expect("capability fixture")["data"]
            .clone(),
    )
    .expect("capability data");
    let mut wrong_repository = wrong_repository;
    wrong_repository
        .repository
        .as_mut()
        .expect("repository")
        .name_with_owner = "octocat/other".to_string();
    assert!(capability_from_graphql(wrong_repository, "octocat", "hello-world", 7).is_err());

    let null_issue: IssueStateCapabilitiesQuery = serde_json::from_value(serde_json::json!({
        "repository": {
            "id": "R_1",
            "nameWithOwner": "octocat/hello-world",
            "issue": null
        }
    }))
    .expect("null Issue fixture");
    assert!(capability_from_graphql(null_issue, "octocat", "hello-world", 7).is_err());
}

#[test]
fn rest_preflight_rejects_every_stale_identity_and_revision_guard() {
    for case in [
        "state reason",
        "updated timestamp",
        "numeric id",
        "node id",
        "number",
    ] {
        let issue = rest_issue_from_slice(
            issue_json("open", None, "2026-08-30T08:00:00Z", false).as_bytes(),
        )
        .expect("Issue fixture");
        let mut expected = mutation(
            GitHubIssueState::Open,
            None,
            GitHubIssueState::Closed,
            Some(GitHubIssueCloseReason::Completed),
        )
        .expected;
        let requested_number = match case {
            "state reason" => {
                expected.state_reason = Some(GitHubIssueStateReason::new("completed"));
                7
            }
            "updated timestamp" => {
                expected.updated_at = "2026-08-30T08:00:01Z".to_string();
                7
            }
            "numeric id" => {
                expected.issue_id = 8;
                7
            }
            "node id" => {
                expected.issue_node_id = "I_8".to_string();
                7
            }
            "number" => 8,
            _ => unreachable!(),
        };

        assert!(
            matches!(
                ensure_rest_preflight(
                    &issue,
                    "octocat",
                    "hello-world",
                    requested_number,
                    &expected
                ),
                Err(AppError::GitHubIssueStateConflict(_))
            ),
            "{case} must stop before the write"
        );
    }
}

#[test]
fn malformed_rest_identity_is_not_accepted_as_an_issue() {
    for field in ["id", "node_id", "number", "url"] {
        let mut value: serde_json::Value =
            serde_json::from_str(&issue_json("open", None, "2026-08-30T08:00:00Z", false))
                .expect("Issue fixture");
        value[field] = serde_json::Value::Null;

        assert!(
            rest_issue_from_value(value).is_err(),
            "null {field} must fail"
        );
    }
}

#[tokio::test]
async fn close_as_not_planned_uses_the_exact_guarded_contract() {
    let (client, requests, server) = mock_github(vec![
        response(
            "200 OK",
            issue_json("open", None, "2026-08-30T08:00:00Z", false),
        ),
        response(
            "200 OK",
            capability_json("OPEN", None, "2026-08-30T08:00:00Z", true, false),
        ),
        response(
            "200 OK",
            issue_json("closed", Some("not_planned"), "2026-08-30T08:01:00Z", false),
        ),
        response(
            "200 OK",
            issue_json("closed", Some("not_planned"), "2026-08-30T08:01:00Z", false),
        ),
    ])
    .await;

    let issue = update_issue_state_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        &mutation(
            GitHubIssueState::Open,
            None,
            GitHubIssueState::Closed,
            Some(GitHubIssueCloseReason::NotPlanned),
        ),
    )
    .await
    .expect("close Issue");
    server.await.expect("mock server");

    assert_eq!(issue.state, GitHubIssueState::Closed);
    assert_eq!(issue.state_reason.as_deref(), Some("notPlanned"));
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 4);
    assert_rest_request(&requests[0], "GET");
    assert!(requests[1].starts_with("POST /graphql HTTP/1.1"));
    assert_eq!(request_json(&requests[1])["variables"]["number"], 7);
    assert_rest_request(&requests[2], "PATCH");
    assert_eq!(
        request_json(&requests[2]),
        serde_json::json!({"state": "closed", "state_reason": "not_planned"})
    );
    assert_rest_request(&requests[3], "GET");
}

#[tokio::test]
async fn close_as_completed_runs_the_full_read_capability_write_postflight_sequence() {
    let (client, requests, server) = mock_github(vec![
        response(
            "200 OK",
            issue_json("open", None, "2026-08-30T08:00:00Z", false),
        ),
        response(
            "200 OK",
            capability_json("OPEN", None, "2026-08-30T08:00:00Z", true, false),
        ),
        response(
            "200 OK",
            issue_json("closed", Some("completed"), "2026-08-30T08:01:00Z", false),
        ),
        response(
            "200 OK",
            issue_json("closed", Some("completed"), "2026-08-30T08:01:00Z", false),
        ),
    ])
    .await;

    update_issue_state_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        &mutation(
            GitHubIssueState::Open,
            None,
            GitHubIssueState::Closed,
            Some(GitHubIssueCloseReason::Completed),
        ),
    )
    .await
    .expect("close completed");
    server.await.expect("mock server");

    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 4);
    assert_rest_request(&requests[0], "GET");
    assert!(requests[1].starts_with("POST /graphql HTTP/1.1"));
    assert_rest_request(&requests[2], "PATCH");
    assert_eq!(
        request_json(&requests[2]),
        serde_json::json!({"state": "closed", "state_reason": "completed"})
    );
    assert_rest_request(&requests[3], "GET");
}

#[tokio::test]
async fn mismatched_patch_response_stops_before_postflight() {
    let (client, requests, server) = mock_github(vec![
        response(
            "200 OK",
            issue_json("open", None, "2026-08-30T08:00:00Z", false),
        ),
        response(
            "200 OK",
            capability_json("OPEN", None, "2026-08-30T08:00:00Z", true, false),
        ),
        response(
            "200 OK",
            issue_json("closed", Some("not_planned"), "2026-08-30T08:01:00Z", false),
        ),
    ])
    .await;

    let error = update_issue_state_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        &mutation(
            GitHubIssueState::Open,
            None,
            GitHubIssueState::Closed,
            Some(GitHubIssueCloseReason::Completed),
        ),
    )
    .await
    .expect_err("mismatched PATCH response");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 3);
}

#[tokio::test]
async fn reopening_a_duplicate_does_not_send_duplicate_fields() {
    let (client, requests, server) = mock_github(vec![
        response(
            "200 OK",
            issue_json("closed", Some("duplicate"), "2026-08-30T08:00:00Z", false),
        ),
        response(
            "200 OK",
            capability_json(
                "CLOSED",
                Some("DUPLICATE"),
                "2026-08-30T08:00:00Z",
                false,
                true,
            ),
        ),
        response(
            "200 OK",
            issue_json("open", Some("reopened"), "2026-08-30T08:01:00Z", false),
        ),
        response(
            "200 OK",
            issue_json("open", Some("reopened"), "2026-08-30T08:01:00Z", false),
        ),
    ])
    .await;

    update_issue_state_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        &mutation(
            GitHubIssueState::Closed,
            Some("duplicate"),
            GitHubIssueState::Open,
            None,
        ),
    )
    .await
    .expect("reopen Issue");
    server.await.expect("mock server");

    let requests = requests.lock().expect("requests");
    assert_eq!(
        request_json(&requests[2]),
        serde_json::json!({"state": "open", "state_reason": "reopened"})
    );
}

#[tokio::test]
async fn public_capabilities_preserve_duplicate_and_viewer_permissions() {
    let (client, requests, server) = mock_github(vec![response(
        "200 OK",
        capability_json(
            "CLOSED",
            Some("DUPLICATE"),
            "2026-08-30T08:00:00Z",
            false,
            true,
        ),
    )])
    .await;

    let capability = issue_state_capabilities_with_client(&client, "octocat", "hello-world", 7)
        .await
        .expect("Issue capability");
    server.await.expect("mock server");

    assert_eq!(capability.state_reason.as_deref(), Some("duplicate"));
    assert!(!capability.viewer_can_close);
    assert!(capability.viewer_can_reopen);
    let requests = requests.lock().expect("requests");
    let request = request_json(&requests[0]);
    assert_eq!(request["variables"]["owner"], "octocat");
    assert_eq!(request["variables"]["repository"], "hello-world");
    let query = request["query"].as_str().expect("capability query");
    assert!(query.contains("stateReason(enableDuplicate: true)"));
    assert!(query.contains("viewerCanClose"));
    assert!(query.contains("viewerCanReopen"));
    assert!(query.contains("viewerCanUpdate"));
}

#[tokio::test]
async fn stale_state_stops_before_capability_and_patch_requests() {
    let (client, requests, server) = mock_github(vec![response(
        "200 OK",
        issue_json("closed", Some("completed"), "2026-08-30T08:01:00Z", false),
    )])
    .await;

    let error = update_issue_state_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        &mutation(
            GitHubIssueState::Open,
            None,
            GitHubIssueState::Closed,
            Some(GitHubIssueCloseReason::Completed),
        ),
    )
    .await
    .expect_err("stale state");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn viewer_capability_and_issue_shape_are_enforced_before_patch() {
    let (client, requests, server) = mock_github(vec![
        response(
            "200 OK",
            issue_json("open", None, "2026-08-30T08:00:00Z", false),
        ),
        response(
            "200 OK",
            capability_json("OPEN", None, "2026-08-30T08:00:00Z", false, false),
        ),
    ])
    .await;
    let close = mutation(
        GitHubIssueState::Open,
        None,
        GitHubIssueState::Closed,
        Some(GitHubIssueCloseReason::Completed),
    );

    let error = update_issue_state_with_client(&client, "octocat", "hello-world", 7, &close)
        .await
        .expect_err("viewer cannot close");
    server.await.expect("mock server");
    assert!(matches!(error, AppError::GitHubPermission(_)));
    assert_eq!(requests.lock().expect("requests").len(), 2);

    let (client, requests, server) = mock_github(vec![response(
        "200 OK",
        issue_json("open", None, "2026-08-30T08:00:00Z", true),
    )])
    .await;
    let error = update_issue_state_with_client(&client, "octocat", "hello-world", 7, &close)
        .await
        .expect_err("pull request shape");
    server.await.expect("mock server");
    assert!(matches!(error, AppError::GitHubIssueStateConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn postflight_mismatch_reports_that_the_write_may_have_persisted() {
    let (client, requests, server) = mock_github(vec![
        response(
            "200 OK",
            issue_json("open", None, "2026-08-30T08:00:00Z", false),
        ),
        response(
            "200 OK",
            capability_json("OPEN", None, "2026-08-30T08:00:00Z", true, false),
        ),
        response(
            "200 OK",
            issue_json("closed", Some("completed"), "2026-08-30T08:01:00Z", false),
        ),
        response(
            "200 OK",
            issue_json("open", Some("reopened"), "2026-08-30T08:02:00Z", false),
        ),
    ])
    .await;

    let error = update_issue_state_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        &mutation(
            GitHubIssueState::Open,
            None,
            GitHubIssueState::Closed,
            Some(GitHubIssueCloseReason::Completed),
        ),
    )
    .await
    .expect_err("postflight conflict");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubIssueStateConflict(message) if message.contains("may have persisted")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 4);
}

#[tokio::test]
async fn documented_write_statuses_keep_stable_error_categories() {
    for (status, expected_code) in [
        ("301 Moved Permanently", "moved"),
        ("403 Forbidden", "permission"),
        ("404 Not Found", "conflict"),
        ("410 Gone", "conflict"),
        ("422 Unprocessable Entity", "validation"),
        ("429 Too Many Requests", "rate"),
        ("503 Service Unavailable", "github"),
    ] {
        let (client, requests, server) = mock_github(vec![
            response(
                "200 OK",
                issue_json("open", None, "2026-08-30T08:00:00Z", false),
            ),
            response(
                "200 OK",
                capability_json("OPEN", None, "2026-08-30T08:00:00Z", true, false),
            ),
            response(
                status,
                serde_json::json!({"message": format!("Issue state {expected_code}")}).to_string(),
            ),
        ])
        .await;

        let error = update_issue_state_with_client(
            &client,
            "octocat",
            "hello-world",
            7,
            &mutation(
                GitHubIssueState::Open,
                None,
                GitHubIssueState::Closed,
                Some(GitHubIssueCloseReason::Completed),
            ),
        )
        .await
        .expect_err(status);
        server.await.expect("mock server");
        assert_eq!(requests.lock().expect("requests").len(), 3);

        assert!(
            match expected_code {
                "moved" => matches!(error, AppError::GitHubIssueMoved(_)),
                "permission" => matches!(error, AppError::GitHubPermission(_)),
                "conflict" => matches!(error, AppError::GitHubIssueStateConflict(_)),
                "validation" => matches!(error, AppError::Validation(_)),
                "rate" => matches!(error, AppError::GitHubRateLimited(_)),
                "github" => matches!(error, AppError::GitHub(_)),
                _ => false,
            },
            "{status} mapped to {error:?}"
        );
    }
}

#[tokio::test]
async fn production_issue_state_client_never_retries_a_failed_patch() {
    let (client, requests, server) = retry_probe_github().await;

    let error = update_issue_state_with_client(
        &client,
        "octocat",
        "hello-world",
        7,
        &mutation(
            GitHubIssueState::Open,
            None,
            GitHubIssueState::Closed,
            Some(GitHubIssueCloseReason::Completed),
        ),
    )
    .await
    .expect_err("503 must fail without retrying the write");

    server.abort();
    let requests = requests.lock().expect("requests");
    assert!(matches!(error, AppError::GitHub(_)));
    assert_eq!(requests.len(), 3);
    assert_eq!(
        requests
            .iter()
            .filter(|request| request.starts_with("PATCH "))
            .count(),
        1
    );
}
