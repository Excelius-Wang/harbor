use super::*;

#[async_trait]
impl GitHubCommentClient for super::super::tests::FakeGitHubClient {
    async fn mutate_issue_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationCommentKind,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubIssueTimelineItem>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert_eq!(number, 7);
        assert_eq!(kind, GitHubConversationCommentKind::Issue);
        match mutation {
            GitHubCommentMutation::Update {
                comment_id,
                expected_updated_at,
                body,
            } => Ok(Some(GitHubIssueTimelineItem {
                id: comment_id.clone(),
                kind: GitHubIssueTimelineKind::Comment,
                event: "commented".to_string(),
                actor: Some("octocat".to_string()),
                actor_avatar_url: None,
                author_association: Some("OWNER".to_string()),
                body: Some(body.clone()),
                url: Some(
                    "https://github.com/octocat/hello-world/issues/7#issuecomment-42".to_string(),
                ),
                created_at: Some("2026-08-29T08:00:00Z".to_string()),
                updated_at: Some(expected_updated_at.clone()),
                viewer_can_update: true,
                viewer_can_delete: true,
                is_minimized: false,
                minimized_reason: None,
                label: None,
                assignee: None,
                milestone: None,
                rename_from: None,
                rename_to: None,
                commit_id: None,
                review_state: None,
            })),
            GitHubCommentMutation::Delete { .. } => Ok(None),
        }
    }

    async fn mutate_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubPullRequestReviewThreadComment>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert_eq!(pull_request_number, 12);
        match mutation {
            GitHubCommentMutation::Update {
                comment_id,
                expected_updated_at,
                body,
            } => Ok(Some(GitHubPullRequestReviewThreadComment {
                id: comment_id.clone(),
                database_id: Some(92),
                author: "octocat".to_string(),
                author_avatar_url: None,
                author_association: Some("OWNER".to_string()),
                body: body.clone(),
                url: "https://github.com/octocat/hello-world/pull/12#discussion_r92".to_string(),
                created_at: "2026-08-29T08:00:00Z".to_string(),
                updated_at: expected_updated_at.clone(),
                pending: false,
                viewer_can_update: true,
                viewer_can_delete: true,
                is_minimized: false,
                minimized_reason: None,
                outdated: false,
            })),
            GitHubCommentMutation::Delete { .. } => Ok(None),
        }
    }
}

fn issue_comment_node(pull_request: Option<u64>) -> IssueCommentNode {
    IssueCommentNode {
        id: "IC_42".to_string(),
        body: "Current body".to_string(),
        url: "https://github.com/octocat/hello-world/issues/7#issuecomment-42".to_string(),
        created_at: "2026-08-29T08:00:00Z".to_string(),
        updated_at: "2026-08-29T08:01:00Z".to_string(),
        author_association: Some("CONTRIBUTOR".to_string()),
        is_minimized: false,
        minimized_reason: None,
        viewer_can_update: true,
        viewer_can_delete: true,
        repository: CommentRepository {
            id: "R_1".to_string(),
        },
        issue: CommentParent { number: 7 },
        pull_request: pull_request.map(|number| CommentParent { number }),
        author: None,
    }
}

fn review_comment_node() -> PullRequestReviewCommentNode {
    PullRequestReviewCommentNode {
        id: "PRRC_92".to_string(),
        full_database_id: Some("92".to_string()),
        body: "Current review body".to_string(),
        url: "https://github.com/octocat/hello-world/pull/12#discussion_r92".to_string(),
        created_at: "2026-08-29T08:00:00Z".to_string(),
        updated_at: "2026-08-29T08:01:00Z".to_string(),
        author_association: Some("MEMBER".to_string()),
        is_minimized: false,
        minimized_reason: None,
        outdated: false,
        viewer_can_update: true,
        viewer_can_delete: true,
        state: "SUBMITTED".to_string(),
        repository: CommentRepository {
            id: "R_1".to_string(),
        },
        pull_request: CommentParent { number: 12 },
        author: Some(CommentActor {
            login: "reviewer".to_string(),
            avatar_url: None,
        }),
    }
}

#[test]
fn comment_queries_use_current_graphql_contracts() {
    assert!(COMMENT_NODES_QUERY.contains("nodes(ids: $ids)"));
    assert!(COMMENT_NODES_QUERY.contains("viewerCanUpdate"));
    assert!(COMMENT_NODES_QUERY.contains("viewerCanDelete"));
    assert!(COMMENT_NODES_QUERY.contains("fullDatabaseId"));
    assert!(COMMENT_NODES_QUERY.contains("pullRequest { number }"));
    assert!(UPDATE_ISSUE_COMMENT_MUTATION.contains("updateIssueComment"));
    assert!(DELETE_ISSUE_COMMENT_MUTATION.contains("deleteIssueComment"));
    assert!(UPDATE_REVIEW_COMMENT_MUTATION.contains("pullRequestReviewCommentId: $id"));
    assert!(DELETE_REVIEW_COMMENT_MUTATION.contains("deletePullRequestReviewComment"));
}

