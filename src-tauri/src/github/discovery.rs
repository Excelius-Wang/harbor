use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{
    authenticated_client, github_error,
    issue::{issue_summary_from_search_value, GitHubIssueSummary},
    profile::GitHubUserSummary,
    pull_request_summary_from_search_value, repository_from_octocrab, GitHubPullRequestSummary,
    GitHubRepository, GitHubService, OctocrabGitHubClient,
};

const DISCOVERY_PAGE_SIZE: u8 = 30;
const DISCOVERY_RESULT_LIMIT: u64 = 1_000;
const DEVELOPER_FEED_PAGE_SIZE: u8 = 30;
const DEVELOPER_FEED_PAGE_LIMIT: u32 = 10;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubDiscoverySearchKind {
    Repositories,
    Code,
    Issues,
    PullRequests,
    Users,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubDiscoverySearchSort {
    BestMatch,
    Updated,
    Stars,
    Forks,
    Comments,
    Followers,
    Repositories,
    Joined,
    Indexed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscoveryCodeResult {
    pub name: String,
    pub path: String,
    pub sha: String,
    pub url: String,
    pub fragment: Option<String>,
    pub repository: GitHubRepository,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubDiscoverySearchPage {
    Repositories {
        results: Vec<GitHubRepository>,
        total_count: u64,
        incomplete_results: bool,
        page: u32,
        has_previous: bool,
        has_more: bool,
    },
    Code {
        results: Vec<GitHubDiscoveryCodeResult>,
        total_count: u64,
        incomplete_results: bool,
        page: u32,
        has_previous: bool,
        has_more: bool,
    },
    Issues {
        results: Vec<GitHubIssueSummary>,
        total_count: u64,
        incomplete_results: bool,
        page: u32,
        has_previous: bool,
        has_more: bool,
    },
    PullRequests {
        results: Vec<GitHubPullRequestSummary>,
        total_count: u64,
        incomplete_results: bool,
        page: u32,
        has_previous: bool,
        has_more: bool,
    },
    Users {
        results: Vec<GitHubUserSummary>,
        total_count: u64,
        incomplete_results: bool,
        page: u32,
        has_previous: bool,
        has_more: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeveloperFeedRepository {
    pub id: u64,
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeveloperFeedEvent {
    pub id: String,
    pub event_type: String,
    pub actor: GitHubUserSummary,
    pub repository: GitHubDeveloperFeedRepository,
    pub action: Option<String>,
    pub reference: Option<String>,
    pub resource_number: Option<u64>,
    pub resource_title: Option<String>,
    pub commit_count: Option<u32>,
    pub public: bool,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDeveloperFeedPage {
    pub events: Vec<GitHubDeveloperFeedEvent>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[async_trait]
pub(crate) trait GitHubDiscoveryClient: Send + Sync {
    async fn search_discovery(
        &self,
        token: &str,
        kind: GitHubDiscoverySearchKind,
        query: &str,
        sort: GitHubDiscoverySearchSort,
        page: u32,
    ) -> Result<GitHubDiscoverySearchPage, AppError>;

    async fn developer_feed(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubDeveloperFeedPage, AppError>;
}

impl GitHubService {
    pub async fn search_discovery(
        &self,
        kind: GitHubDiscoverySearchKind,
        query: &str,
        sort: GitHubDiscoverySearchSort,
        page: u32,
    ) -> Result<GitHubDiscoverySearchPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .search_discovery(&token, kind, query, sort, page)
            .await
    }

    pub async fn developer_feed(&self, page: u32) -> Result<GitHubDeveloperFeedPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.developer_feed(&token, page).await
    }
}

#[derive(Serialize)]
struct DiscoverySearchParameters<'a> {
    #[serde(rename = "q")]
    query: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    sort: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order: Option<&'static str>,
    per_page: u8,
    page: u32,
}

#[derive(Debug, Deserialize)]
struct SearchResponse<T> {
    total_count: u64,
    incomplete_results: bool,
    items: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct RawCodeSearchItem {
    name: String,
    path: String,
    sha: String,
    html_url: String,
    repository: octocrab::models::Repository,
    text_matches: Option<Vec<RawTextMatch>>,
}

#[derive(Debug, Deserialize)]
struct RawTextMatch {
    fragment: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawUserSearchItem {
    id: u64,
    login: String,
    avatar_url: String,
    html_url: String,
    #[serde(rename = "type")]
    account_type: String,
}

#[derive(Debug, Deserialize)]
struct RawViewer {
    login: String,
}

#[derive(Debug, Deserialize)]
struct RawFeedEvent {
    id: String,
    #[serde(rename = "type")]
    event_type: String,
    actor: RawFeedActor,
    repo: RawFeedRepository,
    payload: serde_json::Value,
    public: bool,
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct RawFeedActor {
    id: u64,
    login: String,
    avatar_url: String,
}

#[derive(Debug, Deserialize)]
struct RawFeedRepository {
    id: u64,
    name: String,
}

#[derive(Serialize)]
struct FeedPageParameters {
    per_page: u8,
    page: u32,
}

#[async_trait]
impl GitHubDiscoveryClient for OctocrabGitHubClient {
    async fn search_discovery(
        &self,
        token: &str,
        kind: GitHubDiscoverySearchKind,
        query: &str,
        sort: GitHubDiscoverySearchSort,
        page: u32,
    ) -> Result<GitHubDiscoverySearchPage, AppError> {
        let client = authenticated_client(token)?;
        let query = discovery_search_query(kind, query);
        let sort = discovery_search_sort(kind, sort)?;
        let parameters = DiscoverySearchParameters {
            query: &query,
            sort,
            order: sort.map(|_| "desc"),
            per_page: DISCOVERY_PAGE_SIZE,
            page,
        };
        let mut headers = http::HeaderMap::new();
        headers.insert(
            http::header::ACCEPT,
            http::HeaderValue::from_static("application/vnd.github.text-match+json"),
        );

        match kind {
            GitHubDiscoverySearchKind::Repositories => {
                let response: SearchResponse<octocrab::models::Repository> = client
                    .get_with_headers(
                        discovery_search_route(kind),
                        Some(&parameters),
                        Some(headers),
                    )
                    .await
                    .map_err(github_error)?;
                let metadata = search_page_metadata(&response, page);
                Ok(GitHubDiscoverySearchPage::Repositories {
                    results: response
                        .items
                        .into_iter()
                        .filter_map(repository_from_octocrab)
                        .collect(),
                    total_count: metadata.total_count,
                    incomplete_results: metadata.incomplete_results,
                    page,
                    has_previous: metadata.has_previous,
                    has_more: metadata.has_more,
                })
            }
            GitHubDiscoverySearchKind::Code => {
                let response: SearchResponse<RawCodeSearchItem> = client
                    .get_with_headers(
                        discovery_search_route(kind),
                        Some(&parameters),
                        Some(headers),
                    )
                    .await
                    .map_err(github_error)?;
                let metadata = search_page_metadata(&response, page);
                let results = response
                    .items
                    .into_iter()
                    .map(discovery_code_result_from_raw)
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(GitHubDiscoverySearchPage::Code {
                    results,
                    total_count: metadata.total_count,
                    incomplete_results: metadata.incomplete_results,
                    page,
                    has_previous: metadata.has_previous,
                    has_more: metadata.has_more,
                })
            }
            GitHubDiscoverySearchKind::Issues => {
                let response: SearchResponse<serde_json::Value> = client
                    .get_with_headers(
                        discovery_search_route(kind),
                        Some(&parameters),
                        Some(headers),
                    )
                    .await
                    .map_err(github_error)?;
                let metadata = search_page_metadata(&response, page);
                let results = response
                    .items
                    .into_iter()
                    .map(issue_summary_from_search_value)
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(GitHubDiscoverySearchPage::Issues {
                    results,
                    total_count: metadata.total_count,
                    incomplete_results: metadata.incomplete_results,
                    page,
                    has_previous: metadata.has_previous,
                    has_more: metadata.has_more,
                })
            }
            GitHubDiscoverySearchKind::PullRequests => {
                let response: SearchResponse<serde_json::Value> = client
                    .get_with_headers(
                        discovery_search_route(kind),
                        Some(&parameters),
                        Some(headers),
                    )
                    .await
                    .map_err(github_error)?;
                let metadata = search_page_metadata(&response, page);
                let results = response
                    .items
                    .into_iter()
                    .map(pull_request_summary_from_search_value)
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(GitHubDiscoverySearchPage::PullRequests {
                    results,
                    total_count: metadata.total_count,
                    incomplete_results: metadata.incomplete_results,
                    page,
                    has_previous: metadata.has_previous,
                    has_more: metadata.has_more,
                })
            }
            GitHubDiscoverySearchKind::Users => {
                let response: SearchResponse<RawUserSearchItem> = client
                    .get_with_headers(
                        discovery_search_route(kind),
                        Some(&parameters),
                        Some(headers),
                    )
                    .await
                    .map_err(github_error)?;
                let metadata = search_page_metadata(&response, page);
                let results = response
                    .items
                    .into_iter()
                    .map(user_summary_from_search)
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(GitHubDiscoverySearchPage::Users {
                    results,
                    total_count: metadata.total_count,
                    incomplete_results: metadata.incomplete_results,
                    page,
                    has_previous: metadata.has_previous,
                    has_more: metadata.has_more,
                })
            }
        }
    }

    async fn developer_feed(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubDeveloperFeedPage, AppError> {
        let client = authenticated_client(token)?;
        let viewer: RawViewer = client
            .get("/user", None::<&()>)
            .await
            .map_err(github_error)?;
        let route = developer_feed_route(&viewer.login);
        let response: octocrab::Page<RawFeedEvent> = client
            .get(
                route,
                Some(&FeedPageParameters {
                    per_page: DEVELOPER_FEED_PAGE_SIZE,
                    page,
                }),
            )
            .await
            .map_err(github_error)?;

        Ok(GitHubDeveloperFeedPage {
            events: response
                .items
                .into_iter()
                .map(developer_feed_event_from_raw)
                .collect::<Result<Vec<_>, _>>()?,
            page,
            has_previous: page > 1,
            has_more: page < DEVELOPER_FEED_PAGE_LIMIT && response.next.is_some(),
        })
    }
}

#[derive(Clone, Copy)]
struct SearchPageMetadata {
    total_count: u64,
    incomplete_results: bool,
    has_previous: bool,
    has_more: bool,
}

fn search_page_metadata<T>(response: &SearchResponse<T>, page: u32) -> SearchPageMetadata {
    let reachable = response.total_count.min(DISCOVERY_RESULT_LIMIT);
    SearchPageMetadata {
        total_count: response.total_count,
        incomplete_results: response.incomplete_results,
        has_previous: page > 1,
        has_more: u64::from(page) * u64::from(DISCOVERY_PAGE_SIZE) < reachable,
    }
}

fn discovery_code_result_from_raw(
    raw: RawCodeSearchItem,
) -> Result<GitHubDiscoveryCodeResult, AppError> {
    let repository = repository_from_octocrab(raw.repository).ok_or_else(|| {
        AppError::GitHub("GitHub returned a code result without a repository".to_string())
    })?;
    Ok(GitHubDiscoveryCodeResult {
        name: raw.name,
        path: raw.path,
        sha: raw.sha,
        url: raw.html_url,
        fragment: raw.text_matches.and_then(|matches| {
            matches
                .into_iter()
                .find_map(|text_match| text_match.fragment)
        }),
        repository,
    })
}

fn user_summary_from_search(raw: RawUserSearchItem) -> Result<GitHubUserSummary, AppError> {
    if raw.account_type != "User" && raw.account_type != "Bot" {
        return Err(AppError::GitHub(
            "GitHub search returned an organization in the personal user surface".to_string(),
        ));
    }
    Ok(GitHubUserSummary {
        id: raw.id,
        login: raw.login,
        avatar_url: raw.avatar_url,
        url: raw.html_url,
    })
}

fn developer_feed_event_from_raw(raw: RawFeedEvent) -> Result<GitHubDeveloperFeedEvent, AppError> {
    let (owner, name) = raw.repo.name.split_once('/').ok_or_else(|| {
        AppError::GitHub("GitHub returned an event without a valid repository".to_string())
    })?;
    if owner.is_empty() || name.is_empty() || name.contains('/') {
        return Err(AppError::GitHub(
            "GitHub returned an event without a valid repository".to_string(),
        ));
    }
    let reference = raw
        .payload
        .get("ref")
        .and_then(serde_json::Value::as_str)
        .map(|reference| reference.trim_start_matches("refs/heads/").to_string());
    let resource = ["pull_request", "issue", "discussion", "release"]
        .into_iter()
        .find_map(|key| raw.payload.get(key));
    let resource_title = resource
        .and_then(|resource| resource.get("title").or_else(|| resource.get("name")))
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned);
    let resource_number = resource
        .and_then(|resource| resource.get("number"))
        .and_then(serde_json::Value::as_u64);
    let commit_count = raw
        .payload
        .get("commits")
        .and_then(serde_json::Value::as_array)
        .and_then(|commits| u32::try_from(commits.len()).ok());

    Ok(GitHubDeveloperFeedEvent {
        id: raw.id,
        event_type: raw.event_type,
        actor: GitHubUserSummary {
            id: raw.actor.id,
            login: raw.actor.login.clone(),
            avatar_url: raw.actor.avatar_url,
            url: format!("https://github.com/{}", raw.actor.login),
        },
        repository: GitHubDeveloperFeedRepository {
            id: raw.repo.id,
            owner: owner.to_string(),
            name: name.to_string(),
            full_name: raw.repo.name.clone(),
            url: format!("https://github.com/{}", raw.repo.name),
        },
        action: raw
            .payload
            .get("action")
            .and_then(serde_json::Value::as_str)
            .map(ToOwned::to_owned),
        reference,
        resource_number,
        resource_title,
        commit_count,
        public: raw.public,
        created_at: raw.created_at,
    })
}

pub(crate) fn normalize_discovery_query(query: &str) -> Result<String, AppError> {
    let query = query.trim();
    if query.is_empty()
        || query.chars().count() > 1_024
        || query
            .chars()
            .any(|character| character == '\0' || character == '\r' || character == '\n')
    {
        return Err(AppError::Validation(
            "GitHub search query must contain 1 to 1024 characters on one line".to_string(),
        ));
    }
    Ok(query.to_string())
}

fn discovery_search_query(kind: GitHubDiscoverySearchKind, query: &str) -> String {
    let query = query
        .split_whitespace()
        .filter(|term| !search_type_discriminator(term))
        .collect::<Vec<_>>()
        .join(" ");
    let discriminator = match kind {
        GitHubDiscoverySearchKind::Issues => Some("is:issue"),
        GitHubDiscoverySearchKind::PullRequests => Some("is:pr"),
        GitHubDiscoverySearchKind::Users => Some("type:user"),
        GitHubDiscoverySearchKind::Repositories | GitHubDiscoverySearchKind::Code => None,
    };
    [query.as_str(), discriminator.unwrap_or_default()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn search_type_discriminator(term: &str) -> bool {
    let term = term
        .trim_matches(['(', ')'])
        .trim_start_matches('-')
        .to_ascii_lowercase();
    matches!(
        term.as_str(),
        "is:issue" | "is:pr" | "type:issue" | "type:pr" | "type:user" | "type:org"
    )
}

fn discovery_search_route(kind: GitHubDiscoverySearchKind) -> &'static str {
    match kind {
        GitHubDiscoverySearchKind::Repositories => "/search/repositories",
        GitHubDiscoverySearchKind::Code => "/search/code",
        GitHubDiscoverySearchKind::Issues | GitHubDiscoverySearchKind::PullRequests => {
            "/search/issues"
        }
        GitHubDiscoverySearchKind::Users => "/search/users",
    }
}

fn discovery_search_sort(
    kind: GitHubDiscoverySearchKind,
    sort: GitHubDiscoverySearchSort,
) -> Result<Option<&'static str>, AppError> {
    let value = match (kind, sort) {
        (_, GitHubDiscoverySearchSort::BestMatch) => None,
        (GitHubDiscoverySearchKind::Repositories, GitHubDiscoverySearchSort::Updated) => {
            Some("updated")
        }
        (GitHubDiscoverySearchKind::Repositories, GitHubDiscoverySearchSort::Stars) => {
            Some("stars")
        }
        (GitHubDiscoverySearchKind::Repositories, GitHubDiscoverySearchSort::Forks) => {
            Some("forks")
        }
        (
            GitHubDiscoverySearchKind::Issues | GitHubDiscoverySearchKind::PullRequests,
            GitHubDiscoverySearchSort::Updated,
        ) => Some("updated"),
        (
            GitHubDiscoverySearchKind::Issues | GitHubDiscoverySearchKind::PullRequests,
            GitHubDiscoverySearchSort::Comments,
        ) => Some("comments"),
        (GitHubDiscoverySearchKind::Users, GitHubDiscoverySearchSort::Followers) => {
            Some("followers")
        }
        (GitHubDiscoverySearchKind::Users, GitHubDiscoverySearchSort::Repositories) => {
            Some("repositories")
        }
        (GitHubDiscoverySearchKind::Users, GitHubDiscoverySearchSort::Joined) => Some("joined"),
        (GitHubDiscoverySearchKind::Code, GitHubDiscoverySearchSort::Indexed) => Some("indexed"),
        _ => {
            return Err(AppError::Validation(
                "the selected GitHub search sort does not apply to this result type".to_string(),
            ))
        }
    };
    Ok(value)
}

fn developer_feed_route(username: &str) -> String {
    format!("/users/{username}/received_events")
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[async_trait]
impl GitHubDiscoveryClient for super::tests::FakeGitHubClient {
    async fn search_discovery(
        &self,
        token: &str,
        kind: GitHubDiscoverySearchKind,
        _query: &str,
        _sort: GitHubDiscoverySearchSort,
        page: u32,
    ) -> Result<GitHubDiscoverySearchPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        let metadata = (0, false, page, page > 1, false);
        Ok(match kind {
            GitHubDiscoverySearchKind::Repositories => GitHubDiscoverySearchPage::Repositories {
                results: Vec::new(),
                total_count: metadata.0,
                incomplete_results: metadata.1,
                page: metadata.2,
                has_previous: metadata.3,
                has_more: metadata.4,
            },
            GitHubDiscoverySearchKind::Code => GitHubDiscoverySearchPage::Code {
                results: Vec::new(),
                total_count: metadata.0,
                incomplete_results: metadata.1,
                page: metadata.2,
                has_previous: metadata.3,
                has_more: metadata.4,
            },
            GitHubDiscoverySearchKind::Issues => GitHubDiscoverySearchPage::Issues {
                results: Vec::new(),
                total_count: metadata.0,
                incomplete_results: metadata.1,
                page: metadata.2,
                has_previous: metadata.3,
                has_more: metadata.4,
            },
            GitHubDiscoverySearchKind::PullRequests => GitHubDiscoverySearchPage::PullRequests {
                results: Vec::new(),
                total_count: metadata.0,
                incomplete_results: metadata.1,
                page: metadata.2,
                has_previous: metadata.3,
                has_more: metadata.4,
            },
            GitHubDiscoverySearchKind::Users => GitHubDiscoverySearchPage::Users {
                results: Vec::new(),
                total_count: metadata.0,
                incomplete_results: metadata.1,
                page: metadata.2,
                has_previous: metadata.3,
                has_more: metadata.4,
            },
        })
    }

    async fn developer_feed(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubDeveloperFeedPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubDeveloperFeedPage {
            events: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }
}
