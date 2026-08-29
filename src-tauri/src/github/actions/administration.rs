use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use http::StatusCode;
use serde::Serialize;

use super::workflows::{workflow_from_github, GitHubWorkflow};
use super::{
    super::{authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient},
    workflow_run_route, RawWorkflowRun,
};

const WORKFLOW_RUN_DELETION_AGE_DAYS: i64 = 14;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowRunDeletion {
    pub run_id: u64,
}

#[async_trait]
pub(crate) trait GitHubActionsAdministrationClient: Send + Sync {
    async fn set_workflow_enabled(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        expected_state: &str,
        enabled: bool,
    ) -> Result<GitHubWorkflow, AppError>;

    async fn delete_workflow_run(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        expected_updated_at: &str,
    ) -> Result<GitHubWorkflowRunDeletion, AppError>;
}

#[async_trait]
impl GitHubActionsAdministrationClient for OctocrabGitHubClient {
    async fn set_workflow_enabled(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        expected_state: &str,
        enabled: bool,
    ) -> Result<GitHubWorkflow, AppError> {
        let client = authenticated_client(token)?;
        let current = load_workflow(&client, owner, repository, workflow_id).await?;
        ensure_workflow_state_matches(&current, workflow_id, expected_state)?;
        ensure_workflow_state_change_allowed(&current, enabled)?;

        let desired_state = workflow_state(enabled);
        if current.state != desired_state {
            request_workflow_state_change(&client, owner, repository, workflow_id, enabled).await?;
        }

        let updated = load_workflow(&client, owner, repository, workflow_id).await?;
        ensure_workflow_state_response(&updated, workflow_id, desired_state)?;
        Ok(workflow_from_github(updated))
    }

    async fn delete_workflow_run(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        expected_updated_at: &str,
    ) -> Result<GitHubWorkflowRunDeletion, AppError> {
        let client = authenticated_client(token)?;
        let run: RawWorkflowRun = client
            .get(workflow_run_route(owner, repository, run_id), None::<&()>)
            .await
            .map_err(github_error)?;
        ensure_workflow_run_can_be_deleted(
            &run,
            owner,
            repository,
            run_id,
            expected_updated_at,
            Utc::now(),
        )?;

        let response = client
            ._delete(workflow_run_route(owner, repository, run_id), None::<&()>)
            .await
            .map_err(github_error)?;
        let status = response.status();
        octocrab::map_github_error(response)
            .await
            .map_err(github_error)?;
        if status != StatusCode::NO_CONTENT {
            return Err(AppError::GitHub(format!(
                "GitHub returned unexpected workflow run deletion status {status}"
            )));
        }

        Ok(GitHubWorkflowRunDeletion { run_id })
    }
}

impl GitHubService {
    pub async fn set_workflow_enabled(
        &self,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        expected_state: &str,
        enabled: bool,
    ) -> Result<GitHubWorkflow, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .set_workflow_enabled(
                &token,
                owner,
                repository,
                workflow_id,
                expected_state,
                enabled,
            )
            .await
    }

    pub async fn delete_workflow_run(
        &self,
        owner: &str,
        repository: &str,
        run_id: u64,
        expected_updated_at: &str,
    ) -> Result<GitHubWorkflowRunDeletion, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_workflow_run(&token, owner, repository, run_id, expected_updated_at)
            .await
    }
}

async fn load_workflow(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    workflow_id: u64,
) -> Result<octocrab::models::workflows::WorkFlow, AppError> {
    client
        .get(workflow_route(owner, repository, workflow_id), None::<&()>)
        .await
        .map_err(github_error)
}

async fn request_workflow_state_change(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    workflow_id: u64,
    enabled: bool,
) -> Result<(), AppError> {
    let response = client
        ._put(
            workflow_state_route(owner, repository, workflow_id, enabled),
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
            "GitHub returned unexpected workflow state update status {status}"
        )));
    }
    Ok(())
}

fn workflow_route(owner: &str, repository: &str, workflow_id: u64) -> String {
    format!("/repos/{owner}/{repository}/actions/workflows/{workflow_id}")
}

fn workflow_state_route(owner: &str, repository: &str, workflow_id: u64, enabled: bool) -> String {
    let action = if enabled { "enable" } else { "disable" };
    format!(
        "{}/{action}",
        workflow_route(owner, repository, workflow_id)
    )
}

fn workflow_state(enabled: bool) -> &'static str {
    if enabled {
        "active"
    } else {
        "disabled_manually"
    }
}

