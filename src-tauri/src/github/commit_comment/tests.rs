use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::timeout,
};

use crate::github_oauth::GitHubOAuthCredentials;

use super::super::{CredentialStore, GitHubService};
use super::transport::{
    commit_comment_page_from_raw, commit_comment_route, commit_comments_route,
    create_commit_comment_with_client, list_commit_comments_with_client,
    mutate_commit_comment_with_client, mutate_commit_comment_with_clients,
    CommitCommentCapabilitiesQuery, RawCommitComment,
};
use super::{
    normalize_commit_comment_mutation, normalize_commit_comment_page, normalize_commit_comment_sha,
    GitHubCommitCommentGuard, GitHubCommitCommentMutation, GitHubCommitCommentPlacement,
};
use crate::github::GitHubCommentMinimizeClassifier;

struct SavedCredentialStore;

impl CredentialStore for SavedCredentialStore {
    fn load_github_credentials(
        &self,
    ) -> Result<Option<GitHubOAuthCredentials>, crate::error::AppError> {
        Ok(Some(GitHubOAuthCredentials {
            access_token: "github-user-access-token".to_string(),
            refresh_token: None,
            expires_at: None,
            scopes: vec!["repo".to_string()],
        }))
    }

    fn save_github_credentials(
        &self,
        _credentials: &GitHubOAuthCredentials,
    ) -> Result<(), crate::error::AppError> {
        Ok(())
    }

    fn delete_github_credentials(&self) -> Result<(), crate::error::AppError> {
        Ok(())
    }
}

#[test]
fn full_commit_sha_and_positive_page_are_required() {
    let sha = "a".repeat(40);
    assert_eq!(normalize_commit_comment_sha(&sha).expect("full SHA"), sha);
    assert_eq!(normalize_commit_comment_page(1).expect("first page"), 1);
    assert!(normalize_commit_comment_sha("abc1234").is_err());
    assert!(normalize_commit_comment_sha(&"g".repeat(40)).is_err());
    assert!(normalize_commit_comment_page(0).is_err());
}

fn comment_fixture(sha: &str) -> RawCommitComment {
    serde_json::from_value(serde_json::json!({
        "html_url": format!("https://github.com/octocat/hello-world/commit/{sha}#commitcomment-42"),
        "id": 42,
        "node_id": "CC_42",
        "body": "Keep this native",
        "path": "src/main.rs",
        "position": 7,
        "line": 14,
        "commit_id": sha,
        "user": null,
        "created_at": "2026-08-30T01:00:00Z",
        "updated_at": "2026-08-30T01:01:00Z",
        "author_association": "CONTRIBUTOR"
    }))
    .expect("commit comment fixture")
}

fn comment_api_json(sha: &str, body: &str, updated_at: &str) -> String {
    serde_json::json!({
        "html_url": format!("https://github.com/octocat/hello-world/commit/{sha}#commitcomment-42"),
        "id": 42,
        "node_id": "CC_42",
        "body": body,
        "path": "src/main.rs",
        "position": 7,
        "line": 14,
        "commit_id": sha,
        "user": { "login": "octocat", "avatar_url": null },
        "created_at": "2026-08-30T01:00:00Z",
        "updated_at": updated_at,
        "author_association": "OWNER"
    })
    .to_string()
}

fn general_comment_api_json(sha: &str, body: &str) -> String {
    let mut value: serde_json::Value =
        serde_json::from_str(&comment_api_json(sha, body, "2026-08-30T01:00:00Z"))
            .expect("general comment fixture");
    value["path"] = serde_json::Value::Null;
    value["position"] = serde_json::Value::Null;
    value["line"] = serde_json::Value::Null;
    value.to_string()
}

fn capability_api_json(sha: &str, updated_at: &str, can_update: bool, can_delete: bool) -> String {
    serde_json::json!({
        "data": {
            "repository": { "id": "R_1" },
            "nodes": [{
                "__typename": "CommitComment",
                "id": "CC_42",
                "updatedAt": updated_at,
                "viewerCanUpdate": can_update,
                "viewerCanDelete": can_delete,
                "isMinimized": false,
                "minimizedReason": null,
                "viewerCanMinimize": false,
                "viewerCanUnminimize": false,
                "repository": { "id": "R_1" },
                "commit": { "oid": sha }
            }]
        }
    })
    .to_string()
}

