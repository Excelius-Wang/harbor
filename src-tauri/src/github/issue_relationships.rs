use std::collections::HashSet;

use async_trait::async_trait;
use octocrab::FromResponse;
use serde::Serialize;

use super::{
    authenticated_client, github_error,
    issue::{issue_summary_from_rest_value, GitHubIssueSummary},
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_RELATIONSHIP_PAGE_SIZE: u8 = 30;
const GITHUB_API_VERSION: &str = "2026-03-10";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueRelationshipsPage {
    pub parent: Option<GitHubIssueSummary>,
    pub sub_issues: Vec<GitHubIssueSummary>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueRelationshipsRequest<'a> {
    owner: &'a str,
    repository: &'a str,
    issue_number: u64,
    page: u32,
}

impl<'a> IssueRelationshipsRequest<'a> {
    fn new(
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
                "Issue relationship page must be greater than zero".to_string(),
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

#[async_trait]
pub(crate) trait GitHubIssueRelationshipsClient: Send + Sync {
    async fn issue_relationships(
        &self,
        token: &str,
        request: IssueRelationshipsRequest<'_>,
    ) -> Result<GitHubIssueRelationshipsPage, AppError>;
}

impl GitHubService {
    pub async fn issue_relationships(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        page: u32,
    ) -> Result<GitHubIssueRelationshipsPage, AppError> {
        let request = IssueRelationshipsRequest::new(owner, repository, issue_number, page)?;
        let token = self.load_access_token().await?;
        self.client.issue_relationships(&token, request).await
    }
}

#[async_trait]
impl GitHubIssueRelationshipsClient for OctocrabGitHubClient {
    async fn issue_relationships(
        &self,
        token: &str,
        request: IssueRelationshipsRequest<'_>,
    ) -> Result<GitHubIssueRelationshipsPage, AppError> {
        let client = authenticated_client(token)?;
        load_issue_relationships_with_client(&client, request).await
    }
}

async fn load_issue_relationships_with_client(
    client: &octocrab::Octocrab,
    request: IssueRelationshipsRequest<'_>,
) -> Result<GitHubIssueRelationshipsPage, AppError> {
    let parent = load_parent(client, request).await?;
    if parent
        .as_ref()
        .is_some_and(|parent| relationship_is_current(parent, request))
    {
        return Err(AppError::GitHub(
            "GitHub returned the current Issue as its own parent".to_string(),
        ));
    }
    let (sub_issues, has_more) = load_sub_issues(client, request).await?;

    Ok(GitHubIssueRelationshipsPage {
        parent,
        sub_issues,
        page: request.page,
        has_previous: request.page > 1,
        has_more,
    })
}

async fn load_parent(
    client: &octocrab::Octocrab,
    request: IssueRelationshipsRequest<'_>,
) -> Result<Option<GitHubIssueSummary>, AppError> {
    let http_request = api_request(client, parent_route(request))?;
    let response = client.execute(http_request).await.map_err(github_error)?;
    if response.status() == http::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| relationship_error(error, status))?;
    let value = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!("GitHub returned invalid Issue parent: {error}"))
        })?;
    relationship_summary_from_rest_value(value, "Issue parent").map(Some)
}

async fn load_sub_issues(
    client: &octocrab::Octocrab,
    request: IssueRelationshipsRequest<'_>,
) -> Result<(Vec<GitHubIssueSummary>, bool), AppError> {
    let http_request = api_request(client, sub_issues_route(request))?;
    let response = client.execute(http_request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| relationship_error(error, status))?;
    let has_more = response
        .headers()
        .get(http::header::LINK)
        .and_then(|value| value.to_str().ok())
        .is_some_and(link_header_has_next);
    let values = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!("GitHub returned invalid Issue sub-issues: {error}"))
        })?;
    let values = values.as_array().ok_or_else(|| {
        AppError::GitHub("GitHub returned invalid Issue sub-issues: expected an array".to_string())
    })?;
    let sub_issues = values
        .iter()
        .cloned()
        .map(|value| relationship_summary_from_rest_value(value, "sub-issue"))
        .collect::<Result<Vec<_>, _>>()?;
    let mut issue_ids = HashSet::with_capacity(sub_issues.len());
    for sub_issue in &sub_issues {
        if relationship_is_current(sub_issue, request) {
            return Err(AppError::GitHub(
                "GitHub returned the current Issue as its own sub-issue".to_string(),
            ));
        }
        if !issue_ids.insert(sub_issue.issue.id) {
            return Err(AppError::GitHub(
                "GitHub returned a duplicate Issue in the sub-issues page".to_string(),
            ));
        }
    }
    Ok((sub_issues, has_more))
}

fn relationship_is_current(
    related: &GitHubIssueSummary,
    request: IssueRelationshipsRequest<'_>,
) -> bool {
    related.issue.number == request.issue_number
        && related.repository.owner.eq_ignore_ascii_case(request.owner)
        && related
            .repository
            .name
            .eq_ignore_ascii_case(request.repository)
}

fn relationship_summary_from_rest_value(
    value: serde_json::Value,
    source: &str,
) -> Result<GitHubIssueSummary, AppError> {
    let api_url = value
        .get("url")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| invalid_relationship_identity(source))?;
    let summary =
        issue_summary_from_rest_value(value, &format!("GitHub's {source} endpoint returned"))?;
    validate_relationship_identity(&summary, &api_url, source)?;
    Ok(summary)
}

fn validate_relationship_identity(
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
        return Err(invalid_relationship_identity(source));
    }
    Ok(())
}

fn issue_url_matches(value: &str, host: &str, path: &str) -> bool {
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

fn invalid_relationship_identity(source: &str) -> AppError {
    AppError::GitHub(format!("GitHub returned an invalid {source} identity"))
}

fn api_request(
    client: &octocrab::Octocrab,
    route: String,
) -> Result<http::Request<octocrab::OctoBody>, AppError> {
    let request = http::Request::builder()
        .method(http::Method::GET)
        .uri(route)
        .header(http::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION);
    client
        .build_request(request, None::<&()>)
        .map_err(github_error)
}

fn link_header_has_next(value: &str) -> bool {
    value.split(',').any(|part| {
        part.split(';')
            .skip(1)
            .any(|parameter| parameter.trim() == "rel=\"next\"")
    })
}

fn relationship_error(error: octocrab::Error, status: http::StatusCode) -> AppError {
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

fn parent_route(request: IssueRelationshipsRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/parent",
        request.owner, request.repository, request.issue_number
    )
}

fn sub_issues_route(request: IssueRelationshipsRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/sub_issues?per_page={ISSUE_RELATIONSHIP_PAGE_SIZE}&page={}",
        request.owner, request.repository, request.issue_number, request.page
    )
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueRelationshipsClient for super::tests::FakeGitHubClient {
    async fn issue_relationships(
        &self,
        token: &str,
        request: IssueRelationshipsRequest<'_>,
    ) -> Result<GitHubIssueRelationshipsPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (request.owner, request.repository, request.issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(GitHubIssueRelationshipsPage {
            parent: None,
            sub_issues: Vec::new(),
            page: request.page,
            has_previous: request.page > 1,
            has_more: false,
        })
    }
}

#[cfg(test)]
mod tests;
