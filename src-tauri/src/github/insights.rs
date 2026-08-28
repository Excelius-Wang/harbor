use async_trait::async_trait;
use http::StatusCode;
use http_body_util::BodyExt;
use serde::{de::DeserializeOwned, Deserialize, Serialize};

use crate::error::AppError;

use super::{authenticated_client, github_error, GitHubService, OctocrabGitHubClient};

#[cfg(test)]
mod tests;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubInsightsTrafficPeriod {
    Day,
    Week,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubInsightsStatisticStatus {
    Ready,
    Building,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommunityFile {
    pub key: String,
    pub name: String,
    pub url: Option<String>,
    pub present: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommunityProfile {
    pub health_percentage: u64,
    pub description: Option<String>,
    pub documentation: Option<String>,
    pub updated_at: Option<String>,
    pub files: Vec<GitHubCommunityFile>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitActivityWeek {
    pub week: i64,
    pub total: u64,
    pub days: Vec<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitActivity {
    pub status: GitHubInsightsStatisticStatus,
    pub weeks: Vec<GitHubCommitActivityWeek>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeFrequencyWeek {
    pub week: i64,
    pub additions: u64,
    pub deletions: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeFrequency {
    pub status: GitHubInsightsStatisticStatus,
    pub weeks: Vec<GitHubCodeFrequencyWeek>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryInsightsOverview {
    pub community: GitHubCommunityProfile,
    pub commit_activity: GitHubCommitActivity,
    pub code_frequency: GitHubCodeFrequency,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContributorWeek {
    pub week: i64,
    pub additions: u64,
    pub deletions: u64,
    pub commits: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubInsightsContributor {
    pub login: Option<String>,
    pub avatar_url: Option<String>,
    pub total: u64,
    pub additions: u64,
    pub deletions: u64,
    pub weeks: Vec<GitHubContributorWeek>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryInsightsContributors {
    pub status: GitHubInsightsStatisticStatus,
    pub contributors: Vec<GitHubInsightsContributor>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrafficPoint {
    pub timestamp: String,
    pub count: u64,
    pub uniques: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrafficSeries {
    pub count: u64,
    pub uniques: u64,
    pub points: Vec<GitHubTrafficPoint>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrafficReferrer {
    pub referrer: String,
    pub count: u64,
    pub uniques: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTrafficPath {
    pub path: String,
    pub title: String,
    pub url: Option<String>,
    pub count: u64,
    pub uniques: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryInsightsTraffic {
    pub period: GitHubInsightsTrafficPeriod,
    pub views: GitHubTrafficSeries,
    pub clones: GitHubTrafficSeries,
    pub referrers: Vec<GitHubTrafficReferrer>,
    pub paths: Vec<GitHubTrafficPath>,
}

#[async_trait]
pub(crate) trait GitHubInsightsClient: Send + Sync {
    async fn repository_insights_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsOverview, AppError>;

    async fn repository_insights_contributors(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsContributors, AppError>;

    async fn repository_insights_traffic(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        period: GitHubInsightsTrafficPeriod,
    ) -> Result<GitHubRepositoryInsightsTraffic, AppError>;
}

impl GitHubService {
    pub async fn repository_insights_overview(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsOverview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_insights_overview(&token, owner, repository)
            .await
    }

    pub async fn repository_insights_contributors(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsContributors, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_insights_contributors(&token, owner, repository)
            .await
    }

    pub async fn repository_insights_traffic(
        &self,
        owner: &str,
        repository: &str,
        period: GitHubInsightsTrafficPeriod,
    ) -> Result<GitHubRepositoryInsightsTraffic, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_insights_traffic(&token, owner, repository, period)
            .await
    }
}

#[async_trait]
impl GitHubInsightsClient for OctocrabGitHubClient {
    async fn repository_insights_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsOverview, AppError> {
        let client = authenticated_client(token)?;
        let repository_handler = client.repos(owner, repository);
        let commit_activity_route = commit_activity_route(owner, repository);
        let code_frequency_route = code_frequency_route(owner, repository);
        let (community, commit_activity, code_frequency) = tokio::join!(
            repository_handler.get_community_profile_metrics(),
            fetch_statistic::<Vec<RawCommitActivityWeek>>(&client, &commit_activity_route, false),
            fetch_statistic::<Vec<RawCodeFrequencyWeek>>(&client, &code_frequency_route, true),
        );

        Ok(GitHubRepositoryInsightsOverview {
            community: community_profile_from_octocrab(community.map_err(github_error)?),
            commit_activity: commit_activity_from_github(commit_activity?),
            code_frequency: code_frequency_from_github(code_frequency?),
        })
    }

    async fn repository_insights_contributors(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsContributors, AppError> {
        let client = authenticated_client(token)?;
        let statistic = fetch_statistic::<Vec<RawContributor>>(
            &client,
            &contributor_activity_route(owner, repository),
            false,
        )
        .await?;
        Ok(contributors_from_github(statistic))
    }

    async fn repository_insights_traffic(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        period: GitHubInsightsTrafficPeriod,
    ) -> Result<GitHubRepositoryInsightsTraffic, AppError> {
        let client = authenticated_client(token)?;
        let parameters = TrafficParameters {
            per: traffic_period_parameter(period),
        };
        let views_route = traffic_views_route(owner, repository);
        let clones_route = traffic_clones_route(owner, repository);
        let referrers_route = traffic_referrers_route(owner, repository);
        let paths_route = traffic_paths_route(owner, repository);
        let (views, clones, referrers, paths) = tokio::join!(
            client.get::<RawTrafficViews, _, _>(&views_route, Some(&parameters)),
            client.get::<RawTrafficClones, _, _>(&clones_route, Some(&parameters)),
            client.get::<Vec<RawTrafficReferrer>, _, _>(&referrers_route, None::<&()>),
            client.get::<Vec<RawTrafficPath>, _, _>(&paths_route, None::<&()>),
        );
        let views = views.map_err(github_error)?;
        let clones = clones.map_err(github_error)?;

        Ok(GitHubRepositoryInsightsTraffic {
            period,
            views: traffic_series_from_github(views.count, views.uniques, views.views),
            clones: traffic_series_from_github(clones.count, clones.uniques, clones.clones),
            referrers: referrers
                .map_err(github_error)?
                .into_iter()
                .map(|referrer| GitHubTrafficReferrer {
                    referrer: referrer.referrer,
                    count: referrer.count,
                    uniques: referrer.uniques,
                })
                .collect(),
            paths: paths
                .map_err(github_error)?
                .into_iter()
                .map(|path| GitHubTrafficPath {
                    url: repository_traffic_path_url(owner, repository, &path.path),
                    path: path.path,
                    title: path.title,
                    count: path.count,
                    uniques: path.uniques,
                })
                .collect(),
        })
    }
}

#[derive(Serialize)]
struct TrafficParameters {
    per: &'static str,
}

#[derive(Debug, Deserialize)]
struct RawCommitActivityWeek {
    week: i64,
    total: u64,
    days: Vec<u64>,
}

#[derive(Debug, Deserialize)]
struct RawCodeFrequencyWeek(i64, i64, i64);

#[derive(Debug, Deserialize)]
struct RawContributor {
    author: Option<RawContributorAuthor>,
    total: u64,
    weeks: Vec<RawContributorWeek>,
}

#[derive(Debug, Deserialize)]
struct RawContributorAuthor {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawContributorWeek {
    #[serde(rename = "w")]
    week: i64,
    #[serde(rename = "a")]
    additions: u64,
    #[serde(rename = "d")]
    deletions: u64,
    #[serde(rename = "c")]
    commits: u64,
}

#[derive(Debug, Deserialize)]
struct RawTrafficPoint {
    timestamp: String,
    count: u64,
    uniques: u64,
}

#[derive(Debug, Deserialize)]
struct RawTrafficViews {
    count: u64,
    uniques: u64,
    views: Vec<RawTrafficPoint>,
}

#[derive(Debug, Deserialize)]
struct RawTrafficClones {
    count: u64,
    uniques: u64,
    clones: Vec<RawTrafficPoint>,
}

#[derive(Debug, Deserialize)]
struct RawTrafficReferrer {
    referrer: String,
    count: u64,
    uniques: u64,
}

#[derive(Debug, Deserialize)]
struct RawTrafficPath {
    path: String,
    title: String,
    count: u64,
    uniques: u64,
}

enum StatisticResponse<T> {
    Ready(T),
    Building,
    Unavailable,
}

async fn fetch_statistic<T: DeserializeOwned>(
    client: &octocrab::Octocrab,
    route: &str,
    unavailable_on_unprocessable: bool,
) -> Result<StatisticResponse<T>, AppError> {
    let uri = route
        .parse::<http::Uri>()
        .map_err(|error| AppError::GitHub(error.to_string()))?;
    let response = client._get(uri).await.map_err(github_error)?;
    match response.status() {
        StatusCode::ACCEPTED => Ok(StatisticResponse::Building),
        StatusCode::NO_CONTENT => Ok(StatisticResponse::Unavailable),
        StatusCode::UNPROCESSABLE_ENTITY if unavailable_on_unprocessable => {
            Ok(StatisticResponse::Unavailable)
        }
        StatusCode::OK => {
            let bytes = response
                .into_body()
                .collect()
                .await
                .map_err(github_error)?
                .to_bytes();
            let value = serde_json::from_slice(&bytes)
                .map_err(|error| AppError::GitHub(error.to_string()))?;
            Ok(StatisticResponse::Ready(value))
        }
        status => {
            octocrab::map_github_error(response)
                .await
                .map_err(github_error)?;
            Err(AppError::GitHub(format!(
                "GitHub returned unexpected repository statistics status {status}"
            )))
        }
    }
}

fn community_profile_from_octocrab(
    metrics: octocrab::models::RepositoryMetrics,
) -> GitHubCommunityProfile {
    let mut files = metrics
        .files
        .into_iter()
        .map(|(key, file)| {
            let present = file.is_some();
            let (name, url) = file
                .map(|file| {
                    (
                        file.name.or(file.key).unwrap_or_else(|| key.clone()),
                        file.html_url.or(file.url).map(|url| url.to_string()),
                    )
                })
                .unwrap_or_else(|| (key.clone(), None));
            GitHubCommunityFile {
                key,
                name,
                url,
                present,
            }
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|file| community_file_sort_key(&file.key));

    GitHubCommunityProfile {
        health_percentage: metrics.health_percentage.min(100),
        description: metrics.description,
        documentation: metrics.documentation,
        updated_at: metrics.updated_at.map(|updated| updated.to_rfc3339()),
        files,
    }
}

fn community_file_sort_key(key: &str) -> (u8, String) {
    let rank = match key {
        "readme" => 0,
        "code_of_conduct" => 1,
        "contributing" => 2,
        "license" => 3,
        "issue_template" => 4,
        "pull_request_template" => 5,
        _ => 6,
    };
    (rank, key.to_string())
}

fn commit_activity_from_github(
    response: StatisticResponse<Vec<RawCommitActivityWeek>>,
) -> GitHubCommitActivity {
    match response {
        StatisticResponse::Ready(weeks) => GitHubCommitActivity {
            status: GitHubInsightsStatisticStatus::Ready,
            weeks: weeks
                .into_iter()
                .map(|week| GitHubCommitActivityWeek {
                    week: week.week,
                    total: week.total,
                    days: week.days,
                })
                .collect(),
        },
        StatisticResponse::Building => GitHubCommitActivity {
            status: GitHubInsightsStatisticStatus::Building,
            weeks: Vec::new(),
        },
        StatisticResponse::Unavailable => GitHubCommitActivity {
            status: GitHubInsightsStatisticStatus::Unavailable,
            weeks: Vec::new(),
        },
    }
}

fn code_frequency_from_github(
    response: StatisticResponse<Vec<RawCodeFrequencyWeek>>,
) -> GitHubCodeFrequency {
    match response {
        StatisticResponse::Ready(weeks) => GitHubCodeFrequency {
            status: GitHubInsightsStatisticStatus::Ready,
            weeks: weeks
                .into_iter()
                .map(
                    |RawCodeFrequencyWeek(week, additions, deletions)| GitHubCodeFrequencyWeek {
                        week,
                        additions: additions.unsigned_abs(),
                        deletions: deletions.unsigned_abs(),
                    },
                )
                .collect(),
        },
        StatisticResponse::Building => GitHubCodeFrequency {
            status: GitHubInsightsStatisticStatus::Building,
            weeks: Vec::new(),
        },
        StatisticResponse::Unavailable => GitHubCodeFrequency {
            status: GitHubInsightsStatisticStatus::Unavailable,
            weeks: Vec::new(),
        },
    }
}

fn contributors_from_github(
    response: StatisticResponse<Vec<RawContributor>>,
) -> GitHubRepositoryInsightsContributors {
    match response {
        StatisticResponse::Ready(contributors) => {
            let mut contributors = contributors
                .into_iter()
                .map(|contributor| {
                    let additions = contributor.weeks.iter().map(|week| week.additions).sum();
                    let deletions = contributor.weeks.iter().map(|week| week.deletions).sum();
                    GitHubInsightsContributor {
                        login: contributor
                            .author
                            .as_ref()
                            .map(|author| author.login.clone()),
                        avatar_url: contributor.author.and_then(|author| author.avatar_url),
                        total: contributor.total,
                        additions,
                        deletions,
                        weeks: contributor
                            .weeks
                            .into_iter()
                            .map(|week| GitHubContributorWeek {
                                week: week.week,
                                additions: week.additions,
                                deletions: week.deletions,
                                commits: week.commits,
                            })
                            .collect(),
                    }
                })
                .collect::<Vec<_>>();
            contributors.sort_by(|left, right| {
                right.total.cmp(&left.total).then_with(|| {
                    left.login
                        .as_deref()
                        .unwrap_or_default()
                        .cmp(right.login.as_deref().unwrap_or_default())
                })
            });
            GitHubRepositoryInsightsContributors {
                status: GitHubInsightsStatisticStatus::Ready,
                contributors,
            }
        }
        StatisticResponse::Building => GitHubRepositoryInsightsContributors {
            status: GitHubInsightsStatisticStatus::Building,
            contributors: Vec::new(),
        },
        StatisticResponse::Unavailable => GitHubRepositoryInsightsContributors {
            status: GitHubInsightsStatisticStatus::Unavailable,
            contributors: Vec::new(),
        },
    }
}

fn traffic_series_from_github(
    count: u64,
    uniques: u64,
    points: Vec<RawTrafficPoint>,
) -> GitHubTrafficSeries {
    GitHubTrafficSeries {
        count,
        uniques,
        points: points
            .into_iter()
            .map(|point| GitHubTrafficPoint {
                timestamp: point.timestamp,
                count: point.count,
                uniques: point.uniques,
            })
            .collect(),
    }
}

fn traffic_period_parameter(period: GitHubInsightsTrafficPeriod) -> &'static str {
    match period {
        GitHubInsightsTrafficPeriod::Day => "day",
        GitHubInsightsTrafficPeriod::Week => "week",
    }
}

fn repository_traffic_path_url(owner: &str, repository: &str, path: &str) -> Option<String> {
    let prefix = format!("/{owner}/{repository}");
    path.get(..prefix.len())
        .filter(|candidate| candidate.eq_ignore_ascii_case(&prefix))
        .filter(|_| {
            path.len() == prefix.len() || path.as_bytes().get(prefix.len()).copied() == Some(b'/')
        })
        .map(|_| format!("https://github.com{path}"))
}

fn commit_activity_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/stats/commit_activity")
}

fn code_frequency_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/stats/code_frequency")
}

fn contributor_activity_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/stats/contributors")
}

fn traffic_views_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/traffic/views")
}

fn traffic_clones_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/traffic/clones")
}

fn traffic_referrers_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/traffic/popular/referrers")
}

fn traffic_paths_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/traffic/popular/paths")
}
