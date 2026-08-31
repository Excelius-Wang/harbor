use serde::Deserialize;

use super::{
    super::{
        github_error,
        issue::{load_issue_postflight_with_client, GitHubIssue, GitHubIssueState},
        issue_related::{issue_url_matches, IssueGraphQlRequest},
    },
    load_issue_duplicate_snapshot_with_client, IssueDuplicateSnapshot,
};
use crate::error::AppError;

const UNMARK_DUPLICATE_MUTATION: &str = r#"
mutation HarborUnmarkIssueDuplicate($duplicateId: ID!, $canonicalId: ID!) {
  unmarkIssueAsDuplicate(input: {
    duplicateId: $duplicateId
    canonicalId: $canonicalId
  }) {
    duplicate {
      __typename
      ... on Issue {
        id
        number
        state
        stateReason
        duplicateOf { id }
        repository {
          id
          nameWithOwner
        }
      }
    }
  }
}
"#;

#[derive(Clone, Copy)]
pub(crate) struct IssueDuplicateMutation<'a> {
    pub(super) request: IssueGraphQlRequest<'a>,
}

impl<'a> IssueDuplicateMutation<'a> {
    pub(super) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        expected_issue_node_id: &'a str,
    ) -> Result<Self, AppError> {
        Ok(Self {
            request: IssueGraphQlRequest::new(
                owner,
                repository,
                issue_number,
                expected_issue_node_id,
            )?,
        })
    }
}

pub(super) async fn unmark_issue_duplicate_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueDuplicateMutation<'_>,
) -> Result<GitHubIssue, AppError> {
    let preflight = load_issue_duplicate_snapshot_with_client(client, mutation.request).await?;
    let canonical_id = ensure_unmark_preflight(&preflight)?;
    let response = execute_unmark_duplicate(client, mutation, canonical_id).await?;
    ensure_unmarked_response(&response, mutation.request, &preflight.repository_id)?;

    let postflight = load_issue_duplicate_snapshot_with_client(client, mutation.request)
        .await
        .map_err(post_write_error)?;
    ensure_unmarked_snapshot(
        &postflight,
        mutation.request,
        &preflight.repository_id,
        "postflight read",
    )?;

    let issue = load_issue_postflight_with_client(
        client,
        mutation.request.owner,
        mutation.request.repository,
        mutation.request.issue_number,
    )
    .await
    .map_err(post_write_error)?;
    if issue.number != mutation.request.issue_number
        || issue.reaction_subject.id != mutation.request.expected_issue_node_id
        || !issue_url_matches(
            &issue.url,
            "github.com",
            &format!(
                "/{}/{}/issues/{}",
                mutation.request.owner, mutation.request.repository, mutation.request.issue_number
            ),
        )
        || issue.state != GitHubIssueState::Closed
        || issue.state_reason.as_deref() == Some("duplicate")
    {
        return Err(write_may_have_persisted(
            "the REST postflight returned an unexpected Issue state",
        ));
    }
    Ok(issue)
}

fn ensure_unmark_preflight(snapshot: &IssueDuplicateSnapshot) -> Result<&str, AppError> {
    let canonical = snapshot.canonical.as_ref().ok_or_else(|| {
        AppError::GitHubIssueStateConflict(
            "the Issue is no longer marked as a duplicate".to_string(),
        )
    })?;
    if !snapshot.is_marked_duplicate() {
        return Err(AppError::GitHubIssueStateConflict(
            "the Issue is no longer marked as a duplicate".to_string(),
        ));
    }
    if !matches!(
        snapshot.viewer_permission.as_deref(),
        Some("WRITE" | "MAINTAIN" | "ADMIN")
    ) {
        return Err(AppError::GitHubPermission(
            "repository write permission is required to unmark a duplicate Issue".to_string(),
        ));
    }
    Ok(&canonical.node_id)
}

