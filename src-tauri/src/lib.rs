mod app_state;
mod commands;
mod error;
mod github;
mod github_oauth;
mod plugins;
mod repository_context;

use tauri::{Emitter, Manager};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::{
    app_state::AppState,
    github::GitHubAuthEvent,
    github_oauth::{is_github_oauth_callback, GITHUB_AUTH_EVENT},
};

fn complete_github_login(app: tauri::AppHandle, callback_url: String) {
    if !is_github_oauth_callback(&callback_url) {
        return;
    }
    let github = app.state::<AppState>().github.clone();
    tauri::async_runtime::spawn(async move {
        let event = match github.complete_login(&callback_url).await {
            Ok(connection) => GitHubAuthEvent::Connected { connection },
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
}

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
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    complete_github_login(app_handle.clone(), url.to_string());
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                for url in urls {
                    complete_github_login(app.handle().clone(), url.to_string());
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(plugins::system_tray::init())
        .invoke_handler(tauri::generate_handler![
            update_tray_menu,
            commands::github_begin_login,
            commands::github_login_availability,
            commands::github_connection_status,
            commands::github_disconnect,
            commands::github_list_repositories,
            commands::github_list_repository_issues,
            commands::github_get_repository_code_overview,
            commands::github_list_repository_contents,
            commands::repository_context_ask,
        ]);

    // Only enable updater in release mode
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
