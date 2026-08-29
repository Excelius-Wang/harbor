use async_trait::async_trait;
use http::StatusCode;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue::{issue_label_from_octocrab, issue_milestone_from_octocrab},
    AppError, GitHubIssueLabel, GitHubIssueMilestone, GitHubService, OctocrabGitHubClient,
};

const LABEL_NAME_MAX_CHARACTERS: usize = 50;
const LABEL_DESCRIPTION_MAX_CHARACTERS: usize = 100;
const MILESTONE_TITLE_MAX_CHARACTERS: usize = 256;
const MILESTONE_DESCRIPTION_MAX_CHARACTERS: usize = 10_000;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitHubIssueLabelMutation {
    Create {
        name: String,
        color: String,
        description: String,
    },
    Update {
        original_name: String,
        name: String,
        color: String,
        description: String,
    },
    Delete {
        name: String,
        confirmation: String,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubIssueMilestoneState {
    Open,
    Closed,
}

impl GitHubIssueMilestoneState {
    fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum GitHubIssueMilestoneMutation {
    Create {
        title: String,
        description: String,
        due_on: Option<String>,
    },
    Update {
        number: u64,
        title: String,
        description: String,
        due_on: Option<String>,
        state: GitHubIssueMilestoneState,
    },
    Delete {
        number: u64,
        confirmation: String,
    },
}

#[derive(Serialize)]
struct MilestoneCreatePayload<'a> {
    title: &'a str,
    state: &'a str,
    description: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    due_on: Option<&'a str>,
}

#[derive(Serialize)]
struct MilestoneUpdatePayload<'a> {
    title: &'a str,
    state: &'a str,
    description: &'a str,
    due_on: Option<&'a str>,
}

#[async_trait]
pub(crate) trait GitHubIssueTaxonomyClient: Send + Sync {
    async fn mutate_issue_label(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubIssueLabelMutation,
    ) -> Result<Option<GitHubIssueLabel>, AppError>;

    async fn mutate_issue_milestone(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubIssueMilestoneMutation,
    ) -> Result<Option<GitHubIssueMilestone>, AppError>;
}

#[async_trait]
impl GitHubIssueTaxonomyClient for OctocrabGitHubClient {
    async fn mutate_issue_label(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubIssueLabelMutation,
    ) -> Result<Option<GitHubIssueLabel>, AppError> {
        let client = authenticated_client(token)?;
        let handler = client.issues(owner, repository);
        match mutation {
            GitHubIssueLabelMutation::Create {
                name,
                color,
                description,
            } => {
                let label = handler
                    .create_label(name, color, description)
                    .await
                    .map_err(github_error)?;
                verify_label(label, name, color, description).map(Some)
            }
            GitHubIssueLabelMutation::Update {
                original_name,
                name,
                color,
                description,
            } => {
                let current = repository_label(&client, owner, repository, original_name).await?;
                let label = handler
                    .update_label(&current.name, name, color, description)
                    .await
                    .map_err(github_error)?;
                verify_label(label, name, color, description).map(Some)
            }
            GitHubIssueLabelMutation::Delete { name, confirmation } => {
                let current = repository_label(&client, owner, repository, name).await?;
                if confirmation != &current.name {
                    return Err(AppError::Validation(
                        "label deletion confirmation does not match the current name".to_string(),
                    ));
                }
                delete_resource(
                    &client,
                    label_route(owner, repository, &current.name),
                    "label",
                )
                .await?;
                Ok(None)
            }
        }
    }

    async fn mutate_issue_milestone(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubIssueMilestoneMutation,
    ) -> Result<Option<GitHubIssueMilestone>, AppError> {
        let client = authenticated_client(token)?;
        match mutation {
            GitHubIssueMilestoneMutation::Create {
                title,
                description,
                due_on,
            } => {
                let milestone: octocrab::models::Milestone = client
                    .post(
                        milestones_route(owner, repository),
                        Some(&MilestoneCreatePayload {
                            title,
                            state: GitHubIssueMilestoneState::Open.as_str(),
                            description,
                            due_on: due_on.as_deref(),
                        }),
                    )
                    .await
                    .map_err(github_error)?;
                verify_milestone(
                    milestone,
                    None,
                    title,
                    description,
                    due_on.as_deref(),
                    GitHubIssueMilestoneState::Open,
                )
                .map(Some)
            }
            GitHubIssueMilestoneMutation::Update {
                number,
                title,
                description,
                due_on,
                state,
            } => {
                repository_milestone(&client, owner, repository, *number).await?;
                let milestone: octocrab::models::Milestone = client
                    .patch(
                        milestone_route(owner, repository, *number),
                        Some(&MilestoneUpdatePayload {
                            title,
                            state: state.as_str(),
                            description,
                            due_on: due_on.as_deref(),
                        }),
                    )
                    .await
                    .map_err(github_error)?;
                verify_milestone(
                    milestone,
                    Some(*number),
                    title,
                    description,
                    due_on.as_deref(),
                    *state,
                )
                .map(Some)
            }
            GitHubIssueMilestoneMutation::Delete {
                number,
                confirmation,
            } => {
                let current = repository_milestone(&client, owner, repository, *number).await?;
                if confirmation != &current.title {
                    return Err(AppError::Validation(
                        "milestone deletion confirmation does not match the current title"
                            .to_string(),
                    ));
                }
                delete_resource(
                    &client,
                    milestone_route(owner, repository, *number),
                    "milestone",
                )
                .await?;
                Ok(None)
            }
        }
    }
}

impl GitHubService {
    pub async fn mutate_issue_label(
        &self,
        owner: &str,
        repository: &str,
        mutation: GitHubIssueLabelMutation,
    ) -> Result<Option<GitHubIssueLabel>, AppError> {
        let mutation = validate_label_mutation(mutation)?;
        let token = self.load_access_token().await?;
        self.client
            .mutate_issue_label(&token, owner, repository, &mutation)
            .await
    }

    pub async fn mutate_issue_milestone(
        &self,
        owner: &str,
        repository: &str,
        mutation: GitHubIssueMilestoneMutation,
    ) -> Result<Option<GitHubIssueMilestone>, AppError> {
        let mutation = validate_milestone_mutation(mutation)?;
        let token = self.load_access_token().await?;
        self.client
            .mutate_issue_milestone(&token, owner, repository, &mutation)
            .await
    }
}

fn validate_label_mutation(
    mutation: GitHubIssueLabelMutation,
) -> Result<GitHubIssueLabelMutation, AppError> {
    match mutation {
        GitHubIssueLabelMutation::Create {
            name,
            color,
            description,
        } => Ok(GitHubIssueLabelMutation::Create {
            name: validate_label_name(name)?,
            color: validate_label_color(color)?,
            description: validate_label_description(description)?,
        }),
        GitHubIssueLabelMutation::Update {
            original_name,
            name,
            color,
            description,
        } => Ok(GitHubIssueLabelMutation::Update {
            original_name: validate_label_name(original_name)?,
            name: validate_label_name(name)?,
            color: validate_label_color(color)?,
            description: validate_label_description(description)?,
        }),
        GitHubIssueLabelMutation::Delete { name, confirmation } => {
            Ok(GitHubIssueLabelMutation::Delete {
                name: validate_label_name(name)?,
                confirmation,
            })
        }
    }
}

fn validate_milestone_mutation(
    mutation: GitHubIssueMilestoneMutation,
) -> Result<GitHubIssueMilestoneMutation, AppError> {
    match mutation {
        GitHubIssueMilestoneMutation::Create {
            title,
            description,
            due_on,
        } => Ok(GitHubIssueMilestoneMutation::Create {
            title: validate_milestone_title(title)?,
            description: validate_milestone_description(description)?,
            due_on: normalize_due_on(due_on)?,
        }),
        GitHubIssueMilestoneMutation::Update {
            number,
            title,
            description,
            due_on,
            state,
        } => {
            if number == 0 {
                return Err(AppError::Validation(
                    "milestone number must be greater than zero".to_string(),
                ));
            }
            Ok(GitHubIssueMilestoneMutation::Update {
                number,
                title: validate_milestone_title(title)?,
                description: validate_milestone_description(description)?,
                due_on: normalize_due_on(due_on)?,
                state,
            })
        }
        GitHubIssueMilestoneMutation::Delete {
            number,
            confirmation,
        } => {
            if number == 0 {
                return Err(AppError::Validation(
                    "milestone number must be greater than zero".to_string(),
                ));
            }
            Ok(GitHubIssueMilestoneMutation::Delete {
                number,
                confirmation,
            })
        }
    }
}

fn validate_label_name(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.is_empty()
        || value.chars().count() > LABEL_NAME_MAX_CHARACTERS
        || value.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "issue label name is invalid".to_string(),
        ));
    }
    Ok(value)
}

