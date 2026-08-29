use async_trait::async_trait;
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};

use super::{authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient};

mod administration;
mod artifacts;
mod dispatch;
mod filters;
mod workflows;
pub use administration::GitHubWorkflowRunDeletion;
pub(crate) use artifacts::workflow_artifact_archive_name;
pub use artifacts::GitHubWorkflowArtifactPage;
pub use dispatch::{GitHubWorkflowDispatchConfig, GitHubWorkflowDispatchOptions};
pub use filters::{GitHubWorkflowRunFilterOptions, GitHubWorkflowRunFilters};
pub use workflows::GitHubWorkflow;

const WORKFLOW_RUN_PAGE_SIZE: u8 = 30;
const WORKFLOW_JOB_PAGE_SIZE: u8 = 100;
const MAX_WORKFLOW_JOB_LOG_BYTES: usize = 2_000_000;
const GITHUB_MAX_PAGE_SIZE: u8 = 100;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubWorkflowRunStatusFilter {
    All,
    Queued,
    InProgress,
    Completed,
    Success,
    Failure,
    Cancelled,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubWorkflowRunAction {
    Cancel,
    RerunAll,
    RerunFailed,
}

impl GitHubWorkflowRunStatusFilter {
    fn query_value(self) -> Option<&'static str> {
        match self {
            Self::All => None,
            Self::Queued => Some("queued"),
            Self::InProgress => Some("in_progress"),
            Self::Completed => Some("completed"),
            Self::Success => Some("success"),
            Self::Failure => Some("failure"),
            Self::Cancelled => Some("cancelled"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowRun {
    pub id: u64,
    pub workflow_id: u64,
    pub workflow_name: String,
    pub title: String,
    pub run_number: u64,
    pub run_attempt: u64,
    pub event: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub head_branch: Option<String>,
    pub head_sha: String,
    pub head_commit_message: Option<String>,
    pub actor: Option<String>,
    pub actor_avatar_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowRunPage {
    pub runs: Vec<GitHubWorkflowRun>,
    pub total_count: u64,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowStep {
    pub name: String,
    pub number: i64,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowJob {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub runner_name: Option<String>,
    pub labels: Vec<String>,
    pub steps: Vec<GitHubWorkflowStep>,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowJobPage {
    pub jobs: Vec<GitHubWorkflowJob>,
    pub total_count: u64,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowJobLog {
    pub job_id: u64,
    pub content: String,
    pub truncated: bool,
}

#[async_trait]
pub(crate) trait GitHubActionsClient:
    administration::GitHubActionsAdministrationClient
    + artifacts::GitHubWorkflowArtifactClient
    + dispatch::GitHubWorkflowDispatchClient
    + filters::GitHubWorkflowRunFilterClient
    + workflows::GitHubWorkflowInventoryClient
    + Send
    + Sync
{
    async fn get_workflow_run(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
    ) -> Result<GitHubWorkflowRun, AppError>;

    async fn list_workflow_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
        filters: &GitHubWorkflowRunFilters,
    ) -> Result<GitHubWorkflowRunPage, AppError>;

    async fn list_workflow_jobs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowJobPage, AppError>;

    async fn workflow_job_log(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        job_id: u64,
    ) -> Result<GitHubWorkflowJobLog, AppError>;

    async fn request_workflow_run_action(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        action: GitHubWorkflowRunAction,
    ) -> Result<(), AppError>;

    async fn request_workflow_job_rerun(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        job_id: u64,
    ) -> Result<(), AppError>;
}

#[async_trait]
impl GitHubActionsClient for OctocrabGitHubClient {
    async fn get_workflow_run(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
    ) -> Result<GitHubWorkflowRun, AppError> {
        let client = authenticated_client(token)?;
        let run: RawWorkflowRun = client
            .get(workflow_run_route(owner, repository, run_id), None::<&()>)
            .await
            .map_err(github_error)?;

        Ok(workflow_run_from_github(run))
    }

    async fn list_workflow_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
        filters: &GitHubWorkflowRunFilters,
    ) -> Result<GitHubWorkflowRunPage, AppError> {
        let client = authenticated_client(token)?;
        let runs = load_raw_workflow_runs(
            &client,
            owner,
            repository,
            workflow_id,
            filters,
            WORKFLOW_RUN_PAGE_SIZE,
        )
        .await?;

        Ok(GitHubWorkflowRunPage {
            total_count: runs.total_count.unwrap_or(runs.items.len() as u64),
            runs: runs
                .items
                .into_iter()
                .map(workflow_run_from_github)
                .collect(),
            page: filters.page,
            has_previous: filters.page > 1,
            has_more: runs.next.is_some(),
        })
    }

    async fn list_workflow_jobs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowJobPage, AppError> {
        let client = authenticated_client(token)?;
        let route = format!("/repos/{owner}/{repository}/actions/runs/{run_id}/jobs");
        let parameters = WorkflowJobParameters {
            filter: "latest",
            per_page: WORKFLOW_JOB_PAGE_SIZE,
            page,
        };
        let jobs: octocrab::Page<RawWorkflowJob> = client
            .get(route, Some(&parameters))
            .await
            .map_err(github_error)?;

        Ok(GitHubWorkflowJobPage {
            total_count: jobs.total_count.unwrap_or(jobs.items.len() as u64),
            jobs: jobs
                .items
                .into_iter()
                .map(workflow_job_from_github)
                .collect(),
            page,
            has_previous: page > 1,
            has_more: jobs.next.is_some(),
        })
    }

    async fn workflow_job_log(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        job_id: u64,
    ) -> Result<GitHubWorkflowJobLog, AppError> {
        let client = authenticated_client(token)?;
        let route = format!("/repos/{owner}/{repository}/actions/jobs/{job_id}/logs");
        let uri = http::Uri::builder()
            .path_and_query(route)
            .build()
            .map_err(|error| AppError::GitHub(error.to_string()))?;
        let response = client._get(uri).await.map_err(github_error)?;
        let response = client
            .follow_location_to_data(response)
            .await
            .map_err(github_error)?;
        let bytes = response
            .into_body()
            .collect()
            .await
            .map_err(github_error)?
            .to_bytes();

        Ok(workflow_job_log_from_bytes(job_id, &bytes))
    }

    async fn request_workflow_run_action(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        action: GitHubWorkflowRunAction,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let run: RawWorkflowRun = client
            .get(workflow_run_route(owner, repository, run_id), None::<&()>)
            .await
            .map_err(github_error)?;
        ensure_workflow_run_action_allowed(&run, action)?;

        match action {
            GitHubWorkflowRunAction::Cancel => client
                .actions()
                .cancel_workflow_run(owner, repository, run_id.into())
                .await
                .map_err(github_error),
            GitHubWorkflowRunAction::RerunAll | GitHubWorkflowRunAction::RerunFailed => {
                let route = workflow_rerun_route(owner, repository, run_id, action)?;
                request_workflow_rerun(&client, route).await
            }
        }
    }

    async fn request_workflow_job_rerun(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        job_id: u64,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let job: RawWorkflowJob = client
            .get(workflow_job_route(owner, repository, job_id), None::<&()>)
            .await
            .map_err(github_error)?;
        ensure_workflow_job_rerun_allowed(&job, run_id)?;

        request_workflow_rerun(&client, workflow_job_rerun_route(owner, repository, job_id)).await
    }
}

impl GitHubService {
    pub async fn workflow_run(
        &self,
        owner: &str,
        repository: &str,
        run_id: u64,
    ) -> Result<GitHubWorkflowRun, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .get_workflow_run(&token, owner, repository, run_id)
            .await
    }

    pub async fn workflow_runs(
        &self,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
        filters: &GitHubWorkflowRunFilters,
    ) -> Result<GitHubWorkflowRunPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_workflow_runs(&token, owner, repository, workflow_id, filters)
            .await
    }

    pub async fn workflow_jobs(
        &self,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowJobPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_workflow_jobs(&token, owner, repository, run_id, page)
            .await
    }

    pub async fn workflow_job_log(
        &self,
        owner: &str,
        repository: &str,
        job_id: u64,
    ) -> Result<GitHubWorkflowJobLog, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .workflow_job_log(&token, owner, repository, job_id)
            .await
    }

    pub async fn request_workflow_run_action(
        &self,
        owner: &str,
        repository: &str,
        run_id: u64,
        action: GitHubWorkflowRunAction,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .request_workflow_run_action(&token, owner, repository, run_id, action)
            .await
    }

    pub async fn request_workflow_job_rerun(
        &self,
        owner: &str,
        repository: &str,
        run_id: u64,
        job_id: u64,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .request_workflow_job_rerun(&token, owner, repository, run_id, job_id)
            .await
    }
}

fn workflow_run_route(owner: &str, repository: &str, run_id: u64) -> String {
    format!("/repos/{owner}/{repository}/actions/runs/{run_id}")
}

fn workflow_job_route(owner: &str, repository: &str, job_id: u64) -> String {
    format!("/repos/{owner}/{repository}/actions/jobs/{job_id}")
}

fn workflow_job_rerun_route(owner: &str, repository: &str, job_id: u64) -> String {
    format!("{}/rerun", workflow_job_route(owner, repository, job_id))
}

fn workflow_rerun_route(
    owner: &str,
    repository: &str,
    run_id: u64,
    action: GitHubWorkflowRunAction,
) -> Result<String, AppError> {
    let suffix = match action {
        GitHubWorkflowRunAction::RerunAll => "rerun",
        GitHubWorkflowRunAction::RerunFailed => "rerun-failed-jobs",
        GitHubWorkflowRunAction::Cancel => {
            return Err(AppError::Validation(
                "cancel is not a workflow rerun action".to_string(),
            ));
        }
    };
    Ok(format!(
        "/repos/{owner}/{repository}/actions/runs/{run_id}/{suffix}"
    ))
}

fn ensure_workflow_run_action_allowed(
    run: &RawWorkflowRun,
    action: GitHubWorkflowRunAction,
) -> Result<(), AppError> {
    match action {
        GitHubWorkflowRunAction::Cancel if run.status == "completed" => Err(AppError::Validation(
            "completed workflow runs cannot be cancelled".to_string(),
        )),
        GitHubWorkflowRunAction::RerunAll | GitHubWorkflowRunAction::RerunFailed
            if run.status != "completed" =>
        {
            Err(AppError::Validation(
                "workflow runs must be completed before they can be rerun".to_string(),
            ))
        }
        _ => Ok(()),
    }
}

fn ensure_workflow_job_rerun_allowed(job: &RawWorkflowJob, run_id: u64) -> Result<(), AppError> {
    if job.run_id != run_id {
        return Err(AppError::Validation(
            "workflow job does not belong to the selected workflow run".to_string(),
        ));
    }
    if job.status != "completed" {
        return Err(AppError::Validation(
            "workflow jobs must be completed before they can be rerun".to_string(),
        ));
    }
    Ok(())
}

async fn request_workflow_rerun(
    client: &octocrab::Octocrab,
    route: String,
) -> Result<(), AppError> {
    let response = client
        ._post(
            route,
            Some(&WorkflowRerunParameters {
                enable_debug_logging: false,
            }),
        )
        .await
        .map_err(github_error)?;
    octocrab::map_github_error(response)
        .await
        .map(drop)
        .map_err(github_error)
}

#[derive(Serialize)]
struct WorkflowRunParameters<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    branch: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    event: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    actor: Option<&'a str>,
    per_page: u8,
    page: u32,
}

impl<'a> WorkflowRunParameters<'a> {
    fn new(filters: &'a GitHubWorkflowRunFilters, per_page: u8) -> Self {
        Self {
            status: filters.status.query_value(),
            branch: non_empty_filter(&filters.branch),
            event: non_empty_filter(&filters.event),
            actor: non_empty_filter(&filters.actor),
            per_page,
            page: filters.page,
        }
    }
}

fn non_empty_filter(value: &str) -> Option<&str> {
    (!value.is_empty()).then_some(value)
}

async fn load_raw_workflow_runs(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    workflow_id: Option<u64>,
    filters: &GitHubWorkflowRunFilters,
    per_page: u8,
) -> Result<octocrab::Page<RawWorkflowRun>, AppError> {
    client
        .get(
            workflow_runs_route(owner, repository, workflow_id),
            Some(&WorkflowRunParameters::new(filters, per_page)),
        )
        .await
        .map_err(github_error)
}

async fn load_repository_branches(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<Vec<octocrab::models::repos::Branch>, AppError> {
    let page = client
        .repos(owner, repository)
        .list_branches()
        .per_page(GITHUB_MAX_PAGE_SIZE)
        .send()
        .await
        .map_err(github_error)?;
    client.all_pages(page).await.map_err(github_error)
}

#[derive(Serialize)]
struct WorkflowJobParameters<'a> {
    filter: &'a str,
    per_page: u8,
    page: u32,
}

#[derive(Serialize)]
struct WorkflowRerunParameters {
    enable_debug_logging: bool,
}

fn workflow_runs_route(owner: &str, repository: &str, workflow_id: Option<u64>) -> String {
    match workflow_id {
        Some(workflow_id) => {
            format!("/repos/{owner}/{repository}/actions/workflows/{workflow_id}/runs")
        }
        None => format!("/repos/{owner}/{repository}/actions/runs"),
    }
}

#[derive(Deserialize)]
struct RawWorkflowUser {
    login: String,
    avatar_url: String,
}

#[derive(Deserialize)]
struct RawWorkflowHeadCommit {
    message: String,
}

#[derive(Deserialize)]
struct RawWorkflowRepository {
    full_name: String,
}

#[derive(Deserialize)]
struct RawWorkflowRun {
    id: u64,
    workflow_id: u64,
    name: Option<String>,
    display_title: Option<String>,
    run_number: u64,
    #[serde(default = "default_workflow_run_attempt")]
    run_attempt: u64,
    event: String,
    status: String,
    conclusion: Option<String>,
    head_branch: Option<String>,
    head_sha: String,
    head_commit: Option<RawWorkflowHeadCommit>,
    actor: Option<RawWorkflowUser>,
    repository: Option<RawWorkflowRepository>,
    created_at: String,
    updated_at: String,
    run_started_at: Option<String>,
    html_url: String,
}

fn default_workflow_run_attempt() -> u64 {
    1
}

#[derive(Deserialize)]
struct RawWorkflowStep {
    name: String,
    number: i64,
    status: String,
    conclusion: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Deserialize)]
struct RawWorkflowJob {
    id: u64,
    run_id: u64,
    name: String,
    status: String,
    conclusion: Option<String>,
    started_at: Option<String>,
    completed_at: Option<String>,
    runner_name: Option<String>,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    steps: Vec<RawWorkflowStep>,
    html_url: String,
}

fn workflow_run_from_github(run: RawWorkflowRun) -> GitHubWorkflowRun {
    let workflow_name = run
        .name
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "Workflow".to_string());
    let head_commit_message = run.head_commit.map(|commit| commit.message);
    let title = run
        .display_title
        .filter(|title| !title.trim().is_empty())
        .or_else(|| {
            head_commit_message
                .as_deref()
                .and_then(|message| message.lines().next())
                .map(str::to_string)
                .filter(|title| !title.trim().is_empty())
        })
        .unwrap_or_else(|| format!("{workflow_name} #{}", run.run_number));
    let (actor, actor_avatar_url) = run
        .actor
        .map(|actor| (Some(actor.login), Some(actor.avatar_url)))
        .unwrap_or_default();

    GitHubWorkflowRun {
        id: run.id,
        workflow_id: run.workflow_id,
        workflow_name,
        title,
        run_number: run.run_number,
        run_attempt: run.run_attempt,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        head_branch: run.head_branch,
        head_sha: run.head_sha,
        head_commit_message,
        actor,
        actor_avatar_url,
        created_at: run.created_at,
        updated_at: run.updated_at,
        started_at: run.run_started_at,
        url: run.html_url,
    }
}

fn workflow_job_from_github(job: RawWorkflowJob) -> GitHubWorkflowJob {
    let mut steps = job
        .steps
        .into_iter()
        .map(|step| GitHubWorkflowStep {
            name: step.name,
            number: step.number,
            status: step.status,
            conclusion: step.conclusion,
            started_at: step.started_at,
            completed_at: step.completed_at,
        })
        .collect::<Vec<_>>();
    steps.sort_by_key(|step| step.number);

    GitHubWorkflowJob {
        id: job.id,
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        started_at: job.started_at,
        completed_at: job.completed_at,
        runner_name: job.runner_name,
        labels: job.labels,
        steps,
        url: job.html_url,
    }
}

fn workflow_job_log_from_bytes(job_id: u64, bytes: &[u8]) -> GitHubWorkflowJobLog {
    let truncated = bytes.len() > MAX_WORKFLOW_JOB_LOG_BYTES;
    let visible = if truncated {
        &bytes[bytes.len() - MAX_WORKFLOW_JOB_LOG_BYTES..]
    } else {
        bytes
    };

    GitHubWorkflowJobLog {
        job_id,
        content: String::from_utf8_lossy(visible).into_owned(),
        truncated,
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubActionsClient for super::tests::FakeGitHubClient {
    async fn get_workflow_run(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
    ) -> Result<GitHubWorkflowRun, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, run_id), ("octocat", "hello-world", 42));
        Ok(GitHubWorkflowRun {
            id: run_id,
            workflow_id: 7,
            workflow_name: "CI".to_string(),
            title: "Keep Actions inside Harbor".to_string(),
            run_number: 19,
            run_attempt: 1,
            event: "push".to_string(),
            status: "completed".to_string(),
            conclusion: Some("success".to_string()),
            head_branch: Some("main".to_string()),
            head_sha: "abcdef123456".to_string(),
            head_commit_message: None,
            actor: Some("octocat".to_string()),
            actor_avatar_url: None,
            created_at: "2026-08-26T08:00:00Z".to_string(),
            updated_at: "2026-08-26T08:05:00Z".to_string(),
            started_at: Some("2026-08-26T08:00:05Z".to_string()),
            url: "https://github.com/octocat/hello-world/actions/runs/42".to_string(),
        })
    }

    async fn list_workflow_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: Option<u64>,
        filters: &GitHubWorkflowRunFilters,
    ) -> Result<GitHubWorkflowRunPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert!(workflow_id.is_none() || workflow_id == Some(7));
        assert_eq!(filters.status, GitHubWorkflowRunStatusFilter::All);
        assert!(filters.branch.is_empty());
        assert!(filters.event.is_empty());
        assert!(filters.actor.is_empty());
        Ok(GitHubWorkflowRunPage {
            runs: Vec::new(),
            total_count: 0,
            page: filters.page,
            has_previous: filters.page > 1,
            has_more: false,
        })
    }

    async fn list_workflow_jobs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowJobPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, run_id), ("octocat", "hello-world", 42));
        Ok(GitHubWorkflowJobPage {
            jobs: Vec::new(),
            total_count: 0,
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn workflow_job_log(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        job_id: u64,
    ) -> Result<GitHubWorkflowJobLog, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, job_id), ("octocat", "hello-world", 84));
        Ok(GitHubWorkflowJobLog {
            job_id,
            content: "Finished".to_string(),
            truncated: false,
        })
    }

    async fn request_workflow_run_action(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        action: GitHubWorkflowRunAction,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, run_id), ("octocat", "hello-world", 42));
        assert!(matches!(
            action,
            GitHubWorkflowRunAction::Cancel
                | GitHubWorkflowRunAction::RerunAll
                | GitHubWorkflowRunAction::RerunFailed
        ));
        Ok(())
    }

    async fn request_workflow_job_rerun(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        job_id: u64,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, run_id, job_id),
            ("octocat", "hello-world", 42, 84)
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workflow_run(status: &str, conclusion: Option<&str>) -> RawWorkflowRun {
        RawWorkflowRun {
            id: 42,
            workflow_id: 7,
            name: Some("CI".to_string()),
            display_title: Some("Keep Actions inside Harbor".to_string()),
            run_number: 19,
            run_attempt: 1,
            event: "push".to_string(),
            status: status.to_string(),
            conclusion: conclusion.map(str::to_string),
            head_branch: Some("main".to_string()),
            head_sha: "abcdef123456".to_string(),
            head_commit: None,
            actor: None,
            repository: Some(RawWorkflowRepository {
                full_name: "octocat/hello-world".to_string(),
            }),
            created_at: "2026-08-26T08:00:00Z".to_string(),
            updated_at: "2026-08-26T08:05:00Z".to_string(),
            run_started_at: Some("2026-08-26T08:00:05Z".to_string()),
            html_url: "https://github.com/octocat/hello-world/actions/runs/42".to_string(),
        }
    }

    fn workflow_job(run_id: u64, status: &str, conclusion: Option<&str>) -> RawWorkflowJob {
        RawWorkflowJob {
            id: 84,
            run_id,
            name: "frontend / test".to_string(),
            status: status.to_string(),
            conclusion: conclusion.map(str::to_string),
            started_at: Some("2026-08-26T08:00:00Z".to_string()),
            completed_at: Some("2026-08-26T08:01:00Z".to_string()),
            runner_name: Some("GitHub Actions 2".to_string()),
            labels: vec!["ubuntu-latest".to_string()],
            steps: Vec::new(),
            html_url: "https://github.com/octocat/hello-world/actions/runs/42/job/84".to_string(),
        }
    }

    #[test]
    fn workflow_run_uses_display_title_and_keeps_execution_metadata() {
        let run: RawWorkflowRun = serde_json::from_value(serde_json::json!({
            "id": 42,
            "workflow_id": 7,
            "name": "CI",
            "display_title": "Keep Actions inside Harbor",
            "run_number": 19,
            "run_attempt": 2,
            "event": "push",
            "status": "completed",
            "conclusion": "success",
            "head_branch": "main",
            "head_sha": "abcdef123456",
            "head_commit": { "message": "Fallback commit title\n\nDetails" },
            "actor": { "login": "octocat", "avatar_url": "https://github.com/octocat.png" },
            "created_at": "2026-08-26T08:00:00Z",
            "updated_at": "2026-08-26T08:05:00Z",
            "run_started_at": "2026-08-26T08:00:05Z",
            "html_url": "https://github.com/octocat/hello-world/actions/runs/42"
        }))
        .expect("workflow run fixture");

        let mapped = workflow_run_from_github(run);

        assert_eq!(mapped.title, "Keep Actions inside Harbor");
        assert_eq!(mapped.workflow_name, "CI");
        assert_eq!(mapped.run_attempt, 2);
        assert_eq!(mapped.actor.as_deref(), Some("octocat"));
        assert_eq!(mapped.head_branch.as_deref(), Some("main"));
    }

    #[test]
    fn workflow_run_falls_back_to_the_first_commit_message_line() {
        let run: RawWorkflowRun = serde_json::from_value(serde_json::json!({
            "id": 42,
            "workflow_id": 7,
            "name": "CI",
            "display_title": " ",
            "run_number": 19,
            "event": "push",
            "status": "queued",
            "conclusion": null,
            "head_branch": "main",
            "head_sha": "abcdef123456",
            "head_commit": { "message": "Fallback commit title\n\nDetails" },
            "actor": null,
            "created_at": "2026-08-26T08:00:00Z",
            "updated_at": "2026-08-26T08:00:00Z",
            "run_started_at": null,
            "html_url": "https://github.com/octocat/hello-world/actions/runs/42"
        }))
        .expect("workflow run fixture");

        let mapped = workflow_run_from_github(run);

        assert_eq!(mapped.title, "Fallback commit title");
        assert_eq!(mapped.run_attempt, 1);
        assert_eq!(mapped.actor, None);
    }

    #[test]
    fn workflow_job_sorts_steps_by_execution_number() {
        let job: RawWorkflowJob = serde_json::from_value(serde_json::json!({
            "id": 84,
            "run_id": 42,
            "name": "frontend / test",
            "status": "completed",
            "conclusion": "failure",
            "started_at": "2026-08-26T08:00:00Z",
            "completed_at": "2026-08-26T08:01:00Z",
            "runner_name": "GitHub Actions 2",
            "labels": ["ubuntu-latest"],
            "steps": [
                { "name": "Test", "number": 2, "status": "completed", "conclusion": "failure", "started_at": null, "completed_at": null },
                { "name": "Checkout", "number": 1, "status": "completed", "conclusion": "success", "started_at": null, "completed_at": null }
            ],
            "html_url": "https://github.com/octocat/hello-world/actions/runs/42/job/84"
        }))
        .expect("workflow job fixture");

        let mapped = workflow_job_from_github(job);

        assert_eq!(mapped.steps[0].name, "Checkout");
        assert_eq!(mapped.steps[1].name, "Test");
        assert_eq!(mapped.conclusion.as_deref(), Some("failure"));
    }

    #[test]
    fn workflow_job_log_keeps_the_bounded_tail() {
        let mut bytes = vec![b'x'; MAX_WORKFLOW_JOB_LOG_BYTES + 8];
        bytes.extend_from_slice(b"failure at end");

        let log = workflow_job_log_from_bytes(84, &bytes);

        assert!(log.truncated);
        assert!(log.content.ends_with("failure at end"));
        assert!(log.content.len() <= MAX_WORKFLOW_JOB_LOG_BYTES);
    }

    #[test]
    fn workflow_status_filter_uses_github_values() {
        assert_eq!(GitHubWorkflowRunStatusFilter::All.query_value(), None);
        assert_eq!(
            GitHubWorkflowRunStatusFilter::InProgress.query_value(),
            Some("in_progress")
        );
        assert_eq!(
            GitHubWorkflowRunStatusFilter::Failure.query_value(),
            Some("failure")
        );
    }

    #[test]
    fn workflow_run_parameters_send_every_filter_to_github() {
        let filters = GitHubWorkflowRunFilters {
            status: GitHubWorkflowRunStatusFilter::Failure,
            branch: "release/v1".to_string(),
            event: "workflow_dispatch".to_string(),
            actor: "octocat".to_string(),
            page: 2,
        };

        assert_eq!(
            serde_json::to_value(WorkflowRunParameters::new(&filters, WORKFLOW_RUN_PAGE_SIZE,))
                .expect("workflow run parameters"),
            serde_json::json!({
                "status": "failure",
                "branch": "release/v1",
                "event": "workflow_dispatch",
                "actor": "octocat",
                "per_page": 30,
                "page": 2,
            })
        );

        let unfiltered = GitHubWorkflowRunFilters::default();
        assert_eq!(
            serde_json::to_value(WorkflowRunParameters::new(
                &unfiltered,
                WORKFLOW_RUN_PAGE_SIZE,
            ))
            .expect("unfiltered workflow run parameters"),
            serde_json::json!({ "per_page": 30, "page": 1 })
        );
    }

    #[test]
    fn workflow_run_routes_support_repository_and_workflow_scopes() {
        assert_eq!(
            workflow_run_route("octocat", "hello-world", 42),
            "/repos/octocat/hello-world/actions/runs/42"
        );
        assert_eq!(
            workflow_runs_route("octocat", "hello-world", None),
            "/repos/octocat/hello-world/actions/runs"
        );
        assert_eq!(
            workflow_runs_route("octocat", "hello-world", Some(7)),
            "/repos/octocat/hello-world/actions/workflows/7/runs"
        );
    }

    #[test]
    fn workflow_actions_keep_the_tauri_contract_names() {
        assert_eq!(
            serde_json::to_value(GitHubWorkflowRunAction::Cancel).expect("cancel action"),
            serde_json::json!("cancel")
        );
        assert_eq!(
            serde_json::to_value(GitHubWorkflowRunAction::RerunAll).expect("rerun action"),
            serde_json::json!("rerunAll")
        );
        assert_eq!(
            serde_json::to_value(GitHubWorkflowRunAction::RerunFailed)
                .expect("rerun failed action"),
            serde_json::json!("rerunFailed")
        );
    }

    #[test]
    fn workflow_rerun_routes_match_githubs_native_endpoints() {
        assert_eq!(
            workflow_rerun_route(
                "octocat",
                "hello-world",
                42,
                GitHubWorkflowRunAction::RerunAll,
            )
            .expect("rerun all route"),
            "/repos/octocat/hello-world/actions/runs/42/rerun"
        );
        assert_eq!(
            workflow_rerun_route(
                "octocat",
                "hello-world",
                42,
                GitHubWorkflowRunAction::RerunFailed,
            )
            .expect("rerun failed route"),
            "/repos/octocat/hello-world/actions/runs/42/rerun-failed-jobs"
        );
        assert!(workflow_rerun_route(
            "octocat",
            "hello-world",
            42,
            GitHubWorkflowRunAction::Cancel,
        )
        .is_err());
    }

    #[test]
    fn workflow_job_rerun_route_matches_githubs_native_endpoint() {
        assert_eq!(
            workflow_job_rerun_route("octocat", "hello-world", 84),
            "/repos/octocat/hello-world/actions/jobs/84/rerun"
        );
    }

    #[test]
    fn workflow_actions_require_a_compatible_authoritative_state() {
        let active = workflow_run("in_progress", None);
        let completed = workflow_run("completed", Some("failure"));

        assert!(
            ensure_workflow_run_action_allowed(&active, GitHubWorkflowRunAction::Cancel).is_ok()
        );
        assert!(
            ensure_workflow_run_action_allowed(&completed, GitHubWorkflowRunAction::RerunAll)
                .is_ok()
        );
        assert!(matches!(
            ensure_workflow_run_action_allowed(&completed, GitHubWorkflowRunAction::Cancel),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            ensure_workflow_run_action_allowed(&active, GitHubWorkflowRunAction::RerunFailed),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn workflow_job_rerun_requires_a_completed_job_from_the_selected_run() {
        let completed = workflow_job(42, "completed", Some("success"));
        let failed = workflow_job(42, "completed", Some("failure"));
        let active = workflow_job(42, "in_progress", None);
        let stale = workflow_job(41, "completed", Some("failure"));

        assert!(ensure_workflow_job_rerun_allowed(&completed, 42).is_ok());
        assert!(ensure_workflow_job_rerun_allowed(&failed, 42).is_ok());
        assert!(matches!(
            ensure_workflow_job_rerun_allowed(&active, 42),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            ensure_workflow_job_rerun_allowed(&stale, 42),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn workflow_rerun_payload_keeps_debug_logging_disabled() {
        assert_eq!(
            serde_json::to_value(WorkflowRerunParameters {
                enable_debug_logging: false,
            })
            .expect("rerun payload"),
            serde_json::json!({ "enable_debug_logging": false })
        );
    }
}
