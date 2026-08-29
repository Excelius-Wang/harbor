use async_trait::async_trait;
use http_body_util::BodyExt;
use octocrab::models::repos::{Asset, Release};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio_util::io::ReaderStream;

use super::{
    authenticated_client, download::safe_download_name, download::safe_download_name_with_suffix,
    github_error, AppError, GitHubFileDownload, GitHubReactionSubjectKind,
    GitHubReactionSubjectRef, GitHubService, OctocrabGitHubClient,
};

const RELEASE_PAGE_SIZE: u8 = 30;
const MAX_RELEASE_ASSET_SIZE: u64 = 2 * 1024 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubReleaseArchiveFormat {
    Zip,
    TarGz,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReleaseAsset {
    pub id: u64,
    pub name: String,
    pub label: Option<String>,
    pub state: String,
    pub content_type: String,
    pub size: u64,
    pub digest: Option<String>,
    pub download_count: u64,
    pub created_at: String,
    pub updated_at: String,
    pub uploader: Option<String>,
    pub uploader_avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRelease {
    pub id: u64,
    pub reaction_subject: GitHubReactionSubjectRef,
    pub tag_name: String,
    pub target_commitish: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub url: String,
    pub draft: bool,
    pub prerelease: bool,
    pub immutable: bool,
    pub created_at: Option<String>,
    pub published_at: Option<String>,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub has_zipball: bool,
    pub has_tarball: bool,
    pub assets: Vec<GitHubReleaseAsset>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReleasePage {
    pub releases: Vec<GitHubRelease>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReleaseMutationInput {
    pub tag_name: String,
    pub target_commitish: String,
    pub name: String,
    pub body: String,
    pub draft: bool,
    pub prerelease: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GitHubReleaseAssetUpload {
    pub path: PathBuf,
    pub name: String,
    pub size: u64,
}

#[async_trait]
pub(crate) trait GitHubReleaseClient: Send + Sync {
    async fn list_releases(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubReleasePage, AppError>;

    async fn release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<GitHubRelease, AppError>;

    async fn download_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<GitHubFileDownload, AppError>;

    async fn download_release_archive(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        format: GitHubReleaseArchiveFormat,
    ) -> Result<GitHubFileDownload, AppError>;

    async fn create_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError>;

    async fn update_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        input: &GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError>;

    async fn delete_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<(), AppError>;

    async fn upload_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        upload: &GitHubReleaseAssetUpload,
    ) -> Result<GitHubReleaseAsset, AppError>;

    async fn delete_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<(), AppError>;
}

#[async_trait]
impl GitHubReleaseClient for OctocrabGitHubClient {
    async fn list_releases(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubReleasePage, AppError> {
        let response = authenticated_client(token)?
            .repos(owner, repository)
            .releases()
            .list()
            .per_page(RELEASE_PAGE_SIZE)
            .page(page)
            .send()
            .await
            .map_err(github_error)?;
        let has_more = response.next.is_some();
        Ok(GitHubReleasePage {
            releases: response
                .items
                .into_iter()
                .map(release_from_octocrab)
                .collect::<Result<Vec<_>, _>>()?,
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<GitHubRelease, AppError> {
        let release = authenticated_client(token)?
            .repos(owner, repository)
            .releases()
            .get(release_id)
            .await
            .map_err(github_error)?;
        ensure_release_id(&release, release_id)?;
        release_from_octocrab(release)
    }

    async fn download_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<GitHubFileDownload, AppError> {
        let client = authenticated_client(token)?;
        let release = client
            .repos(owner, repository)
            .releases()
            .get(release_id)
            .await
            .map_err(github_error)?;
        ensure_release_id(&release, release_id)?;
        let asset = release
            .assets
            .iter()
            .find(|asset| asset.id.into_inner() == asset_id)
            .ok_or_else(|| {
                AppError::Validation(
                    "release asset does not belong to the selected release".to_string(),
                )
            })?;
        ensure_release_asset_download_allowed(asset)?;
        let bytes = download_github_binary(
            &client,
            release_asset_route(owner, repository, asset_id),
            "application/octet-stream",
        )
        .await?;
        if usize::try_from(asset.size).is_ok_and(|size| size != bytes.len()) {
            return Err(AppError::GitHub(
                "GitHub returned an incomplete release asset".to_string(),
            ));
        }
        Ok(GitHubFileDownload { bytes })
    }

    async fn download_release_archive(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        format: GitHubReleaseArchiveFormat,
    ) -> Result<GitHubFileDownload, AppError> {
        let client = authenticated_client(token)?;
        let release = client
            .repos(owner, repository)
            .releases()
            .get(release_id)
            .await
            .map_err(github_error)?;
        ensure_release_id(&release, release_id)?;
        let archive_url = match format {
            GitHubReleaseArchiveFormat::Zip => release.zipball_url,
            GitHubReleaseArchiveFormat::TarGz => release.tarball_url,
        }
        .ok_or_else(|| {
            AppError::Validation(
                "this release does not expose the selected source archive".to_string(),
            )
        })?;
        let bytes = download_github_binary(
            &client,
            archive_url.as_str(),
            "application/octet-stream, application/json",
        )
        .await?;
        Ok(GitHubFileDownload { bytes })
    }

    async fn create_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError> {
        let client = authenticated_client(token)?;
        let repo = client.repos(owner, repository);
        let releases = repo.releases();
        let release = releases
            .create(&input.tag_name)
            .target_commitish(&input.target_commitish)
            .name(&input.name)
            .body(&input.body)
            .draft(input.draft)
            .prerelease(input.prerelease)
            .send()
            .await
            .map_err(github_error)?;
        ensure_release_tag(&release, &input.tag_name)?;
        release_from_octocrab(release)
    }

    async fn update_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        input: &GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError> {
        let client = authenticated_client(token)?;
        let repo = client.repos(owner, repository);
        let releases = repo.releases();
        let current = releases.get(release_id).await.map_err(github_error)?;
        ensure_release_id(&current, release_id)?;
        ensure_release_update_allowed(&current, input)?;
        let release = if current.immutable.unwrap_or(false) {
            releases
                .update(release_id)
                .name(&input.name)
                .body(&input.body)
                .send()
                .await
        } else {
            releases
                .update(release_id)
                .tag_name(&input.tag_name)
                .target_commitish(&input.target_commitish)
                .name(&input.name)
                .body(&input.body)
                .draft(input.draft)
                .prerelease(input.prerelease)
                .send()
                .await
        }
        .map_err(github_error)?;
        ensure_release_id(&release, release_id)?;
        release_from_octocrab(release)
    }

    async fn delete_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let repo = client.repos(owner, repository);
        let releases = repo.releases();
        let current = releases.get(release_id).await.map_err(github_error)?;
        ensure_release_id(&current, release_id)?;
        releases.delete(release_id).await.map_err(github_error)
    }

    async fn upload_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        upload: &GitHubReleaseAssetUpload,
    ) -> Result<GitHubReleaseAsset, AppError> {
        let client = authenticated_client(token)?;
        let release = client
            .repos(owner, repository)
            .releases()
            .get(release_id)
            .await
            .map_err(github_error)?;
        ensure_release_id(&release, release_id)?;
        ensure_release_assets_mutable(&release)?;
        let upload_url = release_asset_upload_url(&release, upload)?;
        let file = tokio::fs::File::open(&upload.path)
            .await
            .map_err(|error| AppError::FileSystem(error.to_string()))?;
        let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
        let response = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| AppError::GitHub(error.to_string()))?
            .post(upload_url)
            .bearer_auth(token)
            .header(http::header::ACCEPT.as_str(), "application/vnd.github+json")
            .header(
                http::header::CONTENT_TYPE.as_str(),
                "application/octet-stream",
            )
            .header(http::header::CONTENT_LENGTH.as_str(), upload.size)
            .body(body)
            .send()
            .await
            .map_err(|error| AppError::GitHub(error.to_string()))?;
        let status = response.status();
        let response_bytes = response
            .bytes()
            .await
            .map_err(|error| AppError::GitHub(error.to_string()))?;
        if !status.is_success() {
            return Err(github_upload_error(status, &response_bytes));
        }
        let asset: Asset = serde_json::from_slice(&response_bytes)
            .map_err(|error| AppError::GitHub(error.to_string()))?;
        release_asset_from_octocrab(asset)
    }

    async fn delete_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let release = client
            .repos(owner, repository)
            .releases()
            .get(release_id)
            .await
            .map_err(github_error)?;
        ensure_release_id(&release, release_id)?;
        ensure_release_assets_mutable(&release)?;
        ensure_release_asset(&release, asset_id)?;
        client
            .repos(owner, repository)
            .release_assets()
            .delete(asset_id)
            .await
            .map_err(github_error)
    }
}

impl GitHubService {
    pub async fn releases(
        &self,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubReleasePage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_releases(&token, owner, repository, page)
            .await
    }

    pub async fn release(
        &self,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<GitHubRelease, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .release(&token, owner, repository, release_id)
            .await
    }

    pub async fn download_release_asset(
        &self,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<GitHubFileDownload, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .download_release_asset(&token, owner, repository, release_id, asset_id)
            .await
    }

    pub async fn download_release_archive(
        &self,
        owner: &str,
        repository: &str,
        release_id: u64,
        format: GitHubReleaseArchiveFormat,
    ) -> Result<GitHubFileDownload, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .download_release_archive(&token, owner, repository, release_id, format)
            .await
    }

    pub async fn create_release(
        &self,
        owner: &str,
        repository: &str,
        input: GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError> {
        let input = validate_release_input(input)?;
        let token = self.load_access_token().await?;
        self.client
            .create_release(&token, owner, repository, &input)
            .await
    }

    pub async fn update_release(
        &self,
        owner: &str,
        repository: &str,
        release_id: u64,
        input: GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError> {
        let input = validate_release_input(input)?;
        let token = self.load_access_token().await?;
        self.client
            .update_release(&token, owner, repository, release_id, &input)
            .await
    }

    pub async fn delete_release(
        &self,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_release(&token, owner, repository, release_id)
            .await
    }

    pub async fn upload_release_asset(
        &self,
        owner: &str,
        repository: &str,
        release_id: u64,
        upload: GitHubReleaseAssetUpload,
    ) -> Result<GitHubReleaseAsset, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .upload_release_asset(&token, owner, repository, release_id, &upload)
            .await
    }

    pub async fn delete_release_asset(
        &self,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_release_asset(&token, owner, repository, release_id, asset_id)
            .await
    }
}

pub(crate) async fn release_asset_upload(
    path: PathBuf,
) -> Result<GitHubReleaseAssetUpload, AppError> {
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|error| AppError::FileSystem(error.to_string()))?;
    if !metadata.is_file() {
        return Err(AppError::Validation(
            "release asset must be a regular file".to_string(),
        ));
    }
    if metadata.len() >= MAX_RELEASE_ASSET_SIZE {
        return Err(AppError::Validation(
            "release assets must be smaller than 2 GiB".to_string(),
        ));
    }
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| AppError::Validation("release asset name is invalid".to_string()))?;
    Ok(GitHubReleaseAssetUpload {
        path,
        name,
        size: metadata.len(),
    })
}

pub(crate) fn release_asset_download_name(name: &str) -> String {
    safe_download_name(name, "release-asset")
}

pub(crate) fn release_archive_download_name(
    tag_name: &str,
    format: GitHubReleaseArchiveFormat,
) -> String {
    let (fallback, suffix) = match format {
        GitHubReleaseArchiveFormat::Zip => ("source", ".zip"),
        GitHubReleaseArchiveFormat::TarGz => ("source", ".tar.gz"),
    };
    safe_download_name_with_suffix(tag_name, fallback, suffix)
}

fn validate_release_input(
    mut input: GitHubReleaseMutationInput,
) -> Result<GitHubReleaseMutationInput, AppError> {
    input.tag_name = input.tag_name.trim().to_string();
    input.target_commitish = input.target_commitish.trim().to_string();
    input.name = input.name.trim().to_string();
    if input.tag_name.is_empty()
        || input.tag_name.len() > 512
        || input.tag_name.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "release tag name is invalid".to_string(),
        ));
    }
    if input.target_commitish.is_empty()
        || input.target_commitish.len() > 512
        || input.target_commitish.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "release target is invalid".to_string(),
        ));
    }
    if input.name.len() > 256 || input.name.chars().any(char::is_control) {
        return Err(AppError::Validation("release title is invalid".to_string()));
    }
    if input.body.contains('\0') {
        return Err(AppError::Validation(
            "release notes are invalid".to_string(),
        ));
    }
    Ok(input)
}

