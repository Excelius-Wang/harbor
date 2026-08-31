use serde::Deserialize;

use super::{post_write_error, write_may_have_persisted};
use crate::{
    error::AppError,
    github::{
        github_error,
        issue::{load_issue_postflight_with_client, GitHubIssue, GitHubIssueState},
        issue_duplicate::{load_issue_duplicate_snapshot_with_client, IssueDuplicateSnapshot},
        issue_related::{graphql_node_id_is_valid, issue_url_matches, IssueGraphQlRequest},
    },
};

const MARK_DUPLICATE_PREFLIGHT_QUERY: &str = r#"
query HarborMarkIssueDuplicatePreflight(
  $sourceOwner: String!
  $sourceRepository: String!
  $sourceNumber: Int!
  $canonicalOwner: String!
  $canonicalRepository: String!
  $canonicalNumber: Int!
) {
  sourceRepository: repository(owner: $sourceOwner, name: $sourceRepository) {
    id
    nameWithOwner
    source: issue(number: $sourceNumber) {
      id
      number
      state
      stateReason
      duplicateOf { id }
      viewerCanClose
    }
  }
  canonicalRepository: repository(owner: $canonicalOwner, name: $canonicalRepository) {
    id
    nameWithOwner
    canonical: issue(number: $canonicalNumber) {
      id
      number
      title
      url
      stateReason
      duplicateOf { id }
      repository {
        id
        nameWithOwner
      }
    }
  }
}
"#;

const MARK_DUPLICATE_MUTATION: &str = r#"
mutation HarborMarkIssueDuplicate($sourceId: ID!, $canonicalId: ID!) {
  closeIssue(input: {
    issueId: $sourceId
    stateReason: DUPLICATE
    duplicateIssueId: $canonicalId
  }) {
    issue {
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
"#;

#[derive(Clone, Copy)]
pub(crate) struct IssueDuplicateMarkMutation<'a> {
    pub(crate) request: IssueGraphQlRequest<'a>,
    pub(crate) canonical_owner: &'a str,
    pub(crate) canonical_repository: &'a str,
    pub(crate) canonical_issue_number: u64,
}

impl<'a> IssueDuplicateMarkMutation<'a> {
    pub(crate) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        canonical_owner: &'a str,
        canonical_repository: &'a str,
        canonical_issue_number: u64,
        expected_issue_node_id: &'a str,
    ) -> Result<Self, AppError> {
        let request =
            IssueGraphQlRequest::new(owner, repository, issue_number, expected_issue_node_id)?;
        if canonical_issue_number == 0
            || (canonical_issue_number == issue_number
                && canonical_owner.eq_ignore_ascii_case(owner)
                && canonical_repository.eq_ignore_ascii_case(repository))
        {
            return Err(AppError::Validation(
                "the canonical Issue must be a different positive Issue".to_string(),
            ));
        }
        Ok(Self {
            request,
            canonical_owner,
            canonical_repository,
            canonical_issue_number,
        })
    }
}

pub(crate) async fn mark_issue_duplicate_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueDuplicateMarkMutation<'_>,
) -> Result<GitHubIssue, AppError> {
    let preflight = load_mark_preflight(client, mutation).await?;
    let response = execute_mark_duplicate(client, &preflight).await?;
    ensure_marked_response(&response, mutation.request, &preflight)?;

    let postflight = load_issue_duplicate_snapshot_with_client(client, mutation.request)
        .await
        .map_err(post_write_error)?;
    ensure_marked_snapshot(&postflight, mutation.request, &preflight)?;

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
        || issue.state_reason.as_deref() != Some("duplicate")
    {
        return Err(write_may_have_persisted(
            "the REST postflight returned an unexpected duplicate Issue state",
        ));
    }
    Ok(issue)
}

