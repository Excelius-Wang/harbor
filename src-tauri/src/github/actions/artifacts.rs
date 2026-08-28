use async_trait::async_trait;
use octocrab::{models::workflows::WorkflowListArtifact, params::actions::ArchiveFormat};
use serde::Serialize;

use super::super::{
    authenticated_client, download::safe_download_name_with_suffix, github_error, AppError,
    GitHubFileDownload, GitHubService, OctocrabGitHubClient,
};

const WORKFLOW_ARTIFACT_PAGE_SIZE: u8 = 30;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowArtifact {
    pub id: u64,
    pub name: String,
    pub size_in_bytes: u64,
    pub expired: bool,
    pub created_at: String,
    pub expires_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowArtifactPage {
    pub artifacts: Vec<GitHubWorkflowArtifact>,
    pub total_count: u64,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[async_trait]
pub(crate) trait GitHubWorkflowArtifactClient: Send + Sync {
    async fn list_workflow_artifacts(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowArtifactPage, AppError>;

    async fn download_workflow_artifact(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        artifact_id: u64,
    ) -> Result<GitHubFileDownload, AppError>;
}

#[async_trait]
impl GitHubWorkflowArtifactClient for OctocrabGitHubClient {
    async fn list_workflow_artifacts(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowArtifactPage, AppError> {
        let client = authenticated_client(token)?;
        let response = client
            .actions()
            .list_workflow_run_artifacts(owner, repository, run_id.into())
            .per_page(WORKFLOW_ARTIFACT_PAGE_SIZE)
            .page(page)
            .send()
            .await
            .map_err(github_error)?;
        let artifacts = response.value.ok_or_else(|| {
            AppError::GitHub("GitHub returned an empty artifact response".to_string())
        })?;

        Ok(GitHubWorkflowArtifactPage {
            total_count: artifacts
                .total_count
                .unwrap_or(artifacts.items.len() as u64),
            artifacts: artifacts
                .items
                .into_iter()
                .map(workflow_artifact_from_octocrab)
                .collect(),
            page,
            has_previous: page > 1,
            has_more: artifacts.next.is_some(),
        })
    }

    async fn download_workflow_artifact(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        artifact_id: u64,
    ) -> Result<GitHubFileDownload, AppError> {
        let client = authenticated_client(token)?;
        let artifact: WorkflowListArtifact = client
            .get(
                workflow_artifact_route(owner, repository, artifact_id),
                None::<&()>,
            )
            .await
            .map_err(github_error)?;
        ensure_workflow_artifact_download_allowed(&artifact, run_id)?;

        let bytes = client
            .actions()
            .download_artifact(owner, repository, artifact_id.into(), ArchiveFormat::Zip)
            .await
            .map_err(workflow_artifact_download_error)?;

        Ok(GitHubFileDownload {
            bytes: bytes.to_vec(),
        })
    }
}

impl GitHubService {
    pub async fn workflow_artifacts(
        &self,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowArtifactPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_workflow_artifacts(&token, owner, repository, run_id, page)
            .await
    }

    pub async fn download_workflow_artifact(
        &self,
        owner: &str,
        repository: &str,
        run_id: u64,
        artifact_id: u64,
    ) -> Result<GitHubFileDownload, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .download_workflow_artifact(&token, owner, repository, run_id, artifact_id)
            .await
    }
}

pub(crate) fn workflow_artifact_archive_name(name: &str) -> String {
    safe_download_name_with_suffix(name, "artifact", ".zip")
}

fn workflow_artifact_route(owner: &str, repository: &str, artifact_id: u64) -> String {
    format!("/repos/{owner}/{repository}/actions/artifacts/{artifact_id}")
}

fn workflow_artifact_from_octocrab(artifact: WorkflowListArtifact) -> GitHubWorkflowArtifact {
    GitHubWorkflowArtifact {
        id: artifact.id.into_inner(),
        name: artifact.name,
        size_in_bytes: u64::try_from(artifact.size_in_bytes).unwrap_or(u64::MAX),
        expired: artifact.expired,
        created_at: artifact.created_at.to_rfc3339(),
        expires_at: artifact.expires_at.to_rfc3339(),
    }
}

fn ensure_workflow_artifact_download_allowed(
    artifact: &WorkflowListArtifact,
    run_id: u64,
) -> Result<(), AppError> {
    if artifact
        .workflow_run
        .as_ref()
        .is_some_and(|workflow_run| workflow_run.id.into_inner() != run_id)
    {
        return Err(AppError::Validation(
            "workflow artifact does not belong to the selected workflow run".to_string(),
        ));
    }
    if artifact.expired {
        return Err(AppError::GitHubArtifactExpired);
    }
    Ok(())
}

fn workflow_artifact_download_error(error: octocrab::Error) -> AppError {
    if matches!(
        &error,
        octocrab::Error::GitHub { source, .. } if source.status_code.as_u16() == 410
    ) {
        return AppError::GitHubArtifactExpired;
    }
    github_error(error)
}

#[cfg(test)]
#[async_trait]
impl GitHubWorkflowArtifactClient for super::super::tests::FakeGitHubClient {
    async fn list_workflow_artifacts(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        page: u32,
    ) -> Result<GitHubWorkflowArtifactPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository, run_id), ("octocat", "hello-world", 42));
        Ok(GitHubWorkflowArtifactPage {
            artifacts: vec![GitHubWorkflowArtifact {
                id: 96,
                name: "frontend-dist".to_string(),
                size_in_bytes: 1_250_000,
                expired: false,
                created_at: "2026-08-26T08:05:00+00:00".to_string(),
                expires_at: "2026-11-24T08:05:00+00:00".to_string(),
            }],
            total_count: 1,
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn download_workflow_artifact(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        run_id: u64,
        artifact_id: u64,
    ) -> Result<GitHubFileDownload, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, run_id, artifact_id),
            ("octocat", "hello-world", 42, 96)
        );
        Ok(GitHubFileDownload {
            bytes: b"PK\x03\x04artifact".to_vec(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn artifact(expired: bool, run_id: u64) -> WorkflowListArtifact {
        serde_json::from_value(serde_json::json!({
            "id": 96,
            "node_id": "MDg6QXJ0aWZhY3Q5Ng==",
            "name": "frontend-dist",
            "size_in_bytes": 1250000,
            "url": "https://api.github.com/repos/octocat/hello-world/actions/artifacts/96",
            "archive_download_url": "https://api.github.com/repos/octocat/hello-world/actions/artifacts/96/zip",
            "expired": expired,
            "created_at": "2026-08-26T08:05:00Z",
            "updated_at": "2026-08-26T08:05:10Z",
            "expires_at": "2026-11-24T08:05:00Z",
            "workflow_run": {
                "id": run_id,
                "repository_id": 1,
                "head_repository_id": 1,
                "head_branch": "main",
                "head_sha": "abcdef123456"
            }
        }))
        .expect("workflow artifact fixture")
    }

    #[test]
    fn workflow_artifact_keeps_download_metadata() {
        let mapped = workflow_artifact_from_octocrab(artifact(false, 42));

        assert_eq!(mapped.id, 96);
        assert_eq!(mapped.name, "frontend-dist");
        assert_eq!(mapped.size_in_bytes, 1_250_000);
        assert!(!mapped.expired);
        assert_eq!(mapped.created_at, "2026-08-26T08:05:00+00:00");
        assert_eq!(mapped.expires_at, "2026-11-24T08:05:00+00:00");
    }

    #[test]
    fn artifact_download_requires_the_selected_run_and_an_active_archive() {
        assert!(ensure_workflow_artifact_download_allowed(&artifact(false, 42), 42).is_ok());
        assert!(matches!(
            ensure_workflow_artifact_download_allowed(&artifact(false, 41), 42),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            ensure_workflow_artifact_download_allowed(&artifact(true, 42), 42),
            Err(AppError::GitHubArtifactExpired)
        ));
    }

    #[test]
    fn artifact_archive_names_are_safe_and_keep_the_zip_extension() {
        assert_eq!(
            workflow_artifact_archive_name(" frontend/dist:macOS "),
            "frontend_dist_macOS.zip"
        );
        assert_eq!(workflow_artifact_archive_name("release.ZIP"), "release.ZIP");
        assert_eq!(workflow_artifact_archive_name(" .. "), "artifact.zip");
        assert!(workflow_artifact_archive_name(&"产物".repeat(100)).len() <= 204);
    }

    #[test]
    fn artifact_routes_match_githubs_native_endpoint() {
        assert_eq!(
            workflow_artifact_route("octocat", "hello-world", 96),
            "/repos/octocat/hello-world/actions/artifacts/96"
        );
    }
}
