use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

use super::*;

#[async_trait]
impl GitHubPullRequestMaintainerEditabilityClient for super::super::super::tests::FakeGitHubClient {
    async fn pull_request_maintainer_editability(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
        use super::super::super::GitHubClient;

        assert_eq!(token, "github-user-access-token");
        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        pull_request.maintainer_can_modify = Some(false);
        Ok(fake_status(pull_request, false))
    }

    async fn update_pull_request_maintainer_editability(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestMaintainerEditabilityGuard,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
        let mut status = self
            .pull_request_maintainer_editability(token, owner, repository, pull_request_number)
            .await?;
        status.current_value = guard.requested_value;
        status.pull_request.maintainer_can_modify = Some(guard.requested_value);
        Ok(status)
    }
}

fn fake_status(
    pull_request: GitHubPullRequest,
    current_value: bool,
) -> GitHubPullRequestMaintainerEditability {
    GitHubPullRequestMaintainerEditability {
        pull_request,
        state: GitHubPullRequestMaintainerEditabilityState::Available,
        workflow_risk: GitHubPullRequestWorkflowRisk::Absent,
        pull_request_id: 3,
        pull_request_node_id: "PR_3".to_string(),
        pull_request_number: 12,
        author_id: 1,
        author_login: "octocat".to_string(),
        viewer_id: 1,
        current_value,
        draft: false,
        merged: false,
        base_repository_id: 2,
        base_repository: "octocat/hello-world".to_string(),
        head_repository_id: Some(4),
        head_repository: Some("octocat-fork/hello-world".to_string()),
        head_repository_owner_type: Some("User".to_string()),
        head_repository_private: Some(false),
        head_repository_fork: Some(true),
        head_ref: "feature".to_string(),
        head_sha: "abc1234".to_string(),
    }
}

struct MockResponse {
    status: &'static str,
    body: String,
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
                assert!(read > 0, "request ended early");
                buffer.extend_from_slice(&chunk[..read]);
                let Some(header_end) = buffer.windows(4).position(|item| item == b"\r\n\r\n")
                else {
                    continue;
                };
                let headers = String::from_utf8(buffer[..header_end].to_vec()).expect("headers");
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().expect("content length"))
                    })
                    .unwrap_or_default();
                while buffer.len() < header_end + 4 + content_length {
                    let read = stream.read(&mut chunk).await.expect("body read");
                    assert!(read > 0, "request body ended early");
                    buffer.extend_from_slice(&chunk[..read]);
                }
                break;
            }
            captured
                .lock()
                .expect("requests")
                .push(String::from_utf8(buffer).expect("request utf8"));
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
    });
    let client = octocrab::Octocrab::builder()
        .base_uri(format!("http://{address}"))
        .expect("base uri")
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("client");
    (client, requests, server)
}

fn author_json(login: &str, id: u64) -> serde_json::Value {
    serde_json::json!({
        "login": login,
        "id": id,
        "node_id": format!("U_{id}"),
        "avatar_url": format!("https://github.com/{login}.png"),
        "gravatar_id": "",
        "url": format!("https://api.github.com/users/{login}"),
        "html_url": format!("https://github.com/{login}"),
        "followers_url": format!("https://api.github.com/users/{login}/followers"),
        "following_url": format!("https://api.github.com/users/{login}/following{{/other_user}}"),
        "gists_url": format!("https://api.github.com/users/{login}/gists{{/gist_id}}"),
        "starred_url": format!("https://api.github.com/users/{login}/starred{{/owner}}{{/repo}}"),
        "subscriptions_url": format!("https://api.github.com/users/{login}/subscriptions"),
        "organizations_url": format!("https://api.github.com/users/{login}/orgs"),
        "repos_url": format!("https://api.github.com/users/{login}/repos"),
        "events_url": format!("https://api.github.com/users/{login}/events{{/privacy}}"),
        "received_events_url": format!("https://api.github.com/users/{login}/received_events"),
        "type": "User",
        "site_admin": false
    })
}

