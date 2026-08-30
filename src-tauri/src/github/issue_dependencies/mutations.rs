use octocrab::FromResponse;
use serde::Serialize;

use super::super::{
    github_error,
    issue::GitHubIssueSummary,
    issue_related::{
        api_request_with_body, load_page, related_issue_error, summary_from_rest_value,
        summary_is_current, RelatedIssueRequest,
    },
};
use super::validate_dependencies;
use crate::error::AppError;

#[derive(Clone, Copy)]
pub(crate) struct IssueDependencyMutation<'a> {
    pub(super) current: RelatedIssueRequest<'a>,
    pub(super) blocking_owner: &'a str,
    pub(super) blocking_repository: &'a str,
    pub(super) blocking_issue_number: u64,
}

impl<'a> IssueDependencyMutation<'a> {
    pub(super) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        blocking_owner: &'a str,
        blocking_repository: &'a str,
        blocking_issue_number: u64,
    ) -> Result<Self, AppError> {
        if blocking_issue_number == 0 {
            return Err(AppError::Validation(
                "blocking Issue number must be greater than zero".to_string(),
            ));
        }
        Ok(Self {
            current: RelatedIssueRequest::new(owner, repository, issue_number, 1)?,
            blocking_owner,
            blocking_repository,
            blocking_issue_number,
        })
    }
}

pub(super) async fn add_issue_dependency_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueDependencyMutation<'_>,
) -> Result<(), AppError> {
    let blocking_issue = resolve_blocking_issue(client, mutation).await?;
    if summary_is_current(&blocking_issue, mutation.current) {
        return Err(AppError::Validation(
            "an Issue cannot be blocked by itself".to_string(),
        ));
    }
    ensure_dependency_is_new(client, mutation.current, blocking_issue.issue.id).await?;

    execute_dependency_mutation(
        client,
        http::Method::POST,
        add_blocked_by_route(mutation.current),
        Some(&IssueDependencyPayload {
            issue_id: blocking_issue.issue.id,
        }),
        http::StatusCode::CREATED,
    )
    .await
}

pub(super) async fn remove_issue_dependency_with_client(
    client: &octocrab::Octocrab,
    current: RelatedIssueRequest<'_>,
    blocking_issue_id: u64,
) -> Result<(), AppError> {
    if blocking_issue_id == 0 {
        return Err(AppError::Validation(
            "blocking Issue ID must be greater than zero".to_string(),
        ));
    }
    execute_dependency_mutation::<()>(
        client,
        http::Method::DELETE,
        remove_blocked_by_route(current, blocking_issue_id),
        None,
        http::StatusCode::OK,
    )
    .await
}

pub(super) fn add_blocked_by_route(current: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/dependencies/blocked_by",
        current.owner, current.repository, current.issue_number
    )
}

pub(super) fn remove_blocked_by_route(
    current: RelatedIssueRequest<'_>,
    blocking_issue_id: u64,
) -> String {
    format!("{}/{blocking_issue_id}", add_blocked_by_route(current))
}

async fn resolve_blocking_issue(
    client: &octocrab::Octocrab,
    mutation: IssueDependencyMutation<'_>,
) -> Result<GitHubIssueSummary, AppError> {
    let route = format!(
        "/repos/{}/{}/issues/{}",
        mutation.blocking_owner, mutation.blocking_repository, mutation.blocking_issue_number
    );
    let request = api_request_with_body(client, http::Method::GET, route, None::<&()>)?;
    let response = client.execute(request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| related_issue_error(error, status))?;
    let value = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!(
                "GitHub returned an invalid blocking Issue: {error}"
            ))
        })?;
    let summary = summary_from_rest_value(value, "blocking Issue")?;
    if !summary_matches_location(
        &summary,
        mutation.blocking_owner,
        mutation.blocking_repository,
        mutation.blocking_issue_number,
    ) {
        return Err(AppError::GitHub(
            "GitHub returned a blocking Issue with an unexpected identity".to_string(),
        ));
    }
    Ok(summary)
}

async fn ensure_dependency_is_new(
    client: &octocrab::Octocrab,
    current: RelatedIssueRequest<'_>,
    blocking_issue_id: u64,
) -> Result<(), AppError> {
    let mut page = 1;
    loop {
        let request = RelatedIssueRequest::new(
            current.owner,
            current.repository,
            current.issue_number,
            page,
        )?;
        let (dependencies, has_more) = load_page(
            client,
            blocked_by_mutation_check_route(request),
            "blocked-by dependency",
        )
        .await?;
        validate_dependencies(&dependencies, request, "blocked-by dependency")?;
        if dependencies
            .iter()
            .any(|dependency| dependency.issue.id == blocking_issue_id)
        {
            return Err(AppError::Validation(
                "the selected Issue already blocks this Issue".to_string(),
            ));
        }
        if !has_more {
            return Ok(());
        }
        page = page.checked_add(1).ok_or_else(|| {
            AppError::GitHub("GitHub returned too many dependency pages".to_string())
        })?;
    }
}

async fn execute_dependency_mutation<T: Serialize + ?Sized>(
    client: &octocrab::Octocrab,
    method: http::Method,
    route: String,
    body: Option<&T>,
    expected_status: http::StatusCode,
) -> Result<(), AppError> {
    let request = api_request_with_body(client, method, route, body)?;
    let response = client.execute(request).await.map_err(github_error)?;
    let status = response.status();
    octocrab::map_github_error(response)
        .await
        .map_err(|error| issue_dependency_mutation_error(error, status))?;
    if status != expected_status {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected status {status} for an Issue dependency update"
        )));
    }
    Ok(())
}

fn blocked_by_mutation_check_route(request: RelatedIssueRequest<'_>) -> String {
    format!(
        "{}?per_page=100&page={}",
        add_blocked_by_route(request),
        request.page
    )
}

fn summary_matches_location(
    summary: &GitHubIssueSummary,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> bool {
    summary.issue.number == issue_number
        && summary.repository.owner.eq_ignore_ascii_case(owner)
        && summary.repository.name.eq_ignore_ascii_case(repository)
}

fn issue_dependency_mutation_error(error: octocrab::Error, status: http::StatusCode) -> AppError {
    let mapped = related_issue_error(error, status);
    if matches!(
        mapped,
        AppError::GitHubPermission(_)
            | AppError::GitHubRateLimited(_)
            | AppError::GitHubIssueMoved(_)
    ) {
        return mapped;
    }
    if status == http::StatusCode::UNPROCESSABLE_ENTITY {
        return AppError::Validation(mapped.to_string());
    }
    mapped
}

#[derive(Serialize)]
struct IssueDependencyPayload {
    issue_id: u64,
}
