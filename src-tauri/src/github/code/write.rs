use async_trait::async_trait;
use octocrab::{models::repos::Object, params::repos::Reference, Octocrab};
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};

use super::{content_entry_from_octocrab, GitHubBranch, GitHubContentEntry};
use crate::{
    error::AppError,
    github::{
        authenticated_client, github_error, is_not_found, GitHubService, OctocrabGitHubClient,
    },
};

const MAX_EDITABLE_FILE_BYTES: usize = 1_000_000;
const MAX_COMMIT_MESSAGE_BYTES: usize = 65_536;
const MAX_BRANCH_NAME_BYTES: usize = 255;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum GitHubRepositoryFileMutation {
    Create {
        path: String,
        content: String,
    },
    Update {
        path: String,
        expected_sha: String,
        content: String,
    },
    Rename {
        path: String,
        expected_sha: String,
        new_path: String,
        content: String,
    },
    Delete {
        path: String,
        expected_sha: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryFileCommit {
    pub branch: String,
    pub commit_sha: String,
    pub short_sha: String,
    pub message: String,
    pub url: String,
    pub file: Option<GitHubContentEntry>,
    pub previous_path: Option<String>,
}

#[async_trait]
pub(crate) trait GitHubCodeMutationClient: Send + Sync {
    async fn commit_repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        branch: &str,
        message: &str,
        mutation: &GitHubRepositoryFileMutation,
    ) -> Result<GitHubRepositoryFileCommit, AppError>;

    async fn create_repository_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        source_branch: &str,
        expected_source_sha: &str,
        branch: &str,
    ) -> Result<GitHubBranch, AppError>;

    async fn delete_repository_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        branch: &str,
        expected_sha: &str,
    ) -> Result<(), AppError>;
}

impl GitHubService {
    pub async fn commit_file(
        &self,
        owner: &str,
        repository: &str,
        branch: &str,
        message: &str,
        mutation: &GitHubRepositoryFileMutation,
    ) -> Result<GitHubRepositoryFileCommit, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .commit_repository_file(&token, owner, repository, branch, message, mutation)
            .await
    }

    pub async fn create_branch(
        &self,
        owner: &str,
        repository: &str,
        source_branch: &str,
        expected_source_sha: &str,
        branch: &str,
    ) -> Result<GitHubBranch, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_repository_branch(
                &token,
                owner,
                repository,
                source_branch,
                expected_source_sha,
                branch,
            )
            .await
    }

    pub async fn delete_branch(
        &self,
        owner: &str,
        repository: &str,
        branch: &str,
        expected_sha: &str,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_repository_branch(&token, owner, repository, branch, expected_sha)
            .await
    }
}

