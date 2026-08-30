use std::ops::Deref;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use http::StatusCode;
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};

use super::{ensure_octocrab_issue, issue_from_octocrab, GitHubIssue, GitHubIssueState};
use crate::{
    error::AppError,
    github::{github_error, GitHubService, OctocrabGitHubClient},
};

const GITHUB_API_VERSION: &str = "2026-03-10";

const ISSUE_STATE_CAPABILITIES_QUERY: &str = r#"
query HarborIssueState($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    issue(number: $number) {
      id
      number
      state
      stateReason(enableDuplicate: true)
      updatedAt
      viewerCanClose
      viewerCanReopen
      viewerCanUpdate
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubIssueCloseReason {
    Completed,
    NotPlanned,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubIssueStateReason(String);

impl GitHubIssueStateReason {
    fn new(value: impl Into<String>) -> Self {
        let value = value.into();
        let normalized = match value.as_str() {
            "COMPLETED" => "completed",
            "NOT_PLANNED" | "not_planned" => "notPlanned",
            "DUPLICATE" => "duplicate",
            "REOPENED" => "reopened",
            _ => return Self(value),
        };
        Self(normalized.to_string())
    }

    fn as_str(&self) -> &str {
        &self.0
    }
}

impl Deref for GitHubIssueStateReason {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        self.as_str()
    }
}

impl Serialize for GitHubIssueStateReason {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for GitHubIssueStateReason {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        String::deserialize(deserializer).map(Self::new)
    }
}

impl GitHubIssueCloseReason {
    fn api_name(self) -> &'static str {
        match self {
            Self::Completed => "completed",
            Self::NotPlanned => "not_planned",
        }
    }

    fn state_reason(self) -> GitHubIssueStateReason {
        GitHubIssueStateReason::new(match self {
            Self::Completed => "completed",
            Self::NotPlanned => "notPlanned",
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueStateCapabilities {
    pub repository_id: String,
    pub repository_full_name: String,
    pub issue_node_id: String,
    pub number: u64,
    pub state: GitHubIssueState,
    pub state_reason: Option<GitHubIssueStateReason>,
    pub updated_at: String,
    pub viewer_can_close: bool,
    pub viewer_can_reopen: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueStateExpectation {
    pub issue_id: u64,
    pub issue_node_id: String,
    pub state: GitHubIssueState,
    pub state_reason: Option<GitHubIssueStateReason>,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueStateMutation {
    pub desired_state: GitHubIssueState,
    pub close_reason: Option<GitHubIssueCloseReason>,
    pub expected: GitHubIssueStateExpectation,
}

pub(super) struct RestIssue {
    pub(super) issue: octocrab::models::issues::Issue,
    pub(super) state_reason: Option<GitHubIssueStateReason>,
}

#[async_trait]
pub(crate) trait GitHubIssueLifecycleClient: Send + Sync {
    async fn issue_state_capabilities(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueStateCapabilities, AppError>;

    async fn update_issue_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        mutation: &GitHubIssueStateMutation,
    ) -> Result<GitHubIssue, AppError>;
}

#[async_trait]
impl GitHubIssueLifecycleClient for OctocrabGitHubClient {
    async fn issue_state_capabilities(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueStateCapabilities, AppError> {
        let client = build_issue_state_client(token, None)?;
        issue_state_capabilities_with_client(&client, owner, repository, issue_number).await
    }

    async fn update_issue_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        mutation: &GitHubIssueStateMutation,
    ) -> Result<GitHubIssue, AppError> {
        let client = build_issue_state_client(token, None)?;
        update_issue_state_with_client(&client, owner, repository, issue_number, mutation).await
    }
}

fn build_issue_state_client(
    token: &str,
    base_uri: Option<&str>,
) -> Result<octocrab::Octocrab, AppError> {
    let builder = octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string());
    let builder = match base_uri {
        Some(base_uri) => builder
            .base_uri(base_uri)
            .map_err(|error| AppError::GitHub(error.to_string()))?,
        None => builder,
    };
    builder
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

impl GitHubService {
    pub async fn issue_state_capabilities(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueStateCapabilities, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .issue_state_capabilities(&token, owner, repository, issue_number)
            .await
    }

    pub async fn update_issue_state(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
        mutation: &GitHubIssueStateMutation,
    ) -> Result<GitHubIssue, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_issue_state(&token, owner, repository, issue_number, mutation)
            .await
    }
}

pub(super) fn issue_state_reason(
    reason: &octocrab::models::issues::IssueStateReason,
) -> GitHubIssueStateReason {
    GitHubIssueStateReason::new(match reason {
        octocrab::models::issues::IssueStateReason::Completed => "completed".to_string(),
        octocrab::models::issues::IssueStateReason::NotPlanned => "notPlanned".to_string(),
        octocrab::models::issues::IssueStateReason::Reopened => "reopened".to_string(),
        octocrab::models::issues::IssueStateReason::Duplicate => "duplicate".to_string(),
        _ => serde_json::to_value(reason)
            .ok()
            .and_then(|value| value.as_str().map(str::to_string))
            .unwrap_or_else(|| "unknown".to_string()),
    })
}

async fn issue_state_capabilities_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<GitHubIssueStateCapabilities, AppError> {
    let payload = issue_state_capabilities_payload(owner, repository, issue_number)?;
    let response: IssueStateCapabilitiesQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    capability_from_graphql(response, owner, repository, issue_number)
}

async fn update_issue_state_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
    mutation: &GitHubIssueStateMutation,
) -> Result<GitHubIssue, AppError> {
    validate_mutation(mutation)?;

    let current = load_rest_issue(client, owner, repository, issue_number, false).await?;
    ensure_rest_preflight(
        &current,
        owner,
        repository,
        issue_number,
        &mutation.expected,
    )?;
    let capabilities =
        issue_state_capabilities_with_client(client, owner, repository, issue_number).await?;
    ensure_capability_preflight(&capabilities, &mutation.expected, mutation.desired_state)?;

    let payload = IssueStatePayload::from_mutation(mutation)?;
    let updated = patch_rest_issue(client, owner, repository, issue_number, &payload).await?;
    ensure_desired_result(
        &updated,
        owner,
        repository,
        issue_number,
        mutation,
        Some(current.issue.updated_at),
        "update response",
    )?;

    let postflight = load_rest_issue(client, owner, repository, issue_number, true).await?;
    ensure_desired_result(
        &postflight,
        owner,
        repository,
        issue_number,
        mutation,
        Some(updated.issue.updated_at),
        "postflight read",
    )?;
    Ok(issue_from_rest(postflight))
}

fn issue_state_capabilities_payload(
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<serde_json::Value, AppError> {
    let number = i32::try_from(issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    Ok(serde_json::json!({
        "query": ISSUE_STATE_CAPABILITIES_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "number": number,
        }
    }))
}

fn capability_from_graphql(
    response: IssueStateCapabilitiesQuery,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<GitHubIssueStateCapabilities, AppError> {
    let repository_node = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue repository".to_string())
    })?;
    if repository_node.id.trim().is_empty()
        || !repository_node
            .name_with_owner
            .eq_ignore_ascii_case(&format!("{owner}/{repository}"))
    {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue repository".to_string(),
        ));
    }
    let issue = repository_node.issue.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested Issue state".to_string())
    })?;
    if issue.id.trim().is_empty() || issue.number != issue_number {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue state".to_string(),
        ));
    }
    parse_github_timestamp(&issue.updated_at, "Issue capability")?;

    Ok(GitHubIssueStateCapabilities {
        repository_id: repository_node.id,
        repository_full_name: repository_node.name_with_owner,
        issue_node_id: issue.id,
        number: issue.number,
        state: issue.state.into(),
        state_reason: issue.state_reason.map(GitHubIssueStateReason::new),
        updated_at: issue.updated_at,
        viewer_can_close: issue.viewer_can_close,
        viewer_can_reopen: issue.viewer_can_reopen,
    })
}