fn capability_api_json_with_minimize(
    sha: &str,
    updated_at: &str,
    is_minimized: bool,
    minimized_reason: Option<&str>,
    can_minimize: bool,
    can_unminimize: bool,
) -> String {
    serde_json::json!({
        "data": {
            "repository": { "id": "R_1" },
            "nodes": [{
                "__typename": "CommitComment",
                "id": "CC_42",
                "updatedAt": updated_at,
                "viewerCanUpdate": true,
                "viewerCanDelete": true,
                "isMinimized": is_minimized,
                "minimizedReason": minimized_reason,
                "viewerCanMinimize": can_minimize,
                "viewerCanUnminimize": can_unminimize,
                "repository": { "id": "R_1" },
                "commit": { "oid": sha }
            }]
        }
    })
    .to_string()
}

fn capability_fixture(sha: &str) -> CommitCommentCapabilitiesQuery {
    serde_json::from_value(serde_json::json!({
        "repository": { "id": "R_1" },
        "nodes": [{
            "__typename": "CommitComment",
            "id": "CC_42",
            "updatedAt": "2026-08-30T01:01:00Z",
            "viewerCanUpdate": true,
            "viewerCanDelete": false,
            "isMinimized": false,
            "minimizedReason": null,
            "viewerCanMinimize": true,
            "viewerCanUnminimize": false,
            "repository": { "id": "R_1" },
            "commit": { "oid": sha }
        }]
    }))
    .expect("capability fixture")
}

fn comment_guard(comment_id: u64) -> GitHubCommitCommentGuard {
    GitHubCommitCommentGuard {
        comment_id,
        comment_node_id: "CC_42".to_string(),
        expected_updated_at: "2026-08-30T01:01:00Z".to_string(),
    }
}

struct MockResponse {
    status: &'static str,
    headers: Vec<(&'static str, &'static str)>,
    body: String,
}

fn assert_rest_request(request: &str, method: &str, route: &str) {
    assert!(request.starts_with(&format!("{method} {route} HTTP/1.1")));
    let lowercase = request.to_ascii_lowercase();
    assert!(lowercase.contains("accept: application/vnd.github+json"));
    assert!(lowercase.contains("x-github-api-version: 2026-03-10"));
}

async fn mock_github(
    responses: Vec<MockResponse>,
) -> (
    octocrab::Octocrab,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
) {
    mock_github_with_retry_config(
        responses,
        octocrab::service::middleware::retry::RetryConfig::Simple(3),
    )
    .await
}

async fn mock_github_with_retry_config(
    responses: Vec<MockResponse>,
    retry_config: octocrab::service::middleware::retry::RetryConfig,
) -> (
    octocrab::Octocrab,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
) {
    let (client, requests, server, _) =
        mock_github_with_retry_config_and_address(responses, retry_config).await;
    (client, requests, server)
}

async fn mock_github_pair(
    responses: Vec<MockResponse>,
) -> (
    octocrab::Octocrab,
    octocrab::Octocrab,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
) {
    let (read_client, requests, server, base_uri) = mock_github_with_retry_config_and_address(
        responses,
        octocrab::service::middleware::retry::RetryConfig::Simple(3),
    )
    .await;
    let write_client = octocrab::Octocrab::builder()
        .base_uri(base_uri)
        .expect("no-retry mock base uri")
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("no-retry mock client");
    (read_client, write_client, requests, server)
}

