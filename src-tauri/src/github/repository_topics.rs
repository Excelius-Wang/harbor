use async_trait::async_trait;
use http::Method;
use octocrab::FromResponse;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{
    authenticated_client, github_error, issue_related::api_request_with_body, GitHubService,
    OctocrabGitHubClient,
};

const MAX_TOPIC_COUNT: usize = 20;
const MAX_TOPIC_LENGTH: usize = 50;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryTopics {
    pub names: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryTopicsMutation {
    pub names: Vec<String>,
    pub expected_names: Vec<String>,
}

#[async_trait]
pub(crate) trait GitHubRepositoryTopicsClient: Send + Sync {
    async fn repository_topics(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryTopics, AppError>;

    async fn update_repository_topics(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubRepositoryTopicsMutation,
    ) -> Result<GitHubRepositoryTopics, AppError>;
}

impl GitHubService {
    pub async fn repository_topics(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryTopics, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_topics(&token, owner, repository)
            .await
    }

    pub async fn update_repository_topics(
        &self,
        owner: &str,
        repository: &str,
        mutation: &GitHubRepositoryTopicsMutation,
    ) -> Result<GitHubRepositoryTopics, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_repository_topics(&token, owner, repository, mutation)
            .await
    }
}

#[async_trait]
impl GitHubRepositoryTopicsClient for OctocrabGitHubClient {
    async fn repository_topics(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryTopics, AppError> {
        let client = authenticated_client(token)?;
        load_repository_topics_with_client(&client, owner, repository).await
    }

    async fn update_repository_topics(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubRepositoryTopicsMutation,
    ) -> Result<GitHubRepositoryTopics, AppError> {
        let read_client = authenticated_client(token)?;
        let write_client = topics_write_client(token)?;
        replace_repository_topics_with_clients(
            &read_client,
            &write_client,
            owner,
            repository,
            mutation,
        )
        .await
    }
}

pub(super) async fn load_repository_topics_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubRepositoryTopics, AppError> {
    ensure_personal_repository_owner(client, owner).await?;
    load_topics_with_client(client, owner, repository).await
}

pub(super) async fn replace_repository_topics_with_clients(
    read_client: &octocrab::Octocrab,
    write_client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    mutation: &GitHubRepositoryTopicsMutation,
) -> Result<GitHubRepositoryTopics, AppError> {
    let requested_names = normalize_topic_names(&mutation.names)?;
    let expected_names = normalize_topic_names(&mutation.expected_names)?;
    ensure_personal_repository_owner(read_client, owner).await?;
    let current = load_topics_with_client(read_client, owner, repository).await?;
    if current.names != expected_names {
        return Err(AppError::GitHubRepositoryTopicsConflict(
            "repository topics changed; refresh before saving".to_string(),
        ));
    }

    let returned = replace_topics_with_client(write_client, owner, repository, &requested_names)
        .await
        .map_err(post_write_error)?;
    if returned.names != requested_names {
        return Err(write_may_have_persisted(
            "the requested topic set was not returned",
        ));
    }

    let postflight = load_topics_with_client(read_client, owner, repository)
        .await
        .map_err(post_write_error)?;
    if postflight.names != requested_names {
        return Err(write_may_have_persisted(
            "the requested topic set was not confirmed after saving",
        ));
    }
    Ok(postflight)
}

async fn ensure_personal_repository_owner(
    client: &octocrab::Octocrab,
    owner: &str,
) -> Result<(), AppError> {
    let viewer = client.current().user().await.map_err(github_error)?;
    if !viewer.login.eq_ignore_ascii_case(owner) {
        return Err(AppError::GitHubPermission(
            "repository topics are limited to the signed-in personal account".to_string(),
        ));
    }
    Ok(())
}

async fn load_topics_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubRepositoryTopics, AppError> {
    let request = api_request_with_body(
        client,
        Method::GET,
        topics_route(owner, repository),
        None::<&()>,
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    let raw = RawRepositoryTopics::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!(
                "GitHub returned invalid repository topics: {error}"
            ))
        })?;
    Ok(GitHubRepositoryTopics {
        names: normalize_topic_names(&raw.names)?,
    })
}

async fn replace_topics_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    names: &[String],
) -> Result<GitHubRepositoryTopics, AppError> {
    let request = api_request_with_body(
        client,
        Method::PUT,
        topics_route(owner, repository),
        Some(&TopicsPayload { names }),
    )?;
    let response = client.execute(request).await.map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    let raw = RawRepositoryTopics::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!(
                "GitHub returned invalid repository topics: {error}"
            ))
        })?;
    Ok(GitHubRepositoryTopics {
        names: normalize_topic_names(&raw.names)?,
    })
}

fn normalize_topic_names(names: &[String]) -> Result<Vec<String>, AppError> {
    if names.len() > MAX_TOPIC_COUNT {
        return Err(AppError::Validation(format!(
            "a repository can have at most {MAX_TOPIC_COUNT} topics"
        )));
    }
    let mut normalized = Vec::with_capacity(names.len());
    for name in names {
        let name = name.trim().to_ascii_lowercase();
        if name.is_empty()
            || name.len() > MAX_TOPIC_LENGTH
            || !name
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        {
            return Err(AppError::Validation(
                "topics must use lowercase letters, numbers, and hyphens, with at most 50 characters"
                    .to_string(),
            ));
        }
        if normalized.iter().any(|existing| existing == &name) {
            return Err(AppError::Validation(
                "repository topics must be unique".to_string(),
            ));
        }
        normalized.push(name);
    }
    Ok(normalized)
}

fn topics_write_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

fn post_write_error(error: AppError) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => write_may_have_persisted(&error.to_string()),
    }
}

fn write_may_have_persisted(message: &str) -> AppError {
    AppError::GitHubRepositoryTopicsConflict(format!(
        "{message}; the repository topics update may have persisted; refresh before retrying"
    ))
}

fn topics_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/topics")
}

#[derive(Debug, Deserialize)]
struct RawRepositoryTopics {
    names: Vec<String>,
}

#[derive(Serialize)]
struct TopicsPayload<'a> {
    names: &'a [String],
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[async_trait]
impl GitHubRepositoryTopicsClient for super::tests::FakeGitHubClient {
    async fn repository_topics(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryTopics, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubRepositoryTopics {
            names: vec!["rust".to_string(), "tauri".to_string()],
        })
    }

    async fn update_repository_topics(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubRepositoryTopicsMutation,
    ) -> Result<GitHubRepositoryTopics, AppError> {
        self.repository_topics(token, owner, repository).await?;
        Ok(GitHubRepositoryTopics {
            names: normalize_topic_names(&mutation.names)?,
        })
    }
}
