use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Invalid input: {0}")]
    Validation(String),
    #[error("Credential store error: {0}")]
    Credentials(String),
    #[error("GitHub error: {0}")]
    GitHub(String),
    #[error("GitHub permission denied: {0}")]
    GitHubPermission(String),
    #[error("GitHub rate limit reached: {0}")]
    GitHubRateLimited(String),
    #[error("GitHub security alerts unavailable: {0}")]
    GitHubSecurityUnavailable(String),
    #[error("GitHub could not update the pull request branch: {0}")]
    GitHubPullRequestBranchUpdateConflict(String),
    #[error("GitHub could not create the pull request: {0}")]
    GitHubPullRequestCreationConflict(String),
    #[error("GitHub could not update pull request auto-merge: {0}")]
    GitHubPullRequestAutoMergeConflict(String),
    #[error("GitHub could not update the pull request merge queue: {0}")]
    GitHubPullRequestMergeQueueConflict(String),
    #[error("GitHub could not commit the repository change: {0}")]
    GitHubCodeConflict(String),
    #[error("GitHub could not update the package: {0}")]
    GitHubPackageConflict(String),
    #[error("GitHub workflow artifact has expired")]
    GitHubArtifactExpired,
    #[error("GitHub authentication error: {0}")]
    GitHubAuthentication(String),
    #[error("GitHub is not connected")]
    GitHubNotConnected,
    #[error("Repository context error: {0}")]
    RepositoryContext(String),
    #[error("File system error: {0}")]
    FileSystem(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct ErrorPayload<'a> {
            code: &'a str,
            message: String,
        }

        let code = match self {
            Self::Validation(_) => "validation",
            Self::Credentials(_) => "credentials",
            Self::GitHub(_) => "github",
            Self::GitHubPermission(_) => "githubPermission",
            Self::GitHubRateLimited(_) => "githubRateLimited",
            Self::GitHubSecurityUnavailable(_) => "githubSecurityUnavailable",
            Self::GitHubPullRequestBranchUpdateConflict(_) => {
                "githubPullRequestBranchUpdateConflict"
            }
            Self::GitHubPullRequestCreationConflict(_) => "githubPullRequestCreationConflict",
            Self::GitHubPullRequestAutoMergeConflict(_) => "githubPullRequestAutoMergeConflict",
            Self::GitHubPullRequestMergeQueueConflict(_) => "githubPullRequestMergeQueueConflict",
            Self::GitHubCodeConflict(_) => "githubCodeConflict",
            Self::GitHubPackageConflict(_) => "githubPackageConflict",
            Self::GitHubArtifactExpired => "githubArtifactExpired",
            Self::GitHubAuthentication(_) => "githubAuthentication",
            Self::GitHubNotConnected => "githubNotConnected",
            Self::RepositoryContext(_) => "repositoryContext",
            Self::FileSystem(_) => "fileSystem",
        };
        ErrorPayload {
            code,
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn github_not_connected_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubNotConnected).expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubNotConnected",
                "message": "GitHub is not connected"
            })
        );
    }

    #[test]
    fn github_authentication_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubAuthentication(
            "GitHub login was cancelled".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubAuthentication",
                "message": "GitHub authentication error: GitHub login was cancelled"
            })
        );
    }

    #[test]
    fn github_permission_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubPermission(
            "Issues permission is required".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubPermission",
                "message": "GitHub permission denied: Issues permission is required"
            })
        );
    }

    #[test]
    fn github_rate_limit_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubRateLimited(
            "secondary rate limit".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubRateLimited",
                "message": "GitHub rate limit reached: secondary rate limit"
            })
        );
    }

    #[test]
    fn github_security_unavailable_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubSecurityUnavailable(
            "Dependabot alerts are disabled".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubSecurityUnavailable",
                "message": "GitHub security alerts unavailable: Dependabot alerts are disabled"
            })
        );
    }

    #[test]
    fn pull_request_branch_update_conflict_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubPullRequestBranchUpdateConflict(
            "the pull request head changed".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubPullRequestBranchUpdateConflict",
                "message": "GitHub could not update the pull request branch: the pull request head changed"
            })
        );
    }

    #[test]
    fn pull_request_creation_conflict_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubPullRequestCreationConflict(
            "a pull request already exists".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubPullRequestCreationConflict",
                "message": "GitHub could not create the pull request: a pull request already exists"
            })
        );
    }

    #[test]
    fn pull_request_auto_merge_conflict_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubPullRequestAutoMergeConflict(
            "auto-merge is disabled for this repository".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubPullRequestAutoMergeConflict",
                "message": "GitHub could not update pull request auto-merge: auto-merge is disabled for this repository"
            })
        );
    }

    #[test]
    fn pull_request_merge_queue_conflict_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubPullRequestMergeQueueConflict(
            "the pull request head changed".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubPullRequestMergeQueueConflict",
                "message": "GitHub could not update the pull request merge queue: the pull request head changed"
            })
        );
    }

    #[test]
    fn github_code_conflict_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubCodeConflict(
            "the file changed before the commit was created".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubCodeConflict",
                "message": "GitHub could not commit the repository change: the file changed before the commit was created"
            })
        );
    }

    #[test]
    fn github_package_conflict_has_a_stable_ipc_code() {
        let payload = serde_json::to_value(AppError::GitHubPackageConflict(
            "the selected version changed".to_string(),
        ))
        .expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubPackageConflict",
                "message": "GitHub could not update the package: the selected version changed"
            })
        );
    }

    #[test]
    fn github_artifact_expiration_has_a_stable_ipc_code() {
        let payload =
            serde_json::to_value(AppError::GitHubArtifactExpired).expect("serialize error");

        assert_eq!(
            payload,
            serde_json::json!({
                "code": "githubArtifactExpired",
                "message": "GitHub workflow artifact has expired"
            })
        );
    }
}
