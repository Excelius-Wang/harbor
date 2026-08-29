use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, pull_request_review_from_octocrab, AppError,
    GitHubPendingPullRequestReview, GitHubPendingPullRequestReviewComment, GitHubPullRequestReview,
    GitHubPullRequestReviewAction, GitHubPullRequestReviewComment,
    GitHubPullRequestReviewCommentSide, GitHubService, OctocrabGitHubClient,
};

#[async_trait]
pub(crate) trait GitHubPendingReviewClient: Send + Sync {
    async fn pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<Option<GitHubPendingPullRequestReview>, AppError>;
    async fn save_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        body: &str,
    ) -> Result<GitHubPendingPullRequestReview, AppError>;
    #[allow(clippy::too_many_arguments)]
    async fn save_pending_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        comment_id: Option<u64>,
        comment: &GitHubPullRequestReviewComment,
    ) -> Result<GitHubPendingPullRequestReview, AppError>;
    async fn delete_pending_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        comment_id: u64,
    ) -> Result<GitHubPendingPullRequestReview, AppError>;
    async fn submit_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        body: &str,
        action: GitHubPullRequestReviewAction,
    ) -> Result<GitHubPullRequestReview, AppError>;
    async fn delete_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
    ) -> Result<(), AppError>;
}

#[async_trait]
impl GitHubPendingReviewClient for OctocrabGitHubClient {
    async fn pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<Option<GitHubPendingPullRequestReview>, AppError> {
        get(token, owner, repository, pull_request_number).await
    }

    async fn save_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        body: &str,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        save_summary(
            token,
            owner,
            repository,
            pull_request_number,
            review_id,
            commit_id,
            body,
        )
        .await
    }

    async fn save_pending_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        comment_id: Option<u64>,
        comment: &GitHubPullRequestReviewComment,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        save_comment(
            token,
            owner,
            repository,
            pull_request_number,
            review_id,
            commit_id,
            comment_id,
            comment,
        )
        .await
    }

    async fn delete_pending_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        comment_id: u64,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        delete_comment(
            token,
            owner,
            repository,
            pull_request_number,
            review_id,
            comment_id,
        )
        .await
    }

    async fn submit_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        body: &str,
        action: GitHubPullRequestReviewAction,
    ) -> Result<GitHubPullRequestReview, AppError> {
        submit(
            token,
            owner,
            repository,
            pull_request_number,
            review_id,
            body,
            action,
        )
        .await
    }

    async fn delete_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
    ) -> Result<(), AppError> {
        discard(token, owner, repository, pull_request_number, review_id).await
    }
}

impl GitHubService {
    pub async fn pending_pull_request_review(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<Option<GitHubPendingPullRequestReview>, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pending_pull_request_review(&token, owner, repository, pull_request_number)
            .await
    }

    pub async fn save_pending_pull_request_review(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        body: &str,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .save_pending_pull_request_review(
                &token,
                owner,
                repository,
                pull_request_number,
                review_id,
                commit_id,
                body,
            )
            .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn save_pending_pull_request_review_comment(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        comment_id: Option<u64>,
        comment: &GitHubPullRequestReviewComment,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .save_pending_pull_request_review_comment(
                &token,
                owner,
                repository,
                pull_request_number,
                review_id,
                commit_id,
                comment_id,
                comment,
            )
            .await
    }

    pub async fn delete_pending_pull_request_review_comment(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        comment_id: u64,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_pending_pull_request_review_comment(
                &token,
                owner,
                repository,
                pull_request_number,
                review_id,
                comment_id,
            )
            .await
    }

    pub async fn submit_pending_pull_request_review(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        body: &str,
        action: GitHubPullRequestReviewAction,
    ) -> Result<GitHubPullRequestReview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .submit_pending_pull_request_review(
                &token,
                owner,
                repository,
                pull_request_number,
                review_id,
                body,
                action,
            )
            .await
    }

    pub async fn delete_pending_pull_request_review(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_pending_pull_request_review(
                &token,
                owner,
                repository,
                pull_request_number,
                review_id,
            )
            .await
    }
}

const ADD_REVIEW_THREAD_MUTATION: &str = r#"
mutation AddPendingPullRequestReviewThread(
  $reviewId: ID!
  $path: String!
  $body: String!
  $line: Int!
  $side: DiffSide!
  $startLine: Int
  $startSide: DiffSide
) {
  addPullRequestReviewThread(
    input: {
      pullRequestReviewId: $reviewId
      path: $path
      body: $body
      subjectType: LINE
      line: $line
      side: $side
      startLine: $startLine
      startSide: $startSide
    }
  ) {
    thread {
      id
    }
  }
}
"#;

#[derive(Serialize)]
struct CreatePendingReviewRequest<'a> {
    commit_id: &'a str,
    body: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddReviewThreadMutation {
    add_pull_request_review_thread: Option<AddReviewThreadPayload>,
}