fn ensure_release_tag(release: &Release, tag_name: &str) -> Result<(), AppError> {
    if release.tag_name == tag_name {
        Ok(())
    } else {
        Err(AppError::GitHub(
            "GitHub returned a release for an unexpected tag".to_string(),
        ))
    }
}

fn ensure_release_update_allowed(
    release: &Release,
    input: &GitHubReleaseMutationInput,
) -> Result<(), AppError> {
    if !release.immutable.unwrap_or(false)
        || (release.tag_name == input.tag_name
            && release.target_commitish == input.target_commitish
            && release.draft == input.draft
            && release.prerelease == input.prerelease)
    {
        Ok(())
    } else {
        Err(AppError::Validation(
            "immutable releases can only change their title and notes".to_string(),
        ))
    }
}

fn ensure_release_assets_mutable(release: &Release) -> Result<(), AppError> {
    if release.immutable.unwrap_or(false) {
        Err(AppError::Validation(
            "immutable release assets cannot be changed".to_string(),
        ))
    } else {
        Ok(())
    }
}

fn ensure_release_asset(release: &Release, asset_id: u64) -> Result<(), AppError> {
    if release
        .assets
        .iter()
        .any(|asset| asset.id.into_inner() == asset_id)
    {
        Ok(())
    } else {
        Err(AppError::Validation(
            "release asset does not belong to the selected release".to_string(),
        ))
    }
}