fn ensure_workflow_state_matches(
    workflow: &octocrab::models::workflows::WorkFlow,
    workflow_id: u64,
    expected_state: &str,
) -> Result<(), AppError> {
    if workflow.id.into_inner() != workflow_id {
        return Err(AppError::GitHub(
            "GitHub returned a different workflow than requested".to_string(),
        ));
    }
    if workflow.state != expected_state {
        return Err(AppError::Validation(
            "the workflow state changed; refresh Actions before trying again".to_string(),
        ));
    }
    Ok(())
}

fn ensure_workflow_state_response(
    workflow: &octocrab::models::workflows::WorkFlow,
    workflow_id: u64,
    expected_state: &str,
) -> Result<(), AppError> {
    if workflow.id.into_inner() != workflow_id || workflow.state != expected_state {
        return Err(AppError::GitHub(
            "GitHub did not return the requested workflow state".to_string(),
        ));
    }
    Ok(())
}

fn ensure_workflow_state_change_allowed(
    workflow: &octocrab::models::workflows::WorkFlow,
    enabled: bool,
) -> Result<(), AppError> {
    let allowed = matches!(
        (enabled, workflow.state.as_str()),
        (true, "active" | "disabled_manually" | "disabled_inactivity")
            | (false, "active" | "disabled_manually")
    );
    if allowed {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "workflow state '{}' cannot be {} manually",
            workflow.state,
            if enabled { "enabled" } else { "disabled" }
        )))
    }
}

fn ensure_workflow_run_can_be_deleted(
    run: &RawWorkflowRun,
    owner: &str,
    repository: &str,
    run_id: u64,
    expected_updated_at: &str,
    now: DateTime<Utc>,
) -> Result<(), AppError> {
    if run.id != run_id {
        return Err(AppError::GitHub(
            "GitHub returned a different workflow run than requested".to_string(),
        ));
    }
    let expected_full_name = format!("{owner}/{repository}");
    if run
        .repository
        .as_ref()
        .map(|repository| repository.full_name.as_str())
        != Some(expected_full_name.as_str())
    {
        return Err(AppError::GitHub(
            "GitHub returned a workflow run from a different repository".to_string(),
        ));
    }
    if run.updated_at != expected_updated_at {
        return Err(AppError::Validation(
            "the workflow run changed; refresh Actions before deleting it".to_string(),
        ));
    }
    if run.status == "completed" {
        return Ok(());
    }

    let created_at = DateTime::parse_from_rfc3339(&run.created_at)
        .map_err(|error| AppError::GitHub(format!("invalid workflow run timestamp: {error}")))?
        .with_timezone(&Utc);
    if created_at <= now - Duration::days(WORKFLOW_RUN_DELETION_AGE_DAYS) {
        return Ok(());
    }

    Err(AppError::Validation(
        "workflow runs can be deleted after they complete or become more than two weeks old"
            .to_string(),
    ))
}

#[cfg(test)]
#[async_trait]
impl GitHubActionsAdministrationClient for super::super::tests::FakeGitHubClient {
    async fn set_workflow_enabled(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        expected_state: &str,
        enabled: bool,
    ) -> Result<GitHubWorkflow, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, workflow_id),
            ("octocat", "hello-world", 7)
        );
        assert_eq!(expected_state, "active");
        assert!(!enabled);
        Ok(GitHubWorkflow {
            id: workflow_id,
            name: "CI".to_string(),
            path: ".github/workflows/ci.yml".to_string(),
            state: "disabled_manually".to_string(),
            url: "https://github.com/octocat/hello-world/actions/workflows/ci.yml".to_string(),
        })
    }

    async fn delete_workflow_run(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        expected_updated_at: &str,
    ) -> Result<GitHubWorkflowRunDeletion, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, run_id), ("octocat", "hello-world", 42));
        assert_eq!(expected_updated_at, "2026-08-26T08:05:00Z");
        Ok(GitHubWorkflowRunDeletion { run_id })
    }
}

#[cfg(test)]
mod tests {
    use super::super::RawWorkflowRepository;
    use super::*;
    use chrono::TimeZone;

