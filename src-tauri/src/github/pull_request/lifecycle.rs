use async_trait::async_trait;
use serde::Deserialize;

use super::super::{
    authenticated_client, github_error, pull_request_from_octocrab, AppError, GitHubPullRequest,
    GitHubService, OctocrabGitHubClient,
};

const MARK_READY_FOR_REVIEW_MUTATION: &str = r#"
mutation HarborMarkPullRequestReadyForReview($pullRequestId: ID!) {
  markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
    pullRequest {
      id
      isDraft
    }
  }
}
"#;

const CONVERT_TO_DRAFT_MUTATION: &str = r#"
mutation HarborConvertPullRequestToDraft($pullRequestId: ID!) {
  convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
    pullRequest {
      id
      isDraft
    }
  }
}
"#;

#[async_trait]
pub(crate) trait GitHubPullRequestLifecycleClient: Send + Sync {
    async fn set_pull_request_draft(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError>;
}

#[async_trait]
impl GitHubPullRequestLifecycleClient for OctocrabGitHubClient {
    async fn set_pull_request_draft(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError> {
        let client = authenticated_client(token)?;
        let handler = client.pulls(owner, repository);
        let current = handler
            .get(pull_request_number)
            .await
            .map_err(github_error)?;
        ensure_open_pull_request(&current)?;

        if current.draft.unwrap_or_default() == draft {
            return Ok(pull_request_from_octocrab(current));
        }

        let node_id = current
            .node_id
            .as_deref()
            .filter(|node_id| !node_id.trim().is_empty())
            .ok_or_else(|| {
                AppError::GitHub(
                    "GitHub did not return the pull request GraphQL node ID".to_string(),
                )
            })?;
        let payload = draft_mutation_payload(node_id, draft);
        let response: PullRequestDraftMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let mutation_state = draft_state_from_response(response, draft)?;
        ensure_requested_draft_state(&mutation_state, node_id, draft)?;

        let updated = handler
            .get(pull_request_number)
            .await
            .map_err(github_error)?;
        if updated.draft.unwrap_or_default() != draft {
            return Err(AppError::GitHubPermission(
                "GitHub did not persist the requested pull request draft state".to_string(),
            ));
        }

        Ok(pull_request_from_octocrab(updated))
    }
}

impl GitHubService {
    pub async fn set_pull_request_draft(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .set_pull_request_draft(&token, owner, repository, pull_request_number, draft)
            .await
    }
}

fn ensure_open_pull_request(
    pull_request: &octocrab::models::pulls::PullRequest,
) -> Result<(), AppError> {
    if pull_request.merged.unwrap_or_default()
        || !matches!(pull_request.state, Some(octocrab::models::IssueState::Open))
    {
        return Err(AppError::Validation(
            "only open pull requests can change draft state".to_string(),
        ));
    }
    Ok(())
}

fn draft_mutation_payload(node_id: &str, draft: bool) -> serde_json::Value {
    serde_json::json!({
        "query": if draft {
            CONVERT_TO_DRAFT_MUTATION
        } else {
            MARK_READY_FOR_REVIEW_MUTATION
        },
        "variables": {
            "pullRequestId": node_id,
        }
    })
}

fn draft_state_from_response(
    response: PullRequestDraftMutation,
    draft: bool,
) -> Result<GraphQlPullRequestDraftState, AppError> {
    let pull_request = if draft {
        response
            .convert_pull_request_to_draft
            .and_then(|payload| payload.pull_request)
    } else {
        response
            .mark_pull_request_ready_for_review
            .and_then(|payload| payload.pull_request)
    };
    pull_request.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the updated pull request draft state".to_string())
    })
}

fn ensure_requested_draft_state(
    state: &GraphQlPullRequestDraftState,
    node_id: &str,
    draft: bool,
) -> Result<(), AppError> {
    if state.id == node_id && state.is_draft == draft {
        return Ok(());
    }
    Err(AppError::GitHubPermission(
        "GitHub did not apply the requested pull request draft state".to_string(),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestDraftMutation {
    #[serde(default)]
    convert_pull_request_to_draft: Option<PullRequestDraftMutationPayload>,
    #[serde(default)]
    mark_pull_request_ready_for_review: Option<PullRequestDraftMutationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestDraftMutationPayload {
    pull_request: Option<GraphQlPullRequestDraftState>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPullRequestDraftState {
    id: String,
    is_draft: bool,
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestLifecycleClient for super::super::tests::FakeGitHubClient {
    async fn set_pull_request_draft(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError> {
        use super::super::GitHubClient;

        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        if pull_request.state != super::super::GitHubPullRequestState::Open || pull_request.merged {
            return Err(AppError::Validation(
                "only open pull requests can change draft state".to_string(),
            ));
        }
        pull_request.draft = draft;
        Ok(pull_request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draft_payload_selects_the_official_graphql_mutation() {
        let draft = draft_mutation_payload("PR_kwDOexample", true);
        let ready = draft_mutation_payload("PR_kwDOexample", false);

        assert_eq!(draft["variables"]["pullRequestId"], "PR_kwDOexample");
        assert!(draft["query"]
            .as_str()
            .expect("draft query")
            .contains("convertPullRequestToDraft"));
        assert!(ready["query"]
            .as_str()
            .expect("ready query")
            .contains("markPullRequestReadyForReview"));
    }

    #[test]
    fn draft_response_uses_the_requested_mutation_result() {
        let draft: PullRequestDraftMutation = serde_json::from_value(serde_json::json!({
            "convertPullRequestToDraft": {
                "pullRequest": { "id": "PR_kwDOexample", "isDraft": true }
            }
        }))
        .expect("draft response");
        let ready: PullRequestDraftMutation = serde_json::from_value(serde_json::json!({
            "markPullRequestReadyForReview": {
                "pullRequest": { "id": "PR_kwDOexample", "isDraft": false }
            }
        }))
        .expect("ready response");

        assert!(
            draft_state_from_response(draft, true)
                .expect("draft state")
                .is_draft
        );
        assert!(
            !draft_state_from_response(ready, false)
                .expect("ready state")
                .is_draft
        );
    }

    #[test]
    fn draft_state_verification_rejects_a_stale_or_different_pull_request() {
        let state = GraphQlPullRequestDraftState {
            id: "PR_kwDOother".to_string(),
            is_draft: false,
        };

        assert!(ensure_requested_draft_state(&state, "PR_kwDOexample", false).is_err());
        assert!(ensure_requested_draft_state(&state, "PR_kwDOother", true).is_err());
        assert!(ensure_requested_draft_state(&state, "PR_kwDOother", false).is_ok());
    }

    #[test]
    fn closed_pull_requests_cannot_change_draft_state() {
        let open: octocrab::models::pulls::PullRequest =
            serde_json::from_value(pull_request_json("open")).expect("open pull request");
        let closed: octocrab::models::pulls::PullRequest =
            serde_json::from_value(pull_request_json("closed")).expect("closed pull request");

        assert!(ensure_open_pull_request(&open).is_ok());
        assert!(ensure_open_pull_request(&closed).is_err());
    }

    fn pull_request_json(state: &str) -> serde_json::Value {
        serde_json::json!({
            "id": 12,
            "number": 12,
            "url": "https://api.github.com/repos/octocat/hello-world/pulls/12",
            "node_id": "PR_kwDOexample",
            "state": state,
            "draft": state == "open",
            "merged": false,
            "head": { "ref": "feature", "sha": "abc1234" },
            "base": { "ref": "main", "sha": "def5678" }
        })
    }
}
