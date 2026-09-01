use std::collections::BTreeMap;

use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};

use super::super::comment::{
    ensure_minimized_result, run_minimize_mutation, GitHubCommentMutation,
};
use super::super::github_error;
use super::{
    GitHubCommitComment, GitHubCommitCommentAuthor, GitHubCommitCommentMutation,
    GitHubCommitCommentPage, GitHubCommitCommentPlacement,
};
use crate::error::AppError;

const COMMIT_COMMENT_PAGE_SIZE: u8 = 100;
const GITHUB_API_VERSION: &str = "2026-03-10";

const COMMIT_COMMENT_CAPABILITIES_QUERY: &str = r#"
query HarborCommitCommentCapabilities(
  $owner: String!
  $repository: String!
  $ids: [ID!]!
) {
  repository(owner: $owner, name: $repository) { id }
  nodes(ids: $ids) {
    __typename
    ... on CommitComment {
      id
      updatedAt
      viewerCanUpdate
      viewerCanDelete
      isMinimized
      minimizedReason
      viewerCanMinimize
      viewerCanUnminimize
      repository { id }
      commit { oid }
    }
  }
}
"#;

#[derive(Serialize)]
struct CreateCommitCommentPayload<'a> {
    body: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<u64>,
}

#[derive(Deserialize)]
struct RawCommitCommentAuthor {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct RawCommitComment {
    html_url: String,
    id: u64,
    node_id: String,
    body: String,
    path: Option<String>,
    position: Option<u64>,
    line: Option<u64>,
    pub(super) commit_id: String,
    user: Option<RawCommitCommentAuthor>,
    created_at: String,
    updated_at: String,
    author_association: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct CommitCommentCapabilitiesQuery {
    repository: Option<CommitCommentRepositoryNode>,
    pub(super) nodes: Vec<Option<CommitCommentCapabilityNode>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CommitCommentCapabilityNode {
    #[serde(rename = "__typename")]
    type_name: String,
    id: String,
    pub(super) updated_at: String,
    viewer_can_update: bool,
    viewer_can_delete: bool,
    #[serde(default)]
    pub(super) is_minimized: bool,
    pub(super) minimized_reason: Option<String>,
    #[serde(default)]
    pub(super) viewer_can_minimize: bool,
    #[serde(default)]
    pub(super) viewer_can_unminimize: bool,
    pub(super) repository: CommitCommentRepositoryNode,
    commit: Option<CommitCommentCommitNode>,
}

#[derive(Deserialize)]
pub(super) struct CommitCommentRepositoryNode {
    pub(super) id: String,
}

#[derive(Deserialize)]
struct CommitCommentCommitNode {
    oid: String,
}

pub(super) async fn list_commit_comments_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    commit_sha: &str,
    page: u32,
) -> Result<GitHubCommitCommentPage, AppError> {
    let request = api_request(
        client,
        http::Method::GET,
        commit_comments_route(owner, repository, commit_sha, page),
        None::<&()>,
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    let has_more = response
        .headers()
        .get(http::header::LINK)
        .and_then(|value| value.to_str().ok())
        .is_some_and(link_header_has_next);
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(github_error)?
        .to_bytes();
    let comments: Vec<RawCommitComment> = serde_json::from_slice(&bytes).map_err(|error| {
        AppError::GitHub(format!("GitHub returned invalid commit comments: {error}"))
    })?;
    let capabilities = if comments.is_empty() {
        CommitCommentCapabilitiesQuery {
            repository: None,
            nodes: Vec::new(),
        }
    } else {
        commit_comment_capabilities(
            client,
            owner,
            repository,
            comments
                .iter()
                .map(|comment| comment.node_id.as_str())
                .collect(),
        )
        .await?
    };
    commit_comment_page_from_raw(comments, capabilities, commit_sha, page, has_more)
}

pub(super) async fn create_commit_comment_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    commit_sha: &str,
    mutation: &GitHubCommitCommentMutation,
) -> Result<GitHubCommitComment, AppError> {
    let GitHubCommitCommentMutation::Create { body, placement } = mutation else {
        return Err(AppError::Validation(
            "a create commit-comment mutation is required".to_string(),
        ));
    };
    let payload = CreateCommitCommentPayload {
        body,
        path: placement.as_ref().map(|placement| placement.path.as_str()),
        position: placement.as_ref().map(|placement| placement.position),
    };
    let request = api_request(
        client,
        http::Method::POST,
        commit_comments_route_without_page(owner, repository, commit_sha),
        Some(&payload),
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(commit_comment_create_error)?;
    if status != http::StatusCode::CREATED {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected commit-comment creation status {status}"
        )));
    }
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(github_error)?
        .to_bytes();
    let comment: RawCommitComment = serde_json::from_slice(&bytes).map_err(|error| {
        AppError::GitHub(format!(
            "GitHub returned an invalid created commit comment: {error}"
        ))
    })?;
    verify_created_comment(comment, commit_sha, body, placement.as_ref())
}