    fn workflow(id: u64, state: &str) -> octocrab::models::workflows::WorkFlow {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "node_id": format!("workflow-{id}"),
            "name": "CI",
            "path": ".github/workflows/ci.yml",
            "state": state,
            "created_at": "2026-08-01T00:00:00Z",
            "updated_at": "2026-08-29T00:00:00Z",
            "url": format!("https://api.github.com/workflows/{id}"),
            "html_url": format!("https://github.com/workflows/{id}"),
            "badge_url": format!("https://github.com/workflows/{id}/badge.svg")
        }))
        .expect("workflow fixture")
    }

    fn workflow_run(status: &str, created_at: &str) -> RawWorkflowRun {
        RawWorkflowRun {
            id: 42,
            workflow_id: 7,
            name: Some("CI".to_string()),
            display_title: Some("Keep Actions inside Harbor".to_string()),
            run_number: 19,
            run_attempt: 1,
            event: "push".to_string(),
            status: status.to_string(),
            conclusion: None,
            head_branch: Some("main".to_string()),
            head_sha: "abcdef123456".to_string(),
            head_commit: None,
            actor: None,
            repository: Some(RawWorkflowRepository {
                full_name: "octocat/hello-world".to_string(),
            }),
            created_at: created_at.to_string(),
            updated_at: "2026-08-29T08:05:00Z".to_string(),
            run_started_at: None,
            html_url: "https://github.com/octocat/hello-world/actions/runs/42".to_string(),
        }
    }

    #[test]
    fn administration_routes_match_githubs_official_endpoints() {
        assert_eq!(
            workflow_state_route("octocat", "hello-world", 7, true),
            "/repos/octocat/hello-world/actions/workflows/7/enable"
        );
        assert_eq!(
            workflow_state_route("octocat", "hello-world", 7, false),
            "/repos/octocat/hello-world/actions/workflows/7/disable"
        );
        assert_eq!(
            workflow_run_route("octocat", "hello-world", 42),
            "/repos/octocat/hello-world/actions/runs/42"
        );
    }

    #[test]
    fn workflow_state_guard_rejects_stale_or_mismatched_responses() {
        let active = workflow(7, "active");
        assert!(ensure_workflow_state_matches(&active, 7, "active").is_ok());
        assert!(matches!(
            ensure_workflow_state_matches(&active, 7, "disabled_manually"),
            Err(AppError::Validation(_))
        ));
        assert!(ensure_workflow_state_response(&active, 7, "active").is_ok());
        assert!(ensure_workflow_state_response(&active, 8, "active").is_err());
    }

    #[test]
    fn workflow_state_actions_follow_githubs_supported_matrix() {
        assert!(ensure_workflow_state_change_allowed(&workflow(7, "active"), false).is_ok());
        assert!(
            ensure_workflow_state_change_allowed(&workflow(7, "disabled_manually"), true).is_ok()
        );
        assert!(
            ensure_workflow_state_change_allowed(&workflow(7, "disabled_inactivity"), true).is_ok()
        );
        assert!(ensure_workflow_state_change_allowed(&workflow(7, "disabled_fork"), true).is_err());
        assert!(ensure_workflow_state_change_allowed(&workflow(7, "deleted"), true).is_err());
    }

    #[test]
    fn workflow_run_deletion_matches_github_web_eligibility() {
        let now = Utc.with_ymd_and_hms(2026, 8, 29, 12, 0, 0).unwrap();
        let completed = workflow_run("completed", "2026-08-29T11:00:00Z");
        let old = workflow_run("in_progress", "2026-08-14T11:59:59Z");
        let active = workflow_run("in_progress", "2026-08-29T11:00:00Z");

        assert!(ensure_workflow_run_can_be_deleted(
            &completed,
            "octocat",
            "hello-world",
            42,
            "2026-08-29T08:05:00Z",
            now
        )
        .is_ok());
        assert!(ensure_workflow_run_can_be_deleted(
            &old,
            "octocat",
            "hello-world",
            42,
            "2026-08-29T08:05:00Z",
            now
        )
        .is_ok());
        assert!(matches!(
            ensure_workflow_run_can_be_deleted(
                &active,
                "octocat",
                "hello-world",
                42,
                "2026-08-29T08:05:00Z",
                now
            ),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn workflow_run_deletion_rejects_stale_identity() {
        let now = Utc.with_ymd_and_hms(2026, 8, 29, 12, 0, 0).unwrap();
        let completed = workflow_run("completed", "2026-08-29T11:00:00Z");

        assert!(matches!(
            ensure_workflow_run_can_be_deleted(
                &completed,
                "octocat",
                "hello-world",
                42,
                "stale",
                now
            ),
            Err(AppError::Validation(_))
        ));
        assert!(ensure_workflow_run_can_be_deleted(
            &completed,
            "octocat",
            "hello-world",
            41,
            "2026-08-29T08:05:00Z",
            now
        )
        .is_err());
    }
}
