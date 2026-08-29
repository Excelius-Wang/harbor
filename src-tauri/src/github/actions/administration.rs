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
        expected_workflow_id: u64,
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
        set_workflow_enabled_with_client(
            &client,
            owner,
            repository,
            workflow_id,
            expected_state,
            enabled,
        )
        .await
    }

    async fn delete_workflow_run(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        expected_workflow_id: u64,
        expected_updated_at: &str,
    ) -> Result<GitHubWorkflowRunDeletion, AppError> {
        let client = authenticated_client(token)?;
        delete_workflow_run_with_client(
            &client,
            owner,
            repository,
            run_id,
            expected_workflow_id,
            expected_updated_at,
        )
        .await
    }
}

async fn set_workflow_enabled_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    workflow_id: u64,
    expected_state: &str,
    enabled: bool,
) -> Result<GitHubWorkflow, AppError> {
    let current = load_workflow(client, owner, repository, workflow_id).await?;
    ensure_workflow_state_matches(&current, workflow_id, expected_state)?;
    ensure_workflow_state_change_allowed(&current, enabled)?;

    let desired_state = workflow_state(enabled);
    request_workflow_state_change(client, owner, repository, workflow_id, enabled).await?;

    let updated = load_workflow(client, owner, repository, workflow_id).await?;
    ensure_workflow_state_response(&updated, workflow_id, desired_state)?;
    Ok(workflow_from_github(updated))
}

async fn delete_workflow_run_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    run_id: u64,
    expected_workflow_id: u64,
    expected_updated_at: &str,
) -> Result<GitHubWorkflowRunDeletion, AppError> {
    let run: RawWorkflowRun = client
        .get(workflow_run_route(owner, repository, run_id), None::<&()>)
        .await
        .map_err(workflow_run_deletion_error)?;
    ensure_workflow_run_can_be_deleted(
        &run,
        owner,
        repository,
        run_id,
        expected_workflow_id,
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
        .map_err(workflow_run_deletion_error)?;
    if status != StatusCode::NO_CONTENT {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected workflow run deletion status {status}"
        )));
    }

    Ok(GitHubWorkflowRunDeletion { run_id })
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
        expected_workflow_id: u64,
        expected_updated_at: &str,
    ) -> Result<GitHubWorkflowRunDeletion, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_workflow_run(
                &token,
                owner,
                repository,
                run_id,
                expected_workflow_id,
                expected_updated_at,
            )
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
        (true, "disabled_manually" | "disabled_inactivity") | (false, "active")
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
    expected_workflow_id: u64,
    expected_updated_at: &str,
    now: DateTime<Utc>,
) -> Result<(), AppError> {
    if run.id != run_id {
        return Err(AppError::GitHub(
            "GitHub returned a different workflow run than requested".to_string(),
        ));
    }
    if run.workflow_id != expected_workflow_id {
        return Err(AppError::Validation(
            "the workflow run belongs to a different workflow; refresh Actions before deleting it"
                .to_string(),
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

fn workflow_run_deletion_error(error: octocrab::Error) -> AppError {
    let status = match &error {
        octocrab::Error::GitHub { source, .. } => Some(source.status_code.as_u16()),
        _ => None,
    };
    status
        .and_then(workflow_run_deletion_status_error)
        .unwrap_or_else(|| github_error(error))
}

fn workflow_run_deletion_status_error(status: u16) -> Option<AppError> {
    match status {
        404 => Some(AppError::Validation(
            "the workflow run no longer exists; refresh Actions before continuing".to_string(),
        )),
        409 => Some(AppError::Validation(
            "GitHub rejected the workflow run deletion because its state changed; refresh Actions before trying again"
                .to_string(),
        )),
        _ => None,
    }
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
        expected_workflow_id: u64,
        expected_updated_at: &str,
    ) -> Result<GitHubWorkflowRunDeletion, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, run_id), ("octocat", "hello-world", 42));
        assert_eq!(expected_workflow_id, 7);
        assert_eq!(expected_updated_at, "2026-08-26T08:05:00Z");
        Ok(GitHubWorkflowRunDeletion { run_id })
    }
}

#[cfg(test)]
mod tests {
    use super::super::RawWorkflowRepository;
    use super::*;
    use chrono::TimeZone;
    use std::sync::{Arc, Mutex};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    struct MockResponse {
        status: &'static str,
        body: String,
    }

