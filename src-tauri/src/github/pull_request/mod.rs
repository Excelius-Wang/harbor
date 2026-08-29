use async_trait::async_trait;
use serde::Serialize;

use super::comment::{enrich_issue_timeline_comments, GitHubConversationCommentKind};
use super::{
    authenticated_client, github_error, pull_request_from_octocrab,
    pull_request_review_from_octocrab, timeline_item_from_issue_comment, AppError,
    GitHubIssueTimelineItem, GitHubPullRequest, GitHubPullRequestMergeMethod,
    GitHubPullRequestReview, GitHubPullRequestReviewAction, GitHubPullRequestReviewComment,
    GitHubPullRequestState, GitHubService, OctocrabGitHubClient,
};
use super::{item_metadata, item_metadata::GitHubItemKind};

pub(crate) mod auto_merge;
pub(crate) mod creation;
pub(crate) mod lifecycle;
pub(crate) mod merge_queue;
pub(crate) mod reviewer;
pub(crate) mod update_branch;

pub(crate) fn graphql_pull_request_number(pull_request_number: u64) -> Result<i32, AppError> {
    i32::try_from(pull_request_number).map_err(|_| {
        AppError::Validation("pull request number is too large for GitHub GraphQL".to_string())
    })
}

#[cfg(test)]
use super::GitHubPullRequestReviewCommentSide;

#[async_trait]
pub(crate) trait GitHubPullRequestMutationClient: Send + Sync {
    async fn update_pull_request_content(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubPullRequest, AppError>;

    async fn update_pull_request_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        state: GitHubPullRequestState,
    ) -> Result<GitHubPullRequest, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn update_pull_request_metadata(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubPullRequest, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn merge_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        head_sha: &str,
        method: GitHubPullRequestMergeMethod,
        commit_title: Option<&str>,
        commit_message: Option<&str>,
    ) -> Result<GitHubPullRequest, AppError>;

    async fn create_pull_request_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn create_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        commit_id: &str,
        body: &str,
        action: GitHubPullRequestReviewAction,
        comments: &[GitHubPullRequestReviewComment],
    ) -> Result<GitHubPullRequestReview, AppError>;
}

#[async_trait]
impl GitHubPullRequestMutationClient for OctocrabGitHubClient {
    async fn update_pull_request_content(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubPullRequest, AppError> {
        let client = authenticated_client(token)?;
        let pull_request = client
            .pulls(owner, repository)
            .update(pull_request_number)
            .title(title)
            .body(body)
            .send()
            .await
            .map_err(github_error)?;

        Ok(pull_request_from_octocrab(pull_request))
    }

    async fn update_pull_request_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        state: GitHubPullRequestState,
    ) -> Result<GitHubPullRequest, AppError> {
        let client = authenticated_client(token)?;
        let pull_request = client
            .pulls(owner, repository)
            .update(pull_request_number)
            .state(octocrab_state(state))
            .send()
            .await
            .map_err(github_error)?;
        let pull_request = pull_request_from_octocrab(pull_request);
        if pull_request.state != state {
            return Err(AppError::GitHubPermission(
                "GitHub did not apply the requested pull request state change".to_string(),
            ));
        }

        Ok(pull_request)
    }

