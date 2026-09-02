use serde_json::json;
use std::sync::{Arc, Mutex};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::{timeout, Duration},
};

use super::*;
use crate::error::AppError;
use crate::github::issue_related::test_support::{mock_github, MockResponse};

fn user_response(login: &str) -> String {
    json!({
        "login": login,
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
    .to_string()
}

fn topics_response(names: &[&str]) -> String {
    json!({ "names": names }).to_string()
}

#[test]
fn topic_names_are_normalized_and_bounded() {
    assert_eq!(
        normalize_topic_names(&[" Rust ".to_string(), "TAURI".to_string()]).expect("valid topics"),
        ["rust", "tauri"]
    );
    assert!(normalize_topic_names(&["desktop_app".to_string()]).is_err());
    assert!(normalize_topic_names(&["rust".to_string(), "RUST".to_string()]).is_err());
    assert!(normalize_topic_names(&["r".repeat(51)]).is_err());
    assert!(
        normalize_topic_names(&(0..21).map(|n| format!("topic-{n}")).collect::<Vec<_>>()).is_err()
    );
}

#[test]
fn topics_keep_a_small_camel_case_ipc_contract() {
    let topics = GitHubRepositoryTopics {
        names: vec!["rust".to_string(), "tauri".to_string()],
    };
    assert_eq!(
        serde_json::to_value(topics).expect("topics JSON"),
        json!({ "names": ["rust", "tauri"] })
    );
}

#[tokio::test]
async fn reads_topics_only_for_the_signed_in_personal_repository() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: user_response("octocat"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["rust", "tauri"]),
        },
    ])
    .await;

    let topics = load_repository_topics_with_client(&client, "octocat", "harbor")
        .await
        .expect("topics");
    server.await.expect("mock server");

    assert_eq!(topics.names, ["rust", "tauri"]);
    let requests = requests.lock().expect("requests");
    assert!(requests[0].starts_with("GET /user HTTP/1.1"));
    assert!(requests[1].starts_with("GET /repos/octocat/harbor/topics HTTP/1.1"));
    assert!(requests[1].contains("accept: application/vnd.github+json"));
    assert!(requests[1].contains("x-github-api-version: 2026-03-10"));
}

#[tokio::test]
async fn replaces_topics_with_exact_body_and_postflight_confirmation() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: user_response("octocat"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["old"]),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["rust", "desktop-app"]),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["rust", "desktop-app"]),
        },
    ])
    .await;

    let mutation = GitHubRepositoryTopicsMutation {
        names: vec!["RUST".to_string(), "desktop-app".to_string()],
        expected_names: vec!["old".to_string()],
    };
    let topics =
        replace_repository_topics_with_clients(&client, &client, "octocat", "harbor", &mutation)
            .await
            .expect("topics replaced");
    server.await.expect("mock server");

    assert_eq!(topics.names, ["rust", "desktop-app"]);
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 4);
    assert!(requests[2].starts_with("PUT /repos/octocat/harbor/topics HTTP/1.1"));
    let body = requests[2]
        .split_once("\r\n\r\n")
        .map(|(_, body)| body)
        .expect("PUT body");
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(body).expect("JSON body"),
        json!({
            "names": ["rust", "desktop-app"]
        })
    );
}

#[tokio::test]
async fn topic_replace_does_not_retry_an_ambiguous_write() {
    let (read_client, write_client, requests, server) = mock_topics_clients(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: user_response("octocat"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["old"]),
        },
        MockResponse {
            status: "503 Service Unavailable",
            headers: vec![],
            body: json!({ "message": "try again" }).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["new"]),
        },
    ])
    .await;

    let mutation = GitHubRepositoryTopicsMutation {
        names: vec!["new".to_string()],
        expected_names: vec!["old".to_string()],
    };
    let error = replace_repository_topics_with_clients(
        &read_client,
        &write_client,
        "octocat",
        "harbor",
        &mutation,
    )
    .await
    .expect_err("503 write must remain explicit");
    server.await.expect("mock server");

    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 3);
    assert!(requests[2].starts_with("PUT /repos/octocat/harbor/topics HTTP/1.1"));
    assert!(matches!(
        error,
        AppError::GitHubRepositoryTopicsConflict(message)
            if message.contains("may have persisted") && message.contains("refresh before retrying")
    ));
}

#[tokio::test]
async fn topic_replace_reports_an_uncertain_postflight_failure() {
    let (read_client, write_client, requests, server) = mock_topics_clients(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: user_response("octocat"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["old"]),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["new"]),
        },
        MockResponse {
            status: "503 Service Unavailable",
            headers: vec![],
            body: json!({ "message": "try again" }).to_string(),
        },
    ])
    .await;

    let mutation = GitHubRepositoryTopicsMutation {
        names: vec!["new".to_string()],
        expected_names: vec!["old".to_string()],
    };
    let error = replace_repository_topics_with_clients(
        &read_client,
        &write_client,
        "octocat",
        "harbor",
        &mutation,
    )
    .await
    .expect_err("failed postflight must remain explicit");
    server.await.expect("mock server");

    assert!(matches!(
        error,
        AppError::GitHubRepositoryTopicsConflict(message)
            if message.contains("may have persisted") && message.contains("refresh before retrying")
    ));
    assert_eq!(requests.lock().expect("requests").len(), 4);
}

#[tokio::test]
async fn a_stale_topics_snapshot_stops_before_replace() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: user_response("octocat"),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: topics_response(&["old"]),
        },
    ])
    .await;

    let mutation = GitHubRepositoryTopicsMutation {
        names: vec!["new".to_string()],
        expected_names: vec!["different".to_string()],
    };
    let error =
        replace_repository_topics_with_clients(&client, &client, "octocat", "harbor", &mutation)
            .await
            .expect_err("stale snapshot");
    server.await.expect("mock server");

    assert!(matches!(error, AppError::GitHubRepositoryTopicsConflict(_)));
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

async fn mock_topics_clients(
    responses: Vec<MockResponse>,
) -> (
    octocrab::Octocrab,
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
            let Ok(Ok((mut stream, _))) =
                timeout(Duration::from_millis(350), listener.accept()).await
            else {
                break;
            };
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
                    if buffer.len() >= header_end + 4 + content_length.unwrap_or(0) {
                        break;
                    }
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
    let base_uri = format!("http://{address}");
    let read_client = octocrab::Octocrab::builder()
        .base_uri(&base_uri)
        .expect("mock base uri")
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("read client");
    let write_client = octocrab::Octocrab::builder()
        .base_uri(base_uri)
        .expect("mock base uri")
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("write client");
    (read_client, write_client, requests, server)
}
