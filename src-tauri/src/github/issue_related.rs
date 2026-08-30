use super::{
    github_error,
    issue::{issue_summary_from_rest_value, GitHubIssueSummary},
};
use crate::error::AppError;
use octocrab::FromResponse;
use serde::Serialize;

pub(super) const RELATED_ISSUE_PAGE_SIZE: u8 = 30;
const GITHUB_API_VERSION: &str = "2026-03-10";

#[derive(Clone, Copy)]
pub(crate) struct RelatedIssueRequest<'a> {
    pub(super) owner: &'a str,
    pub(super) repository: &'a str,
    pub(super) issue_number: u64,
    pub(super) page: u32,
}

impl<'a> RelatedIssueRequest<'a> {
    pub(super) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        page: u32,
    ) -> Result<Self, AppError> {
        if issue_number == 0 {
            return Err(AppError::Validation(
                "issue number must be greater than zero".to_string(),
            ));
        }
        if page == 0 {
            return Err(AppError::Validation(
                "related Issue page must be greater than zero".to_string(),
            ));
        }
        Ok(Self {
            owner,
            repository,
            issue_number,
            page,
        })
    }
}

pub(super) fn summary_is_current(
    summary: &GitHubIssueSummary,
    request: RelatedIssueRequest<'_>,
) -> bool {
    summary.issue.number == request.issue_number
        && summary.repository.owner.eq_ignore_ascii_case(request.owner)
        && summary
            .repository
            .name
            .eq_ignore_ascii_case(request.repository)
}

pub(super) fn summary_from_rest_value(
    value: serde_json::Value,
    source: &str,
) -> Result<GitHubIssueSummary, AppError> {
    let api_url = value
        .get("url")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| invalid_identity(source))?;
    let summary =
        issue_summary_from_rest_value(value, &format!("GitHub's {source} endpoint returned"))?;
    validate_identity(&summary, &api_url, source)?;
    Ok(summary)
}

pub(super) async fn load_page(
    client: &octocrab::Octocrab,
    route: String,
    source: &str,
) -> Result<(Vec<GitHubIssueSummary>, bool), AppError> {
    let http_request = api_request(client, route)?;
    let response = client.execute(http_request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| related_issue_error(error, status))?;
    let has_more = response
        .headers()
        .get(http::header::LINK)
        .and_then(|value| value.to_str().ok())
        .is_some_and(link_header_has_next);
    let values = serde_json::Value::from_response(response)
        .await
        .map_err(|error| AppError::GitHub(format!("GitHub returned invalid {source}: {error}")))?;
    let values = values.as_array().ok_or_else(|| {
        AppError::GitHub(format!(
            "GitHub returned invalid {source}: expected an array"
        ))
    })?;
    let summaries = values
        .iter()
        .cloned()
        .map(|value| summary_from_rest_value(value, source))
        .collect::<Result<Vec<_>, _>>()?;
    Ok((summaries, has_more))
}

pub(super) fn api_request(
    client: &octocrab::Octocrab,
    route: String,
) -> Result<http::Request<octocrab::OctoBody>, AppError> {
    api_request_with_body(client, http::Method::GET, route, None::<&()>)
}

pub(super) fn api_request_with_body<T: Serialize + ?Sized>(
    client: &octocrab::Octocrab,
    method: http::Method,
    route: String,
    body: Option<&T>,
) -> Result<http::Request<octocrab::OctoBody>, AppError> {
    let request = http::Request::builder()
        .method(method)
        .uri(route)
        .header(http::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION);
    client.build_request(request, body).map_err(github_error)
}

pub(super) fn link_header_has_next(value: &str) -> bool {
    value.split(',').any(|part| {
        part.split(';')
            .skip(1)
            .any(|parameter| parameter.trim() == "rel=\"next\"")
    })
}

pub(super) fn related_issue_error(error: octocrab::Error, status: http::StatusCode) -> AppError {
    let mapped = github_error(error);
    if matches!(
        mapped,
        AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)
    ) {
        return mapped;
    }
    match status {
        http::StatusCode::MOVED_PERMANENTLY => AppError::GitHubIssueMoved(
            "GitHub reported that the Issue repository location changed".to_string(),
        ),
        http::StatusCode::GONE => {
            AppError::GitHub("GitHub reported that the Issue is no longer available".to_string())
        }
        _ => mapped,
    }
}