async fn mock_github_with_retry_config_and_address(
    responses: Vec<MockResponse>,
    retry_config: octocrab::service::middleware::retry::RetryConfig,
) -> (
    octocrab::Octocrab,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
    String,
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
                if let Some(header_end) = buffer.windows(4).position(|window| window == b"\r\n\r\n")
                {
                    let headers = String::from_utf8_lossy(&buffer[..header_end]);
                    let content_length = headers.lines().find_map(|line| {
                        line.split_once(':').and_then(|(name, value)| {
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().ok())
                                .flatten()
                        })
                    });
                    let body_start = header_end + 4;
                    if buffer.len() >= body_start + content_length.unwrap_or(0) {
                        break;
                    }
                }
            }
            let request = String::from_utf8(buffer).expect("request utf8");
            captured.lock().expect("request lock").push(request.clone());
            let response_body = if response.body == "__ECHO_MINIMIZE_MUTATION__" {
                let request_body = request.split("\r\n\r\n").nth(1).expect("request body");
                let request_json = serde_json::from_str::<serde_json::Value>(request_body)
                    .expect("GraphQL request JSON");
                let client_mutation_id = request_json["variables"]["clientMutationId"]
                    .as_str()
                    .expect("client mutation ID");
                let mutation_name = if request_json["query"]
                    .as_str()
                    .expect("GraphQL query")
                    .contains("unminimizeComment")
                {
                    "unminimizeComment"
                } else {
                    "minimizeComment"
                };
                let mut data = serde_json::Map::new();
                data.insert(
                    mutation_name.to_string(),
                    serde_json::json!({ "clientMutationId": client_mutation_id }),
                );
                serde_json::json!({ "data": data }).to_string()
            } else {
                response.body
            };
            let extra_headers = response
                .headers
                .into_iter()
                .map(|(name, value)| format!("{name}: {value}\r\n"))
                .collect::<String>();
            let payload = format!(
                "HTTP/1.1 {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.status,
                extra_headers,
                response_body.len(),
                response_body
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
        .add_retry_config(retry_config)
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("mock client");
    (client, requests, server, format!("http://{address}"))
}

#[test]
fn comment_pages_keep_placement_deleted_authors_and_capabilities() {
    let sha = "a".repeat(40);
    let page = commit_comment_page_from_raw(
        vec![comment_fixture(&sha)],
        capability_fixture(&sha),
        &sha,
        2,
        true,
    )
    .expect("comment page");

    assert_eq!(page.page, 2);
    assert!(page.has_previous);
    assert!(page.has_more);
    let comment = &page.comments[0];
    assert_eq!(comment.database_id, 42);
    assert_eq!(comment.id, "CC_42");
    assert_eq!(comment.path.as_deref(), Some("src/main.rs"));
    assert_eq!(comment.position, Some(7));
    assert_eq!(comment.line, Some(14));
    assert!(comment.author.is_none());
    assert!(comment.viewer_can_update);
    assert!(!comment.viewer_can_delete);
    assert!(!comment.is_minimized);
    assert!(comment.viewer_can_minimize);
    assert!(!comment.viewer_can_unminimize);
}

#[test]
fn comment_pages_reject_mismatched_commit_repository_and_revision() {
    let sha = "a".repeat(40);
    let mut capabilities = capability_fixture(&sha);
    capabilities.nodes[0]
        .as_mut()
        .expect("comment capability")
        .repository
        .id = "R_2".to_string();
    assert!(commit_comment_page_from_raw(
        vec![comment_fixture(&sha)],
        capabilities,
        &sha,
        1,
        false,
    )
    .is_err());

    let mut wrong_commit = comment_fixture(&sha);
    wrong_commit.commit_id = "b".repeat(40);
    assert!(commit_comment_page_from_raw(
        vec![wrong_commit],
        capability_fixture(&sha),
        &sha,
        1,
        false,
    )
    .is_err());

    let mut changed = capability_fixture(&sha);
    changed.nodes[0]
        .as_mut()
        .expect("comment capability")
        .updated_at = "2026-08-30T01:02:00Z".to_string();
    assert!(
        commit_comment_page_from_raw(vec![comment_fixture(&sha)], changed, &sha, 1, false,)
            .is_err()
    );
}

#[test]
fn routes_match_githubs_commit_comment_endpoints() {
    let sha = "a".repeat(40);
    assert_eq!(
        commit_comments_route("octocat", "hello-world", &sha, 2),
        format!("/repos/octocat/hello-world/commits/{sha}/comments?per_page=100&page=2")
    );
    assert_eq!(
        commit_comment_route("octocat", "hello-world", 42),
        "/repos/octocat/hello-world/comments/42"
    );
}

