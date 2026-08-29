use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, Weak},
    time::{SystemTime, UNIX_EPOCH},
};

use async_trait::async_trait;
use git2::{
    AutotagOption, Cred, CredentialType, DiffFormat, DiffOptions, Direction, ErrorClass, ErrorCode,
    FetchOptions, Index, IndexEntry, IndexTime, ObjectType, Oid, PushOptions, RemoteCallbacks,
    RemoteRedirect, Repository, Signature, Sort,
};
use serde::{Deserialize, Serialize};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use url::Url;

use crate::error::AppError;

use super::{
    authenticated_client, github_error, GitHubIdentity, GitHubService, OctocrabGitHubClient,
};

const MAX_WIKI_PAGE_BYTES: usize = 1024 * 1024;
const MAX_WIKI_FILES: usize = 5_000;
const MAX_WIKI_CACHES: usize = 16;
const WIKI_HISTORY_PAGE_SIZE: usize = 30;
const MAX_WIKI_HISTORY_SCAN: usize = 2_000;
const MAX_WIKI_PATCH_BYTES: usize = 512 * 1024;
const MAX_WIKI_SEARCH_QUERY_CHARS: usize = 256;
const MAX_WIKI_SEARCH_RESULTS: usize = 100;
const MAX_WIKI_REPOSITORY_CACHE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_WIKI_TOTAL_CACHE_BYTES: u64 = 256 * 1024 * 1024;
const CACHE_ACCESS_MARKER: &str = "harbor-cache-access";
const CACHE_BRANCH_MARKER: &str = "harbor-default-branch";

type RepositoryLock = Arc<Mutex<()>>;
type RepositoryLockMap = Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>;

static REPOSITORY_LOCKS: OnceLock<RepositoryLockMap> = OnceLock::new();
static WIKI_OPERATIONS: OnceLock<Arc<Semaphore>> = OnceLock::new();

