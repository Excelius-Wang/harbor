use async_trait::async_trait;
use serde::Serialize;

use super::super::{
    authenticated_client, github_error, pull_request_from_octocrab, AppError, GitHubPullRequest,
    GitHubPullRequestCommit, GitHubService, OctocrabGitHubClient,
};

const COMPARISON_COMMIT_PREVIEW_LIMIT: u8 = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestComparisonStatus {
    Ahead,
    Behind,
    Diverged,
    Identical,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestComparison {
    pub base: String,
    pub head: String,
    pub status: GitHubPullRequestComparisonStatus,
    pub ahead_by: u64,
    pub behind_by: u64,
    pub total_commits: u64,
    pub changed_files: u64,
    pub additions: u64,
    pub deletions: u64,
    pub commits: Vec<GitHubPullRequestCommit>,
    pub suggested_title: String,
}

#[async_trait]
pub(crate) trait GitHubPullRequestCreationClient: Send + Sync {
    async fn compare_pull_request_branches(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
    ) -> Result<GitHubPullRequestComparison, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn create_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
        title: &str,
        body: &str,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError>;
}

#[async_trait]
impl GitHubPullRequestCreationClient for OctocrabGitHubClient {
    async fn compare_pull_request_branches(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
    ) -> Result<GitHubPullRequestComparison, AppError> {
        let client = authenticated_client(token)?;
        load_comparison(&client, owner, repository, base, head).await
    }

    async fn create_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
        title: &str,
        body: &str,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError> {
        let client = authenticated_client(token)?;
        let comparison = client
            .commits(owner, repository)
            .compare(base, head)
            .per_page(1)
            .page(1_u32)
            .send()
            .await
            .map_err(github_error)?;
        ensure_comparison_can_create_pull_request(base, head, comparison.ahead_by)?;

        let pull_request = client
            .pulls(owner, repository)
            .create(title, head, base)
            .body(body.to_string())
            .draft(draft)
            .send()
            .await
            .map_err(pull_request_creation_error)?;

        Ok(pull_request_from_octocrab(pull_request))
    }
}

impl GitHubService {
    pub async fn compare_pull_request_branches(
        &self,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
    ) -> Result<GitHubPullRequestComparison, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .compare_pull_request_branches(&token, owner, repository, base, head)
            .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_pull_request(
        &self,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
        title: &str,
        body: &str,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_pull_request(&token, owner, repository, base, head, title, body, draft)
            .await
    }
}

async fn load_comparison(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    base: &str,
    head: &str,
) -> Result<GitHubPullRequestComparison, AppError> {
    let comparison = client
        .commits(owner, repository)
        .compare(base, head)
        .per_page(COMPARISON_COMMIT_PREVIEW_LIMIT)
        .page(1_u32)
        .send()
        .await
        .map_err(github_error)?;

    Ok(pull_request_comparison_from_octocrab(
        base, head, comparison,
    ))
}

fn pull_request_comparison_from_octocrab(
    base: &str,
    head: &str,
    comparison: octocrab::models::commits::CommitComparison,
) -> GitHubPullRequestComparison {
    let files = comparison.files.unwrap_or_default();
    let changed_files = files.len() as u64;
    let additions = files.iter().map(|file| file.additions).sum();
    let deletions = files.iter().map(|file| file.deletions).sum();
    let commits = comparison
        .commits
        .into_iter()
        .map(comparison_commit_from_octocrab)
        .collect::<Vec<_>>();
    let ahead_by = non_negative_count(comparison.ahead_by);
    let suggested_title = suggested_pull_request_title(head, ahead_by, &commits);

    GitHubPullRequestComparison {
        base: base.to_string(),
        head: head.to_string(),
        status: comparison_status_from_octocrab(comparison.status),
        ahead_by,
        behind_by: non_negative_count(comparison.behind_by),
        total_commits: non_negative_count(comparison.total_commits),
        changed_files,
        additions,
        deletions,
        commits,
        suggested_title,
    }
}

fn comparison_status_from_octocrab(
    status: octocrab::models::commits::GithubCommitStatus,
) -> GitHubPullRequestComparisonStatus {
    match status {
        octocrab::models::commits::GithubCommitStatus::Ahead => {
            GitHubPullRequestComparisonStatus::Ahead
        }
        octocrab::models::commits::GithubCommitStatus::Behind => {
            GitHubPullRequestComparisonStatus::Behind
        }
        octocrab::models::commits::GithubCommitStatus::Diverged => {
            GitHubPullRequestComparisonStatus::Diverged
        }
        octocrab::models::commits::GithubCommitStatus::Identical => {
            GitHubPullRequestComparisonStatus::Identical
        }
        _ => GitHubPullRequestComparisonStatus::Diverged,
    }
}

fn comparison_commit_from_octocrab(
    commit: octocrab::models::commits::Commit,
) -> GitHubPullRequestCommit {
    let author = commit.commit.author.as_ref();
    let message = commit.commit.message;
    let title = message.lines().next().unwrap_or_default().to_string();
    GitHubPullRequestCommit {
        short_sha: commit.sha.chars().take(7).collect(),
        sha: commit.sha,
        title,
        message,
        author: author.and_then(|author| author.name.clone()),
        author_login: commit.author.as_ref().map(|author| author.login.clone()),
        author_avatar_url: commit
            .author
            .as_ref()
            .map(|author| author.avatar_url.to_string()),
        committed_at: author.and_then(|author| author.date.clone()),
        url: commit.html_url.to_string(),
        verified: commit
            .commit
            .verification
            .as_ref()
            .map(|verification| verification.verified),
    }
}

fn suggested_pull_request_title(
    head: &str,
    ahead_by: u64,
    commits: &[GitHubPullRequestCommit],
) -> String {
    if ahead_by == 1 {
        if let Some(title) = commits.last().map(|commit| commit.title.trim()) {
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }
    head.to_string()
}

fn non_negative_count(value: i64) -> u64 {
    value.max(0) as u64
}

fn ensure_comparison_can_create_pull_request(
    base: &str,
    head: &str,
    ahead_by: i64,
) -> Result<(), AppError> {
    if base == head {
        return Err(AppError::Validation(
            "pull request base and head branches must be different".to_string(),
        ));
    }
    if ahead_by <= 0 {
        return Err(AppError::GitHubPullRequestCreationConflict(
            "the head branch has no commits to merge into the base branch".to_string(),
        ));
    }
    Ok(())
}

fn pull_request_creation_error(error: octocrab::Error) -> AppError {
    match &error {
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 422 => {
            AppError::GitHubPullRequestCreationConflict(error.to_string())
        }
        _ => github_error(error),
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestCreationClient for super::super::tests::FakeGitHubClient {
    async fn compare_pull_request_branches(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
    ) -> Result<GitHubPullRequestComparison, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        let ahead_by = u64::from(base != head);
        Ok(GitHubPullRequestComparison {
            base: base.to_string(),
            head: head.to_string(),
            status: if ahead_by > 0 {
                GitHubPullRequestComparisonStatus::Ahead
            } else {
                GitHubPullRequestComparisonStatus::Identical
            },
            ahead_by,
            behind_by: 0,
            total_commits: ahead_by,
            changed_files: ahead_by,
            additions: 12 * ahead_by,
            deletions: 3 * ahead_by,
            commits: Vec::new(),
            suggested_title: head.to_string(),
        })
    }

    async fn create_pull_request(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        base: &str,
        head: &str,
        title: &str,
        body: &str,
        draft: bool,
    ) -> Result<GitHubPullRequest, AppError> {
        use super::super::GitHubClient;

        let comparison = self
            .compare_pull_request_branches(token, owner, repository, base, head)
            .await?;
        ensure_comparison_can_create_pull_request(base, head, comparison.ahead_by as i64)?;
        let mut pull_request = self
            .pull_request_detail(token, owner, repository, 13, 1)
            .await?
            .pull_request;
        pull_request.id = 13;
        pull_request.number = 13;
        pull_request.title = title.to_string();
        pull_request.body = Some(body.to_string());
        pull_request.url = "https://github.com/octocat/hello-world/pull/13".to_string();
        pull_request.draft = draft;
        pull_request.head_ref = head.to_string();
        pull_request.head_label = Some(format!("octocat:{head}"));
        pull_request.base_ref = base.to_string();
        Ok(pull_request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comparison_maps_counts_files_commits_and_single_commit_title() {
        let comparison: octocrab::models::commits::CommitComparison =
            serde_json::from_value(comparison_json("ahead", 1, 0)).expect("comparison fixture");

        let mapped = pull_request_comparison_from_octocrab("main", "feature/create", comparison);

        assert_eq!(mapped.status, GitHubPullRequestComparisonStatus::Ahead);
        assert_eq!(mapped.ahead_by, 1);
        assert_eq!(mapped.behind_by, 0);
        assert_eq!(mapped.total_commits, 1);
        assert_eq!(mapped.changed_files, 2);
        assert_eq!(mapped.additions, 15);
        assert_eq!(mapped.deletions, 4);
        assert_eq!(mapped.commits[0].short_sha, "abc1234");
        assert_eq!(mapped.commits[0].author.as_deref(), Some("Octo Cat"));
        assert_eq!(mapped.commits[0].title, "Create pull requests in Harbor");
        assert_eq!(mapped.suggested_title, "Create pull requests in Harbor");
    }

    #[test]
    fn multi_commit_comparison_uses_the_head_branch_as_the_safe_default_title() {
        let comparison: octocrab::models::commits::CommitComparison =
            serde_json::from_value(comparison_json("diverged", 3, 2)).expect("comparison fixture");

        let mapped = pull_request_comparison_from_octocrab("main", "feature/create", comparison);

        assert_eq!(mapped.status, GitHubPullRequestComparisonStatus::Diverged);
        assert_eq!(mapped.suggested_title, "feature/create");
    }

    #[tokio::test]
    async fn create_builder_serializes_title_body_branches_and_draft_natively() {
        let client = octocrab::Octocrab::default();
        let handler = client.pulls("octocat", "hello-world");
        let request = handler
            .create("Create pull requests", "feature/create", "main")
            .body("Adds the complete workflow.")
            .draft(true);

        assert_eq!(
            serde_json::to_value(request).expect("create request"),
            serde_json::json!({
                "title": "Create pull requests",
                "head": "feature/create",
                "base": "main",
                "body": "Adds the complete workflow.",
                "draft": true
            })
        );
    }

    #[test]
    fn create_guard_rejects_identical_or_empty_comparisons() {
        assert!(matches!(
            ensure_comparison_can_create_pull_request("main", "main", 1),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            ensure_comparison_can_create_pull_request("main", "feature/create", 0),
            Err(AppError::GitHubPullRequestCreationConflict(_))
        ));
        assert!(ensure_comparison_can_create_pull_request("main", "feature/create", 1).is_ok());
    }

    fn comparison_json(status: &str, ahead_by: i64, behind_by: i64) -> serde_json::Value {
        let commit = commit_json();
        serde_json::json!({
            "ahead_by": ahead_by,
            "base_commit": commit,
            "behind_by": behind_by,
            "commits": [commit_json()],
            "diff_url": "https://github.com/octocat/hello-world.diff",
            "files": [
                diff_file_json("src/create.ts", 12, 3),
                diff_file_json("src/create.test.ts", 3, 1)
            ],
            "html_url": "https://github.com/octocat/hello-world/compare/main...feature/create",
            "merge_base_commit": commit_json(),
            "patch_url": "https://github.com/octocat/hello-world.patch",
            "permalink_url": "https://github.com/octocat/hello-world/compare/abc...def",
            "status": status,
            "total_commits": ahead_by.max(0),
            "url": "https://api.github.com/repos/octocat/hello-world/compare/main...feature/create"
        })
    }

    fn commit_json() -> serde_json::Value {
        serde_json::json!({
            "url": "https://api.github.com/repos/octocat/hello-world/commits/abc1234",
            "sha": "abc1234def5678",
            "node_id": "C_abc1234",
            "html_url": "https://github.com/octocat/hello-world/commit/abc1234def5678",
            "comments_url": "https://api.github.com/repos/octocat/hello-world/commits/abc1234/comments",
            "commit": {
                "author": {
                    "name": "Octo Cat",
                    "email": "octocat@example.com",
                    "date": "2026-08-27T12:00:00Z"
                },
                "comment_count": 0,
                "committer": null,
                "message": "Create pull requests in Harbor\n\nComplete the native flow.",
                "tree": {
                    "sha": "tree1234",
                    "url": "https://api.github.com/repos/octocat/hello-world/git/trees/tree1234"
                },
                "url": "https://api.github.com/repos/octocat/hello-world/git/commits/abc1234",
                "verification": {
                    "payload": null,
                    "reason": "valid",
                    "signature": null,
                    "verified": true
                }
            },
            "author": null,
            "committer": null,
            "parents": [],
            "stats": null,
            "files": null
        })
    }

    fn diff_file_json(filename: &str, additions: u64, deletions: u64) -> serde_json::Value {
        serde_json::json!({
            "sha": "file1234",
            "filename": filename,
            "status": "modified",
            "additions": additions,
            "deletions": deletions,
            "changes": additions + deletions,
            "blob_url": "https://github.com/octocat/hello-world/blob/file1234",
            "raw_url": "https://github.com/octocat/hello-world/raw/file1234",
            "contents_url": "https://api.github.com/repos/octocat/hello-world/contents/file",
            "patch": "@@ -1 +1 @@",
            "previous_filename": null
        })
    }
}
