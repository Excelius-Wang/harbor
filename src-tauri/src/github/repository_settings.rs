use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{
    authenticated_client, github_error, is_not_found, GitHubRepository, GitHubService,
    OctocrabGitHubClient,
};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubRepositoryVisibility {
    Public,
    Private,
}

impl GitHubRepositoryVisibility {
    fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Private => "private",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryLicenseTemplate {
    pub key: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryCreationOptions {
    pub gitignore_templates: Vec<String>,
    pub licenses: Vec<GitHubRepositoryLicenseTemplate>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryCreateInput {
    pub name: String,
    pub description: Option<String>,
    pub homepage: Option<String>,
    pub visibility: GitHubRepositoryVisibility,
    pub initialize_with_readme: bool,
    pub gitignore_template: Option<String>,
    pub license_template: Option<String>,
    pub has_issues: bool,
    pub has_projects: bool,
    pub has_wiki: bool,
    pub has_discussions: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositorySettings {
    pub repository: GitHubRepository,
    pub homepage: Option<String>,
    pub visibility: GitHubRepositoryVisibility,
    pub is_template: bool,
    pub has_issues: bool,
    pub has_projects: bool,
    pub has_wiki: bool,
    pub has_discussions: bool,
    pub allow_merge_commit: bool,
    pub allow_squash_merge: bool,
    pub allow_rebase_merge: bool,
    pub allow_auto_merge: bool,
    pub allow_update_branch: bool,
    pub delete_branch_on_merge: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositorySettingsUpdate {
    pub name: String,
    pub description: Option<String>,
    pub homepage: Option<String>,
    pub visibility: GitHubRepositoryVisibility,
    pub default_branch: String,
    pub archived: bool,
    pub is_template: bool,
    pub has_issues: bool,
    pub has_projects: bool,
    pub has_wiki: bool,
    pub has_discussions: bool,
    pub allow_merge_commit: bool,
    pub allow_squash_merge: bool,
    pub allow_rebase_merge: bool,
    pub allow_auto_merge: bool,
    pub allow_update_branch: bool,
    pub delete_branch_on_merge: bool,
    pub accept_visibility_change_consequences: bool,
    pub confirm_archive_change: bool,
}

#[async_trait]
pub(crate) trait GitHubRepositorySettingsClient: Send + Sync {
    async fn repository_creation_options(
        &self,
        token: &str,
    ) -> Result<GitHubRepositoryCreationOptions, AppError>;

    async fn create_personal_repository(
        &self,
        token: &str,
        input: &GitHubRepositoryCreateInput,
    ) -> Result<GitHubRepositorySettings, AppError>;

    async fn personal_repository_settings(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositorySettings, AppError>;

    async fn update_personal_repository_settings(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        update: &GitHubRepositorySettingsUpdate,
    ) -> Result<GitHubRepositorySettings, AppError>;

    async fn delete_personal_repository(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        expected_full_name: &str,
    ) -> Result<(), AppError>;
}

impl GitHubService {
    pub async fn repository_creation_options(
        &self,
    ) -> Result<GitHubRepositoryCreationOptions, AppError> {
        let token = self.load_access_token().await?;
        self.client.repository_creation_options(&token).await
    }

    pub async fn create_personal_repository(
        &self,
        input: &GitHubRepositoryCreateInput,
    ) -> Result<GitHubRepositorySettings, AppError> {
        let token = self.load_access_token().await?;
        self.client.create_personal_repository(&token, input).await
    }

    pub async fn personal_repository_settings(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositorySettings, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .personal_repository_settings(&token, owner, repository)
            .await
    }

    pub async fn update_personal_repository_settings(
        &self,
        owner: &str,
        repository: &str,
        update: &GitHubRepositorySettingsUpdate,
    ) -> Result<GitHubRepositorySettings, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_personal_repository_settings(&token, owner, repository, update)
            .await
    }

    pub async fn delete_personal_repository(
        &self,
        owner: &str,
        repository: &str,
        expected_full_name: &str,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_personal_repository(&token, owner, repository, expected_full_name)
            .await
    }
}

#[derive(Deserialize)]
struct RawRepositoryOwner {
    login: String,
}

#[derive(Deserialize)]
struct RawRepositorySettings {
    id: u64,
    owner: RawRepositoryOwner,
    name: String,
    full_name: String,
    description: Option<String>,
    html_url: Option<String>,
    language: Option<String>,
    #[serde(default)]
    stargazers_count: u32,
    #[serde(default)]
    forks_count: u32,
    #[serde(default)]
    open_issues_count: u32,
    #[serde(default = "head_reference")]
    default_branch: String,
    #[serde(default)]
    private: bool,
    #[serde(default)]
    fork: bool,
    #[serde(default)]
    archived: bool,
    updated_at: Option<String>,
    homepage: Option<String>,
    visibility: Option<String>,
    #[serde(default)]
    is_template: bool,
    #[serde(default)]
    has_issues: bool,
    #[serde(default)]
    has_projects: bool,
    #[serde(default)]
    has_wiki: bool,
    #[serde(default)]
    has_discussions: bool,
    allow_merge_commit: Option<bool>,
    allow_squash_merge: Option<bool>,
    allow_rebase_merge: Option<bool>,
    #[serde(default)]
    allow_auto_merge: bool,
    #[serde(default)]
    allow_update_branch: bool,
    #[serde(default)]
    delete_branch_on_merge: bool,
}

#[derive(Deserialize)]
struct RawLicenseTemplate {
    key: String,
    name: String,
}

#[derive(Serialize)]
struct CreateRepositoryRequest<'a> {
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    homepage: Option<&'a str>,
    private: bool,
    has_issues: bool,
    has_projects: bool,
    has_wiki: bool,
    has_discussions: bool,
    auto_init: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    gitignore_template: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    license_template: Option<&'a str>,
}

#[derive(Serialize)]
struct UpdateRepositoryRequest<'a> {
    name: &'a str,
    description: Option<&'a str>,
    homepage: Option<&'a str>,
    visibility: &'static str,
    default_branch: &'a str,
    archived: bool,
    is_template: bool,
    has_issues: bool,
    has_projects: bool,
    has_wiki: bool,
    has_discussions: bool,
    allow_merge_commit: bool,
    allow_squash_merge: bool,
    allow_rebase_merge: bool,
    allow_auto_merge: bool,
    allow_update_branch: bool,
    delete_branch_on_merge: bool,
}

#[async_trait]
impl GitHubRepositorySettingsClient for OctocrabGitHubClient {
    async fn repository_creation_options(
        &self,
        token: &str,
    ) -> Result<GitHubRepositoryCreationOptions, AppError> {
        let client = authenticated_client(token)?;
        fetch_repository_creation_options(&client).await
    }

    async fn create_personal_repository(
        &self,
        token: &str,
        input: &GitHubRepositoryCreateInput,
    ) -> Result<GitHubRepositorySettings, AppError> {
        ensure_repository_initialization(input)?;
        let client = authenticated_client(token)?;
        let current_user = client.current();
        let viewer = current_user.user();
        let options = fetch_repository_creation_options(&client);
        let (viewer, options) = tokio::join!(viewer, options);
        let viewer = viewer.map_err(github_error)?;
        ensure_creation_template_selection(input, &options?)?;
        let response: RawRepositorySettings = client
            .post(
                "/user/repos",
                Some(&CreateRepositoryRequest {
                    name: &input.name,
                    description: input.description.as_deref(),
                    homepage: input.homepage.as_deref(),
                    private: input.visibility == GitHubRepositoryVisibility::Private,
                    has_issues: input.has_issues,
                    has_projects: input.has_projects,
                    has_wiki: input.has_wiki,
                    has_discussions: input.has_discussions,
                    auto_init: input.initialize_with_readme,
                    gitignore_template: input.gitignore_template.as_deref(),
                    license_template: input.license_template.as_deref(),
                }),
            )
            .await
            .map_err(github_error)?;
        let settings = repository_settings(response)?;
        ensure_personal_settings(&settings, &viewer.login)?;
        Ok(settings)
    }

    async fn personal_repository_settings(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubRepositorySettings, AppError> {
        let client = authenticated_client(token)?;
        fetch_personal_repository_settings(&client, owner, repository).await
    }

    async fn update_personal_repository_settings(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        update: &GitHubRepositorySettingsUpdate,
    ) -> Result<GitHubRepositorySettings, AppError> {
        let client = authenticated_client(token)?;
        let current = fetch_personal_repository_settings(&client, owner, repository).await?;
        ensure_settings_update(&current, update)?;
        if update.default_branch != current.repository.default_branch {
            client
                .repos(owner, repository)
                .get_ref(&octocrab::params::repos::Reference::Branch(
                    update.default_branch.clone(),
                ))
                .await
                .map_err(github_error)?;
        }
        let response: RawRepositorySettings = client
            .patch(
                repository_route(owner, repository),
                Some(&UpdateRepositoryRequest {
                    name: &update.name,
                    description: update.description.as_deref(),
                    homepage: update.homepage.as_deref(),
                    visibility: update.visibility.as_str(),
                    default_branch: &update.default_branch,
                    archived: update.archived,
                    is_template: update.is_template,
                    has_issues: update.has_issues,
                    has_projects: update.has_projects,
                    has_wiki: update.has_wiki,
                    has_discussions: update.has_discussions,
                    allow_merge_commit: update.allow_merge_commit,
                    allow_squash_merge: update.allow_squash_merge,
                    allow_rebase_merge: update.allow_rebase_merge,
                    allow_auto_merge: update.allow_auto_merge,
                    allow_update_branch: update.allow_update_branch,
                    delete_branch_on_merge: update.delete_branch_on_merge,
                }),
            )
            .await
            .map_err(github_error)?;
        let settings = repository_settings(response)?;
        ensure_personal_settings(&settings, owner)?;
        ensure_settings_response(&current, &settings, update)?;
        Ok(settings)
    }

    async fn delete_personal_repository(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        expected_full_name: &str,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let current = fetch_personal_repository_settings(&client, owner, repository).await?;
        ensure_deletion_confirmation(&current, expected_full_name)?;
        match client.repos(owner, repository).delete().await {
            Ok(()) => Ok(()),
            Err(error) if is_not_found(&error) => Err(AppError::GitHubPermission(
                "repository deletion requires the delete_repo OAuth scope".to_string(),
            )),
            Err(error) => Err(github_error(error)),
        }
    }
}

pub(super) async fn fetch_personal_repository_settings(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubRepositorySettings, AppError> {
    let current_user = client.current();
    let viewer = current_user.user();
    let raw = client.get(repository_route(owner, repository), None::<&()>);
    let (viewer, raw): (
        octocrab::Result<octocrab::models::Author>,
        octocrab::Result<RawRepositorySettings>,
    ) = tokio::join!(viewer, raw);
    let viewer = viewer.map_err(github_error)?;
    let settings = repository_settings(raw.map_err(github_error)?)?;
    ensure_personal_settings(&settings, &viewer.login)?;
    Ok(settings)
}

async fn fetch_repository_creation_options(
    client: &octocrab::Octocrab,
) -> Result<GitHubRepositoryCreationOptions, AppError> {
    let gitignore_templates = client.get("/gitignore/templates", None::<&()>);
    let licenses = client.get("/licenses", None::<&()>);
    let (gitignore_templates, licenses): (
        octocrab::Result<Vec<String>>,
        octocrab::Result<Vec<RawLicenseTemplate>>,
    ) = tokio::join!(gitignore_templates, licenses);
    Ok(repository_creation_options(
        gitignore_templates.map_err(github_error)?,
        licenses.map_err(github_error)?,
    ))
}

fn repository_settings(raw: RawRepositorySettings) -> Result<GitHubRepositorySettings, AppError> {
    let visibility = match raw.visibility.as_deref() {
        Some("public") => GitHubRepositoryVisibility::Public,
        Some("private") | None if raw.private => GitHubRepositoryVisibility::Private,
        None => GitHubRepositoryVisibility::Public,
        Some(visibility) => {
            return Err(AppError::GitHubPermission(format!(
                "repository visibility {visibility} is outside Harbor's personal scope"
            )))
        }
    };
    let url = raw
        .html_url
        .unwrap_or_else(|| format!("https://github.com/{}", raw.full_name));
    Ok(GitHubRepositorySettings {
        repository: GitHubRepository {
            id: raw.id,
            owner: raw.owner.login,
            name: raw.name,
            full_name: raw.full_name,
            description: raw.description,
            url,
            language: raw.language,
            stars: raw.stargazers_count,
            forks: raw.forks_count,
            open_issues: raw.open_issues_count,
            default_branch: raw.default_branch,
            is_private: raw.private,
            is_fork: raw.fork,
            is_archived: raw.archived,
            updated_at: raw.updated_at,
        },
        homepage: raw.homepage,
        visibility,
        is_template: raw.is_template,
        has_issues: raw.has_issues,
        has_projects: raw.has_projects,
        has_wiki: raw.has_wiki,
        has_discussions: raw.has_discussions,
        allow_merge_commit: raw.allow_merge_commit.unwrap_or(true),
        allow_squash_merge: raw.allow_squash_merge.unwrap_or(true),
        allow_rebase_merge: raw.allow_rebase_merge.unwrap_or(true),
        allow_auto_merge: raw.allow_auto_merge,
        allow_update_branch: raw.allow_update_branch,
        delete_branch_on_merge: raw.delete_branch_on_merge,
    })
}

fn repository_creation_options(
    mut gitignore_templates: Vec<String>,
    licenses: Vec<RawLicenseTemplate>,
) -> GitHubRepositoryCreationOptions {
    gitignore_templates.sort_by_key(|template| template.to_ascii_lowercase());
    gitignore_templates.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    let mut licenses = licenses
        .into_iter()
        .map(|license| GitHubRepositoryLicenseTemplate {
            key: license.key,
            name: license.name,
        })
        .collect::<Vec<_>>();
    licenses.sort_by_key(|license| license.key.to_ascii_lowercase());
    licenses.dedup_by(|left, right| left.key.eq_ignore_ascii_case(&right.key));
    licenses.sort_by_key(|license| license.name.to_ascii_lowercase());
    GitHubRepositoryCreationOptions {
        gitignore_templates,
        licenses,
    }
}

fn ensure_repository_initialization(input: &GitHubRepositoryCreateInput) -> Result<(), AppError> {
    if !input.initialize_with_readme
        && (input.gitignore_template.is_some() || input.license_template.is_some())
    {
        return Err(AppError::Validation(
            "a gitignore or license template requires repository initialization".to_string(),
        ));
    }
    Ok(())
}

fn ensure_creation_template_selection(
    input: &GitHubRepositoryCreateInput,
    options: &GitHubRepositoryCreationOptions,
) -> Result<(), AppError> {
    if input.gitignore_template.as_ref().is_some_and(|selected| {
        !options
            .gitignore_templates
            .iter()
            .any(|template| template == selected)
    }) {
        return Err(AppError::Validation(
            "gitignore template is not available from GitHub".to_string(),
        ));
    }
    if input.license_template.as_ref().is_some_and(|selected| {
        !options
            .licenses
            .iter()
            .any(|license| license.key == *selected)
    }) {
        return Err(AppError::Validation(
            "license template is not available from GitHub".to_string(),
        ));
    }
    Ok(())
}

fn ensure_personal_settings(
    settings: &GitHubRepositorySettings,
    viewer: &str,
) -> Result<(), AppError> {
    if !settings.repository.owner.eq_ignore_ascii_case(viewer) {
        return Err(AppError::GitHubPermission(
            "repository settings are limited to the signed-in personal account".to_string(),
        ));
    }
    Ok(())
}

fn ensure_settings_update(
    current: &GitHubRepositorySettings,
    update: &GitHubRepositorySettingsUpdate,
) -> Result<(), AppError> {
    if current.visibility != update.visibility && !update.accept_visibility_change_consequences {
        return Err(AppError::Validation(
            "repository visibility changes require explicit consequence acceptance".to_string(),
        ));
    }
    if current.repository.is_archived != update.archived && !update.confirm_archive_change {
        return Err(AppError::Validation(
            "repository archive changes require confirmation".to_string(),
        ));
    }
    if !update.allow_merge_commit && !update.allow_squash_merge && !update.allow_rebase_merge {
        return Err(AppError::Validation(
            "at least one pull request merge method must remain enabled".to_string(),
        ));
    }
    Ok(())
}

fn ensure_settings_response(
    current: &GitHubRepositorySettings,
    returned: &GitHubRepositorySettings,
    update: &GitHubRepositorySettingsUpdate,
) -> Result<(), AppError> {
    let matches = returned.repository.id == current.repository.id
        && returned.repository.name == update.name
        && returned.repository.description == update.description
        && returned.homepage == update.homepage
        && returned.visibility == update.visibility
        && returned.repository.default_branch == update.default_branch
        && returned.repository.is_archived == update.archived
        && returned.is_template == update.is_template
        && returned.has_issues == update.has_issues
        && returned.has_projects == update.has_projects
        && returned.has_wiki == update.has_wiki
        && returned.has_discussions == update.has_discussions
        && returned.allow_merge_commit == update.allow_merge_commit
        && returned.allow_squash_merge == update.allow_squash_merge
        && returned.allow_rebase_merge == update.allow_rebase_merge
        && returned.allow_auto_merge == update.allow_auto_merge
        && returned.allow_update_branch == update.allow_update_branch
        && returned.delete_branch_on_merge == update.delete_branch_on_merge;
    if !matches {
        return Err(AppError::GitHubPermission(
            "GitHub did not apply every requested repository setting".to_string(),
        ));
    }
    Ok(())
}

fn ensure_deletion_confirmation(
    current: &GitHubRepositorySettings,
    expected_full_name: &str,
) -> Result<(), AppError> {
    if current.repository.full_name != expected_full_name {
        return Err(AppError::Validation(
            "repository deletion confirmation does not match the current repository".to_string(),
        ));
    }
    Ok(())
}

fn repository_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}")
}

fn head_reference() -> String {
    "HEAD".to_string()
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[async_trait]
impl GitHubRepositorySettingsClient for super::tests::FakeGitHubClient {
    async fn repository_creation_options(
        &self,
        token: &str,
    ) -> Result<GitHubRepositoryCreationOptions, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubRepositoryCreationOptions {
            gitignore_templates: vec!["Rust".to_string()],
            licenses: vec![GitHubRepositoryLicenseTemplate {
                key: "mit".to_string(),
                name: "MIT License".to_string(),
            }],
        })
    }

    async fn create_personal_repository(
        &self,
        _token: &str,
        _input: &GitHubRepositoryCreateInput,
    ) -> Result<GitHubRepositorySettings, AppError> {
        Err(AppError::GitHub(
            "repository creation fixture is unavailable".to_string(),
        ))
    }

    async fn personal_repository_settings(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
    ) -> Result<GitHubRepositorySettings, AppError> {
        Err(AppError::GitHub(
            "repository settings fixture is unavailable".to_string(),
        ))
    }

    async fn update_personal_repository_settings(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _update: &GitHubRepositorySettingsUpdate,
    ) -> Result<GitHubRepositorySettings, AppError> {
        Err(AppError::GitHub(
            "repository settings fixture is unavailable".to_string(),
        ))
    }

    async fn delete_personal_repository(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _expected_full_name: &str,
    ) -> Result<(), AppError> {
        Err(AppError::GitHub(
            "repository deletion fixture is unavailable".to_string(),
        ))
    }
}