async fn load_mark_preflight(
    client: &octocrab::Octocrab,
    mutation: IssueDuplicateMarkMutation<'_>,
) -> Result<MarkDuplicatePreflight, AppError> {
    let source_number = graphql_issue_number(mutation.request.issue_number)?;
    let canonical_number = graphql_issue_number(mutation.canonical_issue_number)?;
    let payload = serde_json::json!({
        "query": MARK_DUPLICATE_PREFLIGHT_QUERY,
        "variables": {
            "sourceOwner": mutation.request.owner,
            "sourceRepository": mutation.request.repository,
            "sourceNumber": source_number,
            "canonicalOwner": mutation.canonical_owner,
            "canonicalRepository": mutation.canonical_repository,
            "canonicalNumber": canonical_number,
        }
    });
    let response: MarkDuplicatePreflightResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    mark_preflight_from_graphql(response, mutation)
}

fn graphql_issue_number(number: u64) -> Result<i32, AppError> {
    i32::try_from(number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })
}

fn mark_preflight_from_graphql(
    response: MarkDuplicatePreflightResponse,
    mutation: IssueDuplicateMarkMutation<'_>,
) -> Result<MarkDuplicatePreflight, AppError> {
    let source_repository = response.source_repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the source Issue repository".to_string())
    })?;
    let expected_source_full_name =
        format!("{}/{}", mutation.request.owner, mutation.request.repository);
    if !graphql_node_id_is_valid(&source_repository.id)
        || !source_repository
            .name_with_owner
            .eq_ignore_ascii_case(&expected_source_full_name)
    {
        return Err(AppError::GitHub(
            "GitHub returned a different source Issue repository".to_string(),
        ));
    }
    let source = source_repository
        .source
        .ok_or_else(|| AppError::GitHub("GitHub did not return the current Issue".to_string()))?;
    if source.id != mutation.request.expected_issue_node_id
        || source.number != mutation.request.issue_number
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the current Issue identity changed; refresh before trying again".to_string(),
        ));
    }
    if source.state != "OPEN" || source.state_reason.as_deref() == Some("DUPLICATE") {
        return Err(AppError::GitHubIssueStateConflict(
            "only an open, non-duplicate Issue can be marked as a duplicate".to_string(),
        ));
    }
    if source.duplicate_of.is_some() {
        return Err(AppError::GitHubIssueStateConflict(
            "the current Issue is already marked as a duplicate".to_string(),
        ));
    }
    if !source.viewer_can_close {
        return Err(AppError::GitHubPermission(
            "GitHub does not allow the current Issue to be marked as a duplicate".to_string(),
        ));
    }

    let canonical_repository = response.canonical_repository.ok_or_else(|| {
        AppError::GitHubIssueStateConflict(
            "the selected canonical Issue repository is no longer available".to_string(),
        )
    })?;
    let expected_canonical_full_name = format!(
        "{}/{}",
        mutation.canonical_owner, mutation.canonical_repository
    );
    if !graphql_node_id_is_valid(&canonical_repository.id)
        || !canonical_repository
            .name_with_owner
            .eq_ignore_ascii_case(&expected_canonical_full_name)
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the selected canonical Issue repository identity changed; refresh before trying again"
                .to_string(),
        ));
    }
    let canonical = canonical_repository.canonical.ok_or_else(|| {
        AppError::GitHubIssueStateConflict(
            "the selected canonical Issue is no longer available".to_string(),
        )
    })?;
    if !graphql_node_id_is_valid(&canonical.id)
        || canonical.id == source.id
        || canonical.number != mutation.canonical_issue_number
        || canonical.title.trim().is_empty()
        || canonical.state_reason.as_deref() == Some("DUPLICATE")
        || canonical.duplicate_of.is_some()
        || canonical.repository.id != canonical_repository.id
        || !canonical
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&canonical_repository.name_with_owner)
        || !issue_url_matches(
            &canonical.url,
            "github.com",
            &format!(
                "/{}/{}/issues/{}",
                mutation.canonical_owner,
                mutation.canonical_repository,
                mutation.canonical_issue_number
            ),
        )
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the selected canonical Issue identity changed; refresh before trying again"
                .to_string(),
        ));
    }
    Ok(MarkDuplicatePreflight {
        repository_id: source_repository.id,
        repository_full_name: source_repository.name_with_owner,
        source_id: source.id,
        canonical_id: canonical.id,
        canonical_repository_full_name: canonical_repository.name_with_owner,
        canonical_issue_number: canonical.number,
    })
}

