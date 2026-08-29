use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error, repository_from_octocrab, AppError, GitHubRepository,
    GitHubService, OctocrabGitHubClient,
};

const NOTIFICATION_PAGE_SIZE: u8 = 50;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubNotificationAction {
    Read,
    Done,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubNotificationSubjectKind {
    Issue,
    PullRequest,
    Discussion,
    Commit,
    Release,
    CheckSuite,
    WorkflowRun,
    DependabotAlert,
    CodeScanningAlert,
    SecretScanningAlert,
    SecurityAlert,
    RepositoryInvitation,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubNotificationSubject {
    pub title: String,
    pub kind: GitHubNotificationSubjectKind,
    pub number: Option<u64>,
    pub release_id: Option<u64>,
    pub commit_sha: Option<String>,
    pub check_suite_id: Option<u64>,
    pub workflow_run_id: Option<u64>,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubNotification {
    pub id: u64,
    pub repository: GitHubRepository,
    pub subject: GitHubNotificationSubject,
    pub reason: String,
    pub unread: bool,
    pub updated_at: String,
    pub last_read_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubNotificationPage {
    pub notifications: Vec<GitHubNotification>,
    pub page: u32,
    pub has_previous: bool,
    pub has_more: bool,
}

#[async_trait]
pub(crate) trait GitHubNotificationClient: Send + Sync {
    async fn list_notifications(
        &self,
        token: &str,
        participating: bool,
        page: u32,
    ) -> Result<GitHubNotificationPage, AppError>;

    async fn update_notification(
        &self,
        token: &str,
        thread_id: u64,
        action: GitHubNotificationAction,
    ) -> Result<(), AppError>;

    async fn mark_all_notifications_read(&self, token: &str) -> Result<(), AppError>;
}

#[async_trait]
impl GitHubNotificationClient for OctocrabGitHubClient {
    async fn list_notifications(
        &self,
        token: &str,
        participating: bool,
        page: u32,
    ) -> Result<GitHubNotificationPage, AppError> {
        let client = authenticated_client(token)?;
        let page_number = u8::try_from(page)
            .map_err(|_| AppError::Validation("notification page is out of range".to_string()))?;
        let response = client
            .activity()
            .notifications()
            .list()
            .all(false)
            .participating(participating)
            .per_page(NOTIFICATION_PAGE_SIZE)
            .page(page_number)
            .send()
            .await
            .map_err(github_error)?;
        let has_more = response.next.is_some();

        Ok(notification_page_from_octocrab(
            response.items,
            page,
            has_more,
        ))
    }

    async fn update_notification(
        &self,
        token: &str,
        thread_id: u64,
        action: GitHubNotificationAction,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        match action {
            GitHubNotificationAction::Read => client
                .activity()
                .notifications()
                .mark_as_read(thread_id.into())
                .await
                .map_err(github_error),
            GitHubNotificationAction::Done => {
                let response = client
                    ._delete(format!("/notifications/threads/{thread_id}"), None::<&()>)
                    .await
                    .map_err(github_error)?;
                octocrab::map_github_error(response)
                    .await
                    .map(drop)
                    .map_err(github_error)
            }
        }
    }

    async fn mark_all_notifications_read(&self, token: &str) -> Result<(), AppError> {
        authenticated_client(token)?
            .activity()
            .notifications()
            .mark_all_as_read(None)
            .await
            .map_err(github_error)
    }
}

impl GitHubService {
    pub async fn notifications(
        &self,
        participating: bool,
        page: u32,
    ) -> Result<GitHubNotificationPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .list_notifications(&token, participating, page)
            .await
    }

    pub async fn update_notification(
        &self,
        thread_id: u64,
        action: GitHubNotificationAction,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_notification(&token, thread_id, action)
            .await
    }

    pub async fn mark_all_notifications_read(&self) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client.mark_all_notifications_read(&token).await
    }
}

fn notification_page_from_octocrab(
    notifications: Vec<octocrab::models::activity::Notification>,
    page: u32,
    has_more: bool,
) -> GitHubNotificationPage {
    GitHubNotificationPage {
        notifications: notifications
            .into_iter()
            .filter_map(notification_from_octocrab)
            .collect(),
        page,
        has_previous: page > 1,
        has_more,
    }
}

fn notification_from_octocrab(
    notification: octocrab::models::activity::Notification,
) -> Option<GitHubNotification> {
    let repository = repository_from_octocrab(notification.repository)?;
    let subject = notification_subject_from_octocrab(
        notification.subject,
        &repository.owner,
        &repository.name,
        &repository.url,
    );

    Some(GitHubNotification {
        id: notification.id.into_inner(),
        repository,
        subject,
        reason: notification.reason,
        unread: notification.unread,
        updated_at: notification.updated_at.to_rfc3339(),
        last_read_at: notification.last_read_at.map(|date| date.to_rfc3339()),
    })
}

fn notification_subject_from_octocrab(
    subject: octocrab::models::activity::Subject,
    repository_owner: &str,
    repository_name: &str,
    repository_url: &str,
) -> GitHubNotificationSubject {
    let mut kind = notification_subject_kind(&subject.r#type);
    let subject_path = subject.url.as_ref().map(|url| url.path());
    let number = match kind {
        GitHubNotificationSubjectKind::Issue => {
            numeric_subject_identifier(subject_path, repository_owner, repository_name, &["issues"])
        }
        GitHubNotificationSubjectKind::PullRequest => {
            numeric_subject_identifier(subject_path, repository_owner, repository_name, &["pulls"])
        }
        GitHubNotificationSubjectKind::Discussion => numeric_subject_identifier(
            subject_path,
            repository_owner,
            repository_name,
            &["discussions"],
        ),
        GitHubNotificationSubjectKind::DependabotAlert => numeric_subject_identifier(
            subject_path,
            repository_owner,
            repository_name,
            &["dependabot", "alerts"],
        ),
        GitHubNotificationSubjectKind::CodeScanningAlert => numeric_subject_identifier(
            subject_path,
            repository_owner,
            repository_name,
            &["code-scanning", "alerts"],
        ),
        GitHubNotificationSubjectKind::SecretScanningAlert => numeric_subject_identifier(
            subject_path,
            repository_owner,
            repository_name,
            &["secret-scanning", "alerts"],
        ),
        _ => None,
    };
    if matches!(
        kind,
        GitHubNotificationSubjectKind::DependabotAlert
            | GitHubNotificationSubjectKind::CodeScanningAlert
            | GitHubNotificationSubjectKind::SecretScanningAlert
    ) && number.is_none()
    {
        kind = GitHubNotificationSubjectKind::SecurityAlert;
    }
    let release_id = (kind == GitHubNotificationSubjectKind::Release)
        .then(|| {
            numeric_subject_identifier(
                subject_path,
                repository_owner,
                repository_name,
                &["releases"],
            )
        })
        .flatten();
    let commit_sha = (kind == GitHubNotificationSubjectKind::Commit)
        .then(|| {
            subject_identifier(
                subject_path,
                repository_owner,
                repository_name,
                &["commits"],
            )
            .filter(|value| valid_commit_sha(value))
        })
        .flatten()
        .map(str::to_string);
    let check_suite_id = (kind == GitHubNotificationSubjectKind::CheckSuite)
        .then(|| {
            numeric_subject_identifier(
                subject_path,
                repository_owner,
                repository_name,
                &["check-suites"],
            )
        })
        .flatten();
    let workflow_run_id = (kind == GitHubNotificationSubjectKind::WorkflowRun)
        .then(|| {
            numeric_subject_identifier(
                subject_path,
                repository_owner,
                repository_name,
                &["actions", "runs"],
            )
        })
        .flatten();
    let repository_url = repository_url.trim_end_matches('/');
    let url = match kind {
        GitHubNotificationSubjectKind::Issue if number.is_some() => {
            let number = number.expect("checked issue number");
            format!("{repository_url}/issues/{number}")
        }
        GitHubNotificationSubjectKind::PullRequest if number.is_some() => {
            let number = number.expect("checked pull request number");
            format!("{repository_url}/pull/{number}")
        }
        GitHubNotificationSubjectKind::Discussion if number.is_some() => {
            let number = number.expect("checked discussion number");
            format!("{repository_url}/discussions/{number}")
        }
        GitHubNotificationSubjectKind::Commit if commit_sha.is_some() => {
            format!(
                "{repository_url}/commit/{}",
                commit_sha.as_deref().expect("checked commit SHA")
            )
        }
        GitHubNotificationSubjectKind::Release => format!("{repository_url}/releases"),
        GitHubNotificationSubjectKind::WorkflowRun if workflow_run_id.is_some() => format!(
            "{repository_url}/actions/runs/{}",
            workflow_run_id.expect("checked workflow run ID")
        ),
        GitHubNotificationSubjectKind::CheckSuite | GitHubNotificationSubjectKind::WorkflowRun => {
            format!("{repository_url}/actions")
        }
        GitHubNotificationSubjectKind::DependabotAlert if number.is_some() => format!(
            "{repository_url}/security/dependabot/{}",
            number.expect("checked Dependabot alert number")
        ),
        GitHubNotificationSubjectKind::CodeScanningAlert if number.is_some() => format!(
            "{repository_url}/security/code-scanning/{}",
            number.expect("checked code scanning alert number")
        ),
        GitHubNotificationSubjectKind::SecretScanningAlert if number.is_some() => format!(
            "{repository_url}/security/secret-scanning/{}",
            number.expect("checked secret scanning alert number")
        ),
        GitHubNotificationSubjectKind::SecurityAlert => {
            format!("{repository_url}/security")
        }
        _ => repository_url.to_string(),
    };

    GitHubNotificationSubject {
        title: subject.title,
        kind,
        number,
        release_id,
        commit_sha,
        check_suite_id,
        workflow_run_id,
        url,
    }
}

fn numeric_subject_identifier(
    subject_path: Option<&str>,
    repository_owner: &str,
    repository_name: &str,
    resource_segments: &[&str],
) -> Option<u64> {
    subject_identifier(
        subject_path,
        repository_owner,
        repository_name,
        resource_segments,
    )?
    .parse()
    .ok()
    .filter(|identifier| *identifier > 0)
}

fn subject_identifier<'a>(
    subject_path: Option<&'a str>,
    repository_owner: &str,
    repository_name: &str,
    resource_segments: &[&str],
) -> Option<&'a str> {
    let segments = subject_path?
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    let identifier_index = segments.len().checked_sub(1)?;
    let resource_start = identifier_index.checked_sub(resource_segments.len())?;
    let repository_start = resource_start.checked_sub(3)?;
    let repository_matches = segments[repository_start] == "repos"
        && segments[repository_start + 1].eq_ignore_ascii_case(repository_owner)
        && segments[repository_start + 2].eq_ignore_ascii_case(repository_name);
    (repository_matches && segments[resource_start..identifier_index] == *resource_segments)
        .then_some(segments[identifier_index])
        .filter(|identifier| !identifier.is_empty())
}

fn valid_commit_sha(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn notification_subject_kind(subject_type: &str) -> GitHubNotificationSubjectKind {
    match subject_type {
        "Issue" => GitHubNotificationSubjectKind::Issue,
        "PullRequest" => GitHubNotificationSubjectKind::PullRequest,
        "Discussion" => GitHubNotificationSubjectKind::Discussion,
        "Commit" => GitHubNotificationSubjectKind::Commit,
        "Release" => GitHubNotificationSubjectKind::Release,
        "CheckSuite" => GitHubNotificationSubjectKind::CheckSuite,
        "WorkflowRun" => GitHubNotificationSubjectKind::WorkflowRun,
        "RepositoryVulnerabilityAlert" | "DependabotAlert" => {
            GitHubNotificationSubjectKind::DependabotAlert
        }
        "CodeScanningAlert" => GitHubNotificationSubjectKind::CodeScanningAlert,
        "SecretScanningAlert" => GitHubNotificationSubjectKind::SecretScanningAlert,
        "SecurityAdvisory" => GitHubNotificationSubjectKind::SecurityAlert,
        "RepositoryInvitation" => GitHubNotificationSubjectKind::RepositoryInvitation,
        _ => GitHubNotificationSubjectKind::Other,
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubNotificationClient for super::tests::FakeGitHubClient {
    async fn list_notifications(
        &self,
        token: &str,
        participating: bool,
        page: u32,
    ) -> Result<GitHubNotificationPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert!(participating);
        Ok(GitHubNotificationPage {
            notifications: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn update_notification(
        &self,
        token: &str,
        thread_id: u64,
        action: GitHubNotificationAction,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(thread_id, 42);
        assert_eq!(action, GitHubNotificationAction::Done);
        Ok(())
    }

    async fn mark_all_notifications_read(&self, token: &str) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notification(
        subject_type: &str,
        subject_url: Option<&str>,
    ) -> octocrab::models::activity::Notification {
        serde_json::from_value(serde_json::json!({
            "id": "42",
            "repository": {
                "id": 1,
                "name": "hello-world",
                "full_name": "octocat/hello-world",
                "private": false,
                "html_url": "https://github.com/octocat/hello-world",
                "description": "A repository",
                "fork": false,
                "url": "https://api.github.com/repos/octocat/hello-world",
                "archived": false
            },
            "subject": {
                "title": "Keep notifications inside Harbor",
                "url": subject_url,
                "latest_comment_url": null,
                "type": subject_type
            },
            "reason": "review_requested",
            "unread": true,
            "updated_at": "2026-08-28T08:00:00Z",
            "last_read_at": null,
            "url": "https://api.github.com/notifications/threads/42"
        }))
        .expect("notification fixture")
    }

    #[test]
    fn pull_request_notifications_keep_repository_context_and_in_app_target() {
        let page = notification_page_from_octocrab(
            vec![notification(
                "PullRequest",
                Some("https://api.github.com/repos/octocat/hello-world/pulls/17"),
            )],
            2,
            true,
        );

        assert_eq!(page.page, 2);
        assert!(page.has_previous);
        assert!(page.has_more);
        let notification = &page.notifications[0];
        assert_eq!(notification.id, 42);
        assert_eq!(notification.repository.full_name, "octocat/hello-world");
        assert_eq!(notification.repository.default_branch, "HEAD");
        assert_eq!(
            notification.subject.kind,
            GitHubNotificationSubjectKind::PullRequest
        );
        assert_eq!(notification.subject.number, Some(17));
        assert_eq!(
            notification.subject.url,
            "https://github.com/octocat/hello-world/pull/17"
        );
    }

    #[test]
    fn notification_subjects_keep_native_identifiers_and_supported_web_destinations() {
        let repository_url = "https://github.com/octocat/hello-world";
        let commit_sha = "0123456789abcdef0123456789abcdef01234567";
        let issue = notification_subject_from_octocrab(
            notification(
                "Issue",
                Some("https://api.github.com/repos/octocat/hello-world/issues/9"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let workflow = notification_subject_from_octocrab(
            notification(
                "WorkflowRun",
                Some("https://api.github.com/repos/octocat/hello-world/actions/runs/77"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let check_suite = notification_subject_from_octocrab(
            notification(
                "CheckSuite",
                Some("https://api.github.com/repos/octocat/hello-world/check-suites/66"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let commit = notification_subject_from_octocrab(
            notification(
                "Commit",
                Some(&format!(
                    "https://api.github.com/repos/octocat/hello-world/commits/{commit_sha}"
                )),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let release = notification_subject_from_octocrab(
            notification(
                "Release",
                Some("https://api.github.com/repos/octocat/hello-world/releases/88"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let repository_invitation = notification_subject_from_octocrab(
            notification("RepositoryInvitation", None).subject,
            "octocat",
            "hello-world",
            repository_url,
        );

        assert_eq!(issue.number, Some(9));
        assert_eq!(issue.url, "https://github.com/octocat/hello-world/issues/9");
        assert_eq!(workflow.workflow_run_id, Some(77));
        assert_eq!(
            workflow.url,
            "https://github.com/octocat/hello-world/actions/runs/77"
        );
        assert_eq!(check_suite.check_suite_id, Some(66));
        assert_eq!(
            check_suite.url,
            "https://github.com/octocat/hello-world/actions"
        );
        assert_eq!(commit.commit_sha.as_deref(), Some(commit_sha));
        assert_eq!(
            commit.url,
            format!("https://github.com/octocat/hello-world/commit/{commit_sha}")
        );
        assert_eq!(
            release.url,
            "https://github.com/octocat/hello-world/releases"
        );
        assert_eq!(release.release_id, Some(88));
        assert_eq!(
            repository_invitation.kind,
            GitHubNotificationSubjectKind::RepositoryInvitation
        );
        assert_eq!(repository_invitation.url, repository_url);
    }

    #[test]
    fn notification_subjects_reject_identifiers_from_unrelated_or_unstable_paths() {
        let repository_url = "https://github.com/octocat/hello-world";
        let issue = notification_subject_from_octocrab(
            notification(
                "Issue",
                Some("https://api.github.com/repos/octocat/hello-world/pulls/9"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let commit = notification_subject_from_octocrab(
            notification(
                "Commit",
                Some("https://api.github.com/repos/octocat/hello-world/commits/main"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let workflow = notification_subject_from_octocrab(
            notification(
                "WorkflowRun",
                Some("https://api.github.com/repos/octocat/hello-world/workflows/77"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let check_suite = notification_subject_from_octocrab(
            notification(
                "CheckSuite",
                Some("https://api.github.com/repos/octocat/another-repository/check-suites/66"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );

        assert_eq!(issue.number, None);
        assert_eq!(issue.url, repository_url);
        assert_eq!(commit.commit_sha, None);
        assert_eq!(commit.url, repository_url);
        assert_eq!(workflow.workflow_run_id, None);
        assert_eq!(check_suite.check_suite_id, None);
        assert_eq!(
            workflow.url,
            "https://github.com/octocat/hello-world/actions"
        );
    }

    #[test]
    fn security_notifications_open_only_exact_repository_alert_resources() {
        let repository_url = "https://github.com/octocat/hello-world";
        let dependabot = notification_subject_from_octocrab(
            notification(
                "RepositoryVulnerabilityAlert",
                Some("https://api.github.com/repos/octocat/hello-world/dependabot/alerts/11"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let code_scanning = notification_subject_from_octocrab(
            notification(
                "CodeScanningAlert",
                Some("https://api.github.com/repos/octocat/hello-world/code-scanning/alerts/12"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let secret_scanning = notification_subject_from_octocrab(
            notification(
                "SecretScanningAlert",
                Some("https://api.github.com/repos/octocat/hello-world/secret-scanning/alerts/13"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );

        assert_eq!(
            dependabot.kind,
            GitHubNotificationSubjectKind::DependabotAlert
        );
        assert_eq!(dependabot.number, Some(11));
        assert_eq!(
            code_scanning.kind,
            GitHubNotificationSubjectKind::CodeScanningAlert
        );
        assert_eq!(code_scanning.number, Some(12));
        assert_eq!(
            secret_scanning.kind,
            GitHubNotificationSubjectKind::SecretScanningAlert
        );
        assert_eq!(secret_scanning.number, Some(13));
    }

    #[test]
    fn unsupported_security_subjects_keep_an_explicit_web_fallback() {
        let repository_url = "https://github.com/octocat/hello-world";
        let advisory = notification_subject_from_octocrab(
            notification(
                "SecurityAdvisory",
                Some("https://api.github.com/advisories/GHSA-xxxx-yyyy-zzzz"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );
        let unrelated = notification_subject_from_octocrab(
            notification(
                "RepositoryVulnerabilityAlert",
                Some("https://api.github.com/repos/octocat/another/dependabot/alerts/11"),
            )
            .subject,
            "octocat",
            "hello-world",
            repository_url,
        );

        assert_eq!(advisory.kind, GitHubNotificationSubjectKind::SecurityAlert);
        assert_eq!(advisory.number, None);
        assert_eq!(advisory.url, format!("{repository_url}/security"));
        assert_eq!(unrelated.kind, GitHubNotificationSubjectKind::SecurityAlert);
        assert_eq!(unrelated.number, None);
        assert_eq!(unrelated.url, format!("{repository_url}/security"));
    }
}
