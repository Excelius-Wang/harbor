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
    load_parent, load_sub_issues, GitHubIssueSubIssuePlacement,
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

#[derive(Clone, Copy)]
pub(crate) struct IssueSubIssuePriorityMutation<'a> {
    pub(super) current: RelatedIssueRequest<'a>,
    pub(super) sub_issue_number: u64,
    pub(super) relative_issue_number: u64,
    pub(super) placement: GitHubIssueSubIssuePlacement,
}

impl<'a> IssueSubIssuePriorityMutation<'a> {
    pub(crate) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        page: u32,
        sub_issue_number: u64,
        relative_issue_number: u64,
        placement: GitHubIssueSubIssuePlacement,
    ) -> Result<Self, AppError> {
        if sub_issue_number == 0 || relative_issue_number == 0 {
            return Err(AppError::Validation(
                "sub-issue numbers must be greater than zero".to_string(),
            ));
        }
        if sub_issue_number == relative_issue_number {
            return Err(AppError::Validation(
                "a sub-issue cannot be positioned relative to itself".to_string(),
            ));
        }
        Ok(Self {
            current: RelatedIssueRequest::new(owner, repository, issue_number, page)?,
            sub_issue_number,
            relative_issue_number,
            placement,
        })
    }
}

pub(super) async fn add_issue_sub_issue_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueSubIssueMutation<'_>,
) -> Result<(), AppError> {
    let (_, sub_issue_request, sub_issue) = resolve_mutation_issues(client, mutation).await?;
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

pub(super) async fn remove_issue_sub_issue_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueSubIssueMutation<'_>,
) -> Result<(), AppError> {
    let (current_issue, sub_issue_request, sub_issue) =
        resolve_mutation_issues(client, mutation).await?;

    let parent = load_parent(client, sub_issue_request).await?;
    if parent.as_ref().is_none_or(|parent| {
        !summary_is_current(parent, mutation.current) || parent.issue.id != current_issue.issue.id
    }) {
        return Err(AppError::Validation(
            "the selected Issue is not a sub-issue of the current Issue".to_string(),
        ));
    }

    execute_remove_sub_issue(client, mutation.current, sub_issue.issue.id).await?;
    if load_parent(client, sub_issue_request).await?.is_some() {
        return Err(AppError::GitHub(
            "GitHub accepted the sub-issue removal, but Harbor could not confirm it".to_string(),
        ));
    }
    Ok(())
}

pub(super) async fn reprioritize_issue_sub_issue_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueSubIssuePriorityMutation<'_>,
) -> Result<(), AppError> {
    resolve_issue(client, mutation.current, "current Issue").await?;
    let (sub_issues, _) = load_sub_issues(client, mutation.current).await?;
    let (sub_issue_index, relative_issue_index) = priority_indices(&sub_issues, mutation)
        .ok_or_else(|| {
            AppError::Validation(
                "the selected sub-issues are not available in this repository page".to_string(),
            )
        })?;
    if !priority_order_matches(
        sub_issue_index,
        relative_issue_index,
        mutation.placement,
        false,
    ) {
        return Err(AppError::Validation(
            "the selected sub-issues are no longer adjacent in the requested order".to_string(),
        ));
    }
    let sub_issue = &sub_issues[sub_issue_index];
    let relative_issue = &sub_issues[relative_issue_index];

    let updated_sub_issue = execute_reprioritize_sub_issue(
        client,
        mutation.current,
        sub_issue.issue.id,
        relative_issue.issue.id,
        mutation.placement,
    )
    .await?;
    if !summary_matches_repository_issue(
        &updated_sub_issue,
        mutation.current,
        mutation.sub_issue_number,
    ) || updated_sub_issue.issue.id != sub_issue.issue.id
    {
        return Err(AppError::GitHub(
            "GitHub returned a reprioritized sub-issue with an unexpected identity".to_string(),
        ));
    }

    let (sub_issues, _) = load_sub_issues(client, mutation.current).await?;
    let confirmed = priority_indices(&sub_issues, mutation).is_some_and(
        |(sub_issue_index, relative_issue_index)| {
            priority_order_matches(
                sub_issue_index,
                relative_issue_index,
                mutation.placement,
                true,
            )
        },
    );
    if !confirmed {
        return Err(AppError::GitHub(
            "GitHub accepted the sub-issue reprioritization, but Harbor could not confirm it"
                .to_string(),
        ));
    }
    Ok(())
}

