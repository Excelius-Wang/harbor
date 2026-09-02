use super::*;

#[async_trait]
impl GitHubIssueClient for super::super::tests::FakeGitHubClient {
    async fn list_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubIssueFilters,
    ) -> Result<GitHubIssuePage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(owner, "octocat");
        assert_eq!(repository, "hello-world");
        assert_eq!(filters.page, 1);
        Ok(GitHubIssuePage {
            issues: vec![GitHubIssue {
                id: 2,
                reaction_subject: GitHubReactionSubjectRef {
                    id: "I_2".to_string(),
                    kind: GitHubReactionSubjectKind::Issue,
                },
                number: 7,
                title: "Keep the example focused".to_string(),
                body: Some("Issue body".to_string()),
                url: "https://github.com/octocat/hello-world/issues/7".to_string(),
                state: GitHubIssueState::Open,
                state_reason: None,
                author: "octocat".to_string(),
                author_avatar_url: Some("https://github.com/octocat.png".to_string()),
                author_association: Some("owner".to_string()),
                assignees: Vec::new(),
                labels: vec![GitHubIssueLabel {
                    name: "good first issue".to_string(),
                    color: "7057ff".to_string(),
                    description: None,
                    is_default: false,
                }],
                milestone: None,
                milestone_number: None,
                locked: false,
                comments: 2,
                closed_at: None,
                created_at: "2026-08-24T08:00:00+00:00".to_string(),
                updated_at: "2026-08-25T08:00:00+00:00".to_string(),
            }],
            total_count: 1,
            page: 1,
            has_previous: false,
            has_more: false,
        })
    }

    async fn list_issue_inbox(
        &self,
        token: &str,
        filters: &GitHubIssueInboxFilters,
    ) -> Result<GitHubIssueInboxPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        let issue = self
            .list_issues(
                token,
                "octocat",
                "hello-world",
                &GitHubIssueFilters {
                    state: filters.state,
                    assignment: GitHubIssueAssignment::All,
                    query: filters.query.clone(),
                    label: String::new(),
                    milestone: None,
                    linked_pull_request: false,
                    sort: filters.sort,
                    page: filters.page,
                    close_reason: None,
                },
            )
            .await?
            .issues
            .into_iter()
            .next()
            .expect("fake issue");
        Ok(GitHubIssueInboxPage {
            issues: vec![GitHubIssueSummary {
                issue,
                repository: GitHubIssueRepository {
                    owner: "octocat".to_string(),
                    name: "hello-world".to_string(),
                    full_name: "octocat/hello-world".to_string(),
                    url: "https://github.com/octocat/hello-world".to_string(),
                    default_branch: "HEAD".to_string(),
                },
            }],
            total_count: 1,
            page: filters.page,
            has_previous: filters.page > 1,
            has_more: false,
        })
    }

    async fn list_issue_labels(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueLabelPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubIssueLabelPage {
            labels: vec![GitHubIssueLabel {
                name: "good first issue".to_string(),
                color: "7057ff".to_string(),
                description: None,
                is_default: false,
            }],
        })
    }

    async fn list_issue_assignees(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueAssigneePage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubIssueAssigneePage {
            assignees: vec![GitHubIssueAssignee {
                login: "hubot".to_string(),
                avatar_url: Some("https://github.com/hubot.png".to_string()),
            }],
        })
    }

    async fn list_issue_milestones(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueMilestonePage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubIssueMilestonePage {
            milestones: vec![GitHubIssueMilestone {
                number: 3,
                title: "Harbor 0.2".to_string(),
                description: Some("Issue workflow parity".to_string()),
                state: "open".to_string(),
                open_issues: 4,
                closed_issues: 7,
                due_on: None,
            }],
        })
    }

    async fn issue_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        timeline_page: u32,
    ) -> Result<GitHubIssueDetailPage, AppError> {
        let page = self
            .list_issues(
                token,
                owner,
                repository,
                &GitHubIssueFilters {
                    state: GitHubIssueState::Open,
                    assignment: GitHubIssueAssignment::All,
                    query: String::new(),
                    label: String::new(),
                    milestone: None,
                    linked_pull_request: false,
                    sort: GitHubIssueSort::Updated,
                    page: 1,
                    close_reason: None,
                },
            )
            .await?;
        assert_eq!(issue_number, 7);
        Ok(GitHubIssueDetailPage {
            issue: page.issues.into_iter().next().expect("fake issue"),
            timeline: Vec::new(),
            timeline_page,
            timeline_has_previous: timeline_page > 1,
            timeline_has_more: false,
        })
    }

    async fn update_issue_metadata(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubIssue, AppError> {
        let mut issue = self
            .issue_detail(token, owner, repository, issue_number, 1)
            .await?
            .issue;
        issue.labels = labels
            .iter()
            .map(|name| GitHubIssueLabel {
                name: name.clone(),
                color: "7057ff".to_string(),
                description: None,
                is_default: false,
            })
            .collect();
        issue.assignees = assignees.to_vec();
        issue.milestone = milestone.map(|_| "Harbor 0.2".to_string());
        issue.milestone_number = milestone;
        Ok(issue)
    }
}

