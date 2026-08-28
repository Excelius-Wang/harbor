use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::super::{
    authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient,
};

const COMPARE_PULL_REQUEST_BASE_BRANCH_QUERY: &str = r#"
query HarborComparePullRequestBaseBranch(
  $owner: String!
  $repository: String!
  $pullRequestNumber: Int!
  $headRef: String!
) {
  repository(owner: $owner, name: $repository) {
    pullRequest(number: $pullRequestNumber) {
      baseRef {
        compare(headRef: $headRef) {
          behindBy
        }
      }
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestBranchUpdateState {
    Available,
    UpToDate,
    Conflicts,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestBranchUpdateStatus {
    pub state: GitHubPullRequestBranchUpdateState,
    pub head_sha: String,
    pub behind_by: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestBranchUpdate {
    pub message: String,
    pub url: Option<String>,
}

#[async_trait]
pub(crate) trait GitHubPullRequestBranchClient: Send + Sync {
    async fn pull_request_branch_update_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestBranchUpdateStatus, AppError>;

    async fn update_pull_request_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestBranchUpdate, AppError>;
}

#[async_trait]
impl GitHubPullRequestBranchClient for OctocrabGitHubClient {
    async fn pull_request_branch_update_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestBranchUpdateStatus, AppError> {
        let client = authenticated_client(token)?;
        let pull_request = client
            .pulls(owner, repository)
            .get(pull_request_number)
            .await
            .map_err(github_error)?;

        branch_update_status(&client, owner, repository, &pull_request).await
    }

    async fn update_pull_request_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestBranchUpdate, AppError> {
        let client = authenticated_client(token)?;
        let pull_request = client
            .pulls(owner, repository)
            .get(pull_request_number)
            .await
            .map_err(github_error)?;
        ensure_expected_head(&pull_request, expected_head_sha)?;
        let status = branch_update_status(&client, owner, repository, &pull_request).await?;
        ensure_branch_update_available(&status)?;

        let route =
            format!("/repos/{owner}/{repository}/pulls/{pull_request_number}/update-branch");
        let response: PullRequestBranchUpdateResponse = client
            .put(
                route,
                Some(&PullRequestBranchUpdateRequest { expected_head_sha }),
            )
            .await
            .map_err(pull_request_branch_update_error)?;

        Ok(GitHubPullRequestBranchUpdate {
            message: response
                .message
                .filter(|message| !message.trim().is_empty())
                .unwrap_or_else(|| "GitHub accepted the pull request branch update".to_string()),
            url: response.url.filter(|url| !url.trim().is_empty()),
        })
    }
}

impl GitHubService {
    pub async fn pull_request_branch_update_status(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestBranchUpdateStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_branch_update_status(&token, owner, repository, pull_request_number)
            .await
    }

    pub async fn update_pull_request_branch(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestBranchUpdate, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_pull_request_branch(
                &token,
                owner,
                repository,
                pull_request_number,
                expected_head_sha,
            )
            .await
    }
}

async fn branch_update_status(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request: &octocrab::models::pulls::PullRequest,
) -> Result<GitHubPullRequestBranchUpdateStatus, AppError> {
    if !is_open_pull_request(pull_request) {
        return Ok(status_from_pull_request(
            pull_request,
            GitHubPullRequestBranchUpdateState::Unavailable,
            0,
        ));
    }
    if pull_request.mergeable == Some(false) {
        return Ok(status_from_pull_request(
            pull_request,
            GitHubPullRequestBranchUpdateState::Conflicts,
            0,
        ));
    }

    let payload = comparison_payload(
        owner,
        repository,
        pull_request.number,
        &comparison_head_ref(pull_request, owner),
    );
    let response: PullRequestBranchComparisonQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    let behind_by = comparison_behind_by(response)?;
    let state = if behind_by == 0 {
        GitHubPullRequestBranchUpdateState::UpToDate
    } else {
        GitHubPullRequestBranchUpdateState::Available
    };

    Ok(status_from_pull_request(pull_request, state, behind_by))
}

fn is_open_pull_request(pull_request: &octocrab::models::pulls::PullRequest) -> bool {
    !pull_request.merged.unwrap_or_default()
        && matches!(pull_request.state, Some(octocrab::models::IssueState::Open))
}

fn status_from_pull_request(
    pull_request: &octocrab::models::pulls::PullRequest,
    state: GitHubPullRequestBranchUpdateState,
    behind_by: u64,
) -> GitHubPullRequestBranchUpdateStatus {
    GitHubPullRequestBranchUpdateStatus {
        state,
        head_sha: pull_request.head.sha.clone(),
        behind_by,
    }
}

fn comparison_head_ref(
    pull_request: &octocrab::models::pulls::PullRequest,
    base_owner: &str,
) -> String {
    let Some(label) = pull_request.head.label.as_deref() else {
        return pull_request.head.ref_field.clone();
    };
    let Some((head_owner, head_ref)) = label.split_once(':') else {
        return label.to_string();
    };
    if head_owner.eq_ignore_ascii_case(base_owner) {
        head_ref.to_string()
    } else {
        label.to_string()
    }
}

fn comparison_payload(
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    head_ref: &str,
) -> serde_json::Value {
    serde_json::json!({
        "query": COMPARE_PULL_REQUEST_BASE_BRANCH_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "pullRequestNumber": pull_request_number,
            "headRef": head_ref,
        }
    })
}

fn comparison_behind_by(response: PullRequestBranchComparisonQuery) -> Result<u64, AppError> {
    response
        .repository
        .and_then(|repository| repository.pull_request)
        .and_then(|pull_request| pull_request.base_ref)
        .and_then(|base_ref| base_ref.compare)
        .map(|comparison| comparison.behind_by.max(0) as u64)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the pull request branch comparison".to_string())
        })
}

fn ensure_expected_head(
    pull_request: &octocrab::models::pulls::PullRequest,
    expected_head_sha: &str,
) -> Result<(), AppError> {
    if !is_open_pull_request(pull_request) {
        return Err(AppError::Validation(
            "only open pull requests can update their branch".to_string(),
        ));
    }
    if pull_request.head.sha != expected_head_sha {
        return Err(AppError::GitHubPullRequestBranchUpdateConflict(
            "the pull request head changed before the branch update started".to_string(),
        ));
    }
    if pull_request.mergeable == Some(false) {
        return Err(AppError::GitHubPullRequestBranchUpdateConflict(
            "the pull request branch has conflicts with its base branch".to_string(),
        ));
    }
    Ok(())
}

fn ensure_branch_update_available(
    status: &GitHubPullRequestBranchUpdateStatus,
) -> Result<(), AppError> {
    match status.state {
        GitHubPullRequestBranchUpdateState::Available => Ok(()),
        GitHubPullRequestBranchUpdateState::Conflicts => {
            Err(AppError::GitHubPullRequestBranchUpdateConflict(
                "the pull request branch has conflicts with its base branch".to_string(),
            ))
        }
        GitHubPullRequestBranchUpdateState::UpToDate => Err(AppError::Validation(
            "the pull request branch is already up to date".to_string(),
        )),
        GitHubPullRequestBranchUpdateState::Unavailable => Err(AppError::Validation(
            "the pull request branch cannot be updated".to_string(),
        )),
    }
}

fn pull_request_branch_update_error(error: octocrab::Error) -> AppError {
    match &error {
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 422 => {
            AppError::GitHubPullRequestBranchUpdateConflict(error.to_string())
        }
        _ => github_error(error),
    }
}

#[derive(Serialize)]
struct PullRequestBranchUpdateRequest<'a> {
    expected_head_sha: &'a str,
}

#[derive(Deserialize)]
struct PullRequestBranchUpdateResponse {
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestBranchComparisonQuery {
    repository: Option<PullRequestBranchComparisonRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestBranchComparisonRepository {
    pull_request: Option<PullRequestBranchComparisonPullRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestBranchComparisonPullRequest {
    base_ref: Option<PullRequestBranchComparisonBaseRef>,
}

#[derive(Deserialize)]
struct PullRequestBranchComparisonBaseRef {
    compare: Option<PullRequestBranchComparison>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestBranchComparison {
    behind_by: i64,
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestBranchClient for super::super::tests::FakeGitHubClient {
    async fn pull_request_branch_update_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestBranchUpdateStatus, AppError> {
        use super::super::GitHubClient;

        let pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        let state = match pull_request.mergeable_state.as_deref() {
            Some("behind") => GitHubPullRequestBranchUpdateState::Available,
            Some("dirty") if pull_request.mergeable == Some(false) => {
                GitHubPullRequestBranchUpdateState::Conflicts
            }
            _ if pull_request.state != super::super::GitHubPullRequestState::Open
                || pull_request.merged =>
            {
                GitHubPullRequestBranchUpdateState::Unavailable
            }
            _ => GitHubPullRequestBranchUpdateState::UpToDate,
        };
        Ok(GitHubPullRequestBranchUpdateStatus {
            state,
            head_sha: pull_request.head_sha,
            behind_by: u64::from(state == GitHubPullRequestBranchUpdateState::Available),
        })
    }

    async fn update_pull_request_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        expected_head_sha: &str,
    ) -> Result<GitHubPullRequestBranchUpdate, AppError> {
        use super::super::GitHubClient;

        let pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        if pull_request.head_sha != expected_head_sha {
            return Err(AppError::GitHubPullRequestBranchUpdateConflict(
                "the fake pull request head changed".to_string(),
            ));
        }
        Ok(GitHubPullRequestBranchUpdate {
            message: "Updating pull request branch.".to_string(),
            url: Some(pull_request.url),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comparison_uses_an_unqualified_head_for_the_base_repository() {
        let current = pull_request("open", false, Some(true), "octocat:feature/harbor");

        assert_eq!(comparison_head_ref(&current, "OctoCat"), "feature/harbor");

        let fork = pull_request("open", false, Some(true), "hubot:feature/harbor");
        assert_eq!(
            comparison_head_ref(&fork, "octocat"),
            "hubot:feature/harbor"
        );
    }

    #[test]
    fn comparison_payload_matches_the_github_cli_query_shape() {
        let payload = comparison_payload("octocat", "hello-world", 12, "hubot:feature/harbor");

        assert_eq!(payload["variables"]["owner"], "octocat");
        assert_eq!(payload["variables"]["repository"], "hello-world");
        assert_eq!(payload["variables"]["pullRequestNumber"], 12);
        assert_eq!(payload["variables"]["headRef"], "hubot:feature/harbor");
        assert!(payload["query"]
            .as_str()
            .expect("comparison query")
            .contains("baseRef"));
    }

    #[test]
    fn comparison_response_requires_the_authoritative_behind_count() {
        let response: PullRequestBranchComparisonQuery =
            serde_json::from_value(serde_json::json!({
                "repository": {
                    "pullRequest": {
                        "baseRef": { "compare": { "behindBy": 4 } }
                    }
                }
            }))
            .expect("comparison response");
        assert_eq!(comparison_behind_by(response).expect("behind count"), 4);

        let missing: PullRequestBranchComparisonQuery =
            serde_json::from_value(serde_json::json!({ "repository": null }))
                .expect("missing comparison");
        assert!(comparison_behind_by(missing).is_err());
    }

    #[test]
    fn expected_head_guard_rejects_closed_conflicting_or_changed_pull_requests() {
        let current = pull_request("open", false, Some(true), "octocat:feature/harbor");
        assert!(ensure_expected_head(&current, "abc1234").is_ok());
        assert!(matches!(
            ensure_expected_head(&current, "def5678"),
            Err(AppError::GitHubPullRequestBranchUpdateConflict(_))
        ));

        let closed = pull_request("closed", false, Some(true), "octocat:feature/harbor");
        assert!(matches!(
            ensure_expected_head(&closed, "abc1234"),
            Err(AppError::Validation(_))
        ));

        let conflicts = pull_request("open", false, Some(false), "octocat:feature/harbor");
        assert!(matches!(
            ensure_expected_head(&conflicts, "abc1234"),
            Err(AppError::GitHubPullRequestBranchUpdateConflict(_))
        ));
    }

    #[test]
    fn update_request_serializes_the_official_stale_revision_guard() {
        let request = PullRequestBranchUpdateRequest {
            expected_head_sha: "abc1234",
        };

        assert_eq!(
            serde_json::to_value(request).expect("update request"),
            serde_json::json!({ "expected_head_sha": "abc1234" })
        );
    }

    #[test]
    fn update_availability_has_explicit_terminal_states() {
        let available = GitHubPullRequestBranchUpdateStatus {
            state: GitHubPullRequestBranchUpdateState::Available,
            head_sha: "abc1234".to_string(),
            behind_by: 2,
        };
        assert!(ensure_branch_update_available(&available).is_ok());

        for state in [
            GitHubPullRequestBranchUpdateState::UpToDate,
            GitHubPullRequestBranchUpdateState::Unavailable,
        ] {
            assert!(matches!(
                ensure_branch_update_available(&GitHubPullRequestBranchUpdateStatus {
                    state,
                    ..available.clone()
                }),
                Err(AppError::Validation(_))
            ));
        }
        assert!(matches!(
            ensure_branch_update_available(&GitHubPullRequestBranchUpdateStatus {
                state: GitHubPullRequestBranchUpdateState::Conflicts,
                ..available
            }),
            Err(AppError::GitHubPullRequestBranchUpdateConflict(_))
        ));
    }

    fn pull_request(
        state: &str,
        merged: bool,
        mergeable: Option<bool>,
        head_label: &str,
    ) -> octocrab::models::pulls::PullRequest {
        serde_json::from_value(serde_json::json!({
            "id": 3,
            "number": 12,
            "url": "https://api.github.com/repos/octocat/hello-world/pulls/12",
            "state": state,
            "merged": merged,
            "mergeable": mergeable,
            "head": {
                "label": head_label,
                "ref": "feature/harbor",
                "sha": "abc1234"
            },
            "base": {
                "label": "octocat:main",
                "ref": "main",
                "sha": "base1234"
            }
        }))
        .expect("pull request fixture")
    }
}
