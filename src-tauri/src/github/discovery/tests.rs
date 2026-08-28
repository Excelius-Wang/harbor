use super::*;

#[test]
fn discovery_routes_follow_githubs_search_endpoints() {
    assert_eq!(
        discovery_search_route(GitHubDiscoverySearchKind::Repositories),
        "/search/repositories"
    );
    assert_eq!(
        discovery_search_route(GitHubDiscoverySearchKind::Code),
        "/search/code"
    );
    assert_eq!(
        discovery_search_route(GitHubDiscoverySearchKind::Issues),
        "/search/issues"
    );
    assert_eq!(
        discovery_search_route(GitHubDiscoverySearchKind::PullRequests),
        "/search/issues"
    );
    assert_eq!(
        discovery_search_route(GitHubDiscoverySearchKind::Users),
        "/search/users"
    );
    assert_eq!(
        developer_feed_route("octocat"),
        "/users/octocat/received_events"
    );
}

#[test]
fn search_query_preserves_github_syntax_but_owns_the_result_type() {
    assert_eq!(
        discovery_search_query(
            GitHubDiscoverySearchKind::Issues,
            "render label:bug is:pr state:open"
        ),
        "render label:bug state:open is:issue"
    );
    assert_eq!(
        discovery_search_query(
            GitHubDiscoverySearchKind::PullRequests,
            "render type:issue review:required"
        ),
        "render review:required is:pr"
    );
    assert_eq!(
        discovery_search_query(GitHubDiscoverySearchKind::Users, "mona type:org"),
        "mona type:user"
    );
    assert_eq!(
        discovery_search_query(
            GitHubDiscoverySearchKind::Repositories,
            "harbor language:rust stars:>100"
        ),
        "harbor language:rust stars:>100"
    );
}

#[test]
fn search_sort_rejects_cross_kind_values() {
    assert_eq!(
        discovery_search_sort(
            GitHubDiscoverySearchKind::Repositories,
            GitHubDiscoverySearchSort::Stars
        )
        .expect("repository sort"),
        Some("stars")
    );
    assert_eq!(
        discovery_search_sort(
            GitHubDiscoverySearchKind::Code,
            GitHubDiscoverySearchSort::BestMatch
        )
        .expect("best match"),
        None
    );
    assert!(discovery_search_sort(
        GitHubDiscoverySearchKind::Users,
        GitHubDiscoverySearchSort::Comments
    )
    .is_err());
}

#[test]
fn search_pages_stop_at_githubs_one_thousand_result_boundary() {
    let response = SearchResponse::<()> {
        total_count: 12_000,
        incomplete_results: true,
        items: Vec::new(),
    };
    let page_33 = search_page_metadata(&response, 33);
    let page_34 = search_page_metadata(&response, 34);
    assert!(page_33.has_more);
    assert!(!page_34.has_more);
    assert!(page_34.incomplete_results);
    assert_eq!(page_34.total_count, 12_000);
}

#[test]
fn developer_feed_mapping_keeps_actor_repository_and_resource_context() {
    let event = developer_feed_event_from_raw(RawFeedEvent {
        id: "event-1".to_string(),
        event_type: "PullRequestEvent".to_string(),
        actor: RawFeedActor {
            id: 7,
            login: "hubot".to_string(),
            avatar_url: "https://avatars.githubusercontent.com/u/7".to_string(),
        },
        repo: RawFeedRepository {
            id: 42,
            name: "octocat/harbor".to_string(),
        },
        payload: serde_json::json!({
            "action": "opened",
            "ref": "refs/heads/search",
            "pull_request": { "number": 18, "title": "Add global search" }
        }),
        public: true,
        created_at: "2026-08-29T10:00:00Z".to_string(),
    })
    .expect("feed event");

    assert_eq!(event.actor.login, "hubot");
    assert_eq!(event.repository.full_name, "octocat/harbor");
    assert_eq!(event.action.as_deref(), Some("opened"));
    assert_eq!(event.reference.as_deref(), Some("search"));
    assert_eq!(event.resource_number, Some(18));
    assert_eq!(event.resource_title.as_deref(), Some("Add global search"));
}

#[test]
fn personal_user_results_reject_organizations() {
    assert!(user_summary_from_search(RawUserSearchItem {
        id: 1,
        login: "octocat".to_string(),
        avatar_url: "https://avatars.githubusercontent.com/u/1".to_string(),
        html_url: "https://github.com/octocat".to_string(),
        account_type: "User".to_string(),
    })
    .is_ok());
    assert!(user_summary_from_search(RawUserSearchItem {
        id: 2,
        login: "github".to_string(),
        avatar_url: "https://avatars.githubusercontent.com/u/2".to_string(),
        html_url: "https://github.com/github".to_string(),
        account_type: "Organization".to_string(),
    })
    .is_err());
}

#[test]
fn discovery_queries_are_bounded_and_single_line() {
    assert_eq!(
        normalize_discovery_query("  language:rust harbor  ").expect("query"),
        "language:rust harbor"
    );
    assert!(normalize_discovery_query(" ").is_err());
    assert!(normalize_discovery_query("harbor\nrepo:other/project").is_err());
    assert!(normalize_discovery_query(&"x".repeat(1_025)).is_err());
}