fn viewer_json(login: &str, id: u64) -> String {
    let mut viewer = author_json(login, id);
    let profile = viewer.as_object_mut().expect("viewer object");
    profile.extend(
        serde_json::json!({
            "name": login,
            "company": null,
            "blog": "",
            "location": null,
            "email": null,
            "hireable": null,
            "bio": null,
            "twitter_username": null,
            "public_repos": 1,
            "public_gists": 0,
            "followers": 0,
            "following": 0,
            "created_at": "2026-08-01T00:00:00Z",
            "updated_at": "2026-08-29T00:00:00Z"
        })
        .as_object()
        .expect("profile fields")
        .clone(),
    );
    viewer.to_string()
}

fn repository_json(owner: &str, owner_id: u64, id: u64, fork: bool) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "name": "hello-world",
        "full_name": format!("{owner}/hello-world"),
        "url": format!("https://api.github.com/repos/{owner}/hello-world"),
        "owner": author_json(owner, owner_id),
        "private": false,
        "fork": fork
    })
}

fn pull_request_json(maintainer_can_modify: bool) -> String {
    serde_json::json!({
        "id": 3,
        "number": 12,
        "url": "https://api.github.com/repos/octocat/hello-world/pulls/12",
        "node_id": "PR_3",
        "state": "open",
        "draft": true,
        "merged": false,
        "maintainer_can_modify": maintainer_can_modify,
        "user": author_json("contributor", 1),
        "head": {
            "ref": "feature",
            "sha": "abc1234",
            "repo": repository_json("contributor", 1, 4, true)
        },
        "base": {
            "ref": "main",
            "sha": "base1234",
            "repo": repository_json("octocat", 2, 2, false)
        }
    })
    .to_string()
}

fn pull_request_with_head_change(
    maintainer_can_modify: bool,
    change: impl FnOnce(&mut serde_json::Value),
) -> String {
    let mut pull_request: serde_json::Value =
        serde_json::from_str(&pull_request_json(maintainer_can_modify)).expect("pull request json");
    change(&mut pull_request);
    pull_request.to_string()
}

fn branch_json() -> String {
    serde_json::json!({
        "name": "feature",
        "commit": {
            "sha": "abc1234",
            "url": "https://api.github.com/repos/contributor/hello-world/commits/abc1234"
        },
        "protected": false
    })
    .to_string()
}

fn workflows_json() -> String {
    serde_json::json!([{
        "name": "ci.yml",
        "path": ".github/workflows/ci.yml",
        "sha": "workflow123",
        "encoding": null,
        "content": null,
        "size": 42,
        "url": "https://api.github.com/repos/contributor/hello-world/contents/.github/workflows/ci.yml",
        "html_url": "https://github.com/contributor/hello-world/blob/abc1234/.github/workflows/ci.yml",
        "git_url": "https://api.github.com/repos/contributor/hello-world/git/blobs/workflow123",
        "download_url": "https://raw.githubusercontent.com/contributor/hello-world/abc1234/.github/workflows/ci.yml",
        "type": "file",
        "_links": {
            "git": "https://api.github.com/repos/contributor/hello-world/git/blobs/workflow123",
            "html": "https://github.com/contributor/hello-world/blob/abc1234/.github/workflows/ci.yml",
            "self": "https://api.github.com/repos/contributor/hello-world/contents/.github/workflows/ci.yml"
        },
        "license": null
    }])
    .to_string()
}

fn ok(body: String) -> MockResponse {
    MockResponse {
        status: "200 OK",
        body,
    }
}

fn guard() -> GitHubPullRequestMaintainerEditabilityGuard {
    GitHubPullRequestMaintainerEditabilityGuard {
        expected_current_value: false,
        expected_pull_request_id: 3,
        expected_pull_request_node_id: "PR_3".to_string(),
        expected_author_id: 1,
        expected_head_repository_id: 4,
        expected_head_ref: "feature".to_string(),
        expected_head_sha: "abc1234".to_string(),
        expected_workflow_risk: GitHubPullRequestWorkflowRisk::Present,
        requested_value: true,
    }
}

