use super::*;

fn repository(owner: &str, is_fork: bool) -> GitHubRepository {
    GitHubRepository {
        id: 1,
        owner: owner.to_string(),
        name: "hello-world".to_string(),
        full_name: format!("{owner}/hello-world"),
        description: None,
        url: format!("https://github.com/{owner}/hello-world"),
        language: None,
        stars: 0,
        forks: 0,
        open_issues: 0,
        default_branch: "main".to_string(),
        is_private: false,
        is_fork,
        is_archived: false,
        updated_at: None,
    }
}

#[test]
fn starred_sort_uses_githubs_created_term() {
    assert_eq!(
        starred_sort_parameter(GitHubStarredRepositorySort::Starred),
        "created"
    );
    assert_eq!(
        starred_sort_parameter(GitHubStarredRepositorySort::Updated),
        "updated"
    );
}

#[test]
fn subscription_flags_map_to_distinct_watch_levels() {
    assert_eq!(
        watch_level_from_subscription(&RepositorySubscription {
            subscribed: true,
            ignored: false,
        }),
        GitHubRepositoryWatchLevel::AllActivity
    );
    assert_eq!(
        watch_level_from_subscription(&RepositorySubscription {
            subscribed: false,
            ignored: true,
        }),
        GitHubRepositoryWatchLevel::Ignored
    );
    assert_eq!(
        watch_level_from_subscription(&RepositorySubscription {
            subscribed: false,
            ignored: false,
        }),
        GitHubRepositoryWatchLevel::Participating
    );
}

#[test]
fn personal_fork_guard_requires_viewer_ownership_and_fork_identity() {
    assert!(ensure_personal_fork(&repository("Octocat", true), "octocat").is_ok());
    assert!(ensure_personal_fork(&repository("someone-else", true), "octocat").is_err());
    assert!(ensure_personal_fork(&repository("octocat", false), "octocat").is_err());
}

#[test]
fn recent_fork_detection_matches_github_cli_existing_fork_guard() {
    assert!(fork_was_created_recently(Some(1_000), 1_060));
    assert!(!fork_was_created_recently(Some(1_000), 1_061));
    assert!(fork_was_created_recently(Some(1_005), 1_000));
    assert!(!fork_was_created_recently(None, 1_000));
}

#[test]
fn relationship_routes_keep_owner_and_repository_scoped() {
    assert_eq!(
        starred_repository_route("octocat", "hello-world"),
        "/user/starred/octocat/hello-world"
    );
    assert_eq!(
        repository_subscription_route("octocat", "hello-world"),
        "/repos/octocat/hello-world/subscription"
    );
}
