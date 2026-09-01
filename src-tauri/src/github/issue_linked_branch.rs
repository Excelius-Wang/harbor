use std::collections::HashSet;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, issue_related::graphql_node_id_is_valid, GitHubService,
    OctocrabGitHubClient,
};
use crate::error::AppError;

const LINKED_BRANCH_PAGE_SIZE: i32 = 50;
const MAX_LINKED_BRANCH_PAGES: usize = 20;
const LINKED_BRANCH_QUERY: &str = r#"
query HarborIssueLinkedBranches(
  $owner: String!
  $repository: String!
  $number: Int!
  $first: Int!
  $after: String
) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
    defaultBranchRef {
      name
      target { ... on Commit { oid } }
    }
    issue(number: $number) {
      id
      number
      linkedBranches(first: $first, after: $after) {
        totalCount
        nodes {
          id
          ref {
            name
            repository { id nameWithOwner }
            target { ... on Commit { oid } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
"#;

const CREATE_LINKED_BRANCH_MUTATION: &str = r#"
mutation HarborCreateIssueLinkedBranch($issueId: ID!, $oid: GitObjectID!, $name: String) {
  createLinkedBranch(input: { issueId: $issueId, oid: $oid, name: $name }) {
    issue { id number repository { id nameWithOwner } }
    linkedBranch {
      id
      ref {
        name
        repository { id nameWithOwner }
        target { ... on Commit { oid } }
      }
    }
  }
}
"#;

const DELETE_LINKED_BRANCH_MUTATION: &str = r#"
mutation HarborDeleteIssueLinkedBranch($linkedBranchId: ID!) {
  deleteLinkedBranch(input: { linkedBranchId: $linkedBranchId }) {
    issue { id number repository { id nameWithOwner } }
  }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLinkedBranch {
    pub id: String,
    pub name: String,
    pub repository_id: String,
    pub repository_full_name: String,
    pub oid: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLinkedBranchPage {
    pub repository_id: String,
    pub repository_full_name: String,
    pub issue_node_id: String,
    pub issue_number: u64,
    pub default_branch: String,
    pub default_branch_oid: String,
    pub viewer_can_create: bool,
    pub branches: Vec<GitHubIssueLinkedBranch>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueLinkedBranchRequest<'a> {
    pub(crate) owner: &'a str,
    pub(crate) repository: &'a str,
    pub(crate) issue_number: u64,
    pub(crate) expected_issue_node_id: &'a str,
    pub(crate) after: Option<&'a str>,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueLinkedBranchCreateMutation<'a> {
    pub(crate) request: IssueLinkedBranchRequest<'a>,
    pub(crate) expected_default_branch_oid: &'a str,
    pub(crate) branch_name: Option<&'a str>,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueLinkedBranchDeleteMutation<'a> {
    pub(crate) request: IssueLinkedBranchRequest<'a>,
    pub(crate) linked_branch_id: &'a str,
    pub(crate) expected_branch_name: &'a str,
    pub(crate) expected_branch_oid: &'a str,
}

#[async_trait]
pub(crate) trait GitHubIssueLinkedBranchClient: Send + Sync {
    async fn issue_linked_branches(
        &self,
        token: &str,
        request: IssueLinkedBranchRequest<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError>;

    async fn create_issue_linked_branch(
        &self,
        token: &str,
        mutation: IssueLinkedBranchCreateMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError>;

    async fn delete_issue_linked_branch(
        &self,
        token: &str,
        mutation: IssueLinkedBranchDeleteMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError>;
}

impl GitHubService {
    pub async fn issue_linked_branches(
        &self,
        request: IssueLinkedBranchRequest<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.issue_linked_branches(&token, request).await
    }

    pub async fn create_issue_linked_branch(
        &self,
        mutation: IssueLinkedBranchCreateMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_issue_linked_branch(&token, mutation)
            .await
    }

    pub async fn delete_issue_linked_branch(
        &self,
        mutation: IssueLinkedBranchDeleteMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_issue_linked_branch(&token, mutation)
            .await
    }
}

#[async_trait]
impl GitHubIssueLinkedBranchClient for OctocrabGitHubClient {
    async fn issue_linked_branches(
        &self,
        token: &str,
        request: IssueLinkedBranchRequest<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        let client = authenticated_client(token)?;
        load_issue_linked_branches_with_client(&client, request).await
    }

    async fn create_issue_linked_branch(
        &self,
        token: &str,
        mutation: IssueLinkedBranchCreateMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        let write_client = linked_branch_client(token)?;
        create_issue_linked_branch_with_client(&write_client, mutation).await
    }

    async fn delete_issue_linked_branch(
        &self,
        token: &str,
        mutation: IssueLinkedBranchDeleteMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        let write_client = linked_branch_client(token)?;
        delete_issue_linked_branch_with_client(&write_client, mutation).await
    }
}

pub(crate) fn linked_branch_request<'a>(
    owner: &'a str,
    repository: &'a str,
    issue_number: u64,
    expected_issue_node_id: &'a str,
    after: Option<&'a str>,
) -> Result<IssueLinkedBranchRequest<'a>, AppError> {
    if after.is_some_and(|cursor| cursor.trim().is_empty() || cursor.len() > 512) {
        return Err(AppError::Validation(
            "GraphQL cursor is invalid".to_string(),
        ));
    }
    Ok(IssueLinkedBranchRequest {
        owner,
        repository,
        issue_number,
        expected_issue_node_id,
        after,
    })
}

async fn load_issue_linked_branches_with_client(
    client: &octocrab::Octocrab,
    request: IssueLinkedBranchRequest<'_>,
) -> Result<GitHubIssueLinkedBranchPage, AppError> {
    let number = i32::try_from(request.issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    let payload = serde_json::json!({
        "query": LINKED_BRANCH_QUERY,
        "variables": {
            "owner": request.owner,
            "repository": request.repository,
            "number": number,
            "first": LINKED_BRANCH_PAGE_SIZE,
            "after": request.after,
        }
    });
    let response: LinkedBranchQueryResponse =
        client.graphql(&payload).await.map_err(github_error)?;
    page_from_graphql(response, request)
}

async fn load_all_issue_linked_branches_with_client(
    client: &octocrab::Octocrab,
    request: IssueLinkedBranchRequest<'_>,
) -> Result<GitHubIssueLinkedBranchPage, AppError> {
    let mut page = load_issue_linked_branches_with_client(
        client,
        IssueLinkedBranchRequest {
            after: None,
            ..request
        },
    )
    .await?;
    let mut cursor = page.next_cursor.clone();
    let mut seen = page
        .branches
        .iter()
        .map(|branch| branch.id.clone())
        .collect::<HashSet<_>>();
    let mut loaded_pages = 1;
    while let Some(after) = cursor {
        if loaded_pages >= MAX_LINKED_BRANCH_PAGES {
            return Err(AppError::GitHub(
                "GitHub returned too many linked branch pages".to_string(),
            ));
        }
        let next = load_issue_linked_branches_with_client(
            client,
            IssueLinkedBranchRequest {
                after: Some(after.as_str()),
                ..request
            },
        )
        .await?;
        for branch in &next.branches {
            if !seen.insert(branch.id.clone()) {
                return Err(AppError::GitHub(
                    "GitHub returned a duplicate linked branch".to_string(),
                ));
            }
        }
        page.branches.extend(next.branches);
        cursor = next.next_cursor;
        loaded_pages += 1;
    }
    page.next_cursor = None;
    Ok(page)
}

async fn create_issue_linked_branch_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueLinkedBranchCreateMutation<'_>,
) -> Result<GitHubIssueLinkedBranchPage, AppError> {
    let request = IssueLinkedBranchRequest {
        after: None,
        ..mutation.request
    };
    let preflight = load_all_issue_linked_branches_with_client(client, request).await?;
    ensure_create_preflight(&preflight, mutation)?;
    let returned = execute_create(client, mutation, &preflight).await?;
    let postflight = load_all_issue_linked_branches_with_client(client, request)
        .await
        .map_err(|error| post_write_error(error, mutation.request.issue_number))?;
    ensure_create_postflight(&postflight, &returned, mutation)?;
    Ok(postflight)
}

async fn delete_issue_linked_branch_with_client(
    client: &octocrab::Octocrab,
    mutation: IssueLinkedBranchDeleteMutation<'_>,
) -> Result<GitHubIssueLinkedBranchPage, AppError> {
    let request = IssueLinkedBranchRequest {
        after: None,
        ..mutation.request
    };
    let preflight = load_all_issue_linked_branches_with_client(client, request).await?;
    ensure_delete_preflight(&preflight, mutation)?;
    execute_delete(client, mutation, &preflight).await?;
    let postflight = load_all_issue_linked_branches_with_client(client, request)
        .await
        .map_err(|error| post_write_error(error, mutation.request.issue_number))?;
    ensure_delete_postflight(&postflight, mutation)?;
    Ok(postflight)
}

fn page_from_graphql(
    response: LinkedBranchQueryResponse,
    request: IssueLinkedBranchRequest<'_>,
) -> Result<GitHubIssueLinkedBranchPage, AppError> {
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue linked-branch repository".to_string())
    })?;
    ensure_repository_identity(&repository.id, &repository.name_with_owner, request)?;
    let default_ref = repository.default_branch_ref.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the repository default branch".to_string())
    })?;
    let default_branch = default_ref.name;
    if default_branch.trim().is_empty() {
        return Err(AppError::GitHub(
            "GitHub returned an invalid default branch name".to_string(),
        ));
    }
    let default_branch_oid = default_ref
        .target
        .map(|target| target.oid)
        .filter(|oid| is_git_oid(oid))
        .ok_or_else(|| {
            AppError::GitHub("GitHub returned an invalid default branch revision".to_string())
        })?;
    let issue = repository
        .issue
        .ok_or_else(|| AppError::GitHub("GitHub did not return the requested Issue".to_string()))?;
    if issue.id != request.expected_issue_node_id || issue.number != request.issue_number {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue for linked branches".to_string(),
        ));
    }
    let connection = issue.linked_branches.ok_or_else(|| {
        AppError::GitHub("GitHub did not return linked Issue branches".to_string())
    })?;
    let branches = connection
        .nodes
        .into_iter()
        .map(|node| {
            let node = node.ok_or_else(|| {
                AppError::GitHub("GitHub returned an empty linked branch".to_string())
            })?;
            linked_branch_from_graphql(node)
        })
        .collect::<Result<Vec<_>, AppError>>()?;
    let next_cursor = if connection.page_info.has_next_page {
        let cursor = connection.page_info.end_cursor.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the next linked branch cursor".to_string())
        })?;
        if cursor.trim().is_empty() || cursor.len() > 512 {
            return Err(AppError::GitHub(
                "GitHub returned an invalid linked branch cursor".to_string(),
            ));
        }
        Some(cursor)
    } else {
        None
    };
    let viewer_can_create = matches!(
        repository.viewer_permission.as_deref(),
        Some("WRITE" | "MAINTAIN" | "ADMIN")
    );
    Ok(GitHubIssueLinkedBranchPage {
        repository_id: repository.id,
        repository_full_name: repository.name_with_owner,
        issue_node_id: issue.id,
        issue_number: issue.number,
        default_branch,
        default_branch_oid,
        viewer_can_create,
        branches,
        next_cursor,
    })
}

fn linked_branch_from_graphql(
    node: GraphQlLinkedBranch,
) -> Result<GitHubIssueLinkedBranch, AppError> {
    if !graphql_node_id_is_valid(&node.id) {
        return Err(AppError::GitHub(
            "GitHub returned an invalid linked branch ID".to_string(),
        ));
    }
    let branch_ref = node.r#ref.ok_or_else(|| {
        AppError::GitHub("GitHub returned a linked branch without a ref".to_string())
    })?;
    let oid = branch_ref
        .target
        .map(|target| target.oid)
        .filter(|oid| is_git_oid(oid))
        .ok_or_else(|| {
            AppError::GitHub("GitHub returned an invalid linked branch revision".to_string())
        })?;
    let repository = branch_ref.repository.ok_or_else(|| {
        AppError::GitHub("GitHub returned a linked branch without a repository".to_string())
    })?;
    if branch_ref.name.trim().is_empty()
        || !graphql_node_id_is_valid(&repository.id)
        || repository.name_with_owner.trim().is_empty()
    {
        return Err(AppError::GitHub(
            "GitHub returned an invalid linked branch ref".to_string(),
        ));
    }
    Ok(GitHubIssueLinkedBranch {
        id: node.id,
        name: branch_ref.name,
        repository_id: repository.id,
        repository_full_name: repository.name_with_owner,
        oid,
    })
}

