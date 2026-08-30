use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{authenticated_client, GitHubService, OctocrabGitHubClient};
use crate::error::AppError;

const COMMIT_SHA_LENGTH: usize = 40;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitCommentAuthor {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitComment {
    pub id: String,
    pub database_id: u64,
    pub commit_sha: String,
    pub body: String,
    pub path: Option<String>,
    pub position: Option<u64>,
    pub line: Option<u64>,
    pub author: Option<GitHubCommitCommentAuthor>,
    pub author_association: Option<String>,
    pub url: String,
    pub created_at: String,
    pub updated_at: String,
    pub viewer_can_update: bool,
    pub viewer_can_delete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitCommentPage {
    pub comments: Vec<GitHubCommitComment>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitCommentPlacement {
    pub path: String,
    pub position: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitCommentGuard {
    pub comment_id: u64,
    pub comment_node_id: String,
    pub expected_updated_at: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitHubCommitCommentMutation {
    Create {
        body: String,
        placement: Option<GitHubCommitCommentPlacement>,
    },
    Update {
        #[serde(flatten)]
        guard: GitHubCommitCommentGuard,
        body: String,
    },
    Delete {
        #[serde(flatten)]
        guard: GitHubCommitCommentGuard,
    },
}

#[async_trait]
pub(crate) trait GitHubCommitCommentClient: Send + Sync {
    async fn repository_commit_comments(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        page: u32,
    ) -> Result<GitHubCommitCommentPage, AppError>;

    async fn mutate_repository_commit_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        mutation: &GitHubCommitCommentMutation,
    ) -> Result<Option<GitHubCommitComment>, AppError>;
}

impl GitHubService {
    pub async fn commit_comments(
        &self,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        page: u32,
    ) -> Result<GitHubCommitCommentPage, AppError> {
        let commit_sha = normalize_commit_comment_sha(commit_sha)?;
        let page = normalize_commit_comment_page(page)?;
        let token = self.load_access_token().await?;
        self.client
            .repository_commit_comments(&token, owner, repository, &commit_sha, page)
            .await
    }

    pub async fn mutate_commit_comment(
        &self,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        mutation: GitHubCommitCommentMutation,
    ) -> Result<Option<GitHubCommitComment>, AppError> {
        let commit_sha = normalize_commit_comment_sha(commit_sha)?;
        let mutation = normalize_commit_comment_mutation(mutation)?;
        let token = self.load_access_token().await?;
        self.client
            .mutate_repository_commit_comment(&token, owner, repository, &commit_sha, &mutation)
            .await
    }
}

#[async_trait]
impl GitHubCommitCommentClient for OctocrabGitHubClient {
    async fn repository_commit_comments(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        page: u32,
    ) -> Result<GitHubCommitCommentPage, AppError> {
        let client = authenticated_client(token)?;
        transport::list_commit_comments_with_client(&client, owner, repository, commit_sha, page)
            .await
    }

    async fn mutate_repository_commit_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        mutation: &GitHubCommitCommentMutation,
    ) -> Result<Option<GitHubCommitComment>, AppError> {
        let client = authenticated_client(token)?;
        transport::mutate_commit_comment_with_client(
            &client, owner, repository, commit_sha, mutation,
        )
        .await
    }
}

fn normalize_commit_comment_sha(value: &str) -> Result<String, AppError> {
    let value = value.trim();
    if value.len() != COMMIT_SHA_LENGTH || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::Validation(
            "a full 40-character commit SHA is required".to_string(),
        ));
    }
    Ok(value.to_ascii_lowercase())
}

fn normalize_commit_comment_page(page: u32) -> Result<u32, AppError> {
    if page == 0 {
        return Err(AppError::Validation(
            "commit comment page must be greater than zero".to_string(),
        ));
    }
    Ok(page)
}

fn normalize_commit_comment_mutation(
    mutation: GitHubCommitCommentMutation,
) -> Result<GitHubCommitCommentMutation, AppError> {
    match mutation {
        GitHubCommitCommentMutation::Create { body, placement } => {
            Ok(GitHubCommitCommentMutation::Create {
                body: normalize_comment_body(body)?,
                placement: placement.map(normalize_comment_placement).transpose()?,
            })
        }
        GitHubCommitCommentMutation::Update { guard, body } => {
            Ok(GitHubCommitCommentMutation::Update {
                guard: normalize_comment_guard(guard)?,
                body: normalize_comment_body(body)?,
            })
        }
        GitHubCommitCommentMutation::Delete { guard } => Ok(GitHubCommitCommentMutation::Delete {
            guard: normalize_comment_guard(guard)?,
        }),
    }
}

fn normalize_comment_guard(
    guard: GitHubCommitCommentGuard,
) -> Result<GitHubCommitCommentGuard, AppError> {
    Ok(GitHubCommitCommentGuard {
        comment_id: normalize_comment_database_id(guard.comment_id)?,
        comment_node_id: normalize_comment_node_id(guard.comment_node_id)?,
        expected_updated_at: normalize_comment_revision(guard.expected_updated_at)?,
    })
}

fn normalize_comment_body(body: String) -> Result<String, AppError> {
    if body.trim().is_empty() || body.contains('\0') {
        return Err(AppError::Validation(
            "commit comment body is invalid".to_string(),
        ));
    }
    Ok(body)
}

fn normalize_comment_placement(
    placement: GitHubCommitCommentPlacement,
) -> Result<GitHubCommitCommentPlacement, AppError> {
    if placement.path.is_empty()
        || placement.path.len() > 4_096
        || placement.path.contains('\0')
        || placement.position == 0
        || placement.position > i64::MAX as u64
    {
        return Err(AppError::Validation(
            "commit comment placement is invalid".to_string(),
        ));
    }
    Ok(placement)
}

fn normalize_comment_database_id(comment_id: u64) -> Result<u64, AppError> {
    if comment_id == 0 {
        return Err(AppError::Validation(
            "commit comment ID must be greater than zero".to_string(),
        ));
    }
    Ok(comment_id)
}

fn normalize_comment_node_id(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.is_empty()
        || value.len() > 512
        || value.chars().any(char::is_whitespace)
        || value.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "commit comment Node ID is invalid".to_string(),
        ));
    }
    Ok(value)
}