fn author_json(login: &str) -> serde_json::Value {
    serde_json::json!({
        "login": login,
        "id": 1,
        "node_id": "U_1",
        "avatar_url": format!("https://github.com/{login}.png"),
        "gravatar_id": "",
        "url": format!("https://api.github.com/users/{login}"),
        "html_url": format!("https://github.com/{login}"),
        "followers_url": format!("https://api.github.com/users/{login}/followers"),
        "following_url": format!("https://api.github.com/users/{login}/following{{/other_user}}"),
        "gists_url": format!("https://api.github.com/users/{login}/gists{{/gist_id}}"),
        "starred_url": format!("https://api.github.com/users/{login}/starred{{/owner}}{{/repo}}"),
        "subscriptions_url": format!("https://api.github.com/users/{login}/subscriptions"),
        "organizations_url": format!("https://api.github.com/users/{login}/orgs"),
        "repos_url": format!("https://api.github.com/users/{login}/repos"),
        "events_url": format!("https://api.github.com/users/{login}/events{{/privacy}}"),
        "received_events_url": format!("https://api.github.com/users/{login}/received_events"),
        "type": "User",
        "site_admin": false
    })
}

fn issue_json(number: u64, pull_request: bool) -> serde_json::Value {
    serde_json::json!({
        "id": number,
        "node_id": format!("I_{number}"),
        "url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}"),
        "repository_url": "https://api.github.com/repos/octocat/hello-world",
        "labels_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/labels{{/name}}"),
        "comments_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/comments"),
        "events_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/events"),
        "html_url": format!("https://github.com/octocat/hello-world/issues/{number}"),
        "number": number,
        "state": "open",
        "title": format!("Issue {number}"),
        "body": "Issue body",
        "user": author_json("octocat"),
        "labels": [{
            "id": 10,
            "node_id": "L_10",
            "url": "https://api.github.com/repos/octocat/hello-world/labels/bug",
            "name": "bug",
            "color": "d73a4a",
            "default": true
        }],
        "assignee": null,
        "assignees": [],
        "milestone": null,
        "locked": false,
        "comments": 2,
        "pull_request": pull_request.then(|| serde_json::json!({
            "url": format!("https://api.github.com/repos/octocat/hello-world/pulls/{number}"),
            "html_url": format!("https://github.com/octocat/hello-world/pull/{number}"),
            "diff_url": format!("https://github.com/octocat/hello-world/pull/{number}.diff"),
            "patch_url": format!("https://github.com/octocat/hello-world/pull/{number}.patch")
        })),
        "closed_at": null,
        "created_at": "2026-08-24T08:00:00Z",
        "updated_at": "2026-08-25T08:00:00Z"
    })
}

