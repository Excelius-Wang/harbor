use std::sync::{Arc, RwLock};

use async_trait::async_trait;
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
    async fn repositories_and_issues_use_the_saved_connection() {
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

        assert_eq!(
            repositories.repositories[0].full_name,
            "octocat/hello-world"
        );
        assert_eq!(issues.issues[0].number, 7);
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
            "updated_at": "2026-08-25T08:00:00Z"
        }))
        .expect("repository fixture");

        let page = repository_page_from_octocrab(vec![repository], true);

        assert!(page.has_more);
        assert_eq!(page.repositories[0].owner, "octocat");
        assert_eq!(page.repositories[0].language.as_deref(), Some("Rust"));
        assert_eq!(page.repositories[0].stars, 99);
        assert_eq!(page.repositories[0].open_issues, 4);
        assert!(page.repositories[0].is_fork);
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