#[cfg(test)]
pub(super) async fn mutate_commit_comment_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    commit_sha: &str,
    mutation: &GitHubCommitCommentMutation,
) -> Result<Option<GitHubCommitComment>, AppError> {
    mutate_commit_comment_with_clients(client, client, owner, repository, commit_sha, mutation)
        .await
}

pub(super) async fn mutate_commit_comment_with_clients(
    client: &octocrab::Octocrab,
    write_client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    commit_sha: &str,
    mutation: &GitHubCommitCommentMutation,
) -> Result<Option<GitHubCommitComment>, AppError> {
    if matches!(mutation, GitHubCommitCommentMutation::Create { .. }) {
        return create_commit_comment_with_client(
            write_client,
            owner,
            repository,
            commit_sha,
            mutation,
        )
        .await
        .map(Some);
    }
    let guard = match mutation {
        GitHubCommitCommentMutation::Update { guard, .. }
        | GitHubCommitCommentMutation::Delete { guard }
        | GitHubCommitCommentMutation::Minimize { guard, .. }
        | GitHubCommitCommentMutation::Unminimize { guard, .. } => guard,
        GitHubCommitCommentMutation::Create { .. } => unreachable!(),
    };
    let current = get_commit_comment(client, owner, repository, guard.comment_id).await?;
    let capabilities =
        commit_comment_capabilities(client, owner, repository, vec![current.node_id.as_str()])
            .await?;
    let current = commit_comment_page_from_raw(vec![current], capabilities, commit_sha, 1, false)?
        .comments
        .into_iter()
        .next()
        .ok_or_else(|| AppError::GitHub("GitHub did not return the commit comment".to_string()))?;
    ensure_comment_mutation_allowed(&current, guard, mutation)?;

    match mutation {
        GitHubCommitCommentMutation::Update { body, .. } => {
            let payload = serde_json::json!({ "body": body });
            let request = api_request(
                client,
                http::Method::PATCH,
                commit_comment_route(owner, repository, guard.comment_id),
                Some(&payload),
            )?;
            let response = write_client.execute(request).await.map_err(github_error)?;
            let status = response.status();
            let response = octocrab::map_github_error(response)
                .await
                .map_err(commit_comment_write_error)?;
            if status != http::StatusCode::OK {
                return Err(AppError::GitHub(format!(
                    "GitHub returned unexpected commit-comment update status {status}"
                )));
            }
            let bytes = response
                .into_body()
                .collect()
                .await
                .map_err(github_error)?
                .to_bytes();
            let updated: RawCommitComment = serde_json::from_slice(&bytes).map_err(|error| {
                AppError::GitHub(format!(
                    "GitHub returned an invalid updated commit comment: {error}"
                ))
            })?;
            verify_updated_comment(updated, &current, body).map(Some)
        }
        GitHubCommitCommentMutation::Delete { .. } => {
            let request = api_request(
                client,
                http::Method::DELETE,
                commit_comment_route(owner, repository, guard.comment_id),
                None::<&()>,
            )?;
            let response = write_client.execute(request).await.map_err(github_error)?;
            let status = response.status();
            octocrab::map_github_error(response)
                .await
                .map_err(commit_comment_write_error)?;
            if status != http::StatusCode::NO_CONTENT {
                return Err(AppError::GitHub(format!(
                    "GitHub returned unexpected commit-comment deletion status {status}"
                )));
            }
            Ok(None)
        }
        GitHubCommitCommentMutation::Minimize { .. }
        | GitHubCommitCommentMutation::Unminimize { .. } => {
            let generic_mutation = generic_minimize_mutation(mutation)?;
            run_minimize_mutation(write_client, &generic_mutation).await?;
            let refreshed =
                refreshed_commit_comment(client, owner, repository, commit_sha, guard.comment_id)
                    .await
                    .map_err(super::super::comment::minimize_postflight_error)?;
            ensure_minimized_result(
                refreshed.is_minimized,
                refreshed.minimized_reason.as_deref(),
                &generic_mutation,
            )?;
            Ok(Some(refreshed))
        }
        GitHubCommitCommentMutation::Create { .. } => unreachable!(),
    }
}