fn validate_identity(
    summary: &GitHubIssueSummary,
    api_url: &str,
    source: &str,
) -> Result<(), AppError> {
    let issue = &summary.issue;
    if issue.id == 0
        || issue.number == 0
        || issue.reaction_subject.id.trim().is_empty()
        || issue.reaction_subject.id.chars().any(char::is_whitespace)
        || !issue_url_matches(
            api_url,
            "api.github.com",
            &format!(
                "/repos/{}/{}/issues/{}",
                summary.repository.owner, summary.repository.name, issue.number
            ),
        )
        || !issue_url_matches(
            &issue.url,
            "github.com",
            &format!(
                "/{}/{}/issues/{}",
                summary.repository.owner, summary.repository.name, issue.number
            ),
        )
    {
        return Err(invalid_identity(source));
    }
    Ok(())
}

pub(super) fn issue_url_matches(value: &str, host: &str, path: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|value| value.eq_ignore_ascii_case(host))
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.path().eq_ignore_ascii_case(path)
        && url.query().is_none()
        && url.fragment().is_none()
}

fn invalid_identity(source: &str) -> AppError {
    AppError::GitHub(format!("GitHub returned an invalid {source} identity"))
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::sync::{Arc, Mutex};

    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    pub(crate) struct MockResponse {
        pub(crate) status: &'static str,
        pub(crate) headers: Vec<(&'static str, &'static str)>,
        pub(crate) body: String,
    }

    pub(crate) fn issue_json(
        owner: &str,
        repository: &str,
        number: u64,
        state_reason: &str,
    ) -> serde_json::Value {
        serde_json::json!({
            "id": number,
            "node_id": format!("I_{owner}_{repository}_{number}"),
            "url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}"),
            "repository_url": format!("https://api.github.com/repos/{owner}/{repository}"),
            "labels_url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}/labels{{/name}}"),
            "comments_url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}/comments"),
            "events_url": format!("https://api.github.com/repos/{owner}/{repository}/issues/{number}/events"),
            "html_url": format!("https://github.com/{owner}/{repository}/issues/{number}"),
            "number": number,
            "state": "closed",
            "state_reason": state_reason,
            "title": format!("Issue {number}"),
            "body": "Issue body",
            "user": {
                "login": "octocat",
                "id": 1,
                "node_id": "U_1",
                "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
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
                "received_events_url": "https://api.github.com/users/octocat/events{/privacy}",
                "type": "User",
                "site_admin": false
            },
            "labels": [],
            "assignee": null,
            "assignees": [],
            "milestone": null,
            "locked": false,
            "comments": 2,
            "pull_request": null,
            "closed_at": "2026-08-30T08:01:00Z",
            "created_at": "2026-08-24T08:00:00Z",
            "updated_at": "2026-08-30T08:01:00Z"
        })
    }

    pub(crate) async fn mock_github(
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
                    if read == 0 {
                        break;
                    }
                    buffer.extend_from_slice(&chunk[..read]);
                    if let Some(header_end) =
                        buffer.windows(4).position(|window| window == b"\r\n\r\n")
                    {
                        let headers = String::from_utf8_lossy(&buffer[..header_end]);
                        let content_length = headers.lines().find_map(|line| {
                            line.split_once(':').and_then(|(name, value)| {
                                name.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse::<usize>().ok())
                                    .flatten()
                            })
                        });
                        let body_end = header_end + 4 + content_length.unwrap_or(0);
                        if buffer.len() >= body_end {
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
        let client = octocrab::Octocrab::builder()
            .base_uri(format!("http://{address}"))
            .expect("mock base uri")
            .personal_token("github-user-access-token".to_string())
            .build()
            .expect("mock client");
        (client, requests, server)
    }

    pub(crate) fn assert_rest_request(request: &str, route: &str) {
        assert!(request.starts_with(&format!("GET {route} HTTP/1.1")));
        let request = request.to_ascii_lowercase();
        assert!(request.contains("accept: application/vnd.github+json"));
        assert!(request.contains("x-github-api-version: 2026-03-10"));
    }
}
