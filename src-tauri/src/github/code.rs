use async_trait::async_trait;
use base64::Engine;
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, is_not_found, GitHubFileDownload, GitHubService,
    OctocrabGitHubClient,
};
use crate::error::AppError;

pub(crate) mod write;

const MAX_FILE_PREVIEW_BYTES: i64 = 1_000_000;
const MAX_FILE_PREVIEW_LINES: usize = 10_000;
const CODE_PAGE_SIZE: u8 = 30;
const CODE_REFERENCE_PAGE_SIZE: u8 = 100;
const CODE_SEARCH_RESULT_LIMIT: u64 = 1_000;
const COMMIT_FILE_PAGE_SIZE: u8 = 100;
const MAX_COMMIT_FILE_PAGES: u32 = 30;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubBranch {
    pub name: String,
    pub sha: String,
    pub protected: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitSummary {
    pub sha: String,
    pub short_sha: String,
    pub title: String,
    pub author: Option<String>,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryCommit {
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
pub struct GitHubRepositoryCommitPage {
    pub commits: Vec<GitHubRepositoryCommit>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitActor {
    pub name: Option<String>,
    pub email: Option<String>,
    pub login: Option<String>,
    pub avatar_url: Option<String>,
    pub date: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitParent {
    pub sha: String,
    pub short_sha: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitStats {
    pub additions: u64,
    pub deletions: u64,
    pub total: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitVerification {
    pub verified: bool,
    pub reason: String,
    pub verified_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubChangedFile {
    pub sha: Option<String>,
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    pub changes: u64,
    pub patch: Option<String>,
    pub blob_url: Option<String>,
    pub raw_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitDetail {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub url: String,
    pub author: Option<GitHubCommitActor>,
    pub committer: Option<GitHubCommitActor>,
    pub parents: Vec<GitHubCommitParent>,
    pub stats: Option<GitHubCommitStats>,
    pub verification: Option<GitHubCommitVerification>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCommitDetailPage {
    pub commit: GitHubCommitDetail,
    pub files: Vec<GitHubChangedFile>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
    pub files_at_limit: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTag {
    pub name: String,
    pub sha: String,
    pub zipball_url: String,
    pub tarball_url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubTagPage {
    pub tags: Vec<GitHubTag>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubBlameRange {
    pub starting_line: u32,
    pub ending_line: u32,
    pub age: u8,
    pub commit: GitHubRepositoryCommit,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubBlame {
    pub ranges: Vec<GitHubBlameRange>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeSearchResult {
    pub name: String,
    pub path: String,
    pub sha: String,
    pub url: String,
    pub fragment: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeSearchPage {
    pub results: Vec<GitHubCodeSearchResult>,
    pub total_count: u64,
    pub incomplete_results: bool,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReadme {
    pub name: String,
    pub path: String,
    pub content: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCodeOverview {
    pub branches: Vec<GitHubBranch>,
    pub tags: Vec<GitHubTag>,
    pub tags_have_more: bool,
    pub commits: Vec<GitHubCommitSummary>,
    pub commits_have_more: bool,
    pub readme: Option<GitHubReadme>,
    pub can_write: bool,
    pub is_archived: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContentEntry {
    pub name: String,
    pub path: String,
    pub sha: String,
    pub kind: String,
    pub size: i64,
    pub url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubContentListing {
    pub entries: Vec<GitHubContentEntry>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubFilePreview {
    Text {
        name: String,
        path: String,
        sha: String,
        size: i64,
        url: Option<String>,
        raw_url: Option<String>,
        content: String,
    },
    Unsupported {
        name: String,
        path: String,
        sha: String,
        size: i64,
        url: Option<String>,
        raw_url: Option<String>,
        reason: GitHubFilePreviewUnsupportedReason,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubFilePreviewUnsupportedReason {
    Binary,
    TooLarge,
}

#[async_trait]
pub(crate) trait GitHubCodeClient: Send + Sync {
    async fn repository_code_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
    ) -> Result<GitHubCodeOverview, AppError>;

    async fn repository_commits(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCommitPage, AppError>;

    async fn repository_commit_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        page: u32,
    ) -> Result<GitHubCommitDetailPage, AppError>;

    async fn repository_tags(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubTagPage, AppError>;

    async fn repository_blame(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubBlame, AppError>;

    async fn search_repository_code(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        query: &str,
        page: u32,
    ) -> Result<GitHubCodeSearchPage, AppError>;

    async fn repository_contents(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubContentListing, AppError>;

    async fn repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFilePreview, AppError>;

    async fn download_repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFileDownload, AppError>;
}

impl GitHubService {
    pub async fn code_overview(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
    ) -> Result<GitHubCodeOverview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_code_overview(&token, owner, repository, reference)
            .await
    }

    pub async fn commits(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCommitPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_commits(&token, owner, repository, reference, path, page)
            .await
    }

    pub async fn commit_detail(
        &self,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        page: u32,
    ) -> Result<GitHubCommitDetailPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_commit_detail(&token, owner, repository, commit_sha, page)
            .await
    }

    pub async fn tags(
        &self,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubTagPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_tags(&token, owner, repository, page)
            .await
    }

    pub async fn blame(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubBlame, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_blame(&token, owner, repository, reference, path)
            .await
    }

    pub async fn search_code(
        &self,
        owner: &str,
        repository: &str,
        query: &str,
        page: u32,
    ) -> Result<GitHubCodeSearchPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .search_repository_code(&token, owner, repository, query, page)
            .await
    }

    pub async fn contents(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubContentListing, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_contents(&token, owner, repository, reference, path)
            .await
    }

    pub async fn file(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFilePreview, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .repository_file(&token, owner, repository, reference, path)
            .await
    }

    pub async fn download_file(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFileDownload, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .download_repository_file(&token, owner, repository, reference, path)
            .await
    }
}

#[async_trait]
impl GitHubCodeClient for OctocrabGitHubClient {
    async fn repository_code_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
    ) -> Result<GitHubCodeOverview, AppError> {
        let client = authenticated_client(token)?;
        let repository_handler = client.repos(owner, repository);
        let (repository_data, branches, tags, commits, readme) = tokio::join!(
            repository_handler.get(),
            repository_handler.list_branches().per_page(100).send(),
            repository_handler
                .list_tags()
                .per_page(CODE_REFERENCE_PAGE_SIZE)
                .send(),
            repository_handler
                .list_commits()
                .branch(reference)
                .per_page(8)
                .send(),
            repository_handler.get_readme().r#ref(reference).send(),
        );
        let repository_data = repository_data.map_err(github_error)?;
        let branches = branches.map_err(github_error)?;
        let repository_is_empty = branches.items.is_empty();
        let tags = tags.map_err(github_error)?;
        let (commits, commits_have_more) = match commits {
            Ok(commits) => (commits.items, commits.next.is_some()),
            Err(error) if repository_is_empty && is_empty_repository_error(&error) => {
                (Vec::new(), false)
            }
            Err(error) => return Err(github_error(error)),
        };
        let readme = match readme {
            Ok(readme) => Some(readme_from_octocrab(readme)?),
            Err(error) if is_not_found(&error) => None,
            Err(error) => return Err(github_error(error)),
        };

        Ok(GitHubCodeOverview {
            branches: branches
                .items
                .into_iter()
                .map(branch_from_octocrab)
                .collect(),
            tags_have_more: tags.next.is_some(),
            tags: tags.items.into_iter().map(tag_from_octocrab).collect(),
            commits: commits.into_iter().map(commit_from_octocrab).collect(),
            commits_have_more,
            readme,
            can_write: repository_data
                .permissions
                .as_ref()
                .is_some_and(|permissions| permissions.push),
            is_archived: repository_data.archived.unwrap_or(false),
        })
    }

    async fn repository_commits(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCommitPage, AppError> {
        let client = authenticated_client(token)?;
        let repository_handler = client.repos(owner, repository);
        let mut request = repository_handler
            .list_commits()
            .sha(reference)
            .per_page(CODE_PAGE_SIZE)
            .page(page);
        if !path.is_empty() {
            request = request.path(path);
        }
        let commits = request.send().await.map_err(github_error)?;

        Ok(GitHubRepositoryCommitPage {
            commits: commits
                .items
                .into_iter()
                .map(repository_commit_from_octocrab)
                .collect(),
            page,
            has_previous: page > 1,
            has_more: commits.next.is_some(),
        })
    }

    async fn repository_commit_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        commit_sha: &str,
        page: u32,
    ) -> Result<GitHubCommitDetailPage, AppError> {
        let client = authenticated_client(token)?;
        request_repository_commit_detail(&client, owner, repository, commit_sha, page).await
    }

    async fn repository_tags(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubTagPage, AppError> {
        let client = authenticated_client(token)?;
        let tags = client
            .repos(owner, repository)
            .list_tags()
            .per_page(CODE_PAGE_SIZE)
            .page(page)
            .send()
            .await
            .map_err(github_error)?;

        Ok(GitHubTagPage {
            tags: tags.items.into_iter().map(tag_from_octocrab).collect(),
            page,
            has_previous: page > 1,
            has_more: tags.next.is_some(),
        })
    }

    async fn repository_blame(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubBlame, AppError> {
        let client = authenticated_client(token)?;
        let commit_expression = format!("{reference}^{{commit}}");
        let payload = serde_json::json!({
            "query": REPOSITORY_BLAME_QUERY,
            "variables": {
                "owner": owner,
                "repository": repository,
                "reference": commit_expression,
                "path": path,
            }
        });
        let response: RepositoryBlameQuery =
            client.graphql(&payload).await.map_err(github_error)?;
        let ranges = response
            .repository
            .and_then(|repository| repository.object)
            .map(|object| object.blame.ranges)
            .ok_or_else(|| {
                AppError::GitHub("GitHub did not return blame information".to_string())
            })?;

        Ok(GitHubBlame {
            ranges: ranges.into_iter().map(blame_range_from_graphql).collect(),
        })
    }

    async fn search_repository_code(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        query: &str,
        page: u32,
    ) -> Result<GitHubCodeSearchPage, AppError> {
        let client = authenticated_client(token)?;
        let scoped_query = repository_code_search_query(owner, repository, query);
        let parameters = CodeSearchParameters {
            query: &scoped_query,
            per_page: CODE_PAGE_SIZE,
            page,
        };
        let mut headers = http::HeaderMap::new();
        headers.insert(
            http::header::ACCEPT,
            http::HeaderValue::from_static("application/vnd.github.text-match+json"),
        );
        let response: CodeSearchResponse = client
            .get_with_headers("/search/code", Some(&parameters), Some(headers))
            .await
            .map_err(github_error)?;
        let reachable_count = response.total_count.min(CODE_SEARCH_RESULT_LIMIT);

        Ok(GitHubCodeSearchPage {
            results: response
                .items
                .into_iter()
                .map(code_search_result_from_github)
                .collect(),
            total_count: response.total_count,
            incomplete_results: response.incomplete_results,
            page,
            has_previous: page > 1,
            has_more: u64::from(page) * u64::from(CODE_PAGE_SIZE) < reachable_count,
        })
    }

    async fn repository_contents(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubContentListing, AppError> {
        let client = authenticated_client(token)?;
        let contents = client
            .repos(owner, repository)
            .get_content()
            .path(path)
            .r#ref(reference)
            .send()
            .await
            .map_err(github_error)?;

        Ok(content_listing_from_octocrab(contents.items))
    }

    async fn repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFilePreview, AppError> {
        let client = authenticated_client(token)?;
        let contents = client
            .repos(owner, repository)
            .get_content()
            .path(path)
            .r#ref(reference)
            .send()
            .await
            .map_err(github_error)?;

        file_preview_from_octocrab(contents.items)
    }

    async fn download_repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFileDownload, AppError> {
        let client = authenticated_client(token)?;
        let contents = client
            .repos(owner, repository)
            .get_content()
            .path(path)
            .r#ref(reference)
            .send()
            .await
            .map_err(github_error)?;
        let file = single_repository_file(contents.items)?;
        let raw_url = file.download_url.clone().ok_or_else(|| {
            AppError::GitHub("GitHub did not return a download URL for this file".to_string())
        })?;
        let bytes = client
            .download(raw_url, "application/octet-stream")
            .await
            .map_err(github_error)?;

        Ok(GitHubFileDownload { bytes })
    }
}

#[derive(Serialize)]
struct CodeSearchParameters<'a> {
    #[serde(rename = "q")]
    query: &'a str,
    per_page: u8,
    page: u32,
}

#[derive(Deserialize)]
struct CodeSearchResponse {
    total_count: u64,
    incomplete_results: bool,
    items: Vec<CodeSearchItem>,
}

#[derive(Deserialize)]
struct CodeSearchItem {
    name: String,
    path: String,
    sha: String,
    html_url: String,
    text_matches: Option<Vec<CodeSearchTextMatch>>,
}

#[derive(Deserialize)]
struct CodeSearchTextMatch {
    fragment: Option<String>,
}

#[derive(Deserialize)]
struct RawCommitDetail {
    sha: String,
    html_url: String,
    commit: RawGitCommit,
    author: Option<RawCommitAccount>,
    committer: Option<RawCommitAccount>,
    parents: Vec<RawCommitParent>,
    stats: Option<RawCommitStats>,
    files: Option<Vec<RawChangedFile>>,
}

#[derive(Deserialize)]
struct RawGitCommit {
    message: String,
    author: Option<RawGitActor>,
    committer: Option<RawGitActor>,
    verification: Option<RawCommitVerification>,
}

#[derive(Deserialize)]
struct RawGitActor {
    name: Option<String>,
    email: Option<String>,
    date: Option<String>,
}

#[derive(Deserialize)]
struct RawCommitAccount {
    login: String,
    avatar_url: String,
}

#[derive(Deserialize)]
struct RawCommitParent {
    sha: String,
    html_url: String,
}

#[derive(Deserialize)]
struct RawCommitStats {
    additions: u64,
    deletions: u64,
    total: u64,
}

#[derive(Deserialize)]
struct RawCommitVerification {
    verified: bool,
    reason: String,
    verified_at: Option<String>,
}

#[derive(Deserialize)]
struct RawChangedFile {
    sha: Option<String>,
    filename: String,
    previous_filename: Option<String>,
    status: String,
    additions: u64,
    deletions: u64,
    changes: u64,
    patch: Option<String>,
    blob_url: Option<String>,
    raw_url: Option<String>,
}

async fn request_repository_commit_detail(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    commit_sha: &str,
    page: u32,
) -> Result<GitHubCommitDetailPage, AppError> {
    let request = http::Request::builder()
        .method(http::Method::GET)
        .uri(commit_detail_route(owner, repository, commit_sha, page))
        .header(http::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2026-03-10");
    let request = client
        .build_request(request, None::<&()>)
        .map_err(github_error)?;
    let response = client.execute(request).await.map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(commit_detail_error)?;
    let has_more_from_link = response
        .headers()
        .get(http::header::LINK)
        .and_then(|value| value.to_str().ok())
        .is_some_and(link_header_has_next);
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(github_error)?
        .to_bytes();
    let raw: RawCommitDetail = serde_json::from_slice(&bytes)
        .map_err(|error| AppError::GitHub(format!("GitHub returned an invalid commit: {error}")))?;

    commit_detail_page_from_raw(raw, commit_sha, page, has_more_from_link)
}

fn commit_detail_error(error: octocrab::Error) -> AppError {
    let status = match &error {
        octocrab::Error::GitHub { source, .. } => source.status_code.as_u16(),
        _ => return github_error(error),
    };
    commit_detail_status_error(status, error.to_string()).unwrap_or_else(|| github_error(error))
}

fn commit_detail_status_error(status: u16, message: String) -> Option<AppError> {
    match status {
        404 => Some(AppError::GitHubPermission(
            "the commit is unavailable or inaccessible".to_string(),
        )),
        409 => Some(AppError::GitHubCodeConflict(message)),
        422 => Some(AppError::Validation(format!(
            "commit detail is unavailable: {message}"
        ))),
        _ => None,
    }
}

fn commit_detail_route(owner: &str, repository: &str, commit_sha: &str, page: u32) -> String {
    format!(
        "/repos/{owner}/{repository}/commits/{commit_sha}?per_page={COMMIT_FILE_PAGE_SIZE}&page={page}"
    )
}

fn link_header_has_next(value: &str) -> bool {
    value.split(',').any(|part| {
        part.split(';')
            .skip(1)
            .any(|parameter| parameter.trim() == "rel=\"next\"")
    })
}

fn commit_detail_page_from_raw(
    raw: RawCommitDetail,
    requested_sha: &str,
    page: u32,
    has_more_from_link: bool,
) -> Result<GitHubCommitDetailPage, AppError> {
    if raw.sha != requested_sha {
        return Err(AppError::GitHub(
            "GitHub returned a different repository commit".to_string(),
        ));
    }

    let RawCommitDetail {
        sha,
        html_url,
        commit,
        author,
        committer,
        parents,
        stats,
        files,
    } = raw;
    let files = files.unwrap_or_default();
    let files_at_limit = page == MAX_COMMIT_FILE_PAGES
        && (has_more_from_link || files.len() == usize::from(COMMIT_FILE_PAGE_SIZE));
    let has_more = page < MAX_COMMIT_FILE_PAGES && has_more_from_link;
    let RawGitCommit {
        message,
        author: git_author,
        committer: git_committer,
        verification,
    } = commit;

    Ok(GitHubCommitDetailPage {
        commit: GitHubCommitDetail {
            short_sha: sha.chars().take(7).collect(),
            sha,
            message,
            url: html_url,
            author: commit_actor_from_raw(git_author, author),
            committer: commit_actor_from_raw(git_committer, committer),
            parents: parents
                .into_iter()
                .map(|parent| GitHubCommitParent {
                    short_sha: parent.sha.chars().take(7).collect(),
                    sha: parent.sha,
                    url: parent.html_url,
                })
                .collect(),
            stats: stats.map(|stats| GitHubCommitStats {
                additions: stats.additions,
                deletions: stats.deletions,
                total: stats.total,
            }),
            verification: verification.map(|verification| GitHubCommitVerification {
                verified: verification.verified,
                reason: verification.reason,
                verified_at: verification.verified_at,
            }),
        },
        files: files
            .into_iter()
            .map(|file| GitHubChangedFile {
                sha: file.sha,
                path: file.filename,
                previous_path: file.previous_filename,
                status: file.status,
                additions: file.additions,
                deletions: file.deletions,
                changes: file.changes,
                patch: file.patch,
                blob_url: file.blob_url,
                raw_url: file.raw_url,
            })
            .collect(),
        page,
        has_previous: page > 1,
        has_more,
        files_at_limit,
    })
}

fn commit_actor_from_raw(
    actor: Option<RawGitActor>,
    account: Option<RawCommitAccount>,
) -> Option<GitHubCommitActor> {
    if actor.is_none() && account.is_none() {
        return None;
    }
    Some(GitHubCommitActor {
        name: actor.as_ref().and_then(|actor| actor.name.clone()),
        email: actor.as_ref().and_then(|actor| actor.email.clone()),
        date: actor.and_then(|actor| actor.date),
        login: account.as_ref().map(|account| account.login.clone()),
        avatar_url: account.map(|account| account.avatar_url),
    })
}

const REPOSITORY_BLAME_QUERY: &str = r#"
query RepositoryBlame($owner: String!, $repository: String!, $reference: String!, $path: String!) {
  repository(owner: $owner, name: $repository) {
    object(expression: $reference) {
      ... on Commit {
        blame(path: $path) {
          ranges {
            age
            startingLine
            endingLine
            commit {
              oid
              abbreviatedOid
              message
              messageHeadline
              committedDate
              url
              author {
                name
                user {
                  login
                  avatarUrl
                }
              }
            }
          }
        }
      }
    }
  }
}
"#;

#[derive(Deserialize)]
struct RepositoryBlameQuery {
    repository: Option<RepositoryBlameRepository>,
}

#[derive(Deserialize)]
struct RepositoryBlameRepository {
    object: Option<RepositoryBlameObject>,
}

#[derive(Deserialize)]
struct RepositoryBlameObject {
    blame: RepositoryBlameData,
}

#[derive(Deserialize)]
struct RepositoryBlameData {
    ranges: Vec<RepositoryBlameRange>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryBlameRange {
    starting_line: u32,
    ending_line: u32,
    age: u8,
    commit: RepositoryBlameCommit,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryBlameCommit {
    oid: String,
    abbreviated_oid: String,
    message: String,
    message_headline: String,
    committed_date: String,
    url: String,
    author: Option<RepositoryBlameAuthor>,
}

#[derive(Deserialize)]
struct RepositoryBlameAuthor {
    name: Option<String>,
    user: Option<RepositoryBlameUser>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepositoryBlameUser {
    login: String,
    avatar_url: String,
}

fn repository_code_search_query(owner: &str, repository: &str, query: &str) -> String {
    let terms = query
        .split_whitespace()
        .filter(|term| {
            let term = term
                .trim_matches(['(', ')'])
                .trim_start_matches('-')
                .to_ascii_lowercase();
            !["or", "and", "not"].contains(&term.as_str())
                && !["repo:", "org:", "user:"]
                    .iter()
                    .any(|prefix| term.starts_with(prefix))
        })
        .collect::<Vec<_>>()
        .join(" ");
    format!("{terms} repo:{owner}/{repository}")
}

pub(super) fn branch_from_octocrab(branch: octocrab::models::repos::Branch) -> GitHubBranch {
    GitHubBranch {
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected,
    }
}

fn tag_from_octocrab(tag: octocrab::models::repos::Tag) -> GitHubTag {
    GitHubTag {
        name: tag.name,
        sha: tag.commit.sha,
        zipball_url: tag.zipball_url.to_string(),
        tarball_url: tag.tarball_url.to_string(),
    }
}

fn commit_from_octocrab(commit: octocrab::models::repos::RepoCommit) -> GitHubCommitSummary {
    let author = commit
        .commit
        .author
        .as_ref()
        .map(|author| author.name.clone())
        .or_else(|| commit.author.as_ref().map(|author| author.login.clone()));
    let title = commit
        .commit
        .message
        .lines()
        .next()
        .unwrap_or_default()
        .to_string();
    let short_sha = commit.sha.chars().take(7).collect();

    GitHubCommitSummary {
        sha: commit.sha,
        short_sha,
        title,
        author,
        url: commit.html_url,
    }
}

fn repository_commit_from_octocrab(
    commit: octocrab::models::repos::RepoCommit,
) -> GitHubRepositoryCommit {
    let git_author = commit.commit.author.as_ref();
    let account_author = commit.author.as_ref();
    let message = commit.commit.message;
    let title = message.lines().next().unwrap_or_default().to_string();
    let short_sha = commit.sha.chars().take(7).collect();

    GitHubRepositoryCommit {
        sha: commit.sha,
        short_sha,
        title,
        message,
        author: git_author
            .map(|author| author.name.clone())
            .or_else(|| account_author.map(|author| author.login.clone())),
        author_login: account_author.map(|author| author.login.clone()),
        author_avatar_url: account_author.map(|author| author.avatar_url.to_string()),
        committed_at: git_author.and_then(|author| author.date.map(|date| date.to_rfc3339())),
        url: commit.html_url,
        verified: commit
            .commit
            .verification
            .as_ref()
            .map(|verification| verification.verified),
    }
}

fn blame_range_from_graphql(range: RepositoryBlameRange) -> GitHubBlameRange {
    let author_login = range
        .commit
        .author
        .as_ref()
        .and_then(|author| author.user.as_ref())
        .map(|user| user.login.clone());
    let author_avatar_url = range
        .commit
        .author
        .as_ref()
        .and_then(|author| author.user.as_ref())
        .map(|user| user.avatar_url.clone());
    let author = range
        .commit
        .author
        .as_ref()
        .and_then(|author| author.name.clone())
        .or_else(|| author_login.clone());

    GitHubBlameRange {
        starting_line: range.starting_line,
        ending_line: range.ending_line,
        age: range.age,
        commit: GitHubRepositoryCommit {
            sha: range.commit.oid,
            short_sha: range.commit.abbreviated_oid,
            title: range.commit.message_headline,
            message: range.commit.message,
            author,
            author_login,
            author_avatar_url,
            committed_at: Some(range.commit.committed_date),
            url: range.commit.url,
            verified: None,
        },
    }
}

fn code_search_result_from_github(item: CodeSearchItem) -> GitHubCodeSearchResult {
    let fragment = item
        .text_matches
        .unwrap_or_default()
        .into_iter()
        .find_map(|text_match| text_match.fragment)
        .map(|fragment| fragment.trim().to_string())
        .filter(|fragment| !fragment.is_empty());

    GitHubCodeSearchResult {
        name: item.name,
        path: item.path,
        sha: item.sha,
        url: item.html_url,
        fragment,
    }
}

fn readme_from_octocrab(
    content: octocrab::models::repos::Content,
) -> Result<GitHubReadme, AppError> {
    let encoded = content
        .content
        .as_deref()
        .ok_or_else(|| AppError::GitHub("GitHub did not return README content".to_string()))?;
    let decoded = decode_base64_content(encoded, "README")?;

    Ok(GitHubReadme {
        name: content.name,
        path: content.path,
        content: String::from_utf8_lossy(&decoded).into_owned(),
        url: content.html_url.unwrap_or(content.url),
    })
}

fn content_listing_from_octocrab(
    contents: Vec<octocrab::models::repos::Content>,
) -> GitHubContentListing {
    let mut entries = contents
        .into_iter()
        .map(content_entry_from_octocrab)
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        let left_is_directory = left.kind == "dir";
        let right_is_directory = right.kind == "dir";
        right_is_directory
            .cmp(&left_is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    GitHubContentListing { entries }
}

fn content_entry_from_octocrab(content: octocrab::models::repos::Content) -> GitHubContentEntry {
    GitHubContentEntry {
        name: content.name,
        path: content.path,
        sha: content.sha,
        kind: content.r#type,
        size: content.size,
        url: content.html_url,
    }
}

fn file_preview_from_octocrab(
    contents: Vec<octocrab::models::repos::Content>,
) -> Result<GitHubFilePreview, AppError> {
    let content = single_repository_file(contents)?;

    let unsupported = |reason| GitHubFilePreview::Unsupported {
        name: content.name.clone(),
        path: content.path.clone(),
        sha: content.sha.clone(),
        size: content.size,
        url: content.html_url.clone(),
        raw_url: content.download_url.clone(),
        reason,
    };
    if content.size > MAX_FILE_PREVIEW_BYTES {
        return Ok(unsupported(GitHubFilePreviewUnsupportedReason::TooLarge));
    }

    let encoded = content
        .content
        .as_deref()
        .ok_or_else(|| AppError::GitHub("GitHub did not return file content".to_string()))?;
    if content.encoding.as_deref() != Some("base64") {
        return Err(AppError::GitHub(
            "GitHub returned an unsupported file encoding".to_string(),
        ));
    }
    let decoded = decode_base64_content(encoded, "file")?;
    if decoded.contains(&0) {
        return Ok(unsupported(GitHubFilePreviewUnsupportedReason::Binary));
    }
    let text = match String::from_utf8(decoded) {
        Ok(text) => text,
        Err(_) => return Ok(unsupported(GitHubFilePreviewUnsupportedReason::Binary)),
    };
    if text.lines().take(MAX_FILE_PREVIEW_LINES + 1).count() > MAX_FILE_PREVIEW_LINES {
        return Ok(unsupported(GitHubFilePreviewUnsupportedReason::TooLarge));
    }

    Ok(GitHubFilePreview::Text {
        name: content.name,
        path: content.path,
        sha: content.sha,
        size: content.size,
        url: content.html_url,
        raw_url: content.download_url,
        content: text,
    })
}

fn single_repository_file(
    mut contents: Vec<octocrab::models::repos::Content>,
) -> Result<octocrab::models::repos::Content, AppError> {
    if contents.len() != 1 {
        return Err(AppError::GitHub(
            "GitHub did not return a single repository file".to_string(),
        ));
    }
    let content = contents.pop().expect("one repository content item");
    if content.r#type != "file" {
        return Err(AppError::Validation(
            "repository path is not a file".to_string(),
        ));
    }
    Ok(content)
}

fn is_empty_repository_error(error: &octocrab::Error) -> bool {
    matches!(
        error,
        octocrab::Error::GitHub { source, .. } if [404, 409].contains(&source.status_code.as_u16())
    )
}

fn decode_base64_content(encoded: &str, label: &str) -> Result<Vec<u8>, AppError> {
    let compact = encoded
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect::<Vec<_>>();
    base64::prelude::BASE64_STANDARD
        .decode(compact)
        .map_err(|error| AppError::GitHub(format!("{label} content is not valid base64: {error}")))
}

#[cfg(test)]
mod tests;