#[test]
fn issue_page_maps_fields_and_removes_pull_requests() {
    let issue = serde_json::from_value(issue_json(7, false)).expect("issue fixture");
    let pull_request = serde_json::from_value(issue_json(8, true)).expect("pull request fixture");

    let page = issue_page_from_octocrab(vec![issue, pull_request], 1, 2, true);

    assert!(page.has_more);
    assert!(page.has_previous);
    assert_eq!(page.total_count, 1);
    assert_eq!(page.page, 2);
    assert_eq!(page.issues.len(), 1);
    assert_eq!(page.issues[0].number, 7);
    assert_eq!(page.issues[0].state, GitHubIssueState::Open);
    assert_eq!(page.issues[0].labels[0].name, "bug");
    assert_eq!(page.issues[0].comments, 2);
}

#[test]
fn issue_state_reasons_keep_the_known_frontend_vocabulary() {
    let mut not_planned = issue_json(7, false);
    not_planned["state"] = serde_json::json!("closed");
    not_planned["state_reason"] = serde_json::json!("not_planned");
    let not_planned = issue_from_octocrab(
        serde_json::from_value(not_planned).expect("not-planned Issue fixture"),
    );

    let mut duplicate = issue_json(8, false);
    duplicate["state"] = serde_json::json!("closed");
    duplicate["state_reason"] = serde_json::json!("duplicate");
    let duplicate =
        issue_from_octocrab(serde_json::from_value(duplicate).expect("duplicate Issue fixture"));

    assert_eq!(not_planned.state_reason.as_deref(), Some("notPlanned"));
    assert_eq!(duplicate.state_reason.as_deref(), Some("duplicate"));
}

#[test]
fn issue_search_items_keep_unknown_future_state_reasons() {
    let mut value = issue_json(7, false);
    value["state"] = serde_json::json!("closed");
    value["state_reason"] = serde_json::json!("future_reason");

    let summary = issue_summary_from_search_value(value).expect("future reason search item");

    assert_eq!(summary.issue.state, GitHubIssueState::Closed);
    assert_eq!(summary.issue.state_reason.as_deref(), Some("future_reason"));
}

#[test]
fn issue_search_is_scoped_to_real_issues_and_selected_filters() {
    let filters = GitHubIssueFilters {
        state: GitHubIssueState::Closed,
        assignment: GitHubIssueAssignment::Unassigned,
        query: "render crash".to_string(),
        label: "help wanted".to_string(),
        milestone: Some("Harbor 0.2".to_string()),
        linked_pull_request: true,
        sort: GitHubIssueSort::Comments,
        page: 3,
        close_reason: None,
    };

    assert_eq!(
        issue_search_query("octocat", "hello-world", &filters),
        "render crash repo:octocat/hello-world is:issue is:closed no:assignee label:\"help wanted\" milestone:\"Harbor 0.2\" linked:pr"
    );
}

#[test]
fn issue_search_escapes_milestone_titles() {
    let filters = GitHubIssueFilters {
        state: GitHubIssueState::Open,
        assignment: GitHubIssueAssignment::All,
        query: String::new(),
        label: String::new(),
        milestone: Some("Roadmap \\\"2026\\\"".to_string()),
        linked_pull_request: false,
        sort: GitHubIssueSort::Updated,
        page: 1,
        close_reason: None,
    };

    assert_eq!(
        issue_search_query("octocat", "hello-world", &filters),
        "repo:octocat/hello-world is:issue is:open milestone:\"Roadmap \\\\\\\"2026\\\\\\\"\""
    );
}

#[test]
fn issue_search_filters_closed_issues_by_the_selected_reason() {
    let filters = GitHubIssueFilters {
        state: GitHubIssueState::Closed,
        assignment: GitHubIssueAssignment::All,
        query: String::new(),
        label: String::new(),
        milestone: None,
        linked_pull_request: false,
        sort: GitHubIssueSort::Updated,
        page: 1,
        close_reason: Some(GitHubIssueCloseReasonFilter::NotPlanned),
    };

    assert_eq!(
        issue_search_query("octocat", "hello-world", &filters),
        "repo:octocat/hello-world is:issue is:closed reason:\"not planned\""
    );
}

