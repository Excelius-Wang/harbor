use super::*;

fn category() -> GitHubDiscussionCategory {
    GitHubDiscussionCategory {
        id: "DC_kwDOA".to_string(),
        name: "Q&A".to_string(),
        slug: "q-a".to_string(),
        description: Some("Ask the community".to_string()),
        emoji: ":pray:".to_string(),
        is_answerable: true,
    }
}

fn discussion(state: GitHubDiscussionState) -> GitHubDiscussionSummary {
    GitHubDiscussionSummary {
        id: "D_kwDOB".to_string(),
        number: 42,
        title: "How should Harbor present Discussions?".to_string(),
        body: "Keep the complete workflow in the desktop app.".to_string(),
        url: "https://github.com/octocat/hello-world/discussions/42".to_string(),
        state,
        state_reason: (state == GitHubDiscussionState::Closed).then(|| "RESOLVED".to_string()),
        locked: false,
        author: Some("octocat".to_string()),
        author_avatar_url: Some("https://github.com/octocat.png".to_string()),
        author_association: "OWNER".to_string(),
        category: category(),
        answer_id: None,
        answer_chosen_at: None,
        answer_chosen_by: None,
        comment_count: 1,
        upvote_count: 3,
        created_at: "2026-08-28T08:00:00Z".to_string(),
        updated_at: "2026-08-28T09:00:00Z".to_string(),
        viewer_can_close: state == GitHubDiscussionState::Open,
        viewer_can_delete: true,
        viewer_can_reopen: state == GitHubDiscussionState::Closed,
        viewer_can_update: true,
        viewer_can_upvote: true,
        viewer_did_author: true,
        viewer_has_upvoted: false,
    }
}

fn comment(id: &str, body: &str) -> GitHubDiscussionComment {
    GitHubDiscussionComment {
        id: id.to_string(),
        body: body.to_string(),
        url: format!(
            "https://github.com/octocat/hello-world/discussions/42#discussioncomment-{id}"
        ),
        author: Some("hubot".to_string()),
        author_avatar_url: Some("https://github.com/hubot.png".to_string()),
        author_association: "COLLABORATOR".to_string(),
        created_at: "2026-08-28T10:00:00Z".to_string(),
        updated_at: "2026-08-28T10:00:00Z".to_string(),
        is_answer: false,
        is_minimized: false,
        minimized_reason: None,
        deleted_at: None,
        upvote_count: 2,
        viewer_can_delete: true,
        viewer_can_mark_as_answer: true,
        viewer_can_unmark_as_answer: false,
        viewer_can_update: true,
        viewer_can_upvote: true,
        viewer_did_author: false,
        viewer_has_upvoted: false,
        replies: Vec::new(),
        replies_have_more: false,
    }
}

fn poll() -> GitHubDiscussionPoll {
    GitHubDiscussionPoll {
        id: "DP_1".to_string(),
        question: "Which workflow should Harbor ship next?".to_string(),
        total_vote_count: 3,
        viewer_can_vote: true,
        viewer_has_voted: false,
        options: vec![
            GitHubDiscussionPollOption {
                id: "DPO_1".to_string(),
                option: "Discussions".to_string(),
                total_vote_count: 2,
                viewer_has_voted: false,
            },
            GitHubDiscussionPollOption {
                id: "DPO_2".to_string(),
                option: "Projects".to_string(),
                total_vote_count: 1,
                viewer_has_voted: false,
            },
        ],
    }
}

