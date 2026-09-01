use super::*;

use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    time::timeout,
};

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
                reaction_subject: Some(GitHubReactionSubjectRef {
                    id: comment_id.clone(),
                    kind: GitHubReactionSubjectKind::IssueComment,
                }),
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
                is_pinned: false,
                viewer_can_pin: true,
                viewer_can_unpin: false,
                viewer_can_minimize: true,
                viewer_can_unminimize: false,
                is_minimized: false,
                minimized_reason: None,
                label: None,
                assignee: None,
                milestone: None,
                rename_from: None,
                rename_to: None,
                commit_id: None,
                review_id: None,
                review_state: None,
            })),
            GitHubCommentMutation::Delete { .. } => Ok(None),
            GitHubCommentMutation::Pin {
                comment_id,
                expected_updated_at,
                ..
            }
            | GitHubCommentMutation::Unpin {
                comment_id,
                expected_updated_at,
                ..
            }
            | GitHubCommentMutation::Minimize {
                comment_id,
                expected_updated_at,
                ..
            }
            | GitHubCommentMutation::Unminimize {
                comment_id,
                expected_updated_at,
                ..
            } => Ok(Some(GitHubIssueTimelineItem {
                id: comment_id.clone(),
                reaction_subject: Some(GitHubReactionSubjectRef {
                    id: comment_id.clone(),
                    kind: GitHubReactionSubjectKind::IssueComment,
                }),
                kind: GitHubIssueTimelineKind::Comment,
                event: "commented".to_string(),
                actor: Some("octocat".to_string()),
                actor_avatar_url: None,
                author_association: Some("OWNER".to_string()),
                body: Some("Current body".to_string()),
                url: Some(
                    "https://github.com/octocat/hello-world/issues/7#issuecomment-42".to_string(),
                ),
                created_at: Some("2026-08-29T08:00:00Z".to_string()),
                updated_at: Some(expected_updated_at.clone()),
                viewer_can_update: true,
                viewer_can_delete: true,
                is_pinned: matches!(mutation, GitHubCommentMutation::Pin { .. }),
                viewer_can_pin: true,
                viewer_can_unpin: true,
                viewer_can_minimize: true,
                viewer_can_unminimize: true,
                is_minimized: matches!(mutation, GitHubCommentMutation::Minimize { .. }),
                minimized_reason: matches!(mutation, GitHubCommentMutation::Minimize { .. })
                    .then(|| "off-topic".to_string()),
                label: None,
                assignee: None,
                milestone: None,
                rename_from: None,
                rename_to: None,
                commit_id: None,
                review_id: None,
                review_state: None,
            })),
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
                viewer_can_minimize: true,
                viewer_can_unminimize: false,
                is_minimized: false,
                minimized_reason: None,
                outdated: false,
            })),
            GitHubCommentMutation::Delete { .. } => Ok(None),
            GitHubCommentMutation::Pin { .. } | GitHubCommentMutation::Unpin { .. } => Err(
                AppError::Validation("review comment pinning is unsupported".to_string()),
            ),
            GitHubCommentMutation::Minimize {
                comment_id,
                expected_updated_at,
                ..
            }
            | GitHubCommentMutation::Unminimize {
                comment_id,
                expected_updated_at,
                ..
            } => Ok(Some(GitHubPullRequestReviewThreadComment {
                id: comment_id.clone(),
                database_id: Some(92),
                author: "octocat".to_string(),
                author_avatar_url: None,
                author_association: Some("OWNER".to_string()),
                body: "Current review body".to_string(),
                url: "https://github.com/octocat/hello-world/pull/12#discussion_r92".to_string(),
                created_at: "2026-08-29T08:00:00Z".to_string(),
                updated_at: expected_updated_at.clone(),
                pending: false,
                viewer_can_update: true,
                viewer_can_delete: true,
                viewer_can_minimize: true,
                viewer_can_unminimize: true,
                is_minimized: matches!(mutation, GitHubCommentMutation::Minimize { .. }),
                minimized_reason: matches!(mutation, GitHubCommentMutation::Minimize { .. })
                    .then(|| "off-topic".to_string()),
                outdated: false,
            })),
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
        is_pinned: Some(false),
        viewer_can_pin: true,
        viewer_can_unpin: false,
        viewer_can_minimize: true,
        viewer_can_unminimize: false,
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
        viewer_can_minimize: true,
        viewer_can_unminimize: false,
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
    assert!(COMMENT_NODES_QUERY.contains("isPinned"));
    assert!(COMMENT_NODES_QUERY.contains("viewerCanPin"));
    assert!(COMMENT_NODES_QUERY.contains("viewerCanUnpin"));
    assert!(COMMENT_NODES_QUERY.contains("viewerCanMinimize"));
    assert!(COMMENT_NODES_QUERY.contains("viewerCanUnminimize"));
    assert!(COMMENT_NODES_QUERY.contains("fullDatabaseId"));
    assert!(COMMENT_NODES_QUERY.contains("pullRequest { number }"));
    assert!(UPDATE_ISSUE_COMMENT_MUTATION.contains("updateIssueComment"));
    assert!(DELETE_ISSUE_COMMENT_MUTATION.contains("deleteIssueComment"));
    assert!(PIN_ISSUE_COMMENT_MUTATION.contains("pinIssueComment"));
    assert!(UNPIN_ISSUE_COMMENT_MUTATION.contains("unpinIssueComment"));
    assert!(minimize::MINIMIZE_COMMENT_MUTATION.contains("minimizeComment"));
    assert!(minimize::MINIMIZE_COMMENT_MUTATION.contains("classifier"));
    assert!(minimize::UNMINIMIZE_COMMENT_MUTATION.contains("unminimizeComment"));
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
            "isPinned": false,
            "isMinimized": true,
            "minimizedReason": "outdated",
            "viewerCanUpdate": true,
            "viewerCanDelete": true,
            "viewerCanPin": true,
            "viewerCanUnpin": false,
            "viewerCanMinimize": true,
            "viewerCanUnminimize": false,
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
    assert_eq!(comment.minimized_reason.as_deref(), Some("outdated"));
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
    assert!(ensure_mutation_allowed(
        &update,
        "2026-08-29T08:01:00Z",
        true,
        false,
        false,
        false,
        false,
    )
    .is_ok());
    assert!(matches!(
        ensure_mutation_allowed(
            &update,
            "2026-08-29T08:02:00Z",
            true,
            false,
            false,
            false,
            false,
        ),
        Err(AppError::GitHubCommentConflict(_))
    ));
    assert!(matches!(
        ensure_mutation_allowed(
            &update,
            "2026-08-29T08:01:00Z",
            false,
            true,
            false,
            false,
            false,
        ),
        Err(AppError::GitHubPermission(_))
    ));
    assert!(ensure_requested_comment_id("IC_42", "IC_42").is_ok());
    assert!(ensure_requested_comment_id("IC_43", "IC_42").is_err());
}