#[async_trait]
impl GitHubCodeMutationClient for OctocrabGitHubClient {
    async fn commit_repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        branch: &str,
        message: &str,
        mutation: &GitHubRepositoryFileMutation,
    ) -> Result<GitHubRepositoryFileCommit, AppError> {
        let client = authenticated_client(token)?;
        let repository_handler = client.repos(owner, repository);
        let repository_data = repository_handler.get().await.map_err(github_error)?;
        ensure_repository_writable(&repository_data)?;
        let branch_reference = encoded_branch_reference(branch);
        let head = match repository_handler.get_ref(&branch_reference).await {
            Ok(head) => head,
            Err(error)
                if is_not_found(&error)
                    && matches!(mutation, GitHubRepositoryFileMutation::Create { .. }) =>
            {
                return create_initial_repository_file(
                    &client,
                    owner,
                    repository,
                    branch,
                    message,
                    mutation,
                    &repository_data,
                )
                .await;
            }
            Err(error) => return Err(code_mutation_error(error)),
        };
        let head_sha = commit_sha_from_ref(&head, branch)?;
        let commit: RawGitCommit = client
            .get(
                format!("/repos/{owner}/{repository}/git/commits/{head_sha}"),
                None::<&()>,
            )
            .await
            .map_err(code_mutation_error)?;
        if commit.sha != head_sha {
            return Err(code_conflict(
                "the selected branch changed before the edit started",
            ));
        }

        let plan = build_file_mutation_plan(&client, owner, repository, &commit.tree.sha, mutation)
            .await?;
        let tree: RawGitTree = client
            .post(
                format!("/repos/{owner}/{repository}/git/trees"),
                Some(&CreateTreeRequest {
                    base_tree: &commit.tree.sha,
                    tree: plan.entries,
                }),
            )
            .await
            .map_err(code_mutation_error)?;
        let created_commit: RawGitCommit = client
            .post(
                format!("/repos/{owner}/{repository}/git/commits"),
                Some(&CreateCommitRequest {
                    message,
                    tree: &tree.sha,
                    parents: [&head_sha],
                }),
            )
            .await
            .map_err(code_mutation_error)?;
        let updated_ref: octocrab::models::repos::Ref = client
            .patch(
                format!(
                    "/repos/{owner}/{repository}/git/refs/heads/{}",
                    encode_branch_path(branch)
                ),
                Some(&UpdateRefRequest {
                    sha: &created_commit.sha,
                    force: false,
                }),
            )
            .await
            .map_err(code_mutation_error)?;
        verify_ref(&updated_ref, branch, &created_commit.sha)?;

        let verified_ref = repository_handler
            .get_ref(&branch_reference)
            .await
            .map_err(code_mutation_error)?;
        if commit_sha_from_ref(&verified_ref, branch)? != created_commit.sha {
            return Err(code_conflict(
                "GitHub did not keep the branch at the returned commit",
            ));
        }
        let file = verify_file_mutation(
            &client,
            owner,
            repository,
            branch,
            plan.path.as_deref(),
            plan.previous_path.as_deref(),
        )
        .await?;
        let short_sha = created_commit.sha.chars().take(7).collect();
        let url = created_commit.html_url.unwrap_or_else(|| {
            format!(
                "https://github.com/{owner}/{repository}/commit/{}",
                created_commit.sha
            )
        });

        Ok(GitHubRepositoryFileCommit {
            branch: branch.to_string(),
            commit_sha: created_commit.sha,
            short_sha,
            message: message.to_string(),
            url,
            file,
            previous_path: plan.previous_path,
        })
    }

    async fn create_repository_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        source_branch: &str,
        expected_source_sha: &str,
        branch: &str,
    ) -> Result<GitHubBranch, AppError> {
        let client = authenticated_client(token)?;
        let repository_handler = client.repos(owner, repository);
        ensure_repository_writable(&repository_handler.get().await.map_err(github_error)?)?;
        let source = repository_handler
            .get_ref(&encoded_branch_reference(source_branch))
            .await
            .map_err(code_mutation_error)?;
        let source_sha = commit_sha_from_ref(&source, source_branch)?;
        if source_sha != expected_source_sha {
            return Err(code_conflict(
                "the source branch changed before the new branch was created",
            ));
        }
        match repository_handler
            .get_ref(&encoded_branch_reference(branch))
            .await
        {
            Ok(_) => return Err(code_conflict("a branch with this name already exists")),
            Err(error) if is_not_found(&error) => {}
            Err(error) => return Err(code_mutation_error(error)),
        }
        let created = repository_handler
            .create_ref(&Reference::Branch(branch.to_string()), &source_sha)
            .await
            .map_err(code_mutation_error)?;
        verify_ref(&created, branch, &source_sha)?;
        let verified = repository_handler
            .get_ref(&encoded_branch_reference(branch))
            .await
            .map_err(code_mutation_error)?;
        if commit_sha_from_ref(&verified, branch)? != source_sha {
            return Err(code_conflict(
                "GitHub did not create the branch at the selected revision",
            ));
        }

        let branch_result: octocrab::models::repos::Branch = client
            .get(
                format!(
                    "/repos/{owner}/{repository}/branches/{}",
                    encode_branch_path(branch)
                ),
                None::<&()>,
            )
            .await
            .map_err(code_mutation_error)?;
        if branch_result.name != branch || branch_result.commit.sha != source_sha {
            return Err(code_conflict(
                "GitHub returned a different branch after creation",
            ));
        }

        Ok(GitHubBranch {
            name: branch_result.name,
            sha: branch_result.commit.sha,
            protected: branch_result.protected,
        })
    }

    async fn delete_repository_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        branch: &str,
        expected_sha: &str,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let repository_handler = client.repos(owner, repository);
        let repository_data = repository_handler.get().await.map_err(github_error)?;
        ensure_repository_writable(&repository_data)?;
        if repository_data.default_branch.as_deref() == Some(branch) {
            return Err(code_conflict("the default branch cannot be deleted"));
        }
        let branch_reference = encoded_branch_reference(branch);
        let current = repository_handler
            .get_ref(&branch_reference)
            .await
            .map_err(code_mutation_error)?;
        if commit_sha_from_ref(&current, branch)? != expected_sha {
            return Err(code_conflict(
                "the branch changed before it could be deleted",
            ));
        }
        repository_handler
            .delete_ref(&branch_reference)
            .await
            .map_err(code_mutation_error)?;
        match repository_handler.get_ref(&branch_reference).await {
            Err(error) if is_not_found(&error) => Ok(()),
            Ok(_) => Err(code_conflict("GitHub did not delete the selected branch")),
            Err(error) => Err(code_mutation_error(error)),
        }
    }
}

