use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, item_metadata, pull_request_review_state_from_octocrab,
    repository_coordinates_from_search_value, serialized_enum_name, GitHubPullRequestReviewState,
    GitHubReactionSubjectKind, GitHubReactionSubjectRef, GitHubService, OctocrabGitHubClient,
    SearchParameters,
};
use crate::error::AppError;

const ISSUE_PAGE_SIZE: u8 = 30;
const ISSUE_TIMELINE_PAGE_SIZE: u8 = 100;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLabel {
    pub name: String,
    pub color: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubIssueState {
    Open,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubIssueAssignment {
    All,
    Unassigned,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubIssueSort {
    Updated,
    Created,
    Comments,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubIssueFilters {
    pub state: GitHubIssueState,
    pub assignment: GitHubIssueAssignment,
    pub query: String,
    pub label: String,
    pub sort: GitHubIssueSort,
    pub page: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubIssueInboxScope {
    Authored,
    Assigned,
    Mentioned,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubIssueInboxFilters {
    pub scope: GitHubIssueInboxScope,
    pub state: GitHubIssueState,
    pub query: String,
    pub sort: GitHubIssueSort,
    pub page: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssue {
    pub id: u64,
    pub reaction_subject: GitHubReactionSubjectRef,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: GitHubIssueState,
    pub state_reason: Option<String>,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub author_association: Option<String>,
    pub assignees: Vec<String>,
    pub labels: Vec<GitHubIssueLabel>,
    pub milestone: Option<String>,
    pub milestone_number: Option<u64>,
    pub locked: bool,
    pub comments: u32,
    pub closed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssuePage {
    pub issues: Vec<GitHubIssue>,
    pub total_count: u64,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueRepository {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub url: String,
    pub default_branch: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueSummary {
    pub issue: GitHubIssue,
    pub repository: GitHubIssueRepository,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueInboxPage {
    pub issues: Vec<GitHubIssueSummary>,
    pub total_count: u64,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLabelPage {
    pub labels: Vec<GitHubIssueLabel>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueAssignee {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueAssigneePage {
    pub assignees: Vec<GitHubIssueAssignee>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueMilestone {
    pub number: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub open_issues: u64,
    pub closed_issues: u64,
    pub due_on: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueMilestonePage {
    pub milestones: Vec<GitHubIssueMilestone>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubIssueTimelineKind {
    Comment,
    Event,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTimelineItem {
    pub id: String,
    pub reaction_subject: Option<GitHubReactionSubjectRef>,
    pub kind: GitHubIssueTimelineKind,
    pub event: String,
    pub actor: Option<String>,
    pub actor_avatar_url: Option<String>,
    pub author_association: Option<String>,
    pub body: Option<String>,
    pub url: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub label: Option<GitHubIssueLabel>,
    pub assignee: Option<String>,
    pub milestone: Option<String>,
    pub rename_from: Option<String>,
    pub rename_to: Option<String>,
    pub commit_id: Option<String>,
    pub review_state: Option<GitHubPullRequestReviewState>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueDetailPage {
    pub issue: GitHubIssue,
    pub timeline: Vec<GitHubIssueTimelineItem>,
    pub timeline_page: u32,
    pub timeline_has_previous: bool,
    pub timeline_has_more: bool,
}

#[async_trait]
pub(crate) trait GitHubIssueClient: Send + Sync {
    async fn list_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubIssueFilters,
    ) -> Result<GitHubIssuePage, AppError>;

    async fn list_issue_inbox(
        &self,
        token: &str,
        filters: &GitHubIssueInboxFilters,
    ) -> Result<GitHubIssueInboxPage, AppError>;

    async fn list_issue_labels(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueLabelPage, AppError>;

    async fn list_issue_assignees(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueAssigneePage, AppError>;

    async fn list_issue_milestones(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueMilestonePage, AppError>;

    async fn issue_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        timeline_page: u32,
    ) -> Result<GitHubIssueDetailPage, AppError>;

    async fn create_issue(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        title: &str,
        body: &str,
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

    #[allow(clippy::too_many_arguments)]
    async fn update_issue_metadata(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubIssue, AppError>;

    async fn create_issue_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        body: &str,
    ) -> Result<GitHubIssueTimelineItem, AppError>;

    async fn update_issue_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        state: GitHubIssueState,
    ) -> Result<GitHubIssue, AppError>;
}

impl GitHubService {
    pub async fn issues(
        &self,
        owner: &str,
        repository: &str,
        filters: &GitHubIssueFilters,
    ) -> Result<GitHubIssuePage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_issues(&token, owner, repository, filters)
            .await
    }

    pub async fn issue_inbox(
        &self,
        filters: &GitHubIssueInboxFilters,
    ) -> Result<GitHubIssueInboxPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.list_issue_inbox(&token, filters).await
    }

    pub async fn issue_labels(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueLabelPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_issue_labels(&token, owner, repository)
            .await
    }

    pub async fn issue_assignees(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueAssigneePage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_issue_assignees(&token, owner, repository)
            .await
    }

    pub async fn issue_milestones(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueMilestonePage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_issue_milestones(&token, owner, repository)
            .await
    }

    pub async fn issue_detail(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        timeline_page: u32,
    ) -> Result<GitHubIssueDetailPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .issue_detail(&token, owner, repository, issue_number, timeline_page)
            .await
    }

    pub async fn create_issue(
        &self,
        owner: &str,
        repository: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubIssue, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_issue(&token, owner, repository, title, body)
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

    #[allow(clippy::too_many_arguments)]
    pub async fn update_issue_metadata(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubIssue, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_issue_metadata(
                &token,
                owner,
                repository,
                issue_number,
                labels,
                assignees,
                milestone,
            )
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

    pub async fn update_issue_state(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        state: GitHubIssueState,
    ) -> Result<GitHubIssue, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_issue_state(&token, owner, repository, issue_number, state)
            .await
    }
}

#[async_trait]
impl GitHubIssueClient for OctocrabGitHubClient {
    async fn list_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubIssueFilters,
    ) -> Result<GitHubIssuePage, AppError> {
        let client = authenticated_client(token)?;
        let query = issue_search_query(owner, repository, filters);
        let page = client
            .search()
            .issues_and_pull_requests(&query)
            .sort::<String>(Some(issue_search_sort(filters.sort).to_string()))
            .order::<String>(Some("desc".to_string()))
            .per_page(ISSUE_PAGE_SIZE)
            .page(filters.page)
            .send()
            .await
            .map_err(github_error)?;
        Ok(issue_page_from_octocrab(
            page.items,
            page.total_count.unwrap_or_default(),
            filters.page,
            page.next.is_some(),
        ))
    }

    async fn list_issue_inbox(
        &self,
        token: &str,
        filters: &GitHubIssueInboxFilters,
    ) -> Result<GitHubIssueInboxPage, AppError> {
        let client = authenticated_client(token)?;
        let query = issue_inbox_search_query(filters);
        let parameters = SearchParameters {
            query: &query,
            sort: issue_search_sort(filters.sort),
            order: "desc",
            per_page: ISSUE_PAGE_SIZE,
            page: filters.page,
        };
        let page: octocrab::Page<serde_json::Value> = client
            .get("/search/issues", Some(&parameters))
            .await
            .map_err(github_error)?;
        let issues = page
            .items
            .into_iter()
            .map(issue_summary_from_search_value)
            .collect::<Result<Vec<_>, _>>()?;

        Ok(GitHubIssueInboxPage {
            issues,
            total_count: page.total_count.unwrap_or_default(),
            page: filters.page,
            has_previous: filters.page > 1,
            has_more: page.next.is_some(),
        })
    }

    async fn list_issue_labels(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueLabelPage, AppError> {
        let client = authenticated_client(token)?;
        let page = client
            .issues(owner, repository)
            .list_labels_for_repo()
            .per_page(100)
            .send()
            .await
            .map_err(github_error)?;
        let labels = client.all_pages(page).await.map_err(github_error)?;

        Ok(GitHubIssueLabelPage {
            labels: labels.into_iter().map(issue_label_from_octocrab).collect(),
        })
    }

    async fn list_issue_assignees(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueAssigneePage, AppError> {
        let client = authenticated_client(token)?;
        let page = client
            .issues(owner, repository)
            .list_assignees()
            .per_page(100)
            .send()
            .await
            .map_err(github_error)?;
        let assignees = client.all_pages(page).await.map_err(github_error)?;

        Ok(GitHubIssueAssigneePage {
            assignees: assignees
                .into_iter()
                .map(|assignee| GitHubIssueAssignee {
                    login: assignee.login,
                    avatar_url: Some(assignee.avatar_url.to_string()),
                })
                .collect(),
        })
    }

    async fn list_issue_milestones(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueMilestonePage, AppError> {
        let client = authenticated_client(token)?;
        let route = format!("/repos/{owner}/{repository}/milestones");
        let page: octocrab::Page<octocrab::models::Milestone> = client
            .get(
                route,
                Some(&IssueMilestoneParameters {
                    state: "all",
                    sort: "due_on",
                    direction: "asc",
                    per_page: 100,
                    page: 1,
                }),
            )
            .await
            .map_err(github_error)?;
        let milestones = client.all_pages(page).await.map_err(github_error)?;

        Ok(GitHubIssueMilestonePage {
            milestones: milestones
                .into_iter()
                .map(issue_milestone_from_octocrab)
                .collect::<Result<Vec<_>, _>>()?,
        })
    }

    async fn issue_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        timeline_page: u32,
    ) -> Result<GitHubIssueDetailPage, AppError> {
        let client = authenticated_client(token)?;
        let handler = client.issues(owner, repository);
        let (issue, timeline) = tokio::join!(
            handler.get(issue_number),
            handler
                .list_timeline_events(issue_number)
                .per_page(ISSUE_TIMELINE_PAGE_SIZE)
                .page(timeline_page)
                .send(),
        );
        let issue = issue.map_err(github_error)?;
        ensure_octocrab_issue(&issue)?;
        let timeline = timeline.map_err(github_error)?;

        Ok(GitHubIssueDetailPage {
            issue: issue_from_octocrab(issue),
            timeline: timeline
                .items
                .into_iter()
                .enumerate()
                .map(|(index, event)| timeline_item_from_octocrab(event, index))
                .collect(),
            timeline_page,
            timeline_has_previous: timeline_page > 1,
            timeline_has_more: timeline.next.is_some(),
        })
    }

    async fn create_issue(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubIssue, AppError> {
        let client = authenticated_client(token)?;
        let issue = client
            .issues(owner, repository)
            .create(title)
            .body(body.to_string())
            .send()
            .await
            .map_err(github_error)?;

        Ok(issue_from_octocrab(issue))
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

    async fn update_issue_metadata(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        labels: &[String],
        assignees: &[String],
        milestone: Option<u64>,
    ) -> Result<GitHubIssue, AppError> {
        let client = authenticated_client(token)?;
        let issue = item_metadata::update(
            &client,
            owner,
            repository,
            issue_number,
            item_metadata::GitHubItemKind::Issue,
            labels,
            assignees,
            milestone,
        )
        .await?;

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

        Ok(timeline_item_from_issue_comment(comment))
    }

    async fn update_issue_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        state: GitHubIssueState,
    ) -> Result<GitHubIssue, AppError> {
        let client = authenticated_client(token)?;
        let handler = client.issues(owner, repository);
        let issue = handler.get(issue_number).await.map_err(github_error)?;
        ensure_octocrab_issue(&issue)?;

        let current_state = match issue.state {
            octocrab::models::IssueState::Open => GitHubIssueState::Open,
            octocrab::models::IssueState::Closed => GitHubIssueState::Closed,
            _ => GitHubIssueState::Open,
        };
        if current_state == state {
            return Ok(issue_from_octocrab(issue));
        }

        let update = handler.update(issue_number);
        let update = match state {
            GitHubIssueState::Open => update
                .state(octocrab::models::IssueState::Open)
                .state_reason(octocrab::models::issues::IssueStateReason::Reopened),
            GitHubIssueState::Closed => update
                .state(octocrab::models::IssueState::Closed)
                .state_reason(octocrab::models::issues::IssueStateReason::Completed),
        };
        let issue = update.send().await.map_err(github_error)?;

        Ok(issue_from_octocrab(issue))
    }
}

#[derive(Serialize)]
struct IssueMilestoneParameters<'a> {
    state: &'a str,
    sort: &'a str,
    direction: &'a str,
    per_page: u8,
    page: u32,
}

fn issue_page_from_octocrab(
    issues: Vec<octocrab::models::issues::Issue>,
    total_count: u64,
    page: u32,
    has_more: bool,
) -> GitHubIssuePage {
    GitHubIssuePage {
        issues: issues
            .into_iter()
            .filter(|issue| issue.pull_request.is_none())
            .map(issue_from_octocrab)
            .collect(),
        total_count,
        page,
        has_previous: page > 1,
        has_more,
    }
}

fn issue_search_sort(sort: GitHubIssueSort) -> &'static str {
    match sort {
        GitHubIssueSort::Updated => "updated",
        GitHubIssueSort::Created => "created",
        GitHubIssueSort::Comments => "comments",
    }
}

fn issue_search_query(owner: &str, repository: &str, filters: &GitHubIssueFilters) -> String {
    let state = match filters.state {
        GitHubIssueState::Open => "open",
        GitHubIssueState::Closed => "closed",
    };
    let mut query = vec![
        issue_search_terms(&filters.query),
        format!("repo:{owner}/{repository}"),
        "is:issue".to_string(),
        format!("is:{state}"),
    ];
    if filters.assignment == GitHubIssueAssignment::Unassigned {
        query.push("no:assignee".to_string());
    }
    if !filters.label.is_empty() {
        let label = filters.label.replace('\\', "\\\\").replace('"', "\\\"");
        query.push(format!("label:\"{label}\""));
    }
    query
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn issue_inbox_search_query(filters: &GitHubIssueInboxFilters) -> String {
    let state = match filters.state {
        GitHubIssueState::Open => "open",
        GitHubIssueState::Closed => "closed",
    };
    let scope = match filters.scope {
        GitHubIssueInboxScope::Authored => "author:@me",
        GitHubIssueInboxScope::Assigned => "assignee:@me",
        GitHubIssueInboxScope::Mentioned => "mentions:@me",
    };
    [
        issue_inbox_search_terms(&filters.query),
        "is:issue".to_string(),
        format!("is:{state}"),
        scope.to_string(),
        "archived:false".to_string(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ")
}

fn issue_inbox_search_terms(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| {
            let term = term
                .trim_start_matches('-')
                .trim_matches(['(', ')'])
                .to_ascii_lowercase();
            ![
                "is:",
                "type:",
                "state:",
                "author:",
                "assignee:",
                "no:assignee",
                "mentions:",
                "involves:",
                "commenter:",
                "archived:",
            ]
            .iter()
            .any(|prefix| term.starts_with(prefix))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn issue_search_terms(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| {
            let term = term.to_ascii_lowercase();
            ![
                "repo:",
                "org:",
                "user:",
                "is:",
                "type:",
                "state:",
                "assignee:",
                "no:assignee",
            ]
            .iter()
            .any(|prefix| term.starts_with(prefix))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn issue_from_octocrab(issue: octocrab::models::issues::Issue) -> GitHubIssue {
    let state = match issue.state {
        octocrab::models::IssueState::Open => GitHubIssueState::Open,
        octocrab::models::IssueState::Closed => GitHubIssueState::Closed,
        _ => GitHubIssueState::Open,
    };
    let milestone_number = issue
        .milestone
        .as_ref()
        .and_then(|milestone| u64::try_from(milestone.number).ok());
    GitHubIssue {
        id: issue.id.into_inner(),
        reaction_subject: GitHubReactionSubjectRef {
            id: issue.node_id,
            kind: GitHubReactionSubjectKind::Issue,
        },
        number: issue.number,
        title: issue.title,
        body: issue.body,
        url: issue.html_url.to_string(),
        state,
        state_reason: issue.state_reason.as_ref().and_then(serialized_enum_name),
        author: issue.user.login,
        author_avatar_url: Some(issue.user.avatar_url.to_string()),
        author_association: issue
            .author_association
            .as_ref()
            .and_then(serialized_enum_name),
        assignees: issue
            .assignees
            .into_iter()
            .map(|assignee| assignee.login)
            .collect(),
        labels: issue
            .labels
            .into_iter()
            .map(|label| GitHubIssueLabel {
                name: label.name,
                color: label.color,
            })
            .collect(),
        milestone: issue.milestone.map(|milestone| milestone.title),
        milestone_number,
        locked: issue.locked,
        comments: issue.comments,
        closed_at: issue.closed_at.map(|closed_at| closed_at.to_rfc3339()),
        created_at: issue.created_at.to_rfc3339(),
        updated_at: issue.updated_at.to_rfc3339(),
    }
}

pub(super) fn issue_summary_from_search_value(
    value: serde_json::Value,
) -> Result<GitHubIssueSummary, AppError> {
    let (owner, name) = repository_coordinates_from_search_value(&value, "issue")?;
    let issue: octocrab::models::issues::Issue = serde_json::from_value(value)
        .map_err(|error| AppError::GitHub(format!("GitHub returned an invalid issue: {error}")))?;
    if issue.pull_request.is_some() {
        return Err(AppError::GitHub(
            "GitHub search returned a pull request in the issue inbox".to_string(),
        ));
    }

    Ok(GitHubIssueSummary {
        issue: issue_from_octocrab(issue),
        repository: GitHubIssueRepository {
            full_name: format!("{owner}/{name}"),
            url: format!("https://github.com/{owner}/{name}"),
            owner,
            name,
            default_branch: "HEAD".to_string(),
        },
    })
}

fn ensure_octocrab_issue(issue: &octocrab::models::issues::Issue) -> Result<(), AppError> {
    if issue.pull_request.is_some() {
        return Err(AppError::Validation(
            "requested number belongs to a pull request".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn timeline_item_from_issue_comment(
    comment: octocrab::models::issues::Comment,
) -> GitHubIssueTimelineItem {
    GitHubIssueTimelineItem {
        id: comment.node_id.clone(),
        reaction_subject: Some(GitHubReactionSubjectRef {
            id: comment.node_id,
            kind: GitHubReactionSubjectKind::IssueComment,
        }),
        kind: GitHubIssueTimelineKind::Comment,
        event: "commented".to_string(),
        actor: Some(comment.user.login),
        actor_avatar_url: Some(comment.user.avatar_url.to_string()),
        author_association: comment
            .author_association
            .as_ref()
            .and_then(serialized_enum_name),
        body: comment.body,
        url: Some(comment.html_url.to_string()),
        created_at: Some(comment.created_at.to_rfc3339()),
        updated_at: comment.updated_at.map(|updated_at| updated_at.to_rfc3339()),
        label: None,
        assignee: None,
        milestone: None,
        rename_from: None,
        rename_to: None,
        commit_id: None,
        review_state: None,
    }
}

pub(super) fn issue_label_from_octocrab(label: octocrab::models::Label) -> GitHubIssueLabel {
    GitHubIssueLabel {
        name: label.name,
        color: label.color,
    }
}

fn issue_milestone_from_octocrab(
    milestone: octocrab::models::Milestone,
) -> Result<GitHubIssueMilestone, AppError> {
    let number = u64::try_from(milestone.number)
        .map_err(|_| AppError::GitHub("GitHub returned an invalid milestone number".to_string()))?;
    Ok(GitHubIssueMilestone {
        number,
        title: milestone.title,
        description: milestone.description,
        state: milestone.state.unwrap_or_else(|| "open".to_string()),
        open_issues: milestone
            .open_issues
            .and_then(|count| u64::try_from(count).ok())
            .unwrap_or_default(),
        closed_issues: milestone
            .closed_issues
            .and_then(|count| u64::try_from(count).ok())
            .unwrap_or_default(),
        due_on: milestone.due_on.map(|date| date.to_rfc3339()),
    })
}

pub(super) fn timeline_item_from_octocrab(
    event: octocrab::models::timelines::TimelineEvent,
    index: usize,
) -> GitHubIssueTimelineItem {
    let event_name = serialized_enum_name(&event.event).unwrap_or_else(|| "unknown".to_string());
    let actor = event.user.as_ref().or(event.actor.as_ref());
    let assignee = event.assignee.as_ref().or_else(|| {
        event
            .assignees
            .as_ref()
            .and_then(|assignees| assignees.first())
    });
    let (rename_from, rename_to) = event
        .rename
        .as_ref()
        .map(|rename| (Some(rename.from.clone()), Some(rename.to.clone())))
        .unwrap_or_default();

    let review_state = event.state.map(pull_request_review_state_from_octocrab);
    let created_at = event.created_at.or(event.submitted_at);
    let reaction_subject = event.node_id.clone().and_then(|id| {
        let kind = match event_name.as_str() {
            "commented" => GitHubReactionSubjectKind::IssueComment,
            "reviewed" => GitHubReactionSubjectKind::PullRequestReview,
            _ => return None,
        };
        Some(GitHubReactionSubjectRef { id, kind })
    });

    GitHubIssueTimelineItem {
        id: event
            .node_id
            .clone()
            .unwrap_or_else(|| format!("{event_name}-{index}")),
        reaction_subject,
        kind: if event_name == "commented" {
            GitHubIssueTimelineKind::Comment
        } else {
            GitHubIssueTimelineKind::Event
        },
        event: event_name,
        actor: actor.map(|actor| actor.login.clone()),
        actor_avatar_url: actor.map(|actor| actor.avatar_url.to_string()),
        author_association: event.author_association,
        body: event.body,
        url: event.html_url,
        created_at: created_at.map(|created_at| created_at.to_rfc3339()),
        updated_at: event.updated_at.map(|updated_at| updated_at.to_rfc3339()),
        label: event.label.map(|label| GitHubIssueLabel {
            name: label.name,
            color: label.color,
        }),
        assignee: assignee.map(|assignee| assignee.login.clone()),
        milestone: event.milestone.map(|milestone| milestone.title),
        rename_from,
        rename_to,
        commit_id: event.commit_id,
        review_state,
    }
}

#[cfg(test)]
mod tests;
