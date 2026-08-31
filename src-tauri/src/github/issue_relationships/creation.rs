use serde::Deserialize;

use super::{
    super::{
        github_error,
        issue::GitHubIssueSummary,
        issue_related::{
            graphql_node_id_is_valid, issue_url_matches, summary_is_current, RelatedIssueRequest,
        },
    },
    load_parent,
    mutations::resolve_issue,
};
use crate::error::AppError;

const CREATE_SUB_ISSUE_PREFLIGHT_QUERY: &str = r#"
query HarborCreateIssueSubIssuePreflight(
  $owner: String!
  $repository: String!
  $issueNumber: Int!
) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    hasIssuesEnabled
    isBlankIssuesEnabled
    viewerCanCreateIssues
    viewerPermission
    issue(number: $issueNumber) {
      id
      number
    }
  }
}
"#;

const CREATE_SUB_ISSUE_MUTATION: &str = r#"
mutation HarborCreateIssueSubIssue(
  $repositoryId: ID!
  $parentIssueId: ID!
  $title: String!
  $body: String
) {
  createIssue(input: {
    repositoryId: $repositoryId
    parentIssueId: $parentIssueId
    title: $title
    body: $body
  }) {
    issue {
      id
      number
      url
      repository {
        id
        nameWithOwner
      }
    }
  }
}
"#;

#[derive(Clone, Copy)]
pub(crate) struct IssueSubIssueCreateMutation<'a> {
    pub(super) current: RelatedIssueRequest<'a>,
    pub(super) title: &'a str,
    pub(super) body: &'a str,
}

impl<'a> IssueSubIssueCreateMutation<'a> {
    pub(crate) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        title: &'a str,
        body: &'a str,
    ) -> Result<Self, AppError> {
        if title.trim().is_empty() {
            return Err(AppError::Validation(
                "sub-issue title must not be empty".to_string(),
            ));
        }
        Ok(Self {
            current: RelatedIssueRequest::new(owner, repository, issue_number, 1)?,
            title,
            body,
        })
    }
}

pub(super) async fn create_issue_sub_issue_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueSubIssueCreateMutation<'_>,
) -> Result<GitHubIssueSummary, AppError> {
    let repository = load_create_preflight(client, mutation.current).await?;
    let created = execute_create_sub_issue(client, mutation, &repository).await?;
    validate_created_identity(&created, &repository, mutation.current).map_err(|_| {
        AppError::GitHub(
            "GitHub reported creating a sub-issue with an unexpected identity; refresh the relationships before retrying"
                .to_string(),
        )
    })?;

    let child_request = RelatedIssueRequest::new(
        mutation.current.owner,
        mutation.current.repository,
        created.number,
        1,
    )?;
    let child = resolve_issue(client, child_request, "created sub-issue")
        .await
        .map_err(|error| confirmation_error(created.number, &error.to_string()))?;
    if child.issue.reaction_subject.id != created.id {
        return Err(confirmation_error(
            created.number,
            "GitHub returned a different Issue identity",
        ));
    }
    let confirmed_parent = load_parent(client, child_request)
        .await
        .map_err(|error| confirmation_error(created.number, &error.to_string()))?;
    if confirmed_parent.as_ref().is_none_or(|parent| {
        !summary_is_current(parent, mutation.current)
            || parent.issue.reaction_subject.id != repository.parent_issue.id
    }) {
        return Err(confirmation_error(
            created.number,
            "the parent relationship did not match",
        ));
    }
    Ok(child)
}