fn snapshot() -> PullRequestMaintainerSnapshot {
    PullRequestMaintainerSnapshot {
        id: 3,
        node_id: "PR_3".to_string(),
        number: 12,
        author_id: 1,
        author_login: "contributor".to_string(),
        open: true,
        draft: true,
        merged: false,
        current_value: false,
        base_repository_id: 2,
        base_repository: "octocat/hello-world".to_string(),
        head_repository: Some(HeadRepositorySnapshot {
            id: 4,
            full_name: "contributor/hello-world".to_string(),
            owner_id: 1,
            owner_type: "User".to_string(),
            private: false,
            fork: true,
        }),
        head_ref: "feature".to_string(),
        head_sha: "abc1234".to_string(),
    }
}

#[test]
fn only_the_creator_of_an_open_personal_fork_pull_request_is_eligible() {
    let available = MaintainerEditabilityShape {
        open: true,
        merged: false,
        viewer_is_author: true,
        cross_repository: true,
        head_is_fork: true,
        head_owner_is_viewer: true,
        head_owner_is_user: true,
        head_is_live: true,
    };
    assert_eq!(
        maintainer_editability_state(&available),
        GitHubPullRequestMaintainerEditabilityState::Available
    );
    for (shape, expected) in [
        (
            MaintainerEditabilityShape {
                viewer_is_author: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::NotAuthor,
        ),
        (
            MaintainerEditabilityShape {
                cross_repository: false,
                head_is_fork: false,
                head_owner_is_viewer: false,
                head_owner_is_user: false,
                head_is_live: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::HeadUnavailable,
        ),
        (
            MaintainerEditabilityShape {
                cross_repository: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::SameRepository,
        ),
        (
            MaintainerEditabilityShape {
                head_is_fork: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::OrganizationFork,
        ),
        (
            MaintainerEditabilityShape {
                head_owner_is_viewer: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::OrganizationFork,
        ),
        (
            MaintainerEditabilityShape {
                head_owner_is_user: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::OrganizationFork,
        ),
        (
            MaintainerEditabilityShape {
                open: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::Closed,
        ),
        (
            MaintainerEditabilityShape {
                merged: true,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::Closed,
        ),
        (
            MaintainerEditabilityShape {
                head_is_live: false,
                ..available
            },
            GitHubPullRequestMaintainerEditabilityState::HeadUnavailable,
        ),
    ] {
        assert_eq!(maintainer_editability_state(&shape), expected);
    }
}

#[test]
fn mutation_guards_reject_stale_noop_and_ineligible_snapshots() {
    let current = snapshot();
    assert!(ensure_preflight(
        &current,
        1,
        GitHubPullRequestMaintainerEditabilityState::Available,
        GitHubPullRequestWorkflowRisk::Present,
        &guard()
    )
    .is_ok());

    for stale in [
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_current_value: true,
            ..guard()
        },
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_pull_request_id: 99,
            ..guard()
        },
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_pull_request_node_id: "PR_other".to_string(),
            ..guard()
        },
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_author_id: 99,
            ..guard()
        },
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_head_repository_id: 99,
            ..guard()
        },
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_head_ref: "other".to_string(),
            ..guard()
        },
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_head_sha: "changed".to_string(),
            ..guard()
        },
        GitHubPullRequestMaintainerEditabilityGuard {
            expected_workflow_risk: GitHubPullRequestWorkflowRisk::Absent,
            ..guard()
        },
    ] {
        assert!(ensure_preflight(
            &current,
            1,
            GitHubPullRequestMaintainerEditabilityState::Available,
            GitHubPullRequestWorkflowRisk::Present,
            &stale
        )
        .is_err());
    }
    let mut noop = guard();
    noop.requested_value = false;
    assert!(ensure_preflight(
        &current,
        1,
        GitHubPullRequestMaintainerEditabilityState::Available,
        GitHubPullRequestWorkflowRisk::Present,
        &noop
    )
    .is_err());
    assert!(ensure_preflight(
        &current,
        1,
        GitHubPullRequestMaintainerEditabilityState::HeadUnavailable,
        GitHubPullRequestWorkflowRisk::Present,
        &guard()
    )
    .is_err());

    let mut enabled = current;
    enabled.current_value = true;
    let revocation = GitHubPullRequestMaintainerEditabilityGuard {
        expected_current_value: true,
        expected_workflow_risk: GitHubPullRequestWorkflowRisk::Absent,
        requested_value: false,
        ..guard()
    };
    assert!(ensure_preflight(
        &enabled,
        1,
        GitHubPullRequestMaintainerEditabilityState::Available,
        GitHubPullRequestWorkflowRisk::Present,
        &revocation
    )
    .is_ok());
}

#[test]
fn patch_payload_changes_only_maintainer_editability() {
    assert_eq!(
        maintainer_editability_request(true),
        serde_json::json!({ "maintainer_can_modify": true })
    );
    assert_eq!(
        maintainer_editability_request(false),
        serde_json::json!({ "maintainer_can_modify": false })
    );
    assert_eq!(
        pull_request_route("octocat", "hello-world", 12),
        "/repos/octocat/hello-world/pulls/12"
    );
}

#[test]
fn response_verification_keeps_complete_pull_request_identity() {
    let before = snapshot();
    let mut updated = before.clone();
    updated.current_value = true;
    assert!(ensure_updated(&before, &updated, 1, true).is_ok());
    updated.head_sha = "changed".to_string();
    assert!(ensure_updated(&before, &updated, 1, true).is_err());
}

#[tokio::test]
async fn status_uses_exact_head_sha_and_reports_workflow_risk() {
    let (client, requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        ok(workflows_json()),
    ])
    .await;

    let status =
        pull_request_maintainer_editability_with_client(&client, "octocat", "hello-world", 12)
            .await
            .expect("maintainer editability");
    server.await.expect("mock server");

    assert_eq!(
        status.state,
        GitHubPullRequestMaintainerEditabilityState::Available
    );
    assert_eq!(status.workflow_risk, GitHubPullRequestWorkflowRisk::Present);
    assert_eq!(status.viewer_id, status.author_id);
    let requests = requests.lock().expect("requests");
    assert!(requests[0].starts_with("GET /user "));
    assert!(requests[1].starts_with("GET /repos/octocat/hello-world/pulls/12 "));
    assert!(requests[2].starts_with("GET /repos/contributor/hello-world/branches/feature "));
    assert!(requests[3]
        .starts_with("GET /repos/contributor/hello-world/contents/.github/workflows?ref=abc1234 "));
}

