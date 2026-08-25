use tauri::State;

use crate::{
    app_state::AppState,
    error::AppError,
    github::GitHubConnection,
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
pub async fn repository_context_ask(
    owner: String,
    repository: String,
    question: String,
    state: State<'_, AppState>,
) -> Result<RepositoryContextAnswer, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state.repository_context.ask(&repository, &question).await
}
