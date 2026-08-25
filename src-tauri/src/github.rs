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
}

#[derive(Default)]
pub struct OctocrabGitHubClient;

#[async_trait]
impl GitHubClient for OctocrabGitHubClient {
    async fn validate_token(&self, token: &str) -> Result<GitHubIdentity, AppError> {
        let client = octocrab::Octocrab::builder()
            .personal_token(token.to_string())
            .build()
            .map_err(|error| AppError::GitHub(error.to_string()))?;
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
}
