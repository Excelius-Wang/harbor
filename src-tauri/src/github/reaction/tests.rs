use super::*;

#[async_trait]
impl GitHubReactionClient for super::super::tests::FakeGitHubClient {
    async fn reaction_subjects(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        subjects: &[GitHubReactionSubjectRef],
    ) -> Result<Vec<GitHubReactionSubject>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(subjects
            .iter()
            .map(|subject| GitHubReactionSubject {
                id: subject.id.clone(),
                kind: subject.kind,
                viewer_can_react: true,
                groups: vec![GitHubReactionGroup {
                    content: GitHubReactionContent::ThumbsUp,
                    count: 3,
                    viewer_has_reacted: false,
                }],
            })
            .collect())
    }

    async fn update_reaction(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        subject: &GitHubReactionSubjectRef,
        content: GitHubReactionContent,
        reacted: bool,
    ) -> Result<GitHubReactionSubject, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubReactionSubject {
            id: subject.id.clone(),
            kind: subject.kind,
            viewer_can_react: true,
            groups: vec![GitHubReactionGroup {
                content,
                count: if reacted { 4 } else { 3 },
                viewer_has_reacted: reacted,
            }],
        })
    }
}

fn group(
    content: GitHubReactionContent,
    count: u64,
    viewer_has_reacted: bool,
) -> ReactionGroupNode {
    ReactionGroupNode {
        content,
        viewer_has_reacted,
        reactors: ReactionReactorsNode { total_count: count },
    }
}

#[test]
fn reaction_subjects_are_bounded_deduplicated_and_opaque() {
    assert_eq!(
        normalize_reaction_subjects(vec![
            GitHubReactionSubjectRef {
                id: " I_kwDOexample ".to_string(),
                kind: GitHubReactionSubjectKind::Issue,
            },
            GitHubReactionSubjectRef {
                id: "IC_kwDOexample".to_string(),
                kind: GitHubReactionSubjectKind::IssueComment,
            },
            GitHubReactionSubjectRef {
                id: "I_kwDOexample".to_string(),
                kind: GitHubReactionSubjectKind::Issue,
            },
        ])
        .unwrap(),
        [
            GitHubReactionSubjectRef {
                id: "I_kwDOexample".to_string(),
                kind: GitHubReactionSubjectKind::Issue,
            },
            GitHubReactionSubjectRef {
                id: "IC_kwDOexample".to_string(),
                kind: GitHubReactionSubjectKind::IssueComment,
            }
        ]
    );
    assert!(normalize_reaction_subjects(Vec::new()).is_err());
    assert!(normalize_reaction_subjects(vec![GitHubReactionSubjectRef {
        id: "with whitespace".to_string(),
        kind: GitHubReactionSubjectKind::Issue,
    }])
    .is_err());
    assert!(normalize_reaction_subjects(vec![GitHubReactionSubjectRef {
        id: "x".repeat(257),
        kind: GitHubReactionSubjectKind::Issue,
    }])
    .is_err());
    assert!(normalize_reaction_subjects(vec![
        GitHubReactionSubjectRef {
            id: "I_1".to_string(),
            kind: GitHubReactionSubjectKind::Issue,
        };
        101
    ])
    .is_err());
    assert!(normalize_reaction_subjects(vec![
        GitHubReactionSubjectRef {
            id: "I_1".to_string(),
            kind: GitHubReactionSubjectKind::Issue,
        },
        GitHubReactionSubjectRef {
            id: "I_1".to_string(),
            kind: GitHubReactionSubjectKind::PullRequest,
        },
    ])
    .is_err());
}

#[test]
fn reaction_groups_keep_github_order_and_drop_empty_groups() {
    let groups = reaction_groups_from_graphql(vec![
        group(GitHubReactionContent::Rocket, 2, true),
        group(GitHubReactionContent::ThumbsDown, 0, false),
        group(GitHubReactionContent::ThumbsUp, 7, false),
    ])
    .unwrap();
    assert_eq!(groups.len(), 2);
    assert_eq!(groups[0].content, GitHubReactionContent::ThumbsUp);
    assert_eq!(groups[1].content, GitHubReactionContent::Rocket);
    assert!(groups[1].viewer_has_reacted);
    assert!(reaction_groups_from_graphql(vec![
        group(GitHubReactionContent::Heart, 1, false),
        group(GitHubReactionContent::Heart, 2, true),
    ])
    .is_err());
    assert!(
        reaction_groups_from_graphql(vec![group(GitHubReactionContent::Eyes, 0, true,)]).is_err()
    );
}