    async fn mock_github(
        responses: Vec<MockResponse>,
    ) -> (
        octocrab::Octocrab,
        Arc<Mutex<Vec<String>>>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
        let address = listener.local_addr().expect("mock address");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&requests);
        let server = tokio::spawn(async move {
            for response in responses {
                let (mut stream, _) = listener.accept().await.expect("mock accept");
                let mut buffer = Vec::new();
                loop {
                    let mut chunk = [0_u8; 1024];
                    let read = stream.read(&mut chunk).await.expect("mock read");
                    if read == 0 {
                        break;
                    }
                    buffer.extend_from_slice(&chunk[..read]);
                    if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                let request = String::from_utf8(buffer).expect("request utf8");
                captured
                    .lock()
                    .expect("request lock")
                    .push(request.lines().next().unwrap_or_default().to_string());
                let payload = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    response.status,
                    response.body.len(),
                    response.body
                );
                stream
                    .write_all(payload.as_bytes())
                    .await
                    .expect("mock write");
            }
        });
        let client = octocrab::Octocrab::builder()
            .base_uri(format!("http://{address}"))
            .expect("mock base uri")
            .personal_token("github-user-access-token".to_string())
            .build()
            .expect("mock client");
        (client, requests, server)
    }

    fn workflow_api_json(state: &str) -> String {
        serde_json::json!({
            "id": 7,
            "node_id": "workflow-7",
            "name": "CI",
            "path": ".github/workflows/ci.yml",
            "state": state,
            "created_at": "2026-08-01T00:00:00Z",
            "updated_at": "2026-08-29T00:00:00Z",
            "url": "https://api.github.com/repos/octocat/hello-world/actions/workflows/7",
            "html_url": "https://github.com/octocat/hello-world/actions/workflows/ci.yml",
            "badge_url": "https://github.com/octocat/hello-world/actions/workflows/ci.yml/badge.svg"
        })
        .to_string()
    }

    fn workflow_run_api_json() -> String {
        serde_json::json!({
            "id": 42,
            "workflow_id": 7,
            "name": "CI",
            "display_title": "Keep Actions inside Harbor",
            "run_number": 19,
            "run_attempt": 1,
            "event": "push",
            "status": "completed",
            "conclusion": "success",
            "head_branch": "main",
            "head_sha": "abcdef123456",
            "head_commit": null,
            "actor": null,
            "repository": { "full_name": "octocat/hello-world" },
            "created_at": "2026-08-26T08:00:00Z",
            "updated_at": "2026-08-26T08:05:00Z",
            "run_started_at": "2026-08-26T08:00:05Z",
            "html_url": "https://github.com/octocat/hello-world/actions/runs/42"
        })
        .to_string()
    }

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
        assert!(ensure_workflow_state_change_allowed(&workflow(7, "active"), true).is_err());
        assert!(
            ensure_workflow_state_change_allowed(&workflow(7, "disabled_manually"), false).is_err()
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
            7,
            "2026-08-29T08:05:00Z",
            now
        )
        .is_ok());
        assert!(ensure_workflow_run_can_be_deleted(
            &old,
            "octocat",
            "hello-world",
            42,
            7,
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
                7,
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
                7,
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
            7,
            "2026-08-29T08:05:00Z",
            now
        )
        .is_err());
        assert!(ensure_workflow_run_can_be_deleted(
            &completed,
            "octocat",
            "hello-world",
            42,
            8,
            "2026-08-29T08:05:00Z",
            now
        )
        .is_err());
    }

    #[test]
    fn workflow_run_deletion_conflicts_require_an_authoritative_refresh() {
        for status in [404, 409] {
            assert!(matches!(
                workflow_run_deletion_status_error(status),
                Some(AppError::Validation(message)) if message.contains("refresh Actions")
            ));
        }
        assert!(workflow_run_deletion_status_error(500).is_none());
    }

    #[tokio::test]
    async fn workflow_state_transport_reads_writes_and_verifies() {
        let (client, requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                body: workflow_api_json("active"),
            },
            MockResponse {
                status: "204 No Content",
                body: String::new(),
            },
            MockResponse {
                status: "200 OK",
                body: workflow_api_json("disabled_manually"),
            },
        ])
        .await;

        let updated =
            set_workflow_enabled_with_client(&client, "octocat", "hello-world", 7, "active", false)
                .await
                .expect("workflow disable");
        server.await.expect("mock server");

        assert_eq!(updated.state, "disabled_manually");
        assert_eq!(
            *requests.lock().expect("request lock"),
            [
                "GET /repos/octocat/hello-world/actions/workflows/7 HTTP/1.1",
                "PUT /repos/octocat/hello-world/actions/workflows/7/disable HTTP/1.1",
                "GET /repos/octocat/hello-world/actions/workflows/7 HTTP/1.1",
            ]
        );
    }

    #[tokio::test]
    async fn workflow_run_deletion_transport_preflights_before_no_content() {
        let (client, requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                body: workflow_run_api_json(),
            },
            MockResponse {
                status: "204 No Content",
                body: String::new(),
            },
        ])
        .await;

        let deletion = delete_workflow_run_with_client(
            &client,
            "octocat",
            "hello-world",
            42,
            7,
            "2026-08-26T08:05:00Z",
        )
        .await
        .expect("workflow run deletion");
        server.await.expect("mock server");

        assert_eq!(deletion.run_id, 42);
        assert_eq!(
            *requests.lock().expect("request lock"),
            [
                "GET /repos/octocat/hello-world/actions/runs/42 HTTP/1.1",
                "DELETE /repos/octocat/hello-world/actions/runs/42 HTTP/1.1",
            ]
        );
    }

    #[tokio::test]
    async fn workflow_run_deletion_transport_keeps_delete_conflicts_refreshable() {
        let (client, requests, server) = mock_github(vec![
            MockResponse {
                status: "200 OK",
                body: workflow_run_api_json(),
            },
            MockResponse {
                status: "409 Conflict",
                body: serde_json::json!({ "message": "Conflict" }).to_string(),
            },
        ])
        .await;

        let error = delete_workflow_run_with_client(
            &client,
            "octocat",
            "hello-world",
            42,
            7,
            "2026-08-26T08:05:00Z",
        )
        .await
        .expect_err("delete conflict");
        server.await.expect("mock server");

        assert!(
            matches!(error, AppError::Validation(message) if message.contains("refresh Actions"))
        );
        assert_eq!(requests.lock().expect("request lock").len(), 2);
    }
}
