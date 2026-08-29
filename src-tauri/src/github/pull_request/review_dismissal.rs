use async_trait::async_trait;
use serde::Serialize;

use super::super::{
    authenticated_client, github_error, pull_request_review_from_octocrab, AppError,
    GitHubPullRequestReview, GitHubPullRequestReviewState, GitHubService, OctocrabGitHubClient,
};

const PULL_REQUEST_REVIEW_PAGE_SIZE: u8 = 100;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewPage {
    pub reviews: Vec<GitHubPullRequestReview>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[async_trait]
pub(crate) trait GitHubPullRequestReviewDismissalClient: Send + Sync {
    async fn pull_request_reviews(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestReviewPage, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn dismiss_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        message: &str,
    ) -> Result<GitHubPullRequestReview, AppError>;
}

#[async_trait]
impl GitHubPullRequestReviewDismissalClient for OctocrabGitHubClient {
    async fn pull_request_reviews(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestReviewPage, AppError> {
        let client = authenticated_client(token)?;
        pull_request_reviews_with_client(&client, owner, repository, pull_request_number, page)
            .await
    }

    async fn dismiss_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        message: &str,
    ) -> Result<GitHubPullRequestReview, AppError> {
        let client = authenticated_client(token)?;
        dismiss_pull_request_review_with_client(
            &client,
            owner,
            repository,
            pull_request_number,
            review_id,
            message,
        )
        .await
    }
}

impl GitHubService {
    pub async fn pull_request_reviews(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestReviewPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_reviews(&token, owner, repository, pull_request_number, page)
            .await
    }

    pub async fn dismiss_pull_request_review(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        message: &str,
    ) -> Result<GitHubPullRequestReview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .dismiss_pull_request_review(
                &token,
                owner,
                repository,
                pull_request_number,
                review_id,
                message,
            )
            .await
    }
}

async fn pull_request_reviews_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    page: u32,
) -> Result<GitHubPullRequestReviewPage, AppError> {
    let reviews = client
        .pulls(owner, repository)
        .list_reviews(pull_request_number)
        .per_page(PULL_REQUEST_REVIEW_PAGE_SIZE)
        .page(page)
        .send()
        .await
        .map_err(github_error)?;
    let has_more = reviews.next.is_some();
    let reviews = reviews
        .items
        .into_iter()
        .map(review_from_octocrab)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(GitHubPullRequestReviewPage {
        reviews,
        page,
        has_previous: page > 1,
        has_more,
    })
}

async fn dismiss_pull_request_review_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: u64,
    message: &str,
) -> Result<GitHubPullRequestReview, AppError> {
    let route =
        format!("/repos/{owner}/{repository}/pulls/{pull_request_number}/reviews/{review_id}");
    let before: octocrab::models::pulls::Review = client
        .get(route.clone(), None::<&()>)
        .await
        .map_err(review_dismissal_error)?;
    verify_review_scope(&before, owner, repository, pull_request_number, review_id)?;
    let before = review_from_octocrab(before)?;
    ensure_review_dismissible(before.state)?;

    let dismissed: octocrab::models::pulls::Review = client
        .put(
            format!("{route}/dismissals"),
            Some(&serde_json::json!({ "message": message, "event": "DISMISS" })),
        )
        .await
        .map_err(review_dismissal_error)?;
    verify_review_scope(
        &dismissed,
        owner,
        repository,
        pull_request_number,
        review_id,
    )?;
    let dismissed = review_from_octocrab(dismissed)?;
    verify_dismissed_review(&before, &dismissed)?;

    let confirmed: octocrab::models::pulls::Review = client
        .get(route, None::<&()>)
        .await
        .map_err(review_dismissal_error)?;
    verify_review_scope(
        &confirmed,
        owner,
        repository,
        pull_request_number,
        review_id,
    )?;
    let confirmed = review_from_octocrab(confirmed)?;
    verify_dismissed_review(&before, &confirmed)?;
    Ok(confirmed)
}

fn verify_review_scope(
    review: &octocrab::models::pulls::Review,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: u64,
) -> Result<(), AppError> {
    let expected_pull_request_path =
        format!("/repos/{owner}/{repository}/pulls/{pull_request_number}");
    if review.id.into_inner() != review_id
        || review.pull_request_url.as_ref().map(|url| url.path())
            != Some(expected_pull_request_path.as_str())
    {
        return Err(AppError::GitHubPullRequestReviewDismissalConflict(
            "GitHub returned a review outside the requested pull request".to_string(),
        ));
    }
    Ok(())
}

fn review_from_octocrab(
    review: octocrab::models::pulls::Review,
) -> Result<GitHubPullRequestReview, AppError> {
    pull_request_review_from_octocrab(review).ok_or_else(|| {
        AppError::GitHubPullRequestReviewDismissalConflict(
            "GitHub returned an incomplete pull request review".to_string(),
        )
    })
}

