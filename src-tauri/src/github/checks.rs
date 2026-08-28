use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, serialized_enum_name, AppError, GitHubService,
    OctocrabGitHubClient,
};

const CHECK_PAGE_SIZE: u8 = 100;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubCheckKind {
    CheckRun,
    CommitStatus,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheck {
    pub id: String,
    pub kind: GitHubCheckKind,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckPage {
    pub checks: Vec<GitHubCheck>,
    pub total_count: u64,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubCheckSuite {
    pub id: u64,
    pub head_sha: String,
    pub head_branch: Option<String>,
    pub status: String,
    pub conclusion: Option<String>,
    pub app_name: Option<String>,
}

#[async_trait]
pub(crate) trait GitHubCheckClient: Send + Sync {
    async fn check_suite(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
    ) -> Result<GitHubCheckSuite, AppError>;

    async fn check_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError>;

    async fn check_suite_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError>;
}

#[async_trait]
impl GitHubCheckClient for OctocrabGitHubClient {
    async fn check_suite(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
    ) -> Result<GitHubCheckSuite, AppError> {
        let client = authenticated_client(token)?;
        let suite: RawCheckSuite = client
            .get(
                check_suite_route(owner, repository, check_suite_id),
                None::<&()>,
            )
            .await
            .map_err(github_error)?;

        Ok(check_suite_from_github(suite))
    }

    async fn check_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError> {
        let client = authenticated_client(token)?;
        let route = format!("/repos/{owner}/{repository}/commits/{reference}/check-runs");
        let parameters = PageParameters {
            per_page: CHECK_PAGE_SIZE,
            page,
        };
        let repository_handler = client.repos(owner, repository);
        let (check_runs, statuses) = tokio::join!(
            client.get::<RawCheckRuns, _, _>(route, Some(&parameters)),
            repository_handler
                .list_statuses(reference.to_string())
                .per_page(CHECK_PAGE_SIZE)
                .page(page)
                .send(),
        );
        let check_runs = check_runs.map_err(github_error)?;
        let statuses = statuses.map_err(github_error)?;
        let statuses_have_more = statuses.next.is_some();
        let status_count = statuses.items.len() as u64;
        let mut checks = check_runs
            .check_runs
            .into_iter()
            .map(check_from_raw_check_run)
            .collect::<Vec<_>>();
        checks.extend(statuses.items.into_iter().map(check_from_commit_status));
        checks.sort_by_key(|check| check.name.to_lowercase());
        let total_count = check_runs.total_count + status_count;
        let has_more = (u64::from(page) * u64::from(CHECK_PAGE_SIZE)) < check_runs.total_count
            || statuses_have_more;

        Ok(GitHubCheckPage {
            checks,
            total_count,
            page,
            has_previous: page > 1,
            has_more,
        })
    }

    async fn check_suite_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError> {
        let client = authenticated_client(token)?;
        let parameters = PageParameters {
            per_page: CHECK_PAGE_SIZE,
            page,
        };
        let runs: RawCheckRuns = client
            .get(
                check_suite_runs_route(owner, repository, check_suite_id),
                Some(&parameters),
            )
            .await
            .map_err(github_error)?;
        let total_count = runs.total_count;
        let mut checks = runs
            .check_runs
            .into_iter()
            .map(check_from_raw_check_run)
            .collect::<Vec<_>>();
        checks.sort_by_key(|check| check.name.to_lowercase());

        Ok(GitHubCheckPage {
            checks,
            total_count,
            page,
            has_previous: page > 1,
            has_more: u64::from(page) * u64::from(CHECK_PAGE_SIZE) < total_count,
        })
    }
}

impl GitHubService {
    pub async fn check_suite(
        &self,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
    ) -> Result<GitHubCheckSuite, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .check_suite(&token, owner, repository, check_suite_id)
            .await
    }

    pub async fn checks(
        &self,
        owner: &str,
        repository: &str,
        reference: &str,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .check_runs(&token, owner, repository, reference, page)
            .await
    }

    pub async fn check_suite_runs(
        &self,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .check_suite_runs(&token, owner, repository, check_suite_id, page)
            .await
    }
}

#[derive(Serialize)]
struct PageParameters {
    per_page: u8,
    page: u32,
}

#[derive(Deserialize)]
struct RawCheckSuite {
    id: u64,
    head_sha: String,
    head_branch: Option<String>,
    status: String,
    conclusion: Option<String>,
    app: Option<RawCheckSuiteApp>,
}

#[derive(Deserialize)]
struct RawCheckSuiteApp {
    name: String,
}

#[derive(Deserialize)]
struct RawCheckRuns {
    total_count: u64,
    check_runs: Vec<RawCheckRun>,
}

#[derive(Deserialize)]
struct RawCheckRun {
    id: u64,
    name: String,
    status: String,
    conclusion: Option<String>,
    details_url: Option<String>,
    html_url: Option<String>,
    output: RawCheckRunOutput,
    started_at: Option<String>,
    completed_at: Option<String>,
}

#[derive(Deserialize)]
struct RawCheckRunOutput {
    title: Option<String>,
    summary: Option<String>,
}

fn check_suite_from_github(suite: RawCheckSuite) -> GitHubCheckSuite {
    GitHubCheckSuite {
        id: suite.id,
        head_sha: suite.head_sha,
        head_branch: suite.head_branch,
        status: suite.status,
        conclusion: suite.conclusion,
        app_name: suite.app.map(|app| app.name),
    }
}

fn check_suite_route(owner: &str, repository: &str, check_suite_id: u64) -> String {
    format!("/repos/{owner}/{repository}/check-suites/{check_suite_id}")
}

fn check_suite_runs_route(owner: &str, repository: &str, check_suite_id: u64) -> String {
    format!(
        "{}/check-runs",
        check_suite_route(owner, repository, check_suite_id)
    )
}

fn check_from_raw_check_run(check: RawCheckRun) -> GitHubCheck {
    GitHubCheck {
        id: format!("check-run-{}", check.id),
        kind: GitHubCheckKind::CheckRun,
        name: check.name,
        status: check.status,
        conclusion: check.conclusion,
        description: check.output.title.or(check.output.summary),
        url: check.details_url.or(check.html_url),
        started_at: check.started_at,
        completed_at: check.completed_at,
    }
}

fn check_from_commit_status(status: octocrab::models::Status) -> GitHubCheck {
    let state = serialized_enum_name(&status.state).unwrap_or_else(|| "pending".to_string());
    let completed = state != "pending";
    GitHubCheck {
        id: status
            .id
            .map(|id| format!("commit-status-{}", id.into_inner()))
            .unwrap_or_else(|| {
                format!(
                    "commit-status-{}",
                    status.context.as_deref().unwrap_or("unknown")
                )
            }),
        kind: GitHubCheckKind::CommitStatus,
        name: status
            .context
            .unwrap_or_else(|| "Commit status".to_string()),
        status: if completed { "completed" } else { "pending" }.to_string(),
        conclusion: completed.then_some(state),
        description: status.description,
        url: status.target_url,
        started_at: status.created_at.map(|date| date.to_rfc3339()),
        completed_at: status.updated_at.map(|date| date.to_rfc3339()),
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubCheckClient for super::tests::FakeGitHubClient {
    async fn check_suite(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
    ) -> Result<GitHubCheckSuite, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, check_suite_id),
            ("octocat", "hello-world", 66)
        );
        Ok(GitHubCheckSuite {
            id: check_suite_id,
            head_sha: "0123456789abcdef0123456789abcdef01234567".to_string(),
            head_branch: Some("main".to_string()),
            status: "completed".to_string(),
            conclusion: Some("success".to_string()),
            app_name: Some("GitHub Actions".to_string()),
        })
    }

    async fn check_runs(
        &self,
        _token: &str,
        _owner: &str,
        _repository: &str,
        _reference: &str,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError> {
        Ok(GitHubCheckPage {
            checks: Vec::new(),
            total_count: 0,
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn check_suite_runs(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        check_suite_id: u64,
        page: u32,
    ) -> Result<GitHubCheckPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, check_suite_id),
            ("octocat", "hello-world", 66)
        );
        Ok(GitHubCheckPage {
            checks: Vec::new(),
            total_count: 0,
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_suite_keeps_the_commit_identity_needed_by_native_details() {
        let suite: RawCheckSuite = serde_json::from_value(serde_json::json!({
            "id": 66,
            "head_sha": "0123456789abcdef0123456789abcdef01234567",
            "head_branch": "main",
            "status": "completed",
            "conclusion": "failure",
            "app": { "name": "GitHub Actions" }
        }))
        .expect("check suite fixture");

        let mapped = check_suite_from_github(suite);

        assert_eq!(mapped.id, 66);
        assert_eq!(mapped.head_sha, "0123456789abcdef0123456789abcdef01234567");
        assert_eq!(mapped.head_branch.as_deref(), Some("main"));
        assert_eq!(mapped.conclusion.as_deref(), Some("failure"));
        assert_eq!(mapped.app_name.as_deref(), Some("GitHub Actions"));
    }

    #[test]
    fn check_suite_route_matches_githubs_native_endpoint() {
        assert_eq!(
            check_suite_route("octocat", "hello-world", 66),
            "/repos/octocat/hello-world/check-suites/66"
        );
        assert_eq!(
            check_suite_runs_route("octocat", "hello-world", 66),
            "/repos/octocat/hello-world/check-suites/66/check-runs"
        );
    }
}