async fn execute_mark_duplicate(
    client: &octocrab::Octocrab,
    preflight: &MarkDuplicatePreflight,
) -> Result<MarkedIssue, AppError> {
    let payload = serde_json::json!({
        "query": MARK_DUPLICATE_MUTATION,
        "variables": {
            "sourceId": preflight.source_id,
            "canonicalId": preflight.canonical_id,
        }
    });
    let response: MarkDuplicateMutationResponse = client
        .graphql(&payload)
        .await
        .map_err(|error| post_write_error(github_error(error)))?;
    response
        .close_issue
        .and_then(|payload| payload.issue)
        .ok_or_else(|| write_may_have_persisted("GitHub did not return the marked duplicate Issue"))
}

fn ensure_marked_response(
    issue: &MarkedIssue,
    request: IssueGraphQlRequest<'_>,
    preflight: &MarkDuplicatePreflight,
) -> Result<(), AppError> {
    if issue.id != request.expected_issue_node_id
        || issue.number != request.issue_number
        || issue.repository.id != preflight.repository_id
        || !issue
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&preflight.repository_full_name)
        || issue.state != "CLOSED"
        || issue.state_reason.as_deref() != Some("DUPLICATE")
        || issue
            .duplicate_of
            .as_ref()
            .is_none_or(|duplicate| duplicate.id != preflight.canonical_id)
    {
        return Err(write_may_have_persisted(
            "the mutation response did not match the requested duplicate state",
        ));
    }
    Ok(())
}

fn ensure_marked_snapshot(
    snapshot: &IssueDuplicateSnapshot,
    request: IssueGraphQlRequest<'_>,
    preflight: &MarkDuplicatePreflight,
) -> Result<(), AppError> {
    if snapshot.issue_node_id != request.expected_issue_node_id
        || snapshot.issue_number != request.issue_number
        || snapshot.repository_id != preflight.repository_id
        || !snapshot
            .repository_full_name
            .eq_ignore_ascii_case(&preflight.repository_full_name)
        || !snapshot.is_marked_duplicate()
        || snapshot.canonical.as_ref().is_none_or(|canonical| {
            canonical.node_id != preflight.canonical_id
                || canonical.reference.issue_number != preflight.canonical_issue_number
                || !canonical
                    .reference
                    .full_name
                    .eq_ignore_ascii_case(&preflight.canonical_repository_full_name)
        })
    {
        return Err(write_may_have_persisted(
            "the GraphQL postflight did not match the requested duplicate state",
        ));
    }
    Ok(())
}

struct MarkDuplicatePreflight {
    repository_id: String,
    repository_full_name: String,
    source_id: String,
    canonical_id: String,
    canonical_repository_full_name: String,
    canonical_issue_number: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkDuplicatePreflightResponse {
    source_repository: Option<MarkDuplicateSourceRepository>,
    canonical_repository: Option<MarkDuplicateCanonicalRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkDuplicateSourceRepository {
    id: String,
    name_with_owner: String,
    source: Option<MarkDuplicateSource>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkDuplicateCanonicalRepository {
    id: String,
    name_with_owner: String,
    canonical: Option<MarkDuplicateCanonical>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkDuplicateSource {
    id: String,
    number: u64,
    state: String,
    state_reason: Option<String>,
    duplicate_of: Option<GraphQlNode>,
    viewer_can_close: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkDuplicateCanonical {
    id: String,
    number: u64,
    title: String,
    url: String,
    state_reason: Option<String>,
    duplicate_of: Option<GraphQlNode>,
    repository: MarkDuplicateCanonicalIssueRepository,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkDuplicateCanonicalIssueRepository {
    id: String,
    name_with_owner: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkDuplicateMutationResponse {
    close_issue: Option<MarkDuplicatePayload>,
}

#[derive(Deserialize)]
struct MarkDuplicatePayload {
    issue: Option<MarkedIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkedIssue {
    id: String,
    number: u64,
    state: String,
    state_reason: Option<String>,
    duplicate_of: Option<GraphQlNode>,
    repository: MarkedRepository,
}

#[derive(Deserialize)]
struct GraphQlNode {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkedRepository {
    id: String,
    name_with_owner: String,
}

#[cfg(test)]
mod tests;
