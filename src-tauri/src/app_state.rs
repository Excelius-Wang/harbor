use std::sync::Arc;

use crate::{
    github::{GitHubService, OctocrabGitHubClient, SystemCredentialStore},
    github_oauth::{GitHubOAuthConfig, GitHubOAuthSession},
    repository_context::{DeepWikiContextProvider, RepositoryContextProvider},
};

pub struct AppState {
    pub github: Arc<GitHubService>,
    pub repository_context: Arc<dyn RepositoryContextProvider>,
}

impl Default for AppState {
    fn default() -> Self {
        let oauth = GitHubOAuthConfig::from_build_environment()
            .and_then(|config| GitHubOAuthSession::new(config).ok())
            .map(Arc::new);
        Self {
            github: Arc::new(GitHubService::new(
                Arc::new(OctocrabGitHubClient),
                Arc::new(SystemCredentialStore::default()),
                oauth,
            )),
            repository_context: Arc::new(DeepWikiContextProvider::default()),
        }
    }
}