fn ensure_repository_identity(
    id: &str,
    full_name: &str,
    request: IssueLinkedBranchRequest<'_>,
) -> Result<(), AppError> {
    if !graphql_node_id_is_valid(id)
        || !full_name.eq_ignore_ascii_case(&format!("{}/{}", request.owner, request.repository))
    {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue linked-branch repository".to_string(),
        ));
    }
    Ok(())
}

fn ensure_create_preflight(
    page: &GitHubIssueLinkedBranchPage,
    mutation: IssueLinkedBranchCreateMutation<'_>,
) -> Result<(), AppError> {
    if page.issue_node_id != mutation.request.expected_issue_node_id
        || page.issue_number != mutation.request.issue_number
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the Issue changed; refresh before creating a linked branch".to_string(),
        ));
    }
    if page.default_branch_oid != mutation.expected_default_branch_oid {
        return Err(AppError::GitHubIssueStateConflict(
            "the default branch changed; refresh before creating a linked branch".to_string(),
        ));
    }
    if !page.viewer_can_create {
        return Err(AppError::GitHubPermission(
            "repository write access is required to create a linked branch".to_string(),
        ));
    }
    if let Some(name) = mutation.branch_name {
        if page.branches.iter().any(|branch| branch.name == name) {
            return Err(AppError::GitHubIssueStateConflict(
                "a linked branch with this name already exists".to_string(),
            ));
        }
    }
    Ok(())
}