fn priority_indices(
    sub_issues: &[GitHubIssueSummary],
    mutation: IssueSubIssuePriorityMutation<'_>,
) -> Option<(usize, usize)> {
    let sub_issue_index = sub_issues.iter().position(|summary| {
        summary_matches_repository_issue(summary, mutation.current, mutation.sub_issue_number)
    })?;
    let relative_issue_index = sub_issues.iter().position(|summary| {
        summary_matches_repository_issue(summary, mutation.current, mutation.relative_issue_number)
    })?;
    Some((sub_issue_index, relative_issue_index))
}

fn summary_matches_repository_issue(
    summary: &GitHubIssueSummary,
    current: RelatedIssueRequest<'_>,
    issue_number: u64,
) -> bool {
    summary.issue.number == issue_number
        && summary.repository.owner.eq_ignore_ascii_case(current.owner)
        && summary
            .repository
            .name
            .eq_ignore_ascii_case(current.repository)
}

fn priority_order_matches(
    sub_issue_index: usize,
    relative_issue_index: usize,
    placement: GitHubIssueSubIssuePlacement,
    after_write: bool,
) -> bool {
    match (placement, after_write) {
        (GitHubIssueSubIssuePlacement::Before, false) => {
            relative_issue_index.checked_add(1) == Some(sub_issue_index)
        }
        (GitHubIssueSubIssuePlacement::Before, true) => {
            sub_issue_index.checked_add(1) == Some(relative_issue_index)
        }
        (GitHubIssueSubIssuePlacement::After, false) => {
            sub_issue_index.checked_add(1) == Some(relative_issue_index)
        }
        (GitHubIssueSubIssuePlacement::After, true) => {
            relative_issue_index.checked_add(1) == Some(sub_issue_index)
        }
    }
}

async fn resolve_mutation_issues<'a>(
    client: &octocrab::Octocrab,
    mutation: IssueSubIssueMutation<'a>,
) -> Result<
    (
        GitHubIssueSummary,
        RelatedIssueRequest<'a>,
        GitHubIssueSummary,
    ),
    AppError,
> {
    let current_issue = resolve_issue(client, mutation.current, "current Issue").await?;
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
    Ok((current_issue, sub_issue_request, sub_issue))
}

pub(super) async fn resolve_issue(
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

async fn execute_remove_sub_issue(
    client: &octocrab::Octocrab,
    current: RelatedIssueRequest<'_>,
    sub_issue_id: u64,
) -> Result<(), AppError> {
    let request = api_request_with_body(
        client,
        http::Method::DELETE,
        remove_sub_issue_route(current),
        Some(&RemoveSubIssuePayload { sub_issue_id }),
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let status = response.status();
    octocrab::map_github_error(response)
        .await
        .map_err(|error| sub_issue_mutation_error(error, status))?;
    if status != http::StatusCode::OK {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected status {status} for an Issue sub-issue removal"
        )));
    }
    Ok(())
}

async fn execute_reprioritize_sub_issue(
    client: &octocrab::Octocrab,
    current: RelatedIssueRequest<'_>,
    sub_issue_id: u64,
    relative_issue_id: u64,
    placement: GitHubIssueSubIssuePlacement,
) -> Result<GitHubIssueSummary, AppError> {
    let (before_id, after_id) = match placement {
        GitHubIssueSubIssuePlacement::Before => (Some(relative_issue_id), None),
        GitHubIssueSubIssuePlacement::After => (None, Some(relative_issue_id)),
    };
    let request = api_request_with_body(
        client,
        http::Method::PATCH,
        reprioritize_sub_issue_route(current),
        Some(&ReprioritizeSubIssuePayload {
            sub_issue_id,
            before_id,
            after_id,
        }),
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| sub_issue_mutation_error(error, status))?;
    if status != http::StatusCode::OK {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected status {status} for an Issue sub-issue reprioritization"
        )));
    }
    let value = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!(
                "GitHub returned an invalid reprioritized sub-issue: {error}"
            ))
        })?;
    summary_from_rest_value(value, "reprioritized sub-issue")
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

fn remove_sub_issue_route(current: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/sub_issue",
        current.owner, current.repository, current.issue_number
    )
}

fn reprioritize_sub_issue_route(current: RelatedIssueRequest<'_>) -> String {
    format!(
        "/repos/{}/{}/issues/{}/sub_issues/priority",
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
    if matches!(
        status,
        http::StatusCode::BAD_REQUEST | http::StatusCode::UNPROCESSABLE_ENTITY
    ) {
        return AppError::Validation(mapped.to_string());
    }
    mapped
}

#[derive(Serialize)]
struct AddSubIssuePayload {
    sub_issue_id: u64,
    replace_parent: bool,
}

#[derive(Serialize)]
struct RemoveSubIssuePayload {
    sub_issue_id: u64,
}

#[derive(Serialize)]
struct ReprioritizeSubIssuePayload {
    sub_issue_id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    before_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    after_id: Option<u64>,
}