#[test]
fn pin_mutations_require_the_current_pin_state_and_capability() {
    let pin = GitHubCommentMutation::Pin {
        comment_id: "IC_42".to_string(),
        expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
        expected_pinned: false,
    };
    assert!(ensure_mutation_allowed(
        &pin,
        "2026-08-29T08:01:00Z",
        false,
        false,
        false,
        true,
        false,
    )
    .is_ok());
    assert!(matches!(
        ensure_mutation_allowed(
            &pin,
            "2026-08-29T08:01:00Z",
            false,
            false,
            true,
            true,
            false,
        ),
        Err(AppError::GitHubCommentConflict(_))
    ));
    assert!(matches!(
        ensure_mutation_allowed(
            &pin,
            "2026-08-29T08:01:00Z",
            false,
            false,
            false,
            false,
            false,
        ),
        Err(AppError::GitHubPermission(_))
    ));
}

#[test]
fn minimize_mutations_require_the_current_state_and_capability() {
    let minimize = GitHubCommentMutation::Minimize {
        comment_id: "IC_42".to_string(),
        expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
        expected_minimized: false,
        classifier: GitHubCommentMinimizeClassifier::OffTopic,
    };
    assert!(ensure_mutation_allowed_with_minimize(
        &minimize,
        "2026-08-29T08:01:00Z",
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
    )
    .is_ok());
    assert!(matches!(
        ensure_mutation_allowed_with_minimize(
            &minimize,
            "2026-08-29T08:01:00Z",
            false,
            false,
            false,
            false,
            false,
            false,
            false,
            false,
        ),
        Err(AppError::GitHubPermission(_))
    ));
    assert!(matches!(
        ensure_mutation_allowed_with_minimize(
            &minimize,
            "2026-08-29T08:01:00Z",
            false,
            false,
            false,
            false,
            false,
            true,
            true,
            false,
        ),
        Err(AppError::GitHubCommentConflict(_))
    ));

    let unminimize = GitHubCommentMutation::Unminimize {
        comment_id: "IC_42".to_string(),
        expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
        expected_minimized: true,
    };
    assert!(ensure_mutation_allowed_with_minimize(
        &unminimize,
        "2026-08-29T08:01:00Z",
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        true,
    )
    .is_ok());
}