#[tokio::test]
async fn status_preserves_deleted_and_private_head_shapes() {
    let deleted = pull_request_with_head_change(false, |pull_request| {
        pull_request["head"]["repo"] = serde_json::Value::Null;
    });
    let (client, requests, server) =
        mock_github(vec![ok(viewer_json("contributor", 1)), ok(deleted)]).await;
    let status =
        pull_request_maintainer_editability_with_client(&client, "octocat", "hello-world", 12)
            .await
            .expect("deleted head status");
    server.await.expect("mock server");
    assert_eq!(
        status.state,
        GitHubPullRequestMaintainerEditabilityState::HeadUnavailable
    );
    assert_eq!(status.head_repository_id, None);
    assert_eq!(requests.lock().expect("requests").len(), 2);

    let private = pull_request_with_head_change(false, |pull_request| {
        pull_request["head"]["repo"]["private"] = serde_json::Value::Bool(true);
    });
    let (client, _requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(private),
        ok(branch_json()),
        ok(workflows_json()),
    ])
    .await;
    let status =
        pull_request_maintainer_editability_with_client(&client, "octocat", "hello-world", 12)
            .await
            .expect("private fork status");
    server.await.expect("mock server");
    assert_eq!(
        status.state,
        GitHubPullRequestMaintainerEditabilityState::Available
    );
    assert_eq!(status.head_repository_private, Some(true));
}

#[tokio::test]
async fn mutation_preflights_patches_only_boolean_and_postflights() {
    let (client, requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        ok(workflows_json()),
        ok(pull_request_json(true)),
        ok(pull_request_json(true)),
        ok(branch_json()),
        ok(workflows_json()),
    ])
    .await;

    let status = update_pull_request_maintainer_editability_with_client(
        &client,
        "octocat",
        "hello-world",
        12,
        &guard(),
    )
    .await
    .expect("updated maintainer editability");
    server.await.expect("mock server");

    assert!(status.current_value);
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 8);
    assert!(requests[4].starts_with("PATCH /repos/octocat/hello-world/pulls/12 "));
    assert!(requests[4].contains("\"maintainer_can_modify\":true"));
    for unrelated in ["\"title\"", "\"body\"", "\"state\"", "\"base\""] {
        assert!(!requests[4].contains(unrelated));
    }
    assert!(requests[5].starts_with("GET /repos/octocat/hello-world/pulls/12 "));
}