fn validate_mutation(mutation: &GitHubIssueStateMutation) -> Result<(), AppError> {
    if mutation.expected.issue_id == 0 || mutation.expected.issue_node_id.trim().is_empty() {
        return Err(AppError::Validation(
            "the expected Issue identity is required".to_string(),
        ));
    }
    parse_expected_timestamp(&mutation.expected.updated_at)?;
    if mutation.expected.state == mutation.desired_state {
        return Err(AppError::Validation(
            "the Issue state mutation must change state".to_string(),
        ));
    }
    match (mutation.desired_state, mutation.close_reason) {
        (GitHubIssueState::Closed, Some(_)) | (GitHubIssueState::Open, None) => Ok(()),
        (GitHubIssueState::Closed, None) => Err(AppError::Validation(
            "a close reason is required when closing an Issue".to_string(),
        )),
        (GitHubIssueState::Open, Some(_)) => Err(AppError::Validation(
            "a close reason cannot be used when reopening an Issue".to_string(),
        )),
    }
}

fn ensure_rest_preflight(
    issue: &RestIssue,
    owner: &str,
    repository: &str,
    issue_number: u64,
    expected: &GitHubIssueStateExpectation,
) -> Result<(), AppError> {
    ensure_rest_identity(
        issue,
        owner,
        repository,
        issue_number,
        expected.issue_id,
        &expected.issue_node_id,
    )?;
    let state = strict_issue_state(&issue.issue)?;
    if state != expected.state
        || issue.state_reason != expected.state_reason
        || !same_timestamp(&issue.issue.updated_at, &expected.updated_at)?
    {
        return Err(issue_state_conflict(
            "the Issue changed before Harbor could update its state",
        ));
    }
    Ok(())
}