fn normalize_comment_revision(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.is_empty()
        || value.len() > 128
        || value.chars().any(char::is_control)
        || !value.contains('T')
    {
        return Err(AppError::Validation(
            "commit comment revision is invalid".to_string(),
        ));
    }
    Ok(value)
}

#[cfg(test)]
#[async_trait]
impl GitHubCommitCommentClient for super::tests::FakeGitHubClient {
    async fn repository_commit_comments(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        page: u32,
    ) -> Result<GitHubCommitCommentPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert_eq!(commit_sha.len(), COMMIT_SHA_LENGTH);
        Ok(GitHubCommitCommentPage {
            comments: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn mutate_repository_commit_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        mutation: &GitHubCommitCommentMutation,
    ) -> Result<Option<GitHubCommitComment>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        let GitHubCommitCommentMutation::Create { body, placement } = mutation else {
            return Ok(None);
        };
        Ok(Some(GitHubCommitComment {
            id: "CC_42".to_string(),
            database_id: 42,
            commit_sha: commit_sha.to_string(),
            body: body.clone(),
            path: placement.as_ref().map(|placement| placement.path.clone()),
            position: placement.as_ref().map(|placement| placement.position),
            line: None,
            author: None,
            author_association: None,
            url: format!(
                "https://github.com/{owner}/{repository}/commit/{commit_sha}#commitcomment-42"
            ),
            created_at: "2026-08-30T01:00:00Z".to_string(),
            updated_at: "2026-08-30T01:00:00Z".to_string(),
            viewer_can_update: true,
            viewer_can_delete: true,
        }))
    }
}

mod transport;

#[cfg(test)]
mod tests;
