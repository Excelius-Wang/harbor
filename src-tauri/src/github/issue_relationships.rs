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

#[async_trait]
pub(crate) trait GitHubIssueRelationshipsClient: Send + Sync {
    async fn issue_relationships(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        page: u32,
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
        let (issue_number, page) = normalize_request(issue_number, page)?;
        let token = self.load_access_token().await?;
        self.client
            .issue_relationships(&token, owner, repository, issue_number, page)
            .await
    }
}

#[async_trait]
impl GitHubIssueRelationshipsClient for OctocrabGitHubClient {
    async fn issue_relationships(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        page: u32,
    ) -> Result<GitHubIssueRelationshipsPage, AppError> {
        let client = authenticated_client(token)?;
        load_issue_relationships_with_client(&client, owner, repository, issue_number, page).await
    }
}

fn normalize_request(issue_number: u64, page: u32) -> Result<(u64, u32), AppError> {
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
    Ok((issue_number, page))
}

async fn load_issue_relationships_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
    page: u32,
) -> Result<GitHubIssueRelationshipsPage, AppError> {
    let parent = load_parent(client, owner, repository, issue_number).await?;
    if parent
        .as_ref()
        .is_some_and(|parent| relationship_is_current(parent, owner, repository, issue_number))
    {
        return Err(AppError::GitHub(
            "GitHub returned the current Issue as its own parent".to_string(),
        ));
    }
    let (sub_issues, has_more) =
        load_sub_issues(client, owner, repository, issue_number, page).await?;

    Ok(GitHubIssueRelationshipsPage {
        parent,
        sub_issues,
        page,
        has_previous: page > 1,
        has_more,
    })
}

async fn load_parent(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<Option<GitHubIssueSummary>, AppError> {
    let request = api_request(client, parent_route(owner, repository, issue_number))?;
    let response = client.execute(request).await.map_err(github_error)?;
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
    issue_summary_from_rest_value(value, "GitHub's Issue-parent endpoint returned").map(Some)
}

async fn load_sub_issues(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
    page: u32,
) -> Result<(Vec<GitHubIssueSummary>, bool), AppError> {
    let request = api_request(
        client,
        sub_issues_route(owner, repository, issue_number, page),
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
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
        .map(|value| issue_summary_from_rest_value(value, "GitHub's sub-issues endpoint returned"))
        .collect::<Result<Vec<_>, _>>()?;
    let mut issue_ids = HashSet::with_capacity(sub_issues.len());
    for sub_issue in &sub_issues {
        if relationship_is_current(sub_issue, owner, repository, issue_number) {
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
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> bool {
    related.issue.number == issue_number
        && related.repository.owner.eq_ignore_ascii_case(owner)
        && related.repository.name.eq_ignore_ascii_case(repository)
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

fn parent_route(owner: &str, repository: &str, issue_number: u64) -> String {
    format!("/repos/{owner}/{repository}/issues/{issue_number}/parent")
}

fn sub_issues_route(owner: &str, repository: &str, issue_number: u64, page: u32) -> String {
    format!(
        "/repos/{owner}/{repository}/issues/{issue_number}/sub_issues?per_page={ISSUE_RELATIONSHIP_PAGE_SIZE}&page={page}"
    )
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueRelationshipsClient for super::tests::FakeGitHubClient {
    async fn issue_relationships(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        page: u32,
    ) -> Result<GitHubIssueRelationshipsPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(GitHubIssueRelationshipsPage {
            parent: None,
            sub_issues: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }
}

#[cfg(test)]
mod tests;
