use std::collections::{BTreeMap, BTreeSet};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{authenticated_client, github_error, GitHubService, OctocrabGitHubClient};

const GIST_PAGE_SIZE: u8 = 30;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubGistSource {
    Mine,
    Starred,
    Public,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistFile {
    pub filename: String,
    pub language: Option<String>,
    pub content_type: Option<String>,
    pub raw_url: Option<String>,
    pub size: u64,
    pub truncated: bool,
    pub content: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistParent {
    pub id: String,
    pub owner: Option<String>,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGist {
    pub id: String,
    pub description: Option<String>,
    pub url: String,
    pub public: bool,
    pub owner: Option<String>,
    pub owner_avatar_url: Option<String>,
    pub comments: u32,
    pub comments_enabled: bool,
    pub created_at: String,
    pub updated_at: String,
    pub files: Vec<GitHubGistFile>,
    pub starred: bool,
    pub viewer_owns: bool,
    pub fork_of: Option<GitHubGistParent>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistPage {
    pub gists: Vec<GitHubGist>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistRevision {
    pub version: String,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub committed_at: String,
    pub additions: u64,
    pub deletions: u64,
    pub total: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistRevisionPage {
    pub revisions: Vec<GitHubGistRevision>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistRevisionDetail {
    pub gist_id: String,
    pub version: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub files: Vec<GitHubGistFile>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistComment {
    pub id: u64,
    pub body: String,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub author_association: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub viewer_can_update: bool,
    pub viewer_can_delete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistCommentPage {
    pub comments: Vec<GitHubGistComment>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistFileInput {
    pub filename: String,
    pub content: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistCreateInput {
    pub description: Option<String>,
    pub public: bool,
    pub files: Vec<GitHubGistFileInput>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistFileMutation {
    pub original_filename: Option<String>,
    pub filename: String,
    pub content: Option<String>,
    pub deleted: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubGistUpdateInput {
    pub description: Option<String>,
    pub files: Vec<GitHubGistFileMutation>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum GitHubGistCommentMutation {
    Create { body: String },
    Update { comment_id: u64, body: String },
    Delete { comment_id: u64 },
}

#[async_trait]
pub(crate) trait GitHubGistClient: Send + Sync {
    async fn list_gists(
        &self,
        token: &str,
        source: GitHubGistSource,
        page: u32,
    ) -> Result<GitHubGistPage, AppError>;

    async fn gist(&self, token: &str, gist_id: &str) -> Result<GitHubGist, AppError>;

    async fn gist_revisions(
        &self,
        token: &str,
        gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistRevisionPage, AppError>;

    async fn gist_revision(
        &self,
        token: &str,
        gist_id: &str,
        version: &str,
    ) -> Result<GitHubGistRevisionDetail, AppError>;

    async fn gist_comments(
        &self,
        token: &str,
        gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistCommentPage, AppError>;

    async fn create_gist(
        &self,
        token: &str,
        input: &GitHubGistCreateInput,
    ) -> Result<GitHubGist, AppError>;

    async fn update_gist(
        &self,
        token: &str,
        gist_id: &str,
        input: &GitHubGistUpdateInput,
    ) -> Result<GitHubGist, AppError>;

    async fn delete_gist(
        &self,
        token: &str,
        gist_id: &str,
        expected_gist_id: &str,
    ) -> Result<(), AppError>;

    async fn update_gist_star(
        &self,
        token: &str,
        gist_id: &str,
        starred: bool,
    ) -> Result<GitHubGist, AppError>;

    async fn fork_gist(&self, token: &str, gist_id: &str) -> Result<GitHubGist, AppError>;

    async fn mutate_gist_comment(
        &self,
        token: &str,
        gist_id: &str,
        mutation: &GitHubGistCommentMutation,
    ) -> Result<Option<GitHubGistComment>, AppError>;
}

impl GitHubService {
    pub async fn gists(
        &self,
        source: GitHubGistSource,
        page: u32,
    ) -> Result<GitHubGistPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.list_gists(&token, source, page).await
    }

    pub async fn gist(&self, gist_id: &str) -> Result<GitHubGist, AppError> {
        let token = self.load_access_token().await?;
        self.client.gist(&token, gist_id).await
    }

    pub async fn gist_revisions(
        &self,
        gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistRevisionPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.gist_revisions(&token, gist_id, page).await
    }

    pub async fn gist_revision(
        &self,
        gist_id: &str,
        version: &str,
    ) -> Result<GitHubGistRevisionDetail, AppError> {
        let token = self.load_access_token().await?;
        self.client.gist_revision(&token, gist_id, version).await
    }

    pub async fn gist_comments(
        &self,
        gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistCommentPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.gist_comments(&token, gist_id, page).await
    }

    pub async fn create_gist(&self, input: &GitHubGistCreateInput) -> Result<GitHubGist, AppError> {
        let token = self.load_access_token().await?;
        self.client.create_gist(&token, input).await
    }

    pub async fn update_gist(
        &self,
        gist_id: &str,
        input: &GitHubGistUpdateInput,
    ) -> Result<GitHubGist, AppError> {
        let token = self.load_access_token().await?;
        self.client.update_gist(&token, gist_id, input).await
    }

    pub async fn delete_gist(&self, gist_id: &str, expected_gist_id: &str) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_gist(&token, gist_id, expected_gist_id)
            .await
    }

    pub async fn update_gist_star(
        &self,
        gist_id: &str,
        starred: bool,
    ) -> Result<GitHubGist, AppError> {
        let token = self.load_access_token().await?;
        self.client.update_gist_star(&token, gist_id, starred).await
    }

    pub async fn fork_gist(&self, gist_id: &str) -> Result<GitHubGist, AppError> {
        let token = self.load_access_token().await?;
        self.client.fork_gist(&token, gist_id).await
    }

    pub async fn mutate_gist_comment(
        &self,
        gist_id: &str,
        mutation: &GitHubGistCommentMutation,
    ) -> Result<Option<GitHubGistComment>, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .mutate_gist_comment(&token, gist_id, mutation)
            .await
    }
}

#[derive(Clone, Debug, Deserialize)]
struct RawGistUser {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawGistFile {
    filename: Option<String>,
    language: Option<String>,
    #[serde(rename = "type")]
    content_type: Option<String>,
    raw_url: Option<String>,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    truncated: bool,
    content: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawGist {
    id: String,
    html_url: String,
    description: Option<String>,
    public: bool,
    owner: Option<RawGistUser>,
    user: Option<RawGistUser>,
    #[serde(default)]
    comments: u32,
    comments_enabled: Option<bool>,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    files: BTreeMap<String, RawGistFile>,
    fork_of: Option<Box<RawGist>>,
}

#[derive(Debug, Deserialize)]
struct RawGistChangeStatus {
    #[serde(default)]
    additions: u64,
    #[serde(default)]
    deletions: u64,
    #[serde(default)]
    total: u64,
}

#[derive(Debug, Deserialize)]
struct RawGistRevision {
    version: String,
    user: Option<RawGistUser>,
    committed_at: String,
    change_status: RawGistChangeStatus,
}

#[derive(Clone, Debug, Deserialize)]
struct RawGistComment {
    id: u64,
    url: String,
    body: String,
    user: Option<RawGistUser>,
    author_association: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
struct PageParameters {
    per_page: u8,
    page: u32,
}

#[derive(Serialize)]
struct CreateGistFileRequest<'a> {
    content: &'a str,
}

#[derive(Serialize)]
struct CreateGistRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
    public: bool,
    files: BTreeMap<String, CreateGistFileRequest<'a>>,
}

#[derive(Serialize)]
struct UpdateGistFileRequest<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    filename: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<&'a str>,
}

#[derive(Serialize)]
struct UpdateGistRequest<'a> {
    description: Option<&'a str>,
    files: BTreeMap<String, Option<UpdateGistFileRequest<'a>>>,
}

#[derive(Serialize)]
struct GistCommentRequest<'a> {
    body: &'a str,
}

#[async_trait]
impl GitHubGistClient for OctocrabGitHubClient {
    async fn list_gists(
        &self,
        token: &str,
        source: GitHubGistSource,
        page: u32,
    ) -> Result<GitHubGistPage, AppError> {
        let client = authenticated_client(token)?;
        let parameters = PageParameters {
            per_page: GIST_PAGE_SIZE,
            page,
        };
        let current_user = client.current();
        let (response, viewer) = tokio::try_join!(
            client
                .get::<octocrab::Page<RawGist>, _, _>(gist_list_route(source), Some(&parameters),),
            current_user.user(),
        )
        .map_err(github_error)?;
        let has_more = response.next.is_some();
        let viewer_login = viewer.login;
        Ok(GitHubGistPage {
            gists: response
                .items
                .into_iter()
                .map(|gist| {
                    let starred = source == GitHubGistSource::Starred;
                    gist_from_raw(gist, &viewer_login, starred)
                })
                .collect(),
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn gist(&self, token: &str, gist_id: &str) -> Result<GitHubGist, AppError> {
        let client = authenticated_client(token)?;
        let current_user = client.current();
        let gists = client.gists();
        let (gist, viewer, starred) = tokio::try_join!(
            client.get::<RawGist, _, _>(gist_route(gist_id), None::<&()>),
            current_user.user(),
            gists.is_starred(gist_id),
        )
        .map_err(github_error)?;
        Ok(gist_from_raw(gist, &viewer.login, starred))
    }

    async fn gist_revisions(
        &self,
        token: &str,
        gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistRevisionPage, AppError> {
        let response: octocrab::Page<RawGistRevision> = authenticated_client(token)?
            .get(
                format!("{}/commits", gist_route(gist_id)),
                Some(&PageParameters {
                    per_page: GIST_PAGE_SIZE,
                    page,
                }),
            )
            .await
            .map_err(github_error)?;
        let has_more = response.next.is_some();
        Ok(GitHubGistRevisionPage {
            revisions: response.items.into_iter().map(revision_from_raw).collect(),
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn gist_revision(
        &self,
        token: &str,
        gist_id: &str,
        version: &str,
    ) -> Result<GitHubGistRevisionDetail, AppError> {
        let raw: RawGist = authenticated_client(token)?
            .get(format!("{}/{}", gist_route(gist_id), version), None::<&()>)
            .await
            .map_err(github_error)?;
        Ok(GitHubGistRevisionDetail {
            gist_id: raw.id,
            version: version.to_string(),
            description: raw.description,
            created_at: raw.created_at,
            updated_at: raw.updated_at,
            files: files_from_raw(raw.files),
        })
    }

    async fn gist_comments(
        &self,
        token: &str,
        gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistCommentPage, AppError> {
        let client = authenticated_client(token)?;
        let parameters = PageParameters {
            per_page: GIST_PAGE_SIZE,
            page,
        };
        let current_user = client.current();
        let (response, gist, viewer) = tokio::try_join!(
            client.get::<octocrab::Page<RawGistComment>, _, _>(
                format!("{}/comments", gist_route(gist_id)),
                Some(&parameters),
            ),
            client.get::<RawGist, _, _>(gist_route(gist_id), None::<&()>),
            current_user.user(),
        )
        .map_err(github_error)?;
        let has_more = response.next.is_some();
        let viewer_owns_gist =
            raw_gist_owner(&gist).is_some_and(|owner| owner.eq_ignore_ascii_case(&viewer.login));
        Ok(GitHubGistCommentPage {
            comments: response
                .items
                .into_iter()
                .map(|comment| comment_from_raw(comment, &viewer.login, viewer_owns_gist))
                .collect(),
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn create_gist(
        &self,
        token: &str,
        input: &GitHubGistCreateInput,
    ) -> Result<GitHubGist, AppError> {
        let client = authenticated_client(token)?;
        let viewer = client.current().user().await.map_err(github_error)?;
        let files = input
            .files
            .iter()
            .map(|file| {
                (
                    file.filename.clone(),
                    CreateGistFileRequest {
                        content: &file.content,
                    },
                )
            })
            .collect();
        let raw: RawGist = client
            .post(
                "/gists",
                Some(&CreateGistRequest {
                    description: input.description.as_deref(),
                    public: input.public,
                    files,
                }),
            )
            .await
            .map_err(github_error)?;
        let gist = gist_from_raw(raw, &viewer.login, false);
        verify_created_gist(&gist, input, &viewer.login)?;
        Ok(gist)
    }

    async fn update_gist(
        &self,
        token: &str,
        gist_id: &str,
        input: &GitHubGistUpdateInput,
    ) -> Result<GitHubGist, AppError> {
        let client = authenticated_client(token)?;
        let current_user = client.current();
        let (current, viewer) = tokio::try_join!(
            client.get::<RawGist, _, _>(gist_route(gist_id), None::<&()>),
            current_user.user(),
        )
        .map_err(github_error)?;
        ensure_gist_owner(&current, &viewer.login, "edit")?;
        let expected_files = expected_updated_file_names(&current, input)?;
        let files = update_file_request(input);
        let raw: RawGist = client
            .patch(
                gist_route(gist_id),
                Some(&UpdateGistRequest {
                    description: input.description.as_deref(),
                    files,
                }),
            )
            .await
            .map_err(github_error)?;
        let gist = gist_from_raw(raw, &viewer.login, false);
        verify_updated_gist(
            &gist,
            gist_id,
            input.description.as_deref(),
            &expected_files,
        )?;
        Ok(gist)
    }

    async fn delete_gist(
        &self,
        token: &str,
        gist_id: &str,
        expected_gist_id: &str,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let current_user = client.current();
        let (current, viewer) = tokio::try_join!(
            client.get::<RawGist, _, _>(gist_route(gist_id), None::<&()>),
            current_user.user(),
        )
        .map_err(github_error)?;
        ensure_gist_owner(&current, &viewer.login, "delete")?;
        if current.id != expected_gist_id {
            return Err(AppError::Validation(
                "gist deletion confirmation does not match the current gist".to_string(),
            ));
        }
        client.gists().delete(gist_id).await.map_err(github_error)
    }

    async fn update_gist_star(
        &self,
        token: &str,
        gist_id: &str,
        starred: bool,
    ) -> Result<GitHubGist, AppError> {
        let client = authenticated_client(token)?;
        if starred {
            client.gists().star(gist_id).await.map_err(github_error)?;
        } else {
            client.gists().unstar(gist_id).await.map_err(github_error)?;
        }
        let current_user = client.current();
        let gists = client.gists();
        let (raw, viewer, authoritative_starred) = tokio::try_join!(
            client.get::<RawGist, _, _>(gist_route(gist_id), None::<&()>),
            current_user.user(),
            gists.is_starred(gist_id),
        )
        .map_err(github_error)?;
        if authoritative_starred != starred {
            return Err(AppError::GitHub(
                "GitHub did not apply the requested Gist star state".to_string(),
            ));
        }
        Ok(gist_from_raw(raw, &viewer.login, authoritative_starred))
    }

    async fn fork_gist(&self, token: &str, gist_id: &str) -> Result<GitHubGist, AppError> {
        let client = authenticated_client(token)?;
        let current_user = client.current();
        let (current, viewer) = tokio::try_join!(
            client.get::<RawGist, _, _>(gist_route(gist_id), None::<&()>),
            current_user.user(),
        )
        .map_err(github_error)?;
        if raw_gist_owner(&current).is_some_and(|owner| owner.eq_ignore_ascii_case(&viewer.login)) {
            return Err(AppError::Validation(
                "a personal Gist cannot be forked back into the same account".to_string(),
            ));
        }
        let raw: RawGist = client
            .post(format!("{}/forks", gist_route(gist_id)), None::<&()>)
            .await
            .map_err(github_error)?;
        let gist = gist_from_raw(raw, &viewer.login, false);
        if gist.id == gist_id
            || !gist.viewer_owns
            || gist
                .fork_of
                .as_ref()
                .is_some_and(|parent| parent.id != gist_id)
        {
            return Err(AppError::GitHub(
                "GitHub returned a Gist that does not match the requested personal fork"
                    .to_string(),
            ));
        }
        Ok(gist)
    }

    async fn mutate_gist_comment(
        &self,
        token: &str,
        gist_id: &str,
        mutation: &GitHubGistCommentMutation,
    ) -> Result<Option<GitHubGistComment>, AppError> {
        let client = authenticated_client(token)?;
        let current_user = client.current();
        let (gist, viewer) = tokio::try_join!(
            client.get::<RawGist, _, _>(gist_route(gist_id), None::<&()>),
            current_user.user(),
        )
        .map_err(github_error)?;
        let viewer_owns_gist =
            raw_gist_owner(&gist).is_some_and(|owner| owner.eq_ignore_ascii_case(&viewer.login));
        match mutation {
            GitHubGistCommentMutation::Create { body } => {
                if gist.comments_enabled == Some(false) {
                    return Err(AppError::GitHubPermission(
                        "comments are disabled for this Gist".to_string(),
                    ));
                }
                let raw: RawGistComment = client
                    .post(
                        format!("{}/comments", gist_route(gist_id)),
                        Some(&GistCommentRequest { body }),
                    )
                    .await
                    .map_err(github_error)?;
                ensure_comment_scope(&raw, gist_id)?;
                Ok(Some(comment_from_raw(raw, &viewer.login, viewer_owns_gist)))
            }
            GitHubGistCommentMutation::Update { comment_id, body } => {
                let current: RawGistComment = client
                    .get(gist_comment_route(gist_id, *comment_id), None::<&()>)
                    .await
                    .map_err(github_error)?;
                ensure_comment_scope(&current, gist_id)?;
                ensure_comment_author(&current, &viewer.login)?;
                let raw: RawGistComment = client
                    .patch(
                        gist_comment_route(gist_id, *comment_id),
                        Some(&GistCommentRequest { body }),
                    )
                    .await
                    .map_err(github_error)?;
                ensure_comment_scope(&raw, gist_id)?;
                if raw.id != *comment_id || raw.body != *body {
                    return Err(AppError::GitHub(
                        "GitHub did not return the requested Gist comment update".to_string(),
                    ));
                }
                Ok(Some(comment_from_raw(raw, &viewer.login, viewer_owns_gist)))
            }
            GitHubGistCommentMutation::Delete { comment_id } => {
                let current: RawGistComment = client
                    .get(gist_comment_route(gist_id, *comment_id), None::<&()>)
                    .await
                    .map_err(github_error)?;
                ensure_comment_scope(&current, gist_id)?;
                let viewer_owns_comment = current
                    .user
                    .as_ref()
                    .is_some_and(|author| author.login.eq_ignore_ascii_case(&viewer.login));
                if !viewer_owns_comment && !viewer_owns_gist {
                    return Err(AppError::GitHubPermission(
                        "only the comment author or Gist owner can delete this comment".to_string(),
                    ));
                }
                let response = client
                    ._delete(gist_comment_route(gist_id, *comment_id), None::<&()>)
                    .await
                    .map_err(github_error)?;
                octocrab::map_github_error(response)
                    .await
                    .map_err(github_error)?;
                Ok(None)
            }
        }
    }
}

fn gist_from_raw(raw: RawGist, viewer_login: &str, starred: bool) -> GitHubGist {
    let owner = raw.owner.or(raw.user);
    let viewer_owns = owner
        .as_ref()
        .is_some_and(|owner| owner.login.eq_ignore_ascii_case(viewer_login));
    let fork_of = raw.fork_of.map(|parent| {
        let owner = parent.owner.or(parent.user).map(|owner| owner.login);
        GitHubGistParent {
            id: parent.id,
            owner,
            url: parent.html_url,
        }
    });
    GitHubGist {
        id: raw.id,
        description: raw.description,
        url: raw.html_url,
        public: raw.public,
        owner: owner.as_ref().map(|owner| owner.login.clone()),
        owner_avatar_url: owner.and_then(|owner| owner.avatar_url),
        comments: raw.comments,
        comments_enabled: raw.comments_enabled.unwrap_or(true),
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        files: files_from_raw(raw.files),
        starred,
        viewer_owns,
        fork_of,
    }
}

fn files_from_raw(files: BTreeMap<String, RawGistFile>) -> Vec<GitHubGistFile> {
    files
        .into_iter()
        .map(|(key, file)| GitHubGistFile {
            filename: file.filename.unwrap_or(key),
            language: file.language,
            content_type: file.content_type,
            raw_url: file.raw_url,
            size: file.size,
            truncated: file.truncated,
            content: file.content,
        })
        .collect()
}

fn revision_from_raw(raw: RawGistRevision) -> GitHubGistRevision {
    GitHubGistRevision {
        version: raw.version,
        author: raw.user.as_ref().map(|user| user.login.clone()),
        author_avatar_url: raw.user.and_then(|user| user.avatar_url),
        committed_at: raw.committed_at,
        additions: raw.change_status.additions,
        deletions: raw.change_status.deletions,
        total: raw.change_status.total,
    }
}

fn comment_from_raw(
    raw: RawGistComment,
    viewer_login: &str,
    viewer_owns_gist: bool,
) -> GitHubGistComment {
    let viewer_owns_comment = raw
        .user
        .as_ref()
        .is_some_and(|author| author.login.eq_ignore_ascii_case(viewer_login));
    GitHubGistComment {
        id: raw.id,
        body: raw.body,
        author: raw.user.as_ref().map(|user| user.login.clone()),
        author_avatar_url: raw.user.and_then(|user| user.avatar_url),
        author_association: raw.author_association,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        viewer_can_update: viewer_owns_comment,
        viewer_can_delete: viewer_owns_comment || viewer_owns_gist,
    }
}

fn gist_list_route(source: GitHubGistSource) -> &'static str {
    match source {
        GitHubGistSource::Mine => "/gists",
        GitHubGistSource::Starred => "/gists/starred",
        GitHubGistSource::Public => "/gists/public",
    }
}

fn gist_route(gist_id: &str) -> String {
    format!("/gists/{gist_id}")
}

fn gist_comment_route(gist_id: &str, comment_id: u64) -> String {
    format!("{}/comments/{comment_id}", gist_route(gist_id))
}

fn raw_gist_owner(gist: &RawGist) -> Option<&str> {
    gist.owner
        .as_ref()
        .or(gist.user.as_ref())
        .map(|owner| owner.login.as_str())
}

fn ensure_gist_owner(gist: &RawGist, viewer_login: &str, action: &str) -> Result<(), AppError> {
    if !raw_gist_owner(gist).is_some_and(|owner| owner.eq_ignore_ascii_case(viewer_login)) {
        return Err(AppError::GitHubPermission(format!(
            "only the signed-in owner can {action} this Gist"
        )));
    }
    Ok(())
}

fn expected_updated_file_names(
    current: &RawGist,
    input: &GitHubGistUpdateInput,
) -> Result<BTreeSet<String>, AppError> {
    let mut names = current.files.keys().cloned().collect::<BTreeSet<_>>();
    let mut originals = BTreeSet::new();
    for file in &input.files {
        match &file.original_filename {
            Some(original) => {
                if !current.files.contains_key(original) || !originals.insert(original.clone()) {
                    return Err(AppError::Validation(
                        "Gist file update does not match the current files".to_string(),
                    ));
                }
                names.remove(original);
                if !file.deleted && !names.insert(file.filename.clone()) {
                    return Err(AppError::Validation(
                        "Gist file names must be unique".to_string(),
                    ));
                }
            }
            None => {
                if file.deleted || file.content.is_none() || !names.insert(file.filename.clone()) {
                    return Err(AppError::Validation(
                        "new Gist files require unique names and content".to_string(),
                    ));
                }
            }
        }
    }
    if names.is_empty() {
        return Err(AppError::Validation(
            "a Gist must keep at least one file".to_string(),
        ));
    }
    Ok(names)
}

fn update_file_request(
    input: &GitHubGistUpdateInput,
) -> BTreeMap<String, Option<UpdateGistFileRequest<'_>>> {
    input
        .files
        .iter()
        .map(|file| {
            let key = file
                .original_filename
                .as_ref()
                .unwrap_or(&file.filename)
                .clone();
            let value = if file.deleted {
                None
            } else {
                Some(UpdateGistFileRequest {
                    filename: file
                        .original_filename
                        .as_ref()
                        .filter(|original| *original != &file.filename)
                        .map(|_| file.filename.as_str()),
                    content: file.content.as_deref(),
                })
            };
            (key, value)
        })
        .collect()
}

fn verify_created_gist(
    gist: &GitHubGist,
    input: &GitHubGistCreateInput,
    viewer_login: &str,
) -> Result<(), AppError> {
    let expected_files = input
        .files
        .iter()
        .map(|file| file.filename.as_str())
        .collect::<BTreeSet<_>>();
    let returned_files = gist
        .files
        .iter()
        .map(|file| file.filename.as_str())
        .collect::<BTreeSet<_>>();
    if !gist.viewer_owns
        || !gist
            .owner
            .as_ref()
            .is_some_and(|owner| owner.eq_ignore_ascii_case(viewer_login))
        || gist.public != input.public
        || gist.description.as_deref() != input.description.as_deref()
        || returned_files != expected_files
    {
        return Err(AppError::GitHub(
            "GitHub did not return the requested personal Gist".to_string(),
        ));
    }
    Ok(())
}

fn verify_updated_gist(
    gist: &GitHubGist,
    gist_id: &str,
    expected_description: Option<&str>,
    expected_files: &BTreeSet<String>,
) -> Result<(), AppError> {
    let returned_files = gist
        .files
        .iter()
        .map(|file| file.filename.clone())
        .collect::<BTreeSet<_>>();
    if gist.id != gist_id
        || !gist.viewer_owns
        || gist.description.as_deref() != expected_description
        || &returned_files != expected_files
    {
        return Err(AppError::GitHub(
            "GitHub did not return the requested Gist update".to_string(),
        ));
    }
    Ok(())
}

fn ensure_comment_scope(comment: &RawGistComment, gist_id: &str) -> Result<(), AppError> {
    let url = reqwest::Url::parse(&comment.url)
        .map_err(|_| AppError::GitHub("GitHub returned an invalid Gist comment URL".to_string()))?;
    let expected_path = format!("/gists/{gist_id}/comments/{}", comment.id);
    if url.host_str() != Some("api.github.com") || url.path() != expected_path {
        return Err(AppError::GitHub(
            "GitHub returned a comment outside the selected Gist".to_string(),
        ));
    }
    Ok(())
}

fn ensure_comment_author(comment: &RawGistComment, viewer_login: &str) -> Result<(), AppError> {
    if !comment
        .user
        .as_ref()
        .is_some_and(|author| author.login.eq_ignore_ascii_case(viewer_login))
    {
        return Err(AppError::GitHubPermission(
            "only the comment author can edit this Gist comment".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;

#[cfg(test)]
#[async_trait]
impl GitHubGistClient for super::tests::FakeGitHubClient {
    async fn list_gists(
        &self,
        token: &str,
        _source: GitHubGistSource,
        page: u32,
    ) -> Result<GitHubGistPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubGistPage {
            gists: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn gist(&self, _token: &str, _gist_id: &str) -> Result<GitHubGist, AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }

    async fn gist_revisions(
        &self,
        _token: &str,
        _gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistRevisionPage, AppError> {
        Ok(GitHubGistRevisionPage {
            revisions: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn gist_revision(
        &self,
        _token: &str,
        _gist_id: &str,
        _version: &str,
    ) -> Result<GitHubGistRevisionDetail, AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }

    async fn gist_comments(
        &self,
        _token: &str,
        _gist_id: &str,
        page: u32,
    ) -> Result<GitHubGistCommentPage, AppError> {
        Ok(GitHubGistCommentPage {
            comments: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn create_gist(
        &self,
        _token: &str,
        _input: &GitHubGistCreateInput,
    ) -> Result<GitHubGist, AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }

    async fn update_gist(
        &self,
        _token: &str,
        _gist_id: &str,
        _input: &GitHubGistUpdateInput,
    ) -> Result<GitHubGist, AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }

    async fn delete_gist(
        &self,
        _token: &str,
        _gist_id: &str,
        _expected_gist_id: &str,
    ) -> Result<(), AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }

    async fn update_gist_star(
        &self,
        _token: &str,
        _gist_id: &str,
        _starred: bool,
    ) -> Result<GitHubGist, AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }

    async fn fork_gist(&self, _token: &str, _gist_id: &str) -> Result<GitHubGist, AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }

    async fn mutate_gist_comment(
        &self,
        _token: &str,
        _gist_id: &str,
        _mutation: &GitHubGistCommentMutation,
    ) -> Result<Option<GitHubGistComment>, AppError> {
        Err(AppError::GitHub("Gist fixture is unavailable".to_string()))
    }
}
