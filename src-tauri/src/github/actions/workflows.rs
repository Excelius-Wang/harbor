use async_trait::async_trait;
use serde::Serialize;

use super::super::{
    authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient,
};

const WORKFLOW_PAGE_SIZE: u8 = 100;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflow {
    pub id: u64,
    pub name: String,
    pub path: String,
    pub state: String,
    pub url: String,
}

#[async_trait]
pub(crate) trait GitHubWorkflowInventoryClient: Send + Sync {
    async fn list_workflows(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<Vec<GitHubWorkflow>, AppError>;
}

#[async_trait]
impl GitHubWorkflowInventoryClient for OctocrabGitHubClient {
    async fn list_workflows(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<Vec<GitHubWorkflow>, AppError> {
        let client = authenticated_client(token)?;
        load_workflows(&client, owner, repository).await
    }
}

impl GitHubService {
    pub async fn workflows(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<Vec<GitHubWorkflow>, AppError> {
        let token = self.load_access_token().await?;
        self.client.list_workflows(&token, owner, repository).await
    }
}

pub(super) async fn load_workflows(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<Vec<GitHubWorkflow>, AppError> {
    let page = client
        .workflows(owner, repository)
        .list()
        .per_page(WORKFLOW_PAGE_SIZE)
        .send()
        .await
        .map_err(github_error)?;
    let workflows = client.all_pages(page).await.map_err(github_error)?;
    Ok(sorted_workflows(workflows))
}

pub(super) fn workflow_from_github(
    workflow: octocrab::models::workflows::WorkFlow,
) -> GitHubWorkflow {
    GitHubWorkflow {
        id: workflow.id.into_inner(),
        name: workflow.name,
        path: workflow.path,
        state: workflow.state,
        url: workflow.html_url.to_string(),
    }
}

fn sorted_workflows(workflows: Vec<octocrab::models::workflows::WorkFlow>) -> Vec<GitHubWorkflow> {
    let mut workflows = workflows
        .into_iter()
        .map(workflow_from_github)
        .collect::<Vec<_>>();
    workflows.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });
    workflows
}

#[cfg(test)]
#[async_trait]
impl GitHubWorkflowInventoryClient for super::super::tests::FakeGitHubClient {
    async fn list_workflows(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<Vec<GitHubWorkflow>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(vec![GitHubWorkflow {
            id: 7,
            name: "CI".to_string(),
            path: ".github/workflows/ci.yml".to_string(),
            state: "active".to_string(),
            url: "https://github.com/octocat/hello-world/actions/workflows/ci.yml".to_string(),
        }])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workflow(id: u64, name: &str, state: &str) -> octocrab::models::workflows::WorkFlow {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "node_id": format!("workflow-{id}"),
            "name": name,
            "path": format!(".github/workflows/{name}.yml"),
            "state": state,
            "created_at": "2026-08-27T00:00:00Z",
            "updated_at": "2026-08-27T00:00:00Z",
            "url": format!("https://api.github.com/workflows/{id}"),
            "html_url": format!("https://github.com/workflows/{id}"),
            "badge_url": format!("https://github.com/workflows/{id}/badge.svg")
        }))
        .expect("workflow fixture")
    }

    #[test]
    fn inventory_keeps_disabled_workflows_and_sorts_by_name() {
        let workflows = sorted_workflows(vec![
            workflow(9, "release", "disabled_manually"),
            workflow(7, "CI", "active"),
        ]);

        assert_eq!(
            workflows
                .iter()
                .map(|workflow| (workflow.id, workflow.name.as_str(), workflow.state.as_str()))
                .collect::<Vec<_>>(),
            vec![(7, "CI", "active"), (9, "release", "disabled_manually")]
        );
    }
}
