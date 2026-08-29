mod app_state;
mod commands;
mod error;
mod github;
mod github_oauth;
mod plugins;
mod repository_context;

use tauri::Manager;

#[tauri::command]
fn update_tray_menu(
    app: tauri::AppHandle,
    show_text: String,
    quit_text: String,
) -> Result<(), String> {
    plugins::system_tray::update_tray_menu(&app, &show_text, &quit_text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(app_state::AppState::default())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When attempting to start a second instance, focus the existing main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(plugins::system_tray::init())
        .invoke_handler(tauri::generate_handler![
            update_tray_menu,
            commands::github_begin_login,
            commands::github_login_availability,
            commands::github_connection_status,
            commands::github_disconnect,
            commands::github_search_discovery,
            commands::github_list_developer_feed,
            commands::github_get_user_profile,
            commands::github_update_personal_profile,
            commands::github_get_user_contributions,
            commands::github_list_profile_connections,
            commands::github_list_profile_activity,
            commands::github_update_user_follow,
            commands::github_list_repositories,
            commands::github_list_starred_repositories,
            commands::github_get_repository_relationship,
            commands::github_update_repository_star,
            commands::github_update_repository_watch,
            commands::github_fork_repository,
            commands::github_get_repository_creation_options,
            commands::github_create_personal_repository,
            commands::github_get_personal_repository_settings,
            commands::github_update_personal_repository_settings,
            commands::github_delete_personal_repository,
            commands::github_list_gists,
            commands::github_get_gist,
            commands::github_list_gist_revisions,
            commands::github_get_gist_revision,
            commands::github_list_gist_comments,
            commands::github_create_gist,
            commands::github_update_gist,
            commands::github_delete_gist,
            commands::github_update_gist_star,
            commands::github_fork_gist,
            commands::github_mutate_gist_comment,
            commands::github_list_notifications,
            commands::github_update_notification,
            commands::github_mark_all_notifications_read,
            commands::github_list_personal_projects,
            commands::github_get_personal_project,
            commands::github_create_personal_project,
            commands::github_update_personal_project,
            commands::github_delete_personal_project,
            commands::github_add_personal_project_item,
            commands::github_update_personal_project_item,
            commands::github_change_personal_project_item,
            commands::github_list_repository_security_alerts,
            commands::github_get_repository_security_alert,
            commands::github_list_repository_code_scanning_instances,
            commands::github_list_repository_secret_scanning_locations,
            commands::github_update_repository_security_alert,
            commands::github_list_repository_discussion_categories,
            commands::github_list_repository_discussions,
            commands::github_get_repository_discussion,
            commands::github_create_repository_discussion,
            commands::github_update_repository_discussion,
            commands::github_create_repository_discussion_comment,
            commands::github_update_repository_discussion_comment,
            commands::github_update_repository_discussion_state,
            commands::github_update_repository_discussion_upvote,
            commands::github_update_repository_discussion_answer,
            commands::github_add_repository_discussion_poll_vote,
            commands::github_delete_repository_discussion,
            commands::github_delete_repository_discussion_comment,
            commands::github_list_repository_releases,
            commands::github_get_repository_release,
            commands::github_download_repository_release_asset,
            commands::github_download_repository_release_archive,
            commands::github_create_repository_release,
            commands::github_update_repository_release,
            commands::github_delete_repository_release,
            commands::github_upload_repository_release_asset,
            commands::github_delete_repository_release_asset,
            commands::github_list_repository_issues,
            commands::github_list_issue_inbox,
            commands::github_list_repository_issue_labels,
            commands::github_list_repository_issue_assignees,
            commands::github_list_repository_issue_milestones,
            commands::github_get_repository_issue,
            commands::github_create_repository_issue,
            commands::github_update_repository_issue,
            commands::github_update_repository_issue_metadata,
            commands::github_create_repository_issue_comment,
            commands::github_update_repository_issue_state,
            commands::github_list_repository_pull_requests,
            commands::github_list_pull_request_inbox,
            commands::github_get_repository_pull_request,
            commands::github_compare_repository_pull_request_branches,
            commands::github_create_repository_pull_request,
            commands::github_update_repository_pull_request,
            commands::github_update_repository_pull_request_state,
            commands::github_update_repository_pull_request_draft_state,
            commands::github_update_repository_pull_request_metadata,
            commands::github_list_repository_pull_request_review_teams,
            commands::github_request_repository_pull_request_reviewers,
            commands::github_remove_repository_pull_request_reviewers,
            commands::github_merge_repository_pull_request,
            commands::github_get_repository_pull_request_auto_merge_status,
            commands::github_enable_repository_pull_request_auto_merge,
            commands::github_disable_repository_pull_request_auto_merge,
            commands::github_get_repository_pull_request_merge_queue_status,
            commands::github_enqueue_repository_pull_request,
            commands::github_dequeue_repository_pull_request,
            commands::github_get_repository_pull_request_branch_update_status,
            commands::github_update_repository_pull_request_branch,
            commands::github_create_repository_pull_request_comment,
            commands::github_create_repository_pull_request_review,
            commands::github_get_pending_repository_pull_request_review,
            commands::github_save_pending_repository_pull_request_review,
            commands::github_save_pending_repository_pull_request_review_comment,
            commands::github_delete_pending_repository_pull_request_review_comment,
            commands::github_submit_pending_repository_pull_request_review,
            commands::github_delete_pending_repository_pull_request_review,
            commands::github_list_pull_request_commits,
            commands::github_list_pull_request_files,
            commands::github_list_pull_request_review_threads,
            commands::github_reply_to_pull_request_review_thread,
            commands::github_resolve_pull_request_review_thread,
            commands::github_unresolve_pull_request_review_thread,
            commands::github_list_repository_checks,
            commands::github_get_repository_check_suite,
            commands::github_list_repository_check_suite_runs,
            commands::github_list_repository_workflows,
            commands::github_get_repository_workflow_run,
            commands::github_list_repository_workflow_runs,
            commands::github_get_workflow_run_filter_options,
            commands::github_get_workflow_dispatch_options,
            commands::github_get_workflow_dispatch_config,
            commands::github_dispatch_workflow,
            commands::github_list_workflow_run_jobs,
            commands::github_list_workflow_run_artifacts,
            commands::github_download_workflow_artifact,
            commands::github_get_workflow_job_log,
            commands::github_request_workflow_run_action,
            commands::github_request_workflow_job_rerun,
            commands::github_get_repository_code_overview,
            commands::github_get_repository_insights_overview,
            commands::github_get_repository_insights_contributors,
            commands::github_get_repository_insights_traffic,
            commands::github_list_repository_commits,
            commands::github_list_repository_tags,
            commands::github_get_repository_blame,
            commands::github_search_repository_code,
            commands::github_list_repository_contents,
            commands::github_get_repository_file,
            commands::github_download_repository_file,
            commands::github_commit_repository_file,
            commands::github_create_repository_branch,
            commands::github_delete_repository_branch,
            commands::repository_context_ask,
        ]);

    // Only enable updater in release mode
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
