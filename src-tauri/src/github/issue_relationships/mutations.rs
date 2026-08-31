use octocrab::FromResponse;
use serde::Serialize;

use super::{
    super::{
        github_error,
        issue::GitHubIssueSummary,
        issue_related::{
            api_request, api_request_with_body, related_issue_error, summary_from_rest_value,
            summary_is_current, RelatedIssueRequest,
        },
    },
    load_parent,
};
use crate::error::AppError;

#[derive(Clone, Copy)]
pub(crate) struct IssueSubIssueMutation<'a> {
    pub(super) current: RelatedIssueRequest<'a>,
    pub(super) sub_issue_number: u64,
}

impl<'a> IssueSubIssueMutation<'a> {
    pub(super) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        sub_issue_number: u64,
    ) -> Result<Self, AppError> {
        if sub_issue_number == 0 {
            return Err(AppError::Validation(
                "sub-issue number must be greater than zero".to_string(),
            ));
        }
        Ok(Self {
            current: RelatedIssueRequest::new(owner, repository, issue_number, 1)?,
            sub_issue_number,
        })
    }
}

pub(super) async fn add_issue_sub_issue_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueSubIssueMutation<'_>,
) -> Result<(), AppError> {
    resolve_issue(client, mutation.current, "current Issue").await?;
    let sub_issue_request = RelatedIssueRequest::new(
        mutation.current.owner,
        mutation.current.repository,
        mutation.sub_issue_number,
        1,
    )?;
    let sub_issue = resolve_issue(client, sub_issue_request, "sub-issue").await?;
    if summary_is_current(&sub_issue, mutation.current) {
        return Err(AppError::Validation(
            "an Issue cannot be its own sub-issue".to_string(),
        ));
    }
    if load_parent(client, sub_issue_request).await?.is_some() {
        return Err(AppError::Validation(
            "the selected Issue already has a parent".to_string(),
        ));
    }

    let created_sub_issue =
        execute_add_sub_issue(client, mutation.current, sub_issue.issue.id).await?;
    if !summary_is_current(&created_sub_issue, sub_issue_request)
        || created_sub_issue.issue.id != sub_issue.issue.id
    {
        return Err(AppError::GitHub(
            "GitHub returned an added sub-issue with an unexpected identity".to_string(),
        ));
    }
    Ok(())
}

async fn resolve_issue(
    client: &octocrab::Octocrab,
    request: RelatedIssueRequest<'_>,
    source: &str,
) -> Result<GitHubIssueSummary, AppError> {
    let http_request = api_request(client, issue_route(request))?;
    let response = client.execute(http_request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| related_issue_error(error, status))?;
    let value = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!("GitHub returned an invalid {source}: {error}"))
        })?;
    let issue = summary_from_rest_value(value, source)?;
    if !summary_is_current(&issue, request) {
        return Err(AppError::GitHub(format!(
            "GitHub returned a {source} with an unexpected identity"
        )));
    }
    Ok(issue)
}

async fn execute_add_sub_issue(
    client: &octocrab::Octocrab,
    current: RelatedIssueRequest<'_>,
    sub_issue_id: u64,
) -> Result<GitHubIssueSummary, AppError> {
    let request = api_request_with_body(
        client,
        http::Method::POST,
        add_sub_issue_route(current),
        Some(&AddSubIssuePayload {
            sub_issue_id,
            replace_parent: false,
        }),
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| sub_issue_mutation_error(error, status))?;
    if status != http::StatusCode::CREATED {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected status {status} for an Issue sub-issue update"
        )));
    }
    let value = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!(
                "GitHub returned an invalid added sub-issue: {error}"
            ))
        })?;
    summary_from_rest_value(value, "added sub-issue")
}

fn issue_route(request: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}",
        request.owner, request.repository, request.issue_number
    )
}

fn add_sub_issue_route(current: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/sub_issues",
        current.owner, current.repository, current.issue_number
    )
}

fn sub_issue_mutation_error(error: octocrab::Error, status: http::StatusCode) -> AppError {
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
struct AddSubIssuePayload {
    sub_issue_id: u64,
    replace_parent: bool,
}