pub fn normalize_branch_name(value: &str) -> Result<String, AppError> {
    let branch = value.trim();
    let invalid = branch.is_empty()
        || branch.len() > MAX_BRANCH_NAME_BYTES
        || branch == "HEAD"
        || branch.starts_with('-')
        || branch.starts_with('/')
        || branch.ends_with('/')
        || branch.ends_with('.')
        || branch == "@"
        || branch.contains("..")
        || branch.contains("//")
        || branch.contains("@{")
        || branch
            .chars()
            .any(|character| character.is_control() || " ~^:?*[\\".contains(character))
        || branch.split('/').any(|segment| {
            segment.is_empty() || segment.starts_with('.') || segment.ends_with(".lock")
        });
    if invalid {
        Err(AppError::Validation(
            "repository branch name is invalid".to_string(),
        ))
    } else {
        Ok(branch.to_string())
    }
}

pub fn validate_file_mutation(
    mutation: GitHubRepositoryFileMutation,
) -> Result<GitHubRepositoryFileMutation, AppError> {
    let validate_content = |content: String| {
        if content.len() > MAX_EDITABLE_FILE_BYTES {
            Err(AppError::Validation(
                "repository file content is too large to edit in Harbor".to_string(),
            ))
        } else {
            Ok(content)
        }
    };
    match mutation {
        GitHubRepositoryFileMutation::Create { path, content } => {
            Ok(GitHubRepositoryFileMutation::Create {
                path: normalize_file_path(&path)?,
                content: validate_content(content)?,
            })
        }
        GitHubRepositoryFileMutation::Update {
            path,
            expected_sha,
            content,
        } => Ok(GitHubRepositoryFileMutation::Update {
            path: normalize_file_path(&path)?,
            expected_sha: normalize_git_sha(&expected_sha)?,
            content: validate_content(content)?,
        }),
        GitHubRepositoryFileMutation::Rename {
            path,
            expected_sha,
            new_path,
            content,
        } => {
            let path = normalize_file_path(&path)?;
            let new_path = normalize_file_path(&new_path)?;
            if path == new_path {
                return Err(AppError::Validation(
                    "renamed repository file path must change".to_string(),
                ));
            }
            Ok(GitHubRepositoryFileMutation::Rename {
                path,
                expected_sha: normalize_git_sha(&expected_sha)?,
                new_path,
                content: validate_content(content)?,
            })
        }
        GitHubRepositoryFileMutation::Delete { path, expected_sha } => {
            Ok(GitHubRepositoryFileMutation::Delete {
                path: normalize_file_path(&path)?,
                expected_sha: normalize_git_sha(&expected_sha)?,
            })
        }
    }
}

pub fn normalize_commit_message(value: &str) -> Result<String, AppError> {
    let message = value.trim();
    if message.is_empty() || message.len() > MAX_COMMIT_MESSAGE_BYTES {
        Err(AppError::Validation(
            "repository commit message is invalid".to_string(),
        ))
    } else {
        Ok(message.to_string())
    }
}

