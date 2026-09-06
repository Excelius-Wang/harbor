use std::{collections::HashSet, time::Duration};

use async_trait::async_trait;
use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};

use crate::{error::AppError, repository_context::RepositoryRef};

use super::{GitHubService, OctocrabGitHubClient};

const MAX_PAGE_BYTES: usize = 2 * 1024 * 1024;
const MAX_DEVELOPERS: usize = 100;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrendingFilters {
    pub language: Option<String>,
    pub sponsorable: bool,
}

fn valid_language(language: &str) -> bool {
    !language.is_empty()
        && language.len() <= 100
        && language.as_bytes()[0].is_ascii_alphanumeric()
        && language.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-+.#'()*".contains(&byte)
        })
}

impl GitHubTrendingFilters {
    fn normalized(mut self) -> Result<Self, AppError> {
        self.language = self.language.map(|value| value.trim().to_ascii_lowercase());
        if self.language.as_deref() == Some("") {
            self.language = None;
        }
        if self
            .language
            .as_deref()
            .is_some_and(|value| !valid_language(value))
        {
            return Err(AppError::Validation(
                "Invalid trending language.".to_string(),
            ));
        }
        Ok(self)
    }

    fn web_url(&self, period: GitHubTrendingPeriod) -> Result<String, AppError> {
        let filters = self.clone().normalized()?;
        let mut url = url::Url::parse(&period.web_url()).expect("static GitHub URL");
        if let Some(language) = filters.language {
            url.path_segments_mut()
                .expect("GitHub URL has a path")
                .push(&language);
        }
        if filters.sponsorable {
            url.query_pairs_mut().append_pair("sponsorable", "1");
        }
        Ok(url.to_string())
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubTrendingPeriod {
    Daily,
    Weekly,
    Monthly,
}

impl GitHubTrendingPeriod {
    fn web_url(self) -> String {
        let period = match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
        };
        format!("https://github.com/trending/developers?since={period}")
    }
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrendingRepository {
    pub full_name: String,
    pub url: String,
    pub description: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrendingDeveloper {
    pub rank: usize,
    pub login: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub popular_repository: Option<GitHubTrendingRepository>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrendingDeveloperPage {
    pub developers: Vec<GitHubTrendingDeveloper>,
    pub period: GitHubTrendingPeriod,
    pub languages: Vec<GitHubTrendingLanguage>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrendingLanguage {
    pub slug: String,
    pub name: String,
}

#[async_trait]
pub(crate) trait GitHubTrendingClient: Send + Sync {
    async fn trending_developers(
        &self,
        period: GitHubTrendingPeriod,
        filters: GitHubTrendingFilters,
    ) -> Result<GitHubTrendingDeveloperPage, AppError>;
}

impl GitHubService {
    pub async fn trending_developers(
        &self,
        period: GitHubTrendingPeriod,
        filters: GitHubTrendingFilters,
    ) -> Result<GitHubTrendingDeveloperPage, AppError> {
        // Public rankings do not need or receive the connected account's credentials.
        self.client
            .trending_developers(period, filters.normalized()?)
            .await
    }
}

#[async_trait]
impl GitHubTrendingClient for OctocrabGitHubClient {
    async fn trending_developers(
        &self,
        period: GitHubTrendingPeriod,
        filters: GitHubTrendingFilters,
    ) -> Result<GitHubTrendingDeveloperPage, AppError> {
        let client = reqwest::Client::builder()
            .user_agent("Harbor/0.1")
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(request_error)?;
        let html = fetch_page(&client, &filters.web_url(period)?).await?;
        tokio::task::spawn_blocking(move || parse_developers(&html, period))
            .await
            .map_err(|_| unavailable())?
    }
}

async fn fetch_page(client: &reqwest::Client, url: &str) -> Result<String, AppError> {
    let mut response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "text/html")
        .send()
        .await
        .map_err(request_error)?;
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::GitHubRateLimited(
            "Trending developers are temporarily unavailable. Try again later.".to_string(),
        ));
    }
    if !response.status().is_success()
        || !response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.split(';').next().unwrap_or("").trim() == "text/html")
        || response
            .content_length()
            .is_some_and(|size| size > MAX_PAGE_BYTES as u64)
    {
        return Err(unavailable());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(request_error)? {
        if body.len().saturating_add(chunk.len()) > MAX_PAGE_BYTES {
            return Err(unavailable());
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| unavailable())
}

fn request_error(_error: reqwest::Error) -> AppError {
    AppError::GitHub("Could not load GitHub's trending developers. Try again later.".to_string())
}

fn unavailable() -> AppError {
    AppError::GitHub(
        "GitHub's trending developers list is unavailable. Try again later.".to_string(),
    )
}

fn selector(value: &str) -> Selector {
    Selector::parse(value).expect("static trending selector")
}

fn element_text(element: ElementRef<'_>) -> String {
    element
        .text()
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_developers(
    html: &str,
    period: GitHubTrendingPeriod,
) -> Result<GitHubTrendingDeveloperPage, AppError> {
    if html.len() > MAX_PAGE_BYTES {
        return Err(unavailable());
    }
    let document = Html::parse_document(html);
    let rows = selector("article.Box-row");
    let identity = selector("h1.h3 a[href]");
    let avatar = selector("img.avatar-user");
    let repository = selector("article h1.h4 a[href]");
    let description = selector("article .f6.color-fg-muted.mt-1");
    let mut logins = HashSet::new();
    let mut developers = Vec::new();
    for (index, row) in document.select(&rows).enumerate() {
        if index >= MAX_DEVELOPERS {
            return Err(unavailable());
        }
        let identity = row.select(&identity).next().ok_or_else(unavailable)?;
        let path = identity.value().attr("href").ok_or_else(unavailable)?;
        let login = path.strip_prefix('/').ok_or_else(unavailable)?;
        if login.is_empty()
            || login.len() > 39
            || !login
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            || !logins.insert(login.to_ascii_lowercase())
        {
            return Err(unavailable());
        }
        let name = element_text(identity);
        let avatar_url = row
            .select(&avatar)
            .next()
            .and_then(|element| element.value().attr("src"))
            .and_then(|src| url::Url::parse(src).ok())
            .filter(|url| {
                url.scheme() == "https"
                    && url.host_str() == Some("avatars.githubusercontent.com")
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.port().is_none()
            })
            .map(|url| url.to_string());
        let popular_repository = row
            .select(&repository)
            .next()
            .map(|element| {
                let path = element.value().attr("href").ok_or_else(unavailable)?;
                let full_name = path.strip_prefix('/').ok_or_else(unavailable)?;
                let reference = RepositoryRef::from_full_name(full_name.to_string())
                    .map_err(|_| unavailable())?;
                Ok::<_, AppError>(GitHubTrendingRepository {
                    full_name: reference.full_name(),
                    url: format!("https://github.com/{}", reference.full_name()),
                    description: row
                        .select(&description)
                        .next()
                        .map(element_text)
                        .filter(|text| !text.is_empty()),
                })
            })
            .transpose()?;
        developers.push(GitHubTrendingDeveloper {
            rank: index + 1,
            login: login.to_string(),
            name: if name.is_empty() {
                login.to_string()
            } else {
                name
            },
            avatar_url,
            popular_repository,
        });
    }
    let languages = parse_languages(&document);
    let explicitly_empty = !languages.is_empty()
        && document
            .select(&selector(".blankslate-heading"))
            .any(|heading| {
                element_text(heading)
                    .starts_with("It looks like we don’t have any trending developers")
            });
    // Only GitHub's explicit empty state may produce an empty ranking.
    if developers.is_empty() && !explicitly_empty {
        return Err(unavailable());
    }
    Ok(GitHubTrendingDeveloperPage {
        developers,
        period,
        languages,
    })
}

fn parse_languages(document: &Html) -> Vec<GitHubTrendingLanguage> {
    let mut seen = HashSet::new();
    let mut languages: Vec<_> = document
        .select(&selector(
            "#select-menu-language #languages-menuitems a[href]",
        ))
        .filter_map(|item| {
            let path = item.value().attr("href")?.split('?').next()?;
            let encoded = path.strip_prefix("/trending/developers/")?;
            let slug = percent_encoding::percent_decode_str(encoded)
                .decode_utf8()
                .ok()?
                .into_owned();
            let name = element_text(item);
            if !valid_language(&slug) || name.is_empty() || !seen.insert(slug.clone()) {
                return None;
            }
            Some(GitHubTrendingLanguage { slug, name })
        })
        .collect();
    // GitHub omits the current language from the choices and shows it in the summary instead.
    let selected = document
        .select(&selector("link[rel='canonical'][href]"))
        .next()
        .and_then(|link| url::Url::parse(link.value().attr("href")?).ok())
        .filter(|url| url.scheme() == "https" && url.host_str() == Some("github.com"))
        .and_then(|url| {
            let encoded = url.path().strip_prefix("/trending/developers/")?;
            let slug = percent_encoding::percent_decode_str(encoded)
                .decode_utf8()
                .ok()?
                .into_owned();
            let name = element_text(
                document
                    .select(&selector(
                        "#select-menu-language summary [data-menu-button]",
                    ))
                    .next()?,
            );
            (valid_language(&slug) && !name.is_empty())
                .then_some(GitHubTrendingLanguage { slug, name })
        });
    if let Some(selected) = selected {
        if seen.insert(selected.slug.clone()) {
            languages.push(selected);
            languages.sort_by_cached_key(|language| language.name.to_ascii_lowercase());
        }
    }
    languages
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[async_trait]
impl GitHubTrendingClient for super::tests::FakeGitHubClient {
    async fn trending_developers(
        &self,
        period: GitHubTrendingPeriod,
        _filters: GitHubTrendingFilters,
    ) -> Result<GitHubTrendingDeveloperPage, AppError> {
        Ok(GitHubTrendingDeveloperPage {
            developers: Vec::new(),
            period,
            languages: Vec::new(),
        })
    }
}