fn ensure_delete_preflight(
    page: &GitHubIssueLinkedBranchPage,
    mutation: IssueLinkedBranchDeleteMutation<'_>,
) -> Result<(), AppError> {
    if page.issue_node_id != mutation.request.expected_issue_node_id
        || page.issue_number != mutation.request.issue_number
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the Issue changed; refresh before unlinking a branch".to_string(),
        ));
    }
    if !page.viewer_can_create {
        return Err(AppError::GitHubPermission(
            "repository write access is required to unlink a branch".to_string(),
        ));
    }
    let branch = page
        .branches
        .iter()
        .find(|branch| branch.id == mutation.linked_branch_id)
        .ok_or_else(|| {
            AppError::GitHubIssueStateConflict(
                "the linked branch changed; refresh before unlinking it".to_string(),
            )
        })?;
    if branch.name != mutation.expected_branch_name || branch.oid != mutation.expected_branch_oid {
        return Err(AppError::GitHubIssueStateConflict(
            "the linked branch changed; refresh before unlinking it".to_string(),
        ));
    }
    Ok(())
}

async fn execute_create(
    client: &octocrab::Octocrab,
    mutation: IssueLinkedBranchCreateMutation<'_>,
    page: &GitHubIssueLinkedBranchPage,
) -> Result<GitHubIssueLinkedBranch, AppError> {
    let payload = serde_json::json!({
        "query": CREATE_LINKED_BRANCH_MUTATION,
        "variables": {
            "issueId": page.issue_node_id,
            "oid": page.default_branch_oid,
            "name": mutation.branch_name,
        }
    });
    let response: CreateLinkedBranchResponse = client
        .graphql(&payload)
        .await
        .map_err(linked_branch_write_error)?;
    let payload = response.create_linked_branch.ok_or_else(|| {
        AppError::GitHub(
            "GitHub did not return the linked branch; it may have been created, so refresh the Issue before retrying"
                .to_string(),
        )
    })?;
    let issue = payload.issue.ok_or_else(|| {
        confirmation_error(
            mutation.request.issue_number,
            "the mutation returned no Issue",
        )
    })?;
    if issue.id != page.issue_node_id
        || issue.number != mutation.request.issue_number
        || issue.repository.as_ref().is_none_or(|repository| {
            repository.id != page.repository_id
                || !repository
                    .name_with_owner
                    .eq_ignore_ascii_case(&page.repository_full_name)
        })
    {
        return Err(confirmation_error(
            mutation.request.issue_number,
            "the mutation returned a different Issue",
        ));
    }
    let linked_branch = payload.linked_branch.ok_or_else(|| {
        confirmation_error(
            mutation.request.issue_number,
            "the mutation returned no branch",
        )
    })?;
    let branch_repository = linked_branch
        .r#ref
        .as_ref()
        .and_then(|branch_ref| branch_ref.repository.as_ref())
        .ok_or_else(|| {
            confirmation_error(
                mutation.request.issue_number,
                "the mutation returned a branch without repository identity",
            )
        })?;
    if branch_repository.id != page.repository_id
        || !branch_repository
            .name_with_owner
            .eq_ignore_ascii_case(&page.repository_full_name)
    {
        return Err(confirmation_error(
            mutation.request.issue_number,
            "the mutation returned a branch in a different repository",
        ));
    }
    let branch = linked_branch_from_graphql(linked_branch).map_err(|error| {
        confirmation_error(
            mutation.request.issue_number,
            &format!("the mutation returned invalid branch data: {error}"),
        )
    })?;
    if mutation.branch_name.is_some_and(|name| branch.name != name)
        || branch.oid != page.default_branch_oid
    {
        return Err(confirmation_error(
            mutation.request.issue_number,
            "the mutation returned different branch identity",
        ));
    }
    Ok(branch)
}

