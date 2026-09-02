use std::{collections::BTreeMap, path::PathBuf};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::{
    app_state::AppState,
    error::AppError,
    github::{
        GitHubAuthEvent, GitHubBlame, GitHubCheckPage, GitHubCheckSuite, GitHubCodeOverview,
        GitHubCodeScanningInstancePage, GitHubCodeSearchPage, GitHubCommentMutation,
        GitHubCommitComment, GitHubCommitCommentMutation, GitHubCommitCommentPage,
        GitHubCommitDetailPage, GitHubConnection, GitHubContentListing, GitHubContributionSummary,
        GitHubConversationControls, GitHubConversationKind, GitHubConversationLockAction,
        GitHubConversationLockReason, GitHubConversationSubscriptionAction,
        GitHubDeveloperFeedPage, GitHubDiscoverySearchKind, GitHubDiscoverySearchPage,
        GitHubDiscoverySearchSort, GitHubDiscussionAnsweredFilter, GitHubDiscussionCategoryPage,
        GitHubDiscussionCloseReason, GitHubDiscussionComment, GitHubDiscussionCommentDeletion,
        GitHubDiscussionCommentMutation, GitHubDiscussionDeletion, GitHubDiscussionDetailPage,
        GitHubDiscussionFilters, GitHubDiscussionPage, GitHubDiscussionPoll, GitHubDiscussionSort,
        GitHubDiscussionState, GitHubDiscussionStateFilter, GitHubDiscussionSummary,
        GitHubDiscussionVote, GitHubFileDownload, GitHubFileDownloadResult, GitHubFilePreview,
        GitHubForkInput, GitHubForkResult, GitHubGist, GitHubGistComment,
        GitHubGistCommentMutation, GitHubGistCommentPage, GitHubGistCreateInput,
        GitHubGistFileInput, GitHubGistFileMutation, GitHubGistPage, GitHubGistRevisionDetail,
        GitHubGistRevisionPage, GitHubGistSource, GitHubGistUpdateInput,
        GitHubInsightsTrafficPeriod, GitHubIssue, GitHubIssueAssigneePage, GitHubIssueAssignment,
        GitHubIssueClone, GitHubIssueCloneStatus, GitHubIssueCreateInput,
        GitHubIssueCreationPolicy, GitHubIssueDependenciesPage, GitHubIssueDetailPage,
        GitHubIssueDuplicateReference, GitHubIssueFilters, GitHubIssueInboxFilters,
        GitHubIssueInboxPage, GitHubIssueInboxScope, GitHubIssueLabel, GitHubIssueLabelMutation,
        GitHubIssueLabelPage, GitHubIssueLinkedPullRequestPage, GitHubIssueMilestone,
        GitHubIssueMilestoneMutation, GitHubIssueMilestonePage, GitHubIssuePage,
        GitHubIssueRelationshipsPage, GitHubIssueSort, GitHubIssueState,
        GitHubIssueStateCapabilities, GitHubIssueStateMutation, GitHubIssueSubIssueCreateInput,
        GitHubIssueSubIssuePriorityInput, GitHubIssueSummary, GitHubIssueTimelineItem,
        GitHubIssueTrackingDirection, GitHubIssueTrackingPage, GitHubIssueTypeStatus,
        GitHubLoginAvailability, GitHubNotificationAction, GitHubNotificationPage, GitHubPackage,
        GitHubPackagePage, GitHubPackageType, GitHubPackageVersionMutationInput,
        GitHubPackageVersionMutationResult, GitHubPackageVersionPage, GitHubPackageVersionState,
        GitHubPackageVisibility, GitHubPagesHealth, GitHubPagesMutation, GitHubPagesWorkspace,
        GitHubPendingPullRequestReview, GitHubProfileActivityPage, GitHubProfileConnectionKind,
        GitHubProjectDetail, GitHubProjectFilters, GitHubProjectItem, GitHubProjectItemAction,
        GitHubProjectItemAddition, GitHubProjectItemFilters, GitHubProjectItemUpdate,
        GitHubProjectPage, GitHubProjectSort, GitHubProjectStateFilter, GitHubProjectSummary,
        GitHubProjectUpdate, GitHubPullRequest, GitHubPullRequestAutoMergeStatus,
        GitHubPullRequestBaseBranchPage, GitHubPullRequestBaseEditGuard,
        GitHubPullRequestBranchUpdate, GitHubPullRequestBranchUpdateStatus,
        GitHubPullRequestCommitPage, GitHubPullRequestComparison, GitHubPullRequestDetailPage,
        GitHubPullRequestFilePage, GitHubPullRequestFileViewState,
        GitHubPullRequestFileViewStateSnapshot, GitHubPullRequestFilters,
        GitHubPullRequestInboxFilters, GitHubPullRequestInboxScope,
        GitHubPullRequestMaintainerEditability, GitHubPullRequestMaintainerEditabilityGuard,
        GitHubPullRequestMergeMethod, GitHubPullRequestMergeQueueStatus, GitHubPullRequestPage,
        GitHubPullRequestReview, GitHubPullRequestReviewAction, GitHubPullRequestReviewComment,
        GitHubPullRequestReviewPage, GitHubPullRequestReviewTeamPage,
        GitHubPullRequestReviewThreadComment, GitHubPullRequestReviewThreadPage,
        GitHubPullRequestReviewThreadResolution, GitHubPullRequestReviewThreadState,
        GitHubPullRequestSort, GitHubPullRequestState, GitHubReactionContent,
        GitHubReactionSubject, GitHubReactionSubjectRef, GitHubReceivedRepositoryInvitationAction,
        GitHubReceivedRepositoryInvitationPage, GitHubRelease, GitHubReleaseArchiveFormat,
        GitHubReleaseAsset, GitHubReleaseMutationInput, GitHubReleasePage,
        GitHubRepositoryCollaboratorPage, GitHubRepositoryCommitPage, GitHubRepositoryCreateInput,
        GitHubRepositoryCreationOptions, GitHubRepositoryFileCommit, GitHubRepositoryFileMutation,
        GitHubRepositoryInsightsContributors, GitHubRepositoryInsightsOverview,
        GitHubRepositoryInsightsTraffic, GitHubRepositoryInvitationPage,
        GitHubRepositoryInviteResult, GitHubRepositoryPage, GitHubRepositoryRelationship,
        GitHubRepositorySettings, GitHubRepositorySettingsUpdate, GitHubRepositoryTopics,
        GitHubRepositoryTopicsMutation, GitHubRepositoryWatchLevel,
        GitHubSecretScanningLocationPage, GitHubSecurityAlertDetail, GitHubSecurityAlertFilters,
        GitHubSecurityAlertKind, GitHubSecurityAlertMutation, GitHubSecurityAlertPage,
        GitHubSecurityAlertSeverityFilter, GitHubSecurityAlertSort, GitHubSecurityAlertStateFilter,
        GitHubStarredRepositoryPage, GitHubStarredRepositorySort, GitHubTagPage, GitHubUserPage,
        GitHubUserProfile, GitHubUserProfileUpdate, GitHubWikiComparison, GitHubWikiHistoryPage,
        GitHubWikiMutationResult, GitHubWikiOverview, GitHubWikiPage, GitHubWikiPageMutationInput,
        GitHubWikiRevertInput, GitHubWikiRevision, GitHubWikiSearchResult, GitHubWorkflow,
        GitHubWorkflowArtifactPage, GitHubWorkflowDispatchConfig, GitHubWorkflowDispatchOptions,
        GitHubWorkflowJobLog, GitHubWorkflowJobPage, GitHubWorkflowRun, GitHubWorkflowRunAction,
        GitHubWorkflowRunDeletion, GitHubWorkflowRunFilterOptions, GitHubWorkflowRunFilters,
        GitHubWorkflowRunPage, GitHubWorkflowRunStatusFilter, IssueCloneMutation,
        IssueLinkedBranchCreateMutation, IssueLinkedBranchDeleteMutation, IssueLinkedBranchRequest,
        IssueSubIssueCreateMutation, IssueSubIssuePriorityMutation, IssueTypeMutation,
    },
    github_oauth::{GitHubLoginAttempt, GitHubLoopbackListener, GITHUB_AUTH_EVENT},
    repository_context::{RepositoryContextAnswer, RepositoryRef},
};