fn validate_label_color(value: String) -> Result<String, AppError> {
    let value = value.trim().trim_start_matches('#').to_ascii_lowercase();
    if value.len() != 6 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(AppError::Validation(
            "issue label color must be a six-digit hexadecimal value".to_string(),
        ));
    }
    Ok(value)
}

fn validate_label_description(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.chars().count() > LABEL_DESCRIPTION_MAX_CHARACTERS
        || value.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "issue label description is invalid".to_string(),
        ));
    }
    Ok(value)
}

fn validate_milestone_title(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.is_empty()
        || value.chars().count() > MILESTONE_TITLE_MAX_CHARACTERS
        || value.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "issue milestone title is invalid".to_string(),
        ));
    }
    Ok(value)
}

fn validate_milestone_description(value: String) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.chars().count() > MILESTONE_DESCRIPTION_MAX_CHARACTERS
        || value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(AppError::Validation(
            "issue milestone description is invalid".to_string(),
        ));
    }
    Ok(value)
}

fn normalize_due_on(value: Option<String>) -> Result<Option<String>, AppError> {
    value
        .map(|value| {
            let value = value.trim();
            if !valid_calendar_date(value) {
                return Err(AppError::Validation(
                    "issue milestone due date must use YYYY-MM-DD".to_string(),
                ));
            }
            Ok(format!("{value}T00:00:00Z"))
        })
        .transpose()
}