pub(super) fn commit_comment_page_from_raw(
    comments: Vec<RawCommitComment>,
    capabilities: CommitCommentCapabilitiesQuery,
    requested_sha: &str,
    page: u32,
    has_more: bool,
) -> Result<GitHubCommitCommentPage, AppError> {
    if comments.is_empty() && capabilities.nodes.is_empty() {
        return Ok(GitHubCommitCommentPage {
            comments: Vec::new(),
            page,
            has_previous: page > 1,
            has_more,
        });
    }
    let repository_id = capabilities
        .repository
        .map(|repository| repository.id)
        .ok_or_else(|| {
            AppError::GitHub(
                "GitHub did not return the selected commit-comment repository".to_string(),
            )
        })?;
    if comments.len() != capabilities.nodes.len() {
        return Err(AppError::GitHub(
            "GitHub returned an incomplete commit-comment capability list".to_string(),
        ));
    }
    let mut capabilities_by_id = BTreeMap::new();
    for capability in capabilities.nodes.into_iter().flatten() {
        if capability.type_name != "CommitComment"
            || capabilities_by_id
                .insert(capability.id.clone(), capability)
                .is_some()
        {
            return Err(AppError::GitHub(
                "GitHub returned an invalid commit-comment capability".to_string(),
            ));
        }
    }

    let mut mapped = Vec::with_capacity(comments.len());
    for comment in comments {
        if comment.id == 0
            || comment.node_id.trim().is_empty()
            || comment.commit_id != requested_sha
        {
            return Err(AppError::GitHub(
                "GitHub returned a different commit comment".to_string(),
            ));
        }
        let capability = capabilities_by_id.remove(&comment.node_id).ok_or_else(|| {
            AppError::GitHub(
                "GitHub did not return the requested commit-comment capability".to_string(),
            )
        })?;
        if capability.repository.id != repository_id
            || capability.commit.as_ref().map(|commit| commit.oid.as_str()) != Some(requested_sha)
            || capability.updated_at != comment.updated_at
        {
            return Err(AppError::GitHubCommentConflict(
                "the comment scope or revision changed on GitHub".to_string(),
            ));
        }
        mapped.push(GitHubCommitComment {
            id: comment.node_id,
            database_id: comment.id,
            commit_sha: comment.commit_id,
            body: comment.body,
            path: comment.path,
            position: comment.position,
            line: comment.line,
            author: comment.user.map(|author| GitHubCommitCommentAuthor {
                login: author.login,
                avatar_url: author.avatar_url,
            }),
            author_association: comment.author_association,
            url: comment.html_url,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            viewer_can_update: capability.viewer_can_update,
            viewer_can_delete: capability.viewer_can_delete,
            is_minimized: capability.is_minimized,
            minimized_reason: capability.minimized_reason,
            viewer_can_minimize: capability.viewer_can_minimize,
            viewer_can_unminimize: capability.viewer_can_unminimize,
        });
    }
    if !capabilities_by_id.is_empty() {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected commit-comment capability".to_string(),
        ));
    }

    Ok(GitHubCommitCommentPage {
        comments: mapped,
        page,
        has_previous: page > 1,
        has_more,
    })
}