fn ensure_review_dismissible(state: GitHubPullRequestReviewState) -> Result<(), AppError> {
    if matches!(
        state,
        GitHubPullRequestReviewState::Approved | GitHubPullRequestReviewState::ChangesRequested
    ) {
        Ok(())
    } else {
        Err(AppError::GitHubPullRequestReviewDismissalConflict(
            "the pull request review is no longer eligible for dismissal".to_string(),
        ))
    }
}

fn verify_dismissed_review(
    before: &GitHubPullRequestReview,
    dismissed: &GitHubPullRequestReview,
) -> Result<(), AppError> {
    if dismissed.id != before.id
        || dismissed.node_id != before.node_id
        || dismissed.author != before.author
        || dismissed.commit_id != before.commit_id
        || dismissed.submitted_at != before.submitted_at
        || dismissed.url != before.url
        || dismissed.state != GitHubPullRequestReviewState::Dismissed
    {
        return Err(AppError::GitHubPullRequestReviewDismissalConflict(
            "GitHub did not persist the selected review dismissal".to_string(),
        ));
    }
    Ok(())
}

fn review_dismissal_status_error(status: u16, message: &str) -> Option<AppError> {
    matches!(status, 404 | 422).then(|| {
        AppError::GitHubPullRequestReviewDismissalConflict(format!(
            "{message}; refresh the pull request before trying again"
        ))
    })
}