#[async_trait]
impl GitHubDiscussionClient for super::super::tests::FakeGitHubClient {
    async fn discussion_categories(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubDiscussionCategoryPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubDiscussionCategoryPage {
            enabled: true,
            repository_id: "R_kwDOA".to_string(),
            categories: vec![category()],
        })
    }

    async fn discussions(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubDiscussionFilters,
    ) -> Result<GitHubDiscussionPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubDiscussionPage {
            enabled: true,
            discussions: vec![discussion(match filters.state {
                GitHubDiscussionStateFilter::Closed => GitHubDiscussionState::Closed,
                _ => GitHubDiscussionState::Open,
            })],
            total_count: 1,
            end_cursor: Some("cursor-1".to_string()),
            has_more: filters.after.is_none(),
        })
    }

    async fn discussion_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        after: Option<&str>,
    ) -> Result<GitHubDiscussionDetailPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, discussion_number),
            ("octocat", "hello-world", 42)
        );
        Ok(GitHubDiscussionDetailPage {
            discussion: discussion(GitHubDiscussionState::Open),
            poll: Some(poll()),
            comments: vec![comment("DC_1", "A focused answer.")],
            comment_count: 1,
            end_cursor: Some("comment-cursor-1".to_string()),
            has_more: after.is_none(),
        })
    }

    async fn create_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, category_id),
            ("octocat", "hello-world", "DC_kwDOA")
        );
        let mut created = discussion(GitHubDiscussionState::Open);
        created.title = title.to_string();
        created.body = body.to_string();
        Ok(created)
    }

    async fn update_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        self.create_discussion(token, owner, repository, category_id, title, body)
            .await
            .map(|mut updated| {
                updated.number = discussion_number;
                updated
            })
    }

    async fn create_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        reply_to_id: Option<&str>,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, discussion_number),
            ("octocat", "hello-world", 42)
        );
        Ok(comment(reply_to_id.unwrap_or("DC_2"), body))
    }

    async fn update_discussion_comment(
        &self,
        token: &str,
        comment_id: &str,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(comment(comment_id, body))
    }

    async fn update_discussion_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        state: GitHubDiscussionState,
        close_reason: Option<GitHubDiscussionCloseReason>,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, discussion_number),
            ("octocat", "hello-world", 42)
        );
        if state == GitHubDiscussionState::Closed {
            assert_eq!(close_reason, Some(GitHubDiscussionCloseReason::Resolved));
        }
        Ok(discussion(state))
    }

    async fn update_discussion_upvote(
        &self,
        token: &str,
        subject_id: &str,
        upvoted: bool,
    ) -> Result<GitHubDiscussionVote, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubDiscussionVote {
            subject_id: subject_id.to_string(),
            upvote_count: if upvoted { 4 } else { 3 },
            viewer_can_upvote: true,
            viewer_has_upvoted: upvoted,
        })
    }

    async fn update_discussion_answer(
        &self,
        token: &str,
        comment_id: &str,
        answered: bool,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        assert_eq!(token, "github-user-access-token");
        let mut updated = discussion(GitHubDiscussionState::Open);
        updated.answer_id = answered.then(|| comment_id.to_string());
        Ok(updated)
    }

    async fn add_discussion_poll_vote(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        poll_option_id: &str,
    ) -> Result<GitHubDiscussionPoll, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, discussion_number, poll_option_id),
            ("octocat", "hello-world", 42, "DPO_1")
        );
        let mut updated = poll();
        updated.total_vote_count += 1;
        updated.viewer_has_voted = true;
        updated.options[0].total_vote_count += 1;
        updated.options[0].viewer_has_voted = true;
        Ok(updated)
    }

    async fn delete_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
    ) -> Result<GitHubDiscussionDeletion, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, discussion_number),
            ("octocat", "hello-world", 42)
        );
        Ok(GitHubDiscussionDeletion {
            discussion_id: "D_kwDOB".to_string(),
            discussion_number,
        })
    }

    async fn delete_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        comment_id: &str,
    ) -> Result<GitHubDiscussionCommentDeletion, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, discussion_number),
            ("octocat", "hello-world", 42)
        );
        Ok(GitHubDiscussionCommentDeletion {
            comment_id: comment_id.to_string(),
            reply_to_id: None,
            deleted_at: Some("2026-08-28T11:00:00Z".to_string()),
            preserved: false,
        })
    }
}

