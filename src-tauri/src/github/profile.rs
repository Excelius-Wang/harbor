use async_trait::async_trait;
use http::StatusCode;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{authenticated_client, github_error, GitHubService, OctocrabGitHubClient};

const PROFILE_CONNECTION_PAGE_SIZE: u8 = 30;
const PROFILE_ACTIVITY_PAGE_SIZE: u8 = 30;

const USER_CONTRIBUTIONS_QUERY: &str = r#"
query HarborUserContributions($login: String!) {
  user(login: $login) {
    login
    contributionsCollection {
      startedAt
      endedAt
      restrictedContributionsCount
      hasAnyRestrictedContributions
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        months {
          firstDay
          name
          totalWeeks
          year
        }
        weeks {
          firstDay
          contributionDays {
            color
            contributionCount
            contributionLevel
            date
            weekday
          }
        }
      }
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubProfileConnectionKind {
    Followers,
    Following,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserSummary {
    pub id: u64,
    pub login: String,
    pub avatar_url: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserPage {
    pub users: Vec<GitHubUserSummary>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserProfile {
    pub id: u64,
    pub login: String,
    pub avatar_url: String,
    pub url: String,
    pub name: Option<String>,
    pub bio: Option<String>,
    pub company: Option<String>,
    pub location: Option<String>,
    pub blog: Option<String>,
    pub email: Option<String>,
    pub twitter_username: Option<String>,
    pub hireable: bool,
    pub public_repositories: u32,
    pub public_gists: u32,
    pub followers: u32,
    pub following: u32,
    pub created_at: String,
    pub updated_at: String,
    pub viewer_owns_profile: bool,
    pub viewer_follows: bool,
    pub follows_viewer: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubUserProfileUpdate {
    pub name: String,
    pub bio: String,
    pub company: String,
    pub location: String,
    pub blog: String,
    pub email: String,
    pub twitter_username: String,
    pub hireable: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GitHubContributionLevel {
    None,
    FirstQuartile,
    SecondQuartile,
    ThirdQuartile,
    FourthQuartile,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContributionDay {
    pub color: String,
    pub contribution_count: u32,
    pub contribution_level: GitHubContributionLevel,
    pub date: String,
    pub weekday: u8,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContributionWeek {
    pub first_day: String,
    pub days: Vec<GitHubContributionDay>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContributionMonth {
    pub first_day: String,
    pub name: String,
    pub total_weeks: u32,
    pub year: i32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContributionSummary {
    pub login: String,
    pub started_at: String,
    pub ended_at: String,
    pub total_contributions: u32,
    pub restricted_contributions: u32,
    pub has_restricted_contributions: bool,
    pub commits: u32,
    pub issues: u32,
    pub pull_requests: u32,
    pub pull_request_reviews: u32,
    pub months: Vec<GitHubContributionMonth>,
    pub weeks: Vec<GitHubContributionWeek>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProfileActivity {
    pub id: String,
    pub event_type: String,
    pub repository: String,
    pub action: Option<String>,
    pub reference: Option<String>,
    pub resource_number: Option<u64>,
    pub resource_title: Option<String>,
    pub commit_count: Option<u32>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProfileActivityPage {
    pub activities: Vec<GitHubProfileActivity>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[async_trait]
pub(crate) trait GitHubProfileClient: Send + Sync {
    async fn user_profile(
        &self,
        token: &str,
        username: Option<&str>,
    ) -> Result<GitHubUserProfile, AppError>;

    async fn update_personal_profile(
        &self,
        token: &str,
        input: &GitHubUserProfileUpdate,
    ) -> Result<GitHubUserProfile, AppError>;

    async fn user_contributions(
        &self,
        token: &str,
        username: &str,
    ) -> Result<GitHubContributionSummary, AppError>;

    async fn list_profile_connections(
        &self,
        token: &str,
        username: &str,
        kind: GitHubProfileConnectionKind,
        page: u32,
    ) -> Result<GitHubUserPage, AppError>;

    async fn list_profile_activity(
        &self,
        token: &str,
        username: &str,
        page: u32,
    ) -> Result<GitHubProfileActivityPage, AppError>;

    async fn update_user_follow(
        &self,
        token: &str,
        username: &str,
        followed: bool,
    ) -> Result<GitHubUserProfile, AppError>;
}

impl GitHubService {
    pub async fn user_profile(
        &self,
        username: Option<&str>,
    ) -> Result<GitHubUserProfile, AppError> {
        let token = self.load_access_token().await?;
        self.client.user_profile(&token, username).await
    }

    pub async fn update_personal_profile(
        &self,
        input: &GitHubUserProfileUpdate,
    ) -> Result<GitHubUserProfile, AppError> {
        let token = self.load_access_token().await?;
        self.client.update_personal_profile(&token, input).await
    }

    pub async fn user_contributions(
        &self,
        username: &str,
    ) -> Result<GitHubContributionSummary, AppError> {
        let token = self.load_access_token().await?;
        self.client.user_contributions(&token, username).await
    }

    pub async fn profile_connections(
        &self,
        username: &str,
        kind: GitHubProfileConnectionKind,
        page: u32,
    ) -> Result<GitHubUserPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_profile_connections(&token, username, kind, page)
            .await
    }

    pub async fn profile_activity(
        &self,
        username: &str,
        page: u32,
    ) -> Result<GitHubProfileActivityPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_profile_activity(&token, username, page)
            .await
    }

    pub async fn update_user_follow(
        &self,
        username: &str,
        followed: bool,
    ) -> Result<GitHubUserProfile, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_user_follow(&token, username, followed)
            .await
    }
}

#[derive(Debug, Deserialize)]
struct RawUserProfile {
    id: u64,
    login: String,
    avatar_url: String,
    html_url: String,
    name: Option<String>,
    bio: Option<String>,
    company: Option<String>,
    location: Option<String>,
    blog: Option<String>,
    email: Option<String>,
    twitter_username: Option<String>,
    hireable: Option<bool>,
    public_repos: u32,
    public_gists: u32,
    followers: u32,
    following: u32,
    created_at: String,
    updated_at: String,
    #[serde(rename = "type")]
    account_type: String,
}

#[derive(Debug, Deserialize)]
struct RawUserSummary {
    id: u64,
    login: String,
    avatar_url: String,
    html_url: String,
}

#[derive(Serialize)]
struct RawProfileUpdate<'a> {
    name: &'a str,
    bio: &'a str,
    company: &'a str,
    location: &'a str,
    blog: &'a str,
    email: &'a str,
    twitter_username: Option<&'a str>,
    hireable: bool,
}

#[derive(Serialize)]
struct PageParameters {
    per_page: u8,
    page: u32,
}

#[derive(Debug, Deserialize)]
struct ContributionsResponse {
    user: Option<RawContributionUser>,
}

#[derive(Debug, Deserialize)]
struct RawContributionUser {
    login: String,
    #[serde(rename = "contributionsCollection")]
    collection: RawContributionCollection,
}

#[derive(Debug, Deserialize)]
struct RawContributionCollection {
    #[serde(rename = "startedAt")]
    started_at: String,
    #[serde(rename = "endedAt")]
    ended_at: String,
    #[serde(rename = "restrictedContributionsCount")]
    restricted_contributions: u32,
    #[serde(rename = "hasAnyRestrictedContributions")]
    has_restricted_contributions: bool,
    #[serde(rename = "totalCommitContributions")]
    commits: u32,
    #[serde(rename = "totalIssueContributions")]
    issues: u32,
    #[serde(rename = "totalPullRequestContributions")]
    pull_requests: u32,
    #[serde(rename = "totalPullRequestReviewContributions")]
    pull_request_reviews: u32,
    #[serde(rename = "contributionCalendar")]
    calendar: RawContributionCalendar,
}

#[derive(Debug, Deserialize)]
struct RawContributionCalendar {
    #[serde(rename = "totalContributions")]
    total_contributions: u32,
    months: Vec<RawContributionMonth>,
    weeks: Vec<RawContributionWeek>,
}

#[derive(Debug, Deserialize)]
struct RawContributionMonth {
    #[serde(rename = "firstDay")]
    first_day: String,
    name: String,
    #[serde(rename = "totalWeeks")]
    total_weeks: u32,
    year: i32,
}

#[derive(Debug, Deserialize)]
struct RawContributionWeek {
    #[serde(rename = "firstDay")]
    first_day: String,
    #[serde(rename = "contributionDays")]
    days: Vec<GitHubContributionDay>,
}

#[derive(Debug, Deserialize)]
struct RawActivityEvent {
    id: String,
    #[serde(rename = "type")]
    event_type: String,
    repo: RawActivityRepository,
    payload: serde_json::Value,
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct RawActivityRepository {
    name: String,
}

#[async_trait]
impl GitHubProfileClient for OctocrabGitHubClient {
    async fn user_profile(
        &self,
        token: &str,
        username: Option<&str>,
    ) -> Result<GitHubUserProfile, AppError> {
        let client = authenticated_client(token)?;
        fetch_user_profile(&client, username).await
    }

    async fn update_personal_profile(
        &self,
        token: &str,
        input: &GitHubUserProfileUpdate,
    ) -> Result<GitHubUserProfile, AppError> {
        let client = authenticated_client(token)?;
        let viewer: RawUserProfile = client
            .get("/user", None::<&()>)
            .await
            .map_err(github_error)?;
        let updated: RawUserProfile = client
            .patch(
                "/user",
                Some(&RawProfileUpdate {
                    name: &input.name,
                    bio: &input.bio,
                    company: &input.company,
                    location: &input.location,
                    blog: &input.blog,
                    email: &input.email,
                    twitter_username: (!input.twitter_username.is_empty())
                        .then_some(input.twitter_username.as_str()),
                    hireable: input.hireable,
                }),
            )
            .await
            .map_err(github_error)?;
        if !updated.login.eq_ignore_ascii_case(&viewer.login) {
            return Err(AppError::GitHub(
                "GitHub returned a profile for a different user".to_string(),
            ));
        }
        ensure_personal_user(&updated)?;
        Ok(user_profile_from_raw(updated, true, false, false))
    }

    async fn user_contributions(
        &self,
        token: &str,
        username: &str,
    ) -> Result<GitHubContributionSummary, AppError> {
        let client = authenticated_client(token)?;
        let payload = serde_json::json!({
            "query": USER_CONTRIBUTIONS_QUERY,
            "variables": { "login": username }
        });
        let response: ContributionsResponse =
            client.graphql(&payload).await.map_err(github_error)?;
        let user = response.user.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the requested user".to_string())
        })?;
        if !user.login.eq_ignore_ascii_case(username) {
            return Err(AppError::GitHub(
                "GitHub returned contributions for a different user".to_string(),
            ));
        }
        Ok(contribution_summary_from_raw(user))
    }

    async fn list_profile_connections(
        &self,
        token: &str,
        username: &str,
        kind: GitHubProfileConnectionKind,
        page: u32,
    ) -> Result<GitHubUserPage, AppError> {
        let client = authenticated_client(token)?;
        let response: octocrab::Page<RawUserSummary> = client
            .get(
                profile_connections_route(username, kind),
                Some(&PageParameters {
                    per_page: PROFILE_CONNECTION_PAGE_SIZE,
                    page,
                }),
            )
            .await
            .map_err(github_error)?;
        Ok(GitHubUserPage {
            users: response
                .items
                .into_iter()
                .map(user_summary_from_raw)
                .collect(),
            page,
            has_previous: page > 1,
            has_more: response.next.is_some(),
        })
    }

    async fn list_profile_activity(
        &self,
        token: &str,
        username: &str,
        page: u32,
    ) -> Result<GitHubProfileActivityPage, AppError> {
        let client = authenticated_client(token)?;
        let response: octocrab::Page<RawActivityEvent> = client
            .get(
                profile_activity_route(username),
                Some(&PageParameters {
                    per_page: PROFILE_ACTIVITY_PAGE_SIZE,
                    page,
                }),
            )
            .await
            .map_err(github_error)?;
        Ok(GitHubProfileActivityPage {
            activities: response
                .items
                .into_iter()
                .map(profile_activity_from_raw)
                .collect(),
            page,
            has_previous: page > 1,
            has_more: response.next.is_some(),
        })
    }

    async fn update_user_follow(
        &self,
        token: &str,
        username: &str,
        followed: bool,
    ) -> Result<GitHubUserProfile, AppError> {
        let client = authenticated_client(token)?;
        let viewer: RawUserProfile = client
            .get("/user", None::<&()>)
            .await
            .map_err(github_error)?;
        if viewer.login.eq_ignore_ascii_case(username) {
            return Err(AppError::Validation(
                "the signed-in user cannot follow their own profile".to_string(),
            ));
        }
        let response = if followed {
            client._put(user_follow_route(username), None::<&()>).await
        } else {
            client
                ._delete(user_follow_route(username), None::<&()>)
                .await
        }
        .map_err(github_error)?;
        octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;

        let profile = fetch_user_profile(&client, Some(username)).await?;
        if profile.viewer_follows != followed {
            return Err(AppError::GitHub(
                "GitHub did not return the requested follow state".to_string(),
            ));
        }
        Ok(profile)
    }
}

async fn fetch_user_profile(
    client: &octocrab::Octocrab,
    username: Option<&str>,
) -> Result<GitHubUserProfile, AppError> {
    let viewer: RawUserProfile = client
        .get("/user", None::<&()>)
        .await
        .map_err(github_error)?;
    ensure_personal_user(&viewer)?;
    let viewer_login = viewer.login.clone();
    let target = match username {
        Some(username) if !viewer_login.eq_ignore_ascii_case(username) => client
            .get(user_profile_route(username), None::<&()>)
            .await
            .map_err(github_error)?,
        _ => viewer,
    };
    ensure_personal_user(&target)?;
    let viewer_owns_profile = target.login.eq_ignore_ascii_case(&viewer_login);
    if viewer_owns_profile {
        return Ok(user_profile_from_raw(target, true, false, false));
    }

    let viewer_follows = user_follows(client, &viewer_login, &target.login);
    let follows_viewer = user_follows(client, &target.login, &viewer_login);
    let (viewer_follows, follows_viewer) = tokio::join!(viewer_follows, follows_viewer);
    Ok(user_profile_from_raw(
        target,
        false,
        viewer_follows?,
        follows_viewer?,
    ))
}

async fn user_follows(
    client: &octocrab::Octocrab,
    username: &str,
    target: &str,
) -> Result<bool, AppError> {
    let response = client
        ._get(user_follows_route(username, target))
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
                "GitHub returned unexpected follow status {status}"
            )))
        }
    }
}

fn ensure_personal_user(profile: &RawUserProfile) -> Result<(), AppError> {
    if profile.account_type.eq_ignore_ascii_case("Organization") {
        return Err(AppError::Validation(
            "organization profiles are outside Harbor's personal workspace".to_string(),
        ));
    }
    Ok(())
}

fn user_profile_from_raw(
    raw: RawUserProfile,
    viewer_owns_profile: bool,
    viewer_follows: bool,
    follows_viewer: bool,
) -> GitHubUserProfile {
    GitHubUserProfile {
        id: raw.id,
        login: raw.login,
        avatar_url: raw.avatar_url,
        url: raw.html_url,
        name: optional_text(raw.name),
        bio: optional_text(raw.bio),
        company: optional_text(raw.company),
        location: optional_text(raw.location),
        blog: optional_text(raw.blog),
        email: optional_text(raw.email),
        twitter_username: optional_text(raw.twitter_username),
        hireable: raw.hireable.unwrap_or(false),
        public_repositories: raw.public_repos,
        public_gists: raw.public_gists,
        followers: raw.followers,
        following: raw.following,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        viewer_owns_profile,
        viewer_follows,
        follows_viewer,
    }
}

fn user_summary_from_raw(raw: RawUserSummary) -> GitHubUserSummary {
    GitHubUserSummary {
        id: raw.id,
        login: raw.login,
        avatar_url: raw.avatar_url,
        url: raw.html_url,
    }
}

fn contribution_summary_from_raw(user: RawContributionUser) -> GitHubContributionSummary {
    GitHubContributionSummary {
        login: user.login,
        started_at: user.collection.started_at,
        ended_at: user.collection.ended_at,
        total_contributions: user.collection.calendar.total_contributions,
        restricted_contributions: user.collection.restricted_contributions,
        has_restricted_contributions: user.collection.has_restricted_contributions,
        commits: user.collection.commits,
        issues: user.collection.issues,
        pull_requests: user.collection.pull_requests,
        pull_request_reviews: user.collection.pull_request_reviews,
        months: user
            .collection
            .calendar
            .months
            .into_iter()
            .map(|month| GitHubContributionMonth {
                first_day: month.first_day,
                name: month.name,
                total_weeks: month.total_weeks,
                year: month.year,
            })
            .collect(),
        weeks: user
            .collection
            .calendar
            .weeks
            .into_iter()
            .map(|week| GitHubContributionWeek {
                first_day: week.first_day,
                days: week.days,
            })
            .collect(),
    }
}

fn profile_activity_from_raw(raw: RawActivityEvent) -> GitHubProfileActivity {
    let resource = raw
        .payload
        .get("issue")
        .or_else(|| raw.payload.get("pull_request"))
        .or_else(|| raw.payload.get("release"))
        .or_else(|| raw.payload.get("discussion"));
    let resource_title = resource
        .and_then(|resource| {
            resource
                .get("title")
                .or_else(|| resource.get("name"))
                .or_else(|| resource.get("tag_name"))
        })
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned);
    let reference = raw
        .payload
        .get("ref")
        .and_then(serde_json::Value::as_str)
        .map(|reference| {
            reference
                .strip_prefix("refs/heads/")
                .unwrap_or(reference)
                .to_string()
        });
    let commit_count = raw
        .payload
        .get("distinct_size")
        .or_else(|| raw.payload.get("size"))
        .and_then(serde_json::Value::as_u64)
        .and_then(|count| u32::try_from(count).ok());

    GitHubProfileActivity {
        id: raw.id,
        event_type: raw.event_type,
        repository: raw.repo.name,
        action: raw
            .payload
            .get("action")
            .and_then(serde_json::Value::as_str)
            .map(ToOwned::to_owned),
        reference,
        resource_number: resource
            .and_then(|resource| resource.get("number"))
            .and_then(serde_json::Value::as_u64),
        resource_title,
        commit_count,
        created_at: raw.created_at,
    }
}

fn optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| (!value.trim().is_empty()).then_some(value))
}

pub(crate) fn normalize_user_login(username: &str) -> Result<String, AppError> {
    let username = username.trim();
    let valid = !username.is_empty()
        && username.len() <= 39
        && !username.starts_with('-')
        && !username.ends_with('-')
        && !username.contains("--")
        && username
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
    if !valid {
        return Err(AppError::Validation(
            "GitHub username is invalid".to_string(),
        ));
    }
    Ok(username.to_string())
}

fn user_profile_route(username: &str) -> String {
    format!("/users/{username}")
}

fn user_follow_route(username: &str) -> String {
    format!("/user/following/{username}")
}

fn user_follows_route(username: &str, target: &str) -> String {
    format!("/users/{username}/following/{target}")
}

fn profile_connections_route(username: &str, kind: GitHubProfileConnectionKind) -> String {
    let relationship = match kind {
        GitHubProfileConnectionKind::Followers => "followers",
        GitHubProfileConnectionKind::Following => "following",
    };
    format!("/users/{username}/{relationship}")
}

fn profile_activity_route(username: &str) -> String {
    format!("/users/{username}/events/public")
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[async_trait]
impl GitHubProfileClient for super::tests::FakeGitHubClient {
    async fn user_profile(
        &self,
        token: &str,
        username: Option<&str>,
    ) -> Result<GitHubUserProfile, AppError> {
        assert_eq!(token, "github-user-access-token");
        let login = username.unwrap_or("octocat");
        Ok(fake_profile(login))
    }

    async fn update_personal_profile(
        &self,
        token: &str,
        input: &GitHubUserProfileUpdate,
    ) -> Result<GitHubUserProfile, AppError> {
        assert_eq!(token, "github-user-access-token");
        let mut profile = fake_profile("octocat");
        profile.name = optional_text(Some(input.name.clone()));
        profile.bio = optional_text(Some(input.bio.clone()));
        profile.hireable = input.hireable;
        Ok(profile)
    }

    async fn user_contributions(
        &self,
        token: &str,
        username: &str,
    ) -> Result<GitHubContributionSummary, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubContributionSummary {
            login: username.to_string(),
            started_at: "2025-08-28T00:00:00Z".to_string(),
            ended_at: "2026-08-28T00:00:00Z".to_string(),
            total_contributions: 42,
            restricted_contributions: 3,
            has_restricted_contributions: true,
            commits: 30,
            issues: 2,
            pull_requests: 6,
            pull_request_reviews: 4,
            months: Vec::new(),
            weeks: Vec::new(),
        })
    }

    async fn list_profile_connections(
        &self,
        token: &str,
        _username: &str,
        _kind: GitHubProfileConnectionKind,
        page: u32,
    ) -> Result<GitHubUserPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubUserPage {
            users: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn list_profile_activity(
        &self,
        token: &str,
        _username: &str,
        page: u32,
    ) -> Result<GitHubProfileActivityPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubProfileActivityPage {
            activities: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn update_user_follow(
        &self,
        token: &str,
        username: &str,
        followed: bool,
    ) -> Result<GitHubUserProfile, AppError> {
        assert_eq!(token, "github-user-access-token");
        let mut profile = fake_profile(username);
        profile.viewer_follows = followed;
        Ok(profile)
    }
}

#[cfg(test)]
fn fake_profile(login: &str) -> GitHubUserProfile {
    GitHubUserProfile {
        id: 1,
        login: login.to_string(),
        avatar_url: format!("https://avatars.githubusercontent.com/{login}"),
        url: format!("https://github.com/{login}"),
        name: Some("The Octocat".to_string()),
        bio: Some("Builds useful things".to_string()),
        company: None,
        location: None,
        blog: None,
        email: None,
        twitter_username: None,
        hireable: false,
        public_repositories: 8,
        public_gists: 2,
        followers: 20,
        following: 4,
        created_at: "2008-01-14T04:33:35Z".to_string(),
        updated_at: "2026-08-28T00:00:00Z".to_string(),
        viewer_owns_profile: login.eq_ignore_ascii_case("octocat"),
        viewer_follows: false,
        follows_viewer: false,
    }
}