#[tokio::test]
async fn list_transport_uses_rest_pagination_then_graphql_capabilities() {
    let sha = "a".repeat(40);
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![(
                "Link",
                "<https://api.github.com/repositories/1/commits/aaa/comments?page=2>; rel=\"next\"",
            )],
            body: serde_json::to_string(&vec![serde_json::json!({
                "html_url": format!("https://github.com/octocat/hello-world/commit/{sha}#commitcomment-42"),
                "id": 42,
                "node_id": "CC_42",
                "body": "Keep this native",
                "path": null,
                "position": null,
                "line": null,
                "commit_id": sha,
                "user": { "login": "octocat", "avatar_url": null },
                "created_at": "2026-08-30T01:00:00Z",
                "updated_at": "2026-08-30T01:01:00Z",
                "author_association": "OWNER"
            })])
            .expect("comments JSON"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": {
                    "repository": { "id": "R_1" },
                    "nodes": [{
                        "__typename": "CommitComment",
                        "id": "CC_42",
                        "updatedAt": "2026-08-30T01:01:00Z",
                        "viewerCanUpdate": true,
                        "viewerCanDelete": true,
                        "repository": { "id": "R_1" },
                        "commit": { "oid": sha }
                    }]
                }
            })
            .to_string(),
        },
    ])
    .await;

    let page = list_commit_comments_with_client(&client, "octocat", "hello-world", &sha, 1)
        .await
        .expect("comment page");
    server.await.expect("mock server");

    assert!(page.has_more);
    assert_eq!(page.comments[0].id, "CC_42");
    let requests = requests.lock().expect("requests");
    assert_rest_request(
        &requests[0],
        "GET",
        &format!("/repos/octocat/hello-world/commits/{sha}/comments?per_page=100&page=1"),
    );
    assert!(requests[1].starts_with("POST /graphql HTTP/1.1"));
    assert!(requests[1].contains("HarborCommitCommentCapabilities"));
}

#[tokio::test]
async fn empty_comment_page_does_not_send_an_unnecessary_graphql_request() {
    let sha = "a".repeat(40);
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: "[]".to_string(),
    }])
    .await;

    let page = list_commit_comments_with_client(&client, "octocat", "hello-world", &sha, 1)
        .await
        .expect("empty comment page");
    server.await.expect("mock server");

    assert!(page.comments.is_empty());
    assert_eq!(requests.lock().expect("requests").len(), 1);
}

#[tokio::test]
async fn create_transport_sends_position_without_deprecated_line() {
    let sha = "a".repeat(40);
    let response = serde_json::json!({
        "html_url": format!("https://github.com/octocat/hello-world/commit/{sha}#commitcomment-42"),
        "id": 42,
        "node_id": "CC_42",
        "body": "Comment on this line",
        "path": "src/main.rs",
        "position": 7,
        "line": 14,
        "commit_id": sha,
        "user": { "login": "octocat", "avatar_url": null },
        "created_at": "2026-08-30T01:00:00Z",
        "updated_at": "2026-08-30T01:00:00Z",
        "author_association": "OWNER"
    })
    .to_string();
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "201 Created",
        headers: vec![],
        body: response,
    }])
    .await;
    let mutation = GitHubCommitCommentMutation::Create {
        body: "Comment on this line".to_string(),
        placement: Some(GitHubCommitCommentPlacement {
            path: "src/main.rs".to_string(),
            position: 7,
        }),
    };

    let comment =
        create_commit_comment_with_client(&client, "octocat", "hello-world", &sha, &mutation)
            .await
            .expect("created comment");
    server.await.expect("mock server");

    assert_eq!(comment.position, Some(7));
    let request = &requests.lock().expect("requests")[0];
    assert_rest_request(
        request,
        "POST",
        &format!("/repos/octocat/hello-world/commits/{sha}/comments"),
    );
    let body = request.split("\r\n\r\n").nth(1).expect("request body");
    let body: serde_json::Value = serde_json::from_str(body).expect("request JSON");
    assert_eq!(body["path"], "src/main.rs");
    assert_eq!(body["position"], 7);
    assert!(body.get("line").is_none());
}