fn release_asset_upload_url(
    release: &Release,
    upload: &GitHubReleaseAssetUpload,
) -> Result<reqwest::Url, AppError> {
    let base = release
        .upload_url
        .as_str()
        .strip_suffix("{?name,label}")
        .unwrap_or(release.upload_url.as_str());
    let mut url = reqwest::Url::parse(base).map_err(|_| {
        AppError::GitHub("GitHub returned an invalid release upload URL".to_string())
    })?;
    if url.scheme() != "https" || url.host_str() != Some("uploads.github.com") {
        return Err(AppError::GitHub(
            "GitHub returned an untrusted release upload URL".to_string(),
        ));
    }
    url.set_query(None);
    url.query_pairs_mut().append_pair("name", &upload.name);
    Ok(url)
}

fn github_upload_error(status: reqwest::StatusCode, body: &[u8]) -> AppError {
    let detail = serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|body| body.get("message")?.as_str().map(str::to_string))
        .unwrap_or_else(|| {
            status
                .canonical_reason()
                .unwrap_or("request failed")
                .to_string()
        });
    let message = format!("GitHub returned {status} while uploading a release asset: {detail}");
    let detail = detail.to_ascii_lowercase();
    if status.as_u16() == 429 || detail.contains("rate limit") || detail.contains("abuse detection")
    {
        AppError::GitHubRateLimited(message)
    } else if status.as_u16() == 403 {
        AppError::GitHubPermission(message)
    } else if status.as_u16() == 401 {
        AppError::GitHubAuthentication(message)
    } else {
        AppError::GitHub(message)
    }
}