fn review_dismissal_error(error: octocrab::Error) -> AppError {
    if let octocrab::Error::GitHub { source, .. } = &error {
        if let Some(mapped) =
            review_dismissal_status_error(source.status_code.as_u16(), &source.message)
        {
            return mapped;
        }
    }
    github_error(error)
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestReviewDismissalClient for super::super::tests::FakeGitHubClient {
    async fn pull_request_reviews(
        &self,
        token: &str,
        _owner: &str,
        _repository: &str,
        _pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestReviewPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubPullRequestReviewPage {
            reviews: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn dismiss_pull_request_review(
        &self,
        token: &str,
        _owner: &str,
        _repository: &str,
        _pull_request_number: u64,
        review_id: u64,
        _message: &str,
    ) -> Result<GitHubPullRequestReview, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubPullRequestReview {
            id: review_id,
            node_id: format!("PRR_{review_id}"),
            author: "hubot".to_string(),
            author_avatar_url: None,
            author_association: None,
            state: GitHubPullRequestReviewState::Dismissed,
            body: None,
            url: format!(
                "https://github.com/octocat/hello-world/pull/12#pullrequestreview-{review_id}"
            ),
            commit_id: None,
            submitted_at: None,
        })
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
                    assert!(read > 0, "request ended early");
                    buffer.extend_from_slice(&chunk[..read]);
                    let Some(header_end) = buffer.windows(4).position(|item| item == b"\r\n\r\n")
                    else {
                        continue;
                    };
                    let headers =
                        String::from_utf8(buffer[..header_end].to_vec()).expect("request headers");
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            let (name, value) = line.split_once(':')?;
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().expect("content length"))
                        })
                        .unwrap_or_default();
                    let expected = header_end + 4 + content_length;
                    while buffer.len() < expected {
                        let read = stream.read(&mut chunk).await.expect("mock body read");
                        assert!(read > 0, "request body ended early");
                        buffer.extend_from_slice(&chunk[..read]);
                    }
                    break;
                }
                captured
                    .lock()
                    .expect("request lock")
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
            .expect("mock base uri")
            .personal_token("github-user-access-token".to_string())
            .build()
            .expect("mock client");
        (client, requests, server)
    }

    fn author_json(login: &str) -> serde_json::Value {
        serde_json::json!({
            "login": login,
            "id": 1,
            "node_id": "U_1",
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

    fn review_json(state: &str) -> String {
        serde_json::json!({
            "id": 86,
            "node_id": "PRR_86",
            "html_url": "https://github.com/octocat/hello-world/pull/12#pullrequestreview-86",
            "user": author_json("hubot"),
            "body": "Looks good.",
            "commit_id": "abc1234",
            "state": state,
            "pull_request_url": "https://api.github.com/repos/octocat/hello-world/pulls/12",
            "submitted_at": "2026-08-26T12:00:00Z",
            "author_association": "COLLABORATOR"
        })
        .to_string()
    }

    #[test]
    fn only_decision_reviews_are_dismissible() {
        assert!(ensure_review_dismissible(GitHubPullRequestReviewState::Approved).is_ok());
        assert!(ensure_review_dismissible(GitHubPullRequestReviewState::ChangesRequested).is_ok());
        for state in [
            GitHubPullRequestReviewState::Commented,
            GitHubPullRequestReviewState::Pending,
            GitHubPullRequestReviewState::Dismissed,
        ] {
            assert!(matches!(
                ensure_review_dismissible(state),
                Err(AppError::GitHubPullRequestReviewDismissalConflict(_))
            ));
        }
    }

    #[tokio::test]
    async fn dismissal_transport_preflights_writes_and_postflights() {
        let (client, requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                headers: "",
                body: review_json("APPROVED"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: review_json("DISMISSED"),
            },
            MockResponse {
                status: "200 OK",
                headers: "",
                body: review_json("DISMISSED"),
            },
        ])
        .await;

        let review = dismiss_pull_request_review_with_client(
            &client,
            "octocat",
            "hello-world",
            12,
            86,
            "Outdated approval",
        )
        .await
        .expect("dismissed review");
        server.await.expect("mock server");

        assert_eq!(review.state, GitHubPullRequestReviewState::Dismissed);
        assert_eq!(review.node_id, "PRR_86");
        let requests = requests.lock().expect("request lock");
        assert_eq!(requests.len(), 3);
        assert!(requests[0].starts_with("GET /repos/octocat/hello-world/pulls/12/reviews/86 "));
        assert!(requests[1]
            .starts_with("PUT /repos/octocat/hello-world/pulls/12/reviews/86/dismissals "));
        assert!(requests[1].contains("\"message\":\"Outdated approval\""));
        assert!(requests[1].contains("\"event\":\"DISMISS\""));
        assert!(requests[2].starts_with("GET /repos/octocat/hello-world/pulls/12/reviews/86 "));
    }

    #[tokio::test]
    async fn review_pages_keep_node_ids_and_chronological_pagination() {
        let page = serde_json::json!([serde_json::from_str::<serde_json::Value>(&review_json(
            "CHANGES_REQUESTED"
        ),)
        .expect("review json")])
        .to_string();
        let (client, requests, server) = mock_github(vec![MockResponse {
            status: "200 OK",
            headers: "Link: <http://example.test/repos/octocat/hello-world/pulls/12/reviews?per_page=100&page=3>; rel=\"next\"\r\n",
            body: page,
        }])
        .await;

        let page = pull_request_reviews_with_client(&client, "octocat", "hello-world", 12, 2)
            .await
            .expect("review page");
        server.await.expect("mock server");

        assert_eq!(page.page, 2);
        assert!(page.has_previous);
        assert!(page.has_more);
        assert_eq!(page.reviews[0].node_id, "PRR_86");
        assert!(requests.lock().expect("request lock")[0]
            .starts_with("GET /repos/octocat/hello-world/pulls/12/reviews?per_page=100&page=2 "));
    }

    #[test]
    fn identity_and_status_conflicts_remain_refreshable() {
        let before = pull_request_review_from_octocrab(
            serde_json::from_str(&review_json("APPROVED")).expect("before review"),
        )
        .expect("mapped before");
        let mut mismatched = before.clone();
        mismatched.node_id = "PRR_other".to_string();

        assert!(matches!(
            verify_dismissed_review(&before, &mismatched),
            Err(AppError::GitHubPullRequestReviewDismissalConflict(_))
        ));
        for status in [404, 422] {
            assert!(matches!(
                review_dismissal_status_error(status, "changed"),
                Some(AppError::GitHubPullRequestReviewDismissalConflict(_))
            ));
        }
        assert!(review_dismissal_status_error(403, "forbidden").is_none());
    }

    #[test]
    fn requested_review_scope_and_complete_identity_are_required() {
        let review: octocrab::models::pulls::Review =
            serde_json::from_str(&review_json("APPROVED")).expect("review");
        assert!(verify_review_scope(&review, "octocat", "hello-world", 12, 86).is_ok());
        assert!(matches!(
            verify_review_scope(&review, "octocat", "other", 12, 86),
            Err(AppError::GitHubPullRequestReviewDismissalConflict(_))
        ));
        assert!(matches!(
            verify_review_scope(&review, "octocat", "hello-world", 12, 87),
            Err(AppError::GitHubPullRequestReviewDismissalConflict(_))
        ));

        let mut incomplete = review;
        incomplete.user = None;
        assert!(matches!(
            review_from_octocrab(incomplete),
            Err(AppError::GitHubPullRequestReviewDismissalConflict(_))
        ));
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
                    "documentation_url": "https://docs.github.com/rest/pulls/reviews"
                })
                .to_string(),
            }])
            .await;

            let error = dismiss_pull_request_review_with_client(
                &client,
                "octocat",
                "hello-world",
                12,
                86,
                "Outdated approval",
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
}
