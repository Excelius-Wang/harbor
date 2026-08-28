use async_trait::async_trait;

use super::*;

#[async_trait]
impl GitHubInsightsClient for super::super::tests::FakeGitHubClient {
    async fn repository_insights_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsOverview, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubRepositoryInsightsOverview {
            community: GitHubCommunityProfile {
                health_percentage: 75,
                description: Some("A repository".to_string()),
                documentation: Some("https://example.com/docs".to_string()),
                updated_at: Some("2026-08-29T00:00:00+00:00".to_string()),
                files: vec![GitHubCommunityFile {
                    key: "readme".to_string(),
                    name: "README.md".to_string(),
                    url: Some(
                        "https://github.com/octocat/hello-world/blob/main/README.md".to_string(),
                    ),
                    present: true,
                }],
            },
            commit_activity: GitHubCommitActivity {
                status: GitHubInsightsStatisticStatus::Ready,
                weeks: vec![GitHubCommitActivityWeek {
                    week: 1_786_665_600,
                    total: 12,
                }],
            },
            code_frequency: GitHubCodeFrequency {
                status: GitHubInsightsStatisticStatus::Ready,
                weeks: vec![GitHubCodeFrequencyWeek {
                    week: 1_786_665_600,
                    additions: 140,
                    deletions: 32,
                }],
            },
        })
    }

    async fn repository_insights_contributors(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositoryInsightsContributors, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubRepositoryInsightsContributors {
            status: GitHubInsightsStatisticStatus::Ready,
            contributors: vec![GitHubInsightsContributor {
                login: Some("octocat".to_string()),
                avatar_url: Some("https://github.com/octocat.png".to_string()),
                total: 12,
                additions: 140,
                deletions: 32,
            }],
        })
    }

    async fn repository_insights_traffic(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        period: GitHubInsightsTrafficPeriod,
    ) -> Result<GitHubRepositoryInsightsTraffic, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert_eq!(period, GitHubInsightsTrafficPeriod::Day);
        Ok(GitHubRepositoryInsightsTraffic {
            period,
            views: GitHubTrafficSeries {
                count: 42,
                uniques: 21,
                points: Vec::new(),
            },
            clones: GitHubTrafficSeries {
                count: 12,
                uniques: 8,
                points: Vec::new(),
            },
            referrers: Vec::new(),
            paths: Vec::new(),
        })
    }
}

#[test]
fn insight_routes_match_github_metrics_endpoints() {
    assert_eq!(
        commit_activity_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/stats/commit_activity"
    );
    assert_eq!(
        code_frequency_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/stats/code_frequency"
    );
    assert_eq!(
        contributor_activity_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/stats/contributors"
    );
    assert_eq!(
        traffic_views_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/traffic/views"
    );
    assert_eq!(
        traffic_clones_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/traffic/clones"
    );
    assert_eq!(
        traffic_referrers_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/traffic/popular/referrers"
    );
    assert_eq!(
        traffic_paths_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/traffic/popular/paths"
    );
}

#[test]
fn code_frequency_uses_positive_display_counts() {
    let mapped = code_frequency_from_github(StatisticResponse::Ready(vec![RawCodeFrequencyWeek(
        1_786_665_600,
        140,
        -32,
    )]));
    assert_eq!(mapped.status, GitHubInsightsStatisticStatus::Ready);
    assert_eq!(
        mapped.weeks,
        vec![GitHubCodeFrequencyWeek {
            week: 1_786_665_600,
            additions: 140,
            deletions: 32,
        }]
    );
}

#[test]
fn contributor_activity_is_sorted_and_aggregated() {
    let mapped = contributors_from_github(StatisticResponse::Ready(vec![
        RawContributor {
            author: Some(RawContributorAuthor {
                login: "hubot".to_string(),
                avatar_url: None,
            }),
            total: 3,
            weeks: vec![RawContributorWeek {
                additions: 10,
                deletions: 2,
            }],
        },
        RawContributor {
            author: Some(RawContributorAuthor {
                login: "octocat".to_string(),
                avatar_url: None,
            }),
            total: 8,
            weeks: vec![RawContributorWeek {
                additions: 40,
                deletions: 7,
            }],
        },
    ]));
    assert_eq!(mapped.contributors[0].login.as_deref(), Some("octocat"));
    assert_eq!(mapped.contributors[0].additions, 40);
    assert_eq!(mapped.contributors[0].deletions, 7);
}

#[test]
fn traffic_paths_open_only_inside_the_selected_repository() {
    assert_eq!(
        repository_traffic_path_url(
            "octocat",
            "hello-world",
            "/octocat/hello-world/blob/main/README.md"
        ),
        Some("https://github.com/octocat/hello-world/blob/main/README.md".to_string())
    );
    assert_eq!(
        repository_traffic_path_url("octocat", "hello-world", "/octocat/hello-worldish"),
        None
    );
    assert_eq!(
        repository_traffic_path_url("octocat", "hello-world", "/other/repository"),
        None
    );
}

#[test]
fn building_statistics_keep_an_explicit_state() {
    let commits = commit_activity_from_github(StatisticResponse::Building);
    let contributors = contributors_from_github(StatisticResponse::Building);
    assert_eq!(commits.status, GitHubInsightsStatisticStatus::Building);
    assert!(commits.weeks.is_empty());
    assert_eq!(contributors.status, GitHubInsightsStatisticStatus::Building);
    assert!(contributors.contributors.is_empty());
}

#[test]
fn statistic_http_statuses_keep_their_documented_meaning() {
    assert!(matches!(
        statistic_response_without_body::<Vec<RawCommitActivityWeek>>(
            StatusCode::ACCEPTED,
            UnprocessableStatisticPolicy::Error,
        ),
        Some(StatisticResponse::Building)
    ));
    assert!(matches!(
        statistic_response_without_body::<Vec<RawCommitActivityWeek>>(
            StatusCode::NO_CONTENT,
            UnprocessableStatisticPolicy::Error,
        ),
        Some(StatisticResponse::Unavailable)
    ));
    assert!(matches!(
        statistic_response_without_body::<Vec<RawCodeFrequencyWeek>>(
            StatusCode::UNPROCESSABLE_ENTITY,
            UnprocessableStatisticPolicy::Unavailable,
        ),
        Some(StatisticResponse::Unavailable)
    ));
    assert!(
        statistic_response_without_body::<Vec<RawCommitActivityWeek>>(
            StatusCode::UNPROCESSABLE_ENTITY,
            UnprocessableStatisticPolicy::Error,
        )
        .is_none()
    );
}