    async fn update_pull_request_metadata(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubPullRequest, AppError> {
        let client = authenticated_client(token)?;
        item_metadata::update(
            &client,
            owner,
            repository,
            pull_request_number,
            GitHubItemKind::PullRequest,
            labels,
            assignees,
            milestone,
        )
        .await?;
        let pull_request = client
            .pulls(owner, repository)
            .get(pull_request_number)
            .await
            .map_err(github_error)?;

        Ok(pull_request_from_octocrab(pull_request))
    }

    async fn merge_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        head_sha: &str,
        method: GitHubPullRequestMergeMethod,
        commit_title: Option<&str>,
        commit_message: Option<&str>,
    ) -> Result<GitHubPullRequest, AppError> {
        let client = authenticated_client(token)?;
        let pull_handler = client.pulls(owner, repository);
        let mut request = pull_handler
            .merge(pull_request_number)
            .sha(head_sha)
            .method(method.as_octocrab_method());
        if method != GitHubPullRequestMergeMethod::Rebase {
            if let Some(title) = commit_title {
                request = request.title(title);
            }
            if let Some(message) = commit_message {
                request = request.message(message);
            }
        }
        let result = request.send().await.map_err(github_error)?;
        if !result.merged {
            return Err(AppError::GitHub(result.message.unwrap_or_else(|| {
                "GitHub did not merge the pull request".to_string()
            })));
        }
        let pull_request = pull_handler
            .get(pull_request_number)
            .await
            .map_err(github_error)?;

        Ok(pull_request_from_octocrab(pull_request))
    }

    async fn create_pull_request_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError> {
        let client = authenticated_client(token)?;
        client
            .pulls(owner, repository)
            .get(pull_request_number)
            .await
            .map_err(github_error)?;
        let comment = client
            .issues(owner, repository)
            .create_comment(pull_request_number, body)
            .await
            .map_err(github_error)?;

        let timeline = enrich_issue_timeline_comments(
            &client,
            owner,
            repository,
            pull_request_number,
            GitHubConversationCommentKind::PullRequest,
            vec![timeline_item_from_issue_comment(comment)],
        )
        .await?;
        timeline.into_iter().next().ok_or_else(|| {
            AppError::GitHub("GitHub did not return the created pull request comment".to_string())
        })
    }

    async fn create_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        commit_id: &str,
        body: &str,
        action: GitHubPullRequestReviewAction,
        comments: &[GitHubPullRequestReviewComment],
    ) -> Result<GitHubPullRequestReview, AppError> {
        let client = authenticated_client(token)?;
        let route = format!("/repos/{owner}/{repository}/pulls/{pull_request_number}/reviews");
        let request = pull_request_review_request(commit_id, body, action, comments);
        let review: octocrab::models::pulls::Review = client
            .post(route, Some(&request))
            .await
            .map_err(github_error)?;

        pull_request_review_from_octocrab(review).ok_or_else(|| {
            AppError::GitHub("GitHub returned an incomplete pull request review".to_string())
        })
    }
}

impl GitHubService {
    pub async fn update_pull_request_content(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_pull_request_content(
                &token,
                owner,
                repository,
                pull_request_number,
                title,
                body,
            )
            .await
    }

    pub async fn update_pull_request_state(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        state: GitHubPullRequestState,
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_pull_request_state(&token, owner, repository, pull_request_number, state)
            .await
    }

    pub async fn update_pull_request_metadata(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_pull_request_metadata(
                &token,
                owner,
                repository,
                pull_request_number,
                labels,
                assignees,
                milestone,
            )
            .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn merge_pull_request(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        head_sha: &str,
        method: GitHubPullRequestMergeMethod,
        commit_title: Option<&str>,
        commit_message: Option<&str>,
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .merge_pull_request(
                &token,
                owner,
                repository,
                pull_request_number,
                head_sha,
                method,
                commit_title,
                commit_message,
            )
            .await
    }

    pub async fn create_pull_request_comment(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_pull_request_comment(&token, owner, repository, pull_request_number, body)
            .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_pull_request_review(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        commit_id: &str,
        body: &str,
        action: GitHubPullRequestReviewAction,
        comments: &[GitHubPullRequestReviewComment],
    ) -> Result<GitHubPullRequestReview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_pull_request_review(
                &token,
                owner,
                repository,
                pull_request_number,
                commit_id,
                body,
                action,
                comments,
            )
            .await
    }
}

fn octocrab_state(state: GitHubPullRequestState) -> octocrab::params::pulls::State {
    match state {
        GitHubPullRequestState::Open => octocrab::params::pulls::State::Open,
        GitHubPullRequestState::Closed => octocrab::params::pulls::State::Closed,
    }
}

#[derive(Serialize)]
struct PullRequestReviewCommentRequest<'a> {
    path: &'a str,
    line: u64,
    side: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_line: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    start_side: Option<&'static str>,
    body: &'a str,
}