async fn execute_unmark_duplicate(
    client: &octocrab::Octocrab,
    mutation: IssueDuplicateMutation<'_>,
    canonical_id: &str,
) -> Result<UnmarkedIssue, AppError> {
    let payload = serde_json::json!({
        "query": UNMARK_DUPLICATE_MUTATION,
        "variables": {
            "duplicateId": mutation.request.expected_issue_node_id,
            "canonicalId": canonical_id,
        }
    });
    let response: UnmarkDuplicateResponse =
        client.graphql(&payload).await.map_err(unmark_write_error)?;
    let duplicate = response
        .unmark_issue_as_duplicate
        .and_then(|payload| payload.duplicate)
        .ok_or_else(|| write_may_have_persisted("GitHub did not return the unmarked Issue"))?;
    match duplicate {
        UnmarkedDuplicate::Issue {
            id,
            number,
            state,
            state_reason,
            duplicate_of,
            repository,
        } => Ok(UnmarkedIssue {
            id,
            number,
            state,
            state_reason,
            duplicate_of,
            repository,
        }),
        UnmarkedDuplicate::Other => Err(write_may_have_persisted(
            "GitHub returned a pull request instead of the unmarked Issue",
        )),
    }
}

fn ensure_unmarked_response(
    issue: &UnmarkedIssue,
    request: IssueGraphQlRequest<'_>,
    expected_repository_id: &str,
) -> Result<(), AppError> {
    if issue.id != request.expected_issue_node_id
        || issue.number != request.issue_number
        || !issue
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&format!("{}/{}", request.owner, request.repository))
        || issue.repository.id != expected_repository_id
        || issue.state != "CLOSED"
        || issue.state_reason.as_deref() == Some("DUPLICATE")
        || issue.duplicate_of.is_some()
    {
        return Err(write_may_have_persisted(
            "the mutation response did not match the requested duplicate state",
        ));
    }
    Ok(())
}

fn ensure_unmarked_snapshot(
    snapshot: &IssueDuplicateSnapshot,
    request: IssueGraphQlRequest<'_>,
    expected_repository_id: &str,
    phase: &str,
) -> Result<(), AppError> {
    if snapshot.issue_node_id != request.expected_issue_node_id
        || snapshot.issue_number != request.issue_number
        || !snapshot
            .repository_full_name
            .eq_ignore_ascii_case(&format!("{}/{}", request.owner, request.repository))
        || snapshot.repository_id != expected_repository_id
        || snapshot.state != "CLOSED"
        || snapshot.state_reason.as_deref() == Some("DUPLICATE")
        || snapshot.canonical.is_some()
    {
        return Err(write_may_have_persisted(&format!(
            "the {phase} did not match the requested duplicate state"
        )));
    }
    Ok(())
}

fn write_may_have_persisted(message: &str) -> AppError {
    AppError::GitHubIssueStateConflict(format!(
        "{message}; the duplicate update may have persisted"
    ))
}

fn unmark_write_error(error: octocrab::Error) -> AppError {
    post_write_error(github_error(error))
}

fn post_write_error(error: AppError) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => write_may_have_persisted(&error.to_string()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnmarkDuplicateResponse {
    unmark_issue_as_duplicate: Option<UnmarkDuplicatePayload>,
}

#[derive(Deserialize)]
struct UnmarkDuplicatePayload {
    duplicate: Option<UnmarkedDuplicate>,
}

#[derive(Deserialize)]
#[serde(tag = "__typename")]
enum UnmarkedDuplicate {
    Issue {
        id: String,
        number: u64,
        state: String,
        #[serde(rename = "stateReason")]
        state_reason: Option<String>,
        #[serde(rename = "duplicateOf")]
        duplicate_of: Option<GraphQlNode>,
        repository: UnmarkedRepository,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnmarkedIssue {
    id: String,
    number: u64,
    state: String,
    state_reason: Option<String>,
    duplicate_of: Option<GraphQlNode>,
    repository: UnmarkedRepository,
}

#[derive(Deserialize)]
struct GraphQlNode {
    #[serde(rename = "id")]
    _id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnmarkedRepository {
    id: String,
    name_with_owner: String,
}

#[cfg(test)]
mod tests;
