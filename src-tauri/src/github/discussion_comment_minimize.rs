use serde::Deserialize;

use super::{
    comment::{run_minimize_mutation, GitHubCommentMutation},
    github_error, GitHubCommentMinimizeClassifier,
};
use crate::error::AppError;

const DISCUSSION_COMMENT_STATE_QUERY: &str = r#"
query HarborDiscussionCommentState(
  $owner: String!
  $repository: String!
  $number: Int!
  $commentId: ID!
) {
  repository(owner: $owner, name: $repository) {
    id
    discussion(number: $number) { id }
  }
  node(id: $commentId) {
    __typename
    ... on DiscussionComment {
      id
      updatedAt
      isMinimized
      minimizedReason
      deletedAt
      viewerCanMinimize
      viewerCanUnminimize
      discussion {
        number
        repository { id nameWithOwner }
      }
    }
  }
}
"#;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum GitHubDiscussionCommentMutation {
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

impl GitHubDiscussionCommentMutation {
    pub(crate) fn comment_id(&self) -> &str {
        match self {
            Self::Minimize { comment_id, .. } | Self::Unminimize { comment_id, .. } => comment_id,
        }
    }

    fn as_comment_mutation(&self) -> GitHubCommentMutation {
        match self {
            Self::Minimize {
                comment_id,
                expected_updated_at,
                expected_minimized,
                classifier,
            } => GitHubCommentMutation::Minimize {
                comment_id: comment_id.clone(),
                expected_updated_at: expected_updated_at.clone(),
                expected_minimized: *expected_minimized,
                classifier: *classifier,
            },
            Self::Unminimize {
                comment_id,
                expected_updated_at,
                expected_minimized,
            } => GitHubCommentMutation::Unminimize {
                comment_id: comment_id.clone(),
                expected_updated_at: expected_updated_at.clone(),
                expected_minimized: *expected_minimized,
            },
        }
    }
}

pub(crate) async fn mutate_discussion_comment(
    token: &str,
    owner: &str,
    repository: &str,
    discussion_number: u64,
    mutation: &GitHubDiscussionCommentMutation,
) -> Result<(), AppError> {
    let client = discussion_comment_client(token)?;
    let current = fetch_discussion_comment_state(
        &client,
        owner,
        repository,
        discussion_number,
        mutation.comment_id(),
    )
    .await?;
    ensure_discussion_comment_mutation_allowed(mutation, &current)?;

    let generic_mutation = mutation.as_comment_mutation();
    run_minimize_mutation(&client, &generic_mutation).await?;

    let refreshed = fetch_discussion_comment_state(
        &client,
        owner,
        repository,
        discussion_number,
        mutation.comment_id(),
    )
    .await
    .map_err(discussion_comment_minimize_postflight_error)?;
    ensure_discussion_comment_minimized_result(&refreshed, mutation)
}

fn discussion_comment_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

async fn fetch_discussion_comment_state(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    discussion_number: u64,
    comment_id: &str,
) -> Result<ValidatedDiscussionCommentState, AppError> {
    let payload = serde_json::json!({
        "query": DISCUSSION_COMMENT_STATE_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "number": i32::try_from(discussion_number).map_err(|_| {
                AppError::Validation("discussion number exceeds GitHub's GraphQL range".into())
            })?,
            "commentId": comment_id,
        }
    });
    let response: DiscussionCommentStateQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    validate_discussion_comment_state(response, owner, repository, discussion_number, comment_id)
}

