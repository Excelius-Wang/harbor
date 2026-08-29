use async_trait::async_trait;
use http::StatusCode;
use octocrab::FromResponse;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

use super::{
    authenticated_client, github_error, profile::normalize_user_login, GitHubService,
    OctocrabGitHubClient,
};

const ACCESS_PAGE_SIZE: u8 = 100;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryAccessUser {
    pub id: u64,
    pub login: String,
    pub avatar_url: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryCollaboratorPage {
    pub collaborators: Vec<GitHubRepositoryAccessUser>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryInvitation {
    pub id: u64,
    pub invitee: GitHubRepositoryAccessUser,
    pub inviter: GitHubRepositoryAccessUser,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryInvitationPage {
    pub invitations: Vec<GitHubRepositoryInvitation>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubRepositoryInviteStatus {
    Invited,
    AlreadyCollaborator,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryInviteResult {
    pub status: GitHubRepositoryInviteStatus,
    pub invitation: Option<GitHubRepositoryInvitation>,
}

#[async_trait]
pub(crate) trait GitHubRepositoryAccessClient: Send + Sync {
    async fn personal_repository_collaborators(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCollaboratorPage, AppError>;

    async fn personal_repository_invitations(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryInvitationPage, AppError>;

    async fn invite_personal_repository_collaborator(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<GitHubRepositoryInviteResult, AppError>;

    async fn cancel_personal_repository_invitation(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        invitation_id: u64,
    ) -> Result<(), AppError>;

    async fn remove_personal_repository_collaborator(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<(), AppError>;
}

impl GitHubService {
    pub async fn personal_repository_collaborators(
        &self,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCollaboratorPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .personal_repository_collaborators(&token, owner, repository, page)
            .await
    }

    pub async fn personal_repository_invitations(
        &self,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryInvitationPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .personal_repository_invitations(&token, owner, repository, page)
            .await
    }

    pub async fn invite_personal_repository_collaborator(
        &self,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<GitHubRepositoryInviteResult, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .invite_personal_repository_collaborator(&token, owner, repository, username)
            .await
    }

    pub async fn cancel_personal_repository_invitation(
        &self,
        owner: &str,
        repository: &str,
        invitation_id: u64,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .cancel_personal_repository_invitation(&token, owner, repository, invitation_id)
            .await
    }

    pub async fn remove_personal_repository_collaborator(
        &self,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .remove_personal_repository_collaborator(&token, owner, repository, username)
            .await
    }
}

#[async_trait]
impl GitHubRepositoryAccessClient for OctocrabGitHubClient {
    async fn personal_repository_collaborators(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCollaboratorPage, AppError> {
        let client = authenticated_client(token)?;
        ensure_personal_repository_owner(&client, owner).await?;
        let response = client
            .repos(owner, repository)
            .list_collaborators()
            .per_page(ACCESS_PAGE_SIZE)
            .page(page)
            .send()
            .await
            .map_err(github_error)?;
        let has_more = response.next.is_some();
        let collaborators = response
            .items
            .into_iter()
            .filter(|collaborator| !collaborator.author.login.eq_ignore_ascii_case(owner))
            .map(collaborator_user)
            .collect();
        Ok(GitHubRepositoryCollaboratorPage {
            collaborators,
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn personal_repository_invitations(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryInvitationPage, AppError> {
        let client = authenticated_client(token)?;
        ensure_personal_repository_owner(&client, owner).await?;
        fetch_repository_invitations(&client, owner, repository, page).await
    }

    async fn invite_personal_repository_collaborator(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<GitHubRepositoryInviteResult, AppError> {
        let client = authenticated_client(token)?;
        ensure_personal_repository_owner(&client, owner).await?;
        let username = normalize_user_login(username)?;
        if username.eq_ignore_ascii_case(owner) {
            return Err(AppError::Validation(
                "the repository owner cannot be invited as a collaborator".to_string(),
            ));
        }

        let response = client
            ._put(
                collaborator_route(owner, repository, &username),
                None::<&()>,
            )
            .await
            .map_err(github_error)?;
        let status = response.status();
        let response = octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;
        match status {
            StatusCode::CREATED => {
                let invitation = RawRepositoryInvitation::from_response(response)
                    .await
                    .map_err(github_error)?;
                let invitation = repository_invitation(invitation)?;
                if !invitation.invitee.login.eq_ignore_ascii_case(&username) {
                    return Err(AppError::GitHub(
                        "GitHub returned a different repository invitation".to_string(),
                    ));
                }
                Ok(GitHubRepositoryInviteResult {
                    status: GitHubRepositoryInviteStatus::Invited,
                    invitation: Some(invitation),
                })
            }
            StatusCode::NO_CONTENT => {
                let is_collaborator = client
                    .repos(owner, repository)
                    .is_collaborator(&username)
                    .await
                    .map_err(github_error)?;
                if !is_collaborator {
                    return Err(AppError::GitHub(
                        "GitHub did not return the invited collaborator".to_string(),
                    ));
                }
                Ok(GitHubRepositoryInviteResult {
                    status: GitHubRepositoryInviteStatus::AlreadyCollaborator,
                    invitation: None,
                })
            }
            _ => Err(AppError::GitHub(format!(
                "GitHub returned unexpected collaborator invitation status {status}"
            ))),
        }
    }

    async fn cancel_personal_repository_invitation(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        invitation_id: u64,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        ensure_personal_repository_owner(&client, owner).await?;
        let response = client
            ._delete(
                repository_invitation_route(owner, repository, invitation_id),
                None::<&()>,
            )
            .await
            .map_err(github_error)?;
        let status = response.status();
        octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;
        if status != StatusCode::NO_CONTENT {
            return Err(AppError::GitHub(format!(
                "GitHub returned unexpected invitation cancellation status {status}"
            )));
        }
        Ok(())
    }

    async fn remove_personal_repository_collaborator(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        ensure_personal_repository_owner(&client, owner).await?;
        let username = normalize_user_login(username)?;
        if username.eq_ignore_ascii_case(owner) {
            return Err(AppError::Validation(
                "the repository owner cannot be removed as a collaborator".to_string(),
            ));
        }
        if !client
            .repos(owner, repository)
            .is_collaborator(&username)
            .await
            .map_err(github_error)?
        {
            return Err(AppError::Validation(
                "the selected user is not a repository collaborator".to_string(),
            ));
        }

        let response = client
            ._delete(
                collaborator_route(owner, repository, &username),
                None::<&()>,
            )
            .await
            .map_err(github_error)?;
        let status = response.status();
        octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;
        if status != StatusCode::NO_CONTENT {
            return Err(AppError::GitHub(format!(
                "GitHub returned unexpected collaborator removal status {status}"
            )));
        }
        if client
            .repos(owner, repository)
            .is_collaborator(&username)
            .await
            .map_err(github_error)?
        {
            return Err(AppError::GitHubPermission(
                "GitHub did not remove the repository collaborator".to_string(),
            ));
        }
        Ok(())
    }
}

#[derive(Serialize)]
struct AccessPageQuery {
    per_page: u8,
    page: u32,
}

#[derive(Deserialize)]
struct RawAccessUser {
    id: u64,
    login: String,
    avatar_url: String,
    html_url: String,
}

#[derive(Deserialize)]
struct RawRepositoryInvitation {
    id: u64,
    invitee: RawAccessUser,
    inviter: RawAccessUser,
    permissions: String,
    created_at: String,
}

async fn ensure_personal_repository_owner(
    client: &octocrab::Octocrab,
    owner: &str,
) -> Result<(), AppError> {
    let viewer = client.current().user().await.map_err(github_error)?;
    if !viewer.login.eq_ignore_ascii_case(owner) {
        return Err(AppError::GitHubPermission(
            "repository access management is limited to the signed-in personal owner".to_string(),
        ));
    }
    Ok(())
}

async fn fetch_repository_invitations(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    page: u32,
) -> Result<GitHubRepositoryInvitationPage, AppError> {
    let response: octocrab::Page<RawRepositoryInvitation> = client
        .get(
            repository_invitations_route(owner, repository),
            Some(&AccessPageQuery {
                per_page: ACCESS_PAGE_SIZE,
                page,
            }),
        )
        .await
        .map_err(github_error)?;
    let has_more = response.next.is_some();
    let invitations = response
        .items
        .into_iter()
        .map(repository_invitation)
        .collect::<Result<_, _>>()?;
    Ok(GitHubRepositoryInvitationPage {
        invitations,
        page,
        has_previous: page > 1,
        has_more,
    })
}

fn collaborator_user(collaborator: octocrab::models::Collaborator) -> GitHubRepositoryAccessUser {
    GitHubRepositoryAccessUser {
        id: collaborator.author.id.0,
        login: collaborator.author.login,
        avatar_url: collaborator.author.avatar_url.to_string(),
        url: collaborator.author.html_url.to_string(),
    }
}

fn repository_invitation(
    invitation: RawRepositoryInvitation,
) -> Result<GitHubRepositoryInvitation, AppError> {
    if !matches!(invitation.permissions.as_str(), "write" | "push") {
        return Err(AppError::GitHub(
            "GitHub returned a non-personal repository invitation role".to_string(),
        ));
    }
    Ok(GitHubRepositoryInvitation {
        id: invitation.id,
        invitee: access_user(invitation.invitee),
        inviter: access_user(invitation.inviter),
        created_at: invitation.created_at,
    })
}

fn access_user(user: RawAccessUser) -> GitHubRepositoryAccessUser {
    GitHubRepositoryAccessUser {
        id: user.id,
        login: user.login,
        avatar_url: user.avatar_url,
        url: user.html_url,
    }
}

fn collaborator_route(owner: &str, repository: &str, username: &str) -> String {
    format!("/repos/{owner}/{repository}/collaborators/{username}")
}

fn repository_invitations_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/invitations")
}

fn repository_invitation_route(owner: &str, repository: &str, invitation_id: u64) -> String {
    format!("/repos/{owner}/{repository}/invitations/{invitation_id}")
}

#[cfg(test)]
#[async_trait]
impl GitHubRepositoryAccessClient for super::tests::FakeGitHubClient {
    async fn personal_repository_collaborators(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCollaboratorPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, page), ("octocat", "hello-world", 1));
        Ok(GitHubRepositoryCollaboratorPage {
            collaborators: vec![fake_user("hubot", 2)],
            page,
            has_previous: false,
            has_more: false,
        })
    }

    async fn personal_repository_invitations(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubRepositoryInvitationPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, page), ("octocat", "hello-world", 1));
        Ok(GitHubRepositoryInvitationPage {
            invitations: vec![],
            page,
            has_previous: false,
            has_more: false,
        })
    }

    async fn invite_personal_repository_collaborator(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<GitHubRepositoryInviteResult, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, username),
            ("octocat", "hello-world", "hubot")
        );
        Ok(GitHubRepositoryInviteResult {
            status: GitHubRepositoryInviteStatus::Invited,
            invitation: None,
        })
    }

    async fn cancel_personal_repository_invitation(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        invitation_id: u64,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, invitation_id),
            ("octocat", "hello-world", 7)
        );
        Ok(())
    }

    async fn remove_personal_repository_collaborator(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        username: &str,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, username),
            ("octocat", "hello-world", "hubot")
        );
        Ok(())
    }
}

#[cfg(test)]
fn fake_user(login: &str, id: u64) -> GitHubRepositoryAccessUser {
    GitHubRepositoryAccessUser {
        id,
        login: login.to_string(),
        avatar_url: format!("https://avatars.githubusercontent.com/{login}"),
        url: format!("https://github.com/{login}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw_invitation(permission: &str) -> RawRepositoryInvitation {
        serde_json::from_value(serde_json::json!({
            "id": 7,
            "invitee": {
                "id": 2,
                "login": "hubot",
                "avatar_url": "https://avatars.githubusercontent.com/hubot",
                "html_url": "https://github.com/hubot"
            },
            "inviter": {
                "id": 1,
                "login": "octocat",
                "avatar_url": "https://avatars.githubusercontent.com/octocat",
                "html_url": "https://github.com/octocat"
            },
            "permissions": permission,
            "created_at": "2026-08-29T12:00:00Z"
        }))
        .expect("repository invitation")
    }

    #[test]
    fn personal_access_routes_match_githubs_repository_endpoints() {
        assert_eq!(
            collaborator_route("octocat", "harbor", "hubot"),
            "/repos/octocat/harbor/collaborators/hubot"
        );
        assert_eq!(
            repository_invitations_route("octocat", "harbor"),
            "/repos/octocat/harbor/invitations"
        );
        assert_eq!(
            repository_invitation_route("octocat", "harbor", 7),
            "/repos/octocat/harbor/invitations/7"
        );
    }

    #[test]
    fn repository_invitation_keeps_exact_people_and_write_access() {
        let invitation = repository_invitation(raw_invitation("write")).expect("invitation");
        assert_eq!(invitation.id, 7);
        assert_eq!(invitation.invitee.login, "hubot");
        assert_eq!(invitation.inviter.login, "octocat");
        assert!(repository_invitation(raw_invitation("admin")).is_err());
    }

    #[test]
    fn personal_collaborator_guards_reuse_github_username_rules() {
        assert_eq!(normalize_user_login(" hubot ").unwrap(), "hubot");
        assert!(normalize_user_login("organization/team").is_err());
        assert!(normalize_user_login("two--hyphens").is_err());
    }
}