pub fn normalize_git_sha(value: &str) -> Result<String, AppError> {
    let sha = value.trim();
    if sha.len() != 40 || !sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Err(AppError::Validation(
            "repository revision SHA is invalid".to_string(),
        ))
    } else {
        Ok(sha.to_ascii_lowercase())
    }
}

fn normalize_file_path(value: &str) -> Result<String, AppError> {
    let path = value.trim_matches('/');
    let invalid = path.is_empty()
        || path.len() > 4_096
        || path.chars().any(char::is_control)
        || path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..");
    if invalid {
        Err(AppError::Validation(
            "repository file path is invalid".to_string(),
        ))
    } else {
        Ok(path.to_string())
    }
}

fn ensure_repository_writable(repository: &octocrab::models::Repository) -> Result<(), AppError> {
    if repository.archived.unwrap_or(false) {
        return Err(code_conflict("archived repositories are read-only"));
    }
    if !repository
        .permissions
        .as_ref()
        .is_some_and(|permissions| permissions.push)
    {
        return Err(AppError::GitHubPermission(
            "repository Contents write permission is required".to_string(),
        ));
    }
    Ok(())
}

fn commit_sha_from_ref(
    reference: &octocrab::models::repos::Ref,
    branch: &str,
) -> Result<String, AppError> {
    let expected_ref = format!("refs/heads/{branch}");
    if reference.ref_field != expected_ref {
        return Err(code_conflict(
            "GitHub returned a different branch reference",
        ));
    }
    match &reference.object {
        Object::Commit { sha, .. } => Ok(sha.clone()),
        _ => Err(code_conflict(
            "the selected branch does not point to a commit",
        )),
    }
}

fn encode_branch_path(branch: &str) -> String {
    utf8_percent_encode(branch, NON_ALPHANUMERIC).to_string()
}

fn encoded_branch_reference(branch: &str) -> Reference {
    Reference::Branch(encode_branch_path(branch))
}

fn verify_ref(
    reference: &octocrab::models::repos::Ref,
    branch: &str,
    expected_sha: &str,
) -> Result<(), AppError> {
    if commit_sha_from_ref(reference, branch)? == expected_sha {
        Ok(())
    } else {
        Err(code_conflict(
            "GitHub returned a different revision for the branch",
        ))
    }
}

async fn build_file_mutation_plan(
    client: &Octocrab,
    owner: &str,
    repository: &str,
    root_tree_sha: &str,
    mutation: &GitHubRepositoryFileMutation,
) -> Result<FileMutationPlan, AppError> {
    match mutation {
        GitHubRepositoryFileMutation::Create { path, content } => {
            ensure_target_absent(client, owner, repository, root_tree_sha, path).await?;
            Ok(FileMutationPlan {
                entries: vec![TreeMutationEntry::Write {
                    path: path.clone(),
                    mode: "100644".to_string(),
                    kind: "blob",
                    content: content.clone(),
                }],
                path: Some(path.clone()),
                previous_path: None,
            })
        }
        GitHubRepositoryFileMutation::Update {
            path,
            expected_sha,
            content,
        } => {
            let source =
                required_file_entry(client, owner, repository, root_tree_sha, path, expected_sha)
                    .await?;
            Ok(FileMutationPlan {
                entries: vec![TreeMutationEntry::Write {
                    path: path.clone(),
                    mode: source.mode,
                    kind: "blob",
                    content: content.clone(),
                }],
                path: Some(path.clone()),
                previous_path: None,
            })
        }
        GitHubRepositoryFileMutation::Rename {
            path,
            expected_sha,
            new_path,
            content,
        } => {
            let source =
                required_file_entry(client, owner, repository, root_tree_sha, path, expected_sha)
                    .await?;
            ensure_target_absent(client, owner, repository, root_tree_sha, new_path).await?;
            Ok(FileMutationPlan {
                entries: vec![
                    TreeMutationEntry::Write {
                        path: new_path.clone(),
                        mode: source.mode.clone(),
                        kind: "blob",
                        content: content.clone(),
                    },
                    TreeMutationEntry::Delete {
                        path: path.clone(),
                        mode: source.mode,
                        kind: "blob",
                        sha: None,
                    },
                ],
                path: Some(new_path.clone()),
                previous_path: Some(path.clone()),
            })
        }
        GitHubRepositoryFileMutation::Delete { path, expected_sha } => {
            let source =
                required_file_entry(client, owner, repository, root_tree_sha, path, expected_sha)
                    .await?;
            Ok(FileMutationPlan {
                entries: vec![TreeMutationEntry::Delete {
                    path: path.clone(),
                    mode: source.mode,
                    kind: "blob",
                    sha: None,
                }],
                path: None,
                previous_path: Some(path.clone()),
            })
        }
    }
}

