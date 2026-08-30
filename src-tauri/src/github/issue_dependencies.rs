use std::collections::HashSet;

use async_trait::async_trait;
use serde::Serialize;

use super::{
    authenticated_client,
    issue::GitHubIssueSummary,
    issue_related::{load_page, summary_is_current, RelatedIssueRequest, RELATED_ISSUE_PAGE_SIZE},
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueDependenciesPage {
    pub blocked_by: Vec<GitHubIssueSummary>,
    pub blocking: Vec<GitHubIssueSummary>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[async_trait]
pub(crate) trait GitHubIssueDependenciesClient: Send + Sync {
    async fn issue_dependencies(
        &self,
        token: &str,
        request: RelatedIssueRequest<'_>,
    ) -> Result<GitHubIssueDependenciesPage, AppError>;
}

impl GitHubService {
    pub async fn issue_dependencies(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        page: u32,
    ) -> Result<GitHubIssueDependenciesPage, AppError> {
        let request = RelatedIssueRequest::new(owner, repository, issue_number, page)?;
        let token = self.load_access_token().await?;
        self.client.issue_dependencies(&token, request).await
    }
}

#[async_trait]
impl GitHubIssueDependenciesClient for OctocrabGitHubClient {
    async fn issue_dependencies(
        &self,
        token: &str,
        request: RelatedIssueRequest<'_>,
    ) -> Result<GitHubIssueDependenciesPage, AppError> {
        let client = authenticated_client(token)?;
        load_issue_dependencies_with_client(&client, request).await
    }
}

async fn load_issue_dependencies_with_client(
    client: &octocrab::Octocrab,
    request: RelatedIssueRequest<'_>,
) -> Result<GitHubIssueDependenciesPage, AppError> {
    let (blocked_by, blocked_by_has_more) =
        load_dependencies(client, request, blocked_by_route, "blocked-by dependency").await?;
    let (blocking, blocking_has_more) =
        load_dependencies(client, request, blocking_route, "blocking dependency").await?;

    Ok(GitHubIssueDependenciesPage {
        blocked_by,
        blocking,
        page: request.page,
        has_previous: request.page > 1,
        has_more: blocked_by_has_more || blocking_has_more,
    })
}

async fn load_dependencies(
    client: &octocrab::Octocrab,
    request: RelatedIssueRequest<'_>,
    route: fn(RelatedIssueRequest<'_>) -> String,
    source: &str,
) -> Result<(Vec<GitHubIssueSummary>, bool), AppError> {
    let (dependencies, has_more) = load_page(client, route(request), source).await?;
    validate_dependencies(&dependencies, request, source)?;
    Ok((dependencies, has_more))
}

fn validate_dependencies(
    dependencies: &[GitHubIssueSummary],
    request: RelatedIssueRequest<'_>,
    source: &str,
) -> Result<(), AppError> {
    let mut issue_ids = HashSet::with_capacity(dependencies.len());
    for dependency in dependencies {
        if summary_is_current(dependency, request) {
            return Err(AppError::GitHub(format!(
                "GitHub returned the current Issue as a {source}"
            )));
        }
        if !issue_ids.insert(dependency.issue.id) {
            return Err(AppError::GitHub(format!(
                "GitHub returned a duplicate {source}"
            )));
        }
    }
    Ok(())
}

fn blocked_by_route(request: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/dependencies/blocked_by?per_page={RELATED_ISSUE_PAGE_SIZE}&page={}",
        request.owner, request.repository, request.issue_number, request.page
    )
}

fn blocking_route(request: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/dependencies/blocking?per_page={RELATED_ISSUE_PAGE_SIZE}&page={}",
        request.owner, request.repository, request.issue_number, request.page
    )
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueDependenciesClient for super::tests::FakeGitHubClient {
    async fn issue_dependencies(
        &self,
        token: &str,
        request: RelatedIssueRequest<'_>,
    ) -> Result<GitHubIssueDependenciesPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (request.owner, request.repository, request.issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(GitHubIssueDependenciesPage {
            blocked_by: Vec::new(),
            blocking: Vec::new(),
            page: request.page,
            has_previous: request.page > 1,
            has_more: false,
        })
    }
}

#[cfg(test)]
mod tests;