async fn execute_delete(
    client: &octocrab::Octocrab,
    mutation: IssueLinkedBranchDeleteMutation<'_>,
    page: &GitHubIssueLinkedBranchPage,
) -> Result<(), AppError> {
    let payload = serde_json::json!({
        "query": DELETE_LINKED_BRANCH_MUTATION,
        "variables": { "linkedBranchId": mutation.linked_branch_id }
    });
    let response: DeleteLinkedBranchResponse = client
        .graphql(&payload)
        .await
        .map_err(linked_branch_write_error)?;
    let issue = response
        .delete_linked_branch
        .and_then(|payload| payload.issue)
        .ok_or_else(|| {
            confirmation_error(
                mutation.request.issue_number,
                "the mutation returned no Issue",
            )
        })?;
    if issue.id != page.issue_node_id
        || issue.number != mutation.request.issue_number
        || issue.repository.as_ref().is_none_or(|repository| {
            repository.id != page.repository_id
                || !repository
                    .name_with_owner
                    .eq_ignore_ascii_case(&page.repository_full_name)
        })
    {
        return Err(confirmation_error(
            mutation.request.issue_number,
            "the mutation returned a different Issue",
        ));
    }
    Ok(())
}

fn ensure_create_postflight(
    page: &GitHubIssueLinkedBranchPage,
    branch: &GitHubIssueLinkedBranch,
    mutation: IssueLinkedBranchCreateMutation<'_>,
) -> Result<(), AppError> {
    if page.issue_node_id != mutation.request.expected_issue_node_id
        || page.issue_number != mutation.request.issue_number
        || !page.branches.iter().any(|candidate| {
            candidate.repository_id == page.repository_id
                && candidate
                    .repository_full_name
                    .eq_ignore_ascii_case(&page.repository_full_name)
                && candidate.id == branch.id
                && candidate.name == branch.name
                && candidate.oid == branch.oid
        })
    {
        return Err(confirmation_error(
            mutation.request.issue_number,
            "the new branch is not present after creation",
        ));
    }
    Ok(())
}

