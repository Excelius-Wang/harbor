use std::collections::HashSet;

use async_trait::async_trait;
use octocrab::FromResponse;
use serde::Serialize;

use super::{
    authenticated_client, github_error,
    issue::GitHubIssueSummary,
    issue_related::{
        api_request, load_page, related_issue_error, summary_from_rest_value, summary_is_current,
        RelatedIssueRequest, RELATED_ISSUE_PAGE_SIZE,
    },
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

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
        request: RelatedIssueRequest<'_>,
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
        let request = RelatedIssueRequest::new(owner, repository, issue_number, page)?;
        let token = self.load_access_token().await?;
        self.client.issue_relationships(&token, request).await
    }
}

#[async_trait]
impl GitHubIssueRelationshipsClient for OctocrabGitHubClient {
    async fn issue_relationships(
        &self,
        token: &str,
        request: RelatedIssueRequest<'_>,
    ) -> Result<GitHubIssueRelationshipsPage, AppError> {
        let client = authenticated_client(token)?;
        load_issue_relationships_with_client(&client, request).await
    }
}

async fn load_issue_relationships_with_client(
    client: &octocrab::Octocrab,
    request: RelatedIssueRequest<'_>,
) -> Result<GitHubIssueRelationshipsPage, AppError> {
    let parent = load_parent(client, request).await?;
    if parent
        .as_ref()
        .is_some_and(|parent| summary_is_current(parent, request))
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
    request: RelatedIssueRequest<'_>,
) -> Result<Option<GitHubIssueSummary>, AppError> {
    let http_request = api_request(client, parent_route(request))?;
    let response = client.execute(http_request).await.map_err(github_error)?;
    if response.status() == http::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| related_issue_error(error, status))?;
    let value = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!("GitHub returned invalid Issue parent: {error}"))
        })?;
    summary_from_rest_value(value, "Issue parent").map(Some)
}

async fn load_sub_issues(
    client: &octocrab::Octocrab,
    request: RelatedIssueRequest<'_>,
) -> Result<(Vec<GitHubIssueSummary>, bool), AppError> {
    let (sub_issues, has_more) =
        load_page(client, sub_issues_route(request), "Issue sub-issues").await?;
    let mut issue_ids = HashSet::with_capacity(sub_issues.len());
    for sub_issue in &sub_issues {
        if summary_is_current(sub_issue, request) {
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

fn parent_route(request: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/parent",
        request.owner, request.repository, request.issue_number
    )
}

fn sub_issues_route(request: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/sub_issues?per_page={RELATED_ISSUE_PAGE_SIZE}&page={}",
        request.owner, request.repository, request.issue_number, request.page
    )
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueRelationshipsClient for super::tests::FakeGitHubClient {
    async fn issue_relationships(
        &self,
        token: &str,
        request: RelatedIssueRequest<'_>,
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