struct SyncedWikiRepository {
    repo: Repository,
    default_branch: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubWikiPageKind {
    Home,
    Page,
    Sidebar,
    Footer,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiPageSummary {
    pub path: String,
    pub title: String,
    pub kind: GitHubWikiPageKind,
    pub markdown: bool,
    pub blob_sha: String,
    pub byte_size: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiOverview {
    pub repository_id: u64,
    pub enabled: bool,
    pub initialized: bool,
    pub can_edit: bool,
    pub archived: bool,
    pub default_branch: Option<String>,
    pub head_sha: Option<String>,
    pub pages: Vec<GitHubWikiPageSummary>,
    pub sidebar: Option<GitHubWikiPageSummary>,
    pub footer: Option<GitHubWikiPageSummary>,
    pub unsupported_file_count: u32,
    pub truncated: bool,
    pub stale: bool,
    pub fetched_at: Option<i64>,
    pub web_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiPage {
    pub path: String,
    pub title: String,
    pub kind: GitHubWikiPageKind,
    pub markdown: bool,
    pub blob_sha: String,
    pub byte_size: u64,
    pub content: String,
    pub head_sha: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiSearchResult {
    pub pages: Vec<GitHubWikiPageSummary>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiPageMutationInput {
    pub original_path: Option<String>,
    pub title: String,
    pub content: String,
    pub expected_head: String,
    pub expected_blob_sha: Option<String>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiMutationResult {
    pub overview: GitHubWikiOverview,
    pub page: Option<GitHubWikiPage>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiRevisionSummary {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub author_name: Option<String>,
    pub authored_at: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiHistoryPage {
    pub revisions: Vec<GitHubWikiRevisionSummary>,
    pub page: u32,
    pub has_more: bool,
    pub truncated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiRevision {
    pub revision: GitHubWikiRevisionSummary,
    pub path: String,
    pub blob_sha: Option<String>,
    pub content: Option<String>,
    pub deleted: bool,
    pub markdown: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiComparison {
    pub path: String,
    pub base_sha: String,
    pub head_sha: String,
    pub patch: String,
    pub additions: u64,
    pub deletions: u64,
    pub truncated: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWikiRevertInput {
    pub path: String,
    pub expected_head: String,
    pub expected_blob_sha: String,
    pub source_commit_sha: String,
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GitHubWikiAccess {
    repository_id: u64,
    owner: String,
    repository: String,
    enabled: bool,
    can_edit: bool,
    archived: bool,
}

#[async_trait]
pub(crate) trait GitHubWikiClient: Send + Sync {
    async fn repository_wiki_access(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWikiAccess, AppError>;
}

#[async_trait]
pub(crate) trait WikiRepositoryStore: Send + Sync {
    async fn overview(
        &self,
        cache_root: PathBuf,
        access: GitHubWikiAccess,
        token: String,
    ) -> Result<GitHubWikiOverview, AppError>;
    async fn page(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
    ) -> Result<GitHubWikiPage, AppError>;
    async fn search(
        &self,
        target: WikiRepositorySnapshot,
        query: &str,
    ) -> Result<GitHubWikiSearchResult, AppError>;
    async fn history(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
        page: u32,
    ) -> Result<GitHubWikiHistoryPage, AppError>;
    async fn revision(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
    ) -> Result<GitHubWikiRevision, AppError>;
    async fn compare(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
        base_sha: &str,
    ) -> Result<GitHubWikiComparison, AppError>;
    async fn mutate(
        &self,
        context: WikiWriteContext,
        input: GitHubWikiPageMutationInput,
    ) -> Result<GitHubWikiMutationResult, AppError>;
    async fn delete(
        &self,
        context: WikiWriteContext,
        path: &str,
        expected_head: &str,
        expected_blob_sha: &str,
    ) -> Result<GitHubWikiMutationResult, AppError>;
    async fn revert(
        &self,
        context: WikiWriteContext,
        input: GitHubWikiRevertInput,
    ) -> Result<GitHubWikiMutationResult, AppError>;
}

pub(crate) struct GitWikiRepositoryStore;

pub(crate) struct WikiRepositorySnapshot {
    cache_root: PathBuf,
    repository_id: u64,
    remote_url: String,
    revision: String,
}

impl WikiRepositorySnapshot {
    fn new(
        cache_root: PathBuf,
        repository_id: u64,
        owner: &str,
        repository: &str,
        revision: &str,
    ) -> Self {
        Self {
            cache_root,
            repository_id,
            remote_url: wiki_remote_url(owner, repository),
            revision: revision.to_string(),
        }
    }
}

pub(crate) struct WikiWriteContext {
    cache_root: PathBuf,
    access: GitHubWikiAccess,
    token: String,
    identity: GitHubIdentity,
}

#[async_trait]
impl WikiRepositoryStore for GitWikiRepositoryStore {
    async fn overview(
        &self,
        cache_root: PathBuf,
        access: GitHubWikiAccess,
        token: String,
    ) -> Result<GitHubWikiOverview, AppError> {
        if !access.enabled {
            return Ok(disabled_overview(access));
        }

        let operation_permit = wiki_operation_permit().await?;
        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&cache_root, access.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            prune_wiki_caches(&cache_root, &cache_path);
            let remote_url = wiki_remote_url(&access.owner, &access.repository);
            match sync_wiki_repository(&cache_path, &remote_url, &token) {
                Ok(synced) => overview_from_repository(
                    &synced.repo,
                    &synced.default_branch,
                    access,
                    false,
                    Some(unix_timestamp_now()),
                ),
                Err(error) if is_uninitialized_after_metadata(&error) => {
                    Ok(uninitialized_overview(access))
                }
                Err(error) if is_offline_git_error(&error) => {
                    offline_overview(&cache_path, access).map_err(|_| git_error(error))
                }
                Err(error) => Err(git_error(error)),
            }
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki sync task failed: {error}")))?
    }

    async fn page(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
    ) -> Result<GitHubWikiPage, AppError> {
        let operation_permit = wiki_operation_permit().await?;
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&target.cache_root, target.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let repo = open_wiki_cache(&cache_path, &target.remote_url)?;
            read_page_at_head(&repo, &target.revision, &path)
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki read task failed: {error}")))?
    }

    async fn search(
        &self,
        target: WikiRepositorySnapshot,
        query: &str,
    ) -> Result<GitHubWikiSearchResult, AppError> {
        validate_head_sha(&target.revision)?;
        let query = normalize_search_query(query)?;
        let operation_permit = wiki_operation_permit().await?;
        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&target.cache_root, target.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let repo = open_wiki_cache(&cache_path, &target.remote_url)?;
            search_pages_at_head(&repo, &target.revision, &query)
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki search task failed: {error}")))?
    }

    async fn history(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
        page: u32,
    ) -> Result<GitHubWikiHistoryPage, AppError> {
        validate_head_sha(&target.revision)?;
        validate_page_path(path)?;
        if page == 0 || page > 100 {
            return Err(AppError::Validation(
                "Wiki history page is out of range".to_string(),
            ));
        }
        let operation_permit = wiki_operation_permit().await?;
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&target.cache_root, target.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let repo = open_wiki_cache(&cache_path, &target.remote_url)?;
            history_at_head(&repo, &target.revision, &path, page)
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki history task failed: {error}")))?
    }

    async fn revision(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
    ) -> Result<GitHubWikiRevision, AppError> {
        validate_head_sha(&target.revision)?;
        validate_page_path(path)?;
        let operation_permit = wiki_operation_permit().await?;
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&target.cache_root, target.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let repo = open_wiki_cache(&cache_path, &target.remote_url)?;
            revision_at_commit(&repo, &target.revision, &path)
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki revision task failed: {error}")))?
    }

    async fn compare(
        &self,
        target: WikiRepositorySnapshot,
        path: &str,
        base_sha: &str,
    ) -> Result<GitHubWikiComparison, AppError> {
        validate_page_path(path)?;
        validate_head_sha(base_sha)?;
        validate_head_sha(&target.revision)?;
        let operation_permit = wiki_operation_permit().await?;
        let path = path.to_string();
        let base_sha = base_sha.to_string();
        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&target.cache_root, target.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let repo = open_wiki_cache(&cache_path, &target.remote_url)?;
            compare_revisions(&repo, &path, &base_sha, &target.revision)
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki comparison task failed: {error}")))?
    }

    async fn mutate(
        &self,
        context: WikiWriteContext,
        input: GitHubWikiPageMutationInput,
    ) -> Result<GitHubWikiMutationResult, AppError> {
        validate_mutation_input(&input)?;
        let operation_permit = wiki_operation_permit().await?;

        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&context.cache_root, context.access.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let remote_url = wiki_remote_url(&context.access.owner, &context.access.repository);
            let synced = sync_wiki_repository(&cache_path, &remote_url, &context.token).map_err(
                |error| {
                    if is_uninitialized_after_metadata(&error) {
                        AppError::GitHubPermission(
                            "Create the first Wiki page on GitHub before editing it in Harbor"
                                .to_string(),
                        )
                    } else {
                        git_error(error)
                    }
                },
            )?;
            let (new_path, commit_sha) = commit_page_mutation(
                &synced.repo,
                &synced.default_branch,
                &input,
                &context.identity,
            )?;
            push_wiki_head(
                &synced.repo,
                &remote_url,
                &synced.default_branch,
                &context.token,
            )?;
            drop(synced.repo);
            let authoritative = sync_wiki_repository(&cache_path, &remote_url, &context.token)
                .map_err(git_error)?;
            if remote_head(&authoritative.repo, &authoritative.default_branch).map_err(git_error)?
                != commit_sha
            {
                return Err(AppError::GitHubWikiConflict(
                    "GitHub did not publish the Wiki commit as the remote head".to_string(),
                ));
            }
            let overview = overview_from_repository(
                &authoritative.repo,
                &authoritative.default_branch,
                context.access,
                false,
                Some(unix_timestamp_now()),
            )?;
            let head_sha = overview.head_sha.clone().ok_or_else(|| {
                AppError::GitHub("GitHub did not return the updated Wiki head".to_string())
            })?;
            let page = read_page_at_head(&authoritative.repo, &head_sha, &new_path)?;
            Ok(GitHubWikiMutationResult {
                overview,
                page: Some(page),
            })
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki write task failed: {error}")))?
    }

    async fn delete(
        &self,
        context: WikiWriteContext,
        path: &str,
        expected_head: &str,
        expected_blob_sha: &str,
    ) -> Result<GitHubWikiMutationResult, AppError> {
        validate_page_path(path)?;
        validate_head_sha(expected_head)?;
        validate_head_sha(expected_blob_sha)?;
        let operation_permit = wiki_operation_permit().await?;
        let path = path.to_string();
        let expected_head = expected_head.to_string();
        let expected_blob_sha = expected_blob_sha.to_string();

        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&context.cache_root, context.access.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let remote_url = wiki_remote_url(&context.access.owner, &context.access.repository);
            let synced = sync_wiki_repository(&cache_path, &remote_url, &context.token)
                .map_err(git_error)?;
            let commit_sha = commit_page_deletion(
                &synced.repo,
                &synced.default_branch,
                &path,
                &expected_head,
                &expected_blob_sha,
                &context.identity,
            )?;
            push_wiki_head(
                &synced.repo,
                &remote_url,
                &synced.default_branch,
                &context.token,
            )?;
            drop(synced.repo);
            let authoritative = sync_wiki_repository(&cache_path, &remote_url, &context.token)
                .map_err(git_error)?;
            if remote_head(&authoritative.repo, &authoritative.default_branch).map_err(git_error)?
                != commit_sha
            {
                return Err(AppError::GitHubWikiConflict(
                    "GitHub did not publish the Wiki deletion as the remote head".to_string(),
                ));
            }
            Ok(GitHubWikiMutationResult {
                overview: overview_from_repository(
                    &authoritative.repo,
                    &authoritative.default_branch,
                    context.access,
                    false,
                    Some(unix_timestamp_now()),
                )?,
                page: None,
            })
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki delete task failed: {error}")))?
    }

    async fn revert(
        &self,
        context: WikiWriteContext,
        input: GitHubWikiRevertInput,
    ) -> Result<GitHubWikiMutationResult, AppError> {
        validate_page_path(&input.path)?;
        validate_head_sha(&input.expected_head)?;
        validate_head_sha(&input.expected_blob_sha)?;
        validate_head_sha(&input.source_commit_sha)?;
        if let Some(message) = input.message.as_deref() {
            mutation_message(Some(message), "Revert Wiki page")?;
        }
        let operation_permit = wiki_operation_permit().await?;

        tokio::task::spawn_blocking(move || {
            let _operation_permit = operation_permit;
            let cache_path = wiki_cache_path(&context.cache_root, context.access.repository_id);
            let repository_lock = repository_lock(&cache_path)?;
            let _guard = repository_lock
                .lock()
                .map_err(|_| AppError::GitHub("Wiki cache lock is unavailable".to_string()))?;
            let remote_url = wiki_remote_url(&context.access.owner, &context.access.repository);
            let synced = sync_wiki_repository(&cache_path, &remote_url, &context.token)
                .map_err(git_error)?;
            let commit_sha = commit_page_revert(
                &synced.repo,
                &synced.default_branch,
                &input,
                &context.identity,
            )?;
            push_wiki_head(
                &synced.repo,
                &remote_url,
                &synced.default_branch,
                &context.token,
            )?;
            drop(synced.repo);
            let authoritative = sync_wiki_repository(&cache_path, &remote_url, &context.token)
                .map_err(git_error)?;
            if remote_head(&authoritative.repo, &authoritative.default_branch).map_err(git_error)?
                != commit_sha
            {
                return Err(AppError::GitHubWikiConflict(
                    "GitHub did not publish the Wiki revert as the remote head".to_string(),
                ));
            }
            let overview = overview_from_repository(
                &authoritative.repo,
                &authoritative.default_branch,
                context.access,
                false,
                Some(unix_timestamp_now()),
            )?;
            let head_sha = overview.head_sha.clone().ok_or_else(|| {
                AppError::GitHub("GitHub did not return the reverted Wiki head".to_string())
            })?;
            let page = read_page_at_head(&authoritative.repo, &head_sha, &input.path)?;
            Ok(GitHubWikiMutationResult {
                overview,
                page: Some(page),
            })
        })
        .await
        .map_err(|error| AppError::GitHub(format!("Wiki revert task failed: {error}")))?
    }
}

impl GitHubService {
    pub async fn repository_wiki_overview(
        &self,
        cache_root: PathBuf,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWikiOverview, AppError> {
        let token = self.load_access_token().await?;
        let access = self
            .client
            .repository_wiki_access(&token, owner, repository)
            .await?;
        self.wiki_store.overview(cache_root, access, token).await
    }

    pub async fn repository_wiki_page(
        &self,
        cache_root: PathBuf,
        repository_id: u64,
        owner: &str,
        repository: &str,
        head_sha: &str,
        path: &str,
    ) -> Result<GitHubWikiPage, AppError> {
        let target =
            WikiRepositorySnapshot::new(cache_root, repository_id, owner, repository, head_sha);
        self.wiki_store.page(target, path).await
    }

    pub async fn search_repository_wiki(
        &self,
        cache_root: PathBuf,
        repository_id: u64,
        owner: &str,
        repository: &str,
        head_sha: &str,
        query: &str,
    ) -> Result<GitHubWikiSearchResult, AppError> {
        let target =
            WikiRepositorySnapshot::new(cache_root, repository_id, owner, repository, head_sha);
        self.wiki_store.search(target, query).await
    }

    pub async fn repository_wiki_history(
        &self,
        cache_root: PathBuf,
        repository_id: u64,
        owner: &str,
        repository: &str,
        head_sha: &str,
        path: &str,
        page: u32,
    ) -> Result<GitHubWikiHistoryPage, AppError> {
        let target =
            WikiRepositorySnapshot::new(cache_root, repository_id, owner, repository, head_sha);
        self.wiki_store.history(target, path, page).await
    }

    pub async fn repository_wiki_revision(
        &self,
        cache_root: PathBuf,
        repository_id: u64,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        path: &str,
    ) -> Result<GitHubWikiRevision, AppError> {
        let target =
            WikiRepositorySnapshot::new(cache_root, repository_id, owner, repository, commit_sha);
        self.wiki_store.revision(target, path).await
    }

    pub async fn compare_repository_wiki_revisions(
        &self,
        cache_root: PathBuf,
        repository_id: u64,
        owner: &str,
        repository: &str,
        path: &str,
        base_sha: &str,
        head_sha: &str,
    ) -> Result<GitHubWikiComparison, AppError> {
        let target =
            WikiRepositorySnapshot::new(cache_root, repository_id, owner, repository, head_sha);
        self.wiki_store.compare(target, path, base_sha).await
    }

    pub async fn mutate_repository_wiki_page(
        &self,
        cache_root: PathBuf,
        owner: &str,
        repository: &str,
        input: GitHubWikiPageMutationInput,
    ) -> Result<GitHubWikiMutationResult, AppError> {
        let token = self.load_access_token().await?;
        let access = self
            .client
            .repository_wiki_access(&token, owner, repository)
            .await?;
        ensure_wiki_write_access(access.clone())?;
        let identity = self.viewer_identity(&token).await?;
        let context = WikiWriteContext {
            cache_root,
            access,
            token,
            identity,
        };
        self.wiki_store.mutate(context, input).await
    }

    pub async fn delete_repository_wiki_page(
        &self,
        cache_root: PathBuf,
        owner: &str,
        repository: &str,
        path: &str,
        expected_head: &str,
        expected_blob_sha: &str,
    ) -> Result<GitHubWikiMutationResult, AppError> {
        let token = self.load_access_token().await?;
        let access = self
            .client
            .repository_wiki_access(&token, owner, repository)
            .await?;
        ensure_wiki_write_access(access.clone())?;
        let identity = self.viewer_identity(&token).await?;
        let context = WikiWriteContext {
            cache_root,
            access,
            token,
            identity,
        };
        self.wiki_store
            .delete(context, path, expected_head, expected_blob_sha)
            .await
    }

    pub async fn revert_repository_wiki_page(
        &self,
        cache_root: PathBuf,
        owner: &str,
        repository: &str,
        input: GitHubWikiRevertInput,
    ) -> Result<GitHubWikiMutationResult, AppError> {
        let token = self.load_access_token().await?;
        let access = self
            .client
            .repository_wiki_access(&token, owner, repository)
            .await?;
        ensure_wiki_write_access(access.clone())?;
        let identity = self.viewer_identity(&token).await?;
        let context = WikiWriteContext {
            cache_root,
            access,
            token,
            identity,
        };
        self.wiki_store.revert(context, input).await
    }

    async fn viewer_identity(&self, token: &str) -> Result<GitHubIdentity, AppError> {
        if let Some(identity) = self
            .identity
            .read()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))?
            .clone()
        {
            return Ok(identity);
        }
        let identity = self.client.validate_token(token).await?;
        *self
            .identity
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? =
            Some(identity.clone());
        Ok(identity)
    }
}

#[derive(Deserialize)]
struct RawWikiRepositoryAccess {
    id: u64,
    owner: RawWikiOwner,
    name: String,
    #[serde(default)]
    has_wiki: bool,
    #[serde(default)]
    private: bool,
    #[serde(default)]
    archived: bool,
    permissions: Option<RawWikiPermissions>,
}

#[derive(Deserialize)]
struct RawWikiOwner {
    login: String,
}

#[derive(Deserialize)]
struct RawWikiPermissions {
    #[serde(default)]
    push: bool,
}

#[async_trait]
impl GitHubWikiClient for OctocrabGitHubClient {
    async fn repository_wiki_access(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWikiAccess, AppError> {
        let client = authenticated_client(token)?;
        let route = format!("/repos/{owner}/{repository}");
        let raw: RawWikiRepositoryAccess =
            client.get(route, None::<&()>).await.map_err(github_error)?;
        if !raw.owner.login.eq_ignore_ascii_case(owner)
            || !raw.name.eq_ignore_ascii_case(repository)
        {
            return Err(AppError::GitHub(
                "GitHub returned Wiki metadata for another repository".to_string(),
            ));
        }
        let push = raw.permissions.is_some_and(|permissions| permissions.push);
        Ok(GitHubWikiAccess {
            repository_id: raw.id,
            owner: raw.owner.login,
            repository: raw.name,
            enabled: raw.has_wiki,
            can_edit: !raw.archived && (push || !raw.private),
            archived: raw.archived,
        })
    }
}

fn repository_lock(cache_path: &Path) -> Result<RepositoryLock, AppError> {
    let locks = REPOSITORY_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut locks = locks
        .lock()
        .map_err(|_| AppError::GitHub("Wiki lock registry is unavailable".to_string()))?;
    locks.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = locks.get(cache_path).and_then(Weak::upgrade) {
        return Ok(lock);
    }
    let lock = Arc::new(Mutex::new(()));
    locks.insert(cache_path.to_path_buf(), Arc::downgrade(&lock));
    Ok(lock)
}

async fn wiki_operation_permit() -> Result<OwnedSemaphorePermit, AppError> {
    WIKI_OPERATIONS
        .get_or_init(|| Arc::new(Semaphore::new(2)))
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| AppError::GitHub("Wiki operation queue is unavailable".to_string()))
}

fn wiki_cache_path(cache_root: &Path, repository_id: u64) -> PathBuf {
    cache_root.join(format!("{repository_id}.git"))
}

fn wiki_remote_url(owner: &str, repository: &str) -> String {
    format!("https://github.com/{owner}/{repository}.wiki.git")
}

fn disabled_overview(access: GitHubWikiAccess) -> GitHubWikiOverview {
    GitHubWikiOverview {
        repository_id: access.repository_id,
        enabled: false,
        initialized: false,
        can_edit: false,
        archived: access.archived,
        default_branch: None,
        head_sha: None,
        pages: Vec::new(),
        sidebar: None,
        footer: None,
        unsupported_file_count: 0,
        truncated: false,
        stale: false,
        fetched_at: None,
        web_url: wiki_web_url(&access.owner, &access.repository),
    }
}

fn uninitialized_overview(access: GitHubWikiAccess) -> GitHubWikiOverview {
    GitHubWikiOverview {
        repository_id: access.repository_id,
        enabled: true,
        initialized: false,
        can_edit: access.can_edit,
        archived: access.archived,
        default_branch: None,
        head_sha: None,
        pages: Vec::new(),
        sidebar: None,
        footer: None,
        unsupported_file_count: 0,
        truncated: false,
        stale: false,
        fetched_at: None,
        web_url: wiki_web_url(&access.owner, &access.repository),
    }
}

fn wiki_web_url(owner: &str, repository: &str) -> String {
    format!("https://github.com/{owner}/{repository}/wiki")
}

fn sync_wiki_repository(
    cache_path: &Path,
    remote_url: &str,
    token: &str,
) -> Result<SyncedWikiRepository, git2::Error> {
    let repo = open_or_initialize_cache(cache_path, remote_url)?;
    let default_branch = discover_default_branch(&repo, remote_url, token)?;
    let mut remote = repo.find_remote("origin")?;
    let mut fetch_options = FetchOptions::new();
    fetch_options
        .remote_callbacks(authenticated_callbacks(remote_url, token, None))
        .follow_redirects(RemoteRedirect::None)
        .download_tags(AutotagOption::None);
    let fetch_refspec =
        format!("+refs/heads/{default_branch}:refs/remotes/origin/{default_branch}");
    remote.fetch(
        &[fetch_refspec],
        Some(&mut fetch_options),
        Some("Harbor Wiki sync"),
    )?;
    drop(remote);
    fs::write(cache_path.join(CACHE_BRANCH_MARKER), &default_branch).map_err(|error| {
        git2::Error::from_str(&format!("could not update the Wiki branch marker: {error}"))
    })?;
    touch_cache(cache_path);
    if directory_size(cache_path) > MAX_WIKI_REPOSITORY_CACHE_BYTES {
        return Err(git2::Error::from_str(
            "Wiki cache exceeds Harbor's 64 MiB repository limit",
        ));
    }
    Ok(SyncedWikiRepository {
        repo,
        default_branch,
    })
}

fn offline_overview(
    cache_path: &Path,
    access: GitHubWikiAccess,
) -> Result<GitHubWikiOverview, AppError> {
    let repo = open_wiki_cache(
        cache_path,
        &wiki_remote_url(&access.owner, &access.repository),
    )?;
    let default_branch = fs::read_to_string(cache_path.join(CACHE_BRANCH_MARKER))
        .map_err(|_| {
            AppError::GitHubWikiCacheMiss(
                "Refresh the Wiki once while online before using the offline snapshot".to_string(),
            )
        })?
        .trim()
        .to_string();
    if default_branch.is_empty() || default_branch.chars().any(char::is_control) {
        return Err(AppError::GitHubWikiCacheMiss(
            "The cached Wiki default branch is invalid".to_string(),
        ));
    }
    let fetched_at = fs::metadata(cache_path.join(CACHE_ACCESS_MARKER))
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(system_time_seconds);
    overview_from_repository(&repo, &default_branch, access, true, fetched_at)
}

fn unix_timestamp_now() -> i64 {
    system_time_seconds(SystemTime::now()).unwrap_or_default()
}

fn system_time_seconds(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| i64::try_from(duration.as_secs()).ok())
}

fn discover_default_branch(
    repo: &Repository,
    remote_url: &str,
    token: &str,
) -> Result<String, git2::Error> {
    let mut remote = repo.find_remote("origin")?;
    let connection = remote.connect_auth(
        Direction::Fetch,
        Some(authenticated_callbacks(remote_url, token, None)),
        None,
    )?;
    let branch = connection.default_branch()?;
    let branch = std::str::from_utf8(branch.as_ref())
        .map_err(|_| git2::Error::from_str("Wiki default branch is not UTF-8"))?
        .strip_prefix("refs/heads/")
        .ok_or_else(|| git2::Error::from_str("Wiki default branch is invalid"))?
        .to_string();
    if branch.is_empty() || branch.chars().any(char::is_control) {
        return Err(git2::Error::from_str("Wiki default branch is invalid"));
    }
    Ok(branch)
}

fn open_or_initialize_cache(
    cache_path: &Path,
    remote_url: &str,
) -> Result<Repository, git2::Error> {
    if cache_path.exists() {
        let existing = Repository::open_bare(cache_path);
        if let Ok(repo) = existing {
            let matches_remote = repo
                .find_remote("origin")
                .ok()
                .and_then(|remote| remote.url().ok().map(str::to_string))
                .is_some_and(|url| url == remote_url);
            if matches_remote {
                return Ok(repo);
            }
        }
        fs::remove_dir_all(cache_path).map_err(|error| {
            git2::Error::from_str(&format!("could not reset the Wiki cache: {error}"))
        })?;
    }

    fs::create_dir_all(
        cache_path
            .parent()
            .ok_or_else(|| git2::Error::from_str("Wiki cache root is invalid"))?,
    )
    .map_err(|error| git2::Error::from_str(&format!("could not create Wiki cache: {error}")))?;
    let repo = Repository::init_bare(cache_path)?;
    repo.remote("origin", remote_url)?;
    Ok(repo)
}

fn authenticated_callbacks(
    remote_url: &str,
    token: &str,
    rejection: Option<Arc<Mutex<Option<String>>>>,
) -> RemoteCallbacks<'static> {
    let expected_url = Url::parse(remote_url).expect("Harbor Wiki URL should be canonical");
    let token = token.to_string();
    let mut callbacks = RemoteCallbacks::new();
    callbacks.transfer_progress(|progress| {
        progress.received_bytes() as u64 <= MAX_WIKI_REPOSITORY_CACHE_BYTES
    });
    callbacks.credentials(move |url, _username, allowed| {
        if !is_exact_wiki_credential_url(url, &expected_url) {
            return Err(git2::Error::from_str(
                "refused to send GitHub credentials to another URL",
            ));
        }
        if allowed.contains(CredentialType::USER_PASS_PLAINTEXT) {
            return Cred::userpass_plaintext("x-access-token", &token);
        }
        if allowed.contains(CredentialType::USERNAME) {
            return Cred::username("x-access-token");
        }
        Err(git2::Error::from_str(
            "GitHub requested an unsupported credential type",
        ))
    });
    if let Some(rejection) = rejection {
        callbacks.push_update_reference(move |_reference, status| {
            if let Some(status) = status {
                *rejection
                    .lock()
                    .map_err(|_| git2::Error::from_str("Wiki push state is unavailable"))? =
                    Some(status.to_string());
            }
            Ok(())
        });
    }
    callbacks
}

fn is_exact_wiki_credential_url(candidate: &str, expected: &Url) -> bool {
    Url::parse(candidate).ok().is_some_and(|candidate| {
        candidate == *expected
            && candidate.scheme() == "https"
            && candidate.host_str() == Some("github.com")
            && candidate.port().is_none()
            && candidate.username().is_empty()
            && candidate.password().is_none()
            && candidate.query().is_none()
            && candidate.fragment().is_none()
    })
}

fn overview_from_repository(
    repo: &Repository,
    default_branch: &str,
    access: GitHubWikiAccess,
    stale: bool,
    fetched_at: Option<i64>,
) -> Result<GitHubWikiOverview, AppError> {
    let head = remote_head(repo, default_branch).map_err(git_error)?;
    let commit = repo.find_commit(head).map_err(git_error)?;
    let tree = commit.tree().map_err(git_error)?;
    let mut index = Index::new().map_err(git_error)?;
    index.read_tree(&tree).map_err(git_error)?;
    let mut pages = Vec::new();
    let mut sidebar = None;
    let mut footer = None;
    let mut unsupported_file_count = 0_u32;
    let mut traversed = 0_usize;
    for entry in index.iter() {
        traversed += 1;
        if traversed > MAX_WIKI_FILES {
            break;
        }
        let Ok(path) = std::str::from_utf8(&entry.path) else {
            unsupported_file_count = unsupported_file_count.saturating_add(1);
            continue;
        };
        let byte_size = repo
            .find_blob(entry.id)
            .map(|blob| blob.size() as u64)
            .unwrap_or(entry.file_size as u64);
        let Some(summary) = page_summary(path, entry.id.to_string(), byte_size) else {
            unsupported_file_count = unsupported_file_count.saturating_add(1);
            continue;
        };
        match summary.kind {
            GitHubWikiPageKind::Sidebar => sidebar = Some(summary),
            GitHubWikiPageKind::Footer => footer = Some(summary),
            GitHubWikiPageKind::Home | GitHubWikiPageKind::Page => pages.push(summary),
        }
    }
    pages.sort_by(|left, right| {
        page_kind_order(left.kind)
            .cmp(&page_kind_order(right.kind))
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(GitHubWikiOverview {
        repository_id: access.repository_id,
        enabled: true,
        initialized: true,
        can_edit: access.can_edit,
        archived: access.archived,
        default_branch: Some(default_branch.to_string()),
        head_sha: Some(head.to_string()),
        pages,
        sidebar,
        footer,
        unsupported_file_count,
        truncated: traversed > MAX_WIKI_FILES,
        stale,
        fetched_at,
        web_url: wiki_web_url(&access.owner, &access.repository),
    })
}

fn read_page_at_head(
    repo: &Repository,
    head_sha: &str,
    path: &str,
) -> Result<GitHubWikiPage, AppError> {
    validate_head_sha(head_sha)?;
    validate_page_path(path)?;
    let head = Oid::from_str(head_sha)
        .map_err(|_| AppError::Validation("Wiki head revision is invalid".to_string()))?;
    let commit = repo.find_commit(head).map_err(|_| {
        AppError::GitHubWikiCacheMiss("Refresh the Wiki before opening this snapshot".to_string())
    })?;
    let tree = commit.tree().map_err(git_error)?;
    let entry = tree
        .get_path(Path::new(path))
        .ok()
        .filter(|entry| entry.kind() == Some(ObjectType::Blob))
        .ok_or_else(|| AppError::GitHub("Wiki page was not found".to_string()))?;
    let blob = repo.find_blob(entry.id()).map_err(git_error)?;
    if blob.size() > MAX_WIKI_PAGE_BYTES {
        return Err(AppError::GitHubWikiTooLarge(format!(
            "the page exceeds Harbor's {} MiB preview limit",
            MAX_WIKI_PAGE_BYTES / 1024 / 1024
        )));
    }
    let content = std::str::from_utf8(blob.content())
        .map_err(|_| {
            AppError::GitHubWikiUnsupportedPath("the Wiki page is not UTF-8 text".to_string())
        })?
        .to_string();
    let summary =
        page_summary(path, entry.id().to_string(), blob.size() as u64).ok_or_else(|| {
            AppError::GitHubWikiUnsupportedPath(
                "the page uses an unsupported markup filename".to_string(),
            )
        })?;
    Ok(GitHubWikiPage {
        path: summary.path,
        title: summary.title,
        kind: summary.kind,
        markdown: summary.markdown,
        blob_sha: summary.blob_sha,
        byte_size: summary.byte_size,
        content,
        head_sha: head.to_string(),
    })
}

fn normalize_search_query(query: &str) -> Result<String, AppError> {
    let query = query.trim();
    if query.is_empty() {
        return Err(AppError::Validation(
            "Wiki search query cannot be blank".to_string(),
        ));
    }
    if query.chars().count() > MAX_WIKI_SEARCH_QUERY_CHARS {
        return Err(AppError::Validation(
            "Wiki search query is too long".to_string(),
        ));
    }
    Ok(query.to_lowercase())
}

fn search_pages_at_head(
    repo: &Repository,
    head_sha: &str,
    query: &str,
) -> Result<GitHubWikiSearchResult, AppError> {
    let commit = repo
        .find_commit(Oid::from_str(head_sha).map_err(git_error)?)
        .map_err(git_error)?;
    let tree = commit.tree().map_err(git_error)?;
    let mut index = Index::new().map_err(git_error)?;
    index.read_tree(&tree).map_err(git_error)?;
    let mut pages = Vec::new();
    let mut traversed = 0_usize;
    let mut truncated = false;
    for entry in index.iter() {
        traversed += 1;
        if traversed > MAX_WIKI_FILES {
            truncated = true;
            break;
        }
        let Ok(path) = std::str::from_utf8(&entry.path) else {
            continue;
        };
        let Ok(blob) = repo.find_blob(entry.id) else {
            continue;
        };
        let Some(summary) = page_summary(path, entry.id.to_string(), blob.size() as u64) else {
            continue;
        };
        let metadata_matches = summary.title.to_lowercase().contains(query)
            || summary.path.to_lowercase().contains(query);
        let body_matches = blob.size() <= MAX_WIKI_PAGE_BYTES
            && std::str::from_utf8(blob.content())
                .is_ok_and(|content| content.to_lowercase().contains(query));
        if !metadata_matches && !body_matches {
            continue;
        }
        if pages.len() == MAX_WIKI_SEARCH_RESULTS {
            truncated = true;
            break;
        }
        pages.push(summary);
    }
    pages.sort_by(|left, right| {
        page_kind_order(left.kind)
            .cmp(&page_kind_order(right.kind))
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(GitHubWikiSearchResult { pages, truncated })
}

fn open_wiki_cache(cache_path: &Path, expected_remote_url: &str) -> Result<Repository, AppError> {
    let repo = Repository::open_bare(cache_path).map_err(|_| {
        AppError::GitHubWikiCacheMiss(
            "Refresh the Wiki overview before opening this snapshot".to_string(),
        )
    })?;
    let matches_remote = repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().ok().map(str::to_string))
        .is_some_and(|url| url == expected_remote_url);
    if !matches_remote {
        return Err(AppError::GitHubWikiCacheMiss(
            "The cached Wiki belongs to another repository; refresh before continuing".to_string(),
        ));
    }
    Ok(repo)
}

fn history_at_head(
    repo: &Repository,
    head_sha: &str,
    path: &str,
    page: u32,
) -> Result<GitHubWikiHistoryPage, AppError> {
    let head = Oid::from_str(head_sha)
        .map_err(|_| AppError::Validation("Wiki head revision is invalid".to_string()))?;
    repo.find_commit(head).map_err(|_| {
        AppError::GitHubWikiCacheMiss(
            "Refresh the Wiki before loading this history snapshot".to_string(),
        )
    })?;
    let skip = (page as usize - 1) * WIKI_HISTORY_PAGE_SIZE;
    let mut revisions = Vec::new();
    let mut matching = 0_usize;
    let mut truncated = false;
    let mut walk = repo.revwalk().map_err(git_error)?;
    walk.set_sorting(Sort::TIME).map_err(git_error)?;
    walk.push(head).map_err(git_error)?;
    for (scanned, oid) in walk.enumerate() {
        if scanned >= MAX_WIKI_HISTORY_SCAN {
            truncated = true;
            break;
        }
        let commit = repo
            .find_commit(oid.map_err(git_error)?)
            .map_err(git_error)?;
        if !commit_changes_path(&commit, path)? {
            continue;
        }
        if matching >= skip {
            revisions.push(revision_summary(&commit));
            if revisions.len() > WIKI_HISTORY_PAGE_SIZE {
                break;
            }
        }
        matching += 1;
    }
    let has_more = revisions.len() > WIKI_HISTORY_PAGE_SIZE;
    revisions.truncate(WIKI_HISTORY_PAGE_SIZE);
    Ok(GitHubWikiHistoryPage {
        revisions,
        page,
        has_more,
        truncated,
    })
}

fn commit_changes_path(commit: &git2::Commit<'_>, path: &str) -> Result<bool, AppError> {
    let current = blob_id_at_commit(commit, path)?;
    let previous = if commit.parent_count() == 0 {
        None
    } else {
        blob_id_at_commit(&commit.parent(0).map_err(git_error)?, path)?
    };
    Ok(current != previous)
}

fn blob_id_at_commit(commit: &git2::Commit<'_>, path: &str) -> Result<Option<Oid>, AppError> {
    let tree = commit.tree().map_err(git_error)?;
    match tree.get_path(Path::new(path)) {
        Ok(entry) if entry.kind() == Some(ObjectType::Blob) => Ok(Some(entry.id())),
        Ok(_) => Ok(None),
        Err(error) if error.code() == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(git_error(error)),
    }
}

fn revision_summary(commit: &git2::Commit<'_>) -> GitHubWikiRevisionSummary {
    let sha = commit.id().to_string();
    GitHubWikiRevisionSummary {
        short_sha: sha.chars().take(7).collect(),
        sha,
        message: commit.message().unwrap_or("Wiki update").trim().to_string(),
        author_name: commit.author().name().ok().map(str::to_string),
        authored_at: commit.author().when().seconds(),
    }
}

fn revision_at_commit(
    repo: &Repository,
    commit_sha: &str,
    path: &str,
) -> Result<GitHubWikiRevision, AppError> {
    let commit = repo
        .find_commit(
            Oid::from_str(commit_sha)
                .map_err(|_| AppError::Validation("Wiki revision is invalid".to_string()))?,
        )
        .map_err(|_| {
            AppError::GitHubWikiCacheMiss(
                "Refresh the Wiki before opening this revision".to_string(),
            )
        })?;
    let blob_sha = blob_id_at_commit(&commit, path)?;
    let (content, deleted) = match blob_sha {
        Some(blob_sha) => {
            let blob = repo.find_blob(blob_sha).map_err(git_error)?;
            if blob.size() > MAX_WIKI_PAGE_BYTES {
                return Err(AppError::GitHubWikiTooLarge(format!(
                    "the selected revision exceeds {} MiB",
                    MAX_WIKI_PAGE_BYTES / 1024 / 1024
                )));
            }
            let content = std::str::from_utf8(blob.content())
                .map_err(|_| {
                    AppError::GitHubWikiUnsupportedPath(
                        "the selected Wiki revision is not UTF-8 text".to_string(),
                    )
                })?
                .to_string();
            (Some(content), false)
        }
        None => (None, true),
    };
    let markdown = Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "mdown" | "mkdn"
            )
        });
    Ok(GitHubWikiRevision {
        revision: revision_summary(&commit),
        path: path.to_string(),
        blob_sha: blob_sha.map(|sha| sha.to_string()),
        content,
        deleted,
        markdown,
    })
}

fn compare_revisions(
    repo: &Repository,
    path: &str,
    base_sha: &str,
    head_sha: &str,
) -> Result<GitHubWikiComparison, AppError> {
    let base = repo
        .find_commit(
            Oid::from_str(base_sha)
                .map_err(|_| AppError::Validation("Wiki base revision is invalid".to_string()))?,
        )
        .map_err(|_| {
            AppError::GitHubWikiCacheMiss(
                "Refresh the Wiki before comparing this revision".to_string(),
            )
        })?;
    let head = repo
        .find_commit(
            Oid::from_str(head_sha)
                .map_err(|_| AppError::Validation("Wiki head revision is invalid".to_string()))?,
        )
        .map_err(|_| {
            AppError::GitHubWikiCacheMiss(
                "Refresh the Wiki before comparing this revision".to_string(),
            )
        })?;
    let base_tree = base.tree().map_err(git_error)?;
    let head_tree = head.tree().map_err(git_error)?;
    let mut options = DiffOptions::new();
    options.pathspec(path).context_lines(3);
    let diff = repo
        .diff_tree_to_tree(Some(&base_tree), Some(&head_tree), Some(&mut options))
        .map_err(git_error)?;
    let stats = diff.stats().map_err(git_error)?;
    let mut patch = Vec::new();
    let mut truncated = false;
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        let content = line.content();
        let prefix = matches!(line.origin(), '+' | '-' | ' ').then_some(line.origin() as u8);
        let additional = content.len() + usize::from(prefix.is_some());
        if patch.len().saturating_add(additional) <= MAX_WIKI_PATCH_BYTES {
            if let Some(prefix) = prefix {
                patch.push(prefix);
            }
            patch.extend_from_slice(content);
        } else {
            truncated = true;
        }
        true
    })
    .map_err(git_error)?;
    Ok(GitHubWikiComparison {
        path: path.to_string(),
        base_sha: base_sha.to_string(),
        head_sha: head_sha.to_string(),
        patch: String::from_utf8_lossy(&patch).into_owned(),
        additions: stats.insertions() as u64,
        deletions: stats.deletions() as u64,
        truncated,
    })
}

fn commit_page_revert(
    repo: &Repository,
    default_branch: &str,
    input: &GitHubWikiRevertInput,
    identity: &GitHubIdentity,
) -> Result<Oid, AppError> {
    let head = ensure_expected_head(repo, default_branch, &input.expected_head)?;
    let parent = repo.find_commit(head).map_err(git_error)?;
    let parent_tree = parent.tree().map_err(git_error)?;
    let mut index = Index::new().map_err(git_error)?;
    index.read_tree(&parent_tree).map_err(git_error)?;
    let existing = index.get_path(Path::new(&input.path), 0).ok_or_else(|| {
        AppError::GitHubWikiConflict(
            "The Wiki page was removed; reload before reverting it".to_string(),
        )
    })?;
    if existing.id.to_string() != input.expected_blob_sha {
        return Err(AppError::GitHubWikiConflict(
            "The Wiki page changed; reload before reverting it".to_string(),
        ));
    }
    let source_commit = repo
        .find_commit(
            Oid::from_str(&input.source_commit_sha)
                .map_err(|_| AppError::Validation("Wiki revision is invalid".to_string()))?,
        )
        .map_err(|_| {
            AppError::GitHubWikiCacheMiss(
                "Refresh the Wiki before reverting this revision".to_string(),
            )
        })?;
    let source_blob = blob_id_at_commit(&source_commit, &input.path)?.ok_or_else(|| {
        AppError::Validation("The selected Wiki revision does not contain this page".to_string())
    })?;
    index
        .add(&wiki_index_entry(&input.path, source_blob))
        .map_err(git_error)?;
    let tree_id = index.write_tree_to(repo).map_err(git_error)?;
    let tree = repo.find_tree(tree_id).map_err(git_error)?;
    let signature = wiki_signature(identity)?;
    let local_ref = local_branch_ref(default_branch);
    repo.reference(&local_ref, head, true, "Harbor Wiki base")
        .map_err(git_error)?;
    repo.commit(
        Some(&local_ref),
        &signature,
        &signature,
        &mutation_message(
            input.message.as_deref(),
            &format!(
                "Revert {} to {}",
                input.path,
                input.source_commit_sha.chars().take(7).collect::<String>()
            ),
        )?,
        &tree,
        &[&parent],
    )
    .map_err(git_error)
}

fn commit_page_mutation(
    repo: &Repository,
    default_branch: &str,
    input: &GitHubWikiPageMutationInput,
    identity: &GitHubIdentity,
) -> Result<(String, Oid), AppError> {
    let head = ensure_expected_head(repo, default_branch, &input.expected_head)?;
    let parent = repo.find_commit(head).map_err(git_error)?;
    let parent_tree = parent.tree().map_err(git_error)?;
    let mut index = Index::new().map_err(git_error)?;
    index.read_tree(&parent_tree).map_err(git_error)?;
    let new_path = if let Some(original_path) = input.original_path.as_deref() {
        validate_page_path(original_path)?;
        let existing = index.get_path(Path::new(original_path), 0).ok_or_else(|| {
            AppError::GitHubWikiConflict(
                "The Wiki page was removed; reload before continuing".to_string(),
            )
        })?;
        let expected_blob_sha = input.expected_blob_sha.as_deref().ok_or_else(|| {
            AppError::Validation("The expected Wiki page revision is required".to_string())
        })?;
        validate_head_sha(expected_blob_sha)?;
        if existing.id.to_string() != expected_blob_sha {
            return Err(AppError::GitHubWikiConflict(
                "The Wiki page changed; reload before saving your draft".to_string(),
            ));
        }
        original_path.to_string()
    } else {
        if input.expected_blob_sha.is_some() {
            return Err(AppError::Validation(
                "A new Wiki page cannot have an existing blob revision".to_string(),
            ));
        }
        let path = page_path_from_title(&input.title, "md")?;
        ensure_page_path_available(&index, &path)?;
        path
    };
    let blob = repo.blob(input.content.as_bytes()).map_err(git_error)?;
    index
        .add(&wiki_index_entry(&new_path, blob))
        .map_err(git_error)?;
    let tree_id = index.write_tree_to(repo).map_err(git_error)?;
    let tree = repo.find_tree(tree_id).map_err(git_error)?;
    let signature = wiki_signature(identity)?;
    let action = if input.original_path.is_some() {
        "Update"
    } else {
        "Create"
    };
    let local_ref = local_branch_ref(default_branch);
    repo.reference(&local_ref, head, true, "Harbor Wiki base")
        .map_err(git_error)?;
    let commit = repo
        .commit(
            Some(&local_ref),
            &signature,
            &signature,
            &mutation_message(
                input.message.as_deref(),
                &format!("{action} {}", input.title.trim()),
            )?,
            &tree,
            &[&parent],
        )
        .map_err(git_error)?;
    Ok((new_path, commit))
}

fn commit_page_deletion(
    repo: &Repository,
    default_branch: &str,
    path: &str,
    expected_head: &str,
    expected_blob_sha: &str,
    identity: &GitHubIdentity,
) -> Result<Oid, AppError> {
    let head = ensure_expected_head(repo, default_branch, expected_head)?;
    let parent = repo.find_commit(head).map_err(git_error)?;
    let parent_tree = parent.tree().map_err(git_error)?;
    let mut index = Index::new().map_err(git_error)?;
    index.read_tree(&parent_tree).map_err(git_error)?;
    let existing = index.get_path(Path::new(path), 0).ok_or_else(|| {
        AppError::GitHubWikiConflict(
            "The Wiki page was already removed; reload before continuing".to_string(),
        )
    })?;
    if existing.id.to_string() != expected_blob_sha {
        return Err(AppError::GitHubWikiConflict(
            "The Wiki page changed; reload before deleting it".to_string(),
        ));
    }
    let title = page_summary(path, existing.id.to_string(), existing.file_size as u64)
        .map(|page| page.title)
        .unwrap_or_else(|| path.to_string());
    index.remove_path(Path::new(path)).map_err(git_error)?;
    let tree_id = index.write_tree_to(repo).map_err(git_error)?;
    let tree = repo.find_tree(tree_id).map_err(git_error)?;
    let signature = wiki_signature(identity)?;
    let local_ref = local_branch_ref(default_branch);
    repo.reference(&local_ref, head, true, "Harbor Wiki base")
        .map_err(git_error)?;
    repo.commit(
        Some(&local_ref),
        &signature,
        &signature,
        &format!("Delete {title}"),
        &tree,
        &[&parent],
    )
    .map_err(git_error)
}

fn ensure_expected_head(
    repo: &Repository,
    default_branch: &str,
    expected_head: &str,
) -> Result<Oid, AppError> {
    validate_head_sha(expected_head)?;
    let current = remote_head(repo, default_branch).map_err(git_error)?;
    if current.to_string() != expected_head {
        return Err(AppError::GitHubWikiConflict(
            "The Wiki changed; reload before saving your draft".to_string(),
        ));
    }
    Ok(current)
}

fn push_wiki_head(
    repo: &Repository,
    remote_url: &str,
    default_branch: &str,
    token: &str,
) -> Result<(), AppError> {
    let rejection = Arc::new(Mutex::new(None));
    let callbacks = authenticated_callbacks(remote_url, token, Some(Arc::clone(&rejection)));
    let mut options = PushOptions::new();
    options
        .remote_callbacks(callbacks)
        .follow_redirects(RemoteRedirect::None);
    let mut remote = repo.find_remote("origin").map_err(git_error)?;
    let local_ref = local_branch_ref(default_branch);
    remote
        .push(
            &[format!("{local_ref}:refs/heads/{default_branch}")],
            Some(&mut options),
        )
        .map_err(|error| {
            if is_push_conflict(&error) {
                AppError::GitHubWikiConflict(
                    "The Wiki changed while Harbor was saving; reload and retry".to_string(),
                )
            } else {
                git_error(error)
            }
        })?;
    if let Some(status) = rejection
        .lock()
        .map_err(|_| AppError::GitHub("Wiki push state is unavailable".to_string()))?
        .take()
    {
        return Err(if is_push_conflict_message(&status) {
            AppError::GitHubWikiConflict(format!("GitHub rejected the Wiki update: {status}"))
        } else {
            AppError::GitHubPermission(format!("GitHub rejected the Wiki update: {status}"))
        });
    }
    Ok(())
}

fn local_branch_ref(default_branch: &str) -> String {
    format!("refs/heads/{default_branch}")
}

fn remote_head(repo: &Repository, default_branch: &str) -> Result<Oid, git2::Error> {
    repo.find_reference(&format!("refs/remotes/origin/{default_branch}"))?
        .target()
        .ok_or_else(|| git2::Error::from_str("GitHub Wiki default branch has no target"))
}

fn page_summary(path: &str, blob_sha: String, byte_size: u64) -> Option<GitHubWikiPageSummary> {
    let extension = Path::new(path).extension()?.to_str()?;
    if !is_wiki_markup_extension(extension) {
        return None;
    }
    let page_path = Path::new(path);
    let stem = page_path.file_stem()?.to_str()?;
    let is_root = page_path
        .parent()
        .is_none_or(|parent| parent.as_os_str().is_empty());
    let (kind, title) = if is_root && stem.eq_ignore_ascii_case("Home") {
        (GitHubWikiPageKind::Home, "Home".to_string())
    } else if is_root && stem.eq_ignore_ascii_case("_Sidebar") {
        (GitHubWikiPageKind::Sidebar, "Sidebar".to_string())
    } else if is_root && stem.eq_ignore_ascii_case("_Footer") {
        (GitHubWikiPageKind::Footer, "Footer".to_string())
    } else {
        (GitHubWikiPageKind::Page, stem.to_string())
    };
    Some(GitHubWikiPageSummary {
        path: path.to_string(),
        title,
        kind,
        markdown: extension.eq_ignore_ascii_case("md")
            || extension.eq_ignore_ascii_case("markdown")
            || extension.eq_ignore_ascii_case("mdown")
            || extension.eq_ignore_ascii_case("mkdn"),
        blob_sha,
        byte_size,
    })
}

fn page_kind_order(kind: GitHubWikiPageKind) -> u8 {
    match kind {
        GitHubWikiPageKind::Home => 0,
        GitHubWikiPageKind::Page => 1,
        GitHubWikiPageKind::Sidebar => 2,
        GitHubWikiPageKind::Footer => 3,
    }
}

fn is_wiki_markup_extension(extension: &str) -> bool {
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "md" | "markdown"
            | "mdown"
            | "mkdn"
            | "adoc"
            | "asciidoc"
            | "asc"
            | "creole"
            | "mediawiki"
            | "wiki"
            | "org"
            | "pod"
            | "rdoc"
            | "rst"
            | "textile"
    )
}

fn page_path_from_title(title: &str, extension: &str) -> Result<String, AppError> {
    let title = title.trim();
    if title.is_empty()
        || title.chars().count() > 245
        || title.chars().any(char::is_control)
        || title.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])
        || matches!(title, "." | "..")
        || title.ends_with(['.', ' '])
        || title.eq_ignore_ascii_case("_Sidebar")
        || title.eq_ignore_ascii_case("_Footer")
    {
        return Err(AppError::Validation(
            "Wiki page title is invalid".to_string(),
        ));
    }
    Ok(format!("{title}.{extension}"))
}

fn validate_mutation_input(input: &GitHubWikiPageMutationInput) -> Result<(), AppError> {
    if input.original_path.is_none() {
        page_path_from_title(&input.title, "md")?;
    } else if input.title.trim().is_empty() {
        return Err(AppError::Validation(
            "Wiki page title is invalid".to_string(),
        ));
    }
    validate_head_sha(&input.expected_head)?;
    if input.content.len() > MAX_WIKI_PAGE_BYTES {
        return Err(AppError::Validation(format!(
            "Wiki page content must be at most {} MiB",
            MAX_WIKI_PAGE_BYTES / 1024 / 1024
        )));
    }
    if let Some(path) = input.original_path.as_deref() {
        validate_page_path(path)?;
    }
    if let Some(message) = input.message.as_deref() {
        mutation_message(Some(message), "Wiki update")?;
    }
    Ok(())
}

fn validate_page_path(path: &str) -> Result<(), AppError> {
    let candidate = Path::new(path);
    if path.is_empty()
        || path.len() > 4_096
        || candidate.is_absolute()
        || path.contains('\\')
        || path.chars().any(char::is_control)
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
        || page_summary(path, String::new(), 0).is_none()
    {
        return Err(AppError::Validation(
            "Wiki page path is invalid".to_string(),
        ));
    }
    Ok(())
}

fn validate_head_sha(head_sha: &str) -> Result<(), AppError> {
    if head_sha.len() != 40 || !head_sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::Validation(
            "Wiki head revision is invalid".to_string(),
        ));
    }
    Ok(())
}

fn ensure_page_path_available(index: &Index, new_path: &str) -> Result<(), AppError> {
    let collision = index.iter().any(|entry| {
        std::str::from_utf8(&entry.path)
            .ok()
            .is_some_and(|path| path.eq_ignore_ascii_case(new_path))
    });
    if collision {
        return Err(AppError::Validation(
            "A Wiki page with this title already exists".to_string(),
        ));
    }
    Ok(())
}

fn wiki_index_entry(path: &str, id: Oid) -> IndexEntry {
    IndexEntry {
        ctime: IndexTime::new(0, 0),
        mtime: IndexTime::new(0, 0),
        dev: 0,
        ino: 0,
        mode: 0o100644,
        uid: 0,
        gid: 0,
        file_size: 0,
        id,
        flags: 0,
        flags_extended: 0,
        path: path.as_bytes().to_vec(),
    }
}

fn mutation_message(message: Option<&str>, fallback: &str) -> Result<String, AppError> {
    let message = message.unwrap_or(fallback).trim();
    if message.is_empty() || message.len() > 256 || message.chars().any(char::is_control) {
        return Err(AppError::Validation(
            "Wiki edit message is invalid".to_string(),
        ));
    }
    Ok(message.to_string())
}

fn ensure_wiki_write_access(access: GitHubWikiAccess) -> Result<(), AppError> {
    if !access.enabled {
        return Err(AppError::GitHubPermission(
            "Enable Wiki in repository settings before editing it".to_string(),
        ));
    }
    if access.archived {
        return Err(AppError::GitHubPermission(
            "Archived repositories cannot update Wiki pages".to_string(),
        ));
    }
    if !access.can_edit {
        return Err(AppError::GitHubPermission(
            "GitHub did not grant write access to this Wiki".to_string(),
        ));
    }
    Ok(())
}

fn wiki_signature(identity: &GitHubIdentity) -> Result<Signature<'static>, AppError> {
    Signature::now(
        &identity.login,
        &format!("{}@users.noreply.github.com", identity.login),
    )
    .map_err(git_error)
}

fn git_error(error: git2::Error) -> AppError {
    let message = error.message().to_string();
    let lower = message.to_ascii_lowercase();
    if error.code() == ErrorCode::Auth
        || lower.contains("authentication")
        || lower.contains("401")
        || lower.contains("403")
    {
        AppError::GitHubPermission(format!("GitHub Wiki transport failed: {message}"))
    } else {
        AppError::GitHub(format!("GitHub Wiki transport failed: {message}"))
    }
}

fn is_uninitialized_wiki_error(error: &git2::Error) -> bool {
    let message = error.message().to_ascii_lowercase();
    message.contains("repository not found")
        || message.contains("request failed with status code: 404")
}

fn is_uninitialized_after_metadata(error: &git2::Error) -> bool {
    is_uninitialized_wiki_error(error)
}

fn is_offline_git_error(error: &git2::Error) -> bool {
    let message = error.message().to_ascii_lowercase();
    error.class() == ErrorClass::Net
        || message.contains("could not resolve host")
        || message.contains("failed to connect")
        || message.contains("timed out")
        || message.contains("network is unreachable")
}

fn is_push_conflict(error: &git2::Error) -> bool {
    matches!(
        error.code(),
        ErrorCode::NotFastForward | ErrorCode::NotFound
    ) || is_push_conflict_message(error.message())
}

fn is_push_conflict_message(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("non-fast-forward")
        || message.contains("fetch first")
        || message.contains("stale info")
        || message.contains("failed to update ref")
}

fn touch_cache(cache_path: &Path) {
    let _ = fs::write(cache_path.join(CACHE_ACCESS_MARKER), []);
}

fn prune_wiki_caches(cache_root: &Path, current: &Path) {
    let Ok(entries) = fs::read_dir(cache_root) else {
        return;
    };
    let mut entries = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() || file_type.is_symlink() {
                return None;
            }
            let modified = fs::metadata(path.join(CACHE_ACCESS_MARKER))
                .or_else(|_| entry.metadata())
                .and_then(|metadata| metadata.modified())
                .ok()?;
            let size = directory_size(&path);
            Some((path, modified, size))
        })
        .collect::<Vec<_>>();
    let mut total_size = entries.iter().map(|(_, _, size)| *size).sum::<u64>();
    if entries.len() <= MAX_WIKI_CACHES && total_size <= MAX_WIKI_TOTAL_CACHE_BYTES {
        return;
    }
    entries.sort_by_key(|(_, modified, _)| *modified);
    let mut remaining = entries.len();
    for (path, _, size) in entries {
        if remaining <= MAX_WIKI_CACHES && total_size <= MAX_WIKI_TOTAL_CACHE_BYTES {
            break;
        }
        if path == current || path.parent() != Some(cache_root) {
            continue;
        }
        let Ok(lock) = repository_lock(&path) else {
            continue;
        };
        let Ok(_guard) = lock.try_lock() else {
            continue;
        };
        if fs::remove_dir_all(path).is_ok() {
            remaining = remaining.saturating_sub(1);
            total_size = total_size.saturating_sub(size);
        }
    }
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| {
            let Ok(file_type) = entry.file_type() else {
                return 0;
            };
            if file_type.is_symlink() {
                0
            } else if file_type.is_dir() {
                directory_size(&entry.path())
            } else {
                entry.metadata().map(|metadata| metadata.len()).unwrap_or(0)
            }
        })
        .fold(0_u64, u64::saturating_add)
}

#[cfg(test)]
mod tests;