fn discussion_graphql_json() -> serde_json::Value {
    let category = serde_json::json!({
        "id": "DC_kwDOA",
        "name": "Q&A",
        "slug": "q-a",
        "description": "Ask the community",
        "emoji": ":pray:",
        "isAnswerable": true
    });
    let reply = serde_json::json!({
        "id": "DC_2",
        "body": "Thanks!",
        "url": "https://github.com/octocat/hello-world/discussions/42#discussioncomment-2",
        "author": null,
        "authorAssociation": "NONE",
        "createdAt": "2026-08-28T10:10:00Z",
        "updatedAt": "2026-08-28T10:10:00Z",
        "isAnswer": false,
        "isMinimized": false,
        "minimizedReason": null,
        "deletedAt": null,
        "upvoteCount": 0,
        "viewerCanDelete": false,
        "viewerCanMarkAsAnswer": false,
        "viewerCanUnmarkAsAnswer": false,
        "viewerCanUpdate": false,
        "viewerCanUpvote": true,
        "viewerDidAuthor": false,
        "viewerHasUpvoted": false
    });
    let comment = serde_json::json!({
        "id": "DC_1",
        "body": "A focused answer.",
        "url": "https://github.com/octocat/hello-world/discussions/42#discussioncomment-1",
        "author": { "login": "hubot", "avatarUrl": "https://github.com/hubot.png" },
        "authorAssociation": "COLLABORATOR",
        "createdAt": "2026-08-28T10:00:00Z",
        "updatedAt": "2026-08-28T10:00:00Z",
        "isAnswer": false,
        "isMinimized": false,
        "minimizedReason": null,
        "deletedAt": null,
        "upvoteCount": 2,
        "viewerCanDelete": true,
        "viewerCanMarkAsAnswer": true,
        "viewerCanUnmarkAsAnswer": false,
        "viewerCanUpdate": false,
        "viewerCanUpvote": true,
        "viewerDidAuthor": false,
        "viewerHasUpvoted": false,
        "replies": {
            "totalCount": 1,
            "pageInfo": { "endCursor": "reply-cursor-1", "hasNextPage": false },
            "nodes": [reply]
        }
    });
    serde_json::json!({
        "id": "D_kwDOB",
        "number": 42,
        "title": "How should Harbor present Discussions?",
        "body": "Keep the complete workflow in the desktop app.",
        "url": "https://github.com/octocat/hello-world/discussions/42",
        "closed": false,
        "stateReason": null,
        "locked": false,
        "author": { "login": "octocat", "avatarUrl": "https://github.com/octocat.png" },
        "authorAssociation": "OWNER",
        "category": category,
        "answer": null,
        "answerChosenAt": null,
        "answerChosenBy": null,
        "commentSummary": { "totalCount": 1 },
        "poll": {
            "id": "DP_1",
            "question": "Which workflow should Harbor ship next?",
            "totalVoteCount": 3,
            "viewerCanVote": true,
            "viewerHasVoted": false,
            "options": {
                "nodes": [
                    {
                        "id": "DPO_1",
                        "option": "Discussions",
                        "totalVoteCount": 2,
                        "viewerHasVoted": false
                    },
                    {
                        "id": "DPO_2",
                        "option": "Projects",
                        "totalVoteCount": 1,
                        "viewerHasVoted": false
                    }
                ]
            }
        },
        "comments": {
            "totalCount": 1,
            "pageInfo": { "endCursor": "comment-cursor-1", "hasNextPage": false },
            "nodes": [comment]
        },
        "createdAt": "2026-08-28T08:00:00Z",
        "updatedAt": "2026-08-28T09:00:00Z",
        "upvoteCount": 3,
        "viewerCanClose": true,
        "viewerCanDelete": true,
        "viewerCanReopen": false,
        "viewerCanUpdate": true,
        "viewerCanUpvote": true,
        "viewerDidAuthor": true,
        "viewerHasUpvoted": false
    })
}

#[test]
fn discussion_list_payload_preserves_filters_and_cursor() {
    let payload = discussions_payload(
        "octocat",
        "hello-world",
        &GitHubDiscussionFilters {
            category_id: Some("DC_kwDOA".to_string()),
            state: GitHubDiscussionStateFilter::Closed,
            answered: GitHubDiscussionAnsweredFilter::Unanswered,
            sort: GitHubDiscussionSort::Created,
            after: Some("cursor-1".to_string()),
        },
    );

    assert_eq!(payload["variables"]["categoryId"], "DC_kwDOA");
    assert_eq!(
        payload["variables"]["states"],
        serde_json::json!(["CLOSED"])
    );
    assert_eq!(payload["variables"]["answered"], false);
    assert_eq!(payload["variables"]["orderBy"]["field"], "CREATED_AT");
    assert_eq!(payload["variables"]["after"], "cursor-1");
    assert!(payload["query"]
        .as_str()
        .is_some_and(|query| query.contains("fragment HarborDiscussionSummary")));
}

