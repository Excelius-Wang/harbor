use std::{
    collections::{BTreeMap, BTreeSet},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use async_trait::async_trait;
use serde::Deserialize;

use crate::error::AppError;

use super::{
    authenticated_client, github_error, issue::GitHubIssueTimelineKind, GitHubIssueTimelineItem,
    GitHubPullRequestReviewThreadComment, GitHubReactionSubjectKind, GitHubReactionSubjectRef,
    GitHubService, OctocrabGitHubClient,
};

mod minimize;
pub use minimize::GitHubCommentMinimizeClassifier;

macro_rules! issue_comment_fields_fragment {
    () => {
        r#"
fragment HarborIssueCommentFields on IssueComment {
  id
  body
  url
  createdAt
  updatedAt
  authorAssociation
  isPinned
  isMinimized
  minimizedReason
  viewerCanUpdate
  viewerCanDelete
  viewerCanPin
  viewerCanUnpin
  viewerCanMinimize
  viewerCanUnminimize
  repository { id }
  issue { number }
  pullRequest { number }
  author { login avatarUrl }
}
"#
    };
}

const COMMENT_NODES_QUERY: &str = concat!(
    r#"
query HarborCommentNodes($owner: String!, $repository: String!, $ids: [ID!]!) {
  repository(owner: $owner, name: $repository) { id }
  nodes(ids: $ids) {
    __typename
    ...HarborIssueCommentFields
    ...HarborPullRequestReviewCommentFields
  }
}

fragment HarborPullRequestReviewCommentFields on PullRequestReviewComment {
  id
  fullDatabaseId
  body
  url
  createdAt
  updatedAt
  authorAssociation
  isMinimized
  minimizedReason
  outdated
  viewerCanUpdate
  viewerCanDelete
  viewerCanMinimize
  viewerCanUnminimize
  state
  repository { id }
  pullRequest { number }
  author { login avatarUrl }
}
"#,
    issue_comment_fields_fragment!()
);

const UPDATE_ISSUE_COMMENT_MUTATION: &str = concat!(
    r#"
mutation HarborUpdateIssueComment(
  $id: ID!
  $body: String!
  $clientMutationId: String!
) {
  updateIssueComment(input: {
    id: $id
    body: $body
    clientMutationId: $clientMutationId
  }) {
    clientMutationId
    issueComment { ...HarborIssueCommentFields }
  }
}
"#,
    issue_comment_fields_fragment!()
);

const DELETE_ISSUE_COMMENT_MUTATION: &str = r#"
mutation HarborDeleteIssueComment($id: ID!, $clientMutationId: String!) {
  deleteIssueComment(input: { id: $id, clientMutationId: $clientMutationId }) {
    clientMutationId
  }
}
"#;

const PIN_ISSUE_COMMENT_MUTATION: &str = concat!(
    r#"
mutation HarborPinIssueComment($id: ID!, $clientMutationId: String!) {
  pinIssueComment(input: { issueCommentId: $id, clientMutationId: $clientMutationId }) {
    clientMutationId
    issueComment { ...HarborIssueCommentFields }
  }
}
"#,
    issue_comment_fields_fragment!()
);

const UNPIN_ISSUE_COMMENT_MUTATION: &str = concat!(
    r#"
mutation HarborUnpinIssueComment($id: ID!, $clientMutationId: String!) {
  unpinIssueComment(input: { issueCommentId: $id, clientMutationId: $clientMutationId }) {
    clientMutationId
    issueComment { ...HarborIssueCommentFields }
  }
}
"#,
    issue_comment_fields_fragment!()
);

const UPDATE_REVIEW_COMMENT_MUTATION: &str = r#"
mutation HarborUpdatePullRequestReviewComment(
  $id: ID!
  $body: String!
  $clientMutationId: String!
) {
  updatePullRequestReviewComment(input: {
    pullRequestReviewCommentId: $id
    body: $body
    clientMutationId: $clientMutationId
  }) {
    clientMutationId
    pullRequestReviewComment { ...HarborPullRequestReviewCommentFields }
  }
}

fragment HarborPullRequestReviewCommentFields on PullRequestReviewComment {
  id
  fullDatabaseId
  body
  url
  createdAt
  updatedAt
  authorAssociation
  isMinimized
  minimizedReason
  outdated
  viewerCanUpdate
  viewerCanDelete
  viewerCanMinimize
  viewerCanUnminimize
  state
  repository { id }
  pullRequest { number }
  author { login avatarUrl }
}
"#;

const DELETE_REVIEW_COMMENT_MUTATION: &str = r#"
mutation HarborDeletePullRequestReviewComment($id: ID!, $clientMutationId: String!) {
  deletePullRequestReviewComment(input: { id: $id, clientMutationId: $clientMutationId }) {
    clientMutationId
  }
}
"#;

static COMMENT_MUTATION_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum GitHubConversationCommentKind {
    Issue,
    PullRequest,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum GitHubCommentMutation {
    Update {
        comment_id: String,
        expected_updated_at: String,
        body: String,
    },
    Delete {
        comment_id: String,
        expected_updated_at: String,
    },
    Pin {
        comment_id: String,
        expected_updated_at: String,
        expected_pinned: bool,
    },
    Unpin {
        comment_id: String,
        expected_updated_at: String,
        expected_pinned: bool,
    },
    Minimize {
        comment_id: String,
        expected_updated_at: String,
        expected_minimized: bool,
        classifier: GitHubCommentMinimizeClassifier,
    },
    Unminimize {
        comment_id: String,
        expected_updated_at: String,
        expected_minimized: bool,
    },
}

impl GitHubCommentMutation {
    pub(crate) fn comment_id(&self) -> &str {
        match self {
            Self::Update { comment_id, .. }
            | Self::Delete { comment_id, .. }
            | Self::Pin { comment_id, .. }
            | Self::Unpin { comment_id, .. }
            | Self::Minimize { comment_id, .. }
            | Self::Unminimize { comment_id, .. } => comment_id,
        }
    }

    fn expected_updated_at(&self) -> &str {
        match self {
            Self::Update {
                expected_updated_at,
                ..
            }
            | Self::Delete {
                expected_updated_at,
                ..
            }
            | Self::Pin {
                expected_updated_at,
                ..
            }
            | Self::Unpin {
                expected_updated_at,
                ..
            }
            | Self::Minimize {
                expected_updated_at,
                ..
            }
            | Self::Unminimize {
                expected_updated_at,
                ..
            } => expected_updated_at,
        }
    }

    fn expected_pinned(&self) -> Option<bool> {
        match self {
            Self::Pin {
                expected_pinned, ..
            }
            | Self::Unpin {
                expected_pinned, ..
            } => Some(*expected_pinned),
            Self::Update { .. }
            | Self::Delete { .. }
            | Self::Minimize { .. }
            | Self::Unminimize { .. } => None,
        }
    }

    fn expected_minimized(&self) -> Option<bool> {
        match self {
            Self::Minimize {
                expected_minimized, ..
            }
            | Self::Unminimize {
                expected_minimized, ..
            } => Some(*expected_minimized),
            Self::Update { .. } | Self::Delete { .. } | Self::Pin { .. } | Self::Unpin { .. } => {
                None
            }
        }
    }
}

#[async_trait]
pub(crate) trait GitHubCommentClient: Send + Sync {
    #[allow(clippy::too_many_arguments)]
    async fn mutate_issue_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationCommentKind,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubIssueTimelineItem>, AppError>;

    async fn mutate_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubPullRequestReviewThreadComment>, AppError>;
}

impl GitHubService {
    pub async fn mutate_issue_comment(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubIssueTimelineItem>, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .mutate_issue_comment(
                &token,
                owner,
                repository,
                issue_number,
                GitHubConversationCommentKind::Issue,
                mutation,
            )
            .await
    }

    pub async fn mutate_pull_request_comment(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubIssueTimelineItem>, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .mutate_issue_comment(
                &token,
                owner,
                repository,
                pull_request_number,
                GitHubConversationCommentKind::PullRequest,
                mutation,
            )
            .await
    }

    pub async fn mutate_pull_request_review_comment(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubPullRequestReviewThreadComment>, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .mutate_pull_request_review_comment(
                &token,
                owner,
                repository,
                pull_request_number,
                mutation,
            )
            .await
    }
}

#[async_trait]
impl GitHubCommentClient for OctocrabGitHubClient {
    async fn mutate_issue_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationCommentKind,
        mutation: &GitHubCommentMutation,
    ) -> Result<Option<GitHubIssueTimelineItem>, AppError> {
        let client = authenticated_client(token)?;
        let mut response = comment_nodes(
            &client,
            owner,
            repository,
            &[mutation.comment_id().to_string()],
        )
        .await?;
        let repository_id = selected_repository_id(&response)?.to_string();
        let node =
            response.nodes.pop().flatten().ok_or_else(|| {
                AppError::GitHub("GitHub did not return the selected comment".into())
            })?;
        let current = match node {
            CommentNode::IssueComment(node) => {
                validate_issue_comment_node(node, &repository_id, number, kind)?
            }
            _ => {
                return Err(AppError::GitHub(
                    "GitHub returned a different comment type".to_string(),
                ))
            }
        };
        ensure_requested_comment_id(&current.id, mutation.comment_id())?;
        ensure_mutation_allowed_with_minimize(
            mutation,
            &current.updated_at,
            current.viewer_can_update,
            current.viewer_can_delete,
            current.is_pinned.unwrap_or(false),
            current.viewer_can_pin,
            current.viewer_can_unpin,
            current.is_minimized,
            current.viewer_can_minimize,
            current.viewer_can_unminimize,
        )?;

        if matches!(
            mutation,
            GitHubCommentMutation::Pin { .. } | GitHubCommentMutation::Unpin { .. }
        ) && kind != GitHubConversationCommentKind::Issue
        {
            return Err(AppError::Validation(
                "Issue comment pinning is only available on Issues".to_string(),
            ));
        }

        match mutation {
            GitHubCommentMutation::Update { body, .. } if current.body == *body => {
                Ok(Some(issue_timeline_item_from_graphql(current)))
            }
            GitHubCommentMutation::Update { body, .. } => {
                let client_mutation_id = mutation_identity("update-issue-comment");
                let payload = serde_json::json!({
                    "query": UPDATE_ISSUE_COMMENT_MUTATION,
                    "variables": {
                        "id": current.id,
                        "body": body,
                        "clientMutationId": client_mutation_id,
                    }
                });
                let response: UpdateIssueCommentMutation =
                    client.graphql(&payload).await.map_err(github_error)?;
                let payload = response.update_issue_comment.ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the comment update".into())
                })?;
                ensure_mutation_identity(
                    payload.client_mutation_id.as_deref(),
                    &client_mutation_id,
                )?;
                let updated = payload.issue_comment.ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the updated comment".into())
                })?;
                let updated = validate_issue_comment_node(updated, &repository_id, number, kind)?;
                if updated.id != mutation.comment_id() || updated.body != *body {
                    return Err(AppError::GitHub(
                        "GitHub returned a different comment update".to_string(),
                    ));
                }
                Ok(Some(issue_timeline_item_from_graphql(updated)))
            }
            GitHubCommentMutation::Delete { .. } => {
                let client_mutation_id = mutation_identity("delete-issue-comment");
                let payload = serde_json::json!({
                    "query": DELETE_ISSUE_COMMENT_MUTATION,
                    "variables": {
                        "id": current.id,
                        "clientMutationId": client_mutation_id,
                    }
                });
                let response: DeleteIssueCommentMutation =
                    client.graphql(&payload).await.map_err(github_error)?;
                let payload = response.delete_issue_comment.ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the comment deletion".into())
                })?;
                ensure_mutation_identity(
                    payload.client_mutation_id.as_deref(),
                    &client_mutation_id,
                )?;
                Ok(None)
            }
            GitHubCommentMutation::Pin { .. } | GitHubCommentMutation::Unpin { .. } => {
                let client = issue_comment_client(token)?;
                let client_mutation_id =
                    mutation_identity(if matches!(mutation, GitHubCommentMutation::Pin { .. }) {
                        "pin-issue-comment"
                    } else {
                        "unpin-issue-comment"
                    });
                let payload = serde_json::json!({
                    "query": if matches!(mutation, GitHubCommentMutation::Pin { .. }) {
                        PIN_ISSUE_COMMENT_MUTATION
                    } else {
                        UNPIN_ISSUE_COMMENT_MUTATION
                    },
                    "variables": {
                        "id": current.id,
                        "clientMutationId": client_mutation_id,
                    }
                });
                let response: PinIssueCommentMutation =
                    client.graphql(&payload).await.map_err(github_error)?;
                let payload = if matches!(mutation, GitHubCommentMutation::Pin { .. }) {
                    response.pin_issue_comment.ok_or_else(|| {
                        AppError::GitHub("GitHub did not return the comment pin".into())
                    })?
                } else {
                    response.unpin_issue_comment.ok_or_else(|| {
                        AppError::GitHub("GitHub did not return the comment unpin".into())
                    })?
                };
                ensure_mutation_identity(
                    payload.client_mutation_id.as_deref(),
                    &client_mutation_id,
                )?;
                let pinned = payload.issue_comment.ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the pinned comment".into())
                })?;
                let pinned = validate_issue_comment_node(pinned, &repository_id, number, kind)?;
                let expected_pinned = matches!(mutation, GitHubCommentMutation::Pin { .. });
                if pinned.id != mutation.comment_id()
                    || pinned.is_pinned.unwrap_or(false) != expected_pinned
                {
                    return Err(AppError::GitHub(
                        "GitHub returned an unexpected comment pin state".to_string(),
                    ));
                }
                Ok(Some(issue_timeline_item_from_graphql(pinned)))
            }
            GitHubCommentMutation::Minimize { .. } | GitHubCommentMutation::Unminimize { .. } => {
                let comment_id = current.id.clone();
                let client = issue_comment_client(token)?;
                run_minimize_mutation(&client, mutation).await?;
                let mut response = comment_nodes(&client, owner, repository, &[comment_id])
                    .await
                    .map_err(minimize_postflight_error)?;
                let refreshed = response.nodes.pop().flatten().ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the minimized comment".into())
                })?;
                let refreshed = match refreshed {
                    CommentNode::IssueComment(node) => {
                        let node = validate_issue_comment_node(node, &repository_id, number, kind)?;
                        ensure_requested_comment_id(&node.id, mutation.comment_id())?;
                        node
                    }
                    _ => {
                        return Err(AppError::GitHub(
                            "GitHub returned a different minimized comment type".to_string(),
                        ))
                    }
                };
                ensure_minimized_result(
                    refreshed.is_minimized,
                    refreshed.minimized_reason.as_deref(),
                    mutation,
                )?;
                Ok(Some(issue_timeline_item_from_graphql(refreshed)))
            }
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
        let client = authenticated_client(token)?;
        let mut response = comment_nodes(
            &client,
            owner,
            repository,
            &[mutation.comment_id().to_string()],
        )
        .await?;
        let repository_id = selected_repository_id(&response)?.to_string();
        let node = response.nodes.pop().flatten().ok_or_else(|| {
            AppError::GitHub("GitHub did not return the selected review comment".into())
        })?;
        let current = match node {
            CommentNode::PullRequestReviewComment(node) => {
                validate_review_comment_node(node, &repository_id, pull_request_number)?
            }
            _ => {
                return Err(AppError::GitHub(
                    "GitHub returned a different review comment type".to_string(),
                ))
            }
        };
        ensure_requested_comment_id(&current.id, mutation.comment_id())?;
        if !current.state.eq_ignore_ascii_case("SUBMITTED") {
            return Err(AppError::GitHubPermission(
                "pending review comments must be changed through the pending review".to_string(),
            ));
        }
        ensure_mutation_allowed_with_minimize(
            mutation,
            &current.updated_at,
            current.viewer_can_update,
            current.viewer_can_delete,
            false,
            false,
            false,
            current.is_minimized,
            current.viewer_can_minimize,
            current.viewer_can_unminimize,
        )?;

        match mutation {
            GitHubCommentMutation::Update { body, .. } if current.body == *body => {
                Ok(Some(review_comment_from_graphql(current)))
            }
            GitHubCommentMutation::Update { body, .. } => {
                let client_mutation_id = mutation_identity("update-review-comment");
                let payload = serde_json::json!({
                    "query": UPDATE_REVIEW_COMMENT_MUTATION,
                    "variables": {
                        "id": current.id,
                        "body": body,
                        "clientMutationId": client_mutation_id,
                    }
                });
                let response: UpdateReviewCommentMutation =
                    client.graphql(&payload).await.map_err(github_error)?;
                let payload = response.update_pull_request_review_comment.ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the review comment update".into())
                })?;
                ensure_mutation_identity(
                    payload.client_mutation_id.as_deref(),
                    &client_mutation_id,
                )?;
                let updated = payload.pull_request_review_comment.ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the updated review comment".into())
                })?;
                let updated =
                    validate_review_comment_node(updated, &repository_id, pull_request_number)?;
                if updated.id != mutation.comment_id() || updated.body != *body {
                    return Err(AppError::GitHub(
                        "GitHub returned a different review comment update".to_string(),
                    ));
                }
                Ok(Some(review_comment_from_graphql(updated)))
            }
            GitHubCommentMutation::Delete { .. } => {
                let client_mutation_id = mutation_identity("delete-review-comment");
                let payload = serde_json::json!({
                    "query": DELETE_REVIEW_COMMENT_MUTATION,
                    "variables": {
                        "id": current.id,
                        "clientMutationId": client_mutation_id,
                    }
                });
                let response: DeleteReviewCommentMutation =
                    client.graphql(&payload).await.map_err(github_error)?;
                let payload = response.delete_pull_request_review_comment.ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the review comment deletion".into())
                })?;
                ensure_mutation_identity(
                    payload.client_mutation_id.as_deref(),
                    &client_mutation_id,
                )?;
                Ok(None)
            }
            GitHubCommentMutation::Pin { .. } | GitHubCommentMutation::Unpin { .. } => {
                Err(AppError::Validation(
                    "Issue comment pinning is not available for review comments".to_string(),
                ))
            }
            GitHubCommentMutation::Minimize { .. } | GitHubCommentMutation::Unminimize { .. } => {
                let comment_id = current.id.clone();
                let client = issue_comment_client(token)?;
                run_minimize_mutation(&client, mutation).await?;
                let mut response = comment_nodes(&client, owner, repository, &[comment_id])
                    .await
                    .map_err(minimize_postflight_error)?;
                let refreshed = response.nodes.pop().flatten().ok_or_else(|| {
                    AppError::GitHub("GitHub did not return the minimized review comment".into())
                })?;
                let refreshed = match refreshed {
                    CommentNode::PullRequestReviewComment(node) => {
                        let node = validate_review_comment_node(
                            node,
                            &repository_id,
                            pull_request_number,
                        )?;
                        ensure_requested_comment_id(&node.id, mutation.comment_id())?;
                        node
                    }
                    _ => {
                        return Err(AppError::GitHub(
                            "GitHub returned a different minimized review comment type".to_string(),
                        ))
                    }
                };
                ensure_minimized_result(
                    refreshed.is_minimized,
                    refreshed.minimized_reason.as_deref(),
                    mutation,
                )?;
                Ok(Some(review_comment_from_graphql(refreshed)))
            }
        }
    }
}