fn ensure_delete_postflight(
    page: &GitHubIssueLinkedBranchPage,
    mutation: IssueLinkedBranchDeleteMutation<'_>,
) -> Result<(), AppError> {
    if page.issue_node_id != mutation.request.expected_issue_node_id
        || page.issue_number != mutation.request.issue_number
        || page
            .branches
            .iter()
            .any(|branch| branch.id == mutation.linked_branch_id)
    {
        return Err(confirmation_error(
            mutation.request.issue_number,
            "the branch is still linked after removal",
        ));
    }
    Ok(())
}

fn linked_branch_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    linked_branch_client_with_base(token, None)
}

fn linked_branch_client_with_base(
    token: &str,
    base_uri: Option<&str>,
) -> Result<octocrab::Octocrab, AppError> {
    let builder = octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None);
    let builder = if let Some(base_uri) = base_uri {
        builder
            .base_uri(base_uri)
            .map_err(|error| AppError::GitHub(error.to_string()))?
    } else {
        builder
    };
    builder
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

fn linked_branch_write_error(error: octocrab::Error) -> AppError {
    match github_error(error) {
        AppError::GitHubPermission(message) => AppError::GitHubPermission(message),
        AppError::GitHubRateLimited(message) => AppError::GitHubRateLimited(message),
        AppError::GitHub(message) => AppError::GitHub(format!(
            "{message}; the linked branch may have changed, so refresh the Issue before retrying"
        )),
        other => other,
    }
}

