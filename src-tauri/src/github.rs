use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    github_oauth::{
        ensure_classic_oauth_app_credentials, GitHubLoginAttempt, GitHubOAuthCredentials,
        GitHubOAuthSession,
    },
};

pub(crate) mod actions;
pub(crate) mod checks;
pub(crate) mod code;
pub(crate) mod comment;
pub(crate) mod commit_comment;
pub(crate) mod conversation;
pub(crate) mod discovery;
pub(crate) mod discussion;
pub(crate) mod download;
pub(crate) mod gist;
pub(crate) mod insights;
pub(crate) mod issue;
pub(crate) mod issue_dependencies;
pub(crate) mod issue_related;
pub(crate) mod issue_relationships;
pub(crate) mod issue_taxonomy;
pub(crate) mod item_metadata;
pub(crate) mod notification;
pub(crate) mod packages;
pub(crate) mod pending_review;
pub(crate) mod profile;
pub(crate) mod projects;
pub(crate) mod pull_request;
pub(crate) mod reaction;
pub(crate) mod release;
pub(crate) mod repository_access;
pub(crate) mod repository_invitations;
pub(crate) mod repository_pages;
pub(crate) mod repository_relationships;
pub(crate) mod repository_settings;
pub(crate) mod security;
pub(crate) mod wiki;
pub use actions::{
    GitHubWorkflow, GitHubWorkflowArtifactPage, GitHubWorkflowDispatchConfig,
    GitHubWorkflowDispatchOptions, GitHubWorkflowJobLog, GitHubWorkflowJobPage, GitHubWorkflowRun,
    GitHubWorkflowRunAction, GitHubWorkflowRunDeletion, GitHubWorkflowRunFilterOptions,
    GitHubWorkflowRunFilters, GitHubWorkflowRunPage, GitHubWorkflowRunStatusFilter,
};
pub use checks::{GitHubCheckPage, GitHubCheckSuite};
pub use code::write::{GitHubRepositoryFileCommit, GitHubRepositoryFileMutation};
pub use code::{
    GitHubBlame, GitHubCodeOverview, GitHubCodeSearchPage, GitHubCommitDetailPage,
    GitHubContentListing, GitHubFilePreview, GitHubRepositoryCommitPage, GitHubTagPage,
};
pub use comment::GitHubCommentMutation;
pub use commit_comment::{
    GitHubCommitComment, GitHubCommitCommentMutation, GitHubCommitCommentPage,
};
pub use conversation::{
    GitHubConversationControls, GitHubConversationKind, GitHubConversationLockAction,
    GitHubConversationLockReason, GitHubConversationSubscriptionAction,
};
pub use discovery::{
    GitHubDeveloperFeedPage, GitHubDiscoverySearchKind, GitHubDiscoverySearchPage,
    GitHubDiscoverySearchSort,
};
pub use discussion::{
    GitHubDiscussionAnsweredFilter, GitHubDiscussionCategoryPage, GitHubDiscussionCloseReason,
    GitHubDiscussionComment, GitHubDiscussionCommentDeletion, GitHubDiscussionDeletion,
    GitHubDiscussionDetailPage, GitHubDiscussionFilters, GitHubDiscussionPage,
    GitHubDiscussionPoll, GitHubDiscussionSort, GitHubDiscussionState, GitHubDiscussionStateFilter,
    GitHubDiscussionSummary, GitHubDiscussionVote,
};
pub use gist::{
    GitHubGist, GitHubGistComment, GitHubGistCommentMutation, GitHubGistCommentPage,
    GitHubGistCreateInput, GitHubGistFileInput, GitHubGistFileMutation, GitHubGistPage,
    GitHubGistRevisionDetail, GitHubGistRevisionPage, GitHubGistSource, GitHubGistUpdateInput,
};
pub use insights::{
    GitHubInsightsTrafficPeriod, GitHubRepositoryInsightsContributors,
    GitHubRepositoryInsightsOverview, GitHubRepositoryInsightsTraffic,
};
#[cfg(test)]
use issue::GitHubIssueTimelineKind;
pub use issue::{
    GitHubIssue, GitHubIssueAssigneePage, GitHubIssueAssignment, GitHubIssueDetailPage,
    GitHubIssueFilters, GitHubIssueInboxFilters, GitHubIssueInboxPage, GitHubIssueInboxScope,
    GitHubIssueLabel, GitHubIssueLabelPage, GitHubIssueMilestone, GitHubIssueMilestonePage,
    GitHubIssuePage, GitHubIssueSort, GitHubIssueState, GitHubIssueStateCapabilities,
    GitHubIssueStateMutation, GitHubIssueTimelineItem,
};
pub use issue_dependencies::GitHubIssueDependenciesPage;
pub use issue_relationships::GitHubIssueRelationshipsPage;
#[cfg(test)]
use issue_taxonomy::GitHubIssueMilestoneState;
pub use issue_taxonomy::{GitHubIssueLabelMutation, GitHubIssueMilestoneMutation};
pub use notification::{GitHubNotificationAction, GitHubNotificationPage};
#[cfg(test)]
use packages::GitHubPackageVersionAction;
pub use packages::{
    GitHubPackage, GitHubPackagePage, GitHubPackageType, GitHubPackageVersionMutationInput,
    GitHubPackageVersionMutationResult, GitHubPackageVersionPage, GitHubPackageVersionState,
    GitHubPackageVisibility,
};
pub use profile::{
    GitHubContributionSummary, GitHubProfileActivityPage, GitHubProfileConnectionKind,
    GitHubUserPage, GitHubUserProfile, GitHubUserProfileUpdate,
};
pub use projects::{
    GitHubProjectDetail, GitHubProjectFilters, GitHubProjectItem, GitHubProjectItemAction,
    GitHubProjectItemAddition, GitHubProjectItemFilters, GitHubProjectItemUpdate,
    GitHubProjectPage, GitHubProjectSort, GitHubProjectStateFilter, GitHubProjectSummary,
    GitHubProjectUpdate,
};
#[cfg(test)]
use pull_request::auto_merge::GitHubPullRequestAutoMergeState;
pub use pull_request::auto_merge::GitHubPullRequestAutoMergeStatus;
pub use pull_request::base_edit::{
    GitHubPullRequestBaseBranchPage, GitHubPullRequestBaseEditGuard,
};
pub use pull_request::creation::GitHubPullRequestComparison;
pub use pull_request::file_view_state::{
    GitHubPullRequestFileViewState, GitHubPullRequestFileViewStateSnapshot,
};
pub use pull_request::maintainer_editability::{
    GitHubPullRequestMaintainerEditability, GitHubPullRequestMaintainerEditabilityGuard,
};
#[cfg(test)]
use pull_request::merge_queue::GitHubPullRequestMergeQueueState;
pub use pull_request::merge_queue::GitHubPullRequestMergeQueueStatus;
pub use pull_request::review_dismissal::GitHubPullRequestReviewPage;
pub use pull_request::reviewer::{GitHubPullRequestReviewTeam, GitHubPullRequestReviewTeamPage};
pub use pull_request::update_branch::{
    GitHubPullRequestBranchUpdate, GitHubPullRequestBranchUpdateStatus,
};
pub use reaction::{
    GitHubReactionContent, GitHubReactionSubject, GitHubReactionSubjectKind,
    GitHubReactionSubjectRef,
};
pub use release::{
    GitHubRelease, GitHubReleaseArchiveFormat, GitHubReleaseAsset, GitHubReleaseMutationInput,
    GitHubReleasePage,
};
pub use repository_access::{
    GitHubRepositoryCollaboratorPage, GitHubRepositoryInvitationPage, GitHubRepositoryInviteResult,
};
pub use repository_invitations::{
    GitHubReceivedRepositoryInvitationAction, GitHubReceivedRepositoryInvitationPage,
};
pub use repository_pages::{GitHubPagesHealth, GitHubPagesMutation, GitHubPagesWorkspace};
pub use repository_relationships::{
    GitHubForkInput, GitHubForkResult, GitHubRepositoryRelationship, GitHubRepositoryWatchLevel,
    GitHubStarredRepositoryPage, GitHubStarredRepositorySort,
};
pub use repository_settings::{
    GitHubRepositoryCreateInput, GitHubRepositoryCreationOptions, GitHubRepositorySettings,
    GitHubRepositorySettingsUpdate,
};
pub use security::{
    GitHubCodeScanningInstancePage, GitHubSecretScanningLocationPage, GitHubSecurityAlertDetail,
    GitHubSecurityAlertFilters, GitHubSecurityAlertKind, GitHubSecurityAlertMutation,
    GitHubSecurityAlertPage, GitHubSecurityAlertSeverityFilter, GitHubSecurityAlertSort,
    GitHubSecurityAlertStateFilter,
};
pub use wiki::{
    GitHubWikiComparison, GitHubWikiHistoryPage, GitHubWikiMutationResult, GitHubWikiOverview,
    GitHubWikiPage, GitHubWikiPageMutationInput, GitHubWikiRevertInput, GitHubWikiRevision,
    GitHubWikiSearchResult,
};

const PULL_REQUEST_SEARCH_PAGE_SIZE: u64 = 30;
const PULL_REQUEST_DETAIL_PAGE_SIZE: u64 = 100;
const PULL_REQUEST_REVIEW_THREAD_PAGE_SIZE: u8 = 100;