fn issue_comment_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    issue_comment_client_with_base(token, None)
}

fn issue_comment_client_with_base(
    token: &str,
    base_uri: Option<&str>,
) -> Result<octocrab::Octocrab, AppError> {
    let builder = octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None);
    let builder = if let Some(base_uri) = base_uri {
        builder
            .base_uri(base_uri)
            .map_err(|error| AppError::GitHub(error.to_string()))?
    } else {
        builder
    };
    builder
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

pub(crate) async fn run_minimize_mutation(
    client: &octocrab::Octocrab,
    mutation: &GitHubCommentMutation,
) -> Result<(), AppError> {
    let (query, client_mutation_id, variables) = match mutation {
        GitHubCommentMutation::Minimize {
            comment_id,
            classifier,
            ..
        } => {
            let client_mutation_id = mutation_identity("minimize-comment");
            (
                minimize::MINIMIZE_COMMENT_MUTATION,
                client_mutation_id.clone(),
                serde_json::json!({
                    "id": comment_id,
                    "classifier": classifier.graphql_name(),
                    "clientMutationId": client_mutation_id,
                }),
            )
        }
        GitHubCommentMutation::Unminimize { comment_id, .. } => {
            let client_mutation_id = mutation_identity("unminimize-comment");
            (
                minimize::UNMINIMIZE_COMMENT_MUTATION,
                client_mutation_id.clone(),
                serde_json::json!({
                    "id": comment_id,
                    "clientMutationId": client_mutation_id,
                }),
            )
        }
        _ => {
            return Err(AppError::Validation(
                "the selected comment mutation is not a minimize operation".to_string(),
            ))
        }
    };
    let payload = serde_json::json!({ "query": query, "variables": variables });
    let response: minimize::MinimizeCommentMutation =
        client.graphql(&payload).await.map_err(github_error)?;
    let response = match mutation {
        GitHubCommentMutation::Minimize { .. } => response.minimize_comment,
        GitHubCommentMutation::Unminimize { .. } => response.unminimize_comment,
        _ => unreachable!(),
    }
    .ok_or_else(|| AppError::GitHub("GitHub did not return the comment minimization".into()))?;
    ensure_mutation_identity(response.client_mutation_id.as_deref(), &client_mutation_id)
}