fn post_write_error(error: AppError, issue_number: u64) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => confirmation_error(issue_number, &error.to_string()),
    }
}

fn confirmation_error(issue_number: u64, detail: &str) -> AppError {
    AppError::GitHub(format!(
        "GitHub updated Issue #{issue_number}, but Harbor could not confirm the linked branch ({detail}); refresh the Issue before retrying"
    ))
}

fn is_git_oid(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedBranchQueryResponse {
    repository: Option<LinkedBranchRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedBranchRepository {
    id: String,
    name_with_owner: String,
    viewer_permission: Option<String>,
    default_branch_ref: Option<GraphQlRef>,
    issue: Option<LinkedBranchIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedBranchIssue {
    id: String,
    number: u64,
    linked_branches: Option<LinkedBranchConnection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedBranchConnection {
    nodes: Vec<Option<GraphQlLinkedBranch>>,
    page_info: GraphQlPageInfo,
    #[allow(dead_code)]
    total_count: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlLinkedBranch {
    id: String,
    #[serde(rename = "ref")]
    r#ref: Option<GraphQlRef>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlRef {
    name: String,
    repository: Option<GraphQlRepositoryIdentity>,
    target: Option<GraphQlTarget>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlTarget {
    oid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlRepositoryIdentity {
    id: String,
    name_with_owner: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLinkedBranchResponse {
    create_linked_branch: Option<CreateLinkedBranchPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLinkedBranchPayload {
    issue: Option<LinkedBranchMutationIssue>,
    linked_branch: Option<GraphQlLinkedBranch>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteLinkedBranchResponse {
    delete_linked_branch: Option<DeleteLinkedBranchPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteLinkedBranchPayload {
    issue: Option<LinkedBranchMutationIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkedBranchMutationIssue {
    id: String,
    number: u64,
    repository: Option<GraphQlRepositoryIdentity>,
}

#[cfg(test)]
mod tests;