fn ensure_release_id(release: &Release, release_id: u64) -> Result<(), AppError> {
    if release.id.into_inner() == release_id {
        Ok(())
    } else {
        Err(AppError::GitHub(
            "GitHub returned an unexpected release".to_string(),
        ))
    }
}

fn ensure_release_asset_download_allowed(asset: &Asset) -> Result<(), AppError> {
    if !asset.state.eq_ignore_ascii_case("uploaded") {
        return Err(AppError::Validation(
            "release asset is not ready to download".to_string(),
        ));
    }
    if asset.size < 0 {
        return Err(AppError::GitHub(
            "GitHub returned an invalid release asset size".to_string(),
        ));
    }
    Ok(())
}

fn release_asset_route(owner: &str, repository: &str, asset_id: u64) -> String {
    format!("/repos/{owner}/{repository}/releases/assets/{asset_id}")
}

async fn download_github_binary(
    client: &octocrab::Octocrab,
    route: impl AsRef<str>,
    accept: &'static str,
) -> Result<Vec<u8>, AppError> {
    let request = http::Request::builder()
        .method(http::Method::GET)
        .uri(route.as_ref())
        .header(http::header::ACCEPT, accept);
    let request = client
        .build_request(request, None::<&()>)
        .map_err(github_error)?;
    let response = client.execute(request).await.map_err(github_error)?;
    let response = client
        .follow_location_to_data(response)
        .await
        .map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(github_error)?
        .to_bytes();
    Ok(bytes.to_vec())
}

