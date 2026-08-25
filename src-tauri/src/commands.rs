use tauri::State;

use crate::{
    app_state::AppState,
    error::AppError,
    github::{
        GitHubCodeOverview, GitHubConnection, GitHubContentListing, GitHubIssuePage,
        GitHubRepositoryPage,
    },
    github_oauth::GitHubLoginAttempt,
    repository_context::{RepositoryContextAnswer, RepositoryRef},
};

#[tauri::command]
pub fn github_begin_login(state: State<'_, AppState>) -> Result<GitHubLoginAttempt, AppError> {
    state.github.begin_login()
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
pub async fn github_get_repository_code_overview(
    owner: String,
    repository: String,
    reference: String,
    state: State<'_, AppState>,
) -> Result<GitHubCodeOverview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reference = validate_reference(reference)?;
    state
        .github
        .code_overview(repository.owner(), repository.name(), &reference)
        .await
}

#[tauri::command]
pub async fn github_list_repository_contents(
    owner: String,
    repository: String,
    reference: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitHubContentListing, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reference = validate_reference(reference)?;
    let path = validate_repository_path(path)?;
    state
        .github
        .contents(repository.owner(), repository.name(), &reference, &path)
        .await
}

fn validate_reference(reference: String) -> Result<String, AppError> {
    let reference = reference.trim().to_string();
    if reference.is_empty() || reference.len() > 512 || reference.chars().any(char::is_control) {
        return Err(AppError::Validation(
            "repository reference is invalid".to_string(),
        ));
    }
    Ok(reference)
}

fn validate_repository_path(path: String) -> Result<String, AppError> {
    let path = path.trim_matches('/').to_string();
    if path.len() > 4_096
        || path.chars().any(char::is_control)
        || path
            .split('/')
            .any(|segment| segment == "." || segment == "..")
    {
        return Err(AppError::Validation(
            "repository path is invalid".to_string(),
        ));
    }
    Ok(path)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repository_path_normalizes_outer_slashes() {
        assert_eq!(
            validate_repository_path("/src/features/".to_string()).expect("valid path"),
            "src/features"
        );
        assert_eq!(validate_repository_path("/".to_string()).expect("root"), "");
    }

    #[test]
    fn repository_path_rejects_parent_segments() {
        assert!(validate_repository_path("src/../secrets".to_string()).is_err());
    }

    #[test]
    fn reference_allows_branch_paths_but_rejects_controls() {
        assert_eq!(
            validate_reference("feature/code-workspace".to_string()).expect("branch"),
            "feature/code-workspace"
        );
        assert!(validate_reference("main\nother".to_string()).is_err());
    }
}