#[test]
fn minimize_classifiers_keep_graphql_and_display_names_distinct() {
    let classifiers = [
        (GitHubCommentMinimizeClassifier::Spam, "SPAM", "spam"),
        (GitHubCommentMinimizeClassifier::Abuse, "ABUSE", "abuse"),
        (
            GitHubCommentMinimizeClassifier::OffTopic,
            "OFF_TOPIC",
            "off-topic",
        ),
        (
            GitHubCommentMinimizeClassifier::Outdated,
            "OUTDATED",
            "outdated",
        ),
        (
            GitHubCommentMinimizeClassifier::Duplicate,
            "DUPLICATE",
            "duplicate",
        ),
        (
            GitHubCommentMinimizeClassifier::Resolved,
            "RESOLVED",
            "resolved",
        ),
        (
            GitHubCommentMinimizeClassifier::LowQuality,
            "LOW_QUALITY",
            "low-quality",
        ),
    ];
    for (classifier, graphql_name, response_reason) in classifiers {
        assert_eq!(classifier.graphql_name(), graphql_name);
        assert_eq!(classifier.response_reason(), response_reason);
        let mutation = GitHubCommentMutation::Minimize {
            comment_id: "IC_42".to_string(),
            expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
            expected_minimized: false,
            classifier,
        };
        assert!(ensure_minimized_result(true, Some(response_reason), &mutation).is_ok());
    }
}

#[test]
fn minimize_postflight_failures_are_classified_as_uncertain_writes() {
    let error = minimize_postflight_error(AppError::GitHubRateLimited(
        "secondary rate limit".to_string(),
    ));
    assert!(matches!(error, AppError::GitHub(message) if message.contains("may have persisted")));
}

async fn mutation_client() -> (
    octocrab::Octocrab,
    Arc<Mutex<Option<String>>>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
    let address = listener.local_addr().expect("mock address");
    let captured = Arc::new(Mutex::new(None));
    let server_captured = Arc::clone(&captured);
    let server = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.expect("mock accept");
        let mut buffer = Vec::new();
        loop {
            let mut chunk = [0_u8; 1024];
            let read = stream.read(&mut chunk).await.expect("mock read");
            if read == 0 {
                break;
            }
            buffer.extend_from_slice(&chunk[..read]);
            if let Some(header_end) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&buffer[..header_end]);
                let content_length = headers.lines().find_map(|line| {
                    line.split_once(':').and_then(|(name, value)| {
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                });
                if buffer.len() >= header_end + 4 + content_length.unwrap_or(0) {
                    break;
                }
            }
        }
        let request = String::from_utf8(buffer).expect("request utf8");
        let body = request
            .split_once("\r\n\r\n")
            .map(|(_, body)| body)
            .unwrap_or_default();
        let payload = serde_json::from_str::<serde_json::Value>(body).expect("request json");
        let client_mutation_id = payload["variables"]["clientMutationId"]
            .as_str()
            .expect("client mutation id")
            .to_string();
        *server_captured.lock().expect("request lock") = Some(request);
        let body = serde_json::json!({
            "data": { "minimizeComment": { "clientMutationId": client_mutation_id } }
        })
        .to_string();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream
            .write_all(response.as_bytes())
            .await
            .expect("mock write");
    });
    let client = octocrab::Octocrab::builder()
        .base_uri(format!("http://{address}"))
        .expect("mock base uri")
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("mock client");
    (client, captured, server)
}