fn release_from_octocrab(release: Release) -> Result<GitHubRelease, AppError> {
    let author = release
        .author
        .map(|author| (author.login, Some(author.avatar_url.to_string())));
    Ok(GitHubRelease {
        id: release.id.into_inner(),
        reaction_subject: GitHubReactionSubjectRef {
            id: release.node_id,
            kind: GitHubReactionSubjectKind::Release,
        },
        tag_name: release.tag_name,
        target_commitish: release.target_commitish,
        name: release.name,
        body: release.body,
        url: release.html_url.to_string(),
        draft: release.draft,
        prerelease: release.prerelease,
        immutable: release.immutable.unwrap_or(false),
        created_at: release.created_at.map(|date| date.to_rfc3339()),
        published_at: release.published_at.map(|date| date.to_rfc3339()),
        author: author.as_ref().map(|(login, _)| login.clone()),
        author_avatar_url: author.and_then(|(_, avatar_url)| avatar_url),
        has_zipball: release.zipball_url.is_some(),
        has_tarball: release.tarball_url.is_some(),
        assets: release
            .assets
            .into_iter()
            .map(release_asset_from_octocrab)
            .collect::<Result<Vec<_>, _>>()?,
    })
}

fn release_asset_from_octocrab(asset: Asset) -> Result<GitHubReleaseAsset, AppError> {
    let size = u64::try_from(asset.size).map_err(|_| {
        AppError::GitHub("GitHub returned an invalid release asset size".to_string())
    })?;
    let download_count = u64::try_from(asset.download_count).map_err(|_| {
        AppError::GitHub("GitHub returned an invalid release asset download count".to_string())
    })?;
    let uploader = asset
        .uploader
        .map(|uploader| (uploader.login, uploader.avatar_url.to_string()));
    Ok(GitHubReleaseAsset {
        id: asset.id.into_inner(),
        name: asset.name,
        label: asset.label,
        state: asset.state,
        content_type: asset.content_type,
        size,
        digest: asset.digest,
        download_count,
        created_at: asset.created_at.to_rfc3339(),
        updated_at: asset.updated_at.to_rfc3339(),
        uploader: uploader.as_ref().map(|(login, _)| login.clone()),
        uploader_avatar_url: uploader.map(|(_, avatar_url)| avatar_url),
    })
}

#[cfg(test)]
mod tests;
