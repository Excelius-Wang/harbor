use async_trait::async_trait;
use http::StatusCode;
use octocrab::FromResponse;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{
    authenticated_client, github_error, repository_settings::fetch_personal_repository_settings,
    GitHubService, OctocrabGitHubClient,
};

const PAGES_BUILD_PAGE_SIZE: u8 = 10;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPagesBuildType {
    Legacy,
    Workflow,
}

impl GitHubPagesBuildType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Legacy => "legacy",
            Self::Workflow => "workflow",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPagesSourcePath {
    Root,
    Docs,
}

impl GitHubPagesSourcePath {
    fn as_api_path(self) -> &'static str {
        match self {
            Self::Root => "/",
            Self::Docs => "/docs",
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesConfiguration {
    pub build_type: GitHubPagesBuildType,
    pub branch: Option<String>,
    pub source_path: Option<GitHubPagesSourcePath>,
    pub custom_domain: Option<String>,
    pub https_enforced: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitHubPagesMutation {
    Configure {
        configuration: GitHubPagesConfiguration,
    },
    RequestBuild,
    Disable {
        confirmation: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesSource {
    pub branch: String,
    pub path: GitHubPagesSourcePath,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesCertificate {
    pub state: String,
    pub description: Option<String>,
    pub domains: Vec<String>,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesSite {
    pub status: String,
    pub url: String,
    pub build_type: GitHubPagesBuildType,
    pub source: Option<GitHubPagesSource>,
    pub custom_domain: Option<String>,
    pub custom_404: bool,
    pub public: bool,
    pub https_enforced: bool,
    pub certificate: Option<GitHubPagesCertificate>,
    pub protected_domain_state: Option<String>,
    pub pending_domain_unverified_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesBuild {
    pub url: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub pusher: Option<String>,
    pub pusher_avatar_url: Option<String>,
    pub commit: Option<String>,
    pub duration_milliseconds: Option<u64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesWorkspace {
    pub site: Option<GitHubPagesSite>,
    pub builds: Vec<GitHubPagesBuild>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
    pub is_archived: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesDomainHealth {
    pub host: Option<String>,
    pub uri: Option<String>,
    pub dns_resolves: bool,
    pub proxied: bool,
    pub valid: bool,
    pub reason: Option<String>,
    pub responds_to_https: bool,
    pub enforces_https: bool,
    pub https_eligible: bool,
    pub https_error: Option<String>,
    pub caa_error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPagesHealth {
    pub pending: bool,
    pub domain: Option<GitHubPagesDomainHealth>,
    pub alternate_domain: Option<GitHubPagesDomainHealth>,
}

#[async_trait]
pub(crate) trait GitHubRepositoryPagesClient: Send + Sync {
    async fn repository_pages(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubPagesWorkspace, AppError>;

    async fn repository_pages_health(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPagesHealth, AppError>;

    async fn mutate_repository_pages(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubPagesMutation,
    ) -> Result<GitHubPagesWorkspace, AppError>;
}

impl GitHubService {
    pub async fn repository_pages(
        &self,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubPagesWorkspace, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_pages(&token, owner, repository, page)
            .await
    }

    pub async fn repository_pages_health(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPagesHealth, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_pages_health(&token, owner, repository)
            .await
    }

    pub async fn mutate_repository_pages(
        &self,
        owner: &str,
        repository: &str,
        mutation: GitHubPagesMutation,
    ) -> Result<GitHubPagesWorkspace, AppError> {
        let mutation = normalize_pages_mutation(mutation)?;
        let token = self.load_access_token().await?;
        self.client
            .mutate_repository_pages(&token, owner, repository, &mutation)
            .await
    }
}

#[derive(Deserialize)]
struct RawPagesSource {
    branch: String,
    path: String,
}

#[derive(Deserialize)]
struct RawPagesCertificate {
    state: Option<String>,
    description: Option<String>,
    #[serde(default)]
    domains: Vec<String>,
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct RawPagesSite {
    status: Option<String>,
    cname: Option<String>,
    #[serde(default)]
    custom_404: bool,
    html_url: Option<String>,
    build_type: Option<String>,
    source: Option<RawPagesSource>,
    #[serde(default)]
    public: bool,
    https_certificate: Option<RawPagesCertificate>,
    #[serde(default)]
    https_enforced: bool,
    protected_domain_state: Option<String>,
    pending_domain_unverified_at: Option<String>,
}

#[derive(Deserialize)]
struct RawPagesError {
    message: Option<String>,
}

#[derive(Deserialize)]
struct RawPagesPusher {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct RawPagesBuild {
    url: Option<String>,
    status: Option<String>,
    error: Option<RawPagesError>,
    pusher: Option<RawPagesPusher>,
    commit: Option<String>,
    duration: Option<i64>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct RawPagesDomainHealth {
    host: Option<String>,
    uri: Option<String>,
    #[serde(default)]
    dns_resolves: bool,
    #[serde(default)]
    is_proxied: bool,
    #[serde(default)]
    is_valid: bool,
    reason: Option<String>,
    #[serde(default)]
    responds_to_https: bool,
    #[serde(default)]
    enforces_https: bool,
    #[serde(default)]
    is_https_eligible: bool,
    https_error: Option<String>,
    caa_error: Option<String>,
}

#[derive(Deserialize)]
struct RawPagesHealth {
    domain: Option<RawPagesDomainHealth>,
    alt_domain: Option<RawPagesDomainHealth>,
}

#[derive(Serialize)]
struct PagesBuildListParameters {
    page: u32,
    per_page: u8,
}

#[derive(Serialize)]
struct PagesSourcePayload<'a> {
    branch: &'a str,
    path: &'static str,
}

#[derive(Serialize)]
struct CreatePagesRequest<'a> {
    build_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<PagesSourcePayload<'a>>,
}

#[derive(Serialize)]
struct UpdatePagesRequest<'a> {
    cname: Option<&'a str>,
    https_enforced: bool,
    build_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<PagesSourcePayload<'a>>,
}

#[async_trait]
impl GitHubRepositoryPagesClient for OctocrabGitHubClient {
    async fn repository_pages(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubPagesWorkspace, AppError> {
        let client = authenticated_client(token)?;
        fetch_pages_workspace(&client, owner, repository, page).await
    }

    async fn repository_pages_health(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPagesHealth, AppError> {
        let client = authenticated_client(token)?;
        fetch_personal_repository_settings(&client, owner, repository).await?;
        let site = fetch_pages_site(&client, owner, repository)
            .await?
            .ok_or_else(|| AppError::Validation("GitHub Pages is not enabled".to_string()))?;
        if site.custom_domain.is_none() {
            return Err(AppError::Validation(
                "a custom domain is required for a Pages DNS health check".to_string(),
            ));
        }
        fetch_pages_health(&client, owner, repository).await
    }

    async fn mutate_repository_pages(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubPagesMutation,
    ) -> Result<GitHubPagesWorkspace, AppError> {
        let client = authenticated_client(token)?;
        let settings = fetch_personal_repository_settings(&client, owner, repository).await?;
        if settings.repository.is_archived {
            return Err(AppError::GitHubPermission(
                "archived repository Pages settings are read-only".to_string(),
            ));
        }
        let current = fetch_pages_site(&client, owner, repository).await?;

        match mutation {
            GitHubPagesMutation::Configure { configuration } => {
                ensure_pages_source_exists(&client, owner, repository, configuration).await?;
                if current.is_some() {
                    update_pages_site(&client, owner, repository, configuration).await?;
                    let updated = fetch_pages_workspace(&client, owner, repository, 1).await?;
                    ensure_pages_configuration_response(
                        updated.site.as_ref(),
                        configuration,
                        true,
                    )?;
                    Ok(updated)
                } else {
                    ensure_initial_configuration(configuration)?;
                    create_pages_site(&client, owner, repository, configuration).await?;
                    let updated = fetch_pages_workspace(&client, owner, repository, 1).await?;
                    ensure_pages_configuration_response(
                        updated.site.as_ref(),
                        configuration,
                        false,
                    )?;
                    Ok(updated)
                }
            }
            GitHubPagesMutation::RequestBuild => {
                let site = current.ok_or_else(|| {
                    AppError::Validation("GitHub Pages is not enabled".to_string())
                })?;
                if site.build_type != GitHubPagesBuildType::Legacy {
                    return Err(AppError::Validation(
                        "GitHub Actions Pages deployments must be rerun from Actions".to_string(),
                    ));
                }
                let requested: RawPagesBuild = client
                    .post(pages_builds_route(owner, repository), None::<&()>)
                    .await
                    .map_err(github_error)?;
                let requested = pages_build(requested)?;
                let mut updated = fetch_pages_workspace(&client, owner, repository, 1).await?;
                if !updated
                    .builds
                    .iter()
                    .any(|build| same_pages_build(build, &requested))
                {
                    updated.builds.insert(0, requested);
                    updated.builds.truncate(usize::from(PAGES_BUILD_PAGE_SIZE));
                }
                Ok(updated)
            }
            GitHubPagesMutation::Disable { confirmation } => {
                current.ok_or_else(|| {
                    AppError::Validation("GitHub Pages is not enabled".to_string())
                })?;
                ensure_pages_deletion_confirmation(&settings.repository.full_name, confirmation)?;
                delete_pages_site(&client, owner, repository).await?;
                Ok(GitHubPagesWorkspace {
                    site: None,
                    builds: Vec::new(),
                    page: 1,
                    has_previous: false,
                    has_more: false,
                    is_archived: false,
                })
            }
        }
    }
}

async fn fetch_pages_workspace(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    page: u32,
) -> Result<GitHubPagesWorkspace, AppError> {
    let settings = fetch_personal_repository_settings(client, owner, repository).await?;
    let site = fetch_pages_site(client, owner, repository).await?;
    let Some(site) = site else {
        return Ok(GitHubPagesWorkspace {
            site: None,
            builds: Vec::new(),
            page: 1,
            has_previous: false,
            has_more: false,
            is_archived: settings.repository.is_archived,
        });
    };
    if site.build_type == GitHubPagesBuildType::Workflow {
        return Ok(GitHubPagesWorkspace {
            site: Some(site),
            builds: Vec::new(),
            page: 1,
            has_previous: false,
            has_more: false,
            is_archived: settings.repository.is_archived,
        });
    }
    let mut page_response: octocrab::Page<RawPagesBuild> = client
        .get(
            pages_builds_route(owner, repository),
            Some(&PagesBuildListParameters {
                page,
                per_page: PAGES_BUILD_PAGE_SIZE,
            }),
        )
        .await
        .map_err(github_error)?;
    let has_more = page_response.next.is_some();
    let builds = page_response
        .take_items()
        .into_iter()
        .map(pages_build)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(GitHubPagesWorkspace {
        site: Some(site),
        builds,
        page,
        has_previous: page > 1,
        has_more,
        is_archived: settings.repository.is_archived,
    })
}

async fn fetch_pages_site(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<Option<GitHubPagesSite>, AppError> {
    let response = client
        ._get(pages_route(owner, repository))
        .await
        .map_err(github_error)?;
    match response.status() {
        StatusCode::OK => {
            let response = octocrab::map_github_error(response)
                .await
                .map_err(github_error)?;
            let raw = RawPagesSite::from_response(response)
                .await
                .map_err(github_error)?;
            Ok(Some(pages_site(raw)?))
        }
        StatusCode::NOT_FOUND => Ok(None),
        status => {
            octocrab::map_github_error(response)
                .await
                .map_err(github_error)?;
            Err(AppError::GitHub(format!(
                "GitHub returned unexpected Pages status {status}"
            )))
        }
    }
}

async fn fetch_pages_health(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubPagesHealth, AppError> {
    let response = client
        ._get(pages_health_route(owner, repository))
        .await
        .map_err(github_error)?;
    match response.status() {
        StatusCode::ACCEPTED => Ok(GitHubPagesHealth {
            pending: true,
            domain: None,
            alternate_domain: None,
        }),
        StatusCode::OK => {
            let response = octocrab::map_github_error(response)
                .await
                .map_err(github_error)?;
            let raw = RawPagesHealth::from_response(response)
                .await
                .map_err(github_error)?;
            Ok(GitHubPagesHealth {
                pending: false,
                domain: raw.domain.map(pages_domain_health),
                alternate_domain: raw.alt_domain.map(pages_domain_health),
            })
        }
        status => {
            octocrab::map_github_error(response)
                .await
                .map_err(github_error)?;
            Err(AppError::GitHub(format!(
                "GitHub returned unexpected Pages health status {status}"
            )))
        }
    }
}

async fn create_pages_site(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    configuration: &GitHubPagesConfiguration,
) -> Result<(), AppError> {
    let source = pages_source_payload(configuration);
    let _: RawPagesSite = client
        .post(
            pages_route(owner, repository),
            Some(&CreatePagesRequest {
                build_type: configuration.build_type.as_str(),
                source,
            }),
        )
        .await
        .map_err(github_error)?;
    Ok(())
}

async fn update_pages_site(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    configuration: &GitHubPagesConfiguration,
) -> Result<(), AppError> {
    let source = pages_source_payload(configuration);
    let response = client
        ._put(
            pages_route(owner, repository),
            Some(&UpdatePagesRequest {
                cname: configuration.custom_domain.as_deref(),
                https_enforced: configuration.https_enforced,
                build_type: configuration.build_type.as_str(),
                source,
            }),
        )
        .await
        .map_err(github_error)?;
    let status = response.status();
    octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    if status != StatusCode::NO_CONTENT {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected Pages update status {status}"
        )));
    }
    Ok(())
}

async fn delete_pages_site(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<(), AppError> {
    let response = client
        ._delete(pages_route(owner, repository), None::<&()>)
        .await
        .map_err(github_error)?;
    let status = response.status();
    octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    if status != StatusCode::NO_CONTENT {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected Pages disable status {status}"
        )));
    }
    Ok(())
}

async fn ensure_pages_source_exists(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    configuration: &GitHubPagesConfiguration,
) -> Result<(), AppError> {
    if configuration.build_type == GitHubPagesBuildType::Legacy {
        let branch = configuration.branch.as_ref().ok_or_else(|| {
            AppError::Validation("a branch is required for branch-based Pages".to_string())
        })?;
        client
            .repos(owner, repository)
            .get_ref(&octocrab::params::repos::Reference::Branch(branch.clone()))
            .await
            .map_err(github_error)?;
    }
    Ok(())
}

fn normalize_pages_mutation(
    mutation: GitHubPagesMutation,
) -> Result<GitHubPagesMutation, AppError> {
    match mutation {
        GitHubPagesMutation::Configure { configuration } => Ok(GitHubPagesMutation::Configure {
            configuration: normalize_pages_configuration(configuration)?,
        }),
        GitHubPagesMutation::RequestBuild => Ok(GitHubPagesMutation::RequestBuild),
        GitHubPagesMutation::Disable { confirmation } => {
            let confirmation = confirmation.trim().to_string();
            if confirmation.is_empty() || confirmation.chars().any(char::is_control) {
                return Err(AppError::Validation(
                    "Pages disable confirmation is invalid".to_string(),
                ));
            }
            Ok(GitHubPagesMutation::Disable { confirmation })
        }
    }
}

fn normalize_pages_configuration(
    configuration: GitHubPagesConfiguration,
) -> Result<GitHubPagesConfiguration, AppError> {
    let branch = normalize_optional_pages_text(configuration.branch, 255, "Pages source branch")?;
    let custom_domain = normalize_custom_domain(configuration.custom_domain)?;
    match configuration.build_type {
        GitHubPagesBuildType::Legacy => {
            if branch.is_none() || configuration.source_path.is_none() {
                return Err(AppError::Validation(
                    "branch-based Pages requires a branch and source folder".to_string(),
                ));
            }
        }
        GitHubPagesBuildType::Workflow => {
            if branch.is_some() || configuration.source_path.is_some() {
                return Err(AppError::Validation(
                    "GitHub Actions Pages does not use a repository source branch".to_string(),
                ));
            }
        }
    }
    Ok(GitHubPagesConfiguration {
        build_type: configuration.build_type,
        branch,
        source_path: configuration.source_path,
        custom_domain,
        https_enforced: configuration.https_enforced,
    })
}

fn normalize_optional_pages_text(
    value: Option<String>,
    maximum_length: usize,
    field: &str,
) -> Result<Option<String>, AppError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > maximum_length || value.chars().any(char::is_control) {
        return Err(AppError::Validation(format!("{field} is invalid")));
    }
    Ok(Some(value.to_string()))
}

fn normalize_custom_domain(value: Option<String>) -> Result<Option<String>, AppError> {
    let Some(domain) = normalize_optional_pages_text(value, 253, "Pages custom domain")? else {
        return Ok(None);
    };
    let domain = domain.trim_end_matches('.').to_ascii_lowercase();
    if domain.is_empty()
        || domain.contains("://")
        || domain.contains('/')
        || domain.contains('@')
        || domain.chars().any(char::is_whitespace)
        || !domain.contains('.')
    {
        return Err(AppError::Validation(
            "Pages custom domain must be a hostname without a scheme or path".to_string(),
        ));
    }
    Ok(Some(domain))
}

fn ensure_initial_configuration(configuration: &GitHubPagesConfiguration) -> Result<(), AppError> {
    if configuration.custom_domain.is_some() || configuration.https_enforced {
        return Err(AppError::Validation(
            "enable Pages before configuring a custom domain or HTTPS enforcement".to_string(),
        ));
    }
    Ok(())
}

fn ensure_pages_configuration_response(
    site: Option<&GitHubPagesSite>,
    requested: &GitHubPagesConfiguration,
    verify_domain: bool,
) -> Result<(), AppError> {
    let site = site.ok_or_else(|| {
        AppError::GitHubPermission("GitHub did not persist the Pages configuration".to_string())
    })?;
    if site.build_type != requested.build_type {
        return Err(AppError::GitHubPermission(
            "GitHub did not persist the requested Pages build type".to_string(),
        ));
    }
    match requested.build_type {
        GitHubPagesBuildType::Legacy => {
            let source = site.source.as_ref().ok_or_else(|| {
                AppError::GitHubPermission(
                    "GitHub did not return the requested Pages source".to_string(),
                )
            })?;
            if Some(&source.branch) != requested.branch.as_ref()
                || Some(source.path) != requested.source_path
            {
                return Err(AppError::GitHubPermission(
                    "GitHub did not persist the requested Pages source".to_string(),
                ));
            }
        }
        GitHubPagesBuildType::Workflow if site.source.is_some() => {
            return Err(AppError::GitHubPermission(
                "GitHub returned a branch source for an Actions Pages site".to_string(),
            ));
        }
        GitHubPagesBuildType::Workflow => {}
    }
    if verify_domain
        && (site.custom_domain != requested.custom_domain
            || site.https_enforced != requested.https_enforced)
    {
        return Err(AppError::GitHubPermission(
            "GitHub did not persist the requested Pages domain settings".to_string(),
        ));
    }
    Ok(())
}

fn ensure_pages_deletion_confirmation(
    repository_full_name: &str,
    confirmation: &str,
) -> Result<(), AppError> {
    if repository_full_name != confirmation {
        return Err(AppError::Validation(
            "Pages disable confirmation does not match the current repository".to_string(),
        ));
    }
    Ok(())
}

fn pages_source_payload(
    configuration: &GitHubPagesConfiguration,
) -> Option<PagesSourcePayload<'_>> {
    match configuration.build_type {
        GitHubPagesBuildType::Legacy => Some(PagesSourcePayload {
            branch: configuration.branch.as_deref().expect("validated branch"),
            path: configuration
                .source_path
                .expect("validated source path")
                .as_api_path(),
        }),
        GitHubPagesBuildType::Workflow => None,
    }
}

fn pages_site(raw: RawPagesSite) -> Result<GitHubPagesSite, AppError> {
    let build_type = match raw.build_type.as_deref() {
        Some("legacy") => GitHubPagesBuildType::Legacy,
        Some("workflow") => GitHubPagesBuildType::Workflow,
        None if raw.source.is_some() => GitHubPagesBuildType::Legacy,
        None => GitHubPagesBuildType::Workflow,
        Some(value) => {
            return Err(AppError::GitHub(format!(
                "GitHub returned unsupported Pages build type {value}"
            )))
        }
    };
    let source = raw.source.map(pages_source).transpose()?;
    if build_type == GitHubPagesBuildType::Legacy && source.is_none() {
        return Err(AppError::GitHub(
            "GitHub returned branch-based Pages without a source".to_string(),
        ));
    }
    let url = raw
        .html_url
        .filter(|url| url.starts_with("https://"))
        .ok_or_else(|| AppError::GitHub("GitHub returned an invalid Pages URL".to_string()))?;
    Ok(GitHubPagesSite {
        status: normalized_response_text(raw.status, "unknown"),
        url,
        build_type,
        source,
        custom_domain: raw.cname.and_then(nonempty_response_text),
        custom_404: raw.custom_404,
        public: raw.public,
        https_enforced: raw.https_enforced,
        certificate: raw.https_certificate.map(pages_certificate),
        protected_domain_state: raw.protected_domain_state.and_then(nonempty_response_text),
        pending_domain_unverified_at: raw
            .pending_domain_unverified_at
            .and_then(nonempty_response_text),
    })
}

fn pages_source(raw: RawPagesSource) -> Result<GitHubPagesSource, AppError> {
    let branch = nonempty_response_text(raw.branch).ok_or_else(|| {
        AppError::GitHub("GitHub returned an empty Pages source branch".to_string())
    })?;
    let path = match raw.path.as_str() {
        "/" => GitHubPagesSourcePath::Root,
        "/docs" => GitHubPagesSourcePath::Docs,
        path => {
            return Err(AppError::GitHub(format!(
                "GitHub returned unsupported Pages source path {path}"
            )))
        }
    };
    Ok(GitHubPagesSource { branch, path })
}

fn pages_certificate(raw: RawPagesCertificate) -> GitHubPagesCertificate {
    GitHubPagesCertificate {
        state: normalized_response_text(raw.state, "unknown"),
        description: raw.description.and_then(nonempty_response_text),
        domains: raw
            .domains
            .into_iter()
            .filter_map(nonempty_response_text)
            .collect(),
        expires_at: raw.expires_at.and_then(nonempty_response_text),
    }
}

fn pages_build(raw: RawPagesBuild) -> Result<GitHubPagesBuild, AppError> {
    let duration_milliseconds = raw
        .duration
        .map(|duration| {
            u64::try_from(duration).map_err(|_| {
                AppError::GitHub("GitHub returned a negative Pages build duration".to_string())
            })
        })
        .transpose()?;
    Ok(GitHubPagesBuild {
        url: raw.url.and_then(nonempty_response_text),
        status: normalized_response_text(raw.status, "unknown"),
        error: raw
            .error
            .and_then(|error| error.message.and_then(nonempty_response_text)),
        pusher: raw.pusher.as_ref().map(|pusher| pusher.login.clone()),
        pusher_avatar_url: raw.pusher.and_then(|pusher| pusher.avatar_url),
        commit: raw.commit.and_then(nonempty_response_text),
        duration_milliseconds,
        created_at: raw.created_at.and_then(nonempty_response_text),
        updated_at: raw.updated_at.and_then(nonempty_response_text),
    })
}

fn pages_domain_health(raw: RawPagesDomainHealth) -> GitHubPagesDomainHealth {
    GitHubPagesDomainHealth {
        host: raw.host.and_then(nonempty_response_text),
        uri: raw.uri.and_then(nonempty_response_text),
        dns_resolves: raw.dns_resolves,
        proxied: raw.is_proxied,
        valid: raw.is_valid,
        reason: raw.reason.and_then(nonempty_response_text),
        responds_to_https: raw.responds_to_https,
        enforces_https: raw.enforces_https,
        https_eligible: raw.is_https_eligible,
        https_error: raw.https_error.and_then(nonempty_response_text),
        caa_error: raw.caa_error.and_then(nonempty_response_text),
    }
}

fn normalized_response_text(value: Option<String>, fallback: &str) -> String {
    value
        .and_then(nonempty_response_text)
        .unwrap_or_else(|| fallback.to_string())
}

fn nonempty_response_text(value: String) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn same_pages_build(left: &GitHubPagesBuild, right: &GitHubPagesBuild) -> bool {
    left.url.is_some() && left.url == right.url
        || left.commit.is_some()
            && left.commit == right.commit
            && left.created_at == right.created_at
}

fn pages_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/pages")
}

fn pages_builds_route(owner: &str, repository: &str) -> String {
    format!("{}/builds", pages_route(owner, repository))
}

fn pages_health_route(owner: &str, repository: &str) -> String {
    format!("{}/health", pages_route(owner, repository))
}

#[cfg(test)]
#[async_trait]
impl GitHubRepositoryPagesClient for super::tests::FakeGitHubClient {
    async fn repository_pages(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubPagesWorkspace, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, page), ("octocat", "hello-world", 2));
        Ok(test_workspace(page))
    }

    async fn repository_pages_health(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPagesHealth, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubPagesHealth {
            pending: false,
            domain: Some(test_domain_health()),
            alternate_domain: None,
        })
    }

    async fn mutate_repository_pages(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubPagesMutation,
    ) -> Result<GitHubPagesWorkspace, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert_eq!(
            mutation,
            &GitHubPagesMutation::Configure {
                configuration: GitHubPagesConfiguration {
                    build_type: GitHubPagesBuildType::Legacy,
                    branch: Some("main".to_string()),
                    source_path: Some(GitHubPagesSourcePath::Docs),
                    custom_domain: Some("docs.example.com".to_string()),
                    https_enforced: true,
                },
            }
        );
        Ok(test_workspace(1))
    }
}

#[cfg(test)]
fn test_workspace(page: u32) -> GitHubPagesWorkspace {
    GitHubPagesWorkspace {
        site: Some(GitHubPagesSite {
            status: "built".to_string(),
            url: "https://octocat.github.io/hello-world/".to_string(),
            build_type: GitHubPagesBuildType::Legacy,
            source: Some(GitHubPagesSource {
                branch: "main".to_string(),
                path: GitHubPagesSourcePath::Docs,
            }),
            custom_domain: Some("docs.example.com".to_string()),
            custom_404: true,
            public: true,
            https_enforced: true,
            certificate: None,
            protected_domain_state: Some("verified".to_string()),
            pending_domain_unverified_at: None,
        }),
        builds: Vec::new(),
        page,
        has_previous: page > 1,
        has_more: false,
        is_archived: false,
    }
}

#[cfg(test)]
fn test_domain_health() -> GitHubPagesDomainHealth {
    GitHubPagesDomainHealth {
        host: Some("docs.example.com".to_string()),
        uri: Some("https://docs.example.com".to_string()),
        dns_resolves: true,
        proxied: false,
        valid: true,
        reason: None,
        responds_to_https: true,
        enforces_https: true,
        https_eligible: true,
        https_error: None,
        caa_error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn legacy_configuration() -> GitHubPagesConfiguration {
        GitHubPagesConfiguration {
            build_type: GitHubPagesBuildType::Legacy,
            branch: Some(" main ".to_string()),
            source_path: Some(GitHubPagesSourcePath::Docs),
            custom_domain: Some(" Docs.Example.COM. ".to_string()),
            https_enforced: true,
        }
    }

    #[test]
    fn configuration_normalizes_branch_and_custom_domain() {
        assert_eq!(
            normalize_pages_configuration(legacy_configuration()).expect("configuration"),
            GitHubPagesConfiguration {
                build_type: GitHubPagesBuildType::Legacy,
                branch: Some("main".to_string()),
                source_path: Some(GitHubPagesSourcePath::Docs),
                custom_domain: Some("docs.example.com".to_string()),
                https_enforced: true,
            }
        );
    }

    #[test]
    fn workflow_configuration_rejects_a_branch_source() {
        let error = normalize_pages_configuration(GitHubPagesConfiguration {
            build_type: GitHubPagesBuildType::Workflow,
            branch: Some("main".to_string()),
            source_path: Some(GitHubPagesSourcePath::Root),
            custom_domain: None,
            https_enforced: false,
        })
        .expect_err("branch rejected");

        assert!(error
            .to_string()
            .contains("does not use a repository source"));
    }

    #[test]
    fn custom_domain_rejects_urls_and_paths() {
        for domain in [
            "https://docs.example.com",
            "docs.example.com/path",
            "docs@example.com",
            "localhost",
        ] {
            let error = normalize_custom_domain(Some(domain.to_string())).expect_err("invalid");
            assert!(error
                .to_string()
                .contains("hostname without a scheme or path"));
        }
    }

    #[test]
    fn update_payload_sends_null_when_the_custom_domain_is_cleared() {
        let configuration = GitHubPagesConfiguration {
            build_type: GitHubPagesBuildType::Workflow,
            branch: None,
            source_path: None,
            custom_domain: None,
            https_enforced: true,
        };
        let payload = serde_json::to_value(UpdatePagesRequest {
            cname: configuration.custom_domain.as_deref(),
            https_enforced: configuration.https_enforced,
            build_type: configuration.build_type.as_str(),
            source: pages_source_payload(&configuration),
        })
        .expect("payload");

        assert_eq!(
            payload,
            serde_json::json!({
                "cname": null,
                "https_enforced": true,
                "build_type": "workflow"
            })
        );
    }

    #[test]
    fn site_mapping_preserves_source_certificate_and_domain_state() {
        let site = pages_site(RawPagesSite {
            status: Some("built".to_string()),
            cname: Some("docs.example.com".to_string()),
            custom_404: true,
            html_url: Some("https://docs.example.com".to_string()),
            build_type: Some("legacy".to_string()),
            source: Some(RawPagesSource {
                branch: "main".to_string(),
                path: "/docs".to_string(),
            }),
            public: true,
            https_certificate: Some(RawPagesCertificate {
                state: Some("approved".to_string()),
                description: Some("Certificate is approved".to_string()),
                domains: vec!["docs.example.com".to_string()],
                expires_at: Some("2027-01-01".to_string()),
            }),
            https_enforced: true,
            protected_domain_state: Some("verified".to_string()),
            pending_domain_unverified_at: None,
        })
        .expect("site");

        assert_eq!(site.build_type, GitHubPagesBuildType::Legacy);
        assert_eq!(
            site.source.expect("source").path,
            GitHubPagesSourcePath::Docs
        );
        assert_eq!(site.certificate.expect("certificate").state, "approved");
        assert_eq!(site.protected_domain_state.as_deref(), Some("verified"));
    }

    #[test]
    fn response_verification_rejects_silently_dropped_domain_changes() {
        let workspace = test_workspace(1);
        let mut requested = legacy_configuration();
        requested.branch = Some("main".to_string());
        requested.custom_domain = Some("other.example.com".to_string());
        let error = ensure_pages_configuration_response(workspace.site.as_ref(), &requested, true)
            .expect_err("domain mismatch");

        assert!(error.to_string().contains("domain settings"));
    }

    #[test]
    fn routes_are_repository_scoped() {
        assert_eq!(
            pages_route("octocat", "hello-world"),
            "/repos/octocat/hello-world/pages"
        );
        assert_eq!(
            pages_builds_route("octocat", "hello-world"),
            "/repos/octocat/hello-world/pages/builds"
        );
        assert_eq!(
            pages_health_route("octocat", "hello-world"),
            "/repos/octocat/hello-world/pages/health"
        );
    }

    #[test]
    fn mutation_uses_camel_case_ipc_fields() {
        let value = serde_json::to_value(GitHubPagesMutation::Configure {
            configuration: GitHubPagesConfiguration {
                build_type: GitHubPagesBuildType::Legacy,
                branch: Some("main".to_string()),
                source_path: Some(GitHubPagesSourcePath::Root),
                custom_domain: None,
                https_enforced: false,
            },
        })
        .expect("mutation");

        assert_eq!(value["action"], "configure");
        assert_eq!(value["configuration"]["buildType"], "legacy");
        assert_eq!(value["configuration"]["sourcePath"], "root");
        assert_eq!(
            value["configuration"]["customDomain"],
            serde_json::Value::Null
        );
        assert_eq!(value["configuration"]["httpsEnforced"], false);
    }
}