#[tauri::command]
pub async fn github_begin_login(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubLoginAttempt, AppError> {
    let listener = GitHubLoopbackListener::bind_default().await?;
    let attempt = state.github.begin_login()?;
    let expected_state = attempt.callback_state().to_string();
    let github = state.github.clone();
    tauri::async_runtime::spawn(async move {
        let event = match listener.wait_for_callback(&expected_state).await {
            Ok(callback) => {
                let result = github.complete_login(callback.callback_url()).await;
                let connected = result.is_ok();
                let event = match result {
                    Ok(connection) => GitHubAuthEvent::Connected { connection },
                    Err(error) => GitHubAuthEvent::Failed {
                        message: error.to_string(),
                    },
                };
                let _ = callback.respond(connected).await;
                event
            }
            Err(error) => GitHubAuthEvent::Failed {
                message: error.to_string(),
            },
        };
        let _ = app.emit(GITHUB_AUTH_EVENT, event);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
    Ok(attempt)
}

#[tauri::command]
pub fn github_login_availability(state: State<'_, AppState>) -> GitHubLoginAvailability {
    state.github.login_availability()
}

#[tauri::command]
pub async fn github_connection_status(
    state: State<'_, AppState>,
) -> Result<GitHubConnection, AppError> {
    state.github.status().await
}

#[tauri::command]
pub async fn github_disconnect(state: State<'_, AppState>) -> Result<GitHubConnection, AppError> {
    state.github.disconnect().await
}

#[tauri::command]
pub async fn github_search_discovery(
    kind: GitHubDiscoverySearchKind,
    query: String,
    sort: GitHubDiscoverySearchSort,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubDiscoverySearchPage, AppError> {
    state
        .github
        .search_discovery(
            kind,
            &crate::github::discovery::normalize_discovery_query(&query)?,
            sort,
            validate_issue_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_developer_feed(
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubDeveloperFeedPage, AppError> {
    state
        .github
        .developer_feed(validate_developer_feed_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_get_user_profile(
    username: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubUserProfile, AppError> {
    let username = username
        .as_deref()
        .map(crate::github::profile::normalize_user_login)
        .transpose()?;
    state.github.user_profile(username.as_deref()).await
}

#[tauri::command]
pub async fn github_update_personal_profile(
    input: GitHubUserProfileUpdate,
    state: State<'_, AppState>,
) -> Result<GitHubUserProfile, AppError> {
    state
        .github
        .update_personal_profile(&validate_profile_update(input)?)
        .await
}

#[tauri::command]
pub async fn github_get_user_contributions(
    username: String,
    state: State<'_, AppState>,
) -> Result<GitHubContributionSummary, AppError> {
    state
        .github
        .user_contributions(&crate::github::profile::normalize_user_login(&username)?)
        .await
}

#[tauri::command]
pub async fn github_list_profile_connections(
    username: String,
    kind: GitHubProfileConnectionKind,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubUserPage, AppError> {
    state
        .github
        .profile_connections(
            &crate::github::profile::normalize_user_login(&username)?,
            kind,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_profile_activity(
    username: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubProfileActivityPage, AppError> {
    state
        .github
        .profile_activity(
            &crate::github::profile::normalize_user_login(&username)?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_user_follow(
    username: String,
    followed: bool,
    state: State<'_, AppState>,
) -> Result<GitHubUserProfile, AppError> {
    state
        .github
        .update_user_follow(
            &crate::github::profile::normalize_user_login(&username)?,
            followed,
        )
        .await
}

#[tauri::command]
pub async fn github_list_personal_packages(
    package_type: GitHubPackageType,
    visibility: Option<GitHubPackageVisibility>,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPackagePage, AppError> {
    state
        .github
        .personal_packages(
            package_type,
            visibility,
            crate::github::packages::validate_package_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_personal_package(
    package_type: GitHubPackageType,
    package_name: String,
    state: State<'_, AppState>,
) -> Result<GitHubPackage, AppError> {
    state
        .github
        .personal_package(
            package_type,
            &crate::github::packages::normalize_package_name(&package_name)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_personal_package_versions(
    package_type: GitHubPackageType,
    package_name: String,
    version_state: GitHubPackageVersionState,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPackageVersionPage, AppError> {
    state
        .github
        .personal_package_versions(
            package_type,
            &crate::github::packages::normalize_package_name(&package_name)?,
            version_state,
            crate::github::packages::validate_package_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_mutate_personal_package_version(
    input: GitHubPackageVersionMutationInput,
    state: State<'_, AppState>,
) -> Result<GitHubPackageVersionMutationResult, AppError> {
    if input.expected_package_id == 0 || input.version_id == 0 {
        return Err(AppError::Validation(
            "package and version identifiers must be positive".to_string(),
        ));
    }
    let input = GitHubPackageVersionMutationInput {
        package_name: crate::github::packages::normalize_package_name(&input.package_name)?,
        expected_version_name: crate::github::packages::normalize_package_version_name(
            &input.expected_version_name,
        )?,
        ..input
    };
    state.github.mutate_personal_package_version(&input).await
}

#[tauri::command]
pub async fn github_list_repositories(
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryPage, AppError> {
    state.github.repositories(validate_page(page)?).await
}

#[tauri::command]
pub async fn github_list_starred_repositories(
    sort: GitHubStarredRepositorySort,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubStarredRepositoryPage, AppError> {
    state
        .github
        .starred_repositories(sort, validate_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_get_repository_relationship(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryRelationship, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_relationship(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_update_repository_star(
    owner: String,
    repository: String,
    starred: bool,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryRelationship, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_repository_star(repository.owner(), repository.name(), starred)
        .await
}

#[tauri::command]
pub async fn github_update_repository_watch(
    owner: String,
    repository: String,
    watch_level: GitHubRepositoryWatchLevel,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryRelationship, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_repository_watch(repository.owner(), repository.name(), watch_level)
        .await
}

#[tauri::command]
pub async fn github_fork_repository(
    owner: String,
    repository: String,
    name: Option<String>,
    default_branch_only: bool,
    state: State<'_, AppState>,
) -> Result<GitHubForkResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .fork_repository(
            repository.owner(),
            repository.name(),
            &GitHubForkInput {
                name: validate_optional_fork_name(name)?,
                default_branch_only,
            },
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_creation_options(
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryCreationOptions, AppError> {
    state.github.repository_creation_options().await
}

#[tauri::command]
pub async fn github_create_personal_repository(
    input: GitHubRepositoryCreateInput,
    state: State<'_, AppState>,
) -> Result<GitHubRepositorySettings, AppError> {
    state
        .github
        .create_personal_repository(&validate_repository_create_input(input)?)
        .await
}

#[tauri::command]
pub async fn github_get_personal_repository_settings(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubRepositorySettings, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .personal_repository_settings(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_list_personal_repository_collaborators(
    owner: String,
    repository: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryCollaboratorPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .personal_repository_collaborators(
            repository.owner(),
            repository.name(),
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_personal_repository_invitations(
    owner: String,
    repository: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryInvitationPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .personal_repository_invitations(
            repository.owner(),
            repository.name(),
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_invite_personal_repository_collaborator(
    owner: String,
    repository: String,
    username: String,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryInviteResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .invite_personal_repository_collaborator(
            repository.owner(),
            repository.name(),
            &crate::github::profile::normalize_user_login(&username)?,
        )
        .await
}

#[tauri::command]
pub async fn github_cancel_personal_repository_invitation(
    owner: String,
    repository: String,
    invitation_id: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .cancel_personal_repository_invitation(
            repository.owner(),
            repository.name(),
            validate_item_number(invitation_id, "repository invitation")?,
        )
        .await
}

#[tauri::command]
pub async fn github_remove_personal_repository_collaborator(
    owner: String,
    repository: String,
    username: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .remove_personal_repository_collaborator(
            repository.owner(),
            repository.name(),
            &crate::github::profile::normalize_user_login(&username)?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_personal_repository_settings(
    owner: String,
    repository: String,
    update: GitHubRepositorySettingsUpdate,
    state: State<'_, AppState>,
) -> Result<GitHubRepositorySettings, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_personal_repository_settings(
            repository.owner(),
            repository.name(),
            &validate_repository_settings_update(update)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_personal_repository_topics(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryTopics, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_topics(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_update_personal_repository_topics(
    owner: String,
    repository: String,
    mutation: GitHubRepositoryTopicsMutation,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryTopics, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_repository_topics(repository.owner(), repository.name(), &mutation)
        .await
}

#[tauri::command]
pub async fn github_delete_personal_repository(
    owner: String,
    repository: String,
    confirmation: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_personal_repository(
            repository.owner(),
            repository.name(),
            &validate_repository_deletion_confirmation(confirmation)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_pages(
    owner: String,
    repository: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPagesWorkspace, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_pages(repository.owner(), repository.name(), validate_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_get_repository_pages_health(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubPagesHealth, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_pages_health(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_pages(
    owner: String,
    repository: String,
    mutation: GitHubPagesMutation,
    state: State<'_, AppState>,
) -> Result<GitHubPagesWorkspace, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_repository_pages(repository.owner(), repository.name(), mutation)
        .await
}

#[tauri::command]
pub async fn github_list_gists(
    source: GitHubGistSource,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubGistPage, AppError> {
    state.github.gists(source, validate_page(page)?).await
}

#[tauri::command]
pub async fn github_get_gist(
    gist_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubGist, AppError> {
    state.github.gist(&validate_gist_id(gist_id)?).await
}

#[tauri::command]
pub async fn github_list_gist_revisions(
    gist_id: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubGistRevisionPage, AppError> {
    state
        .github
        .gist_revisions(&validate_gist_id(gist_id)?, validate_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_get_gist_revision(
    gist_id: String,
    version: String,
    state: State<'_, AppState>,
) -> Result<GitHubGistRevisionDetail, AppError> {
    state
        .github
        .gist_revision(
            &validate_gist_id(gist_id)?,
            &validate_gist_version(version)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_gist_comments(
    gist_id: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubGistCommentPage, AppError> {
    state
        .github
        .gist_comments(&validate_gist_id(gist_id)?, validate_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_create_gist(
    input: GitHubGistCreateInput,
    state: State<'_, AppState>,
) -> Result<GitHubGist, AppError> {
    state
        .github
        .create_gist(&validate_gist_create_input(input)?)
        .await
}

#[tauri::command]
pub async fn github_update_gist(
    gist_id: String,
    input: GitHubGistUpdateInput,
    state: State<'_, AppState>,
) -> Result<GitHubGist, AppError> {
    state
        .github
        .update_gist(
            &validate_gist_id(gist_id)?,
            &validate_gist_update_input(input)?,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_gist(
    gist_id: String,
    confirmation: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let gist_id = validate_gist_id(gist_id)?;
    state
        .github
        .delete_gist(&gist_id, &validate_gist_id(confirmation)?)
        .await
}

#[tauri::command]
pub async fn github_update_gist_star(
    gist_id: String,
    starred: bool,
    state: State<'_, AppState>,
) -> Result<GitHubGist, AppError> {
    state
        .github
        .update_gist_star(&validate_gist_id(gist_id)?, starred)
        .await
}

#[tauri::command]
pub async fn github_fork_gist(
    gist_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubGist, AppError> {
    state.github.fork_gist(&validate_gist_id(gist_id)?).await
}

#[tauri::command]
pub async fn github_mutate_gist_comment(
    gist_id: String,
    mutation: GitHubGistCommentMutation,
    state: State<'_, AppState>,
) -> Result<Option<GitHubGistComment>, AppError> {
    state
        .github
        .mutate_gist_comment(
            &validate_gist_id(gist_id)?,
            &validate_gist_comment_mutation(mutation)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_notifications(
    participating: bool,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubNotificationPage, AppError> {
    state
        .github
        .notifications(participating, validate_notification_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_update_notification(
    thread_id: u64,
    action: GitHubNotificationAction,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .github
        .update_notification(validate_notification_thread_id(thread_id)?, action)
        .await
}

#[tauri::command]
pub async fn github_mark_all_notifications_read(
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state.github.mark_all_notifications_read().await
}

#[tauri::command]
pub async fn github_list_received_repository_invitations(
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubReceivedRepositoryInvitationPage, AppError> {
    state
        .github
        .received_repository_invitations(validate_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_update_received_repository_invitation(
    invitation_id: u64,
    action: GitHubReceivedRepositoryInvitationAction,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .github
        .update_received_repository_invitation(
            validate_item_number(invitation_id, "repository invitation")?,
            action,
        )
        .await
}

#[tauri::command]
pub async fn github_list_personal_projects(
    project_state: GitHubProjectStateFilter,
    query: String,
    sort: GitHubProjectSort,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubProjectPage, AppError> {
    state
        .github
        .projects(&GitHubProjectFilters {
            state: project_state,
            query: validate_project_query(query)?,
            sort,
            after: validate_graphql_cursor(after)?,
        })
        .await
}

#[tauri::command]
pub async fn github_get_personal_project(
    number: u32,
    query: String,
    archived: bool,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubProjectDetail, AppError> {
    state
        .github
        .project(
            validate_project_number(number)?,
            &GitHubProjectItemFilters {
                query: validate_project_query(query)?,
                archived,
                after: validate_graphql_cursor(after)?,
            },
        )
        .await
}

#[tauri::command]
pub async fn github_create_personal_project(
    title: String,
    state: State<'_, AppState>,
) -> Result<GitHubProjectSummary, AppError> {
    state
        .github
        .create_project(&validate_project_title(title)?)
        .await
}

#[tauri::command]
pub async fn github_update_personal_project(
    number: u32,
    update: GitHubProjectUpdate,
    state: State<'_, AppState>,
) -> Result<GitHubProjectSummary, AppError> {
    let update = validate_project_update(update)?;
    state
        .github
        .update_project(validate_project_number(number)?, &update)
        .await
}

#[tauri::command]
pub async fn github_delete_personal_project(
    number: u32,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    state
        .github
        .delete_project(validate_project_number(number)?)
        .await
}

#[tauri::command]
pub async fn github_add_personal_project_item(
    number: u32,
    addition: GitHubProjectItemAddition,
    state: State<'_, AppState>,
) -> Result<GitHubProjectItem, AppError> {
    let addition = validate_project_item_addition(addition)?;
    state
        .github
        .add_project_item(validate_project_number(number)?, &addition)
        .await
}

#[tauri::command]
pub async fn github_update_personal_project_item(
    number: u32,
    item_id: String,
    update: GitHubProjectItemUpdate,
    state: State<'_, AppState>,
) -> Result<GitHubProjectItem, AppError> {
    let item_id = validate_graphql_node_id(item_id, "project item")?;
    let update = validate_project_item_update(update)?;
    state
        .github
        .update_project_item(validate_project_number(number)?, &item_id, &update)
        .await
}

#[tauri::command]
pub async fn github_change_personal_project_item(
    number: u32,
    item_id: String,
    action: GitHubProjectItemAction,
    state: State<'_, AppState>,
) -> Result<Option<GitHubProjectItem>, AppError> {
    state
        .github
        .change_project_item(
            validate_project_number(number)?,
            &validate_graphql_node_id(item_id, "project item")?,
            action,
        )
        .await
}

#[tauri::command]
#[allow(
    clippy::too_many_arguments,
    reason = "Tauri commands keep each IPC filter explicit at the desktop boundary"
)]
pub async fn github_list_repository_security_alerts(
    owner: String,
    repository: String,
    kind: GitHubSecurityAlertKind,
    alert_state: GitHubSecurityAlertStateFilter,
    severity: GitHubSecurityAlertSeverityFilter,
    sort: GitHubSecurityAlertSort,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubSecurityAlertPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let filters = GitHubSecurityAlertFilters {
        state: alert_state,
        severity,
        sort,
        page: validate_page(page)?,
    };
    state
        .github
        .security_alerts(repository.owner(), repository.name(), kind, &filters)
        .await
}

#[tauri::command]
pub async fn github_get_repository_security_alert(
    owner: String,
    repository: String,
    kind: GitHubSecurityAlertKind,
    alert_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubSecurityAlertDetail, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .security_alert(
            repository.owner(),
            repository.name(),
            kind,
            validate_item_number(alert_number, "security alert")?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_code_scanning_instances(
    owner: String,
    repository: String,
    alert_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubCodeScanningInstancePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .code_scanning_instances(
            repository.owner(),
            repository.name(),
            validate_item_number(alert_number, "code scanning alert")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_secret_scanning_locations(
    owner: String,
    repository: String,
    alert_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubSecretScanningLocationPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .secret_scanning_locations(
            repository.owner(),
            repository.name(),
            validate_item_number(alert_number, "secret scanning alert")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_security_alert(
    owner: String,
    repository: String,
    alert_number: u64,
    mutation: GitHubSecurityAlertMutation,
    state: State<'_, AppState>,
) -> Result<GitHubSecurityAlertDetail, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_security_alert(
            repository.owner(),
            repository.name(),
            validate_item_number(alert_number, "security alert")?,
            &mutation,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_discussion_categories(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionCategoryPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .discussion_categories(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_list_repository_discussions(
    owner: String,
    repository: String,
    category_id: Option<String>,
    discussion_state: GitHubDiscussionStateFilter,
    answered: GitHubDiscussionAnsweredFilter,
    sort: GitHubDiscussionSort,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let filters = GitHubDiscussionFilters {
        category_id: category_id
            .map(|category_id| validate_graphql_node_id(category_id, "discussion category"))
            .transpose()?,
        state: discussion_state,
        answered,
        sort,
        after: validate_graphql_cursor(after)?,
    };
    state
        .github
        .discussions(repository.owner(), repository.name(), &filters)
        .await
}

#[tauri::command]
pub async fn github_get_repository_discussion(
    owner: String,
    repository: String,
    discussion_number: u64,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionDetailPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let after = validate_graphql_cursor(after)?;
    state
        .github
        .discussion_detail(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
            after.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_create_repository_discussion(
    owner: String,
    repository: String,
    category_id: String,
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionSummary, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .create_discussion(
            repository.owner(),
            repository.name(),
            &validate_graphql_node_id(category_id, "discussion category")?,
            &validate_issue_title(title)?,
            &validate_issue_body(body)?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_discussion(
    owner: String,
    repository: String,
    discussion_number: u64,
    category_id: String,
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionSummary, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_discussion(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
            &validate_graphql_node_id(category_id, "discussion category")?,
            &validate_issue_title(title)?,
            &validate_issue_body(body)?,
        )
        .await
}

#[tauri::command]
pub async fn github_create_repository_discussion_comment(
    owner: String,
    repository: String,
    discussion_number: u64,
    reply_to_id: Option<String>,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionComment, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reply_to_id = reply_to_id
        .map(|reply_to_id| validate_graphql_node_id(reply_to_id, "discussion comment"))
        .transpose()?;
    state
        .github
        .create_discussion_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
            reply_to_id.as_deref(),
            validate_issue_comment(&body)?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_discussion_comment(
    comment_id: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionComment, AppError> {
    state
        .github
        .update_discussion_comment(
            &validate_graphql_node_id(comment_id, "discussion comment")?,
            validate_issue_comment(&body)?,
        )
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_discussion_comment(
    owner: String,
    repository: String,
    discussion_number: u64,
    mutation: GitHubDiscussionCommentMutation,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let mutation = validate_discussion_comment_mutation(mutation)?;
    state
        .github
        .mutate_discussion_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
            &mutation,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_discussion_state(
    owner: String,
    repository: String,
    discussion_number: u64,
    discussion_state: GitHubDiscussionState,
    close_reason: Option<GitHubDiscussionCloseReason>,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionSummary, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_discussion_state(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
            discussion_state,
            close_reason,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_discussion_upvote(
    subject_id: String,
    upvoted: bool,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionVote, AppError> {
    state
        .github
        .update_discussion_upvote(
            &validate_graphql_node_id(subject_id, "discussion subject")?,
            upvoted,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_discussion_answer(
    comment_id: String,
    answered: bool,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionSummary, AppError> {
    state
        .github
        .update_discussion_answer(
            &validate_graphql_node_id(comment_id, "discussion comment")?,
            answered,
        )
        .await
}

#[tauri::command]
pub async fn github_add_repository_discussion_poll_vote(
    owner: String,
    repository: String,
    discussion_number: u64,
    poll_option_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionPoll, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .add_discussion_poll_vote(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
            &validate_graphql_node_id(poll_option_id, "discussion poll option")?,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_repository_discussion(
    owner: String,
    repository: String,
    discussion_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionDeletion, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_discussion(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_repository_discussion_comment(
    owner: String,
    repository: String,
    discussion_number: u64,
    comment_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubDiscussionCommentDeletion, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_discussion_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(discussion_number, "discussion")?,
            &validate_graphql_node_id(comment_id, "discussion comment")?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_reactions(
    owner: String,
    repository: String,
    subjects: Vec<GitHubReactionSubjectRef>,
    state: State<'_, AppState>,
) -> Result<Vec<GitHubReactionSubject>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let subjects = crate::github::reaction::normalize_reaction_subjects(subjects)?;
    state
        .github
        .reaction_subjects(repository.owner(), repository.name(), &subjects)
        .await
}

#[tauri::command]
pub async fn github_update_repository_reaction(
    owner: String,
    repository: String,
    subject: GitHubReactionSubjectRef,
    content: GitHubReactionContent,
    reacted: bool,
    state: State<'_, AppState>,
) -> Result<GitHubReactionSubject, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let subject = crate::github::reaction::normalize_reaction_subject(subject)?;
    state
        .github
        .update_reaction(
            repository.owner(),
            repository.name(),
            &subject,
            content,
            reacted,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_releases(
    owner: String,
    repository: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubReleasePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .releases(repository.owner(), repository.name(), validate_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_get_repository_release(
    owner: String,
    repository: String,
    release_id: u64,
    state: State<'_, AppState>,
) -> Result<GitHubRelease, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .release(
            repository.owner(),
            repository.name(),
            validate_item_number(release_id, "release")?,
        )
        .await
}

#[tauri::command]
pub async fn github_download_repository_release_asset(
    owner: String,
    repository: String,
    release_id: u64,
    asset_id: u64,
    asset_name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubFileDownloadResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let release_id = validate_item_number(release_id, "release")?;
    let asset_id = validate_item_number(asset_id, "release asset")?;
    let suggested_name = crate::github::release::release_asset_download_name(&asset_name);
    let Some(file_path) = choose_save_file(&app, &suggested_name).await? else {
        return Ok(GitHubFileDownloadResult {
            saved: false,
            path: None,
        });
    };
    let download = state
        .github
        .download_release_asset(repository.owner(), repository.name(), release_id, asset_id)
        .await?;
    write_file_download(file_path, download).await
}

#[tauri::command]
pub async fn github_download_repository_release_archive(
    owner: String,
    repository: String,
    release_id: u64,
    tag_name: String,
    archive_format: GitHubReleaseArchiveFormat,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubFileDownloadResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let release_id = validate_item_number(release_id, "release")?;
    let suggested_name =
        crate::github::release::release_archive_download_name(&tag_name, archive_format);
    let Some(file_path) = choose_save_file(&app, &suggested_name).await? else {
        return Ok(GitHubFileDownloadResult {
            saved: false,
            path: None,
        });
    };
    let download = state
        .github
        .download_release_archive(
            repository.owner(),
            repository.name(),
            release_id,
            archive_format,
        )
        .await?;
    write_file_download(file_path, download).await
}

#[tauri::command]
pub async fn github_create_repository_release(
    owner: String,
    repository: String,
    input: GitHubReleaseMutationInput,
    state: State<'_, AppState>,
) -> Result<GitHubRelease, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .create_release(repository.owner(), repository.name(), input)
        .await
}

#[tauri::command]
pub async fn github_update_repository_release(
    owner: String,
    repository: String,
    release_id: u64,
    input: GitHubReleaseMutationInput,
    state: State<'_, AppState>,
) -> Result<GitHubRelease, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_release(
            repository.owner(),
            repository.name(),
            validate_item_number(release_id, "release")?,
            input,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_repository_release(
    owner: String,
    repository: String,
    release_id: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_release(
            repository.owner(),
            repository.name(),
            validate_item_number(release_id, "release")?,
        )
        .await
}

#[tauri::command]
pub async fn github_upload_repository_release_asset(
    owner: String,
    repository: String,
    release_id: u64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<GitHubReleaseAsset>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let release_id = validate_item_number(release_id, "release")?;
    let Some(file_path) = choose_open_file(&app).await? else {
        return Ok(None);
    };
    let upload = crate::github::release::release_asset_upload(file_path).await?;
    state
        .github
        .upload_release_asset(repository.owner(), repository.name(), release_id, upload)
        .await
        .map(Some)
}

#[tauri::command]
pub async fn github_delete_repository_release_asset(
    owner: String,
    repository: String,
    release_id: u64,
    asset_id: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_release_asset(
            repository.owner(),
            repository.name(),
            validate_item_number(release_id, "release")?,
            validate_item_number(asset_id, "release asset")?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_issues(
    owner: String,
    repository: String,
    issue_state: GitHubIssueState,
    assignment: GitHubIssueAssignment,
    query: String,
    label: String,
    sort: GitHubIssueSort,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubIssuePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let filters = GitHubIssueFilters {
        state: issue_state,
        assignment,
        query: validate_issue_query(query)?,
        label: validate_issue_label(label)?,
        sort,
        page: validate_issue_page(page)?,
    };
    state
        .github
        .issues(repository.owner(), repository.name(), &filters)
        .await
}

#[tauri::command]
pub async fn github_list_issue_inbox(
    scope: GitHubIssueInboxScope,
    issue_state: GitHubIssueState,
    query: String,
    sort: GitHubIssueSort,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubIssueInboxPage, AppError> {
    let filters = GitHubIssueInboxFilters {
        scope,
        state: issue_state,
        query: validate_issue_query(query)?,
        sort,
        page: validate_issue_page(page)?,
    };
    state.github.issue_inbox(&filters).await
}

#[tauri::command]
pub async fn github_list_repository_issue_labels(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssueLabelPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_labels(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_list_repository_issue_assignees(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssueAssigneePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_assignees(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_list_repository_issue_milestones(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssueMilestonePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_milestones(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_issue_label(
    owner: String,
    repository: String,
    mutation: GitHubIssueLabelMutation,
    state: State<'_, AppState>,
) -> Result<Option<GitHubIssueLabel>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_issue_label(repository.owner(), repository.name(), mutation)
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_issue_milestone(
    owner: String,
    repository: String,
    mutation: GitHubIssueMilestoneMutation,
    state: State<'_, AppState>,
) -> Result<Option<GitHubIssueMilestone>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_issue_milestone(repository.owner(), repository.name(), mutation)
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue(
    owner: String,
    repository: String,
    issue_number: u64,
    timeline_page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubIssueDetailPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_detail(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            validate_page(timeline_page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue_delete_status(
    owner: String,
    repository: String,
    issue_number: u64,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubIssueDeleteStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_delete_status(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
        )
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueDeleteInput {
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
}

#[tauri::command]
pub async fn github_delete_repository_issue(
    input: GitHubIssueDeleteInput,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubIssueDeletion, AppError> {
    let repository = RepositoryRef::new(input.owner, input.repository)?;
    let issue_number = validate_item_number(input.issue_number, "issue")?;
    let expected_issue_node_id = validate_graphql_node_id(input.expected_issue_node_id, "issue")?;
    let mutation = crate::github::IssueDeleteMutation::new(
        repository.owner(),
        repository.name(),
        issue_number,
        &expected_issue_node_id,
    )?;
    state.github.delete_issue(mutation).await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTransferStatusInput {
    source_owner: String,
    source_repository: String,
    issue_number: u64,
    target_owner: String,
    target_repository: String,
}

#[tauri::command]
pub async fn github_get_repository_issue_transfer_status(
    input: GitHubIssueTransferStatusInput,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubIssueTransferStatus, AppError> {
    let source = RepositoryRef::new(input.source_owner, input.source_repository)?;
    let target = RepositoryRef::new(input.target_owner, input.target_repository)?;
    state
        .github
        .issue_transfer_status(
            source.owner(),
            source.name(),
            validate_item_number(input.issue_number, "issue")?,
            target.owner(),
            target.name(),
        )
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTransferInput {
    source_owner: String,
    source_repository: String,
    issue_number: u64,
    target_owner: String,
    target_repository: String,
    expected_issue_node_id: String,
}

#[tauri::command]
pub async fn github_transfer_repository_issue(
    input: GitHubIssueTransferInput,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubIssueTransfer, AppError> {
    let source = RepositoryRef::new(input.source_owner, input.source_repository)?;
    let target = RepositoryRef::new(input.target_owner, input.target_repository)?;
    let expected_issue_node_id = validate_graphql_node_id(input.expected_issue_node_id, "issue")?;
    let mutation = crate::github::IssueTransferMutation::new(
        source.owner(),
        source.name(),
        validate_item_number(input.issue_number, "issue")?,
        target.owner(),
        target.name(),
        &expected_issue_node_id,
    )?;
    state.github.transfer_issue(mutation).await
}

#[tauri::command]
pub async fn github_get_repository_pinned_issues(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubPinnedIssuePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pinned_issues(repository.owner(), repository.name())
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssuePinMutationInput {
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    action: crate::github::GitHubIssuePinAction,
}

#[tauri::command]
pub async fn github_update_repository_issue_pin(
    input: GitHubIssuePinMutationInput,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubPinnedIssuePage, AppError> {
    let repository = RepositoryRef::new(input.owner, input.repository)?;
    let issue_number = validate_item_number(input.issue_number, "issue")?;
    let expected_issue_node_id = validate_graphql_node_id(input.expected_issue_node_id, "issue")?;
    let mutation = crate::github::IssuePinMutation::new(
        repository.owner(),
        repository.name(),
        issue_number,
        &expected_issue_node_id,
        input.action,
    )?;
    state.github.update_issue_pin(mutation).await
}

#[tauri::command]
pub async fn github_get_repository_issue_relationships(
    owner: String,
    repository: String,
    issue_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubIssueRelationshipsPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_relationships(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_add_repository_issue_sub_issue(
    owner: String,
    repository: String,
    issue_number: u64,
    sub_issue_number: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .add_issue_sub_issue(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            validate_item_number(sub_issue_number, "sub-issue")?,
        )
        .await
}

#[tauri::command]
pub async fn github_create_repository_issue_sub_issue(
    input: GitHubIssueSubIssueCreateInput,
    state: State<'_, AppState>,
) -> Result<GitHubIssueSummary, AppError> {
    let GitHubIssueSubIssueCreateInput {
        owner,
        repository,
        issue_number,
        title,
        body,
    } = input;
    let repository = RepositoryRef::new(owner, repository)?;
    let title = validate_issue_title(title)?;
    let body = validate_issue_body(body)?;
    let mutation = IssueSubIssueCreateMutation::new(
        repository.owner(),
        repository.name(),
        validate_item_number(issue_number, "issue")?,
        &title,
        &body,
    )?;
    state.github.create_issue_sub_issue(mutation).await
}

#[tauri::command]
pub async fn github_remove_repository_issue_sub_issue(
    owner: String,
    repository: String,
    issue_number: u64,
    sub_issue_number: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .remove_issue_sub_issue(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            validate_item_number(sub_issue_number, "sub-issue")?,
        )
        .await
}

#[tauri::command]
pub async fn github_reprioritize_repository_issue_sub_issue(
    input: GitHubIssueSubIssuePriorityInput,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let GitHubIssueSubIssuePriorityInput {
        owner,
        repository,
        issue_number,
        page,
        sub_issue_number,
        relative_issue_number,
        placement,
    } = input;
    let repository = RepositoryRef::new(owner, repository)?;
    let mutation = IssueSubIssuePriorityMutation::new(
        repository.owner(),
        repository.name(),
        validate_item_number(issue_number, "issue")?,
        validate_page(page)?,
        validate_item_number(sub_issue_number, "sub-issue")?,
        validate_item_number(relative_issue_number, "relative sub-issue")?,
        placement,
    )?;
    state.github.reprioritize_issue_sub_issue(mutation).await
}

#[tauri::command]
pub async fn github_get_repository_issue_dependencies(
    owner: String,
    repository: String,
    issue_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubIssueDependenciesPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_dependencies(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue_duplicate(
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    state: State<'_, AppState>,
) -> Result<Option<GitHubIssueDuplicateReference>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_duplicate(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &validate_graphql_node_id(expected_issue_node_id, "issue")?,
        )
        .await
}

#[tauri::command]
pub async fn github_unmark_repository_issue_duplicate(
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssue, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .unmark_issue_duplicate(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &validate_graphql_node_id(expected_issue_node_id, "issue")?,
        )
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueDuplicateMarkInput {
    owner: String,
    repository: String,
    issue_number: u64,
    canonical_owner: String,
    canonical_repository: String,
    canonical_issue_number: u64,
    expected_issue_node_id: String,
}

#[tauri::command]
pub async fn github_mark_repository_issue_duplicate(
    input: GitHubIssueDuplicateMarkInput,
    state: State<'_, AppState>,
) -> Result<GitHubIssue, AppError> {
    let repository = RepositoryRef::new(input.owner, input.repository)?;
    let canonical_repository =
        RepositoryRef::new(input.canonical_owner, input.canonical_repository)?;
    let issue_number = validate_item_number(input.issue_number, "issue")?;
    let canonical_issue_number =
        validate_item_number(input.canonical_issue_number, "canonical issue")?;
    let expected_issue_node_id = validate_graphql_node_id(input.expected_issue_node_id, "issue")?;
    let mutation = crate::github::issue_duplicate::IssueDuplicateMarkMutation::new(
        repository.owner(),
        repository.name(),
        issue_number,
        canonical_repository.owner(),
        canonical_repository.name(),
        canonical_issue_number,
        &expected_issue_node_id,
    )?;
    state.github.mark_issue_duplicate(mutation).await
}

#[tauri::command]
pub async fn github_get_repository_issue_linked_pull_requests(
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubIssueLinkedPullRequestPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let expected_issue_node_id = validate_graphql_node_id(expected_issue_node_id, "issue")?;
    let after = validate_graphql_cursor(after)?;
    state
        .github
        .issue_linked_pull_requests(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &expected_issue_node_id,
            after.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue_tracking(
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    direction: GitHubIssueTrackingDirection,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubIssueTrackingPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let expected_issue_node_id = validate_graphql_node_id(expected_issue_node_id, "issue")?;
    let after = validate_graphql_cursor(after)?;
    state
        .github
        .issue_tracking(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &expected_issue_node_id,
            direction,
            after.as_deref(),
        )
        .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLinkedBranchCreateInput {
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    expected_default_branch_oid: String,
    branch_name: Option<String>,
    branch_repository: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueLinkedBranchDeleteInput {
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    linked_branch_id: String,
    expected_branch_name: String,
    expected_branch_oid: String,
}

#[tauri::command]
pub async fn github_get_repository_issue_linked_branches(
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubIssueLinkedBranchPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let expected_issue_node_id = validate_graphql_node_id(expected_issue_node_id, "issue")?;
    let after = validate_graphql_cursor(after)?;
    let request = crate::github::issue_linked_branch::linked_branch_request(
        repository.owner(),
        repository.name(),
        validate_item_number(issue_number, "issue")?,
        &expected_issue_node_id,
        after.as_deref(),
    )?;
    state.github.issue_linked_branches(request).await
}

#[tauri::command]
pub async fn github_create_repository_issue_linked_branch(
    input: GitHubIssueLinkedBranchCreateInput,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubIssueLinkedBranchPage, AppError> {
    let repository = RepositoryRef::new(input.owner, input.repository)?;
    let issue_number = validate_item_number(input.issue_number, "issue")?;
    let expected_issue_node_id = validate_graphql_node_id(input.expected_issue_node_id, "issue")?;
    let expected_default_branch_oid =
        crate::github::code::write::normalize_git_sha(&input.expected_default_branch_oid)?;
    let branch_name = input
        .branch_name
        .as_deref()
        .map(crate::github::code::write::normalize_branch_name)
        .transpose()?;
    let branch_repository = input
        .branch_repository
        .map(RepositoryRef::from_full_name)
        .transpose()?;
    let mutation = IssueLinkedBranchCreateMutation {
        request: IssueLinkedBranchRequest {
            owner: repository.owner(),
            repository: repository.name(),
            issue_number,
            expected_issue_node_id: &expected_issue_node_id,
            after: None,
        },
        expected_default_branch_oid: &expected_default_branch_oid,
        branch_name: branch_name.as_deref(),
        destination_owner: branch_repository.as_ref().map(RepositoryRef::owner),
        destination_repository: branch_repository.as_ref().map(RepositoryRef::name),
    };
    state.github.create_issue_linked_branch(mutation).await
}

#[tauri::command]
pub async fn github_delete_repository_issue_linked_branch(
    input: GitHubIssueLinkedBranchDeleteInput,
    state: State<'_, AppState>,
) -> Result<crate::github::GitHubIssueLinkedBranchPage, AppError> {
    let repository = RepositoryRef::new(input.owner, input.repository)?;
    let issue_number = validate_item_number(input.issue_number, "issue")?;
    let expected_issue_node_id = validate_graphql_node_id(input.expected_issue_node_id, "issue")?;
    let linked_branch_id = validate_graphql_node_id(input.linked_branch_id, "linked branch")?;
    let expected_branch_name =
        crate::github::code::write::normalize_branch_name(&input.expected_branch_name)?;
    let expected_branch_oid =
        crate::github::code::write::normalize_git_sha(&input.expected_branch_oid)?;
    let mutation = IssueLinkedBranchDeleteMutation {
        request: IssueLinkedBranchRequest {
            owner: repository.owner(),
            repository: repository.name(),
            issue_number,
            expected_issue_node_id: &expected_issue_node_id,
            after: None,
        },
        linked_branch_id: &linked_branch_id,
        expected_branch_name: &expected_branch_name,
        expected_branch_oid: &expected_branch_oid,
    };
    state.github.delete_issue_linked_branch(mutation).await
}

#[tauri::command]
pub async fn github_add_repository_issue_dependency(
    owner: String,
    repository: String,
    issue_number: u64,
    blocking_owner: String,
    blocking_repository: String,
    blocking_issue_number: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let blocking_repository = RepositoryRef::new(blocking_owner, blocking_repository)?;
    state
        .github
        .add_issue_dependency(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            blocking_repository.owner(),
            blocking_repository.name(),
            validate_item_number(blocking_issue_number, "blocking issue")?,
        )
        .await
}

#[tauri::command]
pub async fn github_remove_repository_issue_dependency(
    owner: String,
    repository: String,
    issue_number: u64,
    blocking_issue_id: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .remove_issue_dependency(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            validate_item_number(blocking_issue_id, "blocking issue ID")?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_conversation_controls(
    owner: String,
    repository: String,
    conversation_number: u64,
    conversation_kind: GitHubConversationKind,
    state: State<'_, AppState>,
) -> Result<GitHubConversationControls, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .conversation_controls(
            repository.owner(),
            repository.name(),
            validate_item_number(conversation_number, "conversation")?,
            conversation_kind,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_conversation_lock(
    owner: String,
    repository: String,
    conversation_number: u64,
    conversation_kind: GitHubConversationKind,
    action: GitHubConversationLockAction,
    reason: Option<GitHubConversationLockReason>,
    state: State<'_, AppState>,
) -> Result<GitHubConversationControls, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_conversation_lock(
            repository.owner(),
            repository.name(),
            validate_item_number(conversation_number, "conversation")?,
            conversation_kind,
            action,
            reason,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_conversation_subscription(
    owner: String,
    repository: String,
    conversation_number: u64,
    conversation_kind: GitHubConversationKind,
    action: GitHubConversationSubscriptionAction,
    state: State<'_, AppState>,
) -> Result<GitHubConversationControls, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_conversation_subscription(
            repository.owner(),
            repository.name(),
            validate_item_number(conversation_number, "conversation")?,
            conversation_kind,
            action,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue_creation_policy(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssueCreationPolicy, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_creation_policy(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_create_repository_issue(
    owner: String,
    repository: String,
    title: String,
    body: String,
    labels: Option<Vec<String>>,
    assignees: Option<Vec<String>>,
    state: State<'_, AppState>,
) -> Result<GitHubIssue, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let input = GitHubIssueCreateInput::new(
        validate_issue_title(title)?,
        validate_issue_body(body)?,
        validate_named_values(labels.unwrap_or_default(), "issue label", 100, 128)?,
        validate_named_values(assignees.unwrap_or_default(), "issue assignee", 10, 100)?,
    );
    state
        .github
        .create_issue(repository.owner(), repository.name(), &input)
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue_clone_status(
    owner: String,
    repository: String,
    issue_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubIssueCloneStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_clone_status(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
        )
        .await
}

#[tauri::command]
pub async fn github_clone_repository_issue(
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssueClone, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let issue_number = validate_item_number(issue_number, "issue")?;
    let expected_issue_node_id = validate_graphql_node_id(expected_issue_node_id, "Issue")?;
    let title = validate_issue_title(title)?;
    let body = validate_issue_body(body)?;
    let mutation = IssueCloneMutation {
        owner: repository.owner(),
        repository: repository.name(),
        issue_number,
        expected_issue_node_id: &expected_issue_node_id,
        title: &title,
        body: &body,
    };
    state.github.clone_issue(mutation).await
}

#[tauri::command]
pub async fn github_update_repository_issue(
    owner: String,
    repository: String,
    issue_number: u64,
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssue, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let title = validate_issue_title(title)?;
    let body = validate_issue_body(body)?;
    state
        .github
        .update_issue_content(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &title,
            &body,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_issue_metadata(
    owner: String,
    repository: String,
    issue_number: u64,
    labels: Vec<String>,
    assignees: Vec<String>,
    milestone_number: Option<u64>,
    state: State<'_, AppState>,
) -> Result<GitHubIssue, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let labels = validate_named_values(labels, "issue label", 100, 128)?;
    let assignees = validate_named_values(assignees, "issue assignee", 10, 100)?;
    let milestone_number = milestone_number
        .map(|number| validate_item_number(number, "milestone"))
        .transpose()?;
    state
        .github
        .update_issue_metadata(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &labels,
            &assignees,
            milestone_number,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue_type_status(
    owner: String,
    repository: String,
    issue_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubIssueTypeStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_type_status(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_issue_type(
    owner: String,
    repository: String,
    issue_number: u64,
    expected_issue_node_id: String,
    expected_issue_type_node_id: Option<String>,
    issue_type_node_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubIssueTypeStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let issue_number = validate_item_number(issue_number, "issue")?;
    let expected_issue_node_id = validate_graphql_node_id(expected_issue_node_id, "Issue")?;
    let expected_issue_type_node_id = expected_issue_type_node_id
        .map(|value| validate_graphql_node_id(value, "Issue type"))
        .transpose()?;
    let issue_type_node_id = issue_type_node_id
        .map(|value| validate_graphql_node_id(value, "Issue type"))
        .transpose()?;
    let mutation = IssueTypeMutation {
        owner: repository.owner(),
        repository: repository.name(),
        issue_number,
        expected_issue_node_id: &expected_issue_node_id,
        expected_issue_type_node_id: expected_issue_type_node_id.as_deref(),
        issue_type_node_id: issue_type_node_id.as_deref(),
    };
    state.github.update_issue_type(mutation).await
}

#[tauri::command]
pub async fn github_create_repository_issue_comment(
    owner: String,
    repository: String,
    issue_number: u64,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssueTimelineItem, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .create_issue_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            validate_issue_comment(&body)?,
        )
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_issue_comment(
    owner: String,
    repository: String,
    issue_number: u64,
    mutation: GitHubCommentMutation,
    state: State<'_, AppState>,
) -> Result<Option<GitHubIssueTimelineItem>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_issue_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &validate_comment_mutation(mutation)?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_issue_state(
    owner: String,
    repository: String,
    issue_number: u64,
    mutation: GitHubIssueStateMutation,
    state: State<'_, AppState>,
) -> Result<GitHubIssue, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_issue_state(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
            &mutation,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_issue_state_capabilities(
    owner: String,
    repository: String,
    issue_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubIssueStateCapabilities, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .issue_state_capabilities(
            repository.owner(),
            repository.name(),
            validate_item_number(issue_number, "issue")?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_pull_requests(
    owner: String,
    repository: String,
    pull_request_state: GitHubPullRequestState,
    query: String,
    label: String,
    sort: GitHubPullRequestSort,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let filters = GitHubPullRequestFilters {
        state: pull_request_state,
        query: validate_issue_query(query)?,
        label: validate_issue_label(label)?,
        sort,
        page: validate_issue_page(page)?,
    };
    state
        .github
        .pull_requests(repository.owner(), repository.name(), &filters)
        .await
}

#[tauri::command]
pub async fn github_list_pull_request_inbox(
    scope: GitHubPullRequestInboxScope,
    pull_request_state: GitHubPullRequestState,
    query: String,
    sort: GitHubPullRequestSort,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestPage, AppError> {
    let filters = GitHubPullRequestInboxFilters {
        scope,
        state: pull_request_state,
        query: validate_issue_query(query)?,
        sort,
        page: validate_issue_page(page)?,
    };
    state.github.pull_request_inbox(&filters).await
}

#[tauri::command]
pub async fn github_get_repository_pull_request(
    owner: String,
    repository: String,
    pull_request_number: u64,
    timeline_page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestDetailPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let pull_request_number = validate_item_number(pull_request_number, "pull request")?;
    state
        .github
        .pull_request_detail(
            repository.owner(),
            repository.name(),
            pull_request_number,
            validate_page(timeline_page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_compare_repository_pull_request_branches(
    owner: String,
    repository: String,
    base: String,
    head: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestComparison, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let base = validate_reference(base)?;
    let head = validate_reference(head)?;
    state
        .github
        .compare_pull_request_branches(repository.owner(), repository.name(), &base, &head)
        .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn github_create_repository_pull_request(
    owner: String,
    repository: String,
    base: String,
    head: String,
    title: String,
    body: String,
    draft: bool,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let base = validate_reference(base)?;
    let head = validate_reference(head)?;
    let title = validate_issue_title(title)?;
    let body = validate_issue_body(body)?;
    state
        .github
        .create_pull_request(
            repository.owner(),
            repository.name(),
            &base,
            &head,
            &title,
            &body,
            draft,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_pull_request(
    owner: String,
    repository: String,
    pull_request_number: u64,
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let title = validate_issue_title(title)?;
    let body = validate_issue_body(body)?;
    state
        .github
        .update_pull_request_content(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &title,
            &body,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_pull_request_base_branches(
    owner: String,
    repository: String,
    pull_request_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestBaseBranchPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_base_branches(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_page(page)?,
        )
        .await
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn github_update_repository_pull_request_base(
    owner: String,
    repository: String,
    pull_request_number: u64,
    expected_current_base: String,
    expected_current_base_sha: String,
    expected_head_sha: String,
    target_base: String,
    expected_target_base_sha: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let guard = GitHubPullRequestBaseEditGuard {
        expected_current_base: validate_reference(expected_current_base)?,
        expected_current_base_sha: validate_commit_id(expected_current_base_sha)?,
        expected_head_sha: validate_commit_id(expected_head_sha)?,
        target_base: validate_reference(target_base)?,
        expected_target_base_sha: validate_commit_id(expected_target_base_sha)?,
    };
    state
        .github
        .update_pull_request_base(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &guard,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_pull_request_maintainer_editability(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_maintainer_editability(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_pull_request_maintainer_editability(
    owner: String,
    repository: String,
    pull_request_number: u64,
    guard: GitHubPullRequestMaintainerEditabilityGuard,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let GitHubPullRequestMaintainerEditabilityGuard {
        expected_current_value,
        expected_pull_request_id,
        expected_pull_request_node_id,
        expected_author_id,
        expected_head_repository_id,
        expected_head_ref,
        expected_head_sha,
        expected_workflow_risk,
        requested_value,
    } = guard;
    let guard = GitHubPullRequestMaintainerEditabilityGuard {
        expected_current_value,
        expected_pull_request_id: validate_item_number(
            expected_pull_request_id,
            "pull request ID",
        )?,
        expected_pull_request_node_id: validate_graphql_node_id(
            expected_pull_request_node_id,
            "pull request",
        )?,
        expected_author_id: validate_item_number(expected_author_id, "pull request author")?,
        expected_head_repository_id: validate_item_number(
            expected_head_repository_id,
            "head repository",
        )?,
        expected_head_ref: validate_reference(expected_head_ref)?,
        expected_head_sha: validate_commit_id(expected_head_sha)?,
        expected_workflow_risk,
        requested_value,
    };
    state
        .github
        .update_pull_request_maintainer_editability(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &guard,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_pull_request_state(
    owner: String,
    repository: String,
    pull_request_number: u64,
    pull_request_state: GitHubPullRequestState,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_pull_request_state(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            pull_request_state,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_pull_request_draft_state(
    owner: String,
    repository: String,
    pull_request_number: u64,
    draft: bool,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .set_pull_request_draft(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            draft,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_pull_request_metadata(
    owner: String,
    repository: String,
    pull_request_number: u64,
    labels: Vec<String>,
    assignees: Vec<String>,
    milestone_number: Option<u64>,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let labels = validate_named_values(labels, "issue label", 100, 128)?;
    let assignees = validate_named_values(assignees, "issue assignee", 10, 100)?;
    let milestone_number = milestone_number
        .map(|number| validate_item_number(number, "milestone"))
        .transpose()?;
    state
        .github
        .update_pull_request_metadata(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &labels,
            &assignees,
            milestone_number,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_pull_request_review_teams(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReviewTeamPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_review_teams(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_request_repository_pull_request_reviewers(
    owner: String,
    repository: String,
    pull_request_number: u64,
    reviewers: Vec<String>,
    team_reviewers: Vec<String>,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reviewers = validate_named_values(reviewers, "pull request reviewer", 100, 100)?;
    let team_reviewers =
        validate_named_values(team_reviewers, "pull request team reviewer", 100, 100)?;
    ensure_reviewer_selection(&reviewers, &team_reviewers)?;
    state
        .github
        .request_pull_request_reviewers(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &reviewers,
            &team_reviewers,
        )
        .await
}

#[tauri::command]
pub async fn github_remove_repository_pull_request_reviewers(
    owner: String,
    repository: String,
    pull_request_number: u64,
    reviewers: Vec<String>,
    team_reviewers: Vec<String>,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reviewers = validate_named_values(reviewers, "pull request reviewer", 100, 100)?;
    let team_reviewers =
        validate_named_values(team_reviewers, "pull request team reviewer", 100, 100)?;
    ensure_reviewer_selection(&reviewers, &team_reviewers)?;
    state
        .github
        .remove_pull_request_reviewers(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &reviewers,
            &team_reviewers,
        )
        .await
}

#[tauri::command]
pub async fn github_merge_repository_pull_request(
    owner: String,
    repository: String,
    pull_request_number: u64,
    head_sha: String,
    method: GitHubPullRequestMergeMethod,
    commit_title: Option<String>,
    commit_message: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequest, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let head_sha = validate_commit_id(head_sha)?;
    let commit_title = validate_optional_commit_title(commit_title)?;
    let commit_message = validate_optional_commit_message(commit_message)?;
    state
        .github
        .merge_pull_request(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &head_sha,
            method,
            commit_title.as_deref(),
            commit_message.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_pull_request_auto_merge_status(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_auto_merge_status(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_enable_repository_pull_request_auto_merge(
    owner: String,
    repository: String,
    pull_request_number: u64,
    expected_head_sha: String,
    merge_method: GitHubPullRequestMergeMethod,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .enable_pull_request_auto_merge(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &validate_commit_id(expected_head_sha)?,
            merge_method,
        )
        .await
}

#[tauri::command]
pub async fn github_disable_repository_pull_request_auto_merge(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestAutoMergeStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .disable_pull_request_auto_merge(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_pull_request_merge_queue_status(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_merge_queue_status(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_enqueue_repository_pull_request(
    owner: String,
    repository: String,
    pull_request_number: u64,
    expected_head_sha: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .enqueue_pull_request(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &validate_commit_id(expected_head_sha)?,
        )
        .await
}

#[tauri::command]
pub async fn github_dequeue_repository_pull_request(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestMergeQueueStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .dequeue_pull_request(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_pull_request_branch_update_status(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestBranchUpdateStatus, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_branch_update_status(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_update_repository_pull_request_branch(
    owner: String,
    repository: String,
    pull_request_number: u64,
    expected_head_sha: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestBranchUpdate, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .update_pull_request_branch(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &validate_commit_id(expected_head_sha)?,
        )
        .await
}

#[tauri::command]
pub async fn github_create_repository_pull_request_comment(
    owner: String,
    repository: String,
    pull_request_number: u64,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubIssueTimelineItem, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .create_pull_request_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_issue_comment(&body)?,
        )
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_pull_request_comment(
    owner: String,
    repository: String,
    pull_request_number: u64,
    mutation: GitHubCommentMutation,
    state: State<'_, AppState>,
) -> Result<Option<GitHubIssueTimelineItem>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_pull_request_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &validate_comment_mutation(mutation)?,
        )
        .await
}

#[tauri::command]
pub async fn github_create_repository_pull_request_review(
    owner: String,
    repository: String,
    pull_request_number: u64,
    commit_id: String,
    body: String,
    action: GitHubPullRequestReviewAction,
    comments: Vec<GitHubPullRequestReviewComment>,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let commit_id = validate_commit_id(commit_id)?;
    let body = validate_pull_request_review_body(action, body)?;
    let comments = validate_pull_request_review_comments(comments)?;
    state
        .github
        .create_pull_request_review(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &commit_id,
            &body,
            action,
            &comments,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_pull_request_reviews(
    owner: String,
    repository: String,
    pull_request_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReviewPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_reviews(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_dismiss_repository_pull_request_review(
    owner: String,
    repository: String,
    pull_request_number: u64,
    review_id: u64,
    message: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .dismiss_pull_request_review(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_item_number(review_id, "pull request review")?,
            &validate_pull_request_review_dismissal_message(message)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_pending_repository_pull_request_review(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<Option<GitHubPendingPullRequestReview>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pending_pull_request_review(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_save_pending_repository_pull_request_review(
    owner: String,
    repository: String,
    pull_request_number: u64,
    review_id: Option<u64>,
    commit_id: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let review_id = review_id
        .map(|review_id| validate_item_number(review_id, "review"))
        .transpose()?;
    state
        .github
        .save_pending_pull_request_review(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            review_id,
            &validate_commit_id(commit_id)?,
            &validate_issue_body(body)?,
        )
        .await
}

#[tauri::command]
pub async fn github_save_pending_repository_pull_request_review_comment(
    owner: String,
    repository: String,
    pull_request_number: u64,
    review_id: Option<u64>,
    commit_id: String,
    comment_id: Option<u64>,
    comment: GitHubPullRequestReviewComment,
    state: State<'_, AppState>,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let review_id = review_id
        .map(|review_id| validate_item_number(review_id, "review"))
        .transpose()?;
    let comment_id = comment_id
        .map(|comment_id| validate_item_number(comment_id, "review comment"))
        .transpose()?;
    let comment = validate_pull_request_review_comments(vec![comment])?
        .pop()
        .expect("one validated review comment");
    state
        .github
        .save_pending_pull_request_review_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            review_id,
            &validate_commit_id(commit_id)?,
            comment_id,
            &comment,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_pending_repository_pull_request_review_comment(
    owner: String,
    repository: String,
    pull_request_number: u64,
    review_id: u64,
    comment_id: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPendingPullRequestReview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_pending_pull_request_review_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_item_number(review_id, "review")?,
            validate_item_number(comment_id, "review comment")?,
        )
        .await
}

#[tauri::command]
pub async fn github_submit_pending_repository_pull_request_review(
    owner: String,
    repository: String,
    pull_request_number: u64,
    review_id: u64,
    body: String,
    action: GitHubPullRequestReviewAction,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .submit_pending_pull_request_review(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_item_number(review_id, "review")?,
            &validate_pull_request_review_body(action, body)?,
            action,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_pending_repository_pull_request_review(
    owner: String,
    repository: String,
    pull_request_number: u64,
    review_id: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_pending_pull_request_review(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_item_number(review_id, "review")?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_pull_request_commits(
    owner: String,
    repository: String,
    pull_request_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestCommitPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_commits(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_pull_request_files(
    owner: String,
    repository: String,
    pull_request_number: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestFilePage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_files(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_pull_request_file_view_states(
    owner: String,
    repository: String,
    pull_request_number: u64,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestFileViewStateSnapshot, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .pull_request_file_view_states(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
        )
        .await
}

#[tauri::command]
pub async fn github_mark_repository_pull_request_file_viewed(
    pull_request_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestFileViewState, AppError> {
    state
        .github
        .mark_pull_request_file_viewed(
            &validate_graphql_node_id(pull_request_id, "pull request")?,
            &validate_repository_file_path(path)?,
        )
        .await
}

#[tauri::command]
pub async fn github_unmark_repository_pull_request_file_viewed(
    pull_request_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestFileViewState, AppError> {
    state
        .github
        .unmark_pull_request_file_viewed(
            &validate_graphql_node_id(pull_request_id, "pull request")?,
            &validate_repository_file_path(path)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_pull_request_review_threads(
    owner: String,
    repository: String,
    pull_request_number: u64,
    after: Option<String>,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReviewThreadPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let after = validate_graphql_cursor(after)?;
    state
        .github
        .pull_request_review_threads(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            after.as_deref(),
        )
        .await
}

#[tauri::command]
pub async fn github_reply_to_pull_request_review_thread(
    thread_id: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReviewThreadComment, AppError> {
    let thread_id = validate_graphql_node_id(thread_id, "review thread")?;
    let body = validate_issue_body(body)?;
    validate_issue_comment(&body)?;
    state
        .github
        .reply_to_pull_request_review_thread(&thread_id, &body)
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_pull_request_review_comment(
    owner: String,
    repository: String,
    pull_request_number: u64,
    mutation: GitHubCommentMutation,
    state: State<'_, AppState>,
) -> Result<Option<GitHubPullRequestReviewThreadComment>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_pull_request_review_comment(
            repository.owner(),
            repository.name(),
            validate_item_number(pull_request_number, "pull request")?,
            &validate_comment_mutation(mutation)?,
        )
        .await
}

#[tauri::command]
pub async fn github_resolve_pull_request_review_thread(
    thread_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReviewThreadState, AppError> {
    state
        .github
        .set_pull_request_review_thread_resolution(
            &validate_graphql_node_id(thread_id, "review thread")?,
            GitHubPullRequestReviewThreadResolution::Resolved,
        )
        .await
}

#[tauri::command]
pub async fn github_unresolve_pull_request_review_thread(
    thread_id: String,
    state: State<'_, AppState>,
) -> Result<GitHubPullRequestReviewThreadState, AppError> {
    state
        .github
        .set_pull_request_review_thread_resolution(
            &validate_graphql_node_id(thread_id, "review thread")?,
            GitHubPullRequestReviewThreadResolution::Unresolved,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_checks(
    owner: String,
    repository: String,
    reference: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubCheckPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .checks(
            repository.owner(),
            repository.name(),
            &validate_reference(reference)?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_check_suite(
    owner: String,
    repository: String,
    check_suite_id: u64,
    state: State<'_, AppState>,
) -> Result<GitHubCheckSuite, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .check_suite(
            repository.owner(),
            repository.name(),
            validate_item_number(check_suite_id, "check suite")?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_check_suite_runs(
    owner: String,
    repository: String,
    check_suite_id: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubCheckPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .check_suite_runs(
            repository.owner(),
            repository.name(),
            validate_item_number(check_suite_id, "check suite")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_workflow_run(
    owner: String,
    repository: String,
    run_id: u64,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowRun, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_run(
            repository.owner(),
            repository.name(),
            validate_item_number(run_id, "workflow run")?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_workflow_runs(
    owner: String,
    repository: String,
    workflow_id: Option<u64>,
    status: GitHubWorkflowRunStatusFilter,
    branch: String,
    event: String,
    actor: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowRunPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_runs(
            repository.owner(),
            repository.name(),
            workflow_id
                .map(|workflow_id| validate_item_number(workflow_id, "workflow"))
                .transpose()?,
            &GitHubWorkflowRunFilters {
                status,
                branch: validate_optional_workflow_filter(branch, "workflow branch", 512)?,
                event: validate_optional_workflow_filter(event, "workflow event", 100)?,
                actor: validate_optional_workflow_filter(actor, "workflow actor", 100)?,
                page: validate_page(page)?,
            },
        )
        .await
}

#[tauri::command]
pub async fn github_get_workflow_run_filter_options(
    owner: String,
    repository: String,
    workflow_id: Option<u64>,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowRunFilterOptions, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_run_filter_options(
            repository.owner(),
            repository.name(),
            workflow_id
                .map(|workflow_id| validate_item_number(workflow_id, "workflow"))
                .transpose()?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_workflows(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<Vec<GitHubWorkflow>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflows(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_set_repository_workflow_enabled(
    owner: String,
    repository: String,
    workflow_id: u64,
    expected_state: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflow, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .set_workflow_enabled(
            repository.owner(),
            repository.name(),
            validate_item_number(workflow_id, "workflow")?,
            &validate_workflow_state(expected_state)?,
            enabled,
        )
        .await
}

#[tauri::command]
pub async fn github_get_workflow_dispatch_options(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowDispatchOptions, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_dispatch_options(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_get_workflow_dispatch_config(
    owner: String,
    repository: String,
    workflow_id: u64,
    reference: String,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowDispatchConfig, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_dispatch_config(
            repository.owner(),
            repository.name(),
            validate_item_number(workflow_id, "workflow")?,
            &validate_reference(reference)?,
        )
        .await
}

#[tauri::command]
pub async fn github_dispatch_workflow(
    owner: String,
    repository: String,
    workflow_id: u64,
    reference: String,
    inputs: BTreeMap<String, serde_json::Value>,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .dispatch_workflow(
            repository.owner(),
            repository.name(),
            validate_item_number(workflow_id, "workflow")?,
            &validate_reference(reference)?,
            &inputs,
        )
        .await
}

#[tauri::command]
pub async fn github_list_workflow_run_jobs(
    owner: String,
    repository: String,
    run_id: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowJobPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_jobs(
            repository.owner(),
            repository.name(),
            validate_item_number(run_id, "workflow run")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_workflow_run_artifacts(
    owner: String,
    repository: String,
    run_id: u64,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowArtifactPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_artifacts(
            repository.owner(),
            repository.name(),
            validate_item_number(run_id, "workflow run")?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_download_workflow_artifact(
    owner: String,
    repository: String,
    run_id: u64,
    artifact_id: u64,
    artifact_name: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubFileDownloadResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let run_id = validate_item_number(run_id, "workflow run")?;
    let artifact_id = validate_item_number(artifact_id, "workflow artifact")?;
    let suggested_name = crate::github::actions::workflow_artifact_archive_name(&artifact_name);
    let Some(file_path) = choose_save_file(&app, &suggested_name).await? else {
        return Ok(GitHubFileDownloadResult {
            saved: false,
            path: None,
        });
    };
    let download = state
        .github
        .download_workflow_artifact(repository.owner(), repository.name(), run_id, artifact_id)
        .await?;

    write_file_download(file_path, download).await
}

#[tauri::command]
pub async fn github_get_workflow_job_log(
    owner: String,
    repository: String,
    job_id: u64,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowJobLog, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .workflow_job_log(
            repository.owner(),
            repository.name(),
            validate_item_number(job_id, "workflow job")?,
        )
        .await
}

#[tauri::command]
pub async fn github_request_workflow_run_action(
    owner: String,
    repository: String,
    run_id: u64,
    action: GitHubWorkflowRunAction,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .request_workflow_run_action(
            repository.owner(),
            repository.name(),
            validate_item_number(run_id, "workflow run")?,
            action,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_repository_workflow_run(
    owner: String,
    repository: String,
    run_id: u64,
    expected_workflow_id: u64,
    expected_updated_at: String,
    state: State<'_, AppState>,
) -> Result<GitHubWorkflowRunDeletion, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_workflow_run(
            repository.owner(),
            repository.name(),
            validate_item_number(run_id, "workflow run")?,
            validate_item_number(expected_workflow_id, "workflow")?,
            &validate_workflow_run_updated_at(expected_updated_at)?,
        )
        .await
}

#[tauri::command]
pub async fn github_request_workflow_job_rerun(
    owner: String,
    repository: String,
    run_id: u64,
    job_id: u64,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .request_workflow_job_rerun(
            repository.owner(),
            repository.name(),
            validate_item_number(run_id, "workflow run")?,
            validate_item_number(job_id, "workflow job")?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_code_overview(
    owner: String,
    repository: String,
    reference: String,
    state: State<'_, AppState>,
) -> Result<GitHubCodeOverview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reference = validate_reference(reference)?;
    state
        .github
        .code_overview(repository.owner(), repository.name(), &reference)
        .await
}

#[tauri::command]
pub async fn github_get_repository_insights_overview(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryInsightsOverview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_insights_overview(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_get_repository_insights_contributors(
    owner: String,
    repository: String,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryInsightsContributors, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_insights_contributors(repository.owner(), repository.name())
        .await
}

#[tauri::command]
pub async fn github_get_repository_insights_traffic(
    owner: String,
    repository: String,
    period: GitHubInsightsTrafficPeriod,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryInsightsTraffic, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_insights_traffic(repository.owner(), repository.name(), period)
        .await
}

#[tauri::command]
pub async fn github_list_repository_commits(
    owner: String,
    repository: String,
    reference: String,
    path: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryCommitPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .commits(
            repository.owner(),
            repository.name(),
            &validate_reference(reference)?,
            &validate_repository_path(path)?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_commit(
    owner: String,
    repository: String,
    commit_sha: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubCommitDetailPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .commit_detail(
            repository.owner(),
            repository.name(),
            &validate_full_commit_sha(commit_sha)?,
            validate_commit_file_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_commit_comments(
    owner: String,
    repository: String,
    commit_sha: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubCommitCommentPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .commit_comments(
            repository.owner(),
            repository.name(),
            &validate_full_commit_sha(commit_sha)?,
            validate_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_commit_comment(
    owner: String,
    repository: String,
    commit_sha: String,
    mutation: GitHubCommitCommentMutation,
    state: State<'_, AppState>,
) -> Result<Option<GitHubCommitComment>, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_commit_comment(
            repository.owner(),
            repository.name(),
            &validate_full_commit_sha(commit_sha)?,
            mutation,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_tags(
    owner: String,
    repository: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubTagPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .tags(repository.owner(), repository.name(), validate_page(page)?)
        .await
}

#[tauri::command]
pub async fn github_get_repository_blame(
    owner: String,
    repository: String,
    reference: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitHubBlame, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .blame(
            repository.owner(),
            repository.name(),
            &validate_reference(reference)?,
            &validate_repository_file_path(path)?,
        )
        .await
}

#[tauri::command]
pub async fn github_search_repository_code(
    owner: String,
    repository: String,
    query: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<GitHubCodeSearchPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .search_code(
            repository.owner(),
            repository.name(),
            &validate_code_search_query(query)?,
            validate_issue_page(page)?,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_contents(
    owner: String,
    repository: String,
    reference: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitHubContentListing, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reference = validate_reference(reference)?;
    let path = validate_repository_path(path)?;
    state
        .github
        .contents(repository.owner(), repository.name(), &reference, &path)
        .await
}

#[tauri::command]
pub async fn github_get_repository_file(
    owner: String,
    repository: String,
    reference: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<GitHubFilePreview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reference = validate_reference(reference)?;
    let path = validate_repository_file_path(path)?;
    state
        .github
        .file(repository.owner(), repository.name(), &reference, &path)
        .await
}

#[tauri::command]
pub async fn github_download_repository_file(
    owner: String,
    repository: String,
    reference: String,
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubFileDownloadResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let reference = validate_reference(reference)?;
    let path = validate_repository_file_path(path)?;
    let suggested_name = path.rsplit('/').next().unwrap_or("download");
    let Some(file_path) = choose_save_file(&app, suggested_name).await? else {
        return Ok(GitHubFileDownloadResult {
            saved: false,
            path: None,
        });
    };
    let download = state
        .github
        .download_file(repository.owner(), repository.name(), &reference, &path)
        .await?;

    write_file_download(file_path, download).await
}

#[tauri::command]
pub async fn github_commit_repository_file(
    owner: String,
    repository: String,
    branch: String,
    message: String,
    mutation: GitHubRepositoryFileMutation,
    state: State<'_, AppState>,
) -> Result<GitHubRepositoryFileCommit, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let branch = crate::github::code::write::normalize_branch_name(&branch)?;
    let message = crate::github::code::write::normalize_commit_message(&message)?;
    let mutation = crate::github::code::write::validate_file_mutation(mutation)?;
    state
        .github
        .commit_file(
            repository.owner(),
            repository.name(),
            &branch,
            &message,
            &mutation,
        )
        .await
}

#[tauri::command]
pub async fn github_create_repository_branch(
    owner: String,
    repository: String,
    source_branch: String,
    expected_source_sha: String,
    branch: String,
    state: State<'_, AppState>,
) -> Result<crate::github::code::GitHubBranch, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    let source_branch = crate::github::code::write::normalize_branch_name(&source_branch)?;
    let branch = crate::github::code::write::normalize_branch_name(&branch)?;
    if source_branch == branch {
        return Err(AppError::Validation(
            "new repository branch must have a different name".to_string(),
        ));
    }
    let expected_source_sha = crate::github::code::write::normalize_git_sha(&expected_source_sha)?;
    state
        .github
        .create_branch(
            repository.owner(),
            repository.name(),
            &source_branch,
            &expected_source_sha,
            &branch,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_repository_branch(
    owner: String,
    repository: String,
    branch: String,
    expected_sha: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_branch(
            repository.owner(),
            repository.name(),
            &crate::github::code::write::normalize_branch_name(&branch)?,
            &crate::github::code::write::normalize_git_sha(&expected_sha)?,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_wiki(
    owner: String,
    repository: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiOverview, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_wiki_overview(
            wiki_cache_root(&app)?,
            repository.owner(),
            repository.name(),
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_wiki_page(
    owner: String,
    repository: String,
    repository_id: u64,
    head_sha: String,
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_wiki_page(
            wiki_cache_root(&app)?,
            repository_id,
            repository.owner(),
            repository.name(),
            &head_sha,
            &path,
        )
        .await
}

#[tauri::command]
pub async fn github_search_repository_wiki(
    owner: String,
    repository: String,
    repository_id: u64,
    head_sha: String,
    query: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiSearchResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .search_repository_wiki(
            wiki_cache_root(&app)?,
            repository_id,
            repository.owner(),
            repository.name(),
            &head_sha,
            &query,
        )
        .await
}

#[tauri::command]
pub async fn github_list_repository_wiki_history(
    owner: String,
    repository: String,
    repository_id: u64,
    head_sha: String,
    path: String,
    page: u32,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiHistoryPage, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_wiki_history(
            wiki_cache_root(&app)?,
            repository_id,
            repository.owner(),
            repository.name(),
            &head_sha,
            &path,
            page,
        )
        .await
}

#[tauri::command]
pub async fn github_get_repository_wiki_revision(
    owner: String,
    repository: String,
    repository_id: u64,
    commit_sha: String,
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiRevision, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .repository_wiki_revision(
            wiki_cache_root(&app)?,
            repository_id,
            repository.owner(),
            repository.name(),
            &commit_sha,
            &path,
        )
        .await
}

#[tauri::command]
pub async fn github_compare_repository_wiki_revisions(
    owner: String,
    repository: String,
    repository_id: u64,
    path: String,
    base_sha: String,
    head_sha: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiComparison, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .compare_repository_wiki_revisions(
            wiki_cache_root(&app)?,
            repository_id,
            repository.owner(),
            repository.name(),
            &path,
            &base_sha,
            &head_sha,
        )
        .await
}

#[tauri::command]
pub async fn github_mutate_repository_wiki_page(
    owner: String,
    repository: String,
    input: GitHubWikiPageMutationInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiMutationResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .mutate_repository_wiki_page(
            wiki_cache_root(&app)?,
            repository.owner(),
            repository.name(),
            input,
        )
        .await
}

#[tauri::command]
pub async fn github_delete_repository_wiki_page(
    owner: String,
    repository: String,
    path: String,
    expected_head: String,
    expected_blob_sha: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiMutationResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .delete_repository_wiki_page(
            wiki_cache_root(&app)?,
            repository.owner(),
            repository.name(),
            &path,
            &expected_head,
            &expected_blob_sha,
        )
        .await
}

#[tauri::command]
pub async fn github_revert_repository_wiki_page(
    owner: String,
    repository: String,
    input: GitHubWikiRevertInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<GitHubWikiMutationResult, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state
        .github
        .revert_repository_wiki_page(
            wiki_cache_root(&app)?,
            repository.owner(),
            repository.name(),
            input,
        )
        .await
}

fn wiki_cache_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("github-wikis"))
        .map_err(|error| AppError::FileSystem(error.to_string()))
}

async fn choose_open_file(app: &AppHandle) -> Result<Option<PathBuf>, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_file(move |file_path| {
        let _ = sender.send(file_path);
    });
    receiver
        .await
        .map_err(|error| AppError::FileSystem(error.to_string()))?
        .map(|file_path| {
            file_path
                .into_path()
                .map_err(|error| AppError::FileSystem(error.to_string()))
        })
        .transpose()
}

async fn choose_save_file(
    app: &AppHandle,
    suggested_name: &str,
) -> Result<Option<PathBuf>, AppError> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(suggested_name)
        .save_file(move |file_path| {
            let _ = sender.send(file_path);
        });
    receiver
        .await
        .map_err(|error| AppError::FileSystem(error.to_string()))?
        .map(|file_path| {
            file_path
                .into_path()
                .map_err(|error| AppError::FileSystem(error.to_string()))
        })
        .transpose()
}

async fn write_file_download(
    file_path: PathBuf,
    download: GitHubFileDownload,
) -> Result<GitHubFileDownloadResult, AppError> {
    let display_path = file_path.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || std::fs::write(file_path, download.bytes))
        .await
        .map_err(|error| AppError::FileSystem(error.to_string()))?
        .map_err(|error| AppError::FileSystem(error.to_string()))?;

    Ok(GitHubFileDownloadResult {
        saved: true,
        path: Some(display_path),
    })
}

fn validate_reference(reference: String) -> Result<String, AppError> {
    let reference = reference.trim().to_string();
    if reference.is_empty() || reference.len() > 512 || reference.chars().any(char::is_control) {
        return Err(AppError::Validation(
            "repository reference is invalid".to_string(),
        ));
    }
    Ok(reference)
}

fn validate_optional_workflow_filter(
    value: String,
    label: &str,
    max_length: usize,
) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.len() > max_length || value.chars().any(char::is_control) {
        return Err(AppError::Validation(format!("{label} is invalid")));
    }
    Ok(value)
}

fn validate_workflow_state(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if matches!(
        value.as_str(),
        "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually"
    ) {
        Ok(value)
    } else {
        Err(AppError::Validation(
            "workflow state is invalid".to_string(),
        ))
    }
}

fn validate_workflow_run_updated_at(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.len() > 64 || value.chars().any(char::is_control) {
        Err(AppError::Validation(
            "workflow run revision is invalid".to_string(),
        ))
    } else {
        Ok(value)
    }
}

fn validate_repository_path(path: String) -> Result<String, AppError> {
    let path = path.trim_matches('/').to_string();
    if path.len() > 4_096
        || path.chars().any(char::is_control)
        || path
            .split('/')
            .any(|segment| segment == "." || segment == "..")
    {
        return Err(AppError::Validation(
            "repository path is invalid".to_string(),
        ));
    }
    Ok(path)
}

fn validate_optional_fork_name(name: Option<String>) -> Result<Option<String>, AppError> {
    let Some(name) = name else {
        return Ok(None);
    };
    let name = name.trim().to_string();
    if name.is_empty() {
        return Ok(None);
    }
    RepositoryRef::new("harbor-viewer".to_string(), name.clone())?;
    Ok(Some(name))
}

fn validate_repository_create_input(
    mut input: GitHubRepositoryCreateInput,
) -> Result<GitHubRepositoryCreateInput, AppError> {
    input.name = validate_repository_name(input.name)?;
    input.description = validate_optional_repository_text(input.description, "description", 350)?;
    input.homepage = validate_optional_repository_homepage(input.homepage)?;
    input.gitignore_template =
        validate_optional_template_name(input.gitignore_template, "gitignore template")?;
    input.license_template =
        validate_optional_template_name(input.license_template, "license template")?;
    if !input.initialize_with_readme
        && (input.gitignore_template.is_some() || input.license_template.is_some())
    {
        return Err(AppError::Validation(
            "repository templates require initialization with a README".to_string(),
        ));
    }
    Ok(input)
}

fn validate_repository_settings_update(
    mut update: GitHubRepositorySettingsUpdate,
) -> Result<GitHubRepositorySettingsUpdate, AppError> {
    update.name = validate_repository_name(update.name)?;
    update.description = validate_optional_repository_text(update.description, "description", 350)?;
    update.homepage = validate_optional_repository_homepage(update.homepage)?;
    update.default_branch = validate_reference(update.default_branch)?;
    if !update.allow_merge_commit && !update.allow_squash_merge && !update.allow_rebase_merge {
        return Err(AppError::Validation(
            "at least one pull request merge method must remain enabled".to_string(),
        ));
    }
    Ok(update)
}

fn validate_repository_name(name: String) -> Result<String, AppError> {
    let name = name.trim().to_string();
    RepositoryRef::new("harbor-viewer".to_string(), name.clone())?;
    Ok(name)
}

fn validate_optional_repository_text(
    value: Option<String>,
    label: &str,
    max_length: usize,
) -> Result<Option<String>, AppError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_string();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > max_length || value.chars().any(char::is_control) {
        return Err(AppError::Validation(format!(
            "repository {label} is invalid"
        )));
    }
    Ok(Some(value))
}

fn validate_optional_repository_homepage(
    homepage: Option<String>,
) -> Result<Option<String>, AppError> {
    let homepage = validate_optional_repository_text(homepage, "homepage", 2_048)?;
    let Some(homepage) = homepage else {
        return Ok(None);
    };
    let uri = homepage
        .parse::<http::Uri>()
        .map_err(|_| AppError::Validation("repository homepage is invalid".to_string()))?;
    if !matches!(uri.scheme_str(), Some("http" | "https")) || uri.authority().is_none() {
        return Err(AppError::Validation(
            "repository homepage must use HTTP or HTTPS".to_string(),
        ));
    }
    Ok(Some(homepage))
}

fn validate_optional_template_name(
    value: Option<String>,
    label: &str,
) -> Result<Option<String>, AppError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim().to_string();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > 100 || value.chars().any(char::is_control) || value.contains('/') {
        return Err(AppError::Validation(format!("{label} is invalid")));
    }
    Ok(Some(value))
}

fn validate_repository_deletion_confirmation(confirmation: String) -> Result<String, AppError> {
    let confirmation = confirmation.trim().to_string();
    if confirmation.is_empty()
        || confirmation.len() > 201
        || confirmation.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "repository deletion confirmation is invalid".to_string(),
        ));
    }
    Ok(confirmation)
}

fn validate_gist_id(gist_id: String) -> Result<String, AppError> {
    let gist_id = gist_id.trim();
    if gist_id.is_empty()
        || gist_id.len() > 64
        || !gist_id
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(AppError::Validation(
            "Gist ID must contain at most 64 hexadecimal characters".to_string(),
        ));
    }
    Ok(gist_id.to_ascii_lowercase())
}

fn validate_profile_field(
    value: String,
    field: &str,
    max_length: usize,
) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.chars().count() > max_length || value.chars().any(|character| character == '\0') {
        return Err(AppError::Validation(format!(
            "GitHub profile {field} is invalid or exceeds {max_length} characters"
        )));
    }
    Ok(value)
}

fn validate_profile_update(
    input: GitHubUserProfileUpdate,
) -> Result<GitHubUserProfileUpdate, AppError> {
    let twitter_username = validate_profile_field(input.twitter_username, "username", 16)?
        .trim_start_matches('@')
        .to_string();
    if twitter_username.len() > 15
        || !twitter_username
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return Err(AppError::Validation(
            "GitHub profile X username is invalid".to_string(),
        ));
    }
    Ok(GitHubUserProfileUpdate {
        name: validate_profile_field(input.name, "name", 255)?,
        bio: validate_profile_field(input.bio, "bio", 160)?,
        company: validate_profile_field(input.company, "company", 255)?,
        location: validate_profile_field(input.location, "location", 255)?,
        blog: validate_profile_field(input.blog, "website", 255)?,
        email: validate_profile_field(input.email, "email", 254)?,
        twitter_username,
        hireable: input.hireable,
    })
}

fn validate_gist_version(version: String) -> Result<String, AppError> {
    let version = version.trim();
    if version.len() != 40
        || !version
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(AppError::Validation(
            "Gist revision must be a full 40-character commit SHA".to_string(),
        ));
    }
    Ok(version.to_ascii_lowercase())
}

fn validate_gist_description(description: Option<String>) -> Result<Option<String>, AppError> {
    let description = description
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if description
        .as_ref()
        .is_some_and(|value| value.len() > 1_024)
    {
        return Err(AppError::Validation(
            "Gist description must be at most 1024 bytes".to_string(),
        ));
    }
    Ok(description)
}

fn validate_gist_filename(filename: String) -> Result<String, AppError> {
    let filename = filename.trim();
    let lowered = filename.to_ascii_lowercase();
    let reserved = lowered.strip_prefix("gistfile").is_some_and(|suffix| {
        !suffix.is_empty() && suffix.chars().all(|character| character.is_ascii_digit())
    });
    if filename.is_empty()
        || filename.len() > 255
        || filename.contains(['/', '\\'])
        || filename.chars().any(char::is_control)
        || reserved
    {
        return Err(AppError::Validation(
            "Gist file name is invalid or uses GitHub's reserved gistfile<number> pattern"
                .to_string(),
        ));
    }
    Ok(filename.to_string())
}

fn validate_gist_content(content: String) -> Result<String, AppError> {
    if content.len() > 10 * 1024 * 1024 {
        return Err(AppError::Validation(
            "Gist file content must be at most 10 MiB".to_string(),
        ));
    }
    Ok(content)
}

fn validate_gist_files(
    files: Vec<GitHubGistFileInput>,
) -> Result<Vec<GitHubGistFileInput>, AppError> {
    if files.is_empty() || files.len() > 100 {
        return Err(AppError::Validation(
            "a Gist must contain between 1 and 100 files".to_string(),
        ));
    }
    let mut names = std::collections::BTreeSet::new();
    files
        .into_iter()
        .map(|file| {
            let filename = validate_gist_filename(file.filename)?;
            if !names.insert(filename.clone()) {
                return Err(AppError::Validation(
                    "Gist file names must be unique".to_string(),
                ));
            }
            Ok(GitHubGistFileInput {
                filename,
                content: validate_gist_content(file.content)?,
            })
        })
        .collect()
}

fn validate_gist_create_input(
    input: GitHubGistCreateInput,
) -> Result<GitHubGistCreateInput, AppError> {
    Ok(GitHubGistCreateInput {
        description: validate_gist_description(input.description)?,
        public: input.public,
        files: validate_gist_files(input.files)?,
    })
}

fn validate_gist_update_input(
    input: GitHubGistUpdateInput,
) -> Result<GitHubGistUpdateInput, AppError> {
    if input.files.len() > 100 {
        return Err(AppError::Validation(
            "a Gist update can change at most 100 files".to_string(),
        ));
    }
    let mut originals = std::collections::BTreeSet::new();
    let mut names = std::collections::BTreeSet::new();
    let files = input
        .files
        .into_iter()
        .map(|file| {
            let original_filename = file
                .original_filename
                .map(validate_gist_filename)
                .transpose()?;
            if original_filename
                .as_ref()
                .is_some_and(|original| !originals.insert(original.clone()))
            {
                return Err(AppError::Validation(
                    "each current Gist file can be changed only once".to_string(),
                ));
            }
            let filename = validate_gist_filename(file.filename)?;
            if !file.deleted && !names.insert(filename.clone()) {
                return Err(AppError::Validation(
                    "Gist file names must be unique".to_string(),
                ));
            }
            if file.deleted && original_filename.is_none() {
                return Err(AppError::Validation(
                    "only an existing Gist file can be deleted".to_string(),
                ));
            }
            let content = file.content.map(validate_gist_content).transpose()?;
            if original_filename.is_none() && !file.deleted && content.is_none() {
                return Err(AppError::Validation(
                    "new Gist files require content".to_string(),
                ));
            }
            Ok(GitHubGistFileMutation {
                original_filename,
                filename,
                content: if file.deleted { None } else { content },
                deleted: file.deleted,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(GitHubGistUpdateInput {
        description: validate_gist_description(input.description)?,
        files,
    })
}

fn validate_gist_comment_body(body: String) -> Result<String, AppError> {
    let body = body.trim();
    if body.is_empty() || body.len() > 65_536 {
        return Err(AppError::Validation(
            "Gist comment must contain between 1 and 65536 bytes".to_string(),
        ));
    }
    Ok(body.to_string())
}

fn validate_gist_comment_mutation(
    mutation: GitHubGistCommentMutation,
) -> Result<GitHubGistCommentMutation, AppError> {
    match mutation {
        GitHubGistCommentMutation::Create { body } => Ok(GitHubGistCommentMutation::Create {
            body: validate_gist_comment_body(body)?,
        }),
        GitHubGistCommentMutation::Update { comment_id, body } => {
            Ok(GitHubGistCommentMutation::Update {
                comment_id: validate_item_number(comment_id, "Gist comment")?,
                body: validate_gist_comment_body(body)?,
            })
        }
        GitHubGistCommentMutation::Delete { comment_id } => Ok(GitHubGistCommentMutation::Delete {
            comment_id: validate_item_number(comment_id, "Gist comment")?,
        }),
    }
}

fn validate_repository_file_path(path: String) -> Result<String, AppError> {
    let path = validate_repository_path(path)?;
    if path.is_empty() {
        return Err(AppError::Validation(
            "repository file path is required".to_string(),
        ));
    }
    Ok(path)
}

fn validate_issue_query(query: String) -> Result<String, AppError> {
    let query = query.trim().to_string();
    if query.len() > 256 || query.chars().any(char::is_control) {
        return Err(AppError::Validation("issue query is invalid".to_string()));
    }
    Ok(query)
}

fn validate_project_number(number: u32) -> Result<u32, AppError> {
    if number == 0 || number > i32::MAX as u32 {
        Err(AppError::Validation(
            "project number is out of range".to_string(),
        ))
    } else {
        Ok(number)
    }
}

fn validate_project_query(query: String) -> Result<String, AppError> {
    let query = query.trim().to_string();
    if query.len() > 512 || query.chars().any(char::is_control) {
        Err(AppError::Validation(
            "project search query is invalid".to_string(),
        ))
    } else {
        Ok(query)
    }
}

fn validate_project_title(title: String) -> Result<String, AppError> {
    let title = title.trim().to_string();
    if title.is_empty() || title.len() > 256 || title.chars().any(char::is_control) {
        Err(AppError::Validation("project title is invalid".to_string()))
    } else {
        Ok(title)
    }
}

fn validate_project_text(
    value: String,
    label: &str,
    max_length: usize,
) -> Result<String, AppError> {
    if value.len() > max_length || value.contains('\0') {
        Err(AppError::Validation(format!("project {label} is invalid")))
    } else {
        Ok(value)
    }
}

fn validate_project_update(update: GitHubProjectUpdate) -> Result<GitHubProjectUpdate, AppError> {
    Ok(GitHubProjectUpdate {
        title: validate_project_title(update.title)?,
        short_description: validate_project_text(update.short_description, "description", 256)?,
        readme: validate_project_text(update.readme, "readme", 50_000)?,
        public: update.public,
        closed: update.closed,
    })
}

fn validate_project_item_addition(
    addition: GitHubProjectItemAddition,
) -> Result<GitHubProjectItemAddition, AppError> {
    match addition {
        GitHubProjectItemAddition::DraftIssue { title, body } => {
            Ok(GitHubProjectItemAddition::DraftIssue {
                title: validate_project_title(title)?,
                body: validate_project_text(body, "draft body", 50_000)?,
            })
        }
        GitHubProjectItemAddition::ExistingItem { url } => {
            let url = url.trim().to_string();
            if url.is_empty() || url.len() > 2_048 || url.chars().any(char::is_control) {
                return Err(AppError::Validation(
                    "project item URL is invalid".to_string(),
                ));
            }
            Ok(GitHubProjectItemAddition::ExistingItem { url })
        }
    }
}

fn validate_project_item_update(
    update: GitHubProjectItemUpdate,
) -> Result<GitHubProjectItemUpdate, AppError> {
    match update {
        GitHubProjectItemUpdate::DraftIssue { title, body } => {
            Ok(GitHubProjectItemUpdate::DraftIssue {
                title: validate_project_title(title)?,
                body: validate_project_text(body, "draft body", 50_000)?,
            })
        }
        GitHubProjectItemUpdate::ClearField { field_id } => {
            Ok(GitHubProjectItemUpdate::ClearField {
                field_id: validate_graphql_node_id(field_id, "project field")?,
            })
        }
        GitHubProjectItemUpdate::Text { field_id, text } => Ok(GitHubProjectItemUpdate::Text {
            field_id: validate_graphql_node_id(field_id, "project field")?,
            text: validate_project_text(text, "field value", 10_000)?,
        }),
        GitHubProjectItemUpdate::Number { field_id, number } => {
            if !number.is_finite() {
                return Err(AppError::Validation(
                    "project number field is invalid".to_string(),
                ));
            }
            Ok(GitHubProjectItemUpdate::Number {
                field_id: validate_graphql_node_id(field_id, "project field")?,
                number,
            })
        }
        GitHubProjectItemUpdate::Date { field_id, date } => {
            if date.len() != 10
                || date.as_bytes()[4] != b'-'
                || date.as_bytes()[7] != b'-'
                || !date
                    .bytes()
                    .enumerate()
                    .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
            {
                return Err(AppError::Validation(
                    "project date field must use YYYY-MM-DD".to_string(),
                ));
            }
            Ok(GitHubProjectItemUpdate::Date {
                field_id: validate_graphql_node_id(field_id, "project field")?,
                date,
            })
        }
        GitHubProjectItemUpdate::SingleSelect {
            field_id,
            option_id,
        } => Ok(GitHubProjectItemUpdate::SingleSelect {
            field_id: validate_graphql_node_id(field_id, "project field")?,
            option_id: validate_graphql_node_id(option_id, "project field option")?,
        }),
        GitHubProjectItemUpdate::MultiSelect {
            field_id,
            option_ids,
        } => {
            if option_ids.len() > 50 {
                return Err(AppError::Validation(
                    "too many project field options".to_string(),
                ));
            }
            Ok(GitHubProjectItemUpdate::MultiSelect {
                field_id: validate_graphql_node_id(field_id, "project field")?,
                option_ids: option_ids
                    .into_iter()
                    .map(|option_id| validate_graphql_node_id(option_id, "project field option"))
                    .collect::<Result<Vec<_>, _>>()?,
            })
        }
        GitHubProjectItemUpdate::Iteration {
            field_id,
            iteration_id,
        } => Ok(GitHubProjectItemUpdate::Iteration {
            field_id: validate_graphql_node_id(field_id, "project field")?,
            iteration_id: validate_graphql_node_id(iteration_id, "project iteration")?,
        }),
    }
}

fn validate_code_search_query(query: String) -> Result<String, AppError> {
    let query = query.trim().to_string();
    if query.is_empty() || query.len() > 256 || query.chars().any(char::is_control) {
        return Err(AppError::Validation(
            "code search query is invalid".to_string(),
        ));
    }
    Ok(query)
}

fn validate_issue_label(label: String) -> Result<String, AppError> {
    let label = label.trim().to_string();
    if label.len() > 128 || label.chars().any(char::is_control) {
        return Err(AppError::Validation("issue label is invalid".to_string()));
    }
    Ok(label)
}

fn validate_issue_title(title: String) -> Result<String, AppError> {
    let title = title.trim().to_string();
    if title.is_empty() || title.chars().any(char::is_control) {
        return Err(AppError::Validation("issue title is invalid".to_string()));
    }
    Ok(title)
}

fn validate_issue_body(body: String) -> Result<String, AppError> {
    if body.contains('\0') {
        return Err(AppError::Validation("issue body is invalid".to_string()));
    }
    Ok(body)
}

fn validate_named_values(
    values: Vec<String>,
    label: &str,
    max_items: usize,
    max_length: usize,
) -> Result<Vec<String>, AppError> {
    let mut normalized: Vec<String> = Vec::with_capacity(values.len().min(max_items));
    for value in values {
        let value = value.trim().to_string();
        if value.is_empty() || value.len() > max_length || value.chars().any(char::is_control) {
            return Err(AppError::Validation(format!("{label} is invalid")));
        }
        if !normalized
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&value))
        {
            normalized.push(value);
        }
    }
    if normalized.len() > max_items {
        return Err(AppError::Validation(format!("too many {label} values")));
    }
    Ok(normalized)
}

fn ensure_reviewer_selection(reviewers: &[String], teams: &[String]) -> Result<(), AppError> {
    if reviewers.is_empty() && teams.is_empty() {
        return Err(AppError::Validation(
            "at least one pull request reviewer is required".to_string(),
        ));
    }
    Ok(())
}

fn validate_issue_comment(body: &str) -> Result<&str, AppError> {
    if body.trim().is_empty() {
        return Err(AppError::Validation(
            "issue comment cannot be empty".to_string(),
        ));
    }
    Ok(body)
}

fn validate_comment_mutation(
    mutation: GitHubCommentMutation,
) -> Result<GitHubCommentMutation, AppError> {
    match mutation {
        GitHubCommentMutation::Update {
            comment_id,
            expected_updated_at,
            body,
        } => Ok(GitHubCommentMutation::Update {
            comment_id: validate_graphql_node_id(comment_id, "comment")?,
            expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
            body: validate_issue_body(body)?,
        }),
        GitHubCommentMutation::Delete {
            comment_id,
            expected_updated_at,
        } => Ok(GitHubCommentMutation::Delete {
            comment_id: validate_graphql_node_id(comment_id, "comment")?,
            expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
        }),
        GitHubCommentMutation::Pin {
            comment_id,
            expected_updated_at,
            expected_pinned,
        } => {
            if expected_pinned {
                return Err(AppError::Validation(
                    "pin mutation must start from an unpinned comment".to_string(),
                ));
            }
            Ok(GitHubCommentMutation::Pin {
                comment_id: validate_graphql_node_id(comment_id, "comment")?,
                expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
                expected_pinned,
            })
        }
        GitHubCommentMutation::Unpin {
            comment_id,
            expected_updated_at,
            expected_pinned,
        } => {
            if !expected_pinned {
                return Err(AppError::Validation(
                    "unpin mutation must start from a pinned comment".to_string(),
                ));
            }
            Ok(GitHubCommentMutation::Unpin {
                comment_id: validate_graphql_node_id(comment_id, "comment")?,
                expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
                expected_pinned,
            })
        }
        GitHubCommentMutation::Minimize {
            comment_id,
            expected_updated_at,
            expected_minimized,
            classifier,
        } => {
            if expected_minimized {
                return Err(AppError::Validation(
                    "minimize mutation must start from a visible comment".to_string(),
                ));
            }
            Ok(GitHubCommentMutation::Minimize {
                comment_id: validate_graphql_node_id(comment_id, "comment")?,
                expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
                expected_minimized,
                classifier,
            })
        }
        GitHubCommentMutation::Unminimize {
            comment_id,
            expected_updated_at,
            expected_minimized,
        } => {
            if !expected_minimized {
                return Err(AppError::Validation(
                    "unminimize mutation must start from a minimized comment".to_string(),
                ));
            }
            Ok(GitHubCommentMutation::Unminimize {
                comment_id: validate_graphql_node_id(comment_id, "comment")?,
                expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
                expected_minimized,
            })
        }
    }
}

fn validate_discussion_comment_mutation(
    mutation: GitHubDiscussionCommentMutation,
) -> Result<GitHubDiscussionCommentMutation, AppError> {
    match mutation {
        GitHubDiscussionCommentMutation::Minimize {
            comment_id,
            expected_updated_at,
            expected_minimized,
            classifier,
        } => {
            if expected_minimized {
                return Err(AppError::Validation(
                    "minimize mutation must start from a visible discussion comment".to_string(),
                ));
            }
            Ok(GitHubDiscussionCommentMutation::Minimize {
                comment_id: validate_graphql_node_id(comment_id, "discussion comment")?,
                expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
                expected_minimized,
                classifier,
            })
        }
        GitHubDiscussionCommentMutation::Unminimize {
            comment_id,
            expected_updated_at,
            expected_minimized,
        } => {
            if !expected_minimized {
                return Err(AppError::Validation(
                    "unminimize mutation must start from a minimized discussion comment"
                        .to_string(),
                ));
            }
            Ok(GitHubDiscussionCommentMutation::Unminimize {
                comment_id: validate_graphql_node_id(comment_id, "discussion comment")?,
                expected_updated_at: validate_comment_updated_at(expected_updated_at)?,
                expected_minimized,
            })
        }
    }
}

fn validate_comment_updated_at(updated_at: String) -> Result<String, AppError> {
    let updated_at = updated_at.trim().to_string();
    if updated_at.is_empty()
        || updated_at.len() > 128
        || updated_at.chars().any(char::is_control)
        || !updated_at.contains('T')
    {
        return Err(AppError::Validation(
            "GitHub comment revision is invalid".to_string(),
        ));
    }
    Ok(updated_at)
}

fn validate_commit_id(commit_id: String) -> Result<String, AppError> {
    let commit_id = commit_id.trim().to_string();
    if !(7..=128).contains(&commit_id.len())
        || !commit_id.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(AppError::Validation("commit id is invalid".to_string()));
    }
    Ok(commit_id)
}

fn validate_full_commit_sha(commit_sha: String) -> Result<String, AppError> {
    let commit_sha = validate_commit_id(commit_sha)?;
    if commit_sha.len() != 40 {
        return Err(AppError::Validation(
            "a full 40-character commit SHA is required".to_string(),
        ));
    }
    Ok(commit_sha)
}

fn validate_optional_commit_title(title: Option<String>) -> Result<Option<String>, AppError> {
    title
        .map(|title| {
            let title = title.trim().to_string();
            if title.is_empty() {
                return Ok(None);
            }
            if title.chars().any(char::is_control) {
                return Err(AppError::Validation(
                    "pull request merge title is invalid".to_string(),
                ));
            }
            Ok(Some(title))
        })
        .transpose()
        .map(Option::flatten)
}

fn validate_optional_commit_message(message: Option<String>) -> Result<Option<String>, AppError> {
    message
        .map(|message| {
            let message = validate_issue_body(message)?;
            Ok((!message.trim().is_empty()).then_some(message))
        })
        .transpose()
        .map(Option::flatten)
}

fn validate_pull_request_review_body(
    action: GitHubPullRequestReviewAction,
    body: String,
) -> Result<String, AppError> {
    let body = validate_issue_body(body)?;
    if action != GitHubPullRequestReviewAction::Approve && body.trim().is_empty() {
        return Err(AppError::Validation(
            "pull request review body cannot be empty".to_string(),
        ));
    }
    Ok(body)
}

fn validate_pull_request_review_dismissal_message(message: String) -> Result<String, AppError> {
    let message = validate_issue_body(message)?.trim().to_string();
    if message.is_empty() {
        Err(AppError::Validation(
            "pull request review dismissal message is required".to_string(),
        ))
    } else {
        Ok(message)
    }
}

fn validate_pull_request_review_comments(
    comments: Vec<GitHubPullRequestReviewComment>,
) -> Result<Vec<GitHubPullRequestReviewComment>, AppError> {
    if comments.len() > 100 {
        return Err(AppError::Validation(
            "too many pull request review comments".to_string(),
        ));
    }

    let mut normalized = Vec::with_capacity(comments.len());
    for mut comment in comments {
        comment.path = validate_repository_file_path(comment.path)?;
        comment.body = validate_issue_body(comment.body)?;
        if comment.line == 0 || comment.body.trim().is_empty() {
            return Err(AppError::Validation(
                "pull request review comment is invalid".to_string(),
            ));
        }
        match (comment.start_line, comment.start_side) {
            (None, None) => {}
            (Some(start_line), Some(start_side))
                if start_line > 0 && start_line < comment.line && start_side == comment.side => {}
            _ => {
                return Err(AppError::Validation(
                    "pull request review comment range is invalid".to_string(),
                ));
            }
        }
        if normalized
            .iter()
            .any(|existing: &GitHubPullRequestReviewComment| {
                existing.path == comment.path
                    && existing.line == comment.line
                    && existing.side == comment.side
            })
        {
            return Err(AppError::Validation(
                "pull request review comments contain a duplicate line".to_string(),
            ));
        }
        normalized.push(comment);
    }
    Ok(normalized)
}

fn validate_page(page: u32) -> Result<u32, AppError> {
    if !(1..=1_000).contains(&page) {
        return Err(AppError::Validation("page is out of range".to_string()));
    }
    Ok(page)
}

fn validate_commit_file_page(page: u32) -> Result<u32, AppError> {
    if !(1..=30).contains(&page) {
        return Err(AppError::Validation(
            "commit file page is out of range".to_string(),
        ));
    }
    Ok(page)
}

fn validate_notification_page(page: u32) -> Result<u32, AppError> {
    if !(1..=u8::MAX as u32).contains(&page) {
        return Err(AppError::Validation(
            "notification page is out of range".to_string(),
        ));
    }
    Ok(page)
}

fn validate_developer_feed_page(page: u32) -> Result<u32, AppError> {
    if !(1..=10).contains(&page) {
        return Err(AppError::Validation(
            "GitHub developer feed page must be between 1 and 10".to_string(),
        ));
    }
    Ok(page)
}

fn validate_notification_thread_id(thread_id: u64) -> Result<u64, AppError> {
    if thread_id == 0 {
        return Err(AppError::Validation(
            "notification thread ID must be greater than zero".to_string(),
        ));
    }
    Ok(thread_id)
}

fn validate_graphql_cursor(cursor: Option<String>) -> Result<Option<String>, AppError> {
    match cursor {
        Some(cursor)
            if cursor.is_empty()
                || cursor.len() > 1_024
                || cursor.chars().any(char::is_control) =>
        {
            Err(AppError::Validation(
                "GraphQL cursor is invalid".to_string(),
            ))
        }
        cursor => Ok(cursor),
    }
}

fn validate_graphql_node_id(node_id: String, label: &str) -> Result<String, AppError> {
    let node_id = node_id.trim().to_string();
    if node_id.is_empty()
        || node_id.len() > 512
        || node_id
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(AppError::Validation(format!(
            "GitHub {label} node ID is invalid"
        )));
    }
    Ok(node_id)
}

fn validate_issue_page(page: u32) -> Result<u32, AppError> {
    if !(1..=34).contains(&page) {
        return Err(AppError::Validation(
            "issue search page is out of range".to_string(),
        ));
    }
    Ok(page)
}

fn validate_item_number(number: u64, label: &str) -> Result<u64, AppError> {
    if number == 0 {
        return Err(AppError::Validation(format!(
            "{label} number must be greater than zero"
        )));
    }
    Ok(number)
}

#[tauri::command]
pub async fn repository_context_ask(
    owner: String,
    repository: String,
    question: String,
    state: State<'_, AppState>,
) -> Result<RepositoryContextAnswer, AppError> {
    let repository = RepositoryRef::new(owner, repository)?;
    state.repository_context.ask(&repository, &question).await
}

#[cfg(test)]
mod tests {
    use crate::github::GitHubCommentMinimizeClassifier;

    use super::*;

    #[test]
    fn profile_update_trims_fields_and_normalizes_x_username() {
        let normalized = validate_profile_update(GitHubUserProfileUpdate {
            name: "  Mona Lisa  ".to_string(),
            bio: "  Building Harbor.  ".to_string(),
            company: "  GitHub  ".to_string(),
            location: "  San Francisco  ".to_string(),
            blog: "  https://harbor.dev  ".to_string(),
            email: "  mona@example.com  ".to_string(),
            twitter_username: "  @monalisa  ".to_string(),
            hireable: true,
        })
        .expect("valid profile update");

        assert_eq!(normalized.name, "Mona Lisa");
        assert_eq!(normalized.bio, "Building Harbor.");
        assert_eq!(normalized.twitter_username, "monalisa");
        assert!(normalized.hireable);
        assert!(validate_profile_update(GitHubUserProfileUpdate {
            twitter_username: "invalid-user".to_string(),
            ..normalized
        })
        .is_err());
    }

    #[test]
    fn repository_path_normalizes_outer_slashes() {
        assert_eq!(
            validate_repository_path("/src/features/".to_string()).expect("valid path"),
            "src/features"
        );
        assert_eq!(validate_repository_path("/".to_string()).expect("root"), "");
    }

    #[test]
    fn repository_path_rejects_parent_segments() {
        assert!(validate_repository_path("src/../secrets".to_string()).is_err());
    }

    #[test]
    fn reference_allows_branch_paths_but_rejects_controls() {
        assert_eq!(
            validate_reference("feature/code-workspace".to_string()).expect("branch"),
            "feature/code-workspace"
        );
        assert!(validate_reference("main\nother".to_string()).is_err());
    }

    #[test]
    fn workflow_filters_are_optional_trimmed_and_bounded() {
        assert_eq!(
            validate_optional_workflow_filter(
                "  release/v1  ".to_string(),
                "workflow branch",
                512,
            )
            .expect("workflow branch"),
            "release/v1"
        );
        assert_eq!(
            validate_optional_workflow_filter(String::new(), "workflow actor", 100)
                .expect("empty actor"),
            ""
        );
        assert!(validate_optional_workflow_filter(
            "push\nworkflow_dispatch".to_string(),
            "workflow event",
            100,
        )
        .is_err());
        assert!(
            validate_optional_workflow_filter("x".repeat(101), "workflow actor", 100,).is_err()
        );
    }

    #[test]
    fn workflow_administration_inputs_are_bounded() {
        assert_eq!(
            validate_workflow_state(" disabled_inactivity ".to_string()).expect("workflow state"),
            "disabled_inactivity"
        );
        assert!(validate_workflow_state("unknown".to_string()).is_err());
        assert_eq!(
            validate_workflow_run_updated_at(" 2026-08-29T08:05:00Z ".to_string())
                .expect("run revision"),
            "2026-08-29T08:05:00Z"
        );
        assert!(validate_workflow_run_updated_at("\n".to_string()).is_err());
    }

    #[test]
    fn repository_file_path_rejects_the_repository_root() {
        assert!(validate_repository_file_path("/".to_string()).is_err());
        assert_eq!(
            validate_repository_file_path("/src/main.rs/".to_string()).expect("file path"),
            "src/main.rs"
        );
    }

    #[test]
    fn optional_fork_name_is_trimmed_and_repository_safe() {
        assert_eq!(
            validate_optional_fork_name(Some("  harbor-fork  ".to_string())).expect("fork name"),
            Some("harbor-fork".to_string())
        );
        assert_eq!(
            validate_optional_fork_name(Some("  ".to_string())).expect("default name"),
            None
        );
        assert!(validate_optional_fork_name(Some("org/repository".to_string())).is_err());
    }

    #[test]
    fn repository_creation_normalizes_personal_fields_and_requires_initialization_for_templates() {
        let input = GitHubRepositoryCreateInput {
            name: " harbor ".to_string(),
            description: Some(" focused workspace ".to_string()),
            homepage: Some(" https://harbor.dev ".to_string()),
            visibility: crate::github::repository_settings::GitHubRepositoryVisibility::Private,
            initialize_with_readme: true,
            gitignore_template: Some(" Rust ".to_string()),
            license_template: Some(" mit ".to_string()),
            has_issues: true,
            has_projects: true,
            has_wiki: false,
            has_discussions: false,
        };
        let normalized = validate_repository_create_input(input).expect("create input");
        assert_eq!(normalized.name, "harbor");
        assert_eq!(normalized.description.as_deref(), Some("focused workspace"));
        assert_eq!(normalized.homepage.as_deref(), Some("https://harbor.dev"));

        let mut invalid = normalized;
        invalid.initialize_with_readme = false;
        assert!(validate_repository_create_input(invalid).is_err());
    }

    #[test]
    fn repository_settings_validate_homepage_merge_methods_and_delete_confirmation() {
        assert_eq!(
            validate_optional_repository_homepage(Some(" https://harbor.dev/docs ".to_string()))
                .expect("homepage")
                .as_deref(),
            Some("https://harbor.dev/docs")
        );
        assert!(
            validate_optional_repository_homepage(Some("file:///tmp/harbor".to_string())).is_err()
        );
        assert_eq!(
            validate_repository_deletion_confirmation(" octocat/harbor ".to_string())
                .expect("confirmation"),
            "octocat/harbor"
        );
    }

    #[test]
    fn gist_identifiers_and_files_are_normalized_without_unsafe_paths() {
        assert_eq!(
            validate_gist_id(" ABC123 ".to_string()).expect("Gist ID"),
            "abc123"
        );
        assert!(validate_gist_id("gist/not-an-id".to_string()).is_err());
        assert_eq!(
            validate_gist_version("A".repeat(40)).expect("revision"),
            "a".repeat(40)
        );
        assert!(validate_gist_version("abc123".to_string()).is_err());
        assert_eq!(
            validate_gist_filename(" notes.md ".to_string()).expect("file"),
            "notes.md"
        );
        assert!(validate_gist_filename("src/notes.md".to_string()).is_err());
        assert!(validate_gist_filename("gistfile42".to_string()).is_err());
    }

    #[test]
    fn gist_inputs_require_unique_files_and_safe_comment_mutations() {
        let input = GitHubGistCreateInput {
            description: Some(" useful notes ".to_string()),
            public: false,
            files: vec![GitHubGistFileInput {
                filename: " notes.md ".to_string(),
                content: "# Notes".to_string(),
            }],
        };
        let normalized = validate_gist_create_input(input).expect("create Gist");
        assert_eq!(normalized.description.as_deref(), Some("useful notes"));
        assert_eq!(normalized.files[0].filename, "notes.md");

        let duplicate = GitHubGistCreateInput {
            description: None,
            public: true,
            files: vec![
                GitHubGistFileInput {
                    filename: "notes.md".to_string(),
                    content: String::new(),
                },
                GitHubGistFileInput {
                    filename: "notes.md".to_string(),
                    content: String::new(),
                },
            ],
        };
        assert!(validate_gist_create_input(duplicate).is_err());

        assert!(
            validate_gist_comment_mutation(GitHubGistCommentMutation::Create {
                body: "   ".to_string(),
            })
            .is_err()
        );
        assert!(
            validate_gist_comment_mutation(GitHubGistCommentMutation::Delete { comment_id: 0 })
                .is_err()
        );
    }

    #[test]
    fn issue_filters_trim_text_and_reject_invalid_pages() {
        assert_eq!(
            validate_issue_query("  rendering bug  ".to_string()).expect("query"),
            "rendering bug"
        );
        assert_eq!(
            validate_issue_label("  good first issue  ".to_string()).expect("label"),
            "good first issue"
        );
        assert!(validate_page(0).is_err());
        assert!(validate_page(1_001).is_err());
        assert_eq!(validate_issue_page(34).expect("last search page"), 34);
        assert!(validate_issue_page(35).is_err());
    }

    #[test]
    fn notification_identifiers_stay_inside_githubs_supported_range() {
        assert_eq!(validate_notification_page(1).expect("first page"), 1);
        assert_eq!(
            validate_notification_page(u8::MAX as u32).expect("last page"),
            u8::MAX as u32
        );
        assert!(validate_notification_page(0).is_err());
        assert!(validate_notification_page(u8::MAX as u32 + 1).is_err());
        assert_eq!(validate_notification_thread_id(42).expect("thread ID"), 42);
        assert!(validate_notification_thread_id(0).is_err());
    }

    #[test]
    fn commit_detail_requires_a_full_sha_and_bounded_file_page() {
        assert_eq!(
            validate_full_commit_sha(" aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ".to_string())
                .expect("full commit SHA"),
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );
        assert!(validate_full_commit_sha("abcdef1".to_string()).is_err());
        assert!(
            validate_full_commit_sha("gggggggggggggggggggggggggggggggggggggggg".to_string())
                .is_err()
        );
        assert_eq!(validate_commit_file_page(30).expect("last page"), 30);
        assert!(validate_commit_file_page(0).is_err());
        assert!(validate_commit_file_page(31).is_err());
    }

    #[test]
    fn developer_feed_pages_match_githubs_three_hundred_event_window() {
        assert_eq!(validate_developer_feed_page(1).expect("first page"), 1);
        assert_eq!(validate_developer_feed_page(10).expect("last page"), 10);
        assert!(validate_developer_feed_page(0).is_err());
        assert!(validate_developer_feed_page(11).is_err());
    }

    #[test]
    fn graphql_cursor_is_opaque_but_bounded() {
        let cursor = "Y3Vyc29yOnYyOpHOU0U=".to_string();
        assert_eq!(
            validate_graphql_cursor(Some(cursor.clone())).expect("cursor"),
            Some(cursor)
        );
        assert_eq!(validate_graphql_cursor(None).expect("first page"), None);
        assert!(validate_graphql_cursor(Some(String::new())).is_err());
        assert!(validate_graphql_cursor(Some("bad\ncursor".to_string())).is_err());
        assert!(validate_graphql_cursor(Some("x".repeat(1_025))).is_err());
    }

    #[test]
    fn graphql_node_id_is_trimmed_and_rejects_whitespace() {
        assert_eq!(
            validate_graphql_node_id("  PRRT_kwDOexample  ".to_string(), "review thread")
                .expect("node ID"),
            "PRRT_kwDOexample"
        );
        assert!(validate_graphql_node_id(String::new(), "review thread").is_err());
        assert!(validate_graphql_node_id("PRRT_bad id".to_string(), "review thread").is_err());
        assert!(validate_graphql_node_id("x".repeat(513), "review thread").is_err());
    }

    #[test]
    fn issue_comments_keep_markdown_whitespace_but_reject_blank_input() {
        let body = "  ```rust\nfn harbor() {}\n```  ";
        assert_eq!(validate_issue_comment(body).expect("comment"), body);
        assert!(validate_issue_comment(" \n\t ").is_err());
    }

    #[test]
    fn comment_mutations_validate_node_revision_and_body() {
        let mutation = validate_comment_mutation(GitHubCommentMutation::Update {
            comment_id: "  IC_kwDOexample  ".to_string(),
            expected_updated_at: " 2026-08-29T08:01:00Z ".to_string(),
            body: "  Markdown body  ".to_string(),
        })
        .expect("comment update");
        assert_eq!(mutation.comment_id(), "IC_kwDOexample");
        assert!(matches!(
            mutation,
            GitHubCommentMutation::Update {
                expected_updated_at,
                body,
                ..
            } if expected_updated_at == "2026-08-29T08:01:00Z" && body == "  Markdown body  "
        ));
        let empty = validate_comment_mutation(GitHubCommentMutation::Update {
            comment_id: "IC_kwDOexample".to_string(),
            expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
            body: String::new(),
        })
        .expect("explicit empty comment update");
        assert!(matches!(
            empty,
            GitHubCommentMutation::Update { body, .. } if body.is_empty()
        ));
        assert!(validate_comment_mutation(GitHubCommentMutation::Delete {
            comment_id: "bad node".to_string(),
            expected_updated_at: "not-a-revision".to_string(),
        })
        .is_err());
        let pin = validate_comment_mutation(GitHubCommentMutation::Pin {
            comment_id: "  IC_kwDOexample  ".to_string(),
            expected_updated_at: " 2026-08-29T08:01:00Z ".to_string(),
            expected_pinned: false,
        })
        .expect("comment pin");
        assert!(matches!(
            pin,
            GitHubCommentMutation::Pin {
                comment_id,
                expected_updated_at,
                expected_pinned: false,
            } if comment_id == "IC_kwDOexample" && expected_updated_at == "2026-08-29T08:01:00Z"
        ));
        assert!(validate_comment_mutation(GitHubCommentMutation::Pin {
            comment_id: "IC_kwDOexample".to_string(),
            expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
            expected_pinned: true,
        })
        .is_err());
        assert!(validate_comment_mutation(GitHubCommentMutation::Unpin {
            comment_id: "IC_kwDOexample".to_string(),
            expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
            expected_pinned: false,
        })
        .is_err());
        let minimize = validate_comment_mutation(GitHubCommentMutation::Minimize {
            comment_id: "  IC_kwDOexample  ".to_string(),
            expected_updated_at: " 2026-08-29T08:01:00Z ".to_string(),
            expected_minimized: false,
            classifier: GitHubCommentMinimizeClassifier::OffTopic,
        })
        .expect("comment minimize");
        assert!(matches!(
            minimize,
            GitHubCommentMutation::Minimize {
                comment_id,
                expected_updated_at,
                expected_minimized: false,
                classifier: GitHubCommentMinimizeClassifier::OffTopic,
            } if comment_id == "IC_kwDOexample" && expected_updated_at == "2026-08-29T08:01:00Z"
        ));
        assert!(validate_comment_mutation(GitHubCommentMutation::Minimize {
            comment_id: "IC_kwDOexample".to_string(),
            expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
            expected_minimized: true,
            classifier: GitHubCommentMinimizeClassifier::OffTopic,
        })
        .is_err());
        assert!(
            validate_comment_mutation(GitHubCommentMutation::Unminimize {
                comment_id: "IC_kwDOexample".to_string(),
                expected_updated_at: "2026-08-29T08:01:00Z".to_string(),
                expected_minimized: false,
            })
            .is_err()
        );
    }

    #[test]
    fn discussion_comment_mutations_validate_node_revision_and_state() {
        let mutation =
            validate_discussion_comment_mutation(GitHubDiscussionCommentMutation::Minimize {
                comment_id: " DC_kwDOexample ".to_string(),
                expected_updated_at: " 2026-08-30T08:00:00Z ".to_string(),
                expected_minimized: false,
                classifier: GitHubCommentMinimizeClassifier::OffTopic,
            })
            .expect("discussion comment minimize");
        assert!(matches!(
            mutation,
            GitHubDiscussionCommentMutation::Minimize {
                comment_id,
                expected_updated_at,
                expected_minimized: false,
                classifier: GitHubCommentMinimizeClassifier::OffTopic,
            } if comment_id == "DC_kwDOexample" && expected_updated_at == "2026-08-30T08:00:00Z"
        ));
        assert!(validate_discussion_comment_mutation(
            GitHubDiscussionCommentMutation::Unminimize {
                comment_id: "DC_kwDOexample".to_string(),
                expected_updated_at: "2026-08-30T08:00:00Z".to_string(),
                expected_minimized: false,
            },
        )
        .is_err());
    }

    #[test]
    fn issue_content_requires_a_title_and_preserves_markdown_body() {
        assert_eq!(
            validate_issue_title("  Rendering bug  ".to_string()).expect("title"),
            "Rendering bug"
        );
        assert!(validate_issue_title(" \n ".to_string()).is_err());
        let body = "## Steps\n\n1. Open Harbor\n".to_string();
        assert_eq!(validate_issue_body(body.clone()).expect("body"), body);
        assert_eq!(validate_issue_body(String::new()).expect("empty body"), "");
        assert!(validate_issue_body("before\0after".to_string()).is_err());
    }

    #[test]
    fn pull_request_merge_commit_content_is_optional_and_normalized() {
        assert_eq!(
            validate_optional_commit_title(Some("  Squash this change  ".to_string()))
                .expect("merge title"),
            Some("Squash this change".to_string())
        );
        assert_eq!(
            validate_optional_commit_title(Some(" \n ".to_string())).expect("empty title"),
            None
        );
        assert!(validate_optional_commit_title(Some("bad\ntitle".to_string())).is_err());
        let message = "Summary\n\nDetails stay intact.\n".to_string();
        assert_eq!(
            validate_optional_commit_message(Some(message.clone())).expect("merge message"),
            Some(message)
        );
        assert_eq!(
            validate_optional_commit_message(Some(" \n ".to_string())).expect("empty message"),
            None
        );
        assert!(validate_optional_commit_message(Some("bad\0message".to_string())).is_err());
    }

    #[test]
    fn issue_metadata_is_trimmed_deduplicated_and_bounded() {
        assert_eq!(
            validate_named_values(
                vec![
                    " bug ".to_string(),
                    "BUG".to_string(),
                    "help wanted".to_string()
                ],
                "label",
                100,
                128,
            )
            .expect("metadata"),
            ["bug", "help wanted"]
        );
        assert!(
            validate_named_values(vec!["hubot".to_string(); 11], "issue assignee", 10, 100,)
                .is_ok()
        );
        assert!(validate_named_values(
            (0..11).map(|index| format!("user-{index}")).collect(),
            "assignee",
            10,
            100,
        )
        .is_err());
        assert!(
            validate_named_values(vec!["bad\nlabel".to_string()], "issue label", 100, 128,)
                .is_err()
        );
    }

    #[test]
    fn pull_request_review_validation_matches_github_requirements() {
        assert!(ensure_reviewer_selection(&[], &[]).is_err());
        assert!(ensure_reviewer_selection(&["hubot".to_string()], &[]).is_ok());
        assert_eq!(
            validate_commit_id(" abc1234 ".to_string()).expect("commit id"),
            "abc1234"
        );
        assert!(validate_commit_id("not-a-sha".to_string()).is_err());
        assert_eq!(
            validate_pull_request_review_body(
                GitHubPullRequestReviewAction::Approve,
                String::new(),
            )
            .expect("blank approval"),
            ""
        );
        assert!(validate_pull_request_review_body(
            GitHubPullRequestReviewAction::Comment,
            " \n ".to_string(),
        )
        .is_err());
        assert!(validate_pull_request_review_body(
            GitHubPullRequestReviewAction::RequestChanges,
            " \n ".to_string(),
        )
        .is_err());
        assert_eq!(
            validate_pull_request_review_body(
                GitHubPullRequestReviewAction::RequestChanges,
                "Please add a regression test.".to_string(),
            )
            .expect("change request"),
            "Please add a regression test."
        );
        assert_eq!(
            validate_pull_request_review_dismissal_message(
                "  The approval applies to an earlier design.  ".to_string()
            )
            .expect("dismissal message"),
            "The approval applies to an earlier design."
        );
        assert!(validate_pull_request_review_dismissal_message(" \n ".to_string()).is_err());
        assert!(
            validate_pull_request_review_dismissal_message("invalid\0message".to_string()).is_err()
        );

        let comments =
            validate_pull_request_review_comments(vec![GitHubPullRequestReviewComment {
                path: "/src/review.rs/".to_string(),
                line: 42,
                side: crate::github::GitHubPullRequestReviewCommentSide::Right,
                start_line: Some(40),
                start_side: Some(crate::github::GitHubPullRequestReviewCommentSide::Right),
                body: "Please cover this branch.".to_string(),
            }])
            .expect("line comment");
        assert_eq!(comments[0].path, "src/review.rs");
        assert_eq!(comments[0].start_line, Some(40));
        assert!(
            validate_pull_request_review_comments(vec![GitHubPullRequestReviewComment {
                path: "src/review.rs".to_string(),
                line: 0,
                side: crate::github::GitHubPullRequestReviewCommentSide::Left,
                start_line: None,
                start_side: None,
                body: "Comment".to_string(),
            }])
            .is_err()
        );
        assert!(
            validate_pull_request_review_comments(vec![GitHubPullRequestReviewComment {
                path: "src/review.rs".to_string(),
                line: 42,
                side: crate::github::GitHubPullRequestReviewCommentSide::Right,
                start_line: Some(40),
                start_side: None,
                body: "Comment".to_string(),
            }])
            .is_err()
        );
        assert!(
            validate_pull_request_review_comments(vec![GitHubPullRequestReviewComment {
                path: "src/review.rs".to_string(),
                line: 42,
                side: crate::github::GitHubPullRequestReviewCommentSide::Right,
                start_line: Some(42),
                start_side: Some(crate::github::GitHubPullRequestReviewCommentSide::Right),
                body: "Comment".to_string(),
            }])
            .is_err()
        );
        assert!(validate_pull_request_review_comments(vec![
            GitHubPullRequestReviewComment {
                path: "src/review.rs".to_string(),
                line: 42,
                side: crate::github::GitHubPullRequestReviewCommentSide::Right,
                start_line: None,
                start_side: None,
                body: "First".to_string(),
            },
            GitHubPullRequestReviewComment {
                path: "src/review.rs".to_string(),
                line: 42,
                side: crate::github::GitHubPullRequestReviewCommentSide::Right,
                start_line: None,
                start_side: None,
                body: "Second".to_string(),
            },
        ])
        .is_err());
    }

    #[test]
    fn code_search_requires_a_bounded_non_empty_query() {
        assert_eq!(
            validate_code_search_query("  language:rust render  ".to_string())
                .expect("valid code query"),
            "language:rust render"
        );
        assert!(validate_code_search_query("   ".to_string()).is_err());
        assert!(validate_code_search_query("render\nrepo:other/project".to_string()).is_err());
    }
}
