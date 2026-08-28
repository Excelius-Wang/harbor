use async_trait::async_trait;
use serde::Serialize;

use super::super::{
    authenticated_client, github_error, pull_request_from_octocrab, AppError, GitHubPullRequest,
    GitHubService, OctocrabGitHubClient,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewTeam {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestReviewTeamPage {
    pub teams: Vec<GitHubPullRequestReviewTeam>,
}

#[async_trait]
pub(crate) trait GitHubPullRequestReviewerClient: Send + Sync {
    async fn list_pull_request_review_teams(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPullRequestReviewTeamPage, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn request_pull_request_reviewers(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn remove_pull_request_reviewers(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError>;
}

#[async_trait]
impl GitHubPullRequestReviewerClient for OctocrabGitHubClient {
    async fn list_pull_request_review_teams(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPullRequestReviewTeamPage, AppError> {
        let client = authenticated_client(token)?;
        let page = client
            .repos(owner, repository)
            .list_teams()
            .per_page(100)
            .send()
            .await
            .map_err(github_error)?;
        let teams = client.all_pages(page).await.map_err(github_error)?;

        Ok(GitHubPullRequestReviewTeamPage {
            teams: teams
                .into_iter()
                .map(|team| GitHubPullRequestReviewTeam {
                    name: team.name,
                    slug: team.slug,
                    description: team.description,
                })
                .collect(),
        })
    }

    async fn request_pull_request_reviewers(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError> {
        ensure_reviewers_present(reviewers, team_reviewers)?;
        let client = authenticated_client(token)?;
        let handler = client.pulls(owner, repository);
        handler
            .request_reviews(
                pull_request_number,
                reviewers.to_vec(),
                team_reviewers.to_vec(),
            )
            .await
            .map_err(github_error)?;
        let pull_request = handler
            .get(pull_request_number)
            .await
            .map_err(github_error)?;
        if !reviewers_match(&pull_request, reviewers, team_reviewers, true) {
            return Err(AppError::GitHubPermission(
                "GitHub did not apply every requested pull request review request".to_string(),
            ));
        }

        Ok(pull_request_from_octocrab(pull_request))
    }

    async fn remove_pull_request_reviewers(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError> {
        ensure_reviewers_present(reviewers, team_reviewers)?;
        let client = authenticated_client(token)?;
        let handler = client.pulls(owner, repository);
        handler
            .remove_requested_reviewers(
                pull_request_number,
                reviewers.to_vec(),
                team_reviewers.to_vec(),
            )
            .await
            .map_err(github_error)?;
        let pull_request = handler
            .get(pull_request_number)
            .await
            .map_err(github_error)?;
        if !reviewers_match(&pull_request, reviewers, team_reviewers, false) {
            return Err(AppError::GitHubPermission(
                "GitHub did not remove every requested pull request reviewer".to_string(),
            ));
        }

        Ok(pull_request_from_octocrab(pull_request))
    }
}

impl GitHubService {
    pub async fn pull_request_review_teams(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPullRequestReviewTeamPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_pull_request_review_teams(&token, owner, repository)
            .await
    }

    pub async fn request_pull_request_reviewers(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .request_pull_request_reviewers(
                &token,
                owner,
                repository,
                pull_request_number,
                reviewers,
                team_reviewers,
            )
            .await
    }

    pub async fn remove_pull_request_reviewers(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .remove_pull_request_reviewers(
                &token,
                owner,
                repository,
                pull_request_number,
                reviewers,
                team_reviewers,
            )
            .await
    }
}

fn ensure_reviewers_present(reviewers: &[String], teams: &[String]) -> Result<(), AppError> {
    if reviewers.is_empty() && teams.is_empty() {
        return Err(AppError::Validation(
            "at least one pull request reviewer is required".to_string(),
        ));
    }
    Ok(())
}

fn reviewer_names_match<'a>(
    current: impl IntoIterator<Item = &'a str>,
    requested: &[String],
    should_be_present: bool,
) -> bool {
    let current = current
        .into_iter()
        .map(str::to_ascii_lowercase)
        .collect::<std::collections::HashSet<_>>();
    requested
        .iter()
        .all(|reviewer| current.contains(&reviewer.to_ascii_lowercase()) == should_be_present)
}

fn reviewers_match(
    pull_request: &octocrab::models::pulls::PullRequest,
    reviewers: &[String],
    teams: &[String],
    should_be_present: bool,
) -> bool {
    reviewer_names_match(
        pull_request
            .requested_reviewers
            .iter()
            .flatten()
            .map(|reviewer| reviewer.login.as_str()),
        reviewers,
        should_be_present,
    ) && reviewer_names_match(
        pull_request
            .requested_teams
            .iter()
            .flatten()
            .map(|team| team.slug.as_str()),
        teams,
        should_be_present,
    )
}

#[cfg(test)]
#[async_trait]
impl GitHubPullRequestReviewerClient for super::super::tests::FakeGitHubClient {
    async fn list_pull_request_review_teams(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPullRequestReviewTeamPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubPullRequestReviewTeamPage {
            teams: vec![GitHubPullRequestReviewTeam {
                name: "Core maintainers".to_string(),
                slug: "core-maintainers".to_string(),
                description: Some("Maintains Harbor".to_string()),
            }],
        })
    }

    async fn request_pull_request_reviewers(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError> {
        use super::super::GitHubClient;

        let mut pull_request = self
            .pull_request_detail(token, owner, repository, pull_request_number, 1)
            .await?
            .pull_request;
        pull_request
            .requested_reviewers
            .extend(reviewers.iter().cloned());
        pull_request
            .requested_reviewers
            .sort_by_key(|reviewer| reviewer.to_ascii_lowercase());
        pull_request
            .requested_reviewers
            .dedup_by(|left, right| left.eq_ignore_ascii_case(right));
        pull_request
            .requested_teams
            .extend(
                team_reviewers
                    .iter()
                    .map(|slug| GitHubPullRequestReviewTeam {
                        name: slug.replace('-', " "),
                        slug: slug.clone(),
                        description: None,
                    }),
            );
        pull_request
            .requested_teams
            .sort_by_key(|team| team.slug.to_ascii_lowercase());
        pull_request
            .requested_teams
            .dedup_by(|left, right| left.slug.eq_ignore_ascii_case(&right.slug));
        Ok(pull_request)
    }

    async fn remove_pull_request_reviewers(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        reviewers: &[String],
        team_reviewers: &[String],
    ) -> Result<GitHubPullRequest, AppError> {
        let mut pull_request = self
            .request_pull_request_reviewers(
                token,
                owner,
                repository,
                pull_request_number,
                &["hubot".to_string()],
                &["core-maintainers".to_string()],
            )
            .await?;
        pull_request.requested_reviewers.retain(|reviewer| {
            !reviewers
                .iter()
                .any(|removed| removed.eq_ignore_ascii_case(reviewer))
        });
        pull_request.requested_teams.retain(|team| {
            !team_reviewers
                .iter()
                .any(|removed| removed.eq_ignore_ascii_case(&team.slug))
        });
        Ok(pull_request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reviewer_verification_is_case_insensitive_for_users_and_teams() {
        assert!(reviewer_names_match(
            ["OctoCat", "hubot"],
            &["octocat".to_string()],
            true,
        ));
        assert!(reviewer_names_match(
            ["core-maintainers"],
            &["CORE-MAINTAINERS".to_string()],
            true,
        ));
        assert!(reviewer_names_match(
            ["octocat"],
            &["hubot".to_string()],
            false,
        ));
    }

    #[test]
    fn reviewer_mutations_require_a_user_or_team() {
        assert!(ensure_reviewers_present(&[], &[]).is_err());
        assert!(ensure_reviewers_present(&["hubot".to_string()], &[]).is_ok());
        assert!(ensure_reviewers_present(&[], &["core".to_string()]).is_ok());
    }
}