async fn get_commit_comment(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    comment_id: u64,
) -> Result<RawCommitComment, AppError> {
    let request = api_request(
        client,
        http::Method::GET,
        commit_comment_route(owner, repository, comment_id),
        None::<&()>,
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(commit_comment_preflight_error)?;
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(github_error)?
        .to_bytes();
    serde_json::from_slice(&bytes).map_err(|error| {
        AppError::GitHub(format!(
            "GitHub returned an invalid commit-comment preflight: {error}"
        ))
    })
}

fn ensure_comment_mutation_allowed(
    current: &GitHubCommitComment,
    guard: &super::GitHubCommitCommentGuard,
    mutation: &GitHubCommitCommentMutation,
) -> Result<(), AppError> {
    if current.database_id != guard.comment_id
        || current.id != guard.comment_node_id
        || current.updated_at != guard.expected_updated_at
    {
        return Err(AppError::GitHubCommentConflict(
            "the comment identity or revision changed on GitHub".to_string(),
        ));
    }
    let allowed = match mutation {
        GitHubCommitCommentMutation::Update { .. } => current.viewer_can_update,
        GitHubCommitCommentMutation::Delete { .. } => current.viewer_can_delete,
        GitHubCommitCommentMutation::Minimize { .. } => current.viewer_can_minimize,
        GitHubCommitCommentMutation::Unminimize { .. } => current.viewer_can_unminimize,
        GitHubCommitCommentMutation::Create { .. } => false,
    };
    if !allowed {
        return Err(AppError::GitHubPermission(
            "GitHub does not allow the viewer to modify this commit comment".to_string(),
        ));
    }
    let expected_minimized = match mutation {
        GitHubCommitCommentMutation::Minimize {
            expected_minimized, ..
        }
        | GitHubCommitCommentMutation::Unminimize {
            expected_minimized, ..
        } => Some(*expected_minimized),
        _ => None,
    };
    if let Some(expected_minimized) = expected_minimized {
        let requested_minimized = matches!(mutation, GitHubCommitCommentMutation::Minimize { .. });
        if expected_minimized != current.is_minimized || requested_minimized == current.is_minimized
        {
            return Err(AppError::GitHubCommentConflict(
                "the comment minimize state changed after it was loaded".to_string(),
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
pub(super) fn ensure_comment_mutation_allowed_for_test(
    current: &GitHubCommitComment,
    mutation: &GitHubCommitCommentMutation,
) -> Result<(), AppError> {
    let guard = match mutation {
        GitHubCommitCommentMutation::Update { guard, .. }
        | GitHubCommitCommentMutation::Delete { guard }
        | GitHubCommitCommentMutation::Minimize { guard, .. }
        | GitHubCommitCommentMutation::Unminimize { guard, .. } => guard,
        GitHubCommitCommentMutation::Create { .. } => {
            return Err(AppError::Validation(
                "a guarded commit-comment mutation is required".to_string(),
            ));
        }
    };
    ensure_comment_mutation_allowed(current, guard, mutation)
}

fn generic_minimize_mutation(
    mutation: &GitHubCommitCommentMutation,
) -> Result<GitHubCommentMutation, AppError> {
    match mutation {
        GitHubCommitCommentMutation::Minimize {
            guard,
            expected_minimized,
            classifier,
        } => Ok(GitHubCommentMutation::Minimize {
            comment_id: guard.comment_node_id.clone(),
            expected_updated_at: guard.expected_updated_at.clone(),
            expected_minimized: *expected_minimized,
            classifier: *classifier,
        }),
        GitHubCommitCommentMutation::Unminimize {
            guard,
            expected_minimized,
        } => Ok(GitHubCommentMutation::Unminimize {
            comment_id: guard.comment_node_id.clone(),
            expected_updated_at: guard.expected_updated_at.clone(),
            expected_minimized: *expected_minimized,
        }),
        _ => Err(AppError::Validation(
            "the selected commit-comment mutation is not a minimize operation".to_string(),
        )),
    }
}

async fn refreshed_commit_comment(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    commit_sha: &str,
    comment_id: u64,
) -> Result<GitHubCommitComment, AppError> {
    let raw = get_commit_comment(client, owner, repository, comment_id).await?;
    let node_id = raw.node_id.clone();
    let capabilities =
        commit_comment_capabilities(client, owner, repository, vec![node_id.as_str()]).await?;
    commit_comment_page_from_raw(vec![raw], capabilities, commit_sha, 1, false)?
        .comments
        .into_iter()
        .next()
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the minimized commit comment".to_string())
        })
}

fn verify_created_comment(
    comment: RawCommitComment,
    commit_sha: &str,
    body: &str,
    placement: Option<&GitHubCommitCommentPlacement>,
) -> Result<GitHubCommitComment, AppError> {
    if comment.id == 0
        || comment.node_id.trim().is_empty()
        || comment.commit_id != commit_sha
        || comment.body != body
        || comment.path.as_deref() != placement.map(|placement| placement.path.as_str())
        || comment.position != placement.map(|placement| placement.position)
    {
        return Err(AppError::GitHub(
            "GitHub returned a different created commit comment".to_string(),
        ));
    }
    Ok(commit_comment_from_raw(
        comment, false, false, false, None, false, false,
    ))
}

fn verify_updated_comment(
    updated: RawCommitComment,
    current: &GitHubCommitComment,
    body: &str,
) -> Result<GitHubCommitComment, AppError> {
    if updated.id != current.database_id
        || updated.node_id != current.id
        || updated.commit_id != current.commit_sha
        || updated.body != body
        || updated.path != current.path
        || updated.position != current.position
        || updated.line != current.line
    {
        return Err(AppError::GitHubCommentConflict(
            "GitHub returned a different updated commit comment".to_string(),
        ));
    }
    Ok(commit_comment_from_raw(
        updated,
        current.viewer_can_update,
        current.viewer_can_delete,
        current.is_minimized,
        current.minimized_reason.clone(),
        current.viewer_can_minimize,
        current.viewer_can_unminimize,
    ))
}

fn commit_comment_from_raw(
    comment: RawCommitComment,
    viewer_can_update: bool,
    viewer_can_delete: bool,
    is_minimized: bool,
    minimized_reason: Option<String>,
    viewer_can_minimize: bool,
    viewer_can_unminimize: bool,
) -> GitHubCommitComment {
    GitHubCommitComment {
        id: comment.node_id,
        database_id: comment.id,
        commit_sha: comment.commit_id,
        body: comment.body,
        path: comment.path,
        position: comment.position,
        line: comment.line,
        author: comment.user.map(|author| GitHubCommitCommentAuthor {
            login: author.login,
            avatar_url: author.avatar_url,
        }),
        author_association: comment.author_association,
        url: comment.html_url,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        viewer_can_update,
        viewer_can_delete,
        is_minimized,
        minimized_reason,
        viewer_can_minimize,
        viewer_can_unminimize,
    }
}

async fn commit_comment_capabilities(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    ids: Vec<&str>,
) -> Result<CommitCommentCapabilitiesQuery, AppError> {
    let payload = serde_json::json!({
        "query": COMMIT_COMMENT_CAPABILITIES_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "ids": ids,
        }
    });
    client.graphql(&payload).await.map_err(github_error)
}

fn commit_comment_preflight_error(error: octocrab::Error) -> AppError {
    if github_status(&error) == Some(404) {
        return AppError::GitHubCommentConflict(
            "the commit comment no longer exists or is inaccessible".to_string(),
        );
    }
    github_error(error)
}

fn commit_comment_create_error(error: octocrab::Error) -> AppError {
    let status = github_status(&error);
    let mapped = github_error(error);
    if matches!(
        mapped,
        AppError::GitHubRateLimited(_) | AppError::GitHubPermission(_)
    ) {
        return mapped;
    }
    match status {
        Some(404) => AppError::GitHubPermission(
            "GitHub could not access this commit or repository for comment creation".to_string(),
        ),
        Some(422) => AppError::Validation(mapped.to_string()),
        _ => mapped,
    }
}

fn commit_comment_write_error(error: octocrab::Error) -> AppError {
    let status = github_status(&error);
    let mapped = github_error(error);
    if matches!(
        mapped,
        AppError::GitHubRateLimited(_) | AppError::GitHubPermission(_)
    ) {
        return mapped;
    }
    match status {
        Some(404) | Some(409) => AppError::GitHubCommentConflict(
            "the commit comment changed before GitHub applied the write".to_string(),
        ),
        Some(422) => AppError::Validation(mapped.to_string()),
        _ => mapped,
    }
}

fn github_status(error: &octocrab::Error) -> Option<u16> {
    match error {
        octocrab::Error::GitHub { source, .. } => Some(source.status_code.as_u16()),
        _ => None,
    }
}

fn api_request<T: Serialize + ?Sized>(
    client: &octocrab::Octocrab,
    method: http::Method,
    route: String,
    body: Option<&T>,
) -> Result<http::Request<octocrab::OctoBody>, AppError> {
    let request = http::Request::builder()
        .method(method)
        .uri(route)
        .header(http::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION);
    client.build_request(request, body).map_err(github_error)
}

fn link_header_has_next(value: &str) -> bool {
    value.split(',').any(|part| {
        part.split(';')
            .skip(1)
            .any(|parameter| parameter.trim() == "rel=\"next\"")
    })
}

pub(super) fn commit_comments_route(
    owner: &str,
    repository: &str,
    commit_sha: &str,
    page: u32,
) -> String {
    format!(
        "{}?per_page={COMMIT_COMMENT_PAGE_SIZE}&page={page}",
        commit_comments_route_without_page(owner, repository, commit_sha)
    )
}

fn commit_comments_route_without_page(owner: &str, repository: &str, commit_sha: &str) -> String {
    format!("/repos/{owner}/{repository}/commits/{commit_sha}/comments")
}

pub(super) fn commit_comment_route(owner: &str, repository: &str, comment_id: u64) -> String {
    format!("/repos/{owner}/{repository}/comments/{comment_id}")
}