fn valid_calendar_date(value: &str) -> bool {
    let parts = value.split('-').collect::<Vec<_>>();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return false;
    }
    let (Ok(year), Ok(month), Ok(day)) = (
        parts[0].parse::<u32>(),
        parts[1].parse::<u32>(),
        parts[2].parse::<u32>(),
    ) else {
        return false;
    };
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year.is_multiple_of(400) || (year.is_multiple_of(4) && !year.is_multiple_of(100)) => {
            29
        }
        2 => 28,
        _ => return false,
    };
    year > 0 && (1..=days).contains(&day)
}

async fn repository_label(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    name: &str,
) -> Result<octocrab::models::Label, AppError> {
    client
        .get(label_route(owner, repository, name), None::<&()>)
        .await
        .map_err(github_error)
}

async fn repository_milestone(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    number: u64,
) -> Result<octocrab::models::Milestone, AppError> {
    let milestone: octocrab::models::Milestone = client
        .get(milestone_route(owner, repository, number), None::<&()>)
        .await
        .map_err(github_error)?;
    if u64::try_from(milestone.number).ok() != Some(number) {
        return Err(AppError::GitHub(
            "GitHub returned a different issue milestone".to_string(),
        ));
    }
    Ok(milestone)
}

async fn delete_resource(
    client: &octocrab::Octocrab,
    route: String,
    label: &str,
) -> Result<(), AppError> {
    let response = client
        ._delete(route, None::<&()>)
        .await
        .map_err(github_error)?;
    let status = response.status();
    if status == StatusCode::NO_CONTENT {
        return Ok(());
    }
    octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    Err(AppError::GitHub(format!(
        "GitHub returned unexpected {label} deletion status {status}"
    )))
}

fn verify_label(
    label: octocrab::models::Label,
    name: &str,
    color: &str,
    description: &str,
) -> Result<GitHubIssueLabel, AppError> {
    let label = issue_label_from_octocrab(label);
    if label.name != name
        || !label.color.eq_ignore_ascii_case(color)
        || label.description.as_deref().unwrap_or_default() != description
    {
        return Err(AppError::GitHub(
            "GitHub did not preserve the requested issue label settings".to_string(),
        ));
    }
    Ok(label)
}