async fn required_file_entry(
    client: &Octocrab,
    owner: &str,
    repository: &str,
    root_tree_sha: &str,
    path: &str,
    expected_sha: &str,
) -> Result<RawGitTreeEntry, AppError> {
    let entry = tree_entry_at_path(client, owner, repository, root_tree_sha, path)
        .await?
        .ok_or_else(|| code_conflict("the file no longer exists on the selected branch"))?;
    if entry.kind != "blob" {
        return Err(AppError::Validation(
            "repository path is not an editable file".to_string(),
        ));
    }
    if entry.sha.as_deref() != Some(expected_sha) {
        return Err(code_conflict(
            "the file changed before the commit was created",
        ));
    }
    Ok(entry)
}

async fn ensure_target_absent(
    client: &Octocrab,
    owner: &str,
    repository: &str,
    root_tree_sha: &str,
    path: &str,
) -> Result<(), AppError> {
    if tree_entry_at_path(client, owner, repository, root_tree_sha, path)
        .await?
        .is_some()
    {
        Err(code_conflict(
            "a repository entry already exists at this path",
        ))
    } else {
        Ok(())
    }
}

async fn tree_entry_at_path(
    client: &Octocrab,
    owner: &str,
    repository: &str,
    root_tree_sha: &str,
    path: &str,
) -> Result<Option<RawGitTreeEntry>, AppError> {
    let segments = path.split('/').collect::<Vec<_>>();
    let mut tree_sha = root_tree_sha.to_string();
    for (index, segment) in segments.iter().enumerate() {
        let tree: RawGitTree = client
            .get(
                format!("/repos/{owner}/{repository}/git/trees/{tree_sha}"),
                None::<&()>,
            )
            .await
            .map_err(code_mutation_error)?;
        let Some(entry) = tree.tree.into_iter().find(|entry| entry.path == *segment) else {
            return Ok(None);
        };
        if index == segments.len() - 1 {
            return Ok(Some(entry));
        }
        if entry.kind != "tree" {
            return Ok(None);
        }
        tree_sha = entry
            .sha
            .ok_or_else(|| code_conflict("GitHub returned a tree entry without a revision"))?;
    }
    Ok(None)
}

async fn verify_file_mutation(
    client: &Octocrab,
    owner: &str,
    repository: &str,
    branch: &str,
    path: Option<&str>,
    previous_path: Option<&str>,
) -> Result<Option<GitHubContentEntry>, AppError> {
    let repository_handler = client.repos(owner, repository);
    let file = if let Some(path) = path {
        let contents = repository_handler
            .get_content()
            .path(path)
            .r#ref(branch)
            .send()
            .await
            .map_err(code_mutation_error)?;
        let mut items = contents.items;
        if items.len() != 1 || items[0].r#type != "file" {
            return Err(code_conflict(
                "GitHub did not return the committed file at its new revision",
            ));
        }
        Some(content_entry_from_octocrab(items.remove(0)))
    } else {
        None
    };
    if let Some(previous_path) = previous_path {
        match repository_handler
            .get_content()
            .path(previous_path)
            .r#ref(branch)
            .send()
            .await
        {
            Err(error) if is_not_found(&error) => {}
            Ok(_) => {
                return Err(code_conflict(
                    "GitHub still returned the file at its previous path",
                ));
            }
            Err(error) => return Err(code_mutation_error(error)),
        }
    }
    Ok(file)
}

