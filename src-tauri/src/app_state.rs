use std::sync::Arc;

use crate::{
    github::{GitHubService, OctocrabGitHubClient, SystemCredentialStore},
    repository_context::{DeepWikiContextProvider, RepositoryContextProvider},
};

pub struct AppState {
    pub github: GitHubService,
    pub repository_context: Arc<dyn RepositoryContextProvider>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            github: GitHubService::new(
                Arc::new(OctocrabGitHubClient),
                Arc::new(SystemCredentialStore::default()),
            ),
            repository_context: Arc::new(DeepWikiContextProvider::default()),
        }
    }
}