async fn load_create_preflight(
    client: &octocrab::Octocrab,
    current: RelatedIssueRequest<'_>,
) -> Result<CreateSubIssueRepository, AppError> {
    let payload = serde_json::json!({
        "query": CREATE_SUB_ISSUE_PREFLIGHT_QUERY,
        "variables": {
            "owner": current.owner,
            "repository": current.repository,
            "issueNumber": current.issue_number,
        },
    });
    let response: CreateSubIssuePreflightResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the sub-issue repository".to_string())
    })?;
    if !graphql_node_id_is_valid(&repository.id)
        || !repository
            .name_with_owner
            .eq_ignore_ascii_case(&format!("{}/{}", current.owner, current.repository))
    {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected sub-issue repository identity".to_string(),
        ));
    }
    if !repository.has_issues_enabled {
        return Err(AppError::Validation(
            "Issues are disabled for this repository".to_string(),
        ));
    }
    if !repository.viewer_can_create_issues {
        return Err(AppError::GitHubPermission(
            "Issue creation permission is required to create a sub-issue".to_string(),
        ));
    }
    let can_create_maintainer_blank_issue = matches!(
        repository.viewer_permission.as_deref(),
        Some("WRITE" | "MAINTAIN" | "ADMIN")
    );
    if !repository.is_blank_issues_enabled && !can_create_maintainer_blank_issue {
        return Err(AppError::Validation(
            "this repository does not allow blank Issues".to_string(),
        ));
    }
    if repository.parent_issue.number != current.issue_number
        || !graphql_node_id_is_valid(&repository.parent_issue.id)
    {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected parent Issue identity".to_string(),
        ));
    }
    Ok(repository)
}

async fn execute_create_sub_issue(
    client: &octocrab::Octocrab,
    mutation: IssueSubIssueCreateMutation<'_>,
    repository: &CreateSubIssueRepository,
) -> Result<CreatedSubIssue, AppError> {
    let payload = serde_json::json!({
        "query": CREATE_SUB_ISSUE_MUTATION,
        "variables": {
            "repositoryId": repository.id,
            "parentIssueId": repository.parent_issue.id,
            "title": mutation.title,
            "body": mutation.body,
        },
    });
    let response: CreateSubIssueMutationResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    response
        .create_issue
        .and_then(|payload| payload.issue)
        .ok_or_else(|| {
            AppError::GitHub(
                "GitHub did not return the created sub-issue; refresh the relationships before retrying"
                    .to_string(),
            )
        })
}

fn validate_created_identity(
    created: &CreatedSubIssue,
    repository: &CreateSubIssueRepository,
    current: RelatedIssueRequest<'_>,
) -> Result<(), AppError> {
    if created.number == 0
        || created.number == current.issue_number
        || !graphql_node_id_is_valid(&created.id)
        || created.id == repository.parent_issue.id
        || created.repository.id != repository.id
        || !created
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&repository.name_with_owner)
        || !issue_url_matches(
            &created.url,
            "github.com",
            &format!(
                "/{}/{}/issues/{}",
                current.owner, current.repository, created.number
            ),
        )
    {
        return Err(unexpected_created_identity());
    }
    Ok(())
}

fn unexpected_created_identity() -> AppError {
    AppError::GitHub("GitHub returned a created sub-issue with an unexpected identity".to_string())
}

fn confirmation_error(issue_number: u64, detail: &str) -> AppError {
    AppError::GitHub(format!(
        "GitHub created sub-issue #{issue_number}, but Harbor could not confirm it ({detail}); refresh the relationships before retrying"
    ))
}

#[derive(Deserialize)]
struct CreateSubIssuePreflightResponse {
    repository: Option<CreateSubIssueRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSubIssueRepository {
    id: String,
    name_with_owner: String,
    has_issues_enabled: bool,
    is_blank_issues_enabled: bool,
    viewer_can_create_issues: bool,
    viewer_permission: Option<String>,
    #[serde(rename = "issue")]
    parent_issue: CreateSubIssueParent,
}

#[derive(Deserialize)]
struct CreateSubIssueParent {
    id: String,
    number: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSubIssueMutationResponse {
    create_issue: Option<CreateSubIssuePayload>,
}

#[derive(Deserialize)]
struct CreateSubIssuePayload {
    issue: Option<CreatedSubIssue>,
}

#[derive(Deserialize)]
struct CreatedSubIssue {
    id: String,
    number: u64,
    url: String,
    repository: CreatedSubIssueRepository,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatedSubIssueRepository {
    id: String,
    name_with_owner: String,
}

#[cfg(test)]
mod tests;