#[test]
fn issue_search_uses_github_reason_qualifiers_for_each_close_reason() {
    let cases = [
        (GitHubIssueCloseReasonFilter::Completed, "reason:completed"),
        (
            GitHubIssueCloseReasonFilter::NotPlanned,
            "reason:\"not planned\"",
        ),
        (GitHubIssueCloseReasonFilter::Duplicate, "reason:duplicate"),
    ];

    for (close_reason, qualifier) in cases {
        let filters = GitHubIssueFilters {
            state: GitHubIssueState::Closed,
            assignment: GitHubIssueAssignment::All,
            query: String::new(),
            label: String::new(),
            milestone: None,
            linked_pull_request: false,
            sort: GitHubIssueSort::Updated,
            page: 1,
            close_reason: Some(close_reason),
        };
        assert!(issue_search_query("octocat", "hello-world", &filters).ends_with(qualifier));
    }
}

#[test]
fn issue_search_removes_scope_changing_user_qualifiers() {
    let filters = GitHubIssueFilters {
        state: GitHubIssueState::Open,
        assignment: GitHubIssueAssignment::All,
        query: "repo:another/project crash".to_string(),
        label: String::new(),
        milestone: None,
        linked_pull_request: false,
        sort: GitHubIssueSort::Updated,
        page: 1,
        close_reason: None,
    };

    assert_eq!(
        issue_search_query("octocat", "hello-world", &filters),
        "crash repo:octocat/hello-world is:issue is:open"
    );
}

#[test]
fn issue_inbox_enforces_account_scope_and_keeps_repository_narrowing() {
    let filters = GitHubIssueInboxFilters {
        scope: GitHubIssueInboxScope::Mentioned,
        state: GitHubIssueState::Open,
        query: "author:someone -(assignee:someone) repo:octocat/hello-world label:bug render"
            .to_string(),
        sort: GitHubIssueSort::Updated,
        page: 2,
    };

    assert_eq!(
        issue_inbox_search_query(&filters),
        "repo:octocat/hello-world label:bug render is:issue is:open mentions:@me archived:false"
    );
}

#[test]
fn issue_inbox_maps_each_scope_to_github_search() {
    let query_for = |scope| {
        issue_inbox_search_query(&GitHubIssueInboxFilters {
            scope,
            state: GitHubIssueState::Closed,
            query: String::new(),
            sort: GitHubIssueSort::Created,
            page: 1,
        })
    };

    assert!(query_for(GitHubIssueInboxScope::Authored).contains("author:@me"));
    assert!(query_for(GitHubIssueInboxScope::Assigned).contains("assignee:@me"));
    assert!(query_for(GitHubIssueInboxScope::Mentioned).contains("mentions:@me"));
}

#[test]
fn issue_inbox_search_item_keeps_repository_context() {
    let summary = issue_summary_from_search_value(issue_json(7, false)).expect("issue summary");

    assert_eq!(summary.issue.number, 7);
    assert_eq!(summary.repository.owner, "octocat");
    assert_eq!(summary.repository.name, "hello-world");
    assert_eq!(summary.repository.full_name, "octocat/hello-world");
    assert_eq!(summary.repository.default_branch, "HEAD");
}

#[test]
fn issue_inbox_rejects_pull_request_search_items() {
    let error = issue_summary_from_search_value(issue_json(8, true)).expect_err("pull request");

    assert!(matches!(error, AppError::GitHub(_)));
}

#[test]
fn issue_mutations_reject_pull_request_numbers() {
    let pull_request = serde_json::from_value(issue_json(8, true)).expect("pull request");

    let error = ensure_octocrab_issue(&pull_request).expect_err("reject pull request");

    assert!(matches!(error, AppError::Validation(_)));
}