use issue::{
    issue_label_from_octocrab, timeline_item_from_issue_comment, timeline_item_from_octocrab,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIdentity {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubConnection {
    pub connected: bool,
    pub identity: Option<GitHubIdentity>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubLoginAvailability {
    pub configured: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum GitHubAuthEvent {
    Connected { connection: GitHubConnection },
    Failed { message: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepository {
    pub id: u64,
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub url: String,
    pub language: Option<String>,
    pub stars: u32,
    pub forks: u32,
    pub open_issues: u32,
    pub default_branch: String,
    pub is_private: bool,
    pub is_fork: bool,
    pub is_archived: bool,
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryPage {
    pub repositories: Vec<GitHubRepository>,
    pub page: u32,
    pub has_more: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPullRequestState {
    Open,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPullRequestSort {
    Updated,
    Created,
    Comments,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestInboxScope {
    Authored,
    Assigned,
    ReviewRequested,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubPullRequestFilters {
    pub state: GitHubPullRequestState,
    pub query: String,
    pub label: String,
    pub sort: GitHubPullRequestSort,
    pub page: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubPullRequestInboxFilters {
    pub scope: GitHubPullRequestInboxScope,
    pub state: GitHubPullRequestState,
    pub query: String,
    pub sort: GitHubPullRequestSort,
    pub page: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestRepository {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestSummary {
    pub id: u64,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: GitHubPullRequestState,
    pub draft: bool,
    pub merged: bool,
    pub repository: GitHubPullRequestRepository,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub labels: Vec<GitHubIssueLabel>,
    pub comments: u32,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestPage {
    pub pull_requests: Vec<GitHubPullRequestSummary>,
    pub total_count: u64,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequest {
    pub id: u64,
    pub reaction_subject: Option<GitHubReactionSubjectRef>,
    pub number: u64,
    pub title: String,
    pub body: Option<String>,
    pub url: String,
    pub state: GitHubPullRequestState,
    pub draft: bool,
    pub merged: bool,
    pub mergeable: Option<bool>,
    pub mergeable_state: Option<String>,
    pub maintainer_can_modify: Option<bool>,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub author_association: Option<String>,
    pub assignees: Vec<String>,
    pub requested_reviewers: Vec<String>,
    pub requested_teams: Vec<GitHubPullRequestReviewTeam>,
    pub labels: Vec<GitHubIssueLabel>,
    pub milestone: Option<String>,
    pub milestone_number: Option<u64>,
    pub locked: bool,
    pub head_ref: String,
    pub head_label: Option<String>,
    pub head_sha: String,
    pub base_ref: String,
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u64,
    pub commits: u64,
    pub comments: u64,
    pub review_comments: u64,
    pub merged_by: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPullRequestMergeMethod {
    Merge,
    Squash,
    Rebase,
}

impl GitHubPullRequestMergeMethod {
    fn as_octocrab_method(self) -> octocrab::params::pulls::MergeMethod {
        match self {
            Self::Merge => octocrab::params::pulls::MergeMethod::Merge,
            Self::Squash => octocrab::params::pulls::MergeMethod::Squash,
            Self::Rebase => octocrab::params::pulls::MergeMethod::Rebase,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestReviewState {
    Approved,
    ChangesRequested,
    Commented,
    Dismissed,
    Pending,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestReviewAction {
    Comment,
    Approve,
    RequestChanges,
}

impl GitHubPullRequestReviewAction {
    fn as_github_event(self) -> &'static str {
        match self {
            Self::Comment => "COMMENT",
            Self::Approve => "APPROVE",
            Self::RequestChanges => "REQUEST_CHANGES",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPullRequestReviewCommentSide {
    Left,
    Right,
}

impl GitHubPullRequestReviewCommentSide {
    fn as_github_side(self) -> &'static str {
        match self {
            Self::Left => "LEFT",
            Self::Right => "RIGHT",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewComment {
    pub path: String,
    pub line: u64,
    pub side: GitHubPullRequestReviewCommentSide,
    pub start_line: Option<u64>,
    pub start_side: Option<GitHubPullRequestReviewCommentSide>,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPendingPullRequestReviewComment {
    pub id: String,
    pub database_id: u64,
    pub path: String,
    pub line: u64,
    pub side: GitHubPullRequestReviewCommentSide,
    pub start_line: Option<u64>,
    pub start_side: Option<GitHubPullRequestReviewCommentSide>,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPendingPullRequestReview {
    pub id: u64,
    pub node_id: String,
    pub body: String,
    pub commit_id: Option<String>,
    pub comments: Vec<GitHubPendingPullRequestReviewComment>,
    pub uneditable_comment_count: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReview {
    pub id: u64,
    pub node_id: String,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub author_association: Option<String>,
    pub state: GitHubPullRequestReviewState,
    pub body: Option<String>,
    pub url: String,
    pub commit_id: Option<String>,
    pub submitted_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestDetailPage {
    pub pull_request: GitHubPullRequest,
    pub timeline: Vec<GitHubIssueTimelineItem>,
    pub reviews: Vec<GitHubPullRequestReview>,
    pub reviews_have_more: bool,
    pub timeline_page: u32,
    pub timeline_has_previous: bool,
    pub timeline_has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestCommit {
    pub sha: String,
    pub short_sha: String,
    pub title: String,
    pub message: String,
    pub author: Option<String>,
    pub author_login: Option<String>,
    pub author_avatar_url: Option<String>,
    pub committed_at: Option<String>,
    pub url: String,
    pub verified: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestCommitPage {
    pub commits: Vec<GitHubPullRequestCommit>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestFile {
    pub sha: Option<String>,
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    pub changes: u64,
    pub patch: Option<String>,
    pub blob_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestFilePage {
    pub files: Vec<GitHubPullRequestFile>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestReviewThreadSubjectType {
    Line,
    File,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewThreadComment {
    pub id: String,
    pub database_id: Option<u64>,
    pub author: String,
    pub author_avatar_url: Option<String>,
    pub author_association: Option<String>,
    pub body: String,
    pub url: String,
    pub created_at: String,
    pub updated_at: String,
    pub pending: bool,
    pub viewer_can_update: bool,
    pub viewer_can_delete: bool,
    pub is_minimized: bool,
    pub minimized_reason: Option<String>,
    pub outdated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewThread {
    pub id: String,
    pub path: String,
    pub line: Option<u64>,
    pub original_line: Option<u64>,
    pub start_line: Option<u64>,
    pub original_start_line: Option<u64>,
    pub side: GitHubPullRequestReviewCommentSide,
    pub start_side: Option<GitHubPullRequestReviewCommentSide>,
    pub subject_type: GitHubPullRequestReviewThreadSubjectType,
    pub is_resolved: bool,
    pub is_outdated: bool,
    pub is_collapsed: bool,
    pub resolved_by: Option<String>,
    pub viewer_can_reply: bool,
    pub viewer_can_resolve: bool,
    pub viewer_can_unresolve: bool,
    pub comments: Vec<GitHubPullRequestReviewThreadComment>,
    pub comments_have_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewThreadPage {
    pub threads: Vec<GitHubPullRequestReviewThread>,
    pub end_cursor: Option<String>,
    pub has_more: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GitHubPullRequestReviewThreadResolution {
    Resolved,
    Unresolved,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewThreadState {
    pub id: String,
    pub is_resolved: bool,
    pub is_collapsed: bool,
    pub resolved_by: Option<String>,
    pub viewer_can_reply: bool,
    pub viewer_can_resolve: bool,
    pub viewer_can_unresolve: bool,
}

#[derive(Debug)]
pub struct GitHubFileDownload {
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubFileDownloadResult {
    pub saved: bool,
    pub path: Option<String>,
}

impl GitHubConnection {
    fn disconnected() -> Self {
        Self {
            connected: false,
            identity: None,
        }
    }

    fn connected(identity: GitHubIdentity) -> Self {
        Self {
            connected: true,
            identity: Some(identity),
        }
    }
}

#[async_trait]
pub(crate) trait GitHubClient:
    actions::GitHubActionsClient
    + checks::GitHubCheckClient
    + code::GitHubCodeClient
    + code::write::GitHubCodeMutationClient
    + commit_comment::GitHubCommitCommentClient
    + comment::GitHubCommentClient
    + conversation::GitHubConversationClient
    + discussion::GitHubDiscussionClient
    + discovery::GitHubDiscoveryClient
    + gist::GitHubGistClient
    + insights::GitHubInsightsClient
    + issue::GitHubIssueClient
    + issue_dependencies::GitHubIssueDependenciesClient
    + issue_relationships::GitHubIssueRelationshipsClient
    + issue_taxonomy::GitHubIssueTaxonomyClient
    + notification::GitHubNotificationClient
    + packages::GitHubPackagesClient
    + pending_review::GitHubPendingReviewClient
    + profile::GitHubProfileClient
    + projects::GitHubProjectsClient
    + pull_request::auto_merge::GitHubPullRequestAutoMergeClient
    + pull_request::base_edit::GitHubPullRequestBaseEditClient
    + pull_request::maintainer_editability::GitHubPullRequestMaintainerEditabilityClient
    + pull_request::GitHubPullRequestMutationClient
    + pull_request::creation::GitHubPullRequestCreationClient
    + pull_request::file_view_state::GitHubPullRequestFileViewStateClient
    + pull_request::lifecycle::GitHubPullRequestLifecycleClient
    + pull_request::merge_queue::GitHubPullRequestMergeQueueClient
    + pull_request::review_dismissal::GitHubPullRequestReviewDismissalClient
    + pull_request::reviewer::GitHubPullRequestReviewerClient
    + pull_request::update_branch::GitHubPullRequestBranchClient
    + reaction::GitHubReactionClient
    + release::GitHubReleaseClient
    + repository_access::GitHubRepositoryAccessClient
    + repository_invitations::GitHubRepositoryInvitationClient
    + repository_pages::GitHubRepositoryPagesClient
    + repository_relationships::GitHubRepositoryRelationshipsClient
    + repository_settings::GitHubRepositorySettingsClient
    + security::GitHubSecurityClient
    + wiki::GitHubWikiClient
    + Send
    + Sync
{
    async fn validate_token(&self, token: &str) -> Result<GitHubIdentity, AppError>;
    async fn list_repositories(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubRepositoryPage, AppError>;
    async fn list_pull_requests(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubPullRequestFilters,
    ) -> Result<GitHubPullRequestPage, AppError>;
    async fn list_pull_request_inbox(
        &self,
        token: &str,
        filters: &GitHubPullRequestInboxFilters,
    ) -> Result<GitHubPullRequestPage, AppError>;
    async fn pull_request_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        timeline_page: u32,
    ) -> Result<GitHubPullRequestDetailPage, AppError>;
    async fn pull_request_commits(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestCommitPage, AppError>;
    async fn pull_request_files(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestFilePage, AppError>;
    async fn pull_request_review_threads(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        after: Option<&str>,
    ) -> Result<GitHubPullRequestReviewThreadPage, AppError>;
    async fn reply_to_pull_request_review_thread(
        &self,
        token: &str,
        thread_id: &str,
        body: &str,
    ) -> Result<GitHubPullRequestReviewThreadComment, AppError>;
    async fn set_pull_request_review_thread_resolution(
        &self,
        token: &str,
        thread_id: &str,
        resolution: GitHubPullRequestReviewThreadResolution,
    ) -> Result<GitHubPullRequestReviewThreadState, AppError>;
}

pub trait CredentialStore: Send + Sync {
    fn load_github_credentials(&self) -> Result<Option<GitHubOAuthCredentials>, AppError>;
    fn save_github_credentials(&self, credentials: &GitHubOAuthCredentials)
        -> Result<(), AppError>;
    fn delete_github_credentials(&self) -> Result<(), AppError>;
}

pub struct GitHubService {
    client: Arc<dyn GitHubClient>,
    wiki_store: Arc<dyn wiki::WikiRepositoryStore>,
    credential_store: Arc<dyn CredentialStore>,
    oauth: Option<Arc<GitHubOAuthSession>>,
    session_credentials: RwLock<Option<GitHubOAuthCredentials>>,
    identity: RwLock<Option<GitHubIdentity>>,
}

impl GitHubService {
    pub(crate) fn new(
        client: Arc<dyn GitHubClient>,
        credential_store: Arc<dyn CredentialStore>,
        oauth: Option<Arc<GitHubOAuthSession>>,
    ) -> Self {
        Self {
            client,
            wiki_store: Arc::new(wiki::GitWikiRepositoryStore),
            credential_store,
            oauth,
            session_credentials: RwLock::new(None),
            identity: RwLock::new(None),
        }
    }

    pub fn begin_login(&self) -> Result<GitHubLoginAttempt, AppError> {
        self.oauth
            .as_ref()
            .ok_or_else(|| {
                AppError::GitHubAuthentication(
                    "GitHub login is not configured for this Harbor build".to_string(),
                )
            })?
            .begin_login()
    }

    pub fn login_availability(&self) -> GitHubLoginAvailability {
        GitHubLoginAvailability {
            configured: self.oauth.is_some(),
        }
    }

    pub async fn complete_login(&self, callback_url: &str) -> Result<GitHubConnection, AppError> {
        let oauth = self.oauth.as_ref().ok_or_else(|| {
            AppError::GitHubAuthentication(
                "GitHub login is not configured for this Harbor build".to_string(),
            )
        })?;
        let credentials = oauth.complete_login(callback_url).await?;
        let identity = self
            .client
            .validate_token(&credentials.access_token)
            .await?;
        let credential_store = Arc::clone(&self.credential_store);
        let credentials_to_store = credentials.clone();
        tokio::task::spawn_blocking(move || {
            credential_store.save_github_credentials(&credentials_to_store)
        })
        .await
        .map_err(|error| AppError::Credentials(error.to_string()))??;
        *self
            .session_credentials
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? =
            Some(credentials);
        *self
            .identity
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? =
            Some(identity.clone());

        Ok(GitHubConnection::connected(identity))
    }

    pub async fn status(&self) -> Result<GitHubConnection, AppError> {
        if let Some(identity) = self
            .identity
            .read()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))?
            .clone()
        {
            return Ok(GitHubConnection::connected(identity));
        }
        if self.oauth.is_none() {
            return Ok(GitHubConnection::disconnected());
        }

        let token = match self.load_access_token().await {
            Ok(token) => token,
            Err(AppError::GitHubNotConnected) => {
                return Ok(GitHubConnection::disconnected());
            }
            Err(error) => return Err(error),
        };
        let identity = self.client.validate_token(&token).await?;
        *self
            .identity
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? =
            Some(identity.clone());

        Ok(GitHubConnection::connected(identity))
    }

    pub async fn disconnect(&self) -> Result<GitHubConnection, AppError> {
        let credential_store = Arc::clone(&self.credential_store);
        tokio::task::spawn_blocking(move || credential_store.delete_github_credentials())
            .await
            .map_err(|error| AppError::Credentials(error.to_string()))??;
        *self
            .session_credentials
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? = None;
        *self
            .identity
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? = None;
        Ok(GitHubConnection::disconnected())
    }

    pub async fn repositories(&self, page: u32) -> Result<GitHubRepositoryPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.list_repositories(&token, page).await
    }

    pub async fn pull_requests(
        &self,
        owner: &str,
        repository: &str,
        filters: &GitHubPullRequestFilters,
    ) -> Result<GitHubPullRequestPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_pull_requests(&token, owner, repository, filters)
            .await
    }

    pub async fn pull_request_inbox(
        &self,
        filters: &GitHubPullRequestInboxFilters,
    ) -> Result<GitHubPullRequestPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.list_pull_request_inbox(&token, filters).await
    }

    pub async fn pull_request_detail(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        timeline_page: u32,
    ) -> Result<GitHubPullRequestDetailPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_detail(
                &token,
                owner,
                repository,
                pull_request_number,
                timeline_page,
            )
            .await
    }

    pub async fn pull_request_commits(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestCommitPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_commits(&token, owner, repository, pull_request_number, page)
            .await
    }

    pub async fn pull_request_files(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestFilePage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_files(&token, owner, repository, pull_request_number, page)
            .await
    }

    pub async fn pull_request_review_threads(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        after: Option<&str>,
    ) -> Result<GitHubPullRequestReviewThreadPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_review_threads(&token, owner, repository, pull_request_number, after)
            .await
    }

    pub async fn reply_to_pull_request_review_thread(
        &self,
        thread_id: &str,
        body: &str,
    ) -> Result<GitHubPullRequestReviewThreadComment, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .reply_to_pull_request_review_thread(&token, thread_id, body)
            .await
    }

    pub async fn set_pull_request_review_thread_resolution(
        &self,
        thread_id: &str,
        resolution: GitHubPullRequestReviewThreadResolution,
    ) -> Result<GitHubPullRequestReviewThreadState, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .set_pull_request_review_thread_resolution(&token, thread_id, resolution)
            .await
    }

    async fn load_access_token(&self) -> Result<String, AppError> {
        Ok(self.load_credentials().await?.access_token)
    }

    async fn load_credentials(&self) -> Result<GitHubOAuthCredentials, AppError> {
        if self.oauth.is_none() {
            return Err(AppError::GitHubNotConnected);
        }
        let cached = self
            .session_credentials
            .read()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))?
            .clone();
        let credentials = match cached {
            Some(credentials) => credentials,
            None => {
                let credential_store = Arc::clone(&self.credential_store);
                tokio::task::spawn_blocking(move || credential_store.load_github_credentials())
                    .await
                    .map_err(|error| AppError::Credentials(error.to_string()))??
                    .ok_or(AppError::GitHubNotConnected)?
            }
        };
        ensure_classic_oauth_app_credentials(&credentials)?;
        let refreshed = match &self.oauth {
            Some(oauth) => oauth.refresh_if_needed(credentials.clone()).await?,
            None => credentials.clone(),
        };
        if refreshed != credentials {
            let credential_store = Arc::clone(&self.credential_store);
            let credentials_to_store = refreshed.clone();
            tokio::task::spawn_blocking(move || {
                credential_store.save_github_credentials(&credentials_to_store)
            })
            .await
            .map_err(|error| AppError::Credentials(error.to_string()))??;
        }
        *self
            .session_credentials
            .write()
            .map_err(|_| AppError::GitHub("connection state is unavailable".to_string()))? =
            Some(refreshed.clone());
        Ok(refreshed)
    }
}

#[derive(Default)]
pub struct OctocrabGitHubClient;

#[async_trait]
impl GitHubClient for OctocrabGitHubClient {
    async fn validate_token(&self, token: &str) -> Result<GitHubIdentity, AppError> {
        let client = authenticated_client(token)?;
        let user = client
            .current()
            .user()
            .await
            .map_err(|error| AppError::GitHub(error.to_string()))?;

        Ok(GitHubIdentity {
            login: user.login,
            avatar_url: Some(user.avatar_url.to_string()),
        })
    }

    async fn list_repositories(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubRepositoryPage, AppError> {
        let client = authenticated_client(token)?;
        let response: octocrab::Page<octocrab::models::Repository> = client
            .get(
                "/user/repos",
                Some(&RepositoryPageParameters {
                    sort: "pushed",
                    direction: "desc",
                    per_page: 100,
                    page,
                }),
            )
            .await
            .map_err(github_error)?;
        Ok(repository_page_from_octocrab(
            response.items,
            page,
            response.next.is_some(),
        ))
    }

    async fn list_pull_requests(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubPullRequestFilters,
    ) -> Result<GitHubPullRequestPage, AppError> {
        let client = authenticated_client(token)?;
        let query = pull_request_search_query(owner, repository, filters);
        let parameters = SearchParameters {
            query: &query,
            sort: pull_request_search_sort(filters.sort),
            order: "desc",
            per_page: PULL_REQUEST_SEARCH_PAGE_SIZE as u8,
            page: filters.page,
        };
        let page: octocrab::Page<serde_json::Value> = client
            .get("/search/issues", Some(&parameters))
            .await
            .map_err(github_error)?;
        let pull_requests = page
            .items
            .into_iter()
            .map(pull_request_summary_from_search_value)
            .collect::<Result<Vec<_>, _>>()?;

        Ok(GitHubPullRequestPage {
            pull_requests,
            total_count: page.total_count.unwrap_or_default(),
            page: filters.page,
            has_previous: filters.page > 1,
            has_more: page.next.is_some(),
        })
    }

    async fn list_pull_request_inbox(
        &self,
        token: &str,
        filters: &GitHubPullRequestInboxFilters,
    ) -> Result<GitHubPullRequestPage, AppError> {
        let client = authenticated_client(token)?;
        let query = pull_request_inbox_search_query(filters);
        let parameters = SearchParameters {
            query: &query,
            sort: pull_request_search_sort(filters.sort),
            order: "desc",
            per_page: PULL_REQUEST_SEARCH_PAGE_SIZE as u8,
            page: filters.page,
        };
        let page: octocrab::Page<serde_json::Value> = client
            .get("/search/issues", Some(&parameters))
            .await
            .map_err(github_error)?;
        let pull_requests = page
            .items
            .into_iter()
            .map(pull_request_summary_from_search_value)
            .collect::<Result<Vec<_>, _>>()?;

        Ok(GitHubPullRequestPage {
            pull_requests,
            total_count: page.total_count.unwrap_or_default(),
            page: filters.page,
            has_previous: filters.page > 1,
            has_more: page.next.is_some(),
        })
    }

    async fn pull_request_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        timeline_page: u32,
    ) -> Result<GitHubPullRequestDetailPage, AppError> {
        let client = authenticated_client(token)?;
        let pull_handler = client.pulls(owner, repository);
        let issue_handler = client.issues(owner, repository);
        let (pull_request, timeline, reviews) = tokio::join!(
            pull_handler.get(pull_request_number),
            issue_handler
                .list_timeline_events(pull_request_number)
                .per_page(PULL_REQUEST_DETAIL_PAGE_SIZE as u8)
                .page(timeline_page)
                .send(),
            pull_handler
                .list_reviews(pull_request_number)
                .per_page(PULL_REQUEST_DETAIL_PAGE_SIZE as u8)
                .page(1_u32)
                .send(),
        );
        let pull_request = pull_request.map_err(github_error)?;
        let timeline = timeline.map_err(github_error)?;
        let reviews = reviews.map_err(github_error)?;
        let timeline_has_more = timeline.next.is_some();
        let timeline = timeline
            .items
            .into_iter()
            .enumerate()
            .map(|(index, event)| timeline_item_from_octocrab(event, index))
            .collect();
        let timeline = comment::enrich_issue_timeline_comments(
            &client,
            owner,
            repository,
            pull_request_number,
            comment::GitHubConversationCommentKind::PullRequest,
            timeline,
        )
        .await?;

        Ok(GitHubPullRequestDetailPage {
            pull_request: pull_request_from_octocrab(pull_request),
            timeline,
            reviews: reviews
                .items
                .into_iter()
                .filter_map(pull_request_review_from_octocrab)
                .collect(),
            reviews_have_more: reviews.next.is_some(),
            timeline_page,
            timeline_has_previous: timeline_page > 1,
            timeline_has_more,
        })
    }

    async fn pull_request_commits(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestCommitPage, AppError> {
        let client = authenticated_client(token)?;
        let commits = client
            .pulls(owner, repository)
            .pr_commits(pull_request_number)
            .per_page(PULL_REQUEST_DETAIL_PAGE_SIZE as u8)
            .page(page)
            .send()
            .await
            .map_err(github_error)?;

        Ok(GitHubPullRequestCommitPage {
            commits: commits
                .items
                .into_iter()
                .map(pull_request_commit_from_octocrab)
                .collect(),
            page,
            has_previous: page > 1,
            has_more: commits.next.is_some(),
        })
    }

    async fn pull_request_files(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        page: u32,
    ) -> Result<GitHubPullRequestFilePage, AppError> {
        let client = authenticated_client(token)?;
        let route = format!("/repos/{owner}/{repository}/pulls/{pull_request_number}/files");
        let parameters = PageParameters {
            per_page: PULL_REQUEST_DETAIL_PAGE_SIZE as u8,
            page,
        };
        let files: octocrab::Page<octocrab::models::repos::DiffEntry> = client
            .get(route, Some(&parameters))
            .await
            .map_err(github_error)?;

        Ok(GitHubPullRequestFilePage {
            files: files
                .items
                .into_iter()
                .map(pull_request_file_from_octocrab)
                .collect(),
            page,
            has_previous: page > 1,
            has_more: files.next.is_some(),
        })
    }

    async fn pull_request_review_threads(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        after: Option<&str>,
    ) -> Result<GitHubPullRequestReviewThreadPage, AppError> {
        let client = authenticated_client(token)?;
        let pull_request_number = i32::try_from(pull_request_number).map_err(|_| {
            AppError::Validation("pull request number is too large for GitHub GraphQL".to_string())
        })?;
        let payload = serde_json::json!({
            "query": PULL_REQUEST_REVIEW_THREADS_QUERY,
            "variables": {
                "owner": owner,
                "repository": repository,
                "pullRequestNumber": pull_request_number,
                "first": PULL_REQUEST_REVIEW_THREAD_PAGE_SIZE,
                "commentsFirst": PULL_REQUEST_REVIEW_THREAD_PAGE_SIZE,
                "after": after,
            }
        });
        let response: PullRequestReviewThreadsQuery =
            client.graphql(&payload).await.map_err(github_error)?;
        let threads = response
            .repository
            .and_then(|repository| repository.pull_request)
            .map(|pull_request| pull_request.review_threads)
            .ok_or_else(|| {
                AppError::GitHub("GitHub did not return pull request review threads".to_string())
            })?;

        Ok(GitHubPullRequestReviewThreadPage {
            threads: threads
                .nodes
                .into_iter()
                .map(pull_request_review_thread_from_graphql)
                .collect(),
            end_cursor: threads.page_info.end_cursor,
            has_more: threads.page_info.has_next_page,
        })
    }

    async fn reply_to_pull_request_review_thread(
        &self,
        token: &str,
        thread_id: &str,
        body: &str,
    ) -> Result<GitHubPullRequestReviewThreadComment, AppError> {
        let client = authenticated_client(token)?;
        let payload = serde_json::json!({
            "query": ADD_PULL_REQUEST_REVIEW_THREAD_REPLY_MUTATION,
            "variables": {
                "threadId": thread_id,
                "body": body,
            }
        });
        let response: AddPullRequestReviewThreadReplyMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let comment = response
            .add_pull_request_review_thread_reply
            .and_then(|payload| payload.comment)
            .ok_or_else(|| {
                AppError::GitHub("GitHub did not return the review-thread reply".to_string())
            })?;

        Ok(pull_request_review_thread_comment_from_graphql(comment))
    }

    async fn set_pull_request_review_thread_resolution(
        &self,
        token: &str,
        thread_id: &str,
        resolution: GitHubPullRequestReviewThreadResolution,
    ) -> Result<GitHubPullRequestReviewThreadState, AppError> {
        let client = authenticated_client(token)?;
        let query = match resolution {
            GitHubPullRequestReviewThreadResolution::Resolved => {
                RESOLVE_PULL_REQUEST_REVIEW_THREAD_MUTATION
            }
            GitHubPullRequestReviewThreadResolution::Unresolved => {
                UNRESOLVE_PULL_REQUEST_REVIEW_THREAD_MUTATION
            }
        };
        let payload = serde_json::json!({
            "query": query,
            "variables": { "threadId": thread_id }
        });
        let response: SetPullRequestReviewThreadResolutionMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let thread = match resolution {
            GitHubPullRequestReviewThreadResolution::Resolved => response
                .resolve_review_thread
                .and_then(|payload| payload.thread),
            GitHubPullRequestReviewThreadResolution::Unresolved => response
                .unresolve_review_thread
                .and_then(|payload| payload.thread),
        }
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the updated review thread".to_string())
        })?;

        Ok(pull_request_review_thread_state_from_graphql(thread))
    }
}

fn github_error(error: octocrab::Error) -> AppError {
    let message = error.to_string();
    match &error {
        octocrab::Error::GitHub { source, .. }
            if source.status_code.as_u16() == 429
                || source.message.to_ascii_lowercase().contains("rate limit")
                || source
                    .message
                    .to_ascii_lowercase()
                    .contains("abuse detection") =>
        {
            AppError::GitHubRateLimited(message)
        }
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 403 => {
            AppError::GitHubPermission(message)
        }
        octocrab::Error::Graphql { .. } if is_github_rate_limit_message(&message) => {
            AppError::GitHubRateLimited(message)
        }
        octocrab::Error::Graphql { .. } if is_github_permission_message(&message) => {
            AppError::GitHubPermission(message)
        }
        _ => AppError::GitHub(message),
    }
}

fn is_github_rate_limit_message(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("rate limit") || message.contains("abuse detection")
}

fn is_github_permission_message(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("resource not accessible")
        || message.contains("forbidden")
        || message.contains("not authorized")
        || message.contains("not permitted")
        || message.contains("permission")
}

fn is_not_found(error: &octocrab::Error) -> bool {
    matches!(
        error,
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 404
    )
}

fn authenticated_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

#[derive(Serialize)]
struct SearchParameters<'a> {
    #[serde(rename = "q")]
    query: &'a str,
    sort: &'static str,
    order: &'static str,
    per_page: u8,
    page: u32,
}

#[derive(Serialize)]
struct RepositoryPageParameters<'a> {
    sort: &'a str,
    direction: &'a str,
    per_page: u8,
    page: u32,
}

const ADD_PULL_REQUEST_REVIEW_THREAD_REPLY_MUTATION: &str = r#"
mutation AddPullRequestReviewThreadReply($threadId: ID!, $body: String!) {
  addPullRequestReviewThreadReply(
    input: { pullRequestReviewThreadId: $threadId, body: $body }
  ) {
    comment {
      id
      databaseId: fullDatabaseId
      body
      url
      createdAt
      updatedAt
      authorAssociation
      state
      isMinimized
      minimizedReason
      outdated
      viewerCanUpdate
      viewerCanDelete
      author {
        login
        avatarUrl
      }
    }
  }
}
"#;

const RESOLVE_PULL_REQUEST_REVIEW_THREAD_MUTATION: &str = r#"
mutation ResolvePullRequestReviewThread($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread {
      id
      isResolved
      isCollapsed
      resolvedBy {
        login
      }
      viewerCanReply
      viewerCanResolve
      viewerCanUnresolve
    }
  }
}
"#;

const UNRESOLVE_PULL_REQUEST_REVIEW_THREAD_MUTATION: &str = r#"
mutation UnresolvePullRequestReviewThread($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread {
      id
      isResolved
      isCollapsed
      resolvedBy {
        login
      }
      viewerCanReply
      viewerCanResolve
      viewerCanUnresolve
    }
  }
}
"#;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddPullRequestReviewThreadReplyMutation {
    add_pull_request_review_thread_reply: Option<AddPullRequestReviewThreadReplyPayload>,
}

#[derive(Deserialize)]
struct AddPullRequestReviewThreadReplyPayload {
    comment: Option<PullRequestReviewThreadCommentNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetPullRequestReviewThreadResolutionMutation {
    resolve_review_thread: Option<SetPullRequestReviewThreadResolutionPayload>,
    unresolve_review_thread: Option<SetPullRequestReviewThreadResolutionPayload>,
}

#[derive(Deserialize)]
struct SetPullRequestReviewThreadResolutionPayload {
    thread: Option<PullRequestReviewThreadStateNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewThreadStateNode {
    id: String,
    is_resolved: bool,
    is_collapsed: bool,
    resolved_by: Option<GraphQlActor>,
    viewer_can_reply: bool,
    viewer_can_resolve: bool,
    viewer_can_unresolve: bool,
}

const PULL_REQUEST_REVIEW_THREADS_QUERY: &str = r#"
query PullRequestReviewThreads(
  $owner: String!
  $repository: String!
  $pullRequestNumber: Int!
  $first: Int!
  $commentsFirst: Int!
  $after: String
) {
  repository(owner: $owner, name: $repository) {
    pullRequest(number: $pullRequestNumber) {
      reviewThreads(first: $first, after: $after) {
        nodes {
          id
          path
          line
          originalLine
          startLine
          originalStartLine
          diffSide
          startDiffSide
          subjectType
          isResolved
          isOutdated
          isCollapsed
          resolvedBy {
            login
          }
          viewerCanReply
          viewerCanResolve
          viewerCanUnresolve
          comments(first: $commentsFirst) {
            nodes {
              id
              databaseId: fullDatabaseId
              body
              url
              createdAt
              updatedAt
              authorAssociation
              state
              isMinimized
              minimizedReason
              outdated
              viewerCanUpdate
              viewerCanDelete
              author {
                login
                avatarUrl
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
"#;

#[derive(Deserialize)]
struct PullRequestReviewThreadsQuery {
    repository: Option<PullRequestReviewThreadsRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewThreadsRepository {
    pull_request: Option<PullRequestReviewThreadsPullRequest>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewThreadsPullRequest {
    review_threads: PullRequestReviewThreadsConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewThreadsConnection {
    nodes: Vec<PullRequestReviewThreadNode>,
    page_info: GraphQlPageInfo,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewThreadNode {
    id: String,
    path: String,
    line: Option<u64>,
    original_line: Option<u64>,
    start_line: Option<u64>,
    original_start_line: Option<u64>,
    diff_side: GraphQlDiffSide,
    start_diff_side: Option<GraphQlDiffSide>,
    subject_type: GraphQlPullRequestReviewThreadSubjectType,
    is_resolved: bool,
    is_outdated: bool,
    is_collapsed: bool,
    resolved_by: Option<GraphQlActor>,
    viewer_can_reply: bool,
    viewer_can_resolve: bool,
    viewer_can_unresolve: bool,
    comments: PullRequestReviewThreadCommentsConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewThreadCommentsConnection {
    nodes: Vec<PullRequestReviewThreadCommentNode>,
    page_info: GraphQlPageInfo,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullRequestReviewThreadCommentNode {
    id: String,
    #[serde(default, deserialize_with = "deserialize_optional_graphql_u64")]
    database_id: Option<u64>,
    author: Option<GraphQlActor>,
    author_association: Option<String>,
    body: String,
    url: String,
    created_at: String,
    updated_at: String,
    state: String,
    is_minimized: bool,
    minimized_reason: Option<String>,
    outdated: bool,
    viewer_can_update: bool,
    viewer_can_delete: bool,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum GraphQlU64 {
    Number(u64),
    String(String),
}

fn deserialize_optional_graphql_u64<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<GraphQlU64>::deserialize(deserializer)?;
    value
        .map(|value| match value {
            GraphQlU64::Number(value) => Ok(value),
            GraphQlU64::String(value) => value.parse().map_err(serde::de::Error::custom),
        })
        .transpose()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlActor {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPageInfo {
    has_next_page: bool,
    end_cursor: Option<String>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum GraphQlDiffSide {
    Left,
    Right,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum GraphQlPullRequestReviewThreadSubjectType {
    Line,
    File,
}

#[derive(Serialize)]
struct PageParameters {
    per_page: u8,
    page: u32,
}

fn repository_page_from_octocrab(
    repositories: Vec<octocrab::models::Repository>,
    page: u32,
    has_more: bool,
) -> GitHubRepositoryPage {
    GitHubRepositoryPage {
        repositories: repositories
            .into_iter()
            .filter_map(repository_from_octocrab)
            .collect(),
        page,
        has_more,
    }
}

fn pull_request_search_sort(sort: GitHubPullRequestSort) -> &'static str {
    match sort {
        GitHubPullRequestSort::Updated => "updated",
        GitHubPullRequestSort::Created => "created",
        GitHubPullRequestSort::Comments => "comments",
    }
}

fn pull_request_search_query(
    owner: &str,
    repository: &str,
    filters: &GitHubPullRequestFilters,
) -> String {
    let state = match filters.state {
        GitHubPullRequestState::Open => "open",
        GitHubPullRequestState::Closed => "closed",
    };
    let mut query = vec![
        pull_request_search_terms(&filters.query),
        format!("repo:{owner}/{repository}"),
        "is:pr".to_string(),
        format!("is:{state}"),
    ];
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

fn pull_request_inbox_search_query(filters: &GitHubPullRequestInboxFilters) -> String {
    let state = match filters.state {
        GitHubPullRequestState::Open => "open",
        GitHubPullRequestState::Closed => "closed",
    };
    let scope = match filters.scope {
        GitHubPullRequestInboxScope::Authored => "author:@me",
        GitHubPullRequestInboxScope::Assigned => "assignee:@me",
        GitHubPullRequestInboxScope::ReviewRequested => "review-requested:@me",
    };
    [
        pull_request_inbox_search_terms(&filters.query),
        "is:pr".to_string(),
        format!("is:{state}"),
        scope.to_string(),
        "archived:false".to_string(),
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ")
}

fn pull_request_inbox_search_terms(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| {
            let term = term
                .trim_matches(['(', ')'])
                .trim_start_matches('-')
                .to_ascii_lowercase();
            ![
                "repo:",
                "org:",
                "user:",
                "is:",
                "type:",
                "state:",
                "author:",
                "assignee:",
                "review-requested:",
                "user-review-requested:",
                "team-review-requested:",
                "archived:",
            ]
            .iter()
            .any(|prefix| term.starts_with(prefix))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn pull_request_search_terms(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| {
            let term = term.to_ascii_lowercase();
            !["repo:", "org:", "user:", "is:", "type:", "state:"]
                .iter()
                .any(|prefix| term.starts_with(prefix))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn pull_request_summary_from_search_value(
    value: serde_json::Value,
) -> Result<GitHubPullRequestSummary, AppError> {
    let repository = pull_request_repository_from_search_value(&value)?;
    let draft = value
        .get("draft")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or_default();
    let merged = value
        .pointer("/pull_request/merged_at")
        .is_some_and(|value| !value.is_null());
    let issue: octocrab::models::issues::Issue =
        serde_json::from_value(value).map_err(|error| {
            AppError::GitHub(format!("GitHub returned an invalid pull request: {error}"))
        })?;
    if issue.pull_request.is_none() {
        return Err(AppError::GitHub(
            "GitHub search returned a non-pull-request item".to_string(),
        ));
    }
    let state = match issue.state {
        octocrab::models::IssueState::Closed => GitHubPullRequestState::Closed,
        _ => GitHubPullRequestState::Open,
    };

    Ok(GitHubPullRequestSummary {
        id: issue.id.into_inner(),
        number: issue.number,
        title: issue.title,
        body: issue.body,
        url: issue.html_url.to_string(),
        state,
        draft,
        merged,
        repository,
        author: issue.user.login,
        author_avatar_url: Some(issue.user.avatar_url.to_string()),
        labels: issue
            .labels
            .into_iter()
            .map(issue_label_from_octocrab)
            .collect(),
        comments: issue.comments,
        created_at: Some(issue.created_at.to_rfc3339()),
        updated_at: Some(issue.updated_at.to_rfc3339()),
        closed_at: issue.closed_at.map(|date| date.to_rfc3339()),
    })
}

fn pull_request_repository_from_search_value(
    value: &serde_json::Value,
) -> Result<GitHubPullRequestRepository, AppError> {
    let (owner, name) = repository_coordinates_from_search_value(value, "pull request")?;

    Ok(GitHubPullRequestRepository {
        full_name: format!("{owner}/{name}"),
        url: format!("https://github.com/{owner}/{name}"),
        owner,
        name,
    })
}

fn repository_coordinates_from_search_value(
    value: &serde_json::Value,
    item_name: &str,
) -> Result<(String, String), AppError> {
    let repository_url = value
        .get("repository_url")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            AppError::GitHub(format!(
                "GitHub returned a {item_name} without a repository"
            ))
        })?;
    let path = repository_url
        .split_once("/repos/")
        .map(|(_, path)| path)
        .ok_or_else(|| {
            AppError::GitHub(format!("GitHub returned an invalid {item_name} repository"))
        })?;
    let (owner, name) = path.split_once('/').ok_or_else(|| {
        AppError::GitHub(format!("GitHub returned an invalid {item_name} repository"))
    })?;
    if owner.is_empty() || name.is_empty() || name.contains('/') {
        return Err(AppError::GitHub(format!(
            "GitHub returned an invalid {item_name} repository"
        )));
    }

    Ok((owner.to_string(), name.to_string()))
}

fn pull_request_from_octocrab(
    pull_request: octocrab::models::pulls::PullRequest,
) -> GitHubPullRequest {
    let state = match pull_request.state {
        Some(octocrab::models::IssueState::Closed) => GitHubPullRequestState::Closed,
        _ => GitHubPullRequestState::Open,
    };
    let author = pull_request.user.as_ref();
    let (milestone, milestone_number) = pull_request
        .milestone
        .map(|milestone| (Some(milestone.title), u64::try_from(milestone.number).ok()))
        .unwrap_or((None, None));

    GitHubPullRequest {
        id: pull_request.id.into_inner(),
        reaction_subject: pull_request.node_id.map(|id| GitHubReactionSubjectRef {
            id,
            kind: GitHubReactionSubjectKind::PullRequest,
        }),
        number: pull_request.number,
        title: pull_request
            .title
            .unwrap_or_else(|| format!("Pull request #{}", pull_request.number)),
        body: pull_request.body,
        url: pull_request
            .html_url
            .map(|url| url.to_string())
            .unwrap_or(pull_request.url),
        state,
        draft: pull_request.draft.unwrap_or_default(),
        merged: pull_request
            .merged
            .unwrap_or_else(|| pull_request.merged_at.is_some()),
        mergeable: pull_request.mergeable,
        mergeable_state: pull_request
            .mergeable_state
            .as_ref()
            .and_then(serialized_enum_name),
        maintainer_can_modify: pull_request.maintainer_can_modify,
        author: author
            .map(|author| author.login.clone())
            .unwrap_or_else(|| "ghost".to_string()),
        author_avatar_url: author.map(|author| author.avatar_url.to_string()),
        author_association: pull_request
            .author_association
            .as_ref()
            .and_then(serialized_enum_name),
        assignees: pull_request
            .assignees
            .unwrap_or_default()
            .into_iter()
            .map(|assignee| assignee.login)
            .collect(),
        requested_reviewers: pull_request
            .requested_reviewers
            .unwrap_or_default()
            .into_iter()
            .map(|reviewer| reviewer.login)
            .collect(),
        requested_teams: pull_request
            .requested_teams
            .unwrap_or_default()
            .into_iter()
            .map(|team| GitHubPullRequestReviewTeam {
                name: team.name,
                slug: team.slug,
                description: team.description,
            })
            .collect(),
        labels: pull_request
            .labels
            .unwrap_or_default()
            .into_iter()
            .map(issue_label_from_octocrab)
            .collect(),
        milestone,
        milestone_number,
        locked: pull_request.locked,
        head_ref: pull_request.head.ref_field.clone(),
        head_label: pull_request.head.label.clone(),
        head_sha: pull_request.head.sha.clone(),
        base_ref: pull_request.base.ref_field.clone(),
        additions: pull_request.additions.unwrap_or_default(),
        deletions: pull_request.deletions.unwrap_or_default(),
        changed_files: pull_request.changed_files.unwrap_or_default(),
        commits: pull_request.commits.unwrap_or_default(),
        comments: pull_request.comments.unwrap_or_default(),
        review_comments: pull_request.review_comments.unwrap_or_default(),
        merged_by: pull_request.merged_by.map(|author| author.login),
        created_at: pull_request.created_at.map(|date| date.to_rfc3339()),
        updated_at: pull_request.updated_at.map(|date| date.to_rfc3339()),
        closed_at: pull_request.closed_at.map(|date| date.to_rfc3339()),
        merged_at: pull_request.merged_at.map(|date| date.to_rfc3339()),
    }
}

fn pull_request_review_from_octocrab(
    review: octocrab::models::pulls::Review,
) -> Option<GitHubPullRequestReview> {
    let author = review.user?;
    let state = pull_request_review_state_from_octocrab(review.state?);
    Some(GitHubPullRequestReview {
        id: review.id.into_inner(),
        node_id: review.node_id,
        author: author.login,
        author_avatar_url: Some(author.avatar_url.to_string()),
        author_association: review
            .author_association
            .and_then(|association| serialized_enum_name(&association)),
        state,
        body: review.body,
        url: review.html_url.to_string(),
        commit_id: review.commit_id,
        submitted_at: review.submitted_at.map(|date| date.to_rfc3339()),
    })
}

fn pull_request_review_state_from_octocrab(
    state: octocrab::models::pulls::ReviewState,
) -> GitHubPullRequestReviewState {
    match state {
        octocrab::models::pulls::ReviewState::Approved => GitHubPullRequestReviewState::Approved,
        octocrab::models::pulls::ReviewState::ChangesRequested => {
            GitHubPullRequestReviewState::ChangesRequested
        }
        octocrab::models::pulls::ReviewState::Dismissed => GitHubPullRequestReviewState::Dismissed,
        octocrab::models::pulls::ReviewState::Pending
        | octocrab::models::pulls::ReviewState::Open => GitHubPullRequestReviewState::Pending,
        _ => GitHubPullRequestReviewState::Commented,
    }
}

fn pull_request_commit_from_octocrab(
    commit: octocrab::models::repos::RepoCommit,
) -> GitHubPullRequestCommit {
    let author = commit.commit.author.as_ref();
    let title = commit
        .commit
        .message
        .lines()
        .next()
        .unwrap_or_default()
        .to_string();
    GitHubPullRequestCommit {
        short_sha: commit.sha.chars().take(7).collect(),
        sha: commit.sha,
        title,
        message: commit.commit.message,
        author: author.map(|author| author.name.clone()),
        author_login: commit.author.as_ref().map(|author| author.login.clone()),
        author_avatar_url: commit
            .author
            .as_ref()
            .map(|author| author.avatar_url.to_string()),
        committed_at: author.and_then(|author| author.date.map(|date| date.to_rfc3339())),
        url: commit.html_url,
        verified: commit
            .commit
            .verification
            .as_ref()
            .map(|verification| verification.verified),
    }
}

fn pull_request_file_from_octocrab(
    file: octocrab::models::repos::DiffEntry,
) -> GitHubPullRequestFile {
    GitHubPullRequestFile {
        sha: file.sha,
        path: file.filename,
        previous_path: file.previous_filename,
        status: serialized_enum_name(&file.status).unwrap_or_else(|| "changed".to_string()),
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        blob_url: file.blob_url,
    }
}

fn pull_request_review_thread_from_graphql(
    thread: PullRequestReviewThreadNode,
) -> GitHubPullRequestReviewThread {
    let comments_have_more = thread.comments.page_info.has_next_page;
    GitHubPullRequestReviewThread {
        id: thread.id,
        path: thread.path,
        line: thread.line,
        original_line: thread.original_line,
        start_line: thread.start_line,
        original_start_line: thread.original_start_line,
        side: review_comment_side_from_graphql(thread.diff_side),
        start_side: thread.start_diff_side.map(review_comment_side_from_graphql),
        subject_type: match thread.subject_type {
            GraphQlPullRequestReviewThreadSubjectType::Line => {
                GitHubPullRequestReviewThreadSubjectType::Line
            }
            GraphQlPullRequestReviewThreadSubjectType::File => {
                GitHubPullRequestReviewThreadSubjectType::File
            }
        },
        is_resolved: thread.is_resolved,
        is_outdated: thread.is_outdated,
        is_collapsed: thread.is_collapsed,
        resolved_by: thread.resolved_by.map(|actor| actor.login),
        viewer_can_reply: thread.viewer_can_reply,
        viewer_can_resolve: thread.viewer_can_resolve,
        viewer_can_unresolve: thread.viewer_can_unresolve,
        comments: thread
            .comments
            .nodes
            .into_iter()
            .map(pull_request_review_thread_comment_from_graphql)
            .collect(),
        comments_have_more,
    }
}

fn pull_request_review_thread_comment_from_graphql(
    comment: PullRequestReviewThreadCommentNode,
) -> GitHubPullRequestReviewThreadComment {
    let (author, author_avatar_url) = comment
        .author
        .map(|author| (author.login, author.avatar_url))
        .unwrap_or_else(|| ("ghost".to_string(), None));
    GitHubPullRequestReviewThreadComment {
        id: comment.id,
        database_id: comment.database_id,
        author,
        author_avatar_url,
        author_association: comment.author_association,
        body: comment.body,
        url: comment.url,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        pending: comment.state.eq_ignore_ascii_case("PENDING"),
        viewer_can_update: comment.viewer_can_update,
        viewer_can_delete: comment.viewer_can_delete,
        is_minimized: comment.is_minimized,
        minimized_reason: comment.minimized_reason,
        outdated: comment.outdated,
    }
}

fn pull_request_review_thread_state_from_graphql(
    thread: PullRequestReviewThreadStateNode,
) -> GitHubPullRequestReviewThreadState {
    GitHubPullRequestReviewThreadState {
        id: thread.id,
        is_resolved: thread.is_resolved,
        is_collapsed: thread.is_collapsed,
        resolved_by: thread.resolved_by.map(|actor| actor.login),
        viewer_can_reply: thread.viewer_can_reply,
        viewer_can_resolve: thread.viewer_can_resolve,
        viewer_can_unresolve: thread.viewer_can_unresolve,
    }
}

fn review_comment_side_from_graphql(side: GraphQlDiffSide) -> GitHubPullRequestReviewCommentSide {
    match side {
        GraphQlDiffSide::Left => GitHubPullRequestReviewCommentSide::Left,
        GraphQlDiffSide::Right => GitHubPullRequestReviewCommentSide::Right,
    }
}

fn repository_from_octocrab(repository: octocrab::models::Repository) -> Option<GitHubRepository> {
    let full_name = repository.full_name.clone();
    let owner = repository
        .owner
        .as_ref()
        .map(|owner| owner.login.clone())
        .or_else(|| {
            full_name
                .as_deref()
                .and_then(|name| name.split_once('/'))
                .map(|(owner, _)| owner.to_string())
        })?;
    let full_name = full_name.unwrap_or_else(|| format!("{owner}/{}", repository.name));
    let url = repository
        .html_url
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("https://github.com/{full_name}"));
    let language = repository
        .language
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);

    Some(GitHubRepository {
        id: repository.id.into_inner(),
        owner,
        name: repository.name,
        full_name,
        description: repository.description,
        url,
        language,
        stars: repository.stargazers_count.unwrap_or_default(),
        forks: repository.forks_count.unwrap_or_default(),
        open_issues: repository.open_issues_count.unwrap_or_default(),
        default_branch: repository
            .default_branch
            .unwrap_or_else(|| "HEAD".to_string()),
        is_private: repository.private.unwrap_or_default(),
        is_fork: repository.fork.unwrap_or_default(),
        is_archived: repository.archived.unwrap_or_default(),
        updated_at: repository.updated_at.map(|updated| updated.to_rfc3339()),
    })
}

fn serialized_enum_name<T: Serialize>(value: &T) -> Option<String> {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
}

pub struct SystemCredentialStore {
    service: String,
    account: String,
}

impl Default for SystemCredentialStore {
    fn default() -> Self {
        Self {
            service: "com.harbor.desktop".to_string(),
            account: "github-access-token".to_string(),
        }
    }
}

impl SystemCredentialStore {
    fn entry(&self) -> Result<Entry, AppError> {
        Entry::new(&self.service, &self.account)
            .map_err(|error| AppError::Credentials(error.to_string()))
    }
}

impl CredentialStore for SystemCredentialStore {
    fn load_github_credentials(&self) -> Result<Option<GitHubOAuthCredentials>, AppError> {
        match self.entry()?.get_password() {
            Ok(value) => match serde_json::from_str(&value) {
                Ok(credentials) => Ok(Some(credentials)),
                Err(_) if value.starts_with("github_pat_") || value.starts_with("ghp_") => Ok(None),
                Err(_) => Err(AppError::Credentials(
                    "stored GitHub credentials are invalid".to_string(),
                )),
            },
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(AppError::Credentials(error.to_string())),
        }
    }

    fn save_github_credentials(
        &self,
        credentials: &GitHubOAuthCredentials,
    ) -> Result<(), AppError> {
        let value = serde_json::to_string(credentials)
            .map_err(|error| AppError::Credentials(error.to_string()))?;
        self.entry()?
            .set_password(&value)
            .map_err(|error| AppError::Credentials(error.to_string()))
    }

    fn delete_github_credentials(&self) -> Result<(), AppError> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(AppError::Credentials(error.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    };

    use oauth2::PkceCodeVerifier;

    use crate::github_oauth::{GitHubOAuthConfig, GitHubTokenExchange, GITHUB_OAUTH_CALLBACK_URL};

    use super::*;

    pub(super) struct FakeGitHubClient;

    #[async_trait]
    impl GitHubClient for FakeGitHubClient {
        async fn validate_token(&self, token: &str) -> Result<GitHubIdentity, AppError> {
            if token == "github-user-access-token" {
                Ok(GitHubIdentity {
                    login: "octocat".to_string(),
                    avatar_url: Some("https://github.com/octocat.png".to_string()),
                })
            } else {
                Err(AppError::GitHub("token rejected".to_string()))
            }
        }

        async fn list_repositories(
            &self,
            token: &str,
            page: u32,
        ) -> Result<GitHubRepositoryPage, AppError> {
            assert_eq!(token, "github-user-access-token");
            Ok(GitHubRepositoryPage {
                repositories: vec![GitHubRepository {
                    id: 1,
                    owner: "octocat".to_string(),
                    name: "hello-world".to_string(),
                    full_name: "octocat/hello-world".to_string(),
                    description: Some("A repository".to_string()),
                    url: "https://github.com/octocat/hello-world".to_string(),
                    language: Some("Rust".to_string()),
                    stars: 42,
                    forks: 3,
                    open_issues: 1,
                    default_branch: "main".to_string(),
                    is_private: false,
                    is_fork: false,
                    is_archived: false,
                    updated_at: Some("2026-08-25T08:00:00+00:00".to_string()),
                }],
                page,
                has_more: page < 2,
            })
        }

        async fn list_pull_requests(
            &self,
            token: &str,
            owner: &str,
            repository: &str,
            filters: &GitHubPullRequestFilters,
        ) -> Result<GitHubPullRequestPage, AppError> {
            assert_eq!(token, "github-user-access-token");
            assert_eq!((owner, repository), ("octocat", "hello-world"));
            Ok(GitHubPullRequestPage {
                pull_requests: Vec::new(),
                total_count: 0,
                page: filters.page,
                has_previous: filters.page > 1,
                has_more: false,
            })
        }

        async fn list_pull_request_inbox(
            &self,
            token: &str,
            filters: &GitHubPullRequestInboxFilters,
        ) -> Result<GitHubPullRequestPage, AppError> {
            assert_eq!(token, "github-user-access-token");
            Ok(GitHubPullRequestPage {
                pull_requests: Vec::new(),
                total_count: 0,
                page: filters.page,
                has_previous: filters.page > 1,
                has_more: false,
            })
        }

        async fn pull_request_detail(
            &self,
            token: &str,
            owner: &str,
            repository: &str,
            pull_request_number: u64,
            timeline_page: u32,
        ) -> Result<GitHubPullRequestDetailPage, AppError> {
            assert_eq!(token, "github-user-access-token");
            assert_eq!((owner, repository), ("octocat", "hello-world"));
            Ok(GitHubPullRequestDetailPage {
                pull_request: GitHubPullRequest {
                    id: 3,
                    reaction_subject: Some(GitHubReactionSubjectRef {
                        id: "PR_3".to_string(),
                        kind: GitHubReactionSubjectKind::PullRequest,
                    }),
                    number: pull_request_number,
                    title: "Ship the PR workspace".to_string(),
                    body: Some("Pull request body".to_string()),
                    url: format!(
                        "https://github.com/octocat/hello-world/pull/{pull_request_number}"
                    ),
                    state: GitHubPullRequestState::Open,
                    draft: false,
                    merged: false,
                    mergeable: Some(true),
                    mergeable_state: Some("clean".to_string()),
                    maintainer_can_modify: Some(false),
                    author: "octocat".to_string(),
                    author_avatar_url: Some("https://github.com/octocat.png".to_string()),
                    author_association: Some("owner".to_string()),
                    assignees: Vec::new(),
                    requested_reviewers: Vec::new(),
                    requested_teams: Vec::new(),
                    labels: Vec::new(),
                    milestone: None,
                    milestone_number: None,
                    locked: false,
                    head_ref: "feature/pr-workspace".to_string(),
                    head_label: Some("octocat:feature/pr-workspace".to_string()),
                    head_sha: "abc1234".to_string(),
                    base_ref: "main".to_string(),
                    additions: 12,
                    deletions: 3,
                    changed_files: 2,
                    commits: 1,
                    comments: 0,
                    review_comments: 0,
                    merged_by: None,
                    created_at: Some("2026-08-25T08:00:00+00:00".to_string()),
                    updated_at: Some("2026-08-25T08:00:00+00:00".to_string()),
                    closed_at: None,
                    merged_at: None,
                },
                timeline: Vec::new(),
                reviews: Vec::new(),
                reviews_have_more: false,
                timeline_page,
                timeline_has_previous: timeline_page > 1,
                timeline_has_more: false,
            })
        }

        async fn pull_request_commits(
            &self,
            _token: &str,
            _owner: &str,
            _repository: &str,
            _pull_request_number: u64,
            page: u32,
        ) -> Result<GitHubPullRequestCommitPage, AppError> {
            Ok(GitHubPullRequestCommitPage {
                commits: Vec::new(),
                page,
                has_previous: page > 1,
                has_more: false,
            })
        }

        async fn pull_request_files(
            &self,
            _token: &str,
            _owner: &str,
            _repository: &str,
            _pull_request_number: u64,
            page: u32,
        ) -> Result<GitHubPullRequestFilePage, AppError> {
            Ok(GitHubPullRequestFilePage {
                files: Vec::new(),
                page,
                has_previous: page > 1,
                has_more: false,
            })
        }

        async fn pull_request_review_threads(
            &self,
            token: &str,
            owner: &str,
            repository: &str,
            pull_request_number: u64,
            after: Option<&str>,
        ) -> Result<GitHubPullRequestReviewThreadPage, AppError> {
            assert_eq!(token, "github-user-access-token");
            assert_eq!(
                (owner, repository, pull_request_number, after),
                ("octocat", "hello-world", 12, Some("cursor-1"))
            );
            Ok(GitHubPullRequestReviewThreadPage {
                threads: vec![GitHubPullRequestReviewThread {
                    id: "PRRT_1".to_string(),
                    path: "src/review.rs".to_string(),
                    line: Some(42),
                    original_line: Some(40),
                    start_line: None,
                    original_start_line: None,
                    side: GitHubPullRequestReviewCommentSide::Right,
                    start_side: None,
                    subject_type: GitHubPullRequestReviewThreadSubjectType::Line,
                    is_resolved: false,
                    is_outdated: false,
                    is_collapsed: false,
                    resolved_by: None,
                    viewer_can_reply: true,
                    viewer_can_resolve: true,
                    viewer_can_unresolve: false,
                    comments: Vec::new(),
                    comments_have_more: false,
                }],
                end_cursor: Some("cursor-2".to_string()),
                has_more: true,
            })
        }

        async fn reply_to_pull_request_review_thread(
            &self,
            token: &str,
            thread_id: &str,
            body: &str,
        ) -> Result<GitHubPullRequestReviewThreadComment, AppError> {
            assert_eq!(token, "github-user-access-token");
            assert_eq!(thread_id, "PRRT_1");
            assert_eq!(body, "Covered by the new regression test.");
            Ok(GitHubPullRequestReviewThreadComment {
                id: "PRRC_2".to_string(),
                database_id: Some(92),
                author: "octocat".to_string(),
                author_avatar_url: Some("https://github.com/octocat.png".to_string()),
                author_association: Some("OWNER".to_string()),
                body: body.to_string(),
                url: "https://github.com/octocat/hello-world/pull/12#discussion_r92".to_string(),
                created_at: "2026-08-27T08:00:00Z".to_string(),
                updated_at: "2026-08-27T08:00:00Z".to_string(),
                pending: false,
                viewer_can_update: true,
                viewer_can_delete: true,
                is_minimized: false,
                minimized_reason: None,
                outdated: false,
            })
        }

        async fn set_pull_request_review_thread_resolution(
            &self,
            token: &str,
            thread_id: &str,
            resolution: GitHubPullRequestReviewThreadResolution,
        ) -> Result<GitHubPullRequestReviewThreadState, AppError> {
            assert_eq!(token, "github-user-access-token");
            assert_eq!(thread_id, "PRRT_1");
            let is_resolved = resolution == GitHubPullRequestReviewThreadResolution::Resolved;
            Ok(GitHubPullRequestReviewThreadState {
                id: thread_id.to_string(),
                is_resolved,
                is_collapsed: is_resolved,
                resolved_by: is_resolved.then(|| "octocat".to_string()),
                viewer_can_reply: true,
                viewer_can_resolve: !is_resolved,
                viewer_can_unresolve: is_resolved,
            })
        }
    }

    #[derive(Default)]
    struct MemoryCredentialStore {
        credentials: Mutex<Option<GitHubOAuthCredentials>>,
        load_count: AtomicUsize,
    }

    impl CredentialStore for MemoryCredentialStore {
        fn load_github_credentials(&self) -> Result<Option<GitHubOAuthCredentials>, AppError> {
            self.load_count.fetch_add(1, Ordering::Relaxed);
            Ok(self.credentials.lock().expect("credentials lock").clone())
        }

        fn save_github_credentials(
            &self,
            credentials: &GitHubOAuthCredentials,
        ) -> Result<(), AppError> {
            *self.credentials.lock().expect("credentials lock") = Some(credentials.clone());
            Ok(())
        }

        fn delete_github_credentials(&self) -> Result<(), AppError> {
            *self.credentials.lock().expect("credentials lock") = None;
            Ok(())
        }
    }

    struct TestTokenExchange {
        access_token: &'static str,
    }

    #[async_trait]
    impl GitHubTokenExchange for TestTokenExchange {
        async fn exchange_code(
            &self,
            _code: String,
            _pkce_verifier: PkceCodeVerifier,
        ) -> Result<GitHubOAuthCredentials, AppError> {
            Ok(GitHubOAuthCredentials {
                access_token: self.access_token.to_string(),
                refresh_token: Some("github-refresh-token".to_string()),
                expires_at: None,
                scopes: Vec::new(),
            })
        }

        async fn refresh_token(
            &self,
            _refresh_token: String,
        ) -> Result<GitHubOAuthCredentials, AppError> {
            Ok(GitHubOAuthCredentials {
                access_token: self.access_token.to_string(),
                refresh_token: Some("rotated-refresh-token".to_string()),
                expires_at: None,
                scopes: Vec::new(),
            })
        }
    }

    fn oauth_credentials() -> GitHubOAuthCredentials {
        GitHubOAuthCredentials {
            access_token: "github-user-access-token".to_string(),
            refresh_token: Some("github-refresh-token".to_string()),
            expires_at: None,
            scopes: Vec::new(),
        }
    }

    pub(super) fn oauth_session(access_token: &'static str) -> Arc<GitHubOAuthSession> {
        Arc::new(
            GitHubOAuthSession::with_token_exchange(
                GitHubOAuthConfig {
                    client_id: "harbor-client-id".to_string(),
                    client_secret: "harbor-client-secret".to_string(),
                },
                Arc::new(TestTokenExchange { access_token }),
            )
            .expect("OAuth session"),
        )
    }

    fn callback_for(attempt: GitHubLoginAttempt) -> String {
        let authorization_url =
            oauth2::url::Url::parse(&attempt.authorization_url).expect("authorization URL");
        let state = authorization_url
            .query_pairs()
            .find_map(|(key, value)| (key == "state").then(|| value.into_owned()))
            .expect("state");
        format!("{GITHUB_OAUTH_CALLBACK_URL}?code=temporary-code&state={state}")
    }

    #[tokio::test]
    async fn browser_callback_validates_before_saving_and_returns_identity() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials.clone(),
            Some(oauth_session("github-user-access-token")),
        );
        let callback = callback_for(service.begin_login().expect("login attempt"));

        let connection = service
            .complete_login(&callback)
            .await
            .expect("valid OAuth callback should connect");

        assert_eq!(connection.identity.expect("identity").login, "octocat");
        assert_eq!(
            credentials
                .load_github_credentials()
                .expect("stored credentials"),
            Some(oauth_credentials())
        );
    }

    #[tokio::test]
    async fn rejected_oauth_token_is_not_saved() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials.clone(),
            Some(oauth_session("rejected-user-access-token")),
        );
        let callback = callback_for(service.begin_login().expect("login attempt"));

        let result = service.complete_login(&callback).await;

        assert!(result.is_err());
        assert_eq!(
            credentials
                .load_github_credentials()
                .expect("stored credentials"),
            None
        );
    }

    #[tokio::test]
    async fn status_restores_a_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let connection = service.status().await.expect("status");

        assert!(connection.connected);
        assert_eq!(connection.identity.expect("identity").login, "octocat");
    }

    #[tokio::test]
    async fn status_rejects_a_saved_github_app_user_token() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&GitHubOAuthCredentials {
                access_token: "ghu_saved-github-app-token".to_string(),
                refresh_token: None,
                expires_at: None,
                scopes: Vec::new(),
            })
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let result = service.status().await;

        assert!(matches!(
            result,
            Err(AppError::GitHubAuthentication(message)) if message.contains("OAuth App")
        ));
    }

    #[tokio::test]
    async fn disconnect_removes_credentials_and_cached_identity() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials.clone(), None);
        *service.identity.write().expect("identity lock") = Some(GitHubIdentity {
            login: "octocat".to_string(),
            avatar_url: None,
        });

        let connection = service.disconnect().await.expect("disconnect");

        assert_eq!(connection, GitHubConnection::disconnected());
        assert_eq!(
            credentials
                .load_github_credentials()
                .expect("stored credentials"),
            None
        );
        assert!(service.identity.read().expect("identity lock").is_none());
    }

    #[tokio::test]
    async fn data_queries_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let repositories = service.repositories(1).await.expect("repositories");
        let notifications = service.notifications(true, 2).await.expect("notifications");
        let repository_invitations = service
            .received_repository_invitations(1)
            .await
            .expect("repository invitations");
        let issue_filters = GitHubIssueFilters {
            state: GitHubIssueState::Open,
            assignment: GitHubIssueAssignment::All,
            query: String::new(),
            label: String::new(),
            sort: GitHubIssueSort::Updated,
            page: 1,
        };
        let issues = service
            .issues("octocat", "hello-world", &issue_filters)
            .await
            .expect("issues");
        let issue_inbox = service
            .issue_inbox(&GitHubIssueInboxFilters {
                scope: GitHubIssueInboxScope::Mentioned,
                state: GitHubIssueState::Open,
                query: String::new(),
                sort: GitHubIssueSort::Updated,
                page: 1,
            })
            .await
            .expect("issue inbox");
        let discussion_categories = service
            .discussion_categories("octocat", "hello-world")
            .await
            .expect("discussion categories");
        let discussions = service
            .discussions(
                "octocat",
                "hello-world",
                &GitHubDiscussionFilters {
                    category_id: None,
                    state: GitHubDiscussionStateFilter::Open,
                    answered: GitHubDiscussionAnsweredFilter::All,
                    sort: GitHubDiscussionSort::Updated,
                    after: None,
                },
            )
            .await
            .expect("discussions");
        let discussion = service
            .discussion_detail("octocat", "hello-world", 42, None)
            .await
            .expect("discussion detail");
        let reaction_subject = GitHubReactionSubjectRef {
            id: "I_kwDOA".to_string(),
            kind: GitHubReactionSubjectKind::Issue,
        };
        let reactions = service
            .reaction_subjects(
                "octocat",
                "hello-world",
                std::slice::from_ref(&reaction_subject),
            )
            .await
            .expect("reaction subjects");
        let updated_reaction = service
            .update_reaction(
                "octocat",
                "hello-world",
                &reaction_subject,
                GitHubReactionContent::Heart,
                true,
            )
            .await
            .expect("updated reaction");
        let releases = service
            .releases("octocat", "hello-world", 2)
            .await
            .expect("releases");
        let release = service
            .release("octocat", "hello-world", 88)
            .await
            .expect("release");
        let release_asset = service
            .download_release_asset("octocat", "hello-world", 88, 96)
            .await
            .expect("release asset");
        let release_archive = service
            .download_release_archive(
                "octocat",
                "hello-world",
                88,
                GitHubReleaseArchiveFormat::TarGz,
            )
            .await
            .expect("release archive");
        let release_input = GitHubReleaseMutationInput {
            tag_name: "v1.0.0".to_string(),
            target_commitish: "main".to_string(),
            name: "Harbor 1.0".to_string(),
            body: "A focused release.".to_string(),
            draft: false,
            prerelease: true,
        };
        let created_release = service
            .create_release("octocat", "hello-world", release_input.clone())
            .await
            .expect("created release");
        let updated_release = service
            .update_release("octocat", "hello-world", 88, release_input)
            .await
            .expect("updated release");
        let uploaded_asset = service
            .upload_release_asset(
                "octocat",
                "hello-world",
                88,
                release::GitHubReleaseAssetUpload {
                    path: std::path::PathBuf::from("harbor.dmg"),
                    name: "harbor.dmg".to_string(),
                    size: 12,
                },
            )
            .await
            .expect("uploaded release asset");
        service
            .delete_release_asset("octocat", "hello-world", 88, 96)
            .await
            .expect("deleted release asset");
        service
            .delete_release("octocat", "hello-world", 88)
            .await
            .expect("deleted release");
        let overview = service
            .code_overview("octocat", "hello-world", "main")
            .await
            .expect("code overview");
        let commit = service
            .commit_detail(
                "octocat",
                "hello-world",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                1,
            )
            .await
            .expect("commit detail");
        let contents = service
            .contents("octocat", "hello-world", "main", "")
            .await
            .expect("contents");
        let workflows = service
            .workflows("octocat", "hello-world")
            .await
            .expect("workflows");
        let workflow_runs = service
            .workflow_runs(
                "octocat",
                "hello-world",
                None,
                &GitHubWorkflowRunFilters {
                    page: 2,
                    ..GitHubWorkflowRunFilters::default()
                },
            )
            .await
            .expect("workflow runs");
        let workflow_run_filters = service
            .workflow_run_filter_options("octocat", "hello-world", Some(7))
            .await
            .expect("workflow run filters");
        let workflow_jobs = service
            .workflow_jobs("octocat", "hello-world", 42, 3)
            .await
            .expect("workflow jobs");
        let workflow_log = service
            .workflow_job_log("octocat", "hello-world", 84)
            .await
            .expect("workflow job log");
        let workflow_artifacts = service
            .workflow_artifacts("octocat", "hello-world", 42, 4)
            .await
            .expect("workflow artifacts");
        let workflow_artifact_download = service
            .download_workflow_artifact("octocat", "hello-world", 42, 96)
            .await
            .expect("workflow artifact download");

        assert_eq!(
            repositories.repositories[0].full_name,
            "octocat/hello-world"
        );
        assert_eq!(notifications.page, 2);
        assert_eq!(repository_invitations.page, 1);
        assert_eq!(issues.issues[0].number, 7);
        assert_eq!(issue_inbox.issues[0].issue.number, 7);
        assert!(discussion_categories.enabled);
        assert_eq!(discussions.discussions[0].number, 42);
        assert_eq!(discussion.comments[0].body, "A focused answer.");
        assert_eq!(reactions[0].id, reaction_subject.id);
        assert!(updated_reaction.groups[0].viewer_has_reacted);
        assert_eq!(releases.page, 2);
        assert_eq!(release.tag_name, "v1.0.0");
        assert_eq!(release_asset.bytes, b"release-asset");
        assert_eq!(release_archive.bytes, b"source-archive");
        assert_eq!(created_release.tag_name, "v1.0.0");
        assert_eq!(updated_release.tag_name, "v1.0.0");
        assert_eq!(uploaded_asset.name, "harbor.dmg");
        assert_eq!(overview.commits[0].short_sha, "abc1234");
        assert_eq!(commit.commit.short_sha, "aaaaaaa");
        assert_eq!(contents.entries[0].path, "src");
        assert_eq!(workflows[0].name, "CI");
        assert_eq!(workflow_runs.page, 2);
        assert_eq!(workflow_run_filters.branches, ["main"]);
        assert_eq!(workflow_jobs.page, 3);
        assert_eq!(workflow_log.content, "Finished");
        assert_eq!(workflow_artifacts.page, 4);
        assert_eq!(workflow_artifacts.artifacts[0].name, "frontend-dist");
        assert!(workflow_artifact_download.bytes.starts_with(b"PK"));
    }

    #[tokio::test]
    async fn notification_actions_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        service
            .update_notification(42, GitHubNotificationAction::Done)
            .await
            .expect("notification update");
        service
            .mark_all_notifications_read()
            .await
            .expect("mark all notifications read");
        service
            .update_received_repository_invitation(
                73,
                GitHubReceivedRepositoryInvitationAction::Accept,
            )
            .await
            .expect("accept repository invitation");
    }

    #[tokio::test]
    async fn conversation_controls_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let controls = service
            .conversation_controls("octocat", "hello-world", 7, GitHubConversationKind::Issue)
            .await
            .expect("conversation controls");
        let locked = service
            .update_conversation_lock(
                "octocat",
                "hello-world",
                7,
                GitHubConversationKind::Issue,
                GitHubConversationLockAction::Lock,
                Some(GitHubConversationLockReason::Resolved),
            )
            .await
            .expect("lock conversation");
        let subscribed = service
            .update_conversation_subscription(
                "octocat",
                "hello-world",
                7,
                GitHubConversationKind::Issue,
                GitHubConversationSubscriptionAction::Subscribe,
            )
            .await
            .expect("subscribe to conversation");

        assert!(!controls.locked);
        assert!(locked.locked);
        assert_eq!(
            locked.lock_reason,
            Some(GitHubConversationLockReason::Resolved)
        );
        assert_eq!(
            subscribed.viewer_subscription,
            Some(conversation::GitHubConversationSubscriptionState::Subscribed)
        );
    }

    #[tokio::test]
    async fn repository_access_uses_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let collaborators = service
            .personal_repository_collaborators("octocat", "hello-world", 1)
            .await
            .expect("repository collaborators");
        let invitations = service
            .personal_repository_invitations("octocat", "hello-world", 1)
            .await
            .expect("repository invitations");
        let invited = service
            .invite_personal_repository_collaborator("octocat", "hello-world", "hubot")
            .await
            .expect("invite collaborator");
        service
            .cancel_personal_repository_invitation("octocat", "hello-world", 7)
            .await
            .expect("cancel invitation");
        service
            .remove_personal_repository_collaborator("octocat", "hello-world", "hubot")
            .await
            .expect("remove collaborator");

        assert_eq!(collaborators.collaborators[0].login, "hubot");
        assert!(invitations.invitations.is_empty());
        assert_eq!(
            invited.status,
            repository_access::GitHubRepositoryInviteStatus::Invited
        );
    }

    #[tokio::test]
    async fn workflow_actions_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        for action in [
            GitHubWorkflowRunAction::Cancel,
            GitHubWorkflowRunAction::RerunAll,
            GitHubWorkflowRunAction::RerunFailed,
        ] {
            service
                .request_workflow_run_action("octocat", "hello-world", 42, action)
                .await
                .expect("workflow action");
        }

        service
            .request_workflow_job_rerun("octocat", "hello-world", 42, 84)
            .await
            .expect("workflow job rerun");

        let workflow = service
            .set_workflow_enabled("octocat", "hello-world", 7, "active", false)
            .await
            .expect("workflow disable");
        let deletion = service
            .delete_workflow_run("octocat", "hello-world", 42, 7, "2026-08-26T08:05:00Z")
            .await
            .expect("workflow run deletion");

        assert_eq!(workflow.state, "disabled_manually");
        assert_eq!(deletion.run_id, 42);
    }

    #[tokio::test]
    async fn issue_mutations_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let created = service
            .create_issue(
                "octocat",
                "hello-world",
                "Keep Issue work in Harbor",
                "Created from the desktop app.",
            )
            .await
            .expect("created issue");
        let edited = service
            .update_issue_content(
                "octocat",
                "hello-world",
                7,
                "Updated Issue title",
                "Updated **Markdown** body.",
            )
            .await
            .expect("edited issue");
        let assignees = service
            .issue_assignees("octocat", "hello-world")
            .await
            .expect("issue assignees");
        let milestones = service
            .issue_milestones("octocat", "hello-world")
            .await
            .expect("issue milestones");
        let metadata = service
            .update_issue_metadata(
                "octocat",
                "hello-world",
                7,
                &["bug".to_string()],
                &["hubot".to_string()],
                Some(3),
            )
            .await
            .expect("updated issue metadata");
        let comment = service
            .create_issue_comment("octocat", "hello-world", 7, "Fixed in #41.")
            .await
            .expect("issue comment");
        let updated_comment = service
            .mutate_issue_comment(
                "octocat",
                "hello-world",
                7,
                &GitHubCommentMutation::Update {
                    comment_id: "IC_84".to_string(),
                    expected_updated_at: "2026-08-26T10:00:00+00:00".to_string(),
                    body: "Updated Issue comment.".to_string(),
                },
            )
            .await
            .expect("updated issue comment")
            .expect("returned issue comment");
        let state_mutation: GitHubIssueStateMutation = serde_json::from_value(serde_json::json!({
            "desiredState": "closed",
            "closeReason": "completed",
            "expected": {
                "issueId": 2,
                "issueNodeId": "I_2",
                "state": "open",
                "stateReason": null,
                "updatedAt": "2026-08-25T08:00:00+00:00"
            }
        }))
        .expect("Issue state mutation");
        let issue = service
            .update_issue_state("octocat", "hello-world", 7, &state_mutation)
            .await
            .expect("closed issue");
        let label = service
            .mutate_issue_label(
                "octocat",
                "hello-world",
                GitHubIssueLabelMutation::Create {
                    name: " needs-triage ".to_string(),
                    color: "#A1B2C3".to_string(),
                    description: " Sort new reports ".to_string(),
                },
            )
            .await
            .expect("created label")
            .expect("returned label");
        let milestone = service
            .mutate_issue_milestone(
                "octocat",
                "hello-world",
                GitHubIssueMilestoneMutation::Update {
                    number: 3,
                    title: " Harbor 1.0 ".to_string(),
                    description: " Ship the desktop workflow. ".to_string(),
                    due_on: Some("2026-09-30".to_string()),
                    state: GitHubIssueMilestoneState::Closed,
                },
            )
            .await
            .expect("updated milestone")
            .expect("returned milestone");

        assert_eq!(created.number, 9);
        assert_eq!(created.title, "Keep Issue work in Harbor");
        assert_eq!(edited.title, "Updated Issue title");
        assert_eq!(edited.body.as_deref(), Some("Updated **Markdown** body."));
        assert_eq!(assignees.assignees[0].login, "hubot");
        assert_eq!(milestones.milestones[0].number, 3);
        assert_eq!(metadata.labels[0].name, "bug");
        assert_eq!(metadata.assignees, ["hubot"]);
        assert_eq!(metadata.milestone_number, Some(3));
        assert_eq!(comment.kind, GitHubIssueTimelineKind::Comment);
        assert_eq!(comment.body.as_deref(), Some("Fixed in #41."));
        assert_eq!(
            updated_comment.body.as_deref(),
            Some("Updated Issue comment.")
        );
        assert_eq!(issue.state, GitHubIssueState::Closed);
        assert_eq!(issue.state_reason.as_deref(), Some("completed"));
        assert_eq!(label.name, "needs-triage");
        assert_eq!(label.color, "a1b2c3");
        assert_eq!(milestone.title, "Harbor 1.0");
        assert_eq!(milestone.state, "closed");
        assert_eq!(milestone.due_on.as_deref(), Some("2026-09-30T00:00:00Z"));
    }

    #[tokio::test]
    async fn pull_request_mutations_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let comparison = service
            .compare_pull_request_branches("octocat", "hello-world", "main", "feature/create")
            .await
            .expect("pull request branch comparison");
        let created = service
            .create_pull_request(
                "octocat",
                "hello-world",
                "main",
                "feature/create",
                "Create pull requests in Harbor",
                "Complete the native workflow.",
                true,
            )
            .await
            .expect("created pull request");
        let edited = service
            .update_pull_request_content(
                "octocat",
                "hello-world",
                12,
                "Updated pull request title",
                "Updated **Markdown** body.",
            )
            .await
            .expect("edited pull request");
        let closed = service
            .update_pull_request_state("octocat", "hello-world", 12, GitHubPullRequestState::Closed)
            .await
            .expect("closed pull request");
        let reopened = service
            .update_pull_request_state("octocat", "hello-world", 12, GitHubPullRequestState::Open)
            .await
            .expect("reopened pull request");
        let auto_merge_status = service
            .pull_request_auto_merge_status("octocat", "hello-world", 12)
            .await
            .expect("pull request auto-merge status");
        let auto_merge_enabled = service
            .enable_pull_request_auto_merge(
                "octocat",
                "hello-world",
                12,
                "abc1234",
                GitHubPullRequestMergeMethod::Squash,
            )
            .await
            .expect("enabled pull request auto-merge");
        let auto_merge_disabled = service
            .disable_pull_request_auto_merge("octocat", "hello-world", 12)
            .await
            .expect("disabled pull request auto-merge");
        let merge_queue_status = service
            .pull_request_merge_queue_status("octocat", "hello-world", 12)
            .await
            .expect("pull request merge queue status");
        let merge_queue_enqueued = service
            .enqueue_pull_request("octocat", "hello-world", 12, "abc1234")
            .await
            .expect("enqueued pull request");
        let merge_queue_dequeued = service
            .dequeue_pull_request("octocat", "hello-world", 12)
            .await
            .expect("dequeued pull request");
        let draft = service
            .set_pull_request_draft("octocat", "hello-world", 12, true)
            .await
            .expect("converted pull request to draft");
        let ready = service
            .set_pull_request_draft("octocat", "hello-world", 12, false)
            .await
            .expect("marked pull request ready for review");
        let metadata = service
            .update_pull_request_metadata(
                "octocat",
                "hello-world",
                12,
                &["bug".to_string()],
                &["hubot".to_string()],
                Some(3),
            )
            .await
            .expect("updated pull request metadata");
        let review_teams = service
            .pull_request_review_teams("octocat", "hello-world")
            .await
            .expect("pull request review teams");
        let requested_reviewers = service
            .request_pull_request_reviewers(
                "octocat",
                "hello-world",
                12,
                &["hubot".to_string()],
                &["core-maintainers".to_string()],
            )
            .await
            .expect("requested pull request reviewers");
        let removed_reviewers = service
            .remove_pull_request_reviewers(
                "octocat",
                "hello-world",
                12,
                &["hubot".to_string()],
                &["core-maintainers".to_string()],
            )
            .await
            .expect("removed pull request reviewers");
        let merged = service
            .merge_pull_request(
                "octocat",
                "hello-world",
                12,
                "abc1234",
                GitHubPullRequestMergeMethod::Squash,
                Some("Ship the PR workspace (#12)"),
                Some("Keep the desktop flow focused."),
            )
            .await
            .expect("merged pull request");
        let comment = service
            .create_pull_request_comment("octocat", "hello-world", 12, "Ready for another look.")
            .await
            .expect("pull request comment");
        let review = service
            .create_pull_request_review(
                "octocat",
                "hello-world",
                12,
                "abc1234",
                "Please add a regression test.",
                GitHubPullRequestReviewAction::RequestChanges,
                &[GitHubPullRequestReviewComment {
                    path: "src/review.rs".to_string(),
                    line: 42,
                    side: GitHubPullRequestReviewCommentSide::Right,
                    start_line: Some(40),
                    start_side: Some(GitHubPullRequestReviewCommentSide::Right),
                    body: "Please cover this branch.".to_string(),
                }],
            )
            .await
            .expect("pull request review");
        let pending_review = service
            .pending_pull_request_review("octocat", "hello-world", 12)
            .await
            .expect("pending review")
            .expect("viewer pending review");
        let saved_pending_review = service
            .save_pending_pull_request_review(
                "octocat",
                "hello-world",
                12,
                Some(87),
                "abc1234",
                "Updated review draft.",
            )
            .await
            .expect("saved pending review");
        let saved_pending_comment = service
            .save_pending_pull_request_review_comment(
                "octocat",
                "hello-world",
                12,
                Some(87),
                "abc1234",
                Some(701),
                &GitHubPullRequestReviewComment {
                    path: "src/review.rs".to_string(),
                    line: 42,
                    side: GitHubPullRequestReviewCommentSide::Right,
                    start_line: Some(40),
                    start_side: Some(GitHubPullRequestReviewCommentSide::Right),
                    body: "Updated line feedback.".to_string(),
                },
            )
            .await
            .expect("saved pending review comment");
        let pending_after_delete = service
            .delete_pending_pull_request_review_comment("octocat", "hello-world", 12, 87, 701)
            .await
            .expect("deleted pending review comment");
        let submitted_pending_review = service
            .submit_pending_pull_request_review(
                "octocat",
                "hello-world",
                12,
                87,
                "Updated review draft.",
                GitHubPullRequestReviewAction::Comment,
            )
            .await
            .expect("submitted pending review");
        service
            .delete_pending_pull_request_review("octocat", "hello-world", 12, 87)
            .await
            .expect("discarded pending review");
        let thread_page = service
            .pull_request_review_threads("octocat", "hello-world", 12, Some("cursor-1"))
            .await
            .expect("pull request review threads");
        let thread_reply = service
            .reply_to_pull_request_review_thread("PRRT_1", "Covered by the new regression test.")
            .await
            .expect("pull request review-thread reply");
        let resolved_thread = service
            .set_pull_request_review_thread_resolution(
                "PRRT_1",
                GitHubPullRequestReviewThreadResolution::Resolved,
            )
            .await
            .expect("resolved pull request review thread");
        let unresolved_thread = service
            .set_pull_request_review_thread_resolution(
                "PRRT_1",
                GitHubPullRequestReviewThreadResolution::Unresolved,
            )
            .await
            .expect("unresolved pull request review thread");
        let updated_review_comment = service
            .mutate_pull_request_review_comment(
                "octocat",
                "hello-world",
                12,
                &GitHubCommentMutation::Update {
                    comment_id: "PRRC_2".to_string(),
                    expected_updated_at: "2026-08-27T08:00:00Z".to_string(),
                    body: "Updated submitted review comment.".to_string(),
                },
            )
            .await
            .expect("updated submitted review comment")
            .expect("returned submitted review comment");

        assert_eq!(comparison.ahead_by, 1);
        assert_eq!(comparison.head, "feature/create");
        assert_eq!(created.number, 13);
        assert_eq!(created.title, "Create pull requests in Harbor");
        assert_eq!(created.base_ref, "main");
        assert_eq!(created.head_ref, "feature/create");
        assert!(created.draft);
        assert_eq!(edited.title, "Updated pull request title");
        assert_eq!(edited.body.as_deref(), Some("Updated **Markdown** body."));
        assert_eq!(closed.state, GitHubPullRequestState::Closed);
        assert!(closed.closed_at.is_some());
        assert_eq!(reopened.state, GitHubPullRequestState::Open);
        assert!(reopened.closed_at.is_none());
        assert_eq!(
            auto_merge_status.state,
            GitHubPullRequestAutoMergeState::Available
        );
        assert_eq!(
            auto_merge_enabled.state,
            GitHubPullRequestAutoMergeState::Enabled
        );
        assert_eq!(
            auto_merge_enabled.merge_method,
            Some(GitHubPullRequestMergeMethod::Squash)
        );
        assert_eq!(
            auto_merge_disabled.state,
            GitHubPullRequestAutoMergeState::Available
        );
        assert_eq!(
            merge_queue_status.state,
            GitHubPullRequestMergeQueueState::Available
        );
        assert_eq!(
            merge_queue_enqueued.state,
            GitHubPullRequestMergeQueueState::Queued
        );
        assert_eq!(
            merge_queue_dequeued.state,
            GitHubPullRequestMergeQueueState::Available
        );
        assert!(draft.draft);
        assert!(!ready.draft);
        assert_eq!(metadata.labels[0].name, "bug");
        assert_eq!(metadata.assignees, ["hubot"]);
        assert_eq!(metadata.milestone.as_deref(), Some("Milestone 3"));
        assert_eq!(metadata.milestone_number, Some(3));
        assert_eq!(review_teams.teams[0].slug, "core-maintainers");
        assert_eq!(requested_reviewers.requested_reviewers, ["hubot"]);
        assert_eq!(
            requested_reviewers.requested_teams[0].slug,
            "core-maintainers"
        );
        assert!(removed_reviewers.requested_reviewers.is_empty());
        assert!(removed_reviewers.requested_teams.is_empty());
        assert!(merged.merged);
        assert_eq!(merged.state, GitHubPullRequestState::Closed);
        assert_eq!(merged.merged_by.as_deref(), Some("octocat"));
        assert_eq!(comment.kind, GitHubIssueTimelineKind::Comment);
        assert_eq!(comment.body.as_deref(), Some("Ready for another look."));
        assert_eq!(review.state, GitHubPullRequestReviewState::ChangesRequested);
        assert_eq!(
            review.body.as_deref(),
            Some("Please add a regression test.")
        );
        assert_eq!(pending_review.id, 87);
        assert_eq!(pending_review.comments[0].database_id, 701);
        assert_eq!(saved_pending_review.body, "Updated review draft.");
        assert_eq!(
            saved_pending_comment.comments[0].body,
            "Updated line feedback."
        );
        assert!(pending_after_delete.comments.is_empty());
        assert_eq!(
            submitted_pending_review.state,
            GitHubPullRequestReviewState::Commented
        );
        assert_eq!(thread_page.threads[0].id, "PRRT_1");
        assert_eq!(thread_page.end_cursor.as_deref(), Some("cursor-2"));
        assert!(thread_page.has_more);
        assert_eq!(thread_reply.id, "PRRC_2");
        assert_eq!(thread_reply.body, "Covered by the new regression test.");
        assert_eq!(
            updated_review_comment.body,
            "Updated submitted review comment."
        );
        assert!(resolved_thread.is_resolved);
        assert!(resolved_thread.viewer_can_unresolve);
        assert!(!unresolved_thread.is_resolved);
        assert!(unresolved_thread.viewer_can_resolve);
    }

    #[tokio::test]
    async fn personal_packages_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let page = service
            .personal_packages(
                GitHubPackageType::Container,
                Some(GitHubPackageVisibility::Private),
                1,
            )
            .await
            .expect("personal packages");
        let package = service
            .personal_package(GitHubPackageType::Container, "harbor/desktop")
            .await
            .expect("personal package");
        let versions = service
            .personal_package_versions(
                GitHubPackageType::Container,
                "harbor/desktop",
                GitHubPackageVersionState::Active,
                1,
            )
            .await
            .expect("package versions");
        let mutation = service
            .mutate_personal_package_version(&GitHubPackageVersionMutationInput {
                package_type: GitHubPackageType::Container,
                package_name: "harbor/desktop".to_string(),
                expected_package_id: 42,
                version_id: 84,
                expected_version_name: "sha256:abc123".to_string(),
                action: GitHubPackageVersionAction::Delete,
            })
            .await
            .expect("package version mutation");

        assert_eq!(page.packages[0].id, 42);
        assert_eq!(package.name, "harbor/desktop");
        assert_eq!(versions.versions[0].id, 84);
        assert_eq!(mutation.action, GitHubPackageVersionAction::Delete);
    }

    #[tokio::test]
    async fn file_preview_uses_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let preview = service
            .file("octocat", "hello-world", "main", "src/lib.rs")
            .await
            .expect("file preview");

        assert_eq!(
            preview,
            GitHubFilePreview::Text {
                name: "lib.rs".to_string(),
                path: "src/lib.rs".to_string(),
                sha: "abc123".to_string(),
                size: 30,
                url: Some(
                    "https://github.com/octocat/hello-world/blob/main/src/lib.rs".to_string()
                ),
                raw_url: Some(
                    "https://raw.githubusercontent.com/octocat/hello-world/main/src/lib.rs"
                        .to_string()
                ),
                content: "pub fn harbor() {\n    todo!()\n}\n".to_string(),
            }
        );
    }

    #[tokio::test]
    async fn repository_file_writes_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );
        let expected_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        let commit = service
            .commit_file(
                "octocat",
                "hello-world",
                "main",
                "Update src/lib.rs",
                &GitHubRepositoryFileMutation::Update {
                    path: "src/lib.rs".to_string(),
                    expected_sha: expected_sha.to_string(),
                    content: "pub fn harbor() {}\n".to_string(),
                },
            )
            .await
            .expect("repository file commit");

        assert_eq!(commit.branch, "main");
        assert_eq!(commit.file.expect("committed file").path, "src/lib.rs");
    }

    #[tokio::test]
    async fn repository_branch_writes_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );
        let expected_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        let branch = service
            .create_branch(
                "octocat",
                "hello-world",
                "main",
                expected_sha,
                "feature/code-write",
            )
            .await
            .expect("created branch");
        service
            .delete_branch("octocat", "hello-world", "feature/code-write", expected_sha)
            .await
            .expect("deleted branch");

        assert_eq!(branch.name, "feature/code-write");
        assert_eq!(branch.sha, expected_sha);
    }

    #[tokio::test]
    async fn repository_insights_use_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let overview = service
            .repository_insights_overview("octocat", "hello-world")
            .await
            .expect("repository insights overview");
        let contributors = service
            .repository_insights_contributors("octocat", "hello-world")
            .await
            .expect("repository insights contributors");
        let traffic = service
            .repository_insights_traffic("octocat", "hello-world", GitHubInsightsTrafficPeriod::Day)
            .await
            .expect("repository insights traffic");

        assert_eq!(overview.community.health_percentage, 75);
        assert_eq!(contributors.contributors[0].total, 12);
        assert_eq!(traffic.views.count, 42);
    }

    #[tokio::test]
    async fn repository_pages_uses_the_saved_connection() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        credentials
            .save_github_credentials(&oauth_credentials())
            .expect("seed credentials");
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials,
            Some(oauth_session("github-user-access-token")),
        );

        let workspace = service
            .repository_pages("octocat", "hello-world", 2)
            .await
            .expect("Pages workspace");
        let health = service
            .repository_pages_health("octocat", "hello-world")
            .await
            .expect("Pages health");
        let updated = service
            .mutate_repository_pages(
                "octocat",
                "hello-world",
                repository_pages::GitHubPagesMutation::Configure {
                    configuration: repository_pages::GitHubPagesConfiguration {
                        build_type: repository_pages::GitHubPagesBuildType::Legacy,
                        branch: Some(" main ".to_string()),
                        source_path: Some(repository_pages::GitHubPagesSourcePath::Docs),
                        custom_domain: Some(" Docs.Example.COM. ".to_string()),
                        https_enforced: true,
                    },
                },
            )
            .await
            .expect("updated Pages workspace");

        assert_eq!(workspace.page, 2);
        assert!(health.domain.expect("domain health").valid);
        assert_eq!(updated.page, 1);
    }

    #[tokio::test]
    async fn unconfigured_service_never_loads_credentials() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        let service = GitHubService::new(Arc::new(FakeGitHubClient), credentials.clone(), None);

        let status = service.status().await.expect("status");
        let result = service.repositories(1).await;

        assert!(!service.login_availability().configured);
        assert_eq!(status, GitHubConnection::disconnected());
        assert!(matches!(result, Err(AppError::GitHubNotConnected)));
        assert_eq!(credentials.load_count.load(Ordering::Relaxed), 0);
    }

    #[tokio::test]
    async fn configured_data_query_loads_credentials_lazily() {
        let credentials = Arc::new(MemoryCredentialStore::default());
        let service = GitHubService::new(
            Arc::new(FakeGitHubClient),
            credentials.clone(),
            Some(oauth_session("github-user-access-token")),
        );

        assert_eq!(credentials.load_count.load(Ordering::Relaxed), 0);
        let result = service.repositories(1).await;

        assert!(matches!(result, Err(AppError::GitHubNotConnected)));
        assert_eq!(credentials.load_count.load(Ordering::Relaxed), 1);
    }

    fn author_json(login: &str) -> serde_json::Value {
        serde_json::json!({
            "login": login,
            "id": 1,
            "node_id": "U_1",
            "avatar_url": format!("https://github.com/{login}.png"),
            "gravatar_id": "",
            "url": format!("https://api.github.com/users/{login}"),
            "html_url": format!("https://github.com/{login}"),
            "followers_url": format!("https://api.github.com/users/{login}/followers"),
            "following_url": format!("https://api.github.com/users/{login}/following{{/other_user}}"),
            "gists_url": format!("https://api.github.com/users/{login}/gists{{/gist_id}}"),
            "starred_url": format!("https://api.github.com/users/{login}/starred{{/owner}}{{/repo}}"),
            "subscriptions_url": format!("https://api.github.com/users/{login}/subscriptions"),
            "organizations_url": format!("https://api.github.com/users/{login}/orgs"),
            "repos_url": format!("https://api.github.com/users/{login}/repos"),
            "events_url": format!("https://api.github.com/users/{login}/events{{/privacy}}"),
            "received_events_url": format!("https://api.github.com/users/{login}/received_events"),
            "type": "User",
            "site_admin": false
        })
    }

    #[test]
    fn graphql_messages_keep_permission_and_rate_limit_error_codes() {
        assert!(is_github_permission_message(
            "Resource not accessible by integration"
        ));
        assert!(is_github_permission_message(
            "FORBIDDEN: viewer is not authorized for this mutation"
        ));
        assert!(is_github_rate_limit_message(
            "API rate limit exceeded for this user"
        ));
        assert!(!is_github_permission_message(
            "Could not resolve to a PullRequest with the number of 12"
        ));
    }

    pub(super) fn issue_json(number: u64, pull_request: bool) -> serde_json::Value {
        serde_json::json!({
            "id": number,
            "node_id": format!("I_{number}"),
            "url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}"),
            "repository_url": "https://api.github.com/repos/octocat/hello-world",
            "labels_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/labels{{/name}}"),
            "comments_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/comments"),
            "events_url": format!("https://api.github.com/repos/octocat/hello-world/issues/{number}/events"),
            "html_url": format!("https://github.com/octocat/hello-world/issues/{number}"),
            "number": number,
            "state": "open",
            "title": format!("Issue {number}"),
            "body": "Issue body",
            "user": author_json("octocat"),
            "labels": [{
                "id": 10,
                "node_id": "L_10",
                "url": "https://api.github.com/repos/octocat/hello-world/labels/bug",
                "name": "bug",
                "color": "d73a4a",
                "default": true
            }],
            "assignee": null,
            "assignees": [],
            "milestone": null,
            "locked": false,
            "comments": 2,
            "pull_request": pull_request.then(|| serde_json::json!({
                "url": format!("https://api.github.com/repos/octocat/hello-world/pulls/{number}"),
                "html_url": format!("https://github.com/octocat/hello-world/pull/{number}"),
                "diff_url": format!("https://github.com/octocat/hello-world/pull/{number}.diff"),
                "patch_url": format!("https://github.com/octocat/hello-world/pull/{number}.patch")
            })),
            "closed_at": null,
            "created_at": "2026-08-24T08:00:00Z",
            "updated_at": "2026-08-25T08:00:00Z"
        })
    }

    #[test]
    fn repository_page_maps_github_fields_and_pagination() {
        let repository = serde_json::from_value(serde_json::json!({
            "id": 42,
            "name": "hello-world",
            "full_name": "octocat/hello-world",
            "private": false,
            "html_url": "https://github.com/octocat/hello-world",
            "description": "A repository",
            "fork": true,
            "url": "https://api.github.com/repos/octocat/hello-world",
            "language": "Rust",
            "forks_count": 3,
            "stargazers_count": 99,
            "open_issues_count": 4,
            "archived": false,
            "default_branch": "trunk",
            "updated_at": "2026-08-25T08:00:00Z"
        }))
        .expect("repository fixture");

        let page = repository_page_from_octocrab(vec![repository], 3, true);

        assert!(page.has_more);
        assert_eq!(page.page, 3);
        assert_eq!(page.repositories[0].owner, "octocat");
        assert_eq!(page.repositories[0].language.as_deref(), Some("Rust"));
        assert_eq!(page.repositories[0].stars, 99);
        assert_eq!(page.repositories[0].open_issues, 4);
        assert_eq!(page.repositories[0].default_branch, "trunk");
        assert!(page.repositories[0].is_fork);
    }

    #[test]
    fn pull_request_search_keeps_review_filters_but_enforces_repository_and_state() {
        let filters = GitHubPullRequestFilters {
            state: GitHubPullRequestState::Closed,
            query: "repo:other/project author:hubot review:approved crash".to_string(),
            label: "release candidate".to_string(),
            sort: GitHubPullRequestSort::Updated,
            page: 1,
        };

        assert_eq!(
            pull_request_search_query("octocat", "hello-world", &filters),
            "author:hubot review:approved crash repo:octocat/hello-world is:pr is:closed label:\"release candidate\""
        );
    }

    #[test]
    fn pull_request_inbox_enforces_the_selected_account_scope() {
        let filters = GitHubPullRequestInboxFilters {
            scope: GitHubPullRequestInboxScope::ReviewRequested,
            state: GitHubPullRequestState::Open,
            query: "author:someone repo:other/project label:bug render".to_string(),
            sort: GitHubPullRequestSort::Updated,
            page: 2,
        };

        assert_eq!(
            pull_request_inbox_search_query(&filters),
            "label:bug render is:pr is:open review-requested:@me archived:false"
        );
    }

    #[test]
    fn pull_request_inbox_maps_each_scope_to_github_search() {
        let query_for = |scope| {
            pull_request_inbox_search_query(&GitHubPullRequestInboxFilters {
                scope,
                state: GitHubPullRequestState::Closed,
                query: String::new(),
                sort: GitHubPullRequestSort::Created,
                page: 1,
            })
        };

        assert!(query_for(GitHubPullRequestInboxScope::Authored).contains("author:@me"));
        assert!(query_for(GitHubPullRequestInboxScope::Assigned).contains("assignee:@me"));
        assert!(query_for(GitHubPullRequestInboxScope::ReviewRequested)
            .contains("review-requested:@me"));
    }

    #[test]
    fn pull_request_search_item_keeps_draft_and_merged_state() {
        let mut value = issue_json(12, true);
        value["html_url"] = serde_json::json!("https://github.com/octocat/hello-world/pull/12");
        value["state"] = serde_json::json!("closed");
        value["draft"] = serde_json::json!(true);
        value["pull_request"]["merged_at"] = serde_json::json!("2026-08-25T10:00:00Z");

        let pull_request = pull_request_summary_from_search_value(value).expect("pull request");

        assert_eq!(pull_request.number, 12);
        assert_eq!(pull_request.state, GitHubPullRequestState::Closed);
        assert!(pull_request.draft);
        assert!(pull_request.merged);
        assert_eq!(pull_request.repository.owner, "octocat");
        assert_eq!(pull_request.repository.name, "hello-world");
        assert_eq!(pull_request.repository.full_name, "octocat/hello-world");
        assert_eq!(
            pull_request.url,
            "https://github.com/octocat/hello-world/pull/12"
        );
    }

    #[test]
    fn timeline_comments_keep_markdown_and_actor_metadata() {
        let event = serde_json::from_value(serde_json::json!({
            "event": "commented",
            "id": 42,
            "node_id": "IC_42",
            "url": "https://api.github.com/repos/octocat/hello-world/issues/comments/42",
            "actor": author_json("hubot"),
            "created_at": "2026-08-25T09:00:00Z",
            "updated_at": "2026-08-25T09:30:00Z",
            "author_association": "CONTRIBUTOR",
            "body": "Fixed by **#41**.",
            "user": author_json("hubot"),
            "html_url": "https://github.com/octocat/hello-world/issues/7#issuecomment-42"
        }))
        .expect("timeline fixture");

        let item = timeline_item_from_octocrab(event, 0);

        assert_eq!(item.kind, GitHubIssueTimelineKind::Comment);
        assert_eq!(item.event, "commented");
        assert_eq!(item.actor.as_deref(), Some("hubot"));
        assert_eq!(item.body.as_deref(), Some("Fixed by **#41**."));
        assert_eq!(item.author_association.as_deref(), Some("CONTRIBUTOR"));
        assert_eq!(
            item.reaction_subject,
            Some(GitHubReactionSubjectRef {
                id: "IC_42".to_string(),
                kind: GitHubReactionSubjectKind::IssueComment,
            })
        );
    }

    #[test]
    fn created_issue_comments_map_to_timeline_items() {
        let comment = serde_json::from_value(serde_json::json!({
            "id": 84,
            "node_id": "IC_84",
            "url": "https://api.github.com/repos/octocat/hello-world/issues/comments/84",
            "html_url": "https://github.com/octocat/hello-world/issues/7#issuecomment-84",
            "issue_url": "https://api.github.com/repos/octocat/hello-world/issues/7",
            "body": "Fixed in **#41**.",
            "author_association": "OWNER",
            "user": author_json("octocat"),
            "created_at": "2026-08-26T10:00:00Z",
            "updated_at": "2026-08-26T10:01:00Z"
        }))
        .expect("comment fixture");

        let item = timeline_item_from_issue_comment(comment);

        assert_eq!(item.id, "IC_84");
        assert_eq!(item.kind, GitHubIssueTimelineKind::Comment);
        assert_eq!(item.actor.as_deref(), Some("octocat"));
        assert_eq!(item.body.as_deref(), Some("Fixed in **#41**."));
        assert_eq!(item.author_association.as_deref(), Some("OWNER"));
        assert!(item.updated_at.is_some());
        assert_eq!(
            item.reaction_subject,
            Some(GitHubReactionSubjectRef {
                id: "IC_84".to_string(),
                kind: GitHubReactionSubjectKind::IssueComment,
            })
        );
    }

    #[test]
    fn timeline_reviews_keep_the_decision_and_submission_time() {
        let event = serde_json::from_value(serde_json::json!({
            "event": "reviewed",
            "id": 43,
            "node_id": "PRR_43",
            "actor": author_json("reviewer"),
            "user": author_json("reviewer"),
            "submitted_at": "2026-08-25T10:00:00Z",
            "state": "APPROVED",
            "body": "Looks good.",
            "html_url": "https://github.com/octocat/hello-world/pull/12#pullrequestreview-43"
        }))
        .expect("review timeline fixture");

        let item = timeline_item_from_octocrab(event, 0);

        assert_eq!(item.event, "reviewed");
        assert_eq!(item.review_id, Some(43));
        assert_eq!(
            item.review_state,
            Some(GitHubPullRequestReviewState::Approved)
        );
        assert_eq!(item.actor.as_deref(), Some("reviewer"));
        assert!(item.created_at.is_some());
        assert_eq!(item.body.as_deref(), Some("Looks good."));
        assert_eq!(
            item.reaction_subject,
            Some(GitHubReactionSubjectRef {
                id: "PRR_43".to_string(),
                kind: GitHubReactionSubjectKind::PullRequestReview,
            })
        );
    }

    #[test]
    fn created_pull_request_reviews_keep_author_and_decision() {
        let review = serde_json::from_value(serde_json::json!({
            "id": 86,
            "node_id": "PRR_86",
            "html_url": "https://github.com/octocat/hello-world/pull/12#pullrequestreview-86",
            "user": author_json("reviewer"),
            "body": "Please add a regression test.",
            "commit_id": "abc1234",
            "state": "CHANGES_REQUESTED",
            "pull_request_url": "https://api.github.com/repos/octocat/hello-world/pulls/12",
            "submitted_at": "2026-08-26T12:00:00Z",
            "author_association": "COLLABORATOR"
        }))
        .expect("created review fixture");

        let review = pull_request_review_from_octocrab(review).expect("mapped review");

        assert_eq!(review.id, 86);
        assert_eq!(review.author, "reviewer");
        assert_eq!(review.author_association.as_deref(), Some("COLLABORATOR"));
        assert_eq!(review.state, GitHubPullRequestReviewState::ChangesRequested);
        assert_eq!(review.commit_id.as_deref(), Some("abc1234"));
        assert!(review.submitted_at.is_some());
    }

    #[test]
    fn review_threads_keep_graphql_location_state_and_comments() {
        let thread = pull_request_review_thread_from_graphql(PullRequestReviewThreadNode {
            id: "PRRT_1".to_string(),
            path: "src/review.rs".to_string(),
            line: None,
            original_line: Some(42),
            start_line: None,
            original_start_line: Some(40),
            diff_side: GraphQlDiffSide::Left,
            start_diff_side: Some(GraphQlDiffSide::Left),
            subject_type: GraphQlPullRequestReviewThreadSubjectType::Line,
            is_resolved: true,
            is_outdated: true,
            is_collapsed: true,
            resolved_by: Some(GraphQlActor {
                login: "maintainer".to_string(),
                avatar_url: None,
            }),
            viewer_can_reply: true,
            viewer_can_resolve: false,
            viewer_can_unresolve: true,
            comments: PullRequestReviewThreadCommentsConnection {
                nodes: vec![PullRequestReviewThreadCommentNode {
                    id: "PRRC_1".to_string(),
                    database_id: Some(91),
                    author: Some(GraphQlActor {
                        login: "reviewer".to_string(),
                        avatar_url: Some("https://github.com/reviewer.png".to_string()),
                    }),
                    author_association: Some("COLLABORATOR".to_string()),
                    body: "Please cover this branch.".to_string(),
                    url: "https://github.com/octocat/hello-world/pull/12#discussion_r91"
                        .to_string(),
                    created_at: "2026-08-26T12:00:00Z".to_string(),
                    updated_at: "2026-08-26T12:05:00Z".to_string(),
                    state: "PENDING".to_string(),
                    is_minimized: false,
                    minimized_reason: None,
                    outdated: true,
                    viewer_can_update: true,
                    viewer_can_delete: true,
                }],
                page_info: GraphQlPageInfo {
                    has_next_page: true,
                    end_cursor: Some("comment-cursor".to_string()),
                },
            },
        });

        assert_eq!(thread.side, GitHubPullRequestReviewCommentSide::Left);
        assert_eq!(thread.original_line, Some(42));
        assert!(thread.is_resolved);
        assert!(thread.is_outdated);
        assert_eq!(thread.resolved_by.as_deref(), Some("maintainer"));
        assert!(thread.viewer_can_unresolve);
        assert!(thread.comments_have_more);
        assert_eq!(thread.comments[0].author, "reviewer");
        assert!(thread.comments[0].pending);
    }

    #[test]
    fn review_comment_database_id_accepts_current_graphql_bigint() {
        let comment: PullRequestReviewThreadCommentNode =
            serde_json::from_value(serde_json::json!({
                "id": "PRRC_5448457835",
                "databaseId": "5448457835",
                "author": null,
                "authorAssociation": "NONE",
                "body": "A submitted comment",
                "url": "https://github.com/octocat/hello-world/pull/12#discussion_r5448457835",
                "createdAt": "2026-08-29T08:00:00Z",
                "updatedAt": "2026-08-29T08:01:00Z",
                "state": "SUBMITTED",
                "isMinimized": false,
                "minimizedReason": null,
                "outdated": false,
                "viewerCanUpdate": true,
                "viewerCanDelete": true
            }))
            .expect("GraphQL BigInt comment fixture");

        assert_eq!(comment.database_id, Some(5_448_457_835));
        assert!(PULL_REQUEST_REVIEW_THREADS_QUERY.contains("databaseId: fullDatabaseId"));
        assert!(
            ADD_PULL_REQUEST_REVIEW_THREAD_REPLY_MUTATION.contains("databaseId: fullDatabaseId")
        );
    }
}
