use async_trait::async_trait;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{authenticated_client, github_error, GitHubService, OctocrabGitHubClient};

#[cfg(test)]
mod tests;

const PACKAGE_PAGE_SIZE: u8 = 30;
const PACKAGE_PAGE_LIMIT: u32 = 10_000 / PACKAGE_PAGE_SIZE as u32;
const MAX_PACKAGE_NAME_BYTES: usize = 512;
const MAX_VERSION_NAME_BYTES: usize = 1_024;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPackageType {
    Npm,
    Maven,
    Rubygems,
    Nuget,
    Container,
    Docker,
}

impl GitHubPackageType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Npm => "npm",
            Self::Maven => "maven",
            Self::Rubygems => "rubygems",
            Self::Nuget => "nuget",
            Self::Container => "container",
            Self::Docker => "docker",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPackageVisibility {
    Public,
    Private,
}

impl GitHubPackageVisibility {
    fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Private => "private",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubPackageVersionState {
    Active,
    Deleted,
}

impl GitHubPackageVersionState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Deleted => "deleted",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPackageVersionAction {
    Delete,
    Restore,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPackageRepository {
    pub name: String,
    pub full_name: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPackage {
    pub id: u64,
    pub name: String,
    pub package_type: GitHubPackageType,
    pub visibility: GitHubPackageVisibilityValue,
    pub version_count: u64,
    pub owner: String,
    pub url: String,
    pub created_at: String,
    pub updated_at: String,
    pub repository: Option<GitHubPackageRepository>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum GitHubPackageVisibilityValue {
    Public,
    Private,
    Internal,
    Unknown(String),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPackagePage {
    pub packages: Vec<GitHubPackage>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPackageVersion {
    pub id: u64,
    pub name: String,
    pub state: GitHubPackageVersionState,
    pub metadata: GitHubPackageVersionMetadata,
    pub description: Option<String>,
    pub license: Option<String>,
    pub deleted_at: Option<String>,
    pub url: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubPackageVersionMetadata {
    Container { tags: Vec<String> },
    Unknown { raw: serde_json::Value },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPackageVersionPage {
    pub versions: Vec<GitHubPackageVersion>,
    pub state: GitHubPackageVersionState,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPackageVersionMutationResult {
    pub package_id: u64,
    pub package_type: GitHubPackageType,
    pub package_name: String,
    pub version_id: u64,
    pub version_name: String,
    pub action: GitHubPackageVersionAction,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPackageVersionMutationInput {
    pub package_type: GitHubPackageType,
    pub package_name: String,
    pub expected_package_id: u64,
    pub version_id: u64,
    pub expected_version_name: String,
    pub action: GitHubPackageVersionAction,
}

#[async_trait]
pub(crate) trait GitHubPackagesClient: Send + Sync {
    async fn personal_packages(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        visibility: Option<GitHubPackageVisibility>,
        page: u32,
    ) -> Result<GitHubPackagePage, AppError>;

    async fn personal_package(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        package_name: &str,
    ) -> Result<GitHubPackage, AppError>;

    async fn personal_package_versions(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        package_name: &str,
        state: GitHubPackageVersionState,
        page: u32,
    ) -> Result<GitHubPackageVersionPage, AppError>;

    async fn mutate_personal_package_version(
        &self,
        token: &str,
        input: &GitHubPackageVersionMutationInput,
    ) -> Result<GitHubPackageVersionMutationResult, AppError>;
}

impl GitHubService {
    pub async fn personal_packages(
        &self,
        package_type: GitHubPackageType,
        visibility: Option<GitHubPackageVisibility>,
        page: u32,
    ) -> Result<GitHubPackagePage, AppError> {
        let credentials = self.load_credentials().await?;
        ensure_package_scopes(&credentials.scopes, &["read:packages"])?;
        self.client
            .personal_packages(&credentials.access_token, package_type, visibility, page)
            .await
    }

    pub async fn personal_package(
        &self,
        package_type: GitHubPackageType,
        package_name: &str,
    ) -> Result<GitHubPackage, AppError> {
        let credentials = self.load_credentials().await?;
        ensure_package_scopes(&credentials.scopes, &["read:packages"])?;
        self.client
            .personal_package(&credentials.access_token, package_type, package_name)
            .await
    }

    pub async fn personal_package_versions(
        &self,
        package_type: GitHubPackageType,
        package_name: &str,
        state: GitHubPackageVersionState,
        page: u32,
    ) -> Result<GitHubPackageVersionPage, AppError> {
        let credentials = self.load_credentials().await?;
        ensure_package_scopes(&credentials.scopes, &["read:packages"])?;
        self.client
            .personal_package_versions(
                &credentials.access_token,
                package_type,
                package_name,
                state,
                page,
            )
            .await
    }

    pub async fn mutate_personal_package_version(
        &self,
        input: &GitHubPackageVersionMutationInput,
    ) -> Result<GitHubPackageVersionMutationResult, AppError> {
        let credentials = self.load_credentials().await?;
        let write_scope = match input.action {
            GitHubPackageVersionAction::Delete => "delete:packages",
            GitHubPackageVersionAction::Restore => "write:packages",
        };
        ensure_package_scopes(&credentials.scopes, &["read:packages", write_scope])?;
        self.client
            .mutate_personal_package_version(&credentials.access_token, input)
            .await
    }
}

#[async_trait]
impl GitHubPackagesClient for OctocrabGitHubClient {
    async fn personal_packages(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        visibility: Option<GitHubPackageVisibility>,
        page: u32,
    ) -> Result<GitHubPackagePage, AppError> {
        let client = authenticated_client(token)?;
        personal_packages_with_client(&client, package_type, visibility, page).await
    }

    async fn personal_package(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        package_name: &str,
    ) -> Result<GitHubPackage, AppError> {
        let client = authenticated_client(token)?;
        personal_package_with_client(&client, package_type, package_name).await
    }

    async fn personal_package_versions(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        package_name: &str,
        state: GitHubPackageVersionState,
        page: u32,
    ) -> Result<GitHubPackageVersionPage, AppError> {
        let client = authenticated_client(token)?;
        personal_package_versions_with_client(&client, package_type, package_name, state, page)
            .await
    }

    async fn mutate_personal_package_version(
        &self,
        token: &str,
        input: &GitHubPackageVersionMutationInput,
    ) -> Result<GitHubPackageVersionMutationResult, AppError> {
        let client = authenticated_client(token)?;
        mutate_personal_package_version_with_client(&client, input).await
    }
}

async fn personal_packages_with_client(
    client: &octocrab::Octocrab,
    package_type: GitHubPackageType,
    visibility: Option<GitHubPackageVisibility>,
    page: u32,
) -> Result<GitHubPackagePage, AppError> {
    let parameters = PackageListParameters {
        package_type: package_type.as_str(),
        visibility: visibility.map(GitHubPackageVisibility::as_str),
        page,
        per_page: PACKAGE_PAGE_SIZE,
    };
    let response: octocrab::Page<RawPackage> = client
        .get("/user/packages", Some(&parameters))
        .await
        .map_err(package_list_error)?;
    let has_more = response.next.is_some();
    Ok(GitHubPackagePage {
        packages: response
            .items
            .into_iter()
            .map(|package| package_from_raw(package, package_type))
            .collect::<Result<_, _>>()?,
        page,
        has_previous: page > 1,
        has_more,
    })
}

async fn personal_package_with_client(
    client: &octocrab::Octocrab,
    package_type: GitHubPackageType,
    package_name: &str,
) -> Result<GitHubPackage, AppError> {
    let raw: RawPackage = client
        .get(package_route(package_type, package_name), None::<&()>)
        .await
        .map_err(package_error)?;
    package_from_raw(raw, package_type)
}

async fn personal_package_versions_with_client(
    client: &octocrab::Octocrab,
    package_type: GitHubPackageType,
    package_name: &str,
    state: GitHubPackageVersionState,
    page: u32,
) -> Result<GitHubPackageVersionPage, AppError> {
    let parameters = PackageVersionListParameters {
        state: state.as_str(),
        page,
        per_page: PACKAGE_PAGE_SIZE,
    };
    let response: octocrab::Page<RawPackageVersion> = client
        .get(
            package_versions_route(package_type, package_name),
            Some(&parameters),
        )
        .await
        .map_err(package_error)?;
    let has_more = response.next.is_some();
    Ok(GitHubPackageVersionPage {
        versions: response
            .items
            .into_iter()
            .map(|version| package_version_from_raw(version, state, package_type))
            .collect(),
        state,
        page,
        has_previous: page > 1,
        has_more,
    })
}

async fn mutate_personal_package_version_with_client(
    client: &octocrab::Octocrab,
    input: &GitHubPackageVersionMutationInput,
) -> Result<GitHubPackageVersionMutationResult, AppError> {
    let package: RawPackage = client
        .get(
            package_route(input.package_type, &input.package_name),
            None::<&()>,
        )
        .await
        .map_err(package_error)?;
    let package = package_from_raw(package, input.package_type)?;
    if package.id != input.expected_package_id || package.name != input.package_name {
        return Err(AppError::GitHubPackageConflict(
            "the selected package changed on GitHub; reload it before continuing".to_string(),
        ));
    }

    let version = match input.action {
        GitHubPackageVersionAction::Delete => {
            let raw: RawPackageVersion = client
                .get(
                    package_version_route(
                        input.package_type,
                        &input.package_name,
                        input.version_id,
                    ),
                    None::<&()>,
                )
                .await
                .map_err(package_error)?;
            package_version_from_raw(raw, GitHubPackageVersionState::Active, input.package_type)
        }
        GitHubPackageVersionAction::Restore => {
            deleted_package_version(
                client,
                input.package_type,
                &input.package_name,
                input.version_id,
            )
            .await?
        }
    };
    if version.id != input.version_id || version.name != input.expected_version_name {
        return Err(AppError::GitHubPackageConflict(
            "the selected package version changed on GitHub; reload it before continuing"
                .to_string(),
        ));
    }

    let route = package_version_route(input.package_type, &input.package_name, input.version_id);
    let response = match input.action {
        GitHubPackageVersionAction::Delete => client._delete::<()>(&route, None).await,
        GitHubPackageVersionAction::Restore => {
            client._post::<()>(&format!("{route}/restore"), None).await
        }
    }
    .map_err(package_write_error)?;
    octocrab::map_github_error(response)
        .await
        .map_err(package_write_error)?;

    Ok(GitHubPackageVersionMutationResult {
        package_id: package.id,
        package_type: input.package_type,
        package_name: package.name,
        version_id: version.id,
        version_name: version.name,
        action: input.action,
    })
}

#[derive(Serialize)]
struct PackageListParameters {
    package_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    visibility: Option<&'static str>,
    page: u32,
    per_page: u8,
}

#[derive(Serialize)]
struct PackageVersionListParameters {
    state: &'static str,
    page: u32,
    per_page: u8,
}

#[derive(Debug, Deserialize)]
struct RawPackage {
    id: u64,
    name: String,
    package_type: String,
    visibility: String,
    version_count: u64,
    owner: RawPackageOwner,
    html_url: String,
    created_at: String,
    updated_at: String,
    repository: Option<RawPackageRepository>,
}

#[derive(Debug, Deserialize)]
struct RawPackageOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct RawPackageRepository {
    name: String,
    full_name: String,
    html_url: String,
}

#[derive(Debug, Deserialize)]
struct RawPackageVersion {
    id: u64,
    name: String,
    html_url: String,
    created_at: String,
    updated_at: String,
    description: Option<String>,
    license: Option<String>,
    deleted_at: Option<String>,
    #[serde(default)]
    metadata: serde_json::Value,
}

async fn deleted_package_version(
    client: &octocrab::Octocrab,
    package_type: GitHubPackageType,
    package_name: &str,
    version_id: u64,
) -> Result<GitHubPackageVersion, AppError> {
    let parameters = PackageVersionListParameters {
        state: GitHubPackageVersionState::Deleted.as_str(),
        page: 1,
        per_page: 100,
    };
    let first: octocrab::Page<RawPackageVersion> = client
        .get(
            package_versions_route(package_type, package_name),
            Some(&parameters),
        )
        .await
        .map_err(package_error)?;
    client
        .all_pages(first)
        .await
        .map_err(package_error)?
        .into_iter()
        .find(|version| version.id == version_id)
        .map(|version| {
            package_version_from_raw(version, GitHubPackageVersionState::Deleted, package_type)
        })
        .ok_or_else(|| {
            AppError::GitHubPackageConflict(
                "the deleted package version is no longer available to restore".to_string(),
            )
        })
}

fn package_from_raw(
    raw: RawPackage,
    expected_type: GitHubPackageType,
) -> Result<GitHubPackage, AppError> {
    if raw.package_type != expected_type.as_str() {
        return Err(AppError::GitHubPackageConflict(
            "GitHub returned a package from a different registry".to_string(),
        ));
    }
    Ok(GitHubPackage {
        id: raw.id,
        name: raw.name,
        package_type: expected_type,
        visibility: package_visibility_from_raw(raw.visibility),
        version_count: raw.version_count,
        owner: raw.owner.login,
        url: raw.html_url,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        repository: raw.repository.map(|repository| GitHubPackageRepository {
            name: repository.name,
            full_name: repository.full_name,
            url: repository.html_url,
        }),
    })
}

fn package_version_from_raw(
    raw: RawPackageVersion,
    state: GitHubPackageVersionState,
    package_type: GitHubPackageType,
) -> GitHubPackageVersion {
    let metadata = package_version_metadata_from_raw(raw.metadata, package_type);
    GitHubPackageVersion {
        id: raw.id,
        name: raw.name,
        state,
        metadata,
        description: raw.description,
        license: raw.license,
        deleted_at: raw.deleted_at,
        url: raw.html_url,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
    }
}

fn package_visibility_from_raw(value: String) -> GitHubPackageVisibilityValue {
    match value.as_str() {
        "public" => GitHubPackageVisibilityValue::Public,
        "private" => GitHubPackageVisibilityValue::Private,
        "internal" => GitHubPackageVisibilityValue::Internal,
        _ => GitHubPackageVisibilityValue::Unknown(value),
    }
}

fn package_version_metadata_from_raw(
    raw: serde_json::Value,
    package_type: GitHubPackageType,
) -> GitHubPackageVersionMetadata {
    if package_type == GitHubPackageType::Container {
        let tags = raw
            .get("container")
            .and_then(|container| container.get("tags"))
            .and_then(serde_json::Value::as_array)
            .and_then(|tags| {
                tags.iter()
                    .map(|tag| tag.as_str().map(str::to_string))
                    .collect::<Option<Vec<_>>>()
            });
        if let Some(mut tags) = tags {
            tags.sort();
            tags.dedup();
            return GitHubPackageVersionMetadata::Container { tags };
        }
    }
    GitHubPackageVersionMetadata::Unknown { raw }
}

fn ensure_package_scopes(granted: &[String], required: &[&str]) -> Result<(), AppError> {
    if granted.is_empty()
        || required.iter().all(|required| {
            granted
                .iter()
                .any(|scope| package_scope_grants(scope, required))
        })
    {
        return Ok(());
    }
    Err(AppError::GitHubPermission(format!(
        "reconnect GitHub and grant {} to manage personal Packages",
        required.join(" and ")
    )))
}

fn package_scope_grants(granted: &str, required: &str) -> bool {
    granted == required || (granted == "write:packages" && required == "read:packages")
}

pub(crate) fn normalize_package_name(value: &str) -> Result<String, AppError> {
    normalize_package_identity(value, MAX_PACKAGE_NAME_BYTES, "package name")
}

pub(crate) fn normalize_package_version_name(value: &str) -> Result<String, AppError> {
    normalize_package_identity(value, MAX_VERSION_NAME_BYTES, "package version name")
}

pub(crate) fn validate_package_page(page: u32) -> Result<u32, AppError> {
    if (1..=PACKAGE_PAGE_LIMIT).contains(&page) {
        Ok(page)
    } else {
        Err(AppError::Validation(format!(
            "package page must be between 1 and {PACKAGE_PAGE_LIMIT}"
        )))
    }
}

fn normalize_package_identity(
    value: &str,
    max_bytes: usize,
    label: &str,
) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() || value.len() > max_bytes || value.chars().any(char::is_control) {
        return Err(AppError::Validation(format!(
            "{label} must be non-empty, control-free, and at most {max_bytes} bytes"
        )));
    }
    Ok(value.to_string())
}

fn encoded_package_name(package_name: &str) -> String {
    utf8_percent_encode(package_name, NON_ALPHANUMERIC).to_string()
}

fn package_route(package_type: GitHubPackageType, package_name: &str) -> String {
    format!(
        "/user/packages/{}/{}",
        package_type.as_str(),
        encoded_package_name(package_name)
    )
}

fn package_versions_route(package_type: GitHubPackageType, package_name: &str) -> String {
    format!("{}/versions", package_route(package_type, package_name))
}

fn package_version_route(
    package_type: GitHubPackageType,
    package_name: &str,
    version_id: u64,
) -> String {
    format!(
        "{}/versions/{version_id}",
        package_route(package_type, package_name)
    )
}

fn package_list_error(error: octocrab::Error) -> AppError {
    package_operation_error(error, true)
}

fn package_write_error(error: octocrab::Error) -> AppError {
    package_operation_error(error, true)
}

fn package_error(error: octocrab::Error) -> AppError {
    package_operation_error(error, false)
}

fn package_operation_error(
    error: octocrab::Error,
    hidden_resource_may_mean_scope: bool,
) -> AppError {
    let status = match &error {
        octocrab::Error::GitHub { source, .. } => Some(source.status_code.as_u16()),
        _ => None,
    };
    if package_status_requires_reconnect(status, hidden_resource_may_mean_scope) {
        return package_permission_error();
    }
    let mapped = github_error(error);
    match mapped {
        AppError::GitHubPermission(_) => package_permission_error(),
        AppError::GitHub(message)
            if message
                .to_ascii_lowercase()
                .contains("resource not accessible") =>
        {
            package_permission_error()
        }
        other => other,
    }
}

fn package_status_requires_reconnect(
    status: Option<u16>,
    hidden_resource_may_mean_scope: bool,
) -> bool {
    hidden_resource_may_mean_scope && status == Some(404)
}

fn package_permission_error() -> AppError {
    AppError::GitHubPermission(
        "reconnect GitHub and grant read:packages, write:packages, and delete:packages to manage personal Packages"
            .to_string(),
    )
}