#[derive(Serialize)]
struct PullRequestReviewRequest<'a> {
    commit_id: &'a str,
    body: &'a str,
    event: &'static str,
    comments: Vec<PullRequestReviewCommentRequest<'a>>,
}

fn pull_request_review_request<'a>(
    commit_id: &'a str,
    body: &'a str,
    action: GitHubPullRequestReviewAction,
    comments: &'a [GitHubPullRequestReviewComment],
) -> PullRequestReviewRequest<'a> {
    PullRequestReviewRequest {
        commit_id,
        body,
        event: action.as_github_event(),
        comments: comments
            .iter()
            .map(|comment| PullRequestReviewCommentRequest {
                path: &comment.path,
                line: comment.line,
                side: comment.side.as_github_side(),
                start_line: comment.start_line,
                start_side: comment.start_side.map(|side| side.as_github_side()),
                body: &comment.body,
            })
            .collect(),
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestMutationClient for super::tests::FakeGitHubClient {
    async fn update_pull_request_content(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubPullRequest, AppError> {
        use super::GitHubClient;

        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        pull_request.title = title.to_string();
        pull_request.body = Some(body.to_string());
        Ok(pull_request)
    }

    async fn update_pull_request_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        state: GitHubPullRequestState,
    ) -> Result<GitHubPullRequest, AppError> {
        use super::GitHubClient;

        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        pull_request.state = state;
        pull_request.closed_at = (state == GitHubPullRequestState::Closed)
            .then(|| "2026-08-27T09:00:00+00:00".to_string());
        Ok(pull_request)
    }

    async fn update_pull_request_metadata(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubPullRequest, AppError> {
        use super::GitHubClient;

        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        pull_request.labels = labels
            .iter()
            .map(|name| super::GitHubIssueLabel {
                name: name.clone(),
                color: "d73a4a".to_string(),
            })
            .collect();
        pull_request.assignees = assignees.to_vec();
        pull_request.milestone = milestone.map(|number| format!("Milestone {number}"));
        pull_request.milestone_number = milestone;
        Ok(pull_request)
    }

    async fn merge_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        head_sha: &str,
        method: GitHubPullRequestMergeMethod,
        commit_title: Option<&str>,
        commit_message: Option<&str>,
    ) -> Result<GitHubPullRequest, AppError> {
        use super::GitHubClient;

        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, pull_request_number, head_sha),
            ("octocat", "hello-world", 12, "abc1234")
        );
        assert_eq!(method, GitHubPullRequestMergeMethod::Squash);
        assert_eq!(commit_title, Some("Ship the PR workspace (#12)"));
        assert_eq!(commit_message, Some("Keep the desktop flow focused."));
        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        pull_request.state = GitHubPullRequestState::Closed;
        pull_request.merged = true;
        pull_request.merged_by = Some("octocat".to_string());
        pull_request.closed_at = Some("2026-08-27T09:00:00+00:00".to_string());
        pull_request.merged_at = pull_request.closed_at.clone();
        Ok(pull_request)
    }

    async fn create_pull_request_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, pull_request_number),
            ("octocat", "hello-world", 12)
        );
        Ok(GitHubIssueTimelineItem {
            id: "IC_85".to_string(),
            kind: super::GitHubIssueTimelineKind::Comment,
            event: "commented".to_string(),
            actor: Some("octocat".to_string()),
            actor_avatar_url: Some("https://github.com/octocat.png".to_string()),
            author_association: Some("OWNER".to_string()),
            body: Some(body.to_string()),
            url: Some("https://github.com/octocat/hello-world/pull/12#issuecomment-85".to_string()),
            created_at: Some("2026-08-26T11:00:00+00:00".to_string()),
            updated_at: Some("2026-08-26T11:00:00+00:00".to_string()),
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
        })
    }

    async fn create_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        commit_id: &str,
        body: &str,
        action: GitHubPullRequestReviewAction,
        comments: &[GitHubPullRequestReviewComment],
    ) -> Result<GitHubPullRequestReview, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, pull_request_number, commit_id),
            ("octocat", "hello-world", 12, "abc1234")
        );
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].path, "src/review.rs");
        assert_eq!(comments[0].line, 42);
        assert_eq!(comments[0].start_line, Some(40));
        assert_eq!(
            comments[0].start_side,
            Some(GitHubPullRequestReviewCommentSide::Right)
        );
        let state = match action {
            GitHubPullRequestReviewAction::Comment => {
                super::GitHubPullRequestReviewState::Commented
            }
            GitHubPullRequestReviewAction::Approve => super::GitHubPullRequestReviewState::Approved,
            GitHubPullRequestReviewAction::RequestChanges => {
                super::GitHubPullRequestReviewState::ChangesRequested
            }
        };
        Ok(GitHubPullRequestReview {
            id: 86,
            author: "octocat".to_string(),
            author_avatar_url: Some("https://github.com/octocat.png".to_string()),
            author_association: Some("owner".to_string()),
            state,
            body: (!body.is_empty()).then(|| body.to_string()),
            url: "https://github.com/octocat/hello-world/pull/12#pullrequestreview-86".to_string(),
            commit_id: Some(commit_id.to_string()),
            submitted_at: Some("2026-08-26T12:00:00+00:00".to_string()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn state_update_uses_githubs_open_and_closed_values() {
        let client = octocrab::Octocrab::default();
        let handler = client.pulls("octocat", "hello-world");
        let open = handler
            .update(12)
            .state(octocrab_state(GitHubPullRequestState::Open));
        let closed = handler
            .update(12)
            .state(octocrab_state(GitHubPullRequestState::Closed));

        assert_eq!(
            serde_json::to_value(open).expect("open pull request update"),
            serde_json::json!({ "pull_number": 12, "state": "open" })
        );
        assert_eq!(
            serde_json::to_value(closed).expect("closed pull request update"),
            serde_json::json!({ "pull_number": 12, "state": "closed" })
        );
    }

    #[test]
    fn review_payload_uses_modern_line_coordinates() {
        let comments = vec![
            GitHubPullRequestReviewComment {
                path: "src/review.rs".to_string(),
                line: 42,
                side: GitHubPullRequestReviewCommentSide::Right,
                start_line: Some(40),
                start_side: Some(GitHubPullRequestReviewCommentSide::Right),
                body: "Please cover this branch.".to_string(),
            },
            GitHubPullRequestReviewComment {
                path: "src/review.rs".to_string(),
                line: 50,
                side: GitHubPullRequestReviewCommentSide::Right,
                start_line: None,
                start_side: None,
                body: "This line still needs a fallback.".to_string(),
            },
        ];
        let request = pull_request_review_request(
            "abc1234",
            "Please add a regression test.",
            GitHubPullRequestReviewAction::RequestChanges,
            &comments,
        );

        assert_eq!(
            serde_json::to_value(request).expect("review payload"),
            serde_json::json!({
                "commit_id": "abc1234",
                "body": "Please add a regression test.",
                "event": "REQUEST_CHANGES",
                "comments": [{
                    "path": "src/review.rs",
                    "line": 42,
                    "side": "RIGHT",
                    "start_line": 40,
                    "start_side": "RIGHT",
                    "body": "Please cover this branch."
                }, {
                    "path": "src/review.rs",
                    "line": 50,
                    "side": "RIGHT",
                    "body": "This line still needs a fallback."
                }]
            })
        );
    }
}