#[tokio::test]
async fn create_transport_omits_placement_for_a_commit_level_comment() {
    let sha = "a".repeat(40);
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "201 Created",
        headers: vec![],
        body: general_comment_api_json(&sha, "Comment on the commit"),
    }])
    .await;
    let mutation = GitHubCommitCommentMutation::Create {
        body: "Comment on the commit".to_string(),
        placement: None,
    };

    let comment =
        create_commit_comment_with_client(&client, "octocat", "hello-world", &sha, &mutation)
            .await
            .expect("created commit-level comment");
    server.await.expect("mock server");

    assert!(comment.path.is_none());
    assert!(comment.position.is_none());
    let request = &requests.lock().expect("requests")[0];
    assert_rest_request(
        request,
        "POST",
        &format!("/repos/octocat/hello-world/commits/{sha}/comments"),
    );
    let body = request.split("\r\n\r\n").nth(1).expect("request body");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(body).expect("request JSON"),
        serde_json::json!({ "body": "Comment on the commit" })
    );
}

#[tokio::test]
async fn create_transport_maps_validation_and_secondary_rate_limits() {
    let sha = "a".repeat(40);
    let mutation = GitHubCommitCommentMutation::Create {
        body: "Comment on this line".to_string(),
        placement: None,
    };
    let (validation_client, _, validation_server) = mock_github(vec![MockResponse {
        status: "422 Unprocessable Entity",
        headers: vec![],
        body: serde_json::json!({ "message": "Validation Failed" }).to_string(),
    }])
    .await;
    let validation_error = create_commit_comment_with_client(
        &validation_client,
        "octocat",
        "hello-world",
        &sha,
        &mutation,
    )
    .await
    .expect_err("invalid placement");
    validation_server.await.expect("validation server");
    assert!(matches!(
        validation_error,
        crate::error::AppError::Validation(_)
    ));

    let (rate_client, _, rate_server) = mock_github(vec![MockResponse {
        status: "403 Forbidden",
        headers: vec![],
        body: serde_json::json!({ "message": "You have exceeded a secondary rate limit." })
            .to_string(),
    }])
    .await;
    let rate_error =
        create_commit_comment_with_client(&rate_client, "octocat", "hello-world", &sha, &mutation)
            .await
            .expect_err("secondary rate limit");
    rate_server.await.expect("rate server");
    assert!(matches!(
        rate_error,
        crate::error::AppError::GitHubRateLimited(_)
    ));
}

#[test]
fn mutations_require_complete_placement_and_bounded_identity() {
    let create = normalize_commit_comment_mutation(GitHubCommitCommentMutation::Create {
        body: "  Markdown stays intact  ".to_string(),
        placement: Some(GitHubCommitCommentPlacement {
            path: " src\\main.rs ".to_string(),
            position: 7,
        }),
    })
    .expect("create mutation");
    assert!(matches!(
        create,
        GitHubCommitCommentMutation::Create {
            body,
            placement: Some(GitHubCommitCommentPlacement { path, position: 7 })
        } if body == "  Markdown stays intact  " && path == " src\\main.rs "
    ));
    assert!(
        normalize_commit_comment_mutation(GitHubCommitCommentMutation::Create {
            body: " ".to_string(),
            placement: None,
        })
        .is_err()
    );
    assert!(
        normalize_commit_comment_mutation(GitHubCommitCommentMutation::Create {
            body: "Body".to_string(),
            placement: Some(GitHubCommitCommentPlacement {
                path: "src/main.rs".to_string(),
                position: 0,
            }),
        })
        .is_err()
    );
    assert!(
        normalize_commit_comment_mutation(GitHubCommitCommentMutation::Create {
            body: "Body".to_string(),
            placement: Some(GitHubCommitCommentPlacement {
                path: "src/invalid\0name.rs".to_string(),
                position: 7,
            }),
        })
        .is_err()
    );
    assert!(
        normalize_commit_comment_mutation(GitHubCommitCommentMutation::Delete {
            guard: comment_guard(0),
        })
        .is_err()
    );
}

#[test]
fn mutation_guard_keeps_the_flat_tauri_contract() {
    let value = serde_json::json!({
        "action": "update",
        "commentId": 42,
        "commentNodeId": "CC_42",
        "expectedUpdatedAt": "2026-08-30T01:01:00Z",
        "body": "New body"
    });
    let mutation: GitHubCommitCommentMutation =
        serde_json::from_value(value.clone()).expect("flat mutation");
    assert!(matches!(
        &mutation,
        GitHubCommitCommentMutation::Update { guard, body }
            if guard == &comment_guard(42) && body == "New body"
    ));
    assert_eq!(
        serde_json::to_value(mutation).expect("flat mutation JSON"),
        value
    );
}

