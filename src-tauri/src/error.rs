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
    #[error("Repository context error: {0}")]
    RepositoryContext(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