fn minimize_postflight_error(error: AppError) -> AppError {
    AppError::GitHub(format!(
        "the comment minimize write may have persisted, but Harbor could not refresh it: {error}"
    ))
}

fn ensure_minimized_result(
    is_minimized: bool,
    minimized_reason: Option<&str>,
    mutation: &GitHubCommentMutation,
) -> Result<(), AppError> {
    let matches = match mutation {
        GitHubCommentMutation::Minimize { classifier, .. } => {
            is_minimized && minimized_reason == Some(classifier.response_reason())
        }
        GitHubCommentMutation::Unminimize { .. } => !is_minimized && minimized_reason.is_none(),
        _ => false,
    };
    if matches {
        Ok(())
    } else {
        Err(AppError::GitHubCommentConflict(
            "the comment minimize state did not match the requested mutation".to_string(),
        ))
    }
}

pub(crate) async fn enrich_issue_timeline_comments(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    number: u64,
    kind: GitHubConversationCommentKind,
    timeline: Vec<GitHubIssueTimelineItem>,
) -> Result<Vec<GitHubIssueTimelineItem>, AppError> {
    let ids = timeline
        .iter()
        .filter(|item| item.kind == GitHubIssueTimelineKind::Comment)
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    if ids.is_empty() {
        return Ok(timeline);
    }
    let response = comment_nodes(client, owner, repository, &ids).await?;
    let repository_id = selected_repository_id(&response)?.to_string();
    let expected_ids = ids.iter().map(String::as_str).collect::<BTreeSet<_>>();
    let mut comments = BTreeMap::new();
    for node in response.nodes.into_iter().flatten() {
        let CommentNode::IssueComment(node) = node else {
            return Err(AppError::GitHub(
                "GitHub returned a different timeline comment type".to_string(),
            ));
        };
        let node = validate_issue_comment_node(node, &repository_id, number, kind)?;
        if !expected_ids.contains(node.id.as_str()) {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected timeline comment".to_string(),
            ));
        }
        comments.insert(node.id.clone(), issue_timeline_item_from_graphql(node));
    }
    Ok(timeline
        .into_iter()
        .map(|item| comments.remove(&item.id).unwrap_or(item))
        .collect())
}

