use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use base64::Engine;
use keyring::{Entry, Error as KeyringError};
use serde::Serialize;

use crate::error::AppError;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIdentity {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubConnection {
    pub connected: bool,
    pub identity: Option<GitHubIdentity>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepository {
    pub id: u64,
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub url: String,
    pub language: Option<String>,
    pub stars: u32,
    pub forks: u32,
    pub open_issues: u32,
    pub default_branch: String,
    pub is_private: bool,
    pub is_fork: bool,
    pub is_archived: bool,
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryPage {
    pub repositories: Vec<GitHubRepository>,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLabel {
    pub name: String,
    pub color: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssue {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub author: String,
    pub assignees: Vec<String>,
    pub labels: Vec<GitHubIssueLabel>,
    pub comments: u32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssuePage {
    pub issues: Vec<GitHubIssue>,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubBranch {
    pub name: String,
    pub sha: String,
    pub protected: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitSummary {
    pub sha: String,
    pub short_sha: String,
    pub title: String,
    pub author: String,
    pub authored_at: Option<String>,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReadme {
    pub name: String,
    pub path: String,
    pub content: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeOverview {
    pub reference: String,
    pub branches: Vec<GitHubBranch>,
    pub branches_have_more: bool,
    pub commits: Vec<GitHubCommitSummary>,
    pub commits_have_more: bool,
    pub readme: Option<GitHubReadme>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContentEntry {
    pub name: String,
    pub path: String,
    pub sha: String,
    pub kind: String,
    pub size: i64,
    pub url: Option<String>,
    pub download_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContentListing {
    pub reference: String,
    pub path: String,
    pub entries: Vec<GitHubContentEntry>,
}

impl GitHubConnection {
    fn disconnected() -> Self {
        Self {
            connected: false,
            identity: None,
        }
    }

    fn connected(identity: GitHubIdentity) -> Self {
        Self {
            connected: true,
            identity: Some(identity),
        }
    }
}

#[async_trait]
pub trait GitHubClient: Send + Sync {
    async fn validate_token(&self, token: &str) -> Result<GitHubIdentity, AppError>;
    async fn list_repositories(&self, token: &str) -> Result<GitHubRepositoryPage, AppError>;
    async fn list_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssuePage, AppError>;
    async fn repository_code_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
    ) -> Result<GitHubCodeOverview, AppError>;
    async fn repository_contents(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubContentListing, AppError>;
}

pub trait CredentialStore: Send + Sync {
    fn load_github_token(&self) -> Result<Option<String>, AppError>;
    fn save_github_token(&self, token: &str) -> Result<(), AppError>;
    fn delete_github_token(&self) -> Result<(), AppError>;
}

pub struct GitHubService {
    client: Arc<dyn GitHubClient>,
    credentials: Arc<dyn CredentialStore>,
    identity: RwLock<Option<GitHubIdentity>>,
}

impl GitHubService {
    pub fn new(client: Arc<dyn GitHubClient>, credentials: Arc<dyn CredentialStore>) -> Self {
        Self {
            client,
            credentials,
            identity: RwLock::new(None),
        }
    }

    pub async fn connect(&self, token: String) -> Result<GitHubConnection, AppError> {
        let token = token.trim();
        if token.is_empty() {
            return Err(AppError::Validation(
                "GitHub access token cannot be empty".to_string(),
            ));
        }
        if !token.starts_with("github_pat_") {
            return Err(AppError::Validation(
                "Harbor accepts fine-grained GitHub tokens only".to_string(),
            ));
        }

        let identity = self.client.validate_token(token).await?;
        let credentials = Arc::clone(&self.credentials);
        let token_to_store = token.to_string();
        tokio::task::spawn_blocking(move || credentials.save_github_token(&token_to_store))
            .await
            .map_err(|error| AppError::Credentials(error.to_string()))??;
        *self
            .identity
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? =
            Some(identity.clone());

        Ok(GitHubConnection::connected(identity))
    }

    pub async fn status(&self) -> Result<GitHubConnection, AppError> {
        if let Some(identity) = self
            .identity
            .read()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))?
            .clone()
        {
            return Ok(GitHubConnection::connected(identity));
        }

        let credentials = Arc::clone(&self.credentials);
        let Some(token) = tokio::task::spawn_blocking(move || credentials.load_github_token())
            .await
            .map_err(|error| AppError::Credentials(error.to_string()))??
        else {
            return Ok(GitHubConnection::disconnected());
        };
        let identity = self.client.validate_token(&token).await?;
        *self
            .identity
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? =
            Some(identity.clone());

        Ok(GitHubConnection::connected(identity))
    }

    pub async fn disconnect(&self) -> Result<GitHubConnection, AppError> {
        let credentials = Arc::clone(&self.credentials);
        tokio::task::spawn_blocking(move || credentials.delete_github_token())
            .await
            .map_err(|error| AppError::Credentials(error.to_string()))??;
        *self
            .identity
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? = None;
        Ok(GitHubConnection::disconnected())
    }

    pub async fn repositories(&self) -> Result<GitHubRepositoryPage, AppError> {
        let token = self.load_token().await?;
        self.client.list_repositories(&token).await
    }

    pub async fn issues(&self, owner: &str, repository: &str) -> Result<GitHubIssuePage, AppError> {
        let token = self.load_token().await?;
        self.client.list_issues(&token, owner, repository).await
    }

    pub async fn code_overview(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
    ) -> Result<GitHubCodeOverview, AppError> {
        let token = self.load_token().await?;
        self.client
            .repository_code_overview(&token, owner, repository, reference)
            .await
    }

    pub async fn contents(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubContentListing, AppError> {
        let token = self.load_token().await?;
        self.client
            .repository_contents(&token, owner, repository, reference, path)
            .await
    }

    async fn load_token(&self) -> Result<String, AppError> {
        let credentials = Arc::clone(&self.credentials);
        tokio::task::spawn_blocking(move || credentials.load_github_token())
            .await
            .map_err(|error| AppError::Credentials(error.to_string()))??
            .ok_or(AppError::GitHubNotConnected)
    }
}

#[derive(Default)]
pub struct OctocrabGitHubClient;

#[async_trait]
impl GitHubClient for OctocrabGitHubClient {
    async fn validate_token(&self, token: &str) -> Result<GitHubIdentity, AppError> {
        let client = authenticated_client(token)?;
        let user = client
            .current()
            .user()
            .await
            .map_err(|error| AppError::GitHub(error.to_string()))?;

        Ok(GitHubIdentity {
            login: user.login,
            avatar_url: Some(user.avatar_url.to_string()),
        })
    }

    async fn list_repositories(&self, token: &str) -> Result<GitHubRepositoryPage, AppError> {
        let client = authenticated_client(token)?;
        let page = client
            .current()
            .list_repos_for_authenticated_user()
            .sort("pushed")
            .direction("desc")
            .per_page(100)
            .send()
            .await
            .map_err(|error| AppError::GitHub(error.to_string()))?;
        Ok(repository_page_from_octocrab(
            page.items,
            page.next.is_some(),
        ))
    }

    async fn list_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssuePage, AppError> {
        let client = authenticated_client(token)?;
        let page = client
            .issues(owner, repository)
            .list()
            .state(octocrab::params::State::Open)
            .sort(octocrab::params::issues::Sort::Updated)
            .direction(octocrab::params::Direction::Descending)
            .per_page(100)
            .send()
            .await
            .map_err(|error| AppError::GitHub(error.to_string()))?;
        Ok(issue_page_from_octocrab(page.items, page.next.is_some()))
    }

    async fn repository_code_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
    ) -> Result<GitHubCodeOverview, AppError> {
        let client = authenticated_client(token)?;
        let repository_handler = client.repos(owner, repository);
        let (branches, commits, readme) = tokio::join!(
            repository_handler.list_branches().per_page(100).send(),
            repository_handler
                .list_commits()
                .branch(reference)
                .per_page(8)
                .send(),
            repository_handler.get_readme().r#ref(reference).send(),
        );
        let branches = branches.map_err(github_error)?;
        let commits = commits.map_err(github_error)?;
        let readme = match readme {
            Ok(readme) => Some(readme_from_octocrab(readme)?),
            Err(error) if is_not_found(&error) => None,
            Err(error) => return Err(github_error(error)),
        };

        Ok(GitHubCodeOverview {
            reference: reference.to_string(),
            branches: branches
                .items
                .into_iter()
                .map(branch_from_octocrab)
                .collect(),
            branches_have_more: branches.next.is_some(),
            commits: commits
                .items
                .into_iter()
                .map(commit_from_octocrab)
                .collect(),
            commits_have_more: commits.next.is_some(),
            readme,
        })
    }

    async fn repository_contents(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubContentListing, AppError> {
        let client = authenticated_client(token)?;
        let contents = client
            .repos(owner, repository)
            .get_content()
            .path(path)
            .r#ref(reference)
            .send()
            .await
            .map_err(github_error)?;

        Ok(content_listing_from_octocrab(
            reference,
            path,
            contents.items,
        ))
    }
}

fn github_error(error: octocrab::Error) -> AppError {
    AppError::GitHub(error.to_string())
}

fn is_not_found(error: &octocrab::Error) -> bool {
    matches!(
        error,
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 404
    )
}

fn authenticated_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

fn repository_page_from_octocrab(
    repositories: Vec<octocrab::models::Repository>,
    has_more: bool,
) -> GitHubRepositoryPage {
    GitHubRepositoryPage {
        repositories: repositories
            .into_iter()
            .filter_map(repository_from_octocrab)
            .collect(),
        has_more,
    }
}

fn issue_page_from_octocrab(
    issues: Vec<octocrab::models::issues::Issue>,
    has_more: bool,
) -> GitHubIssuePage {
    GitHubIssuePage {
        issues: issues
            .into_iter()
            .filter(|issue| issue.pull_request.is_none())
            .map(issue_from_octocrab)
            .collect(),
        has_more,
    }
}

fn branch_from_octocrab(branch: octocrab::models::repos::Branch) -> GitHubBranch {
    GitHubBranch {
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected,
    }
}

fn commit_from_octocrab(commit: octocrab::models::repos::RepoCommit) -> GitHubCommitSummary {
    let author = commit
        .commit
        .author
        .as_ref()
        .map(|author| author.name.clone())
        .or_else(|| commit.author.as_ref().map(|author| author.login.clone()))
        .unwrap_or_else(|| "Unknown".to_string());
    let authored_at = commit
        .commit
        .author
        .as_ref()
        .and_then(|author| author.date)
        .or_else(|| {
            commit
                .commit
                .committer
                .as_ref()
                .and_then(|committer| committer.date)
        })
        .map(|date| date.to_rfc3339());
    let title = commit
        .commit
        .message
        .lines()
        .next()
        .unwrap_or_default()
        .to_string();
    let short_sha = commit.sha.chars().take(7).collect();

    GitHubCommitSummary {
        sha: commit.sha,
        short_sha,
        title,
        author,
        authored_at,
        url: commit.html_url,
    }
}

fn readme_from_octocrab(
    content: octocrab::models::repos::Content,
) -> Result<GitHubReadme, AppError> {
    let encoded = content
        .content
        .as_deref()
        .ok_or_else(|| AppError::GitHub("GitHub did not return README content".to_string()))?;
    let compact = encoded
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect::<Vec<_>>();
    let decoded = base64::prelude::BASE64_STANDARD
        .decode(compact)
        .map_err(|error| {
            AppError::GitHub(format!("README content is not valid base64: {error}"))
        })?;

    Ok(GitHubReadme {
        name: content.name,
        path: content.path,
        content: String::from_utf8_lossy(&decoded).into_owned(),
        url: content.html_url.unwrap_or(content.url),
    })
}

fn content_listing_from_octocrab(
    reference: &str,
    path: &str,
    contents: Vec<octocrab::models::repos::Content>,
) -> GitHubContentListing {
    let mut entries = contents
        .into_iter()
        .map(|content| GitHubContentEntry {
            name: content.name,
            path: content.path,
            sha: content.sha,
            kind: content.r#type,
            size: content.size,
            url: content.html_url,
            download_url: content.download_url,
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        let left_is_directory = left.kind == "dir";
        let right_is_directory = right.kind == "dir";
        right_is_directory
            .cmp(&left_is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    GitHubContentListing {
        reference: reference.to_string(),
        path: path.to_string(),
        entries,
    }
}

fn repository_from_octocrab(repository: octocrab::models::Repository) -> Option<GitHubRepository> {
    let full_name = repository.full_name.clone();
    let owner = repository
        .owner
        .as_ref()
        .map(|owner| owner.login.clone())
        .or_else(|| {
            full_name
                .as_deref()
                .and_then(|name| name.split_once('/'))
                .map(|(owner, _)| owner.to_string())
        })?;
    let full_name = full_name.unwrap_or_else(|| format!("{owner}/{}", repository.name));
    let url = repository
        .html_url
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("https://github.com/{full_name}"));
    let language = repository
        .language
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);

    Some(GitHubRepository {
        id: repository.id.into_inner(),
        owner,
        name: repository.name,
        full_name,
        description: repository.description,
        url,
        language,
        stars: repository.stargazers_count.unwrap_or_default(),
        forks: repository.forks_count.unwrap_or_default(),
        open_issues: repository.open_issues_count.unwrap_or_default(),
        default_branch: repository
            .default_branch
            .unwrap_or_else(|| "main".to_string()),
        is_private: repository.private.unwrap_or_default(),
        is_fork: repository.fork.unwrap_or_default(),
        is_archived: repository.archived.unwrap_or_default(),
        updated_at: repository.updated_at.map(|updated| updated.to_rfc3339()),
    })
}

fn issue_from_octocrab(issue: octocrab::models::issues::Issue) -> GitHubIssue {
    GitHubIssue {
        id: issue.id.into_inner(),
        number: issue.number,
        title: issue.title,
        body: issue.body,
        url: issue.html_url.to_string(),
        author: issue.user.login,
        assignees: issue
            .assignees
            .into_iter()
            .map(|assignee| assignee.login)
            .collect(),
        labels: issue
            .labels
            .into_iter()
            .map(|label| GitHubIssueLabel {
                name: label.name,
                color: label.color,
            })
            .collect(),
        comments: issue.comments,
        created_at: issue.created_at.to_rfc3339(),
        updated_at: issue.updated_at.to_rfc3339(),
    }
}

pub struct SystemCredentialStore {
    service: String,
    account: String,
}

impl Default for SystemCredentialStore {
    fn default() -> Self {
        Self {
            service: "com.harbor.desktop".to_string(),
            account: "github-access-token".to_string(),
        }
    }
}

impl SystemCredentialStore {
    fn entry(&self) -> Result<Entry, AppError> {
        Entry::new(&self.service, &self.account)
            .map_err(|error| AppError::Credentials(error.to_string()))
    }
}

impl CredentialStore for SystemCredentialStore {
    fn load_github_token(&self) -> Result<Option<String>, AppError> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(AppError::Credentials(error.to_string())),
        }
    }

    fn save_github_token(&self, token: &str) -> Result<(), AppError> {
        self.entry()?
            .set_password(token)
            .map_err(|error| AppError::Credentials(error.to_string()))
    }

    fn delete_github_token(&self) -> Result<(), AppError> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(AppError::Credentials(error.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    struct FakeGitHubClient;

    #[async_trait]
    impl GitHubClient for FakeGitHubClient {
        async fn validate_token(&self, token: &str) -> Result<GitHubIdentity, AppError> {
            if token == "github_pat_valid-token" {
                Ok(GitHubIdentity {
                    login: "octocat".to_string(),
                    avatar_url: Some("https://github.com/octocat.png".to_string()),
                })
            } else {
                Err(AppError::GitHub("token rejected".to_string()))
            }
        }

        async fn list_repositories(&self, token: &str) -> Result<GitHubRepositoryPage, AppError> {
            assert_eq!(token, "github_pat_valid-token");
            Ok(GitHubRepositoryPage {
                repositories: vec![GitHubRepository {
                    id: 1,
                    owner: "octocat".to_string(),
                    name: "hello-world".to_string(),
                    full_name: "octocat/hello-world".to_string(),
                    description: Some("A repository".to_string()),
                    url: "https://github.com/octocat/hello-world".to_string(),
                    language: Some("Rust".to_string()),
                    stars: 42,
                    forks: 3,
                    open_issues: 1,
                    default_branch: "main".to_string(),
                    is_private: false,
                    is_fork: false,
                    is_archived: false,
                    updated_at: Some("2026-08-25T08:00:00+00:00".to_string()),
                }],
                has_more: false,
            })
        }

        async fn list_issues(
            &self,
            token: &str,
            owner: &str,
            repository: &str,
        ) -> Result<GitHubIssuePage, AppError> {
            assert_eq!(token, "github_pat_valid-token");
            assert_eq!(owner, "octocat");
            assert_eq!(repository, "hello-world");
            Ok(GitHubIssuePage {
                issues: vec![GitHubIssue {
                    id: 2,
                    number: 7,
                    title: "Keep the example focused".to_string(),
                    body: Some("Issue body".to_string()),
                    url: "https://github.com/octocat/hello-world/issues/7".to_string(),
                    author: "octocat".to_string(),
                    assignees: Vec::new(),
                    labels: vec![GitHubIssueLabel {
                        name: "good first issue".to_string(),
                        color: "7057ff".to_string(),
                    }],
                    comments: 2,
                    created_at: "2026-08-24T08:00:00+00:00".to_string(),
                    updated_at: "2026-08-25T08:00:00+00:00".to_string(),
                }],
                has_more: false,
            })
        }

        async fn repository_code_overview(
            &self,
            token: &str,
            owner: &str,
            repository: &str,
            reference: &str,
        ) -> Result<GitHubCodeOverview, AppError> {
            assert_eq!(token, "github_pat_valid-token");
            assert_eq!(
                (owner, repository, reference),
                ("octocat", "hello-world", "main")
            );
            Ok(GitHubCodeOverview {
                reference: reference.to_string(),
                branches: vec![GitHubBranch {
                    name: "main".to_string(),
                    sha: "abc1234".to_string(),
                    protected: true,
                }],
                branches_have_more: false,
                commits: vec![GitHubCommitSummary {
                    sha: "abc1234".to_string(),
                    short_sha: "abc1234".to_string(),
                    title: "Ship the workspace".to_string(),
                    author: "Octo Cat".to_string(),
                    authored_at: Some("2026-08-25T08:00:00+00:00".to_string()),
                    url: "https://github.com/octocat/hello-world/commit/abc1234".to_string(),
                }],
                commits_have_more: false,
                readme: None,
            })
        }

        async fn repository_contents(
            &self,
            token: &str,
            owner: &str,
            repository: &str,
            reference: &str,
            path: &str,
        ) -> Result<GitHubContentListing, AppError> {
            assert_eq!(token, "github_pat_valid-token");
            assert_eq!(
                (owner, repository, reference, path),
                ("octocat", "hello-world", "main", "")
            );
            Ok(GitHubContentListing {
                reference: reference.to_string(),
                path: path.to_string(),
                entries: vec![GitHubContentEntry {
                    name: "src".to_string(),
                    path: "src".to_string(),
                    sha: "def5678".to_string(),
                    kind: "dir".to_string(),
                    size: 0,
                    url: Some("https://github.com/octocat/hello-world/tree/main/src".to_string()),
                    download_url: None,
                }],
            })
        }
    }

    #[derive(Default)]
    struct MemoryCredentialStore {
        token: Mutex<Option<String>>,
    }

    impl CredentialStore for MemoryCredentialStore {
        fn load_github_token(&self) -> Result<Option<String>, AppError> {
            Ok(self.token.lock().expect("token lock").clone())
        }

        fn save_github_token(&self, token: &str) -> Result<(), AppError> {
            *self.token.lock().expect("token lock") = Some(token.to_string());
            Ok(())
        }

        fn delete_github_token(&self) -> Result<(), AppError> {
            *self.token.lock().expect("token lock") = None;
            Ok(())
        }
    }

    #[tokio::test]
    async fn connect_validates_before_saving_and_returns_identity() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials.clone());

        let connection = service
            .connect(" github_pat_valid-token ".to_string())
            .await
            .expect("valid token should connect");

        assert_eq!(connection.identity.expect("identity").login, "octocat");
        assert_eq!(
            credentials.load_github_token().expect("stored token"),
            Some("github_pat_valid-token".to_string())
        );
    }

    #[tokio::test]
    async fn rejected_token_is_not_saved() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials.clone());

        let result = service
            .connect("github_pat_invalid-token".to_string())
            .await;

        assert!(result.is_err());
        assert_eq!(credentials.load_github_token().expect("stored token"), None);
    }

    #[tokio::test]
    async fn status_restores_a_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_token("github_pat_valid-token")
            .expect("seed token");
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials);

        let connection = service.status().await.expect("status");

        assert!(connection.connected);
        assert_eq!(connection.identity.expect("identity").login, "octocat");
    }

    #[tokio::test]
    async fn disconnect_removes_credentials_and_cached_identity() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_token("github_pat_valid-token")
            .expect("seed token");
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials.clone());
        *service.identity.write().expect("identity lock") = Some(GitHubIdentity {
            login: "octocat".to_string(),
            avatar_url: None,
        });

        let connection = service.disconnect().await.expect("disconnect");

        assert_eq!(connection, GitHubConnection::disconnected());
        assert_eq!(credentials.load_github_token().expect("stored token"), None);
        assert!(service.identity.read().expect("identity lock").is_none());
    }

    #[tokio::test]
    async fn classic_personal_access_token_is_rejected() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials.clone());

        let result = service.connect("ghp_classic-token".to_string()).await;

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert_eq!(credentials.load_github_token().expect("stored token"), None);
    }

    #[tokio::test]
    async fn data_queries_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_token("github_pat_valid-token")
            .expect("seed token");
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials);

        let repositories = service.repositories().await.expect("repositories");
        let issues = service
            .issues("octocat", "hello-world")
            .await
            .expect("issues");
        let overview = service
            .code_overview("octocat", "hello-world", "main")
            .await
            .expect("code overview");
        let contents = service
            .contents("octocat", "hello-world", "main", "")
            .await
            .expect("contents");

        assert_eq!(
            repositories.repositories[0].full_name,
            "octocat/hello-world"
        );
        assert_eq!(issues.issues[0].number, 7);
        assert_eq!(overview.commits[0].short_sha, "abc1234");
        assert_eq!(contents.entries[0].path, "src");
    }

    #[tokio::test]
    async fn data_queries_require_a_saved_connection() {
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            Arc::new(MemoryCredentialStore::default()),
        );

        let result = service.repositories().await;

        assert!(matches!(result, Err(AppError::GitHubNotConnected)));
    }

    fn author_json(login: &str) -> serde_json::Value {
        serde_json::json!({
            "login": login,
            "id": 1,
            "node_id": "U_1",
            "avatar_url": format!("https://github.com/{login}.png"),
            "gravatar_id": "",
            "url": format!("https://api.github.com/users/{login}"),
            "html_url": format!("https://github.com/{login}"),
            "followers_url": format!("https://api.github.com/users/{login}/followers"),
            "following_url": format!("https://api.github.com/users/{login}/following{{/other_user}}"),
            "gists_url": format!("https://api.github.com/users/{login}/gists{{/gist_id}}"),
            "starred_url": format!("https://api.github.com/users/{login}/starred{{/owner}}{{/repo}}"),
            "subscriptions_url": format!("https://api.github.com/users/{login}/subscriptions"),
            "organizations_url": format!("https://api.github.com/users/{login}/orgs"),
            "repos_url": format!("https://api.github.com/users/{login}/repos"),
            "events_url": format!("https://api.github.com/users/{login}/events{{/privacy}}"),
            "received_events_url": format!("https://api.github.com/users/{login}/received_events"),
            "type": "User",
            "site_admin": false
        })
    }

    fn issue_json(number: u64, pull_request: bool) -> serde_json::Value {
        serde_json::json!({
            "id": number,
            "node_id": format!("I_{number}"),
            "url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}"),
            "repository_url": "https://api.github.com/repos/octocat/hello-world",
            "labels_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/labels{{/name}}"),
            "comments_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/comments"),
            "events_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/events"),
            "html_url": format!("https://github.com/octocat/hello-world/issues/{number}"),
            "number": number,
            "state": "open",
            "title": format!("Issue {number}"),
            "body": "Issue body",
            "user": author_json("octocat"),
            "labels": [{
                "id": 10,
                "node_id": "L_10",
                "url": "https://api.github.com/repos/octocat/hello-world/labels/bug",
                "name": "bug",
                "color": "d73a4a",
                "default": true
            }],
            "assignee": null,
            "assignees": [],
            "milestone": null,
            "locked": false,
            "comments": 2,
            "pull_request": pull_request.then(|| serde_json::json!({
                "url": format!("https://api.github.com/repos/octocat/hello-world/pulls/{number}"),
                "html_url": format!("https://github.com/octocat/hello-world/pull/{number}"),
                "diff_url": format!("https://github.com/octocat/hello-world/pull/{number}.diff"),
                "patch_url": format!("https://github.com/octocat/hello-world/pull/{number}.patch")
            })),
            "closed_at": null,
            "created_at": "2026-08-24T08:00:00Z",
            "updated_at": "2026-08-25T08:00:00Z"
        })
    }

    #[test]
    fn repository_page_maps_github_fields_and_pagination() {
        let repository = serde_json::from_value(serde_json::json!({
            "id": 42,
            "name": "hello-world",
            "full_name": "octocat/hello-world",
            "private": false,
            "html_url": "https://github.com/octocat/hello-world",
            "description": "A repository",
            "fork": true,
            "url": "https://api.github.com/repos/octocat/hello-world",
            "language": "Rust",
            "forks_count": 3,
            "stargazers_count": 99,
            "open_issues_count": 4,
            "archived": false,
            "default_branch": "trunk",
            "updated_at": "2026-08-25T08:00:00Z"
        }))
        .expect("repository fixture");

        let page = repository_page_from_octocrab(vec![repository], true);

        assert!(page.has_more);
        assert_eq!(page.repositories[0].owner, "octocat");
        assert_eq!(page.repositories[0].language.as_deref(), Some("Rust"));
        assert_eq!(page.repositories[0].stars, 99);
        assert_eq!(page.repositories[0].open_issues, 4);
        assert_eq!(page.repositories[0].default_branch, "trunk");
        assert!(page.repositories[0].is_fork);
    }

    fn content_json(name: &str, path: &str, kind: &str) -> serde_json::Value {
        serde_json::json!({
            "name": name,
            "path": path,
            "sha": "abc123",
            "encoding": null,
            "content": null,
            "size": 10,
            "url": format!("https://api.github.com/repos/octocat/hello-world/contents/{path}"),
            "html_url": format!("https://github.com/octocat/hello-world/blob/main/{path}"),
            "git_url": null,
            "download_url": null,
            "type": kind,
            "_links": {
                "git": null,
                "html": null,
                "self": format!("https://api.github.com/repos/octocat/hello-world/contents/{path}")
            },
            "license": null
        })
    }

    #[test]
    fn content_listing_places_directories_before_files() {
        let file = serde_json::from_value(content_json("README.md", "README.md", "file"))
            .expect("file fixture");
        let directory =
            serde_json::from_value(content_json("src", "src", "dir")).expect("directory fixture");

        let listing = content_listing_from_octocrab("main", "", vec![file, directory]);

        assert_eq!(listing.entries[0].name, "src");
        assert_eq!(listing.entries[1].name, "README.md");
    }

    #[test]
    fn readme_content_is_decoded_without_panicking() {
        let mut readme = content_json("README.md", "README.md", "file");
        readme["encoding"] = serde_json::json!("base64");
        readme["content"] = serde_json::json!("IyBIZWxsbyBmcm9tIEhhcmJvcgo=");
        let readme = serde_json::from_value(readme).expect("readme fixture");

        let mapped = readme_from_octocrab(readme).expect("decoded README");

        assert_eq!(mapped.content, "# Hello from Harbor\n");
    }

    #[test]
    fn issue_page_maps_fields_and_removes_pull_requests() {
        let issue = serde_json::from_value(issue_json(7, false)).expect("issue fixture");
        let pull_request =
            serde_json::from_value(issue_json(8, true)).expect("pull request fixture");

        let page = issue_page_from_octocrab(vec![issue, pull_request], true);

        assert!(page.has_more);
        assert_eq!(page.issues.len(), 1);
        assert_eq!(page.issues[0].number, 7);
        assert_eq!(page.issues[0].labels[0].name, "bug");
        assert_eq!(page.issues[0].comments, 2);
    }
}