fn validate_discussion_comment_state(
    response: DiscussionCommentStateQuery,
    owner: &str,
    repository: &str,
    discussion_number: u64,
    comment_id: &str,
) -> Result<ValidatedDiscussionCommentState, AppError> {
    let selected_repository = response
        .repository
        .ok_or_else(|| AppError::GitHub("GitHub did not return the selected repository".into()))?;
    let repository_id = selected_repository.id;
    if selected_repository.discussion.is_none() {
        return Err(AppError::GitHub(
            "GitHub did not return the selected discussion".into(),
        ));
    }
    let node = response.node.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested discussion comment".into())
    })?;
    if node.type_name != "DiscussionComment" {
        return Err(AppError::Validation(
            "the selected node is not a discussion comment".to_string(),
        ));
    }
    let id = node.id.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the discussion comment identity".into())
    })?;
    if id != comment_id {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected discussion comment".into(),
        ));
    }
    let discussion = node
        .discussion
        .ok_or_else(|| AppError::GitHub("GitHub did not return the comment's discussion".into()))?;
    let expected_repository = format!("{owner}/{repository}");
    if discussion.number != discussion_number
        || discussion.repository.id != repository_id
        || !discussion
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(&expected_repository)
    {
        return Err(AppError::Validation(
            "the selected comment does not belong to this discussion".to_string(),
        ));
    }
    if node.deleted_at.is_some() {
        return Err(AppError::Validation(
            "deleted discussion comments cannot be minimized".to_string(),
        ));
    }
    Ok(ValidatedDiscussionCommentState {
        id,
        updated_at: node.updated_at.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the discussion comment revision".into())
        })?,
        is_minimized: node.is_minimized.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the discussion comment state".into())
        })?,
        minimized_reason: node.minimized_reason,
        viewer_can_minimize: node.viewer_can_minimize.unwrap_or(false),
        viewer_can_unminimize: node.viewer_can_unminimize.unwrap_or(false),
    })
}

fn ensure_discussion_comment_mutation_allowed(
    mutation: &GitHubDiscussionCommentMutation,
    current: &ValidatedDiscussionCommentState,
) -> Result<(), AppError> {
    if mutation.comment_id() != current.id {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected discussion comment".into(),
        ));
    }
    let (expected_updated_at, expected_minimized, allowed, requested_minimized) = match mutation {
        GitHubDiscussionCommentMutation::Minimize {
            expected_updated_at,
            expected_minimized,
            ..
        } => (
            expected_updated_at,
            *expected_minimized,
            current.viewer_can_minimize,
            true,
        ),
        GitHubDiscussionCommentMutation::Unminimize {
            expected_updated_at,
            expected_minimized,
            ..
        } => (
            expected_updated_at,
            *expected_minimized,
            current.viewer_can_unminimize,
            false,
        ),
    };
    if !allowed {
        return Err(AppError::GitHubPermission(
            "GitHub does not allow the viewer to change this discussion comment".into(),
        ));
    }
    if expected_updated_at != &current.updated_at {
        return Err(AppError::GitHubCommentConflict(
            "the discussion comment changed after it was loaded".into(),
        ));
    }
    if expected_minimized != current.is_minimized || requested_minimized == current.is_minimized {
        return Err(AppError::GitHubCommentConflict(
            "the discussion comment minimize state changed after it was loaded".into(),
        ));
    }
    Ok(())
}

fn ensure_discussion_comment_minimized_result(
    current: &ValidatedDiscussionCommentState,
    mutation: &GitHubDiscussionCommentMutation,
) -> Result<(), AppError> {
    let matches = match mutation {
        GitHubDiscussionCommentMutation::Minimize { classifier, .. } => {
            current.is_minimized
                && current.minimized_reason.as_deref() == Some(classifier.response_reason())
        }
        GitHubDiscussionCommentMutation::Unminimize { .. } => {
            !current.is_minimized && current.minimized_reason.is_none()
        }
    };
    if matches {
        Ok(())
    } else {
        Err(AppError::GitHubCommentConflict(
            "the discussion comment minimize state did not match the requested mutation".into(),
        ))
    }
}

fn discussion_comment_minimize_postflight_error(error: AppError) -> AppError {
    AppError::GitHub(format!(
        "the discussion comment minimize write may have persisted, but Harbor could not refresh it: {error}"
    ))
}

#[derive(Deserialize)]
struct DiscussionCommentStateQuery {
    repository: Option<GraphQlDiscussionCommentStateRepository>,
    node: Option<GraphQlDiscussionCommentStateNode>,
}