#[tokio::test]
async fn disabling_skips_workflow_scans_but_keeps_identity_and_postflight_guards() {
    let revocation = GitHubPullRequestMaintainerEditabilityGuard {
        expected_current_value: true,
        requested_value: false,
        ..guard()
    };
    let (client, requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(true)),
        ok(branch_json()),
        ok(pull_request_json(false)),
        ok(pull_request_json(false)),
        ok(branch_json()),
    ])
    .await;

    let status = update_pull_request_maintainer_editability_with_client(
        &client,
        "octocat",
        "hello-world",
        12,
        &revocation,
    )
    .await
    .expect("revoked maintainer editability");
    server.await.expect("mock server");

    assert!(!status.current_value);
    assert_eq!(status.workflow_risk, GitHubPullRequestWorkflowRisk::Unknown);
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 6);
    assert!(requests[3].starts_with("PATCH /repos/octocat/hello-world/pulls/12 "));
    assert!(requests[3].contains("\"maintainer_can_modify\":false"));
    assert!(requests
        .iter()
        .all(|request| !request.contains("contents/.github/workflows")));
}

#[tokio::test]
async fn ambiguous_workflow_lookup_is_unknown_but_auth_and_rate_limits_propagate() {
    let forbidden = serde_json::json!({
        "message": "Resource not accessible",
        "documentation_url": "https://docs.github.com/rest/repos/contents"
    })
    .to_string();
    let (client, _requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        MockResponse {
            status: "403 Forbidden",
            body: forbidden,
        },
    ])
    .await;
    let status =
        pull_request_maintainer_editability_with_client(&client, "octocat", "hello-world", 12)
            .await
            .expect("unknown workflow risk");
    server.await.expect("mock server");
    assert_eq!(status.workflow_risk, GitHubPullRequestWorkflowRisk::Unknown);

    let (client, _requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        MockResponse {
            status: "401 Unauthorized",
            body: serde_json::json!({
                "message": "Bad credentials",
                "documentation_url": "https://docs.github.com/rest/repos/contents"
            })
            .to_string(),
        },
    ])
    .await;
    let workflow_auth =
        pull_request_maintainer_editability_with_client(&client, "octocat", "hello-world", 12)
            .await
            .expect_err("workflow authentication error");
    server.await.expect("mock server");
    assert!(matches!(workflow_auth, AppError::GitHubAuthentication(_)));

    for (status, message, rate_limited) in [
        ("401 Unauthorized", "Bad credentials", false),
        ("403 Forbidden", "API rate limit exceeded", true),
    ] {
        let (client, _requests, server) = mock_github(vec![MockResponse {
            status,
            body: serde_json::json!({
                "message": message,
                "documentation_url": "https://docs.github.com/rest/users/users"
            })
            .to_string(),
        }])
        .await;
        let error =
            pull_request_maintainer_editability_with_client(&client, "octocat", "hello-world", 12)
                .await
                .expect_err("shared GitHub error");
        server.await.expect("mock server");
        if rate_limited {
            assert!(matches!(error, AppError::GitHubRateLimited(_)));
        } else {
            assert!(matches!(error, AppError::GitHubAuthentication(_)));
        }
    }
}

#[tokio::test]
async fn a_missing_workflows_directory_is_absent_after_the_head_is_verified() {
    let (client, requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        MockResponse {
            status: "404 Not Found",
            body: serde_json::json!({
                "message": "Not Found",
                "documentation_url": "https://docs.github.com/rest/repos/contents"
            })
            .to_string(),
        },
    ])
    .await;

    let status =
        pull_request_maintainer_editability_with_client(&client, "octocat", "hello-world", 12)
            .await
            .expect("workflow-absent status");
    server.await.expect("mock server");

    assert_eq!(status.workflow_risk, GitHubPullRequestWorkflowRisk::Absent);
    assert_eq!(requests.lock().expect("requests").len(), 4);
}