async fn comment_nodes(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    ids: &[String],
) -> Result<CommentNodesQuery, AppError> {
    let payload = serde_json::json!({
        "query": COMMENT_NODES_QUERY,
        "variables": { "owner": owner, "repository": repository, "ids": ids }
    });
    client.graphql(&payload).await.map_err(github_error)
}

fn selected_repository_id(response: &CommentNodesQuery) -> Result<&str, AppError> {
    response
        .repository
        .as_ref()
        .map(|repository| repository.id.as_str())
        .ok_or_else(|| AppError::GitHub("GitHub did not return the selected repository".into()))
}

fn validate_issue_comment_node(
    node: IssueCommentNode,
    repository_id: &str,
    number: u64,
    kind: GitHubConversationCommentKind,
) -> Result<IssueCommentNode, AppError> {
    let parent_matches = match kind {
        GitHubConversationCommentKind::Issue => {
            node.issue.number == number && node.pull_request.is_none()
        }
        GitHubConversationCommentKind::PullRequest => {
            node.issue.number == number
                && node
                    .pull_request
                    .as_ref()
                    .is_some_and(|pull_request| pull_request.number == number)
        }
    };
    if node.repository.id != repository_id || !parent_matches {
        return Err(AppError::GitHub(
            "GitHub returned a comment outside the selected conversation".to_string(),
        ));
    }
    Ok(node)
}