fn ensure_capability_preflight(
    capabilities: &GitHubIssueStateCapabilities,
    expected: &GitHubIssueStateExpectation,
    desired_state: GitHubIssueState,
) -> Result<(), AppError> {
    if capabilities.issue_node_id != expected.issue_node_id
        || capabilities.state != expected.state
        || capabilities.state_reason != expected.state_reason
        || !same_timestamp_text(&capabilities.updated_at, &expected.updated_at)?
    {
        return Err(issue_state_conflict(
            "the Issue capability snapshot no longer matches the Issue",
        ));
    }
    let allowed = match desired_state {
        GitHubIssueState::Closed => capabilities.viewer_can_close,
        GitHubIssueState::Open => capabilities.viewer_can_reopen,
    };
    if !allowed {
        return Err(AppError::GitHubPermission(
            "GitHub does not allow this Issue state change".to_string(),
        ));
    }
    Ok(())
}

fn ensure_desired_result(
    issue: &RestIssue,
    owner: &str,
    repository: &str,
    issue_number: u64,
    mutation: &GitHubIssueStateMutation,
    minimum_updated_at: Option<DateTime<Utc>>,
    phase: &str,
) -> Result<(), AppError> {
    ensure_rest_identity(
        issue,
        owner,
        repository,
        issue_number,
        mutation.expected.issue_id,
        &mutation.expected.issue_node_id,
    )?;
    let expected_reason = desired_reason(mutation)?;
    if strict_issue_state(&issue.issue)? != mutation.desired_state
        || issue.state_reason.as_ref() != Some(&expected_reason)
        || minimum_updated_at.is_some_and(|minimum| issue.issue.updated_at < minimum)
    {
        return Err(issue_state_conflict(&format!(
            "the Issue {phase} did not match the requested state; the write may have persisted"
        )));
    }
    Ok(())
}

fn ensure_rest_identity(
    issue: &RestIssue,
    owner: &str,
    repository: &str,
    issue_number: u64,
    issue_id: u64,
    issue_node_id: &str,
) -> Result<(), AppError> {
    ensure_octocrab_issue(&issue.issue).map_err(|_| {
        issue_state_conflict("GitHub returned a pull request for the Issue state operation")
    })?;
    let expected_path = format!("/repos/{owner}/{repository}/issues/{issue_number}");
    let matches_identity = issue.issue.number == issue_number
        && issue.issue.id.into_inner() == issue_id
        && issue.issue.node_id == issue_node_id;
    if matches_identity && !issue.issue.url.path().eq_ignore_ascii_case(&expected_path) {
        return Err(AppError::GitHubIssueMoved(
            "GitHub returned the Issue from a different repository location".to_string(),
        ));
    }
    if !matches_identity {
        return Err(issue_state_conflict(
            "GitHub returned a different Issue for the state operation",
        ));
    }
    Ok(())
}