#[test]
fn minimize_mutation_keeps_the_flat_tauri_contract() {
    let value = serde_json::json!({
        "action": "minimize",
        "commentId": 42,
        "commentNodeId": "CC_42",
        "expectedUpdatedAt": "2026-08-30T01:01:00Z",
        "expectedMinimized": false,
        "classifier": "offTopic"
    });
    let mutation: GitHubCommitCommentMutation =
        serde_json::from_value(value.clone()).expect("flat minimize mutation");
    assert!(matches!(
        &mutation,
        GitHubCommitCommentMutation::Minimize {
            guard,
            expected_minimized: false,
            classifier: GitHubCommentMinimizeClassifier::OffTopic,
        } if guard == &comment_guard(42)
    ));
    assert_eq!(
        serde_json::to_value(mutation).expect("flat mutation JSON"),
        value
    );
}

#[test]
fn minimize_mutation_requires_the_expected_current_state_and_capability() {
    let sha = "a".repeat(40);
    let mutation = GitHubCommitCommentMutation::Minimize {
        guard: comment_guard(42),
        expected_minimized: false,
        classifier: GitHubCommentMinimizeClassifier::OffTopic,
    };
    let mut capabilities = capability_fixture(&sha);
    capabilities.nodes[0]
        .as_mut()
        .expect("comment capability")
        .viewer_can_minimize = false;
    let comment =
        commit_comment_page_from_raw(vec![comment_fixture(&sha)], capabilities, &sha, 1, false)
            .expect("comment page")
            .comments
            .into_iter()
            .next()
            .expect("comment");
    assert!(matches!(
        super::transport::ensure_comment_mutation_allowed_for_test(&comment, &mutation),
        Err(crate::error::AppError::GitHubPermission(_))
    ));

    capabilities = serde_json::from_value(serde_json::json!({
        "repository": { "id": "R_1" },
        "nodes": [{
            "__typename": "CommitComment",
            "id": "CC_42",
            "updatedAt": "2026-08-30T01:01:00Z",
            "viewerCanUpdate": true,
            "viewerCanDelete": true,
            "isMinimized": true,
            "minimizedReason": "off-topic",
            "viewerCanMinimize": true,
            "viewerCanUnminimize": true,
            "repository": { "id": "R_1" },
            "commit": { "oid": sha }
        }]
    }))
    .expect("minimized capability fixture");
    let comment =
        commit_comment_page_from_raw(vec![comment_fixture(&sha)], capabilities, &sha, 1, false)
            .expect("comment page")
            .comments
            .into_iter()
            .next()
            .expect("comment");
    assert!(matches!(
        super::transport::ensure_comment_mutation_allowed_for_test(&comment, &mutation),
        Err(crate::error::AppError::GitHubCommentConflict(_))
    ));
}

#[tokio::test]
async fn update_transport_preflights_scope_capability_and_revision() {
    let sha = "a".repeat(40);
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json(&sha, "2026-08-30T01:01:00Z", true, true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "New body", "2026-08-30T01:02:00Z"),
        },
    ])
    .await;
    let mutation = GitHubCommitCommentMutation::Update {
        guard: comment_guard(42),
        body: "New body".to_string(),
    };

    let updated =
        mutate_commit_comment_with_client(&client, "octocat", "hello-world", &sha, &mutation)
            .await
            .expect("updated comment")
            .expect("comment response");
    server.await.expect("mock server");

    assert_eq!(updated.body, "New body");
    assert!(updated.viewer_can_update);
    let requests = requests.lock().expect("requests");
    assert_rest_request(
        &requests[0],
        "GET",
        "/repos/octocat/hello-world/comments/42",
    );
    assert!(requests[1].starts_with("POST /graphql HTTP/1.1"));
    assert_rest_request(
        &requests[2],
        "PATCH",
        "/repos/octocat/hello-world/comments/42",
    );
    let body = requests[2].split("\r\n\r\n").nth(1).expect("request body");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(body).expect("request JSON"),
        serde_json::json!({ "body": "New body" })
    );
}