fn verify_milestone(
    milestone: octocrab::models::Milestone,
    expected_number: Option<u64>,
    title: &str,
    description: &str,
    due_on: Option<&str>,
    state: GitHubIssueMilestoneState,
) -> Result<GitHubIssueMilestone, AppError> {
    let milestone = issue_milestone_from_octocrab(milestone)?;
    let due_date = due_on.map(|value| &value[..10]);
    let returned_due_date = milestone.due_on.as_deref().map(|value| &value[..10]);
    if expected_number.is_some_and(|number| milestone.number != number)
        || milestone.title != title
        || milestone.description.as_deref().unwrap_or_default() != description
        || milestone.state != state.as_str()
        || returned_due_date != due_date
    {
        return Err(AppError::GitHub(
            "GitHub did not preserve the requested issue milestone settings".to_string(),
        ));
    }
    Ok(milestone)
}

fn milestones_route(owner: &str, repository: &str) -> String {
    format!("/repos/{owner}/{repository}/milestones")
}

fn milestone_route(owner: &str, repository: &str, number: u64) -> String {
    format!("{}/{number}", milestones_route(owner, repository))
}

fn label_route(owner: &str, repository: &str, name: &str) -> String {
    format!(
        "/repos/{owner}/{repository}/labels/{}",
        utf8_percent_encode(name, NON_ALPHANUMERIC)
    )
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueTaxonomyClient for super::tests::FakeGitHubClient {
    async fn mutate_issue_label(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubIssueLabelMutation,
    ) -> Result<Option<GitHubIssueLabel>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        let GitHubIssueLabelMutation::Create {
            name,
            color,
            description,
        } = mutation
        else {
            panic!("expected create label mutation")
        };
        Ok(Some(GitHubIssueLabel {
            name: name.clone(),
            color: color.clone(),
            description: Some(description.clone()),
            is_default: false,
        }))
    }

    async fn mutate_issue_milestone(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        mutation: &GitHubIssueMilestoneMutation,
    ) -> Result<Option<GitHubIssueMilestone>, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        let GitHubIssueMilestoneMutation::Update {
            number,
            title,
            description,
            due_on,
            state,
        } = mutation
        else {
            panic!("expected update milestone mutation")
        };
        assert_eq!(*number, 3);
        Ok(Some(GitHubIssueMilestone {
            number: *number,
            title: title.clone(),
            description: Some(description.clone()),
            state: state.as_str().to_string(),
            open_issues: 4,
            closed_issues: 7,
            due_on: due_on.clone(),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn label(name: &str, color: &str, description: Option<&str>) -> octocrab::models::Label {
        serde_json::from_value(serde_json::json!({
            "id": 1,
            "node_id": "LA_kwDOA",
            "url": "https://api.github.com/repos/octocat/hello-world/labels/bug",
            "name": name,
            "color": color,
            "description": description,
            "default": false
        }))
        .expect("label fixture")
    }

    fn milestone(
        number: i64,
        title: &str,
        state: &str,
        description: Option<&str>,
        due_on: Option<&str>,
    ) -> octocrab::models::Milestone {
        serde_json::from_value(serde_json::json!({
            "url": format!("https://api.github.com/repos/octocat/hello-world/milestones/{number}"),
            "html_url": format!("https://github.com/octocat/hello-world/milestone/{number}"),
            "labels_url": format!("https://api.github.com/repos/octocat/hello-world/milestones/{number}/labels"),
            "id": 100,
            "node_id": "MI_kwDOA",
            "number": number,
            "state": state,
            "title": title,
            "description": description,
            "creator": null,
            "open_issues": 4,
            "closed_issues": 7,
            "created_at": "2026-08-01T08:00:00Z",
            "updated_at": "2026-08-29T08:00:00Z",
            "closed_at": null,
            "due_on": due_on
        }))
        .expect("milestone fixture")
    }

    #[test]
    fn label_mutations_normalize_github_fields_and_preserve_delete_confirmation() {
        assert_eq!(
            validate_label_mutation(GitHubIssueLabelMutation::Update {
                original_name: " bug ".to_string(),
                name: " needs-triage ".to_string(),
                color: "#A1B2C3".to_string(),
                description: " Sort incoming reports ".to_string(),
            })
            .expect("valid label update"),
            GitHubIssueLabelMutation::Update {
                original_name: "bug".to_string(),
                name: "needs-triage".to_string(),
                color: "a1b2c3".to_string(),
                description: "Sort incoming reports".to_string(),
            }
        );
        assert!(validate_label_mutation(GitHubIssueLabelMutation::Create {
            name: "bug".to_string(),
            color: "not-a-color".to_string(),
            description: String::new(),
        })
        .is_err());
        let deletion = validate_label_mutation(GitHubIssueLabelMutation::Delete {
            name: " bug ".to_string(),
            confirmation: "bug".to_string(),
        })
        .expect("valid deletion");
        assert_eq!(
            deletion,
            GitHubIssueLabelMutation::Delete {
                name: "bug".to_string(),
                confirmation: "bug".to_string(),
            }
        );
    }

    #[test]
    fn milestone_mutations_validate_dates_and_normalize_optional_content() {
        assert_eq!(
            validate_milestone_mutation(GitHubIssueMilestoneMutation::Create {
                title: " Harbor 1.0 ".to_string(),
                description: " Ship the desktop workflow. ".to_string(),
                due_on: Some("2028-02-29".to_string()),
            })
            .expect("leap-year due date"),
            GitHubIssueMilestoneMutation::Create {
                title: "Harbor 1.0".to_string(),
                description: "Ship the desktop workflow.".to_string(),
                due_on: Some("2028-02-29T00:00:00Z".to_string()),
            }
        );
        assert!(
            validate_milestone_mutation(GitHubIssueMilestoneMutation::Create {
                title: "Harbor 1.0".to_string(),
                description: String::new(),
                due_on: Some("2026-02-29".to_string()),
            })
            .is_err()
        );
    }

    #[test]
    fn routes_encode_label_names_and_keep_milestones_repository_scoped() {
        assert_eq!(
            label_route("octocat", "hello-world", "help wanted"),
            "/repos/octocat/hello-world/labels/help%20wanted"
        );
        assert_eq!(
            milestone_route("octocat", "hello-world", 3),
            "/repos/octocat/hello-world/milestones/3"
        );
    }

    #[test]
    fn ipc_and_rest_payloads_distinguish_omitted_and_cleared_due_dates() {
        let mutation = serde_json::to_value(GitHubIssueMilestoneMutation::Update {
            number: 3,
            title: "Harbor 1.0".to_string(),
            description: String::new(),
            due_on: None,
            state: GitHubIssueMilestoneState::Open,
        })
        .expect("serialize milestone mutation");
        assert_eq!(mutation["dueOn"], serde_json::Value::Null);
        assert!(mutation.get("due_on").is_none());

        let create = serde_json::to_value(MilestoneCreatePayload {
            title: "Harbor 1.0",
            state: "open",
            description: "",
            due_on: None,
        })
        .expect("serialize milestone create payload");
        let update = serde_json::to_value(MilestoneUpdatePayload {
            title: "Harbor 1.0",
            state: "open",
            description: "",
            due_on: None,
        })
        .expect("serialize milestone update payload");
        assert!(create.get("due_on").is_none());
        assert_eq!(update["due_on"], serde_json::Value::Null);
    }

    #[test]
    fn authoritative_mutation_responses_must_match_requested_values() {
        let mapped = verify_label(
            label("bug", "A1B2C3", Some("Reports")),
            "bug",
            "a1b2c3",
            "Reports",
        )
        .expect("matching label");
        assert_eq!(mapped.description.as_deref(), Some("Reports"));
        assert!(verify_label(label("bug", "ffffff", None), "bug", "a1b2c3", "").is_err());

        let mapped = verify_milestone(
            milestone(
                3,
                "Harbor 1.0",
                "closed",
                Some("Ship it"),
                Some("2026-09-30T00:00:00Z"),
            ),
            Some(3),
            "Harbor 1.0",
            "Ship it",
            Some("2026-09-30T00:00:00Z"),
            GitHubIssueMilestoneState::Closed,
        )
        .expect("matching milestone");
        assert_eq!(mapped.number, 3);
        assert!(verify_milestone(
            milestone(4, "Harbor 1.0", "closed", Some("Ship it"), None),
            Some(3),
            "Harbor 1.0",
            "Ship it",
            None,
            GitHubIssueMilestoneState::Closed,
        )
        .is_err());
    }
}