fn strict_issue_state(
    issue: &octocrab::models::issues::Issue,
) -> Result<GitHubIssueState, AppError> {
    match issue.state {
        octocrab::models::IssueState::Open => Ok(GitHubIssueState::Open),
        octocrab::models::IssueState::Closed => Ok(GitHubIssueState::Closed),
        _ => Err(AppError::GitHub(
            "GitHub returned an unsupported Issue state".to_string(),
        )),
    }
}

fn desired_reason(mutation: &GitHubIssueStateMutation) -> Result<GitHubIssueStateReason, AppError> {
    match mutation.desired_state {
        GitHubIssueState::Open => Ok(GitHubIssueStateReason::new("reopened")),
        GitHubIssueState::Closed => mutation
            .close_reason
            .map(GitHubIssueCloseReason::state_reason)
            .ok_or_else(|| AppError::Validation("a close reason is required".to_string())),
    }
}

fn same_timestamp(actual: &DateTime<Utc>, expected: &str) -> Result<bool, AppError> {
    Ok(*actual == parse_expected_timestamp(expected)?)
}

fn same_timestamp_text(actual: &str, expected: &str) -> Result<bool, AppError> {
    Ok(parse_github_timestamp(actual, "Issue capability")? == parse_expected_timestamp(expected)?)
}

fn parse_expected_timestamp(value: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| AppError::Validation("the expected Issue timestamp is invalid".to_string()))
}

fn parse_github_timestamp(value: &str, label: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| AppError::GitHub(format!("GitHub returned an invalid {label} timestamp")))
}

pub(super) async fn load_rest_issue(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
    postflight: bool,
) -> Result<RestIssue, AppError> {
    let request = api_request(
        client,
        http::Method::GET,
        issue_route(owner, repository, issue_number),
        None::<&()>,
    )?;
    read_issue_response(client, request, postflight).await
}

async fn patch_rest_issue(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
    payload: &IssueStatePayload,
) -> Result<RestIssue, AppError> {
    let request = api_request(
        client,
        http::Method::PATCH,
        issue_route(owner, repository, issue_number),
        Some(payload),
    )?;
    read_issue_response(client, request, true).await
}

async fn read_issue_response(
    client: &octocrab::Octocrab,
    request: http::Request<octocrab::OctoBody>,
    conflict_on_missing: bool,
) -> Result<RestIssue, AppError> {
    let response = client.execute(request).await.map_err(github_error)?;
    let status = response.status();
    let response = octocrab::map_github_error(response)
        .await
        .map_err(|error| issue_state_transport_error(error, conflict_on_missing))?;
    if status != StatusCode::OK {
        return Err(AppError::GitHub(format!(
            "GitHub returned unexpected Issue state status {status}"
        )));
    }
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(github_error)?
        .to_bytes();
    rest_issue_from_slice(&bytes)
}

fn rest_issue_from_slice(bytes: &[u8]) -> Result<RestIssue, AppError> {
    let value: serde_json::Value = serde_json::from_slice(bytes)
        .map_err(|error| AppError::GitHub(format!("GitHub returned an invalid Issue: {error}")))?;
    rest_issue_from_value(value)
}

pub(super) fn rest_issue_from_value(mut value: serde_json::Value) -> Result<RestIssue, AppError> {
    let state_reason = match value.get("state_reason") {
        None | Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::String(reason)) => {
            Some(GitHubIssueStateReason::new(reason.clone()))
        }
        Some(_) => {
            return Err(AppError::GitHub(
                "GitHub returned an invalid Issue state reason".to_string(),
            ))
        }
    };
    let object = value
        .as_object_mut()
        .ok_or_else(|| AppError::GitHub("GitHub returned an invalid Issue object".to_string()))?;
    object.insert("state_reason".to_string(), serde_json::Value::Null);
    let issue = serde_json::from_value(value)
        .map_err(|error| AppError::GitHub(format!("GitHub returned an invalid Issue: {error}")))?;
    Ok(RestIssue {
        issue,
        state_reason,
    })
}

pub(super) fn issue_from_rest(rest: RestIssue) -> GitHubIssue {
    let mut issue = issue_from_octocrab(rest.issue);
    issue.state_reason = rest.state_reason;
    issue
}

