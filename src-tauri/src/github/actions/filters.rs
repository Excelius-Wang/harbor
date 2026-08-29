use std::collections::BTreeSet;

use async_trait::async_trait;
use serde::Serialize;

use super::{
    load_raw_workflow_runs, load_repository_branches, GitHubWorkflowRunStatusFilter,
    OctocrabGitHubClient, RawWorkflowRun, GITHUB_MAX_PAGE_SIZE,
};
use crate::github::{authenticated_client, AppError, GitHubService};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubWorkflowRunFilters {
    pub status: GitHubWorkflowRunStatusFilter,
    pub branch: String,
    pub event: String,
    pub actor: String,
    pub page: u32,
}

impl Default for GitHubWorkflowRunFilters {
    fn default() -> Self {
        Self {
            status: GitHubWorkflowRunStatusFilter::All,
            branch: String::new(),
            event: String::new(),
            actor: String::new(),
            page: 1,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowRunFilterOptions {
    pub branches: Vec<String>,
    pub events: Vec<String>,
    pub actors: Vec<String>,
}

#[async_trait]
pub(crate) trait GitHubWorkflowRunFilterClient: Send + Sync {
    async fn workflow_run_filter_options(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
    ) -> Result<GitHubWorkflowRunFilterOptions, AppError>;
}

#[async_trait]
impl GitHubWorkflowRunFilterClient for OctocrabGitHubClient {
    async fn workflow_run_filter_options(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
    ) -> Result<GitHubWorkflowRunFilterOptions, AppError> {
        let client = authenticated_client(token)?;
        let filters = GitHubWorkflowRunFilters::default();
        let branches_request = load_repository_branches(&client, owner, repository);
        let runs_request = load_raw_workflow_runs(
            &client,
            owner,
            repository,
            workflow_id,
            &filters,
            GITHUB_MAX_PAGE_SIZE,
        );
        let (branches, runs) = tokio::try_join!(branches_request, runs_request)?;

        Ok(workflow_run_filter_options_from_github(
            branches.into_iter().map(|branch| branch.name).collect(),
            runs.items,
        ))
    }
}

impl GitHubService {
    pub async fn workflow_run_filter_options(
        &self,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
    ) -> Result<GitHubWorkflowRunFilterOptions, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .workflow_run_filter_options(&token, owner, repository, workflow_id)
            .await
    }
}

fn workflow_run_filter_options_from_github(
    repository_branches: Vec<String>,
    runs: Vec<RawWorkflowRun>,
) -> GitHubWorkflowRunFilterOptions {
    let mut branches = repository_branches.into_iter().collect::<BTreeSet<_>>();
    let mut events = BTreeSet::new();
    let mut actors = BTreeSet::new();

    for run in runs {
        if let Some(branch) = run.head_branch.filter(|branch| !branch.is_empty()) {
            branches.insert(branch);
        }
        if !run.event.is_empty() {
            events.insert(run.event);
        }
        if let Some(actor) = run.actor {
            if !actor.login.is_empty() {
                actors.insert(actor.login);
            }
        }
    }

    GitHubWorkflowRunFilterOptions {
        branches: branches.into_iter().collect(),
        events: events.into_iter().collect(),
        actors: actors.into_iter().collect(),
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubWorkflowRunFilterClient for super::super::tests::FakeGitHubClient {
    async fn workflow_run_filter_options(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
    ) -> Result<GitHubWorkflowRunFilterOptions, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert!(workflow_id.is_none() || workflow_id == Some(7));
        Ok(GitHubWorkflowRunFilterOptions {
            branches: vec!["main".to_string()],
            events: vec!["push".to_string()],
            actors: vec!["octocat".to_string()],
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::github::actions::{RawWorkflowHeadCommit, RawWorkflowRepository, RawWorkflowUser};

    fn run(branch: &str, event: &str, actor: &str) -> RawWorkflowRun {
        RawWorkflowRun {
            id: 42,
            workflow_id: 7,
            name: Some("CI".to_string()),
            display_title: Some("Filter workflow runs".to_string()),
            run_number: 19,
            run_attempt: 1,
            event: event.to_string(),
            status: "completed".to_string(),
            conclusion: Some("success".to_string()),
            head_branch: Some(branch.to_string()),
            head_sha: "abcdef123456".to_string(),
            head_commit: Some(RawWorkflowHeadCommit {
                message: "Filter workflow runs".to_string(),
            }),
            actor: Some(RawWorkflowUser {
                login: actor.to_string(),
                avatar_url: format!("https://github.com/{actor}.png"),
            }),
            repository: Some(RawWorkflowRepository {
                full_name: "octocat/hello-world".to_string(),
            }),
            created_at: "2026-08-27T08:00:00Z".to_string(),
            updated_at: "2026-08-27T08:05:00Z".to_string(),
            run_started_at: Some("2026-08-27T08:00:05Z".to_string()),
            html_url: "https://github.com/octocat/hello-world/actions/runs/42".to_string(),
        }
    }

    #[test]
    fn filter_options_merge_repository_branches_with_recent_run_values() {
        let options = workflow_run_filter_options_from_github(
            vec![
                "main".to_string(),
                "develop".to_string(),
                "main".to_string(),
            ],
            vec![
                run("release/v1", "workflow_dispatch", "octocat"),
                run("main", "push", "hubot"),
                run("main", "push", "octocat"),
            ],
        );

        assert_eq!(options.branches, ["develop", "main", "release/v1"]);
        assert_eq!(options.events, ["push", "workflow_dispatch"]);
        assert_eq!(options.actors, ["hubot", "octocat"]);
    }
}