fn validate_review_comment_node(
    node: PullRequestReviewCommentNode,
    repository_id: &str,
    pull_request_number: u64,
) -> Result<PullRequestReviewCommentNode, AppError> {
    if node.repository.id != repository_id || node.pull_request.number != pull_request_number {
        return Err(AppError::GitHub(
            "GitHub returned a review comment outside the selected pull request".to_string(),
        ));
    }
    Ok(node)
}

#[cfg(test)]
fn ensure_mutation_allowed(
    mutation: &GitHubCommentMutation,
    current_updated_at: &str,
    viewer_can_update: bool,
    viewer_can_delete: bool,
    current_is_pinned: bool,
    viewer_can_pin: bool,
    viewer_can_unpin: bool,
) -> Result<(), AppError> {
    ensure_mutation_allowed_with_minimize(
        mutation,
        current_updated_at,
        viewer_can_update,
        viewer_can_delete,
        current_is_pinned,
        viewer_can_pin,
        viewer_can_unpin,
        false,
        false,
        false,
    )
}

#[allow(clippy::too_many_arguments)]
fn ensure_mutation_allowed_with_minimize(
    mutation: &GitHubCommentMutation,
    current_updated_at: &str,
    viewer_can_update: bool,
    viewer_can_delete: bool,
    current_is_pinned: bool,
    viewer_can_pin: bool,
    viewer_can_unpin: bool,
    current_is_minimized: bool,
    viewer_can_minimize: bool,
    viewer_can_unminimize: bool,
) -> Result<(), AppError> {
    let allowed = match mutation {
        GitHubCommentMutation::Update { .. } => viewer_can_update,
        GitHubCommentMutation::Delete { .. } => viewer_can_delete,
        GitHubCommentMutation::Pin { .. } => viewer_can_pin,
        GitHubCommentMutation::Unpin { .. } => viewer_can_unpin,
        GitHubCommentMutation::Minimize { .. } => viewer_can_minimize,
        GitHubCommentMutation::Unminimize { .. } => viewer_can_unminimize,
    };
    if !allowed {
        return Err(AppError::GitHubPermission(
            "GitHub does not allow the viewer to change this comment".to_string(),
        ));
    }
    if mutation.expected_updated_at() != current_updated_at {
        return Err(AppError::GitHubCommentConflict(
            "the comment changed after it was loaded".to_string(),
        ));
    }
    if let Some(expected_pinned) = mutation.expected_pinned() {
        let requested_pinned = matches!(mutation, GitHubCommentMutation::Pin { .. });
        if expected_pinned != current_is_pinned || requested_pinned == current_is_pinned {
            return Err(AppError::GitHubCommentConflict(
                "the comment pin state changed after it was loaded".to_string(),
            ));
        }
    }
    if let Some(expected_minimized) = mutation.expected_minimized() {
        let requested_minimized = matches!(mutation, GitHubCommentMutation::Minimize { .. });
        if expected_minimized != current_is_minimized || requested_minimized == current_is_minimized
        {
            return Err(AppError::GitHubCommentConflict(
                "the comment minimize state changed after it was loaded".to_string(),
            ));
        }
    }
    Ok(())
}