#[derive(Deserialize)]
struct AddReviewThreadPayload {
    thread: Option<NodeId>,
}

#[derive(Deserialize)]
struct NodeId {
    #[allow(dead_code)]
    id: String,
}

async fn get(
    token: &str,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<Option<GitHubPendingPullRequestReview>, AppError> {
    let client = authenticated_client(token)?;
    let Some(review) = find_for_viewer(&client, owner, repository, pull_request_number).await?
    else {
        return Ok(None);
    };
    load(&client, owner, repository, pull_request_number, review)
        .await
        .map(Some)
}

async fn save_summary(
    token: &str,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: Option<u64>,
    commit_id: &str,
    body: &str,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let client = authenticated_client(token)?;
    let existing = match review_id {
        Some(review_id) => Some(
            require_for_viewer(&client, owner, repository, pull_request_number, review_id).await?,
        ),
        None => find_for_viewer(&client, owner, repository, pull_request_number).await?,
    };
    let review = if let Some(existing) = existing {
        let route = format!(
            "/repos/{owner}/{repository}/pulls/{pull_request_number}/reviews/{}",
            existing.id.into_inner()
        );
        client
            .put(route, Some(&serde_json::json!({ "body": body })))
            .await
            .map_err(github_error)?
    } else {
        create(
            &client,
            owner,
            repository,
            pull_request_number,
            commit_id,
            body,
        )
        .await?
    };
    load(&client, owner, repository, pull_request_number, review).await
}

#[allow(clippy::too_many_arguments)]
async fn save_comment(
    token: &str,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: Option<u64>,
    commit_id: &str,
    comment_id: Option<u64>,
    comment: &GitHubPullRequestReviewComment,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let client = authenticated_client(token)?;
    let review = match review_id {
        Some(review_id) => {
            require_for_viewer(&client, owner, repository, pull_request_number, review_id).await?
        }
        None => match find_for_viewer(&client, owner, repository, pull_request_number).await? {
            Some(review) => review,
            None => {
                create(
                    &client,
                    owner,
                    repository,
                    pull_request_number,
                    commit_id,
                    "",
                )
                .await?
            }
        },
    };
    let review_id = review.id.into_inner();

    if let Some(comment_id) = comment_id {
        ensure_comment_belongs_to_review(
            &client,
            owner,
            repository,
            pull_request_number,
            review,
            comment_id,
        )
        .await?;
        client
            .pulls(owner, repository)
            .comment(octocrab::models::CommentId(comment_id))
            .update(&comment.body)
            .await
            .map_err(github_error)?;
    } else {
        add_comment(&client, review.node_id, comment).await?;
    }

    load_by_id(&client, owner, repository, pull_request_number, review_id).await
}

async fn delete_comment(
    token: &str,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: u64,
    comment_id: u64,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let client = authenticated_client(token)?;
    let review =
        require_for_viewer(&client, owner, repository, pull_request_number, review_id).await?;
    ensure_comment_belongs_to_review(
        &client,
        owner,
        repository,
        pull_request_number,
        review,
        comment_id,
    )
    .await?;
    client
        .pulls(owner, repository)
        .comment(octocrab::models::CommentId(comment_id))
        .delete()
        .await
        .map_err(github_error)?;
    load_by_id(&client, owner, repository, pull_request_number, review_id).await
}

async fn submit(
    token: &str,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: u64,
    body: &str,
    action: GitHubPullRequestReviewAction,
) -> Result<GitHubPullRequestReview, AppError> {
    let client = authenticated_client(token)?;
    require_for_viewer(&client, owner, repository, pull_request_number, review_id).await?;
    let action = match action {
        GitHubPullRequestReviewAction::Comment => octocrab::models::pulls::ReviewAction::Comment,
        GitHubPullRequestReviewAction::Approve => octocrab::models::pulls::ReviewAction::Approve,
        GitHubPullRequestReviewAction::RequestChanges => {
            octocrab::models::pulls::ReviewAction::RequestChanges
        }
    };
    let review = client
        .pulls(owner, repository)
        .pr_review_actions(pull_request_number, review_id)
        .submit(action, body)
        .await
        .map_err(github_error)?;
    pull_request_review_from_octocrab(review).ok_or_else(|| {
        AppError::GitHub("GitHub returned an incomplete pull request review".to_string())
    })
}

async fn discard(
    token: &str,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: u64,
) -> Result<(), AppError> {
    let client = authenticated_client(token)?;
    require_for_viewer(&client, owner, repository, pull_request_number, review_id).await?;
    client
        .pulls(owner, repository)
        .pr_review_actions(pull_request_number, review_id)
        .delete_pending()
        .await
        .map_err(github_error)?;
    Ok(())
}

async fn create(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    commit_id: &str,
    body: &str,
) -> Result<octocrab::models::pulls::Review, AppError> {
    let route = format!("/repos/{owner}/{repository}/pulls/{pull_request_number}/reviews");
    client
        .post(route, Some(&CreatePendingReviewRequest { commit_id, body }))
        .await
        .map_err(github_error)
}

async fn find_for_viewer(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<Option<octocrab::models::pulls::Review>, AppError> {
    let viewer = client.current().user().await.map_err(github_error)?.login;
    let pull_handler = client.pulls(owner, repository);
    let mut page_number = 1_u32;
    let mut pending = None;

    loop {
        let page = pull_handler
            .list_reviews(pull_request_number)
            .per_page(100_u8)
            .page(page_number)
            .send()
            .await
            .map_err(github_error)?;
        for review in page.items {
            let is_viewer = review
                .user
                .as_ref()
                .is_some_and(|author| author.login.eq_ignore_ascii_case(&viewer));
            let is_pending = matches!(
                review.state,
                Some(
                    octocrab::models::pulls::ReviewState::Pending
                        | octocrab::models::pulls::ReviewState::Open
                )
            );
            if is_viewer && is_pending {
                pending = Some(review);
            }
        }
        if page.next.is_none() {
            return Ok(pending);
        }
        page_number = page_number.saturating_add(1);
    }
}

async fn require_for_viewer(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: u64,
) -> Result<octocrab::models::pulls::Review, AppError> {
    let review = find_for_viewer(client, owner, repository, pull_request_number)
        .await?
        .ok_or_else(|| {
            AppError::GitHub("GitHub has no pending review for this pull request".into())
        })?;
    if review.id.into_inner() != review_id {
        return Err(AppError::GitHub(
            "The pending review changed on GitHub; reload it before continuing".to_string(),
        ));
    }
    Ok(review)
}

async fn ensure_comment_belongs_to_review(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review: octocrab::models::pulls::Review,
    comment_id: u64,
) -> Result<(), AppError> {
    let pending = load(client, owner, repository, pull_request_number, review).await?;
    if pending
        .comments
        .iter()
        .any(|comment| comment.database_id == comment_id)
    {
        return Ok(());
    }
    Err(AppError::GitHub(
        "The pending review comment changed on GitHub; reload it before continuing".to_string(),
    ))
}

async fn add_comment(
    client: &octocrab::Octocrab,
    review_node_id: String,
    comment: &GitHubPullRequestReviewComment,
) -> Result<(), AppError> {
    let line = i32::try_from(comment.line)
        .map_err(|_| AppError::Validation("pull request review line is too large".to_string()))?;
    let start_line = comment
        .start_line
        .map(i32::try_from)
        .transpose()
        .map_err(|_| {
            AppError::Validation("pull request review start line is too large".to_string())
        })?;
    let payload = serde_json::json!({
        "query": ADD_REVIEW_THREAD_MUTATION,
        "variables": {
            "reviewId": review_node_id,
            "path": comment.path,
            "body": comment.body,
            "line": line,
            "side": comment.side.as_github_side(),
            "startLine": start_line,
            "startSide": comment.start_side.map(|side| side.as_github_side()),
        }
    });
    let response: AddReviewThreadMutation = client.graphql(&payload).await.map_err(github_error)?;
    if response
        .add_pull_request_review_thread
        .and_then(|payload| payload.thread)
        .is_some()
    {
        return Ok(());
    }
    Err(AppError::GitHub(
        "GitHub did not add the pending review comment".to_string(),
    ))
}

async fn load_by_id(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review_id: u64,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let review = client
        .pulls(owner, repository)
        .pr_review_actions(pull_request_number, review_id)
        .get()
        .await
        .map_err(github_error)?;
    load(client, owner, repository, pull_request_number, review).await
}

async fn load(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    review: octocrab::models::pulls::Review,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let review_id = review.id.into_inner();
    let pull_handler = client.pulls(owner, repository);
    let mut page_number = 1_u32;
    let mut comments = Vec::new();
    let mut uneditable_comment_count = 0_u64;

    loop {
        let page = pull_handler
            .pr_review_actions(pull_request_number, review_id)
            .list_comments()
            .per_page(100_u8)
            .page(page_number)
            .send()
            .await
            .map_err(github_error)?;
        for comment in page.items {
            let line = comment.line.or(comment.original_line);
            let side = comment.side.and_then(comment_side);
            let start_line = comment.start_line.or(comment.original_start_line);
            let start_side = comment.start_side.and_then(comment_side);
            let (Some(line), Some(side)) = (line, side) else {
                uneditable_comment_count += 1;
                continue;
            };
            let (start_line, start_side) = match (start_line, start_side) {
                (Some(start_line), Some(start_side)) if start_line < line && start_side == side => {
                    (Some(start_line), Some(start_side))
                }
                _ => (None, None),
            };
            comments.push(GitHubPendingPullRequestReviewComment {
                id: comment.node_id,
                database_id: comment.id.into_inner(),
                path: comment.path,
                line,
                side,
                start_line,
                start_side,
                body: comment.body,
            });
        }
        if page.next.is_none() {
            break;
        }
        page_number = page_number.saturating_add(1);
    }

    Ok(GitHubPendingPullRequestReview {
        id: review_id,
        node_id: review.node_id,
        body: review.body.unwrap_or_default(),
        commit_id: review.commit_id,
        comments,
        uneditable_comment_count,
    })
}

fn comment_side(side: octocrab::models::pulls::Side) -> Option<GitHubPullRequestReviewCommentSide> {
    match side {
        octocrab::models::pulls::Side::Left => Some(GitHubPullRequestReviewCommentSide::Left),
        octocrab::models::pulls::Side::Right => Some(GitHubPullRequestReviewCommentSide::Right),
        _ => None,
    }
}

#[cfg(test)]
fn fake_pending_review() -> GitHubPendingPullRequestReview {
    GitHubPendingPullRequestReview {
        id: 87,
        node_id: "PRR_kwDOexample".to_string(),
        body: "Please check the edge case.".to_string(),
        commit_id: Some("abc1234".to_string()),
        comments: vec![GitHubPendingPullRequestReviewComment {
            id: "PRRC_kwDOexample".to_string(),
            database_id: 701,
            path: "src/review.rs".to_string(),
            line: 42,
            side: GitHubPullRequestReviewCommentSide::Right,
            start_line: Some(40),
            start_side: Some(GitHubPullRequestReviewCommentSide::Right),
            body: "Please cover this branch.".to_string(),
        }],
        uneditable_comment_count: 0,
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubPendingReviewClient for super::tests::FakeGitHubClient {
    async fn pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<Option<GitHubPendingPullRequestReview>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, pull_request_number),
            ("octocat", "hello-world", 12)
        );
        Ok(Some(fake_pending_review()))
    }

    async fn save_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        body: &str,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        assert_eq!(
            (token, owner, repository, pull_request_number),
            ("github-user-access-token", "octocat", "hello-world", 12)
        );
        assert_eq!(review_id, Some(87));
        assert_eq!(commit_id, "abc1234");
        let mut review = fake_pending_review();
        review.body = body.to_string();
        Ok(review)
    }

    async fn save_pending_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: Option<u64>,
        commit_id: &str,
        comment_id: Option<u64>,
        comment: &GitHubPullRequestReviewComment,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        assert_eq!(
            (token, owner, repository, pull_request_number),
            ("github-user-access-token", "octocat", "hello-world", 12)
        );
        assert_eq!(review_id, Some(87));
        assert_eq!(commit_id, "abc1234");
        assert_eq!(comment_id, Some(701));
        let mut review = fake_pending_review();
        review.comments[0].body = comment.body.clone();
        Ok(review)
    }

    async fn delete_pending_pull_request_review_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        comment_id: u64,
    ) -> Result<GitHubPendingPullRequestReview, AppError> {
        assert_eq!(
            (
                token,
                owner,
                repository,
                pull_request_number,
                review_id,
                comment_id,
            ),
            (
                "github-user-access-token",
                "octocat",
                "hello-world",
                12,
                87,
                701,
            )
        );
        let mut review = fake_pending_review();
        review.comments.clear();
        Ok(review)
    }

    async fn submit_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
        body: &str,
        action: GitHubPullRequestReviewAction,
    ) -> Result<GitHubPullRequestReview, AppError> {
        assert_eq!(
            (token, owner, repository, pull_request_number, review_id),
            ("github-user-access-token", "octocat", "hello-world", 12, 87)
        );
        assert_eq!(action, GitHubPullRequestReviewAction::Comment);
        Ok(GitHubPullRequestReview {
            id: review_id,
            node_id: format!("PRR_{review_id}"),
            author: "octocat".to_string(),
            author_avatar_url: Some("https://github.com/octocat.png".to_string()),
            author_association: Some("owner".to_string()),
            state: super::GitHubPullRequestReviewState::Commented,
            body: Some(body.to_string()),
            url: "https://github.com/octocat/hello-world/pull/12#pullrequestreview-87".to_string(),
            commit_id: Some("abc1234".to_string()),
            submitted_at: Some("2026-08-27T12:00:00+00:00".to_string()),
        })
    }

    async fn delete_pending_pull_request_review(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        review_id: u64,
    ) -> Result<(), AppError> {
        assert_eq!(
            (token, owner, repository, pull_request_number, review_id),
            ("github-user-access-token", "octocat", "hello-world", 12, 87)
        );
        Ok(())
    }
}