#[test]
fn reaction_subjects_require_the_selected_repository_and_supported_types() {
    let issue = ReactionSubjectNode {
        type_name: "Issue".to_string(),
        id: "I_1".to_string(),
        viewer_can_react: true,
        reaction_groups: Some(vec![group(GitHubReactionContent::Heart, 2, true)]),
        repository: Some(ReactionRepositoryNode {
            id: "R_1".to_string(),
        }),
        discussion: None,
    };
    let issue_ref = GitHubReactionSubjectRef {
        id: "I_1".to_string(),
        kind: GitHubReactionSubjectKind::Issue,
    };
    assert_eq!(
        reaction_subject_from_graphql(issue, &issue_ref, "R_1")
            .unwrap()
            .id,
        "I_1"
    );

    let discussion_comment = ReactionSubjectNode {
        type_name: "DiscussionComment".to_string(),
        id: "DC_1".to_string(),
        viewer_can_react: true,
        reaction_groups: None,
        repository: None,
        discussion: Some(ReactionDiscussionNode {
            repository: Some(ReactionRepositoryNode {
                id: "R_1".to_string(),
            }),
        }),
    };
    let discussion_comment_ref = GitHubReactionSubjectRef {
        id: "DC_1".to_string(),
        kind: GitHubReactionSubjectKind::DiscussionComment,
    };
    assert!(
        reaction_subject_from_graphql(discussion_comment, &discussion_comment_ref, "R_1").is_ok()
    );

    let foreign = ReactionSubjectNode {
        type_name: "IssueComment".to_string(),
        id: "IC_1".to_string(),
        viewer_can_react: true,
        reaction_groups: None,
        repository: Some(ReactionRepositoryNode {
            id: "R_2".to_string(),
        }),
        discussion: None,
    };
    let comment_ref = GitHubReactionSubjectRef {
        id: "IC_1".to_string(),
        kind: GitHubReactionSubjectKind::IssueComment,
    };
    assert!(reaction_subject_from_graphql(foreign, &comment_ref, "R_1").is_err());

    let commit_comment = ReactionSubjectNode {
        type_name: "CommitComment".to_string(),
        id: "CC_1".to_string(),
        viewer_can_react: true,
        reaction_groups: None,
        repository: Some(ReactionRepositoryNode {
            id: "R_1".to_string(),
        }),
        discussion: None,
    };
    assert!(reaction_subject_from_graphql(commit_comment, &comment_ref, "R_1").is_err());

    assert!(ensure_reaction_content_supported(
        GitHubReactionSubjectKind::Release,
        GitHubReactionContent::ThumbsDown,
    )
    .is_err());
    assert!(ensure_reaction_content_supported(
        GitHubReactionSubjectKind::Release,
        GitHubReactionContent::Rocket,
    )
    .is_ok());
}

#[test]
fn reaction_operations_use_current_graphql_contracts() {
    assert!(REACTION_SUBJECTS_QUERY.contains("nodes(ids: $ids)"));
    assert!(REACTION_SUBJECTS_QUERY.contains("... on Reactable"));
    assert!(REACTION_SUBJECTS_QUERY.contains("viewerCanReact"));
    assert!(REACTION_SUBJECTS_QUERY.contains("reactors { totalCount }"));
    assert!(ADD_REACTION_MUTATION.contains("addReaction"));
    assert!(REMOVE_REACTION_MUTATION.contains("removeReaction"));
    assert_eq!(GitHubReactionContent::ThumbsUp.as_graphql(), "THUMBS_UP");
    assert_eq!(GitHubReactionContent::Hooray.as_graphql(), "HOORAY");
}