#[test]
fn discussion_detail_maps_nested_replies_and_capabilities() {
    let query = graphql_payload(
        DISCUSSION_DETAIL_QUERY,
        serde_json::json!({
            "owner": "octocat",
            "repository": "hello-world",
            "number": 42,
            "after": null,
            "first": 30,
            "replyFirst": 100,
        }),
        true,
    );
    assert!(query["query"]
        .as_str()
        .is_some_and(|query| query.contains("commentSummary: comments { totalCount }")));

    let response: DiscussionDetailQuery = serde_json::from_value(serde_json::json!({
        "repository": { "discussion": discussion_graphql_json() }
    }))
    .expect("discussion response");

    let detail = discussion_detail_from_graphql(response).expect("discussion detail");

    assert_eq!(detail.discussion.number, 42);
    assert_eq!(detail.discussion.category.name, "Q&A");
    assert!(detail.discussion.viewer_can_close);
    assert!(detail.discussion.viewer_can_delete);
    assert_eq!(detail.poll.as_ref().map(|poll| poll.options.len()), Some(2));
    assert_eq!(detail.comments[0].body, "A focused answer.");
    assert!(detail.comments[0].viewer_can_delete);
    assert_eq!(detail.comments[0].replies[0].body, "Thanks!");
    assert_eq!(detail.comments[0].replies[0].author, None);
}

#[test]
fn discussion_categories_keep_answerability_and_repository_identity() {
    let response: DiscussionCategoriesQuery = serde_json::from_value(serde_json::json!({
        "repository": {
            "id": "R_kwDOA",
            "hasDiscussionsEnabled": true,
            "discussionCategories": { "nodes": [discussion_graphql_json()["category"].clone()] }
        }
    }))
    .expect("category response");

    let page = discussion_categories_from_graphql(response).expect("category page");

    assert!(page.enabled);
    assert_eq!(page.repository_id, "R_kwDOA");
    assert!(page.categories[0].is_answerable);
}

#[test]
fn discussion_category_guard_rejects_cross_repository_ids() {
    let page = GitHubDiscussionCategoryPage {
        enabled: true,
        repository_id: "R_kwDOA".to_string(),
        categories: vec![category()],
    };

    assert!(ensure_discussion_category(&page, "DC_kwDOA").is_ok());
    assert!(ensure_discussion_category(&page, "DC_other").is_err());
}

#[test]
fn discussion_mutations_use_official_ids_and_close_reason() {
    let create = graphql_payload(
        CREATE_DISCUSSION_MUTATION,
        serde_json::json!({
            "repositoryId": "R_kwDOA",
            "categoryId": "DC_kwDOA",
            "title": "Focused workflow",
            "body": "Body",
        }),
        true,
    );
    let reply = graphql_payload(
        ADD_DISCUSSION_COMMENT_MUTATION,
        serde_json::json!({
            "discussionId": "D_kwDOB",
            "replyToId": "DC_1",
            "body": "Reply",
        }),
        false,
    );
    let poll_vote = graphql_payload(
        ADD_DISCUSSION_POLL_VOTE_MUTATION,
        serde_json::json!({ "pollOptionId": "DPO_1" }),
        false,
    );

    assert_eq!(create["variables"]["repositoryId"], "R_kwDOA");
    assert_eq!(create["variables"]["categoryId"], "DC_kwDOA");
    assert_eq!(reply["variables"]["replyToId"], "DC_1");
    assert!(reply["query"]
        .as_str()
        .is_some_and(|query| query.contains("fragment HarborDiscussionComment")));
    assert_eq!(poll_vote["variables"]["pollOptionId"], "DPO_1");
    assert!(poll_vote["query"]
        .as_str()
        .is_some_and(|query| query.contains("fragment HarborDiscussionPoll")));
    assert!(DELETE_DISCUSSION_MUTATION.contains("deleteDiscussion(input: { id: $discussionId })"));
    assert!(DELETE_DISCUSSION_COMMENT_MUTATION
        .contains("deleteDiscussionComment(input: { id: $commentId })"));
    assert_eq!(
        discussion_close_reason_graphql(GitHubDiscussionCloseReason::Duplicate),
        "DUPLICATE"
    );
}

