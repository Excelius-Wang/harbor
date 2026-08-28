use serde::Serialize;

use super::{github_error, AppError};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum GitHubItemKind {
    Issue,
    PullRequest,
}

impl GitHubItemKind {
    fn name(self) -> &'static str {
        match self {
            Self::Issue => "Issue",
            Self::PullRequest => "pull request",
        }
    }
}

pub(crate) async fn update(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    number: u64,
    kind: GitHubItemKind,
    labels: &[String],
    assignees: &[String],
    milestone: Option<u64>,
) -> Result<octocrab::models::issues::Issue, AppError> {
    let handler = client.issues(owner, repository);
    let current = handler.get(number).await.map_err(github_error)?;
    ensure_kind(&current, kind)?;
    if metadata_matches(&current, labels, assignees, milestone) {
        return Ok(current);
    }

    let route = format!("/repos/{owner}/{repository}/issues/{number}");
    let updated: octocrab::models::issues::Issue = client
        .patch(
            route,
            Some(&UpdateItemMetadataParameters {
                labels,
                assignees,
                milestone,
            }),
        )
        .await
        .map_err(github_error)?;
    ensure_kind(&updated, kind)?;
    if !metadata_matches(&updated, labels, assignees, milestone) {
        return Err(AppError::GitHubPermission(format!(
            "GitHub did not apply every requested {} metadata change",
            kind.name()
        )));
    }

    Ok(updated)
}

#[derive(Serialize)]
struct UpdateItemMetadataParameters<'a> {
    labels: &'a [String],
    assignees: &'a [String],
    milestone: Option<u64>,
}

fn ensure_kind(
    issue: &octocrab::models::issues::Issue,
    expected: GitHubItemKind,
) -> Result<(), AppError> {
    let is_pull_request = issue.pull_request.is_some();
    if expected == GitHubItemKind::Issue && is_pull_request {
        return Err(AppError::Validation(
            "requested number belongs to a pull request".to_string(),
        ));
    }
    if expected == GitHubItemKind::PullRequest && !is_pull_request {
        return Err(AppError::Validation(
            "requested number belongs to an issue".to_string(),
        ));
    }
    Ok(())
}

fn names_match<'a>(current: impl IntoIterator<Item = &'a str>, requested: &[String]) -> bool {
    let mut current = current.into_iter().collect::<Vec<_>>();
    let mut requested = requested.iter().map(String::as_str).collect::<Vec<_>>();
    current.sort_unstable();
    requested.sort_unstable();
    current == requested
}

fn metadata_matches(
    issue: &octocrab::models::issues::Issue,
    labels: &[String],
    assignees: &[String],
    milestone: Option<u64>,
) -> bool {
    names_match(issue.labels.iter().map(|label| label.name.as_str()), labels)
        && names_match(
            issue
                .assignees
                .iter()
                .map(|assignee| assignee.login.as_str()),
            assignees,
        )
        && issue
            .milestone
            .as_ref()
            .and_then(|current| u64::try_from(current.number).ok())
            == milestone
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replacement_payload_can_clear_assignees_and_milestone() {
        assert_eq!(
            serde_json::to_value(UpdateItemMetadataParameters {
                labels: &["bug".to_string()],
                assignees: &[],
                milestone: None,
            })
            .expect("metadata payload"),
            serde_json::json!({
                "labels": ["bug"],
                "assignees": [],
                "milestone": null,
            })
        );
    }

    #[test]
    fn metadata_comparison_is_order_independent() {
        let issue = serde_json::from_value(super::super::tests::issue_json(7, false))
            .expect("issue fixture");

        assert!(names_match(
            ["bug", "help wanted"],
            &["help wanted".to_string(), "bug".to_string()]
        ));
        assert!(metadata_matches(&issue, &["bug".to_string()], &[], None,));
        assert!(!metadata_matches(
            &issue,
            &["help wanted".to_string()],
            &[],
            None,
        ));
    }

    #[test]
    fn item_kind_rejects_the_other_github_shape() {
        let issue = serde_json::from_value(super::super::tests::issue_json(7, false))
            .expect("issue fixture");
        let pull_request = serde_json::from_value(super::super::tests::issue_json(8, true))
            .expect("pull request fixture");

        assert!(ensure_kind(&issue, GitHubItemKind::Issue).is_ok());
        assert!(ensure_kind(&pull_request, GitHubItemKind::PullRequest).is_ok());
        assert!(matches!(
            ensure_kind(&issue, GitHubItemKind::PullRequest),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            ensure_kind(&pull_request, GitHubItemKind::Issue),
            Err(AppError::Validation(_))
        ));
    }
}