#[tokio::test]
async fn minimize_mutation_sends_classifier_and_verifies_client_identity() {
    let (client, captured, server) = mutation_client().await;
    let mutation = GitHubCommentMutation::Minimize {
        comment_id: "IC_42".to_string(),
        expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
        expected_minimized: false,
        classifier: GitHubCommentMinimizeClassifier::OffTopic,
    };

    run_minimize_mutation(&client, &mutation)
        .await
        .expect("minimize mutation");
    server.await.expect("mock server");

    let request = captured
        .lock()
        .expect("request lock")
        .clone()
        .expect("request");
    let body = request.split_once("\r\n\r\n").expect("request body").1;
    let payload = serde_json::from_str::<serde_json::Value>(body).expect("request json");
    assert!(payload["query"]
        .as_str()
        .expect("mutation query")
        .contains("minimizeComment"));
    assert_eq!(payload["variables"]["id"], "IC_42");
    assert_eq!(payload["variables"]["classifier"], "OFF_TOPIC");
}

#[test]
fn mappings_keep_optional_authors_and_authoritative_capabilities() {
    let timeline = issue_timeline_item_from_graphql(issue_comment_node(None));
    assert_eq!(timeline.actor.as_deref(), Some("ghost"));
    assert!(timeline.viewer_can_update);
    assert!(timeline.viewer_can_delete);
    assert!(!timeline.is_pinned);
    assert!(timeline.viewer_can_pin);
    assert!(!timeline.viewer_can_unpin);
    assert!(timeline.viewer_can_minimize);
    assert!(!timeline.viewer_can_unminimize);

    let review = review_comment_from_graphql(review_comment_node());
    assert_eq!(review.author, "reviewer");
    assert_eq!(review.database_id, Some(92));
    assert!(!review.pending);
    assert!(review.viewer_can_update);
    assert!(review.viewer_can_delete);
    assert!(review.viewer_can_minimize);
    assert!(!review.viewer_can_unminimize);
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

#[tokio::test]
async fn issue_comment_client_does_not_retry_transport_failures() {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
    let address = listener.local_addr().expect("mock address");
    let server = tokio::spawn(async move {
        let mut request_count = 0;
        loop {
            let accepted = timeout(Duration::from_secs(2), listener.accept()).await;
            let Ok(Ok((mut stream, _))) = accepted else {
                break;
            };
            request_count += 1;
            let mut buffer = [0_u8; 4096];
            let _ = timeout(Duration::from_secs(1), stream.read(&mut buffer)).await;
            let response =
                "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            stream
                .write_all(response.as_bytes())
                .await
                .expect("mock write");
        }
        request_count
    });

    let client = issue_comment_client_with_base(
        "github-user-access-token",
        Some(&format!("http://{address}")),
    )
    .expect("no-retry client");
    let payload = serde_json::json!({
        "query": "query HarborRetryProbe { viewer { login } }",
        "variables": {},
    });
    let result: Result<serde_json::Value, _> = client.graphql(&payload).await;
    assert!(result.is_err());

    let request_count = server.await.expect("mock server");
    assert_eq!(request_count, 1);
}
