use std::time::{SystemTime, UNIX_EPOCH};

use async_trait::async_trait;
use http::{header::ACCEPT, HeaderMap, StatusCode};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{
    authenticated_client, github_error, is_not_found, repository_from_octocrab, GitHubRepository,
    GitHubService, OctocrabGitHubClient,
};

const STARRED_REPOSITORY_PAGE_SIZE: u8 = 100;
const RECENT_FORK_WINDOW_SECONDS: i64 = 60;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubStarredRepositorySort {
    Starred,
    Updated,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStarredRepository {
    pub repository: GitHubRepository,
    pub starred_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubStarredRepositoryPage {
    pub repositories: Vec<GitHubStarredRepository>,
    pub page: u32,
    pub has_more: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubRepositoryWatchLevel {
    Participating,
    AllActivity,
    Ignored,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryRelationship {
    pub starred: bool,
    pub watch_level: GitHubRepositoryWatchLevel,
    pub viewer_login: String,
    pub viewer_owns_repository: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubForkInput {
    pub name: Option<String>,
    pub default_branch_only: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubForkResult {
    pub repository: GitHubRepository,
    pub created: bool,
}

#[async_trait]
pub(crate) trait GitHubRepositoryRelationshipsClient: Send + Sync {
    async fn list_starred_repositories(
        &self,
        token: &str,
        sort: GitHubStarredRepositorySort,
        page: u32,
    ) -> Result<GitHubStarredRepositoryPage, AppError>;

    async fn repository_relationship(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryRelationship, AppError>;

    async fn update_repository_star(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        starred: bool,
    ) -> Result<GitHubRepositoryRelationship, AppError>;

    async fn update_repository_watch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        watch_level: GitHubRepositoryWatchLevel,
    ) -> Result<GitHubRepositoryRelationship, AppError>;

    async fn fork_repository(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubForkInput,
    ) -> Result<GitHubForkResult, AppError>;
}

impl GitHubService {
    pub async fn starred_repositories(
        &self,
        sort: GitHubStarredRepositorySort,
        page: u32,
    ) -> Result<GitHubStarredRepositoryPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_starred_repositories(&token, sort, page)
            .await
    }

    pub async fn repository_relationship(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_relationship(&token, owner, repository)
            .await
    }

    pub async fn update_repository_star(
        &self,
        owner: &str,
        repository: &str,
        starred: bool,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_repository_star(&token, owner, repository, starred)
            .await
    }

    pub async fn update_repository_watch(
        &self,
        owner: &str,
        repository: &str,
        watch_level: GitHubRepositoryWatchLevel,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_repository_watch(&token, owner, repository, watch_level)
            .await
    }

    pub async fn fork_repository(
        &self,
        owner: &str,
        repository: &str,
        input: &GitHubForkInput,
    ) -> Result<GitHubForkResult, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .fork_repository(&token, owner, repository, input)
            .await
    }
}

#[derive(Serialize)]
struct StarredRepositoryParameters<'a> {
    sort: &'a str,
    direction: &'static str,
    per_page: u8,
    page: u32,
}

#[derive(Debug, Deserialize)]
struct RepositorySubscription {
    subscribed: bool,
    ignored: bool,
}

#[derive(Serialize)]
struct RepositorySubscriptionUpdate {
    subscribed: bool,
    ignored: bool,
}

#[async_trait]
impl GitHubRepositoryRelationshipsClient for OctocrabGitHubClient {
    async fn list_starred_repositories(
        &self,
        token: &str,
        sort: GitHubStarredRepositorySort,
        page: u32,
    ) -> Result<GitHubStarredRepositoryPage, AppError> {
        let client = authenticated_client(token)?;
        let mut headers = HeaderMap::new();
        headers.insert(
            ACCEPT,
            "application/vnd.github.star+json"
                .parse()
                .expect("valid GitHub media type"),
        );
        let response: octocrab::Page<octocrab::models::activity::StarredRepository> = client
            .get_with_headers(
                "/user/starred",
                Some(&StarredRepositoryParameters {
                    sort: starred_sort_parameter(sort),
                    direction: "desc",
                    per_page: STARRED_REPOSITORY_PAGE_SIZE,
                    page,
                }),
                Some(headers),
            )
            .await
            .map_err(github_error)?;
        let has_more = response.next.is_some();
        let repositories = response
            .items
            .into_iter()
            .filter_map(|starred| {
                let starred_at = starred.starred_at.to_rfc3339();
                repository_from_octocrab(starred.repo).map(|repository| GitHubStarredRepository {
                    repository,
                    starred_at,
                })
            })
            .collect();

        Ok(GitHubStarredRepositoryPage {
            repositories,
            page,
            has_more,
        })
    }

    async fn repository_relationship(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let client = authenticated_client(token)?;
        fetch_repository_relationship(&client, owner, repository).await
    }

    async fn update_repository_star(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        starred: bool,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let client = authenticated_client(token)?;
        let route = starred_repository_route(owner, repository);
        let response = if starred {
            client._put(route, None::<&()>).await
        } else {
            client._delete(route, None::<&()>).await
        }
        .map_err(github_error)?;
        octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;
        fetch_repository_relationship(&client, owner, repository).await
    }

    async fn update_repository_watch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        watch_level: GitHubRepositoryWatchLevel,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let client = authenticated_client(token)?;
        let route = repository_subscription_route(owner, repository);
        let response = match watch_level {
            GitHubRepositoryWatchLevel::Participating => client._delete(route, None::<&()>).await,
            GitHubRepositoryWatchLevel::AllActivity => {
                client
                    ._put(
                        route,
                        Some(&RepositorySubscriptionUpdate {
                            subscribed: true,
                            ignored: false,
                        }),
                    )
                    .await
            }
            GitHubRepositoryWatchLevel::Ignored => {
                client
                    ._put(
                        route,
                        Some(&RepositorySubscriptionUpdate {
                            subscribed: false,
                            ignored: true,
                        }),
                    )
                    .await
            }
        }
        .map_err(github_error)?;
        octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;
        fetch_repository_relationship(&client, owner, repository).await
    }

    async fn fork_repository(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubForkInput,
    ) -> Result<GitHubForkResult, AppError> {
        let client = authenticated_client(token)?;
        let viewer = client.current().user().await.map_err(github_error)?;
        if viewer.login.eq_ignore_ascii_case(owner) {
            return Err(AppError::GitHubPermission(
                "a personal repository cannot be forked into its existing owner account"
                    .to_string(),
            ));
        }

        let repository_handler = client.repos(owner, repository);
        let mut request = repository_handler
            .create_fork()
            .default_branch_only(input.default_branch_only);
        if let Some(name) = input.name.as_deref() {
            request = request.name(name);
        }
        let response = request.send().await.map_err(github_error)?;
        let created_at = response.created_at.map(|created_at| created_at.timestamp());
        let fork = repository_from_octocrab(response).ok_or_else(|| {
            AppError::GitHub("GitHub returned a fork without repository identity".to_string())
        })?;
        ensure_personal_fork(&fork, &viewer.login)?;

        Ok(GitHubForkResult {
            repository: fork,
            created: fork_was_created_recently(created_at, unix_timestamp()),
        })
    }
}

async fn fetch_repository_relationship(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubRepositoryRelationship, AppError> {
    let current_user = client.current();
    let viewer = current_user.user();
    let starred = is_repository_starred(client, owner, repository);
    let watch_level = repository_watch_level(client, owner, repository);
    let (viewer, starred, watch_level) = tokio::join!(viewer, starred, watch_level);
    let viewer = viewer.map_err(github_error)?;

    Ok(GitHubRepositoryRelationship {
        starred: starred?,
        watch_level: watch_level?,
        viewer_login: viewer.login.clone(),
        viewer_owns_repository: viewer.login.eq_ignore_ascii_case(owner),
    })
}

async fn is_repository_starred(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<bool, AppError> {
    let response = client
        ._get(starred_repository_route(owner, repository))
        .await
        .map_err(github_error)?;
    match response.status() {
        StatusCode::NO_CONTENT => Ok(true),
        StatusCode::NOT_FOUND => Ok(false),
        status => {
            octocrab::map_github_error(response)
                .await
                .map_err(github_error)?;
            Err(AppError::GitHub(format!(
                "GitHub returned unexpected star status {status}"
            )))
        }
    }
}

async fn repository_watch_level(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubRepositoryWatchLevel, AppError> {
    let result: octocrab::Result<RepositorySubscription> = client
        .get(
            repository_subscription_route(owner, repository),
            None::<&()>,
        )
        .await;
    match result {
        Ok(subscription) => Ok(watch_level_from_subscription(&subscription)),
        Err(error) if is_not_found(&error) => Ok(GitHubRepositoryWatchLevel::Participating),
        Err(error) => Err(github_error(error)),
    }
}

fn starred_sort_parameter(sort: GitHubStarredRepositorySort) -> &'static str {
    match sort {
        GitHubStarredRepositorySort::Starred => "created",
        GitHubStarredRepositorySort::Updated => "updated",
    }
}

fn watch_level_from_subscription(
    subscription: &RepositorySubscription,
) -> GitHubRepositoryWatchLevel {
    if subscription.ignored {
        GitHubRepositoryWatchLevel::Ignored
    } else if subscription.subscribed {
        GitHubRepositoryWatchLevel::AllActivity
    } else {
        GitHubRepositoryWatchLevel::Participating
    }
}

fn ensure_personal_fork(repository: &GitHubRepository, viewer: &str) -> Result<(), AppError> {
    if !repository.owner.eq_ignore_ascii_case(viewer) || !repository.is_fork {
        return Err(AppError::GitHub(
            "GitHub did not return a fork owned by the signed-in user".to_string(),
        ));
    }
    Ok(())
}

fn fork_was_created_recently(created_at: Option<i64>, now: i64) -> bool {
    created_at
        .is_some_and(|created_at| now.saturating_sub(created_at) <= RECENT_FORK_WINDOW_SECONDS)
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn starred_repository_route(owner: &str, repository: &str) -> String {
    format!("/user/starred/{owner}/{repository}")
}

fn repository_subscription_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/subscription")
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[async_trait]
impl GitHubRepositoryRelationshipsClient for super::tests::FakeGitHubClient {
    async fn list_starred_repositories(
        &self,
        token: &str,
        _sort: GitHubStarredRepositorySort,
        page: u32,
    ) -> Result<GitHubStarredRepositoryPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubStarredRepositoryPage {
            repositories: Vec::new(),
            page,
            has_more: false,
        })
    }

    async fn repository_relationship(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubRepositoryRelationship {
            starred: true,
            watch_level: GitHubRepositoryWatchLevel::Participating,
            viewer_login: "octocat".to_string(),
            viewer_owns_repository: true,
        })
    }

    async fn update_repository_star(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        starred: bool,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let mut relationship = self
            .repository_relationship(token, owner, repository)
            .await?;
        relationship.starred = starred;
        Ok(relationship)
    }

    async fn update_repository_watch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        watch_level: GitHubRepositoryWatchLevel,
    ) -> Result<GitHubRepositoryRelationship, AppError> {
        let mut relationship = self
            .repository_relationship(token, owner, repository)
            .await?;
        relationship.watch_level = watch_level;
        Ok(relationship)
    }

    async fn fork_repository(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _input: &GitHubForkInput,
    ) -> Result<GitHubForkResult, AppError> {
        Err(AppError::GitHub("fork fixture is unavailable".to_string()))
    }
}
