use async_trait::async_trait;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Serialize;

use super::super::{
    authenticated_client,
    code::{branch_from_octocrab, GitHubBranch},
    github_error, pull_request_from_octocrab, AppError, GitHubPullRequest, GitHubService,
    OctocrabGitHubClient,
};

const BASE_BRANCH_PAGE_SIZE: u8 = 100;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestBaseBranchPage {
    pub pull_request_number: u64,
    pub current_base: String,
    pub current_base_sha: String,
    pub head_sha: String,
    pub branches: Vec<GitHubBranch>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubPullRequestBaseEditGuard {
    pub expected_current_base: String,
    pub expected_current_base_sha: String,
    pub expected_head_sha: String,
    pub target_base: String,
    pub expected_target_base_sha: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PullRequestBaseSnapshot {
    id: u64,
    node_id: String,
    number: u64,
    base_repository: String,
    base_ref: String,
    base_sha: String,
    head_ref: String,
    head_sha: String,
    open: bool,
    draft: bool,
    merged: bool,
}

#[async_trait]
pub(crate) trait GitHubPullRequestBaseEditClient: Send + Sync {
    async fn pull_request_base_branches(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestBaseBranchPage, AppError>;

    async fn update_pull_request_base(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestBaseEditGuard,
    ) -> Result<GitHubPullRequest, AppError>;
}

#[async_trait]
impl GitHubPullRequestBaseEditClient for OctocrabGitHubClient {
    async fn pull_request_base_branches(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestBaseBranchPage, AppError> {
        let client = authenticated_client(token)?;
        pull_request_base_branches_with_client(
            &client,
            owner,
            repository,
            pull_request_number,
            page,
        )
        .await
    }

    async fn update_pull_request_base(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestBaseEditGuard,
    ) -> Result<GitHubPullRequest, AppError> {
        let client = authenticated_client(token)?;
        update_pull_request_base_with_client(&client, owner, repository, pull_request_number, guard)
            .await
    }
}

impl GitHubService {
    pub async fn pull_request_base_branches(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestBaseBranchPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_base_branches(&token, owner, repository, pull_request_number, page)
            .await
    }

    pub async fn update_pull_request_base(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestBaseEditGuard,
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_pull_request_base(&token, owner, repository, pull_request_number, guard)
            .await
    }
}

async fn pull_request_base_branches_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    page: u32,
) -> Result<GitHubPullRequestBaseBranchPage, AppError> {
    let pull_request = client
        .pulls(owner, repository)
        .get(pull_request_number)
        .await
        .map_err(base_edit_error)?;
    let snapshot = pull_request_snapshot(&pull_request, owner, repository, pull_request_number)?;
    ensure_base_editable(&snapshot)?;
    let branches = client
        .repos(owner, repository)
        .list_branches()
        .per_page(BASE_BRANCH_PAGE_SIZE)
        .page(page)
        .send()
        .await
        .map_err(base_edit_error)?;
    let has_more = branches.next.is_some();
    Ok(GitHubPullRequestBaseBranchPage {
        pull_request_number,
        current_base: snapshot.base_ref,
        current_base_sha: snapshot.base_sha,
        head_sha: snapshot.head_sha,
        branches: branches
            .items
            .into_iter()
            .map(branch_from_octocrab)
            .collect(),
        page,
        has_previous: page > 1,
        has_more,
    })
}

async fn update_pull_request_base_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    guard: &GitHubPullRequestBaseEditGuard,
) -> Result<GitHubPullRequest, AppError> {
    let before = client
        .pulls(owner, repository)
        .get(pull_request_number)
        .await
        .map_err(base_edit_error)?;
    let before = pull_request_snapshot(&before, owner, repository, pull_request_number)?;
    ensure_preflight(&before, guard)?;
    ensure_target_branch(
        &get_branch(client, owner, repository, &guard.target_base).await?,
        guard,
    )?;

    let updated: octocrab::models::pulls::PullRequest = client
        .patch(
            pull_request_route(owner, repository, pull_request_number),
            Some(&base_edit_request(&guard.target_base)),
        )
        .await
        .map_err(base_edit_error)?;
    let updated = pull_request_snapshot(&updated, owner, repository, pull_request_number)?;
    ensure_updated(&before, &updated, guard)?;

    let confirmed_raw = client
        .pulls(owner, repository)
        .get(pull_request_number)
        .await
        .map_err(base_edit_error)?;
    let confirmed = pull_request_snapshot(&confirmed_raw, owner, repository, pull_request_number)?;
    ensure_updated(&before, &confirmed, guard)?;
    ensure_target_branch(
        &get_branch(client, owner, repository, &guard.target_base).await?,
        guard,
    )?;
    Ok(pull_request_from_octocrab(confirmed_raw))
}

async fn get_branch(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    branch: &str,
) -> Result<GitHubBranch, AppError> {
    let branch = utf8_percent_encode(branch, NON_ALPHANUMERIC).to_string();
    let route = format!("/repos/{owner}/{repository}/branches/{branch}");
    let branch: octocrab::models::repos::Branch = client
        .get(route, None::<&()>)
        .await
        .map_err(base_edit_error)?;
    Ok(branch_from_octocrab(branch))
}

fn pull_request_snapshot(
    pull_request: &octocrab::models::pulls::PullRequest,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<PullRequestBaseSnapshot, AppError> {
    let base_repository = pull_request
        .base
        .repo
        .as_ref()
        .and_then(|repository| repository.full_name.clone())
        .ok_or_else(incomplete_base_edit_response)?;
    let node_id = pull_request
        .node_id
        .clone()
        .filter(|node_id| !node_id.trim().is_empty())
        .ok_or_else(incomplete_base_edit_response)?;
    if pull_request.number != pull_request_number
        || !base_repository.eq_ignore_ascii_case(&format!("{owner}/{repository}"))
    {
        return Err(base_edit_conflict(
            "GitHub returned a pull request outside the requested repository",
        ));
    }
    Ok(PullRequestBaseSnapshot {
        id: pull_request.id.into_inner(),
        node_id,
        number: pull_request.number,
        base_repository,
        base_ref: pull_request.base.ref_field.clone(),
        base_sha: pull_request.base.sha.clone(),
        head_ref: pull_request.head.ref_field.clone(),
        head_sha: pull_request.head.sha.clone(),
        open: matches!(pull_request.state, Some(octocrab::models::IssueState::Open)),
        draft: pull_request.draft.unwrap_or(false),
        merged: pull_request.merged.unwrap_or(false),
    })
}

fn ensure_base_editable(snapshot: &PullRequestBaseSnapshot) -> Result<(), AppError> {
    if snapshot.open && !snapshot.merged {
        Ok(())
    } else {
        Err(base_edit_conflict(
            "only an open, unmerged pull request can change base",
        ))
    }
}

fn ensure_preflight(
    snapshot: &PullRequestBaseSnapshot,
    guard: &GitHubPullRequestBaseEditGuard,
) -> Result<(), AppError> {
    ensure_base_editable(snapshot)?;
    if snapshot.base_ref != guard.expected_current_base
        || snapshot.base_sha != guard.expected_current_base_sha
        || snapshot.head_sha != guard.expected_head_sha
        || guard.target_base == snapshot.base_ref
    {
        return Err(base_edit_conflict(
            "the pull request branch range changed; refresh before trying again",
        ));
    }
    Ok(())
}

fn ensure_target_branch(
    branch: &GitHubBranch,
    guard: &GitHubPullRequestBaseEditGuard,
) -> Result<(), AppError> {
    if branch.name == guard.target_base && branch.sha == guard.expected_target_base_sha {
        Ok(())
    } else {
        Err(base_edit_conflict(
            "the target base branch changed; refresh before trying again",
        ))
    }
}

fn ensure_updated(
    before: &PullRequestBaseSnapshot,
    updated: &PullRequestBaseSnapshot,
    guard: &GitHubPullRequestBaseEditGuard,
) -> Result<(), AppError> {
    if updated.id == before.id
        && updated.node_id == before.node_id
        && updated.number == before.number
        && updated
            .base_repository
            .eq_ignore_ascii_case(&before.base_repository)
        && updated.head_ref == before.head_ref
        && updated.head_sha == before.head_sha
        && updated.open
        && !updated.merged
        && updated.draft == before.draft
        && updated.base_ref == guard.target_base
        && updated.base_sha == guard.expected_target_base_sha
    {
        Ok(())
    } else {
        Err(base_edit_conflict(
            "GitHub did not persist the selected pull request base",
        ))
    }
}

fn pull_request_route(owner: &str, repository: &str, pull_request_number: u64) -> String {
    format!("/repos/{owner}/{repository}/pulls/{pull_request_number}")
}

fn base_edit_request(target_base: &str) -> serde_json::Value {
    serde_json::json!({ "base": target_base })
}

fn incomplete_base_edit_response() -> AppError {
    base_edit_conflict("GitHub returned an incomplete pull request base snapshot")
}

fn base_edit_conflict(message: impl Into<String>) -> AppError {
    AppError::GitHubPullRequestBaseEditConflict(message.into())
}

fn base_edit_error(error: octocrab::Error) -> AppError {
    if let octocrab::Error::GitHub { source, .. } = &error {
        if let Some(error) = base_edit_status_error(source.status_code.as_u16(), &source.message) {
            return error;
        }
    }
    if matches!(
        error,
        octocrab::Error::Serde { .. } | octocrab::Error::Json { .. }
    ) {
        return base_edit_conflict(format!("GitHub returned malformed base-edit data: {error}"));
    }
    github_error(error)
}

fn base_edit_status_error(status: u16, message: &str) -> Option<AppError> {
    matches!(status, 404 | 422).then(|| {
        base_edit_conflict(format!(
            "{message}; refresh the pull request before trying again"
        ))
    })
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestBaseEditClient for super::super::tests::FakeGitHubClient {
    async fn pull_request_base_branches(
        &self,
        token: &str,
        _owner: &str,
        _repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestBaseBranchPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubPullRequestBaseBranchPage {
            pull_request_number,
            current_base: "main".to_string(),
            current_base_sha: "base1234".to_string(),
            head_sha: "abc1234".to_string(),
            branches: vec![GitHubBranch {
                name: "release".to_string(),
                sha: "target123".to_string(),
                protected: false,
            }],
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn update_pull_request_base(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestBaseEditGuard,
    ) -> Result<GitHubPullRequest, AppError> {
        use super::super::GitHubClient;
        assert_eq!(token, "github-user-access-token");
        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        pull_request.base_ref = guard.target_base.clone();
        Ok(pull_request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    struct MockResponse {
        status: &'static str,
        headers: &'static str,
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
                    assert!(read > 0);
                    buffer.extend_from_slice(&chunk[..read]);
                    let Some(header_end) = buffer.windows(4).position(|item| item == b"\r\n\r\n")
                    else {
                        continue;
                    };
                    let headers =
                        String::from_utf8(buffer[..header_end].to_vec()).expect("headers");
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
                        assert!(read > 0);
                        buffer.extend_from_slice(&chunk[..read]);
                    }
                    break;
                }
                captured
                    .lock()
                    .expect("requests")
                    .push(String::from_utf8(buffer).expect("request utf8"));
                let payload = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response.status,
                    response.headers,
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

    fn pull_request_json(base: &str, base_sha: &str) -> String {
        serde_json::json!({
            "id": 3,
            "number": 12,
            "url": "https://api.github.com/repos/octocat/hello-world/pulls/12",
            "node_id": "PR_3",
            "state": "open",
            "draft": true,
            "merged": false,
            "head": {
                "ref": "feature",
                "sha": "abc1234",
                "repo": { "id": 4, "name": "hello-world", "full_name": "contributor/hello-world", "url": "https://api.github.com/repos/contributor/hello-world" }
            },
            "base": {
                "ref": base,
                "sha": base_sha,
                "repo": { "id": 2, "name": "hello-world", "full_name": "octocat/hello-world", "url": "https://api.github.com/repos/octocat/hello-world" }
            }
        })
        .to_string()
    }

    fn branch_json(name: &str, sha: &str) -> String {
        serde_json::json!({
            "name": name,
            "commit": { "sha": sha, "url": "https://api.github.com/repos/octocat/hello-world/commits/target123" },
            "protected": true
        })
        .to_string()
    }

    fn guard() -> GitHubPullRequestBaseEditGuard {
        GitHubPullRequestBaseEditGuard {
            expected_current_base: "main".to_string(),
            expected_current_base_sha: "base1234".to_string(),
            expected_head_sha: "abc1234".to_string(),
            target_base: "release".to_string(),
            expected_target_base_sha: "target123".to_string(),
        }
    }

    fn snapshot(open: bool, draft: bool, merged: bool) -> PullRequestBaseSnapshot {
        PullRequestBaseSnapshot {
            id: 3,
            node_id: "PR_3".to_string(),
            number: 12,
            base_repository: "octocat/hello-world".to_string(),
            base_ref: "main".to_string(),
            base_sha: "base1234".to_string(),
            head_ref: "feature".to_string(),
            head_sha: "abc1234".to_string(),
            open,
            draft,
            merged,
        }
    }

    #[test]
    fn only_open_unmerged_pull_requests_can_change_base() {
        assert!(ensure_base_editable(&snapshot(true, false, false)).is_ok());
        assert!(ensure_base_editable(&snapshot(true, true, false)).is_ok());
        assert!(ensure_base_editable(&snapshot(false, false, false)).is_err());
        assert!(ensure_base_editable(&snapshot(true, false, true)).is_err());
    }

    #[test]
    fn stale_noop_and_changed_target_guards_are_refreshable() {
        assert!(ensure_preflight(&snapshot(true, false, false), &guard()).is_ok());
        let mut stale = guard();
        stale.expected_head_sha = "other".to_string();
        assert!(ensure_preflight(&snapshot(true, false, false), &stale).is_err());
        let mut noop = guard();
        noop.target_base = "main".to_string();
        assert!(ensure_preflight(&snapshot(true, false, false), &noop).is_err());
        assert!(ensure_target_branch(
            &GitHubBranch {
                name: "release".to_string(),
                sha: "moved".to_string(),
                protected: false,
            },
            &guard()
        )
        .is_err());
    }

    #[test]
    fn patch_payload_changes_only_the_base() {
        assert_eq!(
            pull_request_route("octocat", "hello-world", 12),
            "/repos/octocat/hello-world/pulls/12"
        );
        assert_eq!(
            base_edit_request("release"),
            serde_json::json!({ "base": "release" })
        );
    }

    #[test]
    fn response_verification_keeps_pr_head_and_repository_identity() {
        let before = snapshot(true, true, false);
        let mut updated = before.clone();
        updated.base_ref = "release".to_string();
        updated.base_sha = "target123".to_string();
        assert!(ensure_updated(&before, &updated, &guard()).is_ok());
        updated.head_sha = "changed".to_string();
        assert!(ensure_updated(&before, &updated, &guard()).is_err());
    }

    #[test]
    fn missing_and_unprocessable_base_edits_are_refreshable_conflicts() {
        for status in [404, 422] {
            assert!(matches!(
                base_edit_status_error(status, "branch moved"),
                Some(AppError::GitHubPullRequestBaseEditConflict(message))
                    if message.contains("refresh")
            ));
        }
        assert!(base_edit_status_error(403, "permission denied").is_none());
        assert!(base_edit_status_error(429, "rate limited").is_none());
    }

    #[tokio::test]
    async fn transport_preflights_patches_only_base_and_postflights_fork_heads() {
        let mut request_guard = guard();
        request_guard.target_base = "release/v2".to_string();
        let (client, requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                headers: "",
                body: pull_request_json("main", "base1234"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: branch_json("release/v2", "target123"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: pull_request_json("release/v2", "target123"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: pull_request_json("release/v2", "target123"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: branch_json("release/v2", "target123"),
            },
        ])
        .await;

        let updated = update_pull_request_base_with_client(
            &client,
            "octocat",
            "hello-world",
            12,
            &request_guard,
        )
        .await
        .expect("base edit");
        server.await.expect("mock server");

        assert_eq!(updated.base_ref, "release/v2");
        let requests = requests.lock().expect("requests");
        assert!(requests[0].starts_with("GET /repos/octocat/hello-world/pulls/12 "));
        assert!(requests[1].starts_with("GET /repos/octocat/hello-world/branches/release%2Fv2 "));
        assert!(requests[2].starts_with("PATCH /repos/octocat/hello-world/pulls/12 "));
        assert!(requests[2].contains("\"base\":\"release/v2\""));
        assert!(!requests[2].contains("maintainer_can_modify"));
        assert!(!requests[2].contains("\"title\""));
        assert!(requests[3].starts_with("GET /repos/octocat/hello-world/pulls/12 "));
        assert!(requests[4].starts_with("GET /repos/octocat/hello-world/branches/release%2Fv2 "));
    }

    #[tokio::test]
    async fn branch_pages_keep_link_pagination_and_authoritative_pr_guards() {
        let branches = serde_json::json!([serde_json::from_str::<serde_json::Value>(
            &branch_json("release", "target123")
        )
        .expect("branch json")])
        .to_string();
        let (client, requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                headers: "",
                body: pull_request_json("main", "base1234"),
            },
            MockResponse {
                status: "200 OK",
                headers: "Link: <http://example.test/repos/octocat/hello-world/branches?per_page=100&page=3>; rel=\"next\"\r\n",
                body: branches,
            },
        ])
        .await;

        let page = pull_request_base_branches_with_client(&client, "octocat", "hello-world", 12, 2)
            .await
            .expect("base branch page");
        server.await.expect("mock server");

        assert_eq!(page.current_base, "main");
        assert_eq!(page.current_base_sha, "base1234");
        assert_eq!(page.head_sha, "abc1234");
        assert_eq!(page.branches[0].name, "release");
        assert!(page.has_previous);
        assert!(page.has_more);
        let requests = requests.lock().expect("requests");
        assert!(
            requests[1].starts_with("GET /repos/octocat/hello-world/branches?per_page=100&page=2 ")
        );
    }

    #[tokio::test]
    async fn permission_and_rate_limit_errors_keep_shared_ipc_categories() {
        for (status, message, rate_limited) in [
            ("403 Forbidden", "Resource not accessible", false),
            ("403 Forbidden", "API rate limit exceeded", true),
        ] {
            let (client, _requests, server) = mock_github(vec![MockResponse {
                status,
                headers: "",
                body: serde_json::json!({
                    "message": message,
                    "documentation_url": "https://docs.github.com/rest/pulls/pulls"
                })
                .to_string(),
            }])
            .await;

            let error = update_pull_request_base_with_client(
                &client,
                "octocat",
                "hello-world",
                12,
                &guard(),
            )
            .await
            .expect_err("mapped GitHub error");
            server.await.expect("mock server");

            let mapped = if rate_limited {
                matches!(error, AppError::GitHubRateLimited(_))
            } else {
                matches!(error, AppError::GitHubPermission(_))
            };
            assert!(mapped, "{status} mapped to {error:?}");
        }
    }

    #[tokio::test]
    async fn null_mutation_and_mismatched_postflight_are_refreshable_conflicts() {
        let (client, _requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                headers: "",
                body: pull_request_json("main", "base1234"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: branch_json("release", "target123"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: "null".to_string(),
            },
        ])
        .await;
        let null_error =
            update_pull_request_base_with_client(&client, "octocat", "hello-world", 12, &guard())
                .await
                .expect_err("null mutation response");
        server.await.expect("mock server");
        assert!(matches!(
            null_error,
            AppError::GitHubPullRequestBaseEditConflict(_)
        ));

        let changed_head = pull_request_json("release", "target123")
            .replace("\"sha\":\"abc1234\"", "\"sha\":\"changed123\"");
        let (client, _requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                headers: "",
                body: pull_request_json("main", "base1234"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: branch_json("release", "target123"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: pull_request_json("release", "target123"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: changed_head,
            },
        ])
        .await;
        let postflight_error =
            update_pull_request_base_with_client(&client, "octocat", "hello-world", 12, &guard())
                .await
                .expect_err("write-may-have-persisted conflict");
        server.await.expect("mock server");
        assert!(matches!(
            postflight_error,
            AppError::GitHubPullRequestBaseEditConflict(_)
        ));
    }
}