fn ensure_requested_comment_id(actual: &str, expected: &str) -> Result<(), AppError> {
    if actual == expected {
        Ok(())
    } else {
        Err(AppError::GitHub(
            "GitHub returned a different comment node".to_string(),
        ))
    }
}

fn mutation_identity(action: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let sequence = COMMENT_MUTATION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!(
        "harbor:{action}:{}:{timestamp}:{sequence}",
        std::process::id()
    )
}

fn ensure_mutation_identity(actual: Option<&str>, expected: &str) -> Result<(), AppError> {
    if actual == Some(expected) {
        Ok(())
    } else {
        Err(AppError::GitHub(
            "GitHub returned a different comment mutation".to_string(),
        ))
    }
}

fn issue_timeline_item_from_graphql(node: IssueCommentNode) -> GitHubIssueTimelineItem {
    let (actor, actor_avatar_url) = actor_from_graphql(node.author);
    GitHubIssueTimelineItem {
        reaction_subject: Some(GitHubReactionSubjectRef {
            id: node.id.clone(),
            kind: GitHubReactionSubjectKind::IssueComment,
        }),
        id: node.id,
        kind: GitHubIssueTimelineKind::Comment,
        event: "commented".to_string(),
        actor: Some(actor),
        actor_avatar_url,
        author_association: node.author_association,
        body: Some(node.body),
        url: Some(node.url),
        created_at: Some(node.created_at),
        updated_at: Some(node.updated_at),
        viewer_can_update: node.viewer_can_update,
        viewer_can_delete: node.viewer_can_delete,
        is_pinned: node.is_pinned.unwrap_or(false),
        viewer_can_pin: node.viewer_can_pin,
        viewer_can_unpin: node.viewer_can_unpin,
        viewer_can_minimize: node.viewer_can_minimize,
        viewer_can_unminimize: node.viewer_can_unminimize,
        is_minimized: node.is_minimized,
        minimized_reason: node.minimized_reason,
        label: None,
        assignee: None,
        milestone: None,
        rename_from: None,
        rename_to: None,
        commit_id: None,
        review_id: None,
        review_state: None,
    }
}

