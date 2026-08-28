use super::*;

fn raw_profile(account_type: &str) -> RawUserProfile {
    RawUserProfile {
        id: 1,
        login: "OctoCat".to_string(),
        avatar_url: "https://avatars.githubusercontent.com/u/1".to_string(),
        html_url: "https://github.com/octocat".to_string(),
        name: Some("The Octocat".to_string()),
        bio: Some("Builds useful things".to_string()),
        company: Some(String::new()),
        location: Some("San Francisco".to_string()),
        blog: Some("https://github.blog".to_string()),
        email: None,
        twitter_username: Some("monatheoctocat".to_string()),
        hireable: Some(true),
        public_repos: 8,
        public_gists: 2,
        followers: 20,
        following: 4,
        created_at: "2008-01-14T04:33:35Z".to_string(),
        updated_at: "2026-08-28T00:00:00Z".to_string(),
        account_type: account_type.to_string(),
    }
}

#[test]
fn profile_routes_are_user_scoped_and_keep_relationships_distinct() {
    assert_eq!(user_profile_route("octocat"), "/users/octocat");
    assert_eq!(user_follow_route("octocat"), "/user/following/octocat");
    assert_eq!(
        user_follows_route("octocat", "hubot"),
        "/users/octocat/following/hubot"
    );
    assert_eq!(
        profile_connections_route("octocat", GitHubProfileConnectionKind::Followers),
        "/users/octocat/followers"
    );
    assert_eq!(
        profile_connections_route("octocat", GitHubProfileConnectionKind::Following),
        "/users/octocat/following"
    );
    assert_eq!(
        profile_activity_route("octocat"),
        "/users/octocat/events/public"
    );
}

#[test]
fn profile_mapping_preserves_public_fields_and_relationship_state() {
    let profile = user_profile_from_raw(raw_profile("User"), false, true, true);
    assert_eq!(profile.login, "OctoCat");
    assert_eq!(profile.company, None);
    assert_eq!(profile.public_repositories, 8);
    assert!(profile.hireable);
    assert!(!profile.viewer_owns_profile);
    assert!(profile.viewer_follows);
    assert!(profile.follows_viewer);
}

#[test]
fn organization_profiles_are_rejected_from_the_personal_surface() {
    assert!(ensure_personal_user(&raw_profile("User")).is_ok());
    assert!(ensure_personal_user(&raw_profile("Bot")).is_ok());
    assert!(ensure_personal_user(&raw_profile("Organization")).is_err());
}

#[test]
fn github_usernames_are_normalized_without_accepting_route_segments() {
    assert_eq!(normalize_user_login(" Octo-Cat ").unwrap(), "Octo-Cat");
    for invalid in [
        "",
        "-octocat",
        "octocat-",
        "octo--cat",
        "octo/cat",
        "octo_cat",
    ] {
        assert!(normalize_user_login(invalid).is_err(), "{invalid}");
    }
}

#[test]
fn activity_mapping_keeps_known_payload_context_without_binding_to_event_types() {
    let activity = profile_activity_from_raw(RawActivityEvent {
        id: "event-1".to_string(),
        event_type: "PullRequestEvent".to_string(),
        repo: RawActivityRepository {
            name: "octocat/hello-world".to_string(),
        },
        payload: serde_json::json!({
            "action": "opened",
            "ref": "refs/heads/profile-work",
            "pull_request": { "number": 42, "title": "Add profile workspace" }
        }),
        created_at: "2026-08-28T12:00:00Z".to_string(),
    });
    assert_eq!(activity.event_type, "PullRequestEvent");
    assert_eq!(activity.action.as_deref(), Some("opened"));
    assert_eq!(activity.reference.as_deref(), Some("profile-work"));
    assert_eq!(activity.resource_number, Some(42));
    assert_eq!(
        activity.resource_title.as_deref(),
        Some("Add profile workspace")
    );
}

#[test]
fn contribution_mapping_keeps_calendar_counts_and_private_summary() {
    let summary = contribution_summary_from_raw(RawContributionUser {
        login: "octocat".to_string(),
        collection: RawContributionCollection {
            started_at: "2025-08-28T00:00:00Z".to_string(),
            ended_at: "2026-08-28T00:00:00Z".to_string(),
            restricted_contributions: 7,
            has_restricted_contributions: true,
            commits: 30,
            issues: 2,
            pull_requests: 6,
            pull_request_reviews: 4,
            calendar: RawContributionCalendar {
                total_contributions: 42,
                months: vec![RawContributionMonth {
                    first_day: "2026-08-01".to_string(),
                    name: "August".to_string(),
                    total_weeks: 5,
                    year: 2026,
                }],
                weeks: vec![RawContributionWeek {
                    first_day: "2026-08-23".to_string(),
                    days: vec![GitHubContributionDay {
                        color: "#216e39".to_string(),
                        contribution_count: 4,
                        contribution_level: GitHubContributionLevel::ThirdQuartile,
                        date: "2026-08-28".to_string(),
                        weekday: 5,
                    }],
                }],
            },
        },
    });
    assert_eq!(summary.total_contributions, 42);
    assert_eq!(summary.restricted_contributions, 7);
    assert_eq!(summary.months.len(), 1);
    assert_eq!(summary.weeks[0].days[0].contribution_count, 4);
}