fn issue_state_transport_error(error: octocrab::Error, conflict_on_missing: bool) -> AppError {
    let status = match &error {
        octocrab::Error::GitHub { source, .. } => Some(source.status_code.as_u16()),
        _ => None,
    };
    let mapped = github_error(error);
    if matches!(
        mapped,
        AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)
    ) {
        return mapped;
    }
    match status {
        Some(301) => AppError::GitHubIssueMoved(
            "GitHub reported that the Issue repository location changed".to_string(),
        ),
        Some(409 | 410) => issue_state_conflict(
            "the Issue moved or changed before GitHub applied the state operation",
        ),
        Some(404) if conflict_on_missing => {
            issue_state_conflict("the Issue is no longer available for this state operation")
        }
        Some(422) => AppError::Validation(mapped.to_string()),
        _ => mapped,
    }
}

fn api_request<T: Serialize + ?Sized>(
    client: &octocrab::Octocrab,
    method: http::Method,
    route: String,
    body: Option<&T>,
) -> Result<http::Request<octocrab::OctoBody>, AppError> {
    let request = http::Request::builder()
        .method(method)
        .uri(route)
        .header(http::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION);
    client.build_request(request, body).map_err(github_error)
}

fn issue_route(owner: &str, repository: &str, issue_number: u64) -> String {
    format!("/repos/{owner}/{repository}/issues/{issue_number}")
}

fn issue_state_conflict(message: &str) -> AppError {
    AppError::GitHubIssueStateConflict(message.to_string())
}

#[derive(Serialize)]
struct IssueStatePayload {
    state: &'static str,
    state_reason: &'static str,
}

impl IssueStatePayload {
    fn from_mutation(mutation: &GitHubIssueStateMutation) -> Result<Self, AppError> {
        Ok(match mutation.desired_state {
            GitHubIssueState::Open => Self {
                state: "open",
                state_reason: "reopened",
            },
            GitHubIssueState::Closed => Self {
                state: "closed",
                state_reason: mutation
                    .close_reason
                    .ok_or_else(|| AppError::Validation("a close reason is required".to_string()))?
                    .api_name(),
            },
        })
    }
}

#[derive(Deserialize)]
struct IssueStateCapabilitiesQuery {
    repository: Option<GraphQlIssueStateRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlIssueStateRepository {
    id: String,
    name_with_owner: String,
    issue: Option<GraphQlIssueStateNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlIssueStateNode {
    id: String,
    number: u64,
    state: GraphQlIssueState,
    state_reason: Option<String>,
    updated_at: String,
    viewer_can_close: bool,
    viewer_can_reopen: bool,
    #[serde(rename = "viewerCanUpdate")]
    _viewer_can_update: bool,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum GraphQlIssueState {
    Open,
    Closed,
}

impl From<GraphQlIssueState> for GitHubIssueState {
    fn from(value: GraphQlIssueState) -> Self {
        match value {
            GraphQlIssueState::Open => Self::Open,
            GraphQlIssueState::Closed => Self::Closed,
        }
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueLifecycleClient for super::super::tests::FakeGitHubClient {
    async fn issue_state_capabilities(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueStateCapabilities, AppError> {
        use super::GitHubIssueClient;

        let issue = self
            .issue_detail(token, owner, repository, issue_number, 1)
            .await?
            .issue;
        Ok(GitHubIssueStateCapabilities {
            repository_id: "R_1".to_string(),
            repository_full_name: format!("{owner}/{repository}"),
            issue_node_id: issue.reaction_subject.id,
            number: issue.number,
            state: issue.state,
            state_reason: issue.state_reason,
            updated_at: issue.updated_at,
            viewer_can_close: issue.state == GitHubIssueState::Open,
            viewer_can_reopen: issue.state == GitHubIssueState::Closed,
        })
    }

    async fn update_issue_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
        mutation: &GitHubIssueStateMutation,
    ) -> Result<GitHubIssue, AppError> {
        use super::GitHubIssueClient;

        let mut issue = self
            .issue_detail(token, owner, repository, issue_number, 1)
            .await?
            .issue;
        issue.state = mutation.desired_state;
        issue.state_reason = Some(desired_reason(mutation)?);
        Ok(issue)
    }
}

#[cfg(test)]
mod tests;