fn review_comment_from_graphql(
    node: PullRequestReviewCommentNode,
) -> GitHubPullRequestReviewThreadComment {
    let (author, author_avatar_url) = actor_from_graphql(node.author);
    GitHubPullRequestReviewThreadComment {
        id: node.id,
        database_id: node
            .full_database_id
            .and_then(|database_id| database_id.parse().ok()),
        author,
        author_avatar_url,
        author_association: node.author_association,
        body: node.body,
        url: node.url,
        created_at: node.created_at,
        updated_at: node.updated_at,
        pending: node.state.eq_ignore_ascii_case("PENDING"),
        viewer_can_update: node.viewer_can_update,
        viewer_can_delete: node.viewer_can_delete,
        viewer_can_minimize: node.viewer_can_minimize,
        viewer_can_unminimize: node.viewer_can_unminimize,
        is_minimized: node.is_minimized,
        minimized_reason: node.minimized_reason,
        outdated: node.outdated,
    }
}

fn actor_from_graphql(actor: Option<CommentActor>) -> (String, Option<String>) {
    actor
        .map(|actor| (actor.login, actor.avatar_url))
        .unwrap_or_else(|| ("ghost".to_string(), None))
}

#[derive(Deserialize)]
struct CommentNodesQuery {
    repository: Option<CommentRepository>,
    nodes: Vec<Option<CommentNode>>,
}