#[derive(Deserialize)]
struct GraphQlDiscussionCommentStateRepository {
    id: String,
    discussion: Option<GraphQlNode>,
}

#[derive(Deserialize)]
struct GraphQlNode {
    #[allow(dead_code)]
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCommentStateNode {
    #[serde(rename = "__typename")]
    type_name: String,
    id: Option<String>,
    updated_at: Option<String>,
    is_minimized: Option<bool>,
    minimized_reason: Option<String>,
    deleted_at: Option<String>,
    viewer_can_minimize: Option<bool>,
    viewer_can_unminimize: Option<bool>,
    discussion: Option<GraphQlDiscussionCommentStateDiscussion>,
}

#[derive(Deserialize)]
struct GraphQlDiscussionCommentStateDiscussion {
    number: u64,
    repository: GraphQlDiscussionCommentStateRepositoryDetails,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCommentStateRepositoryDetails {
    id: String,
    name_with_owner: String,
}

struct ValidatedDiscussionCommentState {
    id: String,
    updated_at: String,
    is_minimized: bool,
    minimized_reason: Option<String>,
    viewer_can_minimize: bool,
    viewer_can_unminimize: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn current() -> ValidatedDiscussionCommentState {
        ValidatedDiscussionCommentState {
            id: "DC_1".to_string(),
            updated_at: "2026-08-28T10:00:00Z".to_string(),
            is_minimized: false,
            minimized_reason: None,
            viewer_can_minimize: true,
            viewer_can_unminimize: false,
        }
    }

    #[test]
    fn discussion_comment_minimize_guards_require_capability_and_fresh_state() {
        let current = current();
        let minimize = GitHubDiscussionCommentMutation::Minimize {
            comment_id: "DC_1".to_string(),
            expected_updated_at: current.updated_at.clone(),
            expected_minimized: false,
            classifier: GitHubCommentMinimizeClassifier::OffTopic,
        };

        assert!(ensure_discussion_comment_mutation_allowed(&minimize, &current).is_ok());
        assert!(ensure_discussion_comment_mutation_allowed(
            &GitHubDiscussionCommentMutation::Unminimize {
                comment_id: "DC_1".to_string(),
                expected_updated_at: current.updated_at.clone(),
                expected_minimized: false,
            },
            &current,
        )
        .is_err());

        let stale = GitHubDiscussionCommentMutation::Minimize {
            comment_id: "DC_1".to_string(),
            expected_updated_at: "2026-08-28T09:00:00Z".to_string(),
            expected_minimized: false,
            classifier: GitHubCommentMinimizeClassifier::OffTopic,
        };
        assert!(ensure_discussion_comment_mutation_allowed(&stale, &current).is_err());
    }

    #[test]
    fn discussion_comment_state_query_requires_minimize_capabilities() {
        assert!(DISCUSSION_COMMENT_STATE_QUERY.contains("viewerCanMinimize"));
        assert!(DISCUSSION_COMMENT_STATE_QUERY.contains("viewerCanUnminimize"));
        assert!(DISCUSSION_COMMENT_STATE_QUERY.contains("$number: Int!"));
    }

    #[test]
    fn discussion_comment_state_validates_repository_and_discussion_scope() {
        let response: DiscussionCommentStateQuery = serde_json::from_value(serde_json::json!({
            "repository": { "id": "R_1", "discussion": { "id": "D_1" } },
            "node": {
                "__typename": "DiscussionComment",
                "id": "DC_1",
                "updatedAt": "2026-08-28T10:00:00Z",
                "isMinimized": false,
                "minimizedReason": null,
                "deletedAt": null,
                "viewerCanMinimize": true,
                "viewerCanUnminimize": false,
                "discussion": {
                    "number": 42,
                    "repository": { "id": "R_1", "nameWithOwner": "octocat/hello-world" }
                }
            }
        }))
        .expect("discussion comment state");
        let state =
            validate_discussion_comment_state(response, "octocat", "hello-world", 42, "DC_1")
                .expect("validated discussion comment state");
        assert!(state.viewer_can_minimize);
        assert!(!state.is_minimized);
    }
}