#[test]
fn discussion_answer_and_vote_responses_must_match_requested_state() {
    let response: DiscussionAnswerMutation = serde_json::from_value(serde_json::json!({
        "markDiscussionCommentAsAnswer": { "discussion": discussion_graphql_json() }
    }))
    .expect("answer response");
    let discussion = response
        .mark_discussion_comment_as_answer
        .and_then(|payload| payload.discussion)
        .map(discussion_summary_from_graphql)
        .expect("discussion");
    assert_eq!(discussion.answer_id, None);

    let vote: GraphQlDiscussionVote = serde_json::from_value(serde_json::json!({
        "id": "D_kwDOB",
        "upvoteCount": 4,
        "viewerCanUpvote": true,
        "viewerHasUpvoted": true
    }))
    .expect("vote response");
    assert_eq!(GitHubDiscussionVote::from(vote).upvote_count, 4);

    let response: DiscussionPollVoteMutation = serde_json::from_value(serde_json::json!({
        "addDiscussionPollVote": {
            "pollOption": {
                "id": "DPO_1",
                "poll": discussion_graphql_json()["poll"].clone()
            }
        }
    }))
    .expect("poll vote response");
    let poll = response
        .add_discussion_poll_vote
        .and_then(|payload| payload.poll_option)
        .and_then(|option| option.poll)
        .map(discussion_poll_from_graphql)
        .expect("poll");
    assert_eq!(poll.options[0].id, "DPO_1");
}

#[test]
fn discussion_comment_delete_guard_checks_type_scope_and_capability_data() {
    let snapshot = GraphQlDiscussionCommentSnapshotNode {
        type_name: "DiscussionComment".to_string(),
        id: Some("DC_1".to_string()),
        deleted_at: None,
        viewer_can_delete: Some(true),
        reply_to: None,
        replies: Some(GraphQlDiscussionCommentSnapshotReplies { total_count: 2 }),
        discussion: Some(GraphQlDiscussionCommentSnapshotDiscussion {
            number: 42,
            repository: GraphQlDiscussionCommentSnapshotRepository {
                name_with_owner: "Octocat/Hello-World".to_string(),
            },
        }),
    };

    let validated =
        validate_discussion_comment_snapshot(snapshot, "octocat", "hello-world", 42, "DC_1")
            .expect("comment scope");
    assert!(validated.viewer_can_delete);
    assert_eq!(validated.replies.total_count, 2);

    let wrong_scope = GraphQlDiscussionCommentSnapshotNode {
        type_name: "DiscussionComment".to_string(),
        id: Some("DC_1".to_string()),
        deleted_at: None,
        viewer_can_delete: Some(true),
        reply_to: Some(GraphQlNode {
            id: "DC_parent".to_string(),
        }),
        replies: Some(GraphQlDiscussionCommentSnapshotReplies::default()),
        discussion: Some(GraphQlDiscussionCommentSnapshotDiscussion {
            number: 7,
            repository: GraphQlDiscussionCommentSnapshotRepository {
                name_with_owner: "octocat/hello-world".to_string(),
            },
        }),
    };
    assert!(validate_discussion_comment_snapshot(
        wrong_scope,
        "octocat",
        "hello-world",
        42,
        "DC_1",
    )
    .is_err());
}

#[test]
fn discussion_numbers_stay_inside_githubs_graphql_int_range() {
    assert_eq!(
        graphql_discussion_number(i32::MAX as u64).expect("max"),
        i32::MAX
    );
    assert!(graphql_discussion_number(i32::MAX as u64 + 1).is_err());
}