#[tokio::test]
async fn minimize_transport_writes_once_and_confirms_the_postflight_state() {
    let sha = "a".repeat(40);
    let (read_client, write_client, requests, server) = mock_github_pair(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json_with_minimize(
                &sha,
                "2026-08-30T01:01:00Z",
                false,
                None,
                true,
                false,
            ),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: "__ECHO_MINIMIZE_MUTATION__".to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json_with_minimize(
                &sha,
                "2026-08-30T01:01:00Z",
                true,
                Some("off-topic"),
                false,
                true,
            ),
        },
    ])
    .await;
    let mutation = GitHubCommitCommentMutation::Minimize {
        guard: comment_guard(42),
        expected_minimized: false,
        classifier: GitHubCommentMinimizeClassifier::OffTopic,
    };

    let minimized = mutate_commit_comment_with_clients(
        &read_client,
        &write_client,
        "octocat",
        "hello-world",
        &sha,
        &mutation,
    )
    .await
    .expect("minimized comment")
    .expect("comment response");
    server.await.expect("mock server");

    assert!(minimized.is_minimized);
    assert_eq!(minimized.minimized_reason.as_deref(), Some("off-topic"));
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 5);
    assert!(requests[2].starts_with("POST /graphql HTTP/1.1"));
    let request_body = requests[2].split("\r\n\r\n").nth(1).expect("request body");
    let request_json = serde_json::from_str::<serde_json::Value>(request_body).expect("JSON");
    assert_eq!(request_json["variables"]["id"], "CC_42");
    assert_eq!(request_json["variables"]["classifier"], "OFF_TOPIC");
}

#[tokio::test]
async fn minimize_transport_does_not_retry_an_ambiguous_graphql_write() {
    let sha = "a".repeat(40);
    let (read_client, write_client, requests, server) = mock_github_pair(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json_with_minimize(
                &sha,
                "2026-08-30T01:01:00Z",
                false,
                None,
                true,
                false,
            ),
        },
        MockResponse {
            status: "503 Service Unavailable",
            headers: vec![],
            body: serde_json::json!({ "message": "temporarily unavailable" }).to_string(),
        },
        MockResponse {
            status: "503 Service Unavailable",
            headers: vec![],
            body: serde_json::json!({ "message": "retry probe" }).to_string(),
        },
        MockResponse {
            status: "503 Service Unavailable",
            headers: vec![],
            body: serde_json::json!({ "message": "retry probe" }).to_string(),
        },
    ])
    .await;
    let mutation = GitHubCommitCommentMutation::Minimize {
        guard: comment_guard(42),
        expected_minimized: false,
        classifier: GitHubCommentMinimizeClassifier::Spam,
    };

    let error = mutate_commit_comment_with_clients(
        &read_client,
        &write_client,
        "octocat",
        "hello-world",
        &sha,
        &mutation,
    )
    .await
    .expect_err("ambiguous write");
    let mut server = server;
    if timeout(Duration::from_millis(250), &mut server)
        .await
        .is_err()
    {
        server.abort();
    }
    let _ = server.await;

    assert!(matches!(error, crate::error::AppError::GitHub(_)));
    assert_eq!(requests.lock().expect("requests").len(), 3);
}

#[tokio::test]
async fn delete_transport_preflights_before_no_content() {
    let sha = "a".repeat(40);
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json(&sha, "2026-08-30T01:01:00Z", true, true),
        },
        MockResponse {
            status: "204 No Content",
            headers: vec![],
            body: String::new(),
        },
    ])
    .await;
    let mutation = GitHubCommitCommentMutation::Delete {
        guard: comment_guard(42),
    };

    let deleted =
        mutate_commit_comment_with_client(&client, "octocat", "hello-world", &sha, &mutation)
            .await
            .expect("deleted comment");
    server.await.expect("mock server");

    assert!(deleted.is_none());
    let requests = requests.lock().expect("requests");
    assert_rest_request(
        &requests[0],
        "GET",
        "/repos/octocat/hello-world/comments/42",
    );
    assert_rest_request(
        &requests[2],
        "DELETE",
        "/repos/octocat/hello-world/comments/42",
    );
}

