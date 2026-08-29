use async_trait::async_trait;
use http::StatusCode;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, repository_from_octocrab, AppError, GitHubRepository,
    GitHubService, OctocrabGitHubClient,
};

const REPOSITORY_INVITATION_PAGE_SIZE: u8 = 100;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubReceivedRepositoryInvitationAction {
    Accept,
    Decline,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepositoryInvitationActor {
    pub id: u64,
    pub login: String,
    pub avatar_url: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReceivedRepositoryInvitation {
    pub id: u64,
    pub repository: GitHubRepository,
    pub inviter: GitHubRepositoryInvitationActor,
    pub permission: String,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReceivedRepositoryInvitationPage {
    pub invitations: Vec<GitHubReceivedRepositoryInvitation>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Debug, Deserialize)]
struct RawReceivedRepositoryInvitation {
    id: u64,
    repository: octocrab::models::Repository,
    inviter: RawRepositoryInvitationActor,
    #[serde(rename = "permissions")]
    permission: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct RawRepositoryInvitationActor {
    id: u64,
    login: String,
    avatar_url: String,
    html_url: String,
}

#[derive(Serialize)]
struct RepositoryInvitationPageParameters {
    per_page: u8,
    page: u32,
}

#[async_trait]
pub(crate) trait GitHubRepositoryInvitationClient: Send + Sync {
    async fn list_received_repository_invitations(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubReceivedRepositoryInvitationPage, AppError>;

    async fn update_received_repository_invitation(
        &self,
        token: &str,
        invitation_id: u64,
        action: GitHubReceivedRepositoryInvitationAction,
    ) -> Result<(), AppError>;
}

#[async_trait]
impl GitHubRepositoryInvitationClient for OctocrabGitHubClient {
    async fn list_received_repository_invitations(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubReceivedRepositoryInvitationPage, AppError> {
        let response: octocrab::Page<RawReceivedRepositoryInvitation> =
            authenticated_client(token)?
                .get(
                    "/user/repository_invitations",
                    Some(&RepositoryInvitationPageParameters {
                        per_page: REPOSITORY_INVITATION_PAGE_SIZE,
                        page,
                    }),
                )
                .await
                .map_err(github_error)?;
        Ok(received_repository_invitation_page(
            response.items,
            page,
            response.next.is_some(),
        ))
    }

    async fn update_received_repository_invitation(
        &self,
        token: &str,
        invitation_id: u64,
        action: GitHubReceivedRepositoryInvitationAction,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let route = repository_invitation_route(invitation_id);
        let response = match action {
            GitHubReceivedRepositoryInvitationAction::Accept => {
                client._patch(route, None::<&()>).await
            }
            GitHubReceivedRepositoryInvitationAction::Decline => {
                client._delete(route, None::<&()>).await
            }
        }
        .map_err(github_error)?;
        let status = response.status();
        if status == StatusCode::NO_CONTENT {
            return Ok(());
        }

        octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;
        Err(AppError::GitHub(format!(
            "GitHub returned unexpected repository invitation status {status}"
        )))
    }
}

impl GitHubService {
    pub async fn received_repository_invitations(
        &self,
        page: u32,
    ) -> Result<GitHubReceivedRepositoryInvitationPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_received_repository_invitations(&token, page)
            .await
    }

    pub async fn update_received_repository_invitation(
        &self,
        invitation_id: u64,
        action: GitHubReceivedRepositoryInvitationAction,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_received_repository_invitation(&token, invitation_id, action)
            .await
    }
}

fn received_repository_invitation_page(
    invitations: Vec<RawReceivedRepositoryInvitation>,
    page: u32,
    has_more: bool,
) -> GitHubReceivedRepositoryInvitationPage {
    GitHubReceivedRepositoryInvitationPage {
        invitations: invitations
            .into_iter()
            .filter_map(received_repository_invitation)
            .collect(),
        page,
        has_previous: page > 1,
        has_more,
    }
}

fn received_repository_invitation(
    invitation: RawReceivedRepositoryInvitation,
) -> Option<GitHubReceivedRepositoryInvitation> {
    let repository = repository_from_octocrab(invitation.repository)?;
    let permission = invitation.permission.trim().to_string();
    if permission.is_empty() || permission.len() > 100 || permission.chars().any(char::is_control) {
        return None;
    }
    Some(GitHubReceivedRepositoryInvitation {
        id: invitation.id,
        repository,
        inviter: GitHubRepositoryInvitationActor {
            id: invitation.inviter.id,
            login: invitation.inviter.login,
            avatar_url: invitation.inviter.avatar_url,
            url: invitation.inviter.html_url,
        },
        permission,
        created_at: invitation.created_at,
    })
}

fn repository_invitation_route(invitation_id: u64) -> String {
    format!("/user/repository_invitations/{invitation_id}")
}

#[cfg(test)]
#[async_trait]
impl GitHubRepositoryInvitationClient for super::tests::FakeGitHubClient {
    async fn list_received_repository_invitations(
        &self,
        token: &str,
        page: u32,
    ) -> Result<GitHubReceivedRepositoryInvitationPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubReceivedRepositoryInvitationPage {
            invitations: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn update_received_repository_invitation(
        &self,
        token: &str,
        invitation_id: u64,
        action: GitHubReceivedRepositoryInvitationAction,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(invitation_id, 73);
        assert_eq!(action, GitHubReceivedRepositoryInvitationAction::Accept);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn invitation(permission: &str) -> RawReceivedRepositoryInvitation {
        serde_json::from_value(serde_json::json!({
            "id": 73,
            "repository": {
                "id": 1,
                "name": "hello-world",
                "full_name": "octocat/hello-world",
                "private": true,
                "html_url": "https://github.com/octocat/hello-world",
                "description": "A repository",
                "fork": false,
                "url": "https://api.github.com/repos/octocat/hello-world",
                "archived": false
            },
            "inviter": {
                "id": 2,
                "login": "monalisa",
                "avatar_url": "https://github.com/monalisa.png",
                "html_url": "https://github.com/monalisa"
            },
            "permissions": permission,
            "created_at": "2026-08-29T08:00:00Z"
        }))
        .expect("repository invitation fixture")
    }

    #[test]
    fn invitations_keep_repository_inviter_permission_and_pagination() {
        let page = received_repository_invitation_page(vec![invitation("write")], 2, true);

        assert_eq!(page.page, 2);
        assert!(page.has_previous);
        assert!(page.has_more);
        let invitation = &page.invitations[0];
        assert_eq!(invitation.id, 73);
        assert_eq!(invitation.repository.full_name, "octocat/hello-world");
        assert!(invitation.repository.is_private);
        assert_eq!(invitation.inviter.login, "monalisa");
        assert_eq!(invitation.permission, "write");
        assert_eq!(invitation.created_at, "2026-08-29T08:00:00Z");
    }

    #[test]
    fn invalid_permissions_are_not_sent_to_the_webview() {
        let page = received_repository_invitation_page(vec![invitation("\n")], 1, false);

        assert!(page.invitations.is_empty());
    }

    #[test]
    fn invitation_action_route_is_account_scoped() {
        assert_eq!(
            repository_invitation_route(73),
            "/user/repository_invitations/73"
        );
    }
}