#[tokio::test]
async fn patch_permission_and_postflight_mismatch_keep_authoritative_error_categories() {
    let permission_body = serde_json::json!({
        "message": "Resource not accessible",
        "documentation_url": "https://docs.github.com/rest/pulls/pulls"
    })
    .to_string();
    let (client, _requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        ok(workflows_json()),
        MockResponse {
            status: "403 Forbidden",
            body: permission_body,
        },
    ])
    .await;
    let permission = update_pull_request_maintainer_editability_with_client(
        &client,
        "octocat",
        "hello-world",
        12,
        &guard(),
    )
    .await
    .expect_err("permission error");
    server.await.expect("mock server");
    assert!(matches!(permission, AppError::GitHubPermission(_)));

    let (client, _requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        ok(workflows_json()),
        ok(pull_request_json(true)),
        ok(pull_request_json(false)),
    ])
    .await;
    let conflict = update_pull_request_maintainer_editability_with_client(
        &client,
        "octocat",
        "hello-world",
        12,
        &guard(),
    )
    .await
    .expect_err("write-may-have-persisted conflict");
    server.await.expect("mock server");
    assert!(matches!(
        conflict,
        AppError::GitHubPullRequestMaintainerEditabilityConflict(_)
    ));
}

#[tokio::test]
async fn postflight_shared_errors_become_write_may_have_persisted_conflicts() {
    for (status, message) in [
        ("401 Unauthorized", "Bad credentials"),
        ("403 Forbidden", "Resource not accessible"),
        ("403 Forbidden", "API rate limit exceeded"),
    ] {
        let (client, _requests, server) = mock_github(vec![
            ok(viewer_json("contributor", 1)),
            ok(pull_request_json(false)),
            ok(branch_json()),
            ok(workflows_json()),
            ok(pull_request_json(true)),
            MockResponse {
                status,
                body: serde_json::json!({
                    "message": message,
                    "documentation_url": "https://docs.github.com/rest/pulls/pulls"
                })
                .to_string(),
            },
        ])
        .await;
        let error = update_pull_request_maintainer_editability_with_client(
            &client,
            "octocat",
            "hello-world",
            12,
            &guard(),
        )
        .await
        .expect_err("postflight conflict");
        server.await.expect("mock server");
        assert!(matches!(
            error,
            AppError::GitHubPullRequestMaintainerEditabilityConflict(message)
                if message.contains("may have persisted") && message.contains("refresh")
        ));
    }
}

#[tokio::test]
async fn missing_unprocessable_and_malformed_updates_are_refreshable_conflicts() {
    for status in ["404 Not Found", "422 Unprocessable Entity"] {
        let (client, _requests, server) = mock_github(vec![
            ok(viewer_json("contributor", 1)),
            MockResponse {
                status,
                body: serde_json::json!({
                    "message": "the pull request changed",
                    "documentation_url": "https://docs.github.com/rest/pulls/pulls"
                })
                .to_string(),
            },
        ])
        .await;
        let error = update_pull_request_maintainer_editability_with_client(
            &client,
            "octocat",
            "hello-world",
            12,
            &guard(),
        )
        .await
        .expect_err("refreshable conflict");
        server.await.expect("mock server");
        assert!(matches!(
            error,
            AppError::GitHubPullRequestMaintainerEditabilityConflict(message)
                if message.contains("refresh")
        ));
    }

    let (client, _requests, server) = mock_github(vec![
        ok(viewer_json("contributor", 1)),
        ok(pull_request_json(false)),
        ok(branch_json()),
        ok(workflows_json()),
        ok("null".to_string()),
    ])
    .await;
    let error = update_pull_request_maintainer_editability_with_client(
        &client,
        "octocat",
        "hello-world",
        12,
        &guard(),
    )
    .await
    .expect_err("null mutation response");
    server.await.expect("mock server");
    assert!(matches!(
        error,
        AppError::GitHubPullRequestMaintainerEditabilityConflict(_)
    ));
}
