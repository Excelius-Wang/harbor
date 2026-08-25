use tauri::State;

use crate::{
    app_state::AppState,
    error::AppError,
    github::{GitHubConnection, GitHubIssuePage, GitHubRepositoryPage},
    repository_context::{RepositoryContextAnswer, RepositoryRef},
};

#[tauri::command]
pub async fn github_connect(
    token: String,
    state: State<'_, AppState>,
) -> Result<GitHubConnection, AppError> {
    state.github.connect(token).await
}

#[tauri::command]
pub async fn github_connection_status(
    state: State<'_, AppState>,
) -> Result<GitHubConnection, AppError> {
    state.github.status().await
}

#[tauri::command]
pub async fn github_disconnect(state: State<'_, AppState>) -> Result<GitHubConnection, AppError> {
    state.github.disconnect().await
}

#[tauri::command]
pub async fn github_list_repositories(
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryPage, AppError> {
    state.github.repositories().await
}

#[tauri::command]
pub async fn github_list_repository_issues(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssuePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issues(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn repository_context_ask(
    owner: String,
    repository: String,
    question: String,
    state: State<'_, AppState>,
) -> Result<RepositoryContextAnswer, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state.repository_context.ask(&repository, &question).await
}