async fn create_initial_repository_file(
    client: &Octocrab,
    owner: &str,
    repository: &str,
    branch: &str,
    message: &str,
    mutation: &GitHubRepositoryFileMutation,
    repository_data: &octocrab::models::Repository,
) -> Result<GitHubRepositoryFileCommit, AppError> {
    let GitHubRepositoryFileMutation::Create { path, content } = mutation else {
        return Err(code_conflict(
            "only a new file can initialize an empty repository",
        ));
    };
    if repository_data.default_branch.as_deref() != Some(branch) {
        return Err(code_conflict(
            "an empty repository must be initialized on its default branch",
        ));
    }
    let repository_handler = client.repos(owner, repository);
    let branches = repository_handler
        .list_branches()
        .per_page(1)
        .send()
        .await
        .map_err(code_mutation_error)?;
    if !branches.items.is_empty() {
        return Err(code_conflict(
            "the repository gained a branch before initialization finished",
        ));
    }
    let update = repository_handler
        .create_file(path, message, content.as_bytes())
        .send()
        .await
        .map_err(code_mutation_error)?;
    if update.content.path != *path || update.content.r#type != "file" {
        return Err(code_conflict(
            "GitHub returned a different file after repository initialization",
        ));
    }
    let commit_sha = update
        .commit
        .sha
        .ok_or_else(|| code_conflict("GitHub did not return the initialization commit"))?;
    let branch_reference = client
        .repos(owner, repository)
        .get_ref(&encoded_branch_reference(branch))
        .await
        .map_err(code_mutation_error)?;
    verify_ref(&branch_reference, branch, &commit_sha)?;
    let file = verify_file_mutation(client, owner, repository, branch, Some(path), None)
        .await?
        .ok_or_else(|| code_conflict("GitHub did not return the initialized file"))?;
    if file.sha != update.content.sha {
        return Err(code_conflict(
            "GitHub returned a different file revision after initialization",
        ));
    }
    let short_sha = commit_sha.chars().take(7).collect();
    let url = update
        .commit
        .html_url
        .unwrap_or_else(|| format!("https://github.com/{owner}/{repository}/commit/{commit_sha}"));

    Ok(GitHubRepositoryFileCommit {
        branch: branch.to_string(),
        commit_sha,
        short_sha,
        message: message.to_string(),
        file: Some(file),
        previous_path: None,
        url,
    })
}

fn code_conflict(message: impl Into<String>) -> AppError {
    AppError::GitHubCodeConflict(message.into())
}

fn code_mutation_error(error: octocrab::Error) -> AppError {
    match &error {
        octocrab::Error::GitHub { source, .. }
            if [404, 409, 422].contains(&source.status_code.as_u16()) =>
        {
            code_conflict(error.to_string())
        }
        _ => github_error(error),
    }
}

struct FileMutationPlan {
    entries: Vec<TreeMutationEntry>,
    path: Option<String>,
    previous_path: Option<String>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum TreeMutationEntry {
    Write {
        path: String,
        mode: String,
        #[serde(rename = "type")]
        kind: &'static str,
        content: String,
    },
    Delete {
        path: String,
        mode: String,
        #[serde(rename = "type")]
        kind: &'static str,
        sha: Option<String>,
    },
}

#[derive(Serialize)]
struct CreateTreeRequest<'a> {
    base_tree: &'a str,
    tree: Vec<TreeMutationEntry>,
}

#[derive(Serialize)]
struct CreateCommitRequest<'a> {
    message: &'a str,
    tree: &'a str,
    parents: [&'a str; 1],
}

#[derive(Serialize)]
struct UpdateRefRequest<'a> {
    sha: &'a str,
    force: bool,
}

#[derive(Deserialize)]
struct RawGitCommit {
    sha: String,
    html_url: Option<String>,
    tree: RawGitObject,
}

#[derive(Deserialize)]
struct RawGitObject {
    sha: String,
}

#[derive(Deserialize)]
struct RawGitTree {
    sha: String,
    #[serde(default)]
    tree: Vec<RawGitTreeEntry>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
struct RawGitTreeEntry {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    kind: String,
    sha: Option<String>,
}

#[cfg(test)]
mod tests;
