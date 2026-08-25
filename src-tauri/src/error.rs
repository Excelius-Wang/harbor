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
    #[error("GitHub authentication error: {0}")]
    GitHubAuthentication(String),
    #[error("GitHub is not connected")]
    GitHubNotConnected,
    #[error("Repository context error: {0}")]
    RepositoryContext(String),
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
            Self::GitHubAuthentication(_) => "githubAuthentication",
            Self::GitHubNotConnected => "githubNotConnected",
            Self::RepositoryContext(_) => "repositoryContext",
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
}