#[tokio::test]
async fn stale_revision_stops_before_update() {
    let sha = "a".repeat(40);
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:02:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json(&sha, "2026-08-30T01:02:00Z", true, true),
        },
    ])
    .await;
    let mutation = GitHubCommitCommentMutation::Update {
        guard: comment_guard(42),
        body: "New body".to_string(),
    };

    let error =
        mutate_commit_comment_with_client(&client, "octocat", "hello-world", &sha, &mutation)
            .await
            .expect_err("stale comment");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        crate::error::AppError::GitHubCommentConflict(_)
    ));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn missing_preflight_and_denied_capability_stop_before_writes() {
    let sha = "a".repeat(40);
    let mutation = GitHubCommitCommentMutation::Update {
        guard: comment_guard(42),
        body: "New body".to_string(),
    };
    let (missing_client, missing_requests, missing_server) = mock_github(vec![MockResponse {
        status: "404 Not Found",
        headers: vec![],
        body: serde_json::json!({ "message": "Not Found" }).to_string(),
    }])
    .await;
    let missing_error = mutate_commit_comment_with_client(
        &missing_client,
        "octocat",
        "hello-world",
        &sha,
        &mutation,
    )
    .await
    .expect_err("missing comment");
    missing_server.await.expect("missing server");
    assert!(matches!(
        missing_error,
        crate::error::AppError::GitHubCommentConflict(_)
    ));
    assert_eq!(missing_requests.lock().expect("requests").len(), 1);

    let (denied_client, denied_requests, denied_server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json(&sha, "2026-08-30T01:01:00Z", false, true),
        },
    ])
    .await;
    let denied_error = mutate_commit_comment_with_client(
        &denied_client,
        "octocat",
        "hello-world",
        &sha,
        &mutation,
    )
    .await
    .expect_err("update denied");
    denied_server.await.expect("denied server");
    assert!(matches!(
        denied_error,
        crate::error::AppError::GitHubPermission(_)
    ));
    assert_eq!(denied_requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn delete_capability_and_update_response_placement_are_guarded() {
    let sha = "a".repeat(40);
    let delete = GitHubCommitCommentMutation::Delete {
        guard: comment_guard(42),
    };
    let (delete_client, delete_requests, delete_server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json(&sha, "2026-08-30T01:01:00Z", true, false),
        },
    ])
    .await;
    let delete_error =
        mutate_commit_comment_with_client(&delete_client, "octocat", "hello-world", &sha, &delete)
            .await
            .expect_err("delete denied");
    delete_server.await.expect("delete server");
    assert!(matches!(
        delete_error,
        crate::error::AppError::GitHubPermission(_)
    ));
    assert_eq!(delete_requests.lock().expect("requests").len(), 2);

    let update = GitHubCommitCommentMutation::Update {
        guard: comment_guard(42),
        body: "New body".to_string(),
    };
    let mut moved_response: serde_json::Value =
        serde_json::from_str(&comment_api_json(&sha, "New body", "2026-08-30T01:02:00Z"))
            .expect("updated response");
    moved_response["position"] = serde_json::json!(8);
    let (update_client, update_requests, update_server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: comment_api_json(&sha, "Old body", "2026-08-30T01:01:00Z"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: capability_api_json(&sha, "2026-08-30T01:01:00Z", true, true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: moved_response.to_string(),
        },
    ])
    .await;
    let update_error =
        mutate_commit_comment_with_client(&update_client, "octocat", "hello-world", &sha, &update)
            .await
            .expect_err("moved response");
    update_server.await.expect("update server");
    assert!(matches!(
        update_error,
        crate::error::AppError::GitHubCommentConflict(_)
    ));
    assert_eq!(update_requests.lock().expect("requests").len(), 3);
}

#[tokio::test]
async fn service_uses_saved_token_and_exact_commit_arguments() {
    let sha = "a".repeat(40);
    let service = GitHubService::new(
        Arc::new(super::super::tests::FakeGitHubClient),
        Arc::new(SavedCredentialStore),
        Some(super::super::tests::oauth_session(
            "github-user-access-token",
        )),
    );

    let page = service
        .commit_comments("octocat", "hello-world", &sha, 2)
        .await
        .expect("comment page");
    assert_eq!(page.page, 2);
    let created = service
        .mutate_commit_comment(
            "octocat",
            "hello-world",
            &sha,
            GitHubCommitCommentMutation::Create {
                body: "Keep this native".to_string(),
                placement: None,
            },
        )
        .await
        .expect("create comment")
        .expect("created comment");
    assert_eq!(created.commit_sha, sha);
}