#[derive(Deserialize)]
struct CommentRepository {
    id: String,
}

#[derive(Deserialize)]
#[serde(tag = "__typename")]
enum CommentNode {
    IssueComment(IssueCommentNode),
    PullRequestReviewComment(PullRequestReviewCommentNode),
    #[serde(other)]
    Unsupported,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueCommentNode {
    id: String,
    body: String,
    url: String,
    created_at: String,
    updated_at: String,
    author_association: Option<String>,
    is_pinned: Option<bool>,
    is_minimized: bool,
    minimized_reason: Option<String>,
    viewer_can_update: bool,
    viewer_can_delete: bool,
    viewer_can_minimize: bool,
    viewer_can_unminimize: bool,
    viewer_can_pin: bool,
    viewer_can_unpin: bool,
    repository: CommentRepository,
    issue: CommentParent,
    pull_request: Option<CommentParent>,
    author: Option<CommentActor>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewCommentNode {
    id: String,
    full_database_id: Option<String>,
    body: String,
    url: String,
    created_at: String,
    updated_at: String,
    author_association: Option<String>,
    is_minimized: bool,
    minimized_reason: Option<String>,
    outdated: bool,
    viewer_can_update: bool,
    viewer_can_delete: bool,
    viewer_can_minimize: bool,
    viewer_can_unminimize: bool,
    state: String,
    repository: CommentRepository,
    pull_request: CommentParent,
    author: Option<CommentActor>,
}

#[derive(Deserialize)]
struct CommentParent {
    number: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommentActor {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateIssueCommentMutation {
    update_issue_comment: Option<UpdateIssueCommentPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateIssueCommentPayload {
    client_mutation_id: Option<String>,
    issue_comment: Option<IssueCommentNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteIssueCommentMutation {
    delete_issue_comment: Option<CommentDeletionPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinIssueCommentMutation {
    pin_issue_comment: Option<PinIssueCommentPayload>,
    unpin_issue_comment: Option<PinIssueCommentPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PinIssueCommentPayload {
    client_mutation_id: Option<String>,
    issue_comment: Option<IssueCommentNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateReviewCommentMutation {
    update_pull_request_review_comment: Option<UpdateReviewCommentPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateReviewCommentPayload {
    client_mutation_id: Option<String>,
    pull_request_review_comment: Option<PullRequestReviewCommentNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteReviewCommentMutation {
    delete_pull_request_review_comment: Option<CommentDeletionPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommentDeletionPayload {
    client_mutation_id: Option<String>,
}

#[cfg(test)]
mod tests;
