use std::time::Duration;

use async_trait::async_trait;
use rmcp::{
    model::{CallToolRequestParams, CallToolResult, ClientInfo},
    transport::StreamableHttpClientTransport,
    ServiceExt,
};
use serde::Serialize;

use crate::error::AppError;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepositoryRef {
    owner: String,
    name: String,
}

impl RepositoryRef {
    pub fn new(owner: String, name: String) -> Result<Self, AppError> {
        let owner = owner.trim().to_string();
        let name = name.trim().to_string();
        if !is_valid_repository_part(&owner) || !is_valid_repository_part(&name) {
            return Err(AppError::Validation(
                "repository must use owner and name parts".to_string(),
            ));
        }

        Ok(Self { owner, name })
    }

    pub fn full_name(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }

    pub fn owner(&self) -> &str {
        &self.owner
    }

    pub fn name(&self) -> &str {
        &self.name
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryContextAnswer {
    pub repository: String,
    pub answer: String,
    pub provider: String,
}

#[async_trait]
pub trait RepositoryContextProvider: Send + Sync {
    async fn ask(
        &self,
        repository: &RepositoryRef,
        question: &str,
    ) -> Result<RepositoryContextAnswer, AppError>;
}

pub struct DeepWikiContextProvider {
    endpoint: String,
    timeout: Duration,
    github: reqwest::Client,
}

impl Default for DeepWikiContextProvider {
    fn default() -> Self {
        Self {
            endpoint: "https://mcp.deepwiki.com/mcp".to_string(),
            timeout: Duration::from_secs(60),
            github: reqwest::Client::builder()
                .user_agent("Harbor/0.1")
                .build()
                .expect("GitHub visibility client should build"),
        }
    }
}

impl DeepWikiContextProvider {
    #[cfg(test)]
    fn with_timeout(timeout: Duration) -> Self {
        Self {
            timeout,
            ..Self::default()
        }
    }

    async fn call_tool(
        &self,
        name: &'static str,
        arguments: serde_json::Map<String, serde_json::Value>,
    ) -> Result<CallToolResult, AppError> {
        let endpoint = self.endpoint.clone();
        tokio::time::timeout(self.timeout, async move {
            let transport = StreamableHttpClientTransport::from_uri(endpoint);
            let client = ClientInfo::default()
                .serve(transport)
                .await
                .map_err(|error| AppError::RepositoryContext(error.to_string()))?;
            let result = client
                .call_tool(CallToolRequestParams::new(name).with_arguments(arguments))
                .await
                .map_err(|error| AppError::RepositoryContext(error.to_string()));
            let _ = client.cancel().await;
            result
        })
        .await
        .map_err(|_| AppError::RepositoryContext("DeepWiki request timed out".to_string()))?
    }

    async fn verify_public_repository(&self, repository: &RepositoryRef) -> Result<(), AppError> {
        let response = self
            .github
            .head(format!("https://github.com/{}", repository.full_name()))
            .send()
            .await
            .map_err(|error| {
                AppError::RepositoryContext(format!(
                    "could not verify that {} is public: {error}",
                    repository.full_name()
                ))
            })?;
        if !response.status().is_success() {
            return Err(AppError::RepositoryContext(
                "DeepWiki is enabled for verified public repositories only".to_string(),
            ));
        }
        Ok(())
    }
}

#[async_trait]
impl RepositoryContextProvider for DeepWikiContextProvider {
    async fn ask(
        &self,
        repository: &RepositoryRef,
        question: &str,
    ) -> Result<RepositoryContextAnswer, AppError> {
        let question = question.trim();
        if question.is_empty() {
            return Err(AppError::Validation(
                "repository question cannot be empty".to_string(),
            ));
        }
        if question.len() > 4_000 {
            return Err(AppError::Validation(
                "repository question is too long".to_string(),
            ));
        }

        self.verify_public_repository(repository).await?;

        let arguments = serde_json::json!({
            "repoName": repository.full_name(),
            "question": question,
        })
        .as_object()
        .cloned()
        .expect("DeepWiki arguments are an object");
        let result = self.call_tool("ask_question", arguments).await?;

        Ok(RepositoryContextAnswer {
            repository: repository.full_name(),
            answer: extract_tool_text(result)?,
            provider: "deepwiki".to_string(),
        })
    }
}

pub(crate) fn extract_tool_text(result: CallToolResult) -> Result<String, AppError> {
    let text = result
        .content
        .iter()
        .filter_map(|content| content.as_text())
        .map(|content| content.text.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if result.is_error == Some(true) {
        return Err(AppError::RepositoryContext(if text.is_empty() {
            "provider returned an error".to_string()
        } else {
            text
        }));
    }
    if text.is_empty() {
        return Err(AppError::RepositoryContext(
            "provider returned no text".to_string(),
        ));
    }

    Ok(text)
}

fn is_valid_repository_part(part: &str) -> bool {
    !part.is_empty()
        && part.len() <= 100
        && part != "."
        && part != ".."
        && part
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.".contains(character))
}

#[cfg(test)]
mod tests {
    use rmcp::model::{CallToolResult, ContentBlock};

    use super::*;

    #[test]
    fn repository_ref_normalizes_valid_parts() {
        let repository = RepositoryRef::new(" zed-industries ".into(), " zed ".into())
            .expect("valid repository");

        assert_eq!(repository.full_name(), "zed-industries/zed");
    }

    #[test]
    fn repository_ref_rejects_path_fragments() {
        assert!(RepositoryRef::new("owner/name".into(), "repo".into()).is_err());
        assert!(RepositoryRef::new("owner".into(), "../repo".into()).is_err());
        assert!(RepositoryRef::new("".into(), "repo".into()).is_err());
    }

    #[test]
    fn tool_text_combines_text_blocks() {
        let result = CallToolResult::success(vec![
            ContentBlock::text("first"),
            ContentBlock::text("second"),
        ]);

        assert_eq!(extract_tool_text(result).expect("text"), "first\n\nsecond");
    }

    #[test]
    fn tool_error_is_reported() {
        let result = CallToolResult::error(vec![ContentBlock::text("repository not indexed")]);

        assert!(extract_tool_text(result).is_err());
    }

    #[tokio::test]
    #[ignore = "requires the public DeepWiki service"]
    async fn deepwiki_answers_for_a_public_repository() {
        let provider = DeepWikiContextProvider::with_timeout(Duration::from_secs(90));
        let repository =
            RepositoryRef::new("CognitionAI".into(), "deepwiki".into()).expect("valid repository");

        let answer = provider
            .ask(&repository, "What does this repository provide?")
            .await
            .expect("DeepWiki answer");

        assert_eq!(answer.repository, "CognitionAI/deepwiki");
        assert!(!answer.answer.is_empty());
    }
}
