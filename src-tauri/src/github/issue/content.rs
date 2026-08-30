use async_trait::async_trait;

use super::super::comment::{enrich_issue_timeline_comments, GitHubConversationCommentKind};
#[cfg(test)]
use super::GitHubIssueClient;
use super::{
    authenticated_client, ensure_octocrab_issue, github_error, issue_from_octocrab,
    timeline_item_from_issue_comment, GitHubIssue, GitHubIssueTimelineItem, GitHubService,
    OctocrabGitHubClient,
};
use crate::error::AppError;

#[cfg(test)]
mod tests;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GitHubIssueCreateInput {
    title: String,
    body: String,
    labels: Vec<String>,
    assignees: Vec<String>,
}

impl GitHubIssueCreateInput {
    pub(crate) fn new(
        title: String,
        body: String,
        labels: Vec<String>,
        assignees: Vec<String>,
    ) -> Self {
        Self {
            title,
            body,
            labels,
            assignees,
        }
    }
}

#[async_trait]
pub(crate) trait GitHubIssueContentClient: Send + Sync {
    async fn create_issue(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubIssueCreateInput,
    ) -> Result<GitHubIssue, AppError>;

    async fn update_issue_content(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubIssue, AppError>;

    async fn create_issue_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError>;
}

impl GitHubService {
    pub async fn create_issue(
        &self,
        owner: &str,
        repository: &str,
        input: &GitHubIssueCreateInput,
    ) -> Result<GitHubIssue, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_issue(&token, owner, repository, input)
            .await
    }

    pub async fn update_issue_content(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubIssue, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_issue_content(&token, owner, repository, issue_number, title, body)
            .await
    }

    pub async fn create_issue_comment(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_issue_comment(&token, owner, repository, issue_number, body)
            .await
    }
}

#[async_trait]
impl GitHubIssueContentClient for OctocrabGitHubClient {
    async fn create_issue(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubIssueCreateInput,
    ) -> Result<GitHubIssue, AppError> {
        let client = authenticated_client(token)?;
        create_issue_with_client(&client, owner, repository, input).await
    }

    async fn update_issue_content(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubIssue, AppError> {
        let client = authenticated_client(token)?;
        let handler = client.issues(owner, repository);
        let issue = handler.get(issue_number).await.map_err(github_error)?;
        ensure_octocrab_issue(&issue)?;
        if issue.title == title && issue.body.as_deref().unwrap_or_default() == body {
            return Ok(issue_from_octocrab(issue));
        }

        let issue = handler
            .update(issue_number)
            .title(title)
            .body(body)
            .send()
            .await
            .map_err(github_error)?;

        Ok(issue_from_octocrab(issue))
    }

    async fn create_issue_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError> {
        let client = authenticated_client(token)?;
        let handler = client.issues(owner, repository);
        let issue = handler.get(issue_number).await.map_err(github_error)?;
        ensure_octocrab_issue(&issue)?;
        let comment = handler
            .create_comment(issue_number, body)
            .await
            .map_err(github_error)?;

        let timeline = enrich_issue_timeline_comments(
            &client,
            owner,
            repository,
            issue_number,
            GitHubConversationCommentKind::Issue,
            vec![timeline_item_from_issue_comment(comment)],
        )
        .await?;
        timeline.into_iter().next().ok_or_else(|| {
            AppError::GitHub("GitHub did not return the created issue comment".to_string())
        })
    }
}

async fn create_issue_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    input: &GitHubIssueCreateInput,
) -> Result<GitHubIssue, AppError> {
    let handler = client.issues(owner, repository);
    let mut request = handler.create(input.title.clone()).body(input.body.clone());
    if !input.labels.is_empty() {
        request = request.labels(input.labels.clone());
    }
    if !input.assignees.is_empty() {
        request = request.assignees(input.assignees.clone());
    }
    let issue = request.send().await.map_err(github_error)?;
    Ok(issue_from_octocrab(issue))
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueContentClient for super::super::tests::FakeGitHubClient {
    async fn create_issue(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubIssueCreateInput,
    ) -> Result<GitHubIssue, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        let mut issue = self
            .issue_detail(token, owner, repository, 7, 1)
            .await?
            .issue;
        issue.id = 9;
        issue.number = 9;
        issue.title = input.title.clone();
        issue.body = Some(input.body.clone());
        issue.url = "https://github.com/octocat/hello-world/issues/9".to_string();
        Ok(issue)
    }

    async fn update_issue_content(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        title: &str,
        body: &str,
    ) -> Result<GitHubIssue, AppError> {
        let mut issue = self
            .issue_detail(token, owner, repository, issue_number, 1)
            .await?
            .issue;
        issue.title = title.to_string();
        issue.body = Some(body.to_string());
        Ok(issue)
    }

    async fn create_issue_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(GitHubIssueTimelineItem {
            id: "IC_84".to_string(),
            reaction_subject: Some(super::GitHubReactionSubjectRef {
                id: "IC_84".to_string(),
                kind: super::GitHubReactionSubjectKind::IssueComment,
            }),
            kind: super::GitHubIssueTimelineKind::Comment,
            event: "commented".to_string(),
            actor: Some("octocat".to_string()),
            actor_avatar_url: Some("https://github.com/octocat.png".to_string()),
            author_association: Some("OWNER".to_string()),
            body: Some(body.to_string()),
            url: Some(
                "https://github.com/octocat/hello-world/issues/7#issuecomment-84".to_string(),
            ),
            created_at: Some("2026-08-26T10:00:00+00:00".to_string()),
            updated_at: Some("2026-08-26T10:00:00+00:00".to_string()),
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
            review_id: None,
            review_state: None,
        })
    }
}
