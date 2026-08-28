use serde_json::json;

use super::*;

fn raw_repository(owner: &str) -> RawRepositorySettings {
    serde_json::from_value(json!({
        "id": 42,
        "owner": { "login": owner },
        "name": "harbor",
        "full_name": format!("{owner}/harbor"),
        "description": "A focused GitHub workspace",
        "html_url": format!("https://github.com/{owner}/harbor"),
        "language": "Rust",
        "stargazers_count": 12,
        "forks_count": 3,
        "open_issues_count": 4,
        "default_branch": "main",
        "private": true,
        "fork": false,
        "archived": false,
        "updated_at": "2026-08-28T08:00:00Z",
        "homepage": "https://harbor.dev",
        "visibility": "private",
        "is_template": false,
        "has_issues": true,
        "has_projects": true,
        "has_wiki": false,
        "has_discussions": true,
        "allow_merge_commit": true,
        "allow_squash_merge": true,
        "allow_rebase_merge": false,
        "allow_auto_merge": true,
        "allow_update_branch": true,
        "delete_branch_on_merge": true
    }))
    .expect("repository settings fixture")
}

fn update() -> GitHubRepositorySettingsUpdate {
    GitHubRepositorySettingsUpdate {
        name: "harbor".to_string(),
        description: Some("A focused GitHub workspace".to_string()),
        homepage: Some("https://harbor.dev".to_string()),
        visibility: GitHubRepositoryVisibility::Private,
        default_branch: "main".to_string(),
        archived: false,
        is_template: false,
        has_issues: true,
        has_projects: true,
        has_wiki: false,
        has_discussions: true,
        allow_merge_commit: true,
        allow_squash_merge: true,
        allow_rebase_merge: false,
        allow_auto_merge: true,
        allow_update_branch: true,
        delete_branch_on_merge: true,
        accept_visibility_change_consequences: false,
        confirm_archive_change: false,
    }
}

#[test]
fn settings_mapping_keeps_personal_repository_controls() {
    let settings = repository_settings(raw_repository("octocat")).expect("settings");
    assert_eq!(settings.repository.full_name, "octocat/harbor");
    assert_eq!(settings.visibility, GitHubRepositoryVisibility::Private);
    assert!(settings.has_discussions);
    assert!(settings.allow_auto_merge);
    assert!(settings.allow_update_branch);
    assert!(settings.delete_branch_on_merge);
}

#[test]
fn owner_guard_rejects_organization_or_other_user_settings() {
    let settings = repository_settings(raw_repository("github")).expect("settings");
    assert!(ensure_personal_settings(&settings, "octocat").is_err());
    assert!(ensure_personal_settings(&settings, "GitHub").is_ok());
}

#[test]
fn visibility_archive_and_merge_method_changes_require_explicit_guards() {
    let current = repository_settings(raw_repository("octocat")).expect("settings");
    let mut changed = update();
    changed.visibility = GitHubRepositoryVisibility::Public;
    assert!(ensure_settings_update(&current, &changed).is_err());
    changed.accept_visibility_change_consequences = true;
    assert!(ensure_settings_update(&current, &changed).is_ok());

    changed.visibility = GitHubRepositoryVisibility::Private;
    changed.archived = true;
    assert!(ensure_settings_update(&current, &changed).is_err());
    changed.confirm_archive_change = true;
    assert!(ensure_settings_update(&current, &changed).is_ok());

    changed.allow_merge_commit = false;
    changed.allow_squash_merge = false;
    changed.allow_rebase_merge = false;
    assert!(ensure_settings_update(&current, &changed).is_err());
}

#[test]
fn response_verification_rejects_silently_dropped_settings() {
    let current = repository_settings(raw_repository("octocat")).expect("settings");
    let requested = update();
    assert!(ensure_settings_response(&current, &current, &requested).is_ok());
    let mut stale = repository_settings(raw_repository("octocat")).expect("settings");
    stale.allow_auto_merge = false;
    assert!(ensure_settings_response(&current, &stale, &requested).is_err());
}

#[test]
fn creation_options_are_sorted_and_deduplicated() {
    let options = repository_creation_options(
        vec!["Rust".into(), "C++".into(), "rust".into()],
        vec![
            RawLicenseTemplate {
                key: "mit".into(),
                name: "MIT License".into(),
            },
            RawLicenseTemplate {
                key: "apache-2.0".into(),
                name: "Apache License 2.0".into(),
            },
            RawLicenseTemplate {
                key: "MIT".into(),
                name: "MIT duplicate".into(),
            },
        ],
    );
    assert_eq!(options.gitignore_templates, ["C++", "Rust"]);
    assert_eq!(
        options
            .licenses
            .iter()
            .map(|license| license.key.as_str())
            .collect::<Vec<_>>(),
        ["apache-2.0", "mit"]
    );
}

#[test]
fn template_initialization_and_deletion_confirmation_are_safe() {
    let mut input = GitHubRepositoryCreateInput {
        name: "harbor".into(),
        description: None,
        homepage: None,
        visibility: GitHubRepositoryVisibility::Private,
        initialize_with_readme: false,
        gitignore_template: Some("Rust".into()),
        license_template: None,
        has_issues: true,
        has_projects: true,
        has_wiki: false,
        has_discussions: false,
    };
    assert!(ensure_repository_initialization(&input).is_err());
    input.initialize_with_readme = true;
    assert!(ensure_repository_initialization(&input).is_ok());
    let options = GitHubRepositoryCreationOptions {
        gitignore_templates: vec!["Rust".into()],
        licenses: vec![GitHubRepositoryLicenseTemplate {
            key: "mit".into(),
            name: "MIT License".into(),
        }],
    };
    assert!(ensure_creation_template_selection(&input, &options).is_ok());
    input.gitignore_template = Some("Unknown".into());
    assert!(ensure_creation_template_selection(&input, &options).is_err());

    let settings = repository_settings(raw_repository("octocat")).expect("settings");
    assert!(ensure_deletion_confirmation(&settings, "octocat/harbor").is_ok());
    assert!(ensure_deletion_confirmation(&settings, "octocat/other").is_err());
}