#[test]
fn comment_node_query_deserializes_the_live_typename_shape() {
    let response: CommentNodesQuery = serde_json::from_value(serde_json::json!({
        "repository": { "id": "R_1" },
        "nodes": [{
            "__typename": "IssueComment",
            "id": "IC_42",
            "body": "Current body",
            "url": "https://github.com/octocat/hello-world/issues/7#issuecomment-42",
            "createdAt": "2026-08-29T08:00:00Z",
            "updatedAt": "2026-08-29T08:01:00Z",
            "authorAssociation": "CONTRIBUTOR",
            "isMinimized": true,
            "minimizedReason": "OUTDATED",
            "viewerCanUpdate": true,
            "viewerCanDelete": true,
            "repository": { "id": "R_1" },
            "issue": { "number": 7 },
            "pullRequest": null,
            "author": null
        }]
    }))
    .expect("comment node response");

    let CommentNode::IssueComment(comment) = response.nodes[0].as_ref().expect("comment") else {
        panic!("IssueComment node");
    };
    assert_eq!(comment.id, "IC_42");
    assert!(comment.is_minimized);
    assert_eq!(comment.minimized_reason.as_deref(), Some("OUTDATED"));
}

#[test]
fn issue_and_pull_request_conversation_comments_are_discriminated() {
    assert!(validate_issue_comment_node(
        issue_comment_node(None),
        "R_1",
        7,
        GitHubConversationCommentKind::Issue,
    )
    .is_ok());
    assert!(validate_issue_comment_node(
        issue_comment_node(Some(7)),
        "R_1",
        7,
        GitHubConversationCommentKind::PullRequest,
    )
    .is_ok());
    assert!(validate_issue_comment_node(
        issue_comment_node(Some(7)),
        "R_1",
        7,
        GitHubConversationCommentKind::Issue,
    )
    .is_err());
    assert!(validate_issue_comment_node(
        issue_comment_node(None),
        "R_2",
        7,
        GitHubConversationCommentKind::Issue,
    )
    .is_err());
}

#[test]
fn review_comments_require_the_selected_repository_and_pull_request() {
    assert!(validate_review_comment_node(review_comment_node(), "R_1", 12).is_ok());
    assert!(validate_review_comment_node(review_comment_node(), "R_2", 12).is_err());
    assert!(validate_review_comment_node(review_comment_node(), "R_1", 13).is_err());
}

#[test]
fn mutations_require_capability_and_the_displayed_revision() {
    let update = GitHubCommentMutation::Update {
        comment_id: "IC_42".to_string(),
        expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
        body: "Updated".to_string(),
    };
    assert!(ensure_mutation_allowed(&update, "2026-08-29T08:01:00Z", true, false).is_ok());
    assert!(matches!(
        ensure_mutation_allowed(&update, "2026-08-29T08:02:00Z", true, false),
        Err(AppError::GitHubCommentConflict(_))
    ));
    assert!(matches!(
        ensure_mutation_allowed(&update, "2026-08-29T08:01:00Z", false, true),
        Err(AppError::GitHubPermission(_))
    ));
    assert!(ensure_requested_comment_id("IC_42", "IC_42").is_ok());
    assert!(ensure_requested_comment_id("IC_43", "IC_42").is_err());
}

#[test]
fn mappings_keep_optional_authors_and_authoritative_capabilities() {
    let timeline = issue_timeline_item_from_graphql(issue_comment_node(None));
    assert_eq!(timeline.actor.as_deref(), Some("ghost"));
    assert!(timeline.viewer_can_update);
    assert!(timeline.viewer_can_delete);

    let review = review_comment_from_graphql(review_comment_node());
    assert_eq!(review.author, "reviewer");
    assert_eq!(review.database_id, Some(92));
    assert!(!review.pending);
    assert!(review.viewer_can_update);
    assert!(review.viewer_can_delete);
}

#[test]
fn graphql_mutation_payloads_remain_nullable() {
    let update: UpdateIssueCommentMutation = serde_json::from_value(serde_json::json!({
        "updateIssueComment": null
    }))
    .expect("nullable update payload");
    assert!(update.update_issue_comment.is_none());

    let deletion: DeleteReviewCommentMutation = serde_json::from_value(serde_json::json!({
        "deletePullRequestReviewComment": null
    }))
    .expect("nullable delete payload");
    assert!(deletion.delete_pull_request_review_comment.is_none());
}

#[test]
fn client_mutation_ids_are_unique_and_echo_verifiable() {
    let first = mutation_identity("update-issue-comment");
    let second = mutation_identity("update-issue-comment");

    assert_ne!(first, second);
    assert!(first.starts_with("harbor:update-issue-comment:"));
    assert!(ensure_mutation_identity(Some(first.as_str()), &first).is_ok());
    assert!(ensure_mutation_identity(Some(second.as_str()), &first).is_err());
}
