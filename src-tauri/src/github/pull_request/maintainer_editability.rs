use async_trait::async_trait;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};

use super::super::{
    authenticated_client, code::branch_from_octocrab, github_error, pull_request_from_octocrab,
    AppError, GitHubPullRequest, GitHubService, OctocrabGitHubClient,
};

const WORKFLOWS_PATH: &str = ".github/workflows";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestMaintainerEditabilityState {
    Available,
    NotAuthor,
    SameRepository,
    OrganizationFork,
    Closed,
    HeadUnavailable,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubPullRequestWorkflowRisk {
    Present,
    Absent,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestMaintainerEditability {
    pub pull_request: GitHubPullRequest,
    pub state: GitHubPullRequestMaintainerEditabilityState,
    pub workflow_risk: GitHubPullRequestWorkflowRisk,
    pub pull_request_id: u64,
    pub pull_request_node_id: String,
    pub pull_request_number: u64,
    pub author_id: u64,
    pub author_login: String,
    pub viewer_id: u64,
    pub current_value: bool,
    pub draft: bool,
    pub merged: bool,
    pub base_repository_id: u64,
    pub base_repository: String,
    pub head_repository_id: Option<u64>,
    pub head_repository: Option<String>,
    pub head_repository_owner_type: Option<String>,
    pub head_repository_private: Option<bool>,
    pub head_repository_fork: Option<bool>,
    pub head_ref: String,
    pub head_sha: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPullRequestMaintainerEditabilityGuard {
    pub expected_current_value: bool,
    pub expected_pull_request_id: u64,
    pub expected_pull_request_node_id: String,
    pub expected_author_id: u64,
    pub expected_head_repository_id: u64,
    pub expected_head_ref: String,
    pub expected_head_sha: String,
    pub expected_workflow_risk: GitHubPullRequestWorkflowRisk,
    pub requested_value: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct MaintainerEditabilityShape {
    open: bool,
    merged: bool,
    viewer_is_author: bool,
    cross_repository: bool,
    head_is_fork: bool,
    head_owner_is_viewer: bool,
    head_owner_is_user: bool,
    head_is_live: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct HeadRepositorySnapshot {
    id: u64,
    full_name: String,
    owner_id: u64,
    owner_type: String,
    private: bool,
    fork: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PullRequestMaintainerSnapshot {
    id: u64,
    node_id: String,
    number: u64,
    author_id: u64,
    author_login: String,
    open: bool,
    draft: bool,
    merged: bool,
    current_value: bool,
    base_repository_id: u64,
    base_repository: String,
    head_repository: Option<HeadRepositorySnapshot>,
    head_ref: String,
    head_sha: String,
}

#[async_trait]
pub(crate) trait GitHubPullRequestMaintainerEditabilityClient: Send + Sync {
    async fn pull_request_maintainer_editability(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError>;

    async fn update_pull_request_maintainer_editability(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestMaintainerEditabilityGuard,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError>;
}

#[async_trait]
impl GitHubPullRequestMaintainerEditabilityClient for OctocrabGitHubClient {
    async fn pull_request_maintainer_editability(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
        let client = authenticated_client(token)?;
        pull_request_maintainer_editability_with_client(
            &client,
            owner,
            repository,
            pull_request_number,
        )
        .await
    }

    async fn update_pull_request_maintainer_editability(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestMaintainerEditabilityGuard,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
        let client = authenticated_client(token)?;
        update_pull_request_maintainer_editability_with_client(
            &client,
            owner,
            repository,
            pull_request_number,
            guard,
        )
        .await
    }
}

impl GitHubService {
    pub async fn pull_request_maintainer_editability(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .pull_request_maintainer_editability(&token, owner, repository, pull_request_number)
            .await
    }

    pub async fn update_pull_request_maintainer_editability(
        &self,
        owner: &str,
        repository: &str,
        pull_request_number: u64,
        guard: &GitHubPullRequestMaintainerEditabilityGuard,
    ) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_pull_request_maintainer_editability(
                &token,
                owner,
                repository,
                pull_request_number,
                guard,
            )
            .await
    }
}

async fn pull_request_maintainer_editability_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
    let viewer = client.current().user().await.map_err(editability_error)?;
    let pull_request = get_pull_request(client, owner, repository, pull_request_number).await?;
    let snapshot =
        pull_request_maintainer_snapshot(&pull_request, owner, repository, pull_request_number)?;
    let (state, workflow_risk) =
        maintainer_editability_context(client, &snapshot, viewer.id.into_inner(), true).await?;
    Ok(maintainer_editability_from_snapshot(
        pull_request,
        snapshot,
        viewer.id.into_inner(),
        state,
        workflow_risk,
    ))
}

async fn update_pull_request_maintainer_editability_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
    guard: &GitHubPullRequestMaintainerEditabilityGuard,
) -> Result<GitHubPullRequestMaintainerEditability, AppError> {
    let viewer = client.current().user().await.map_err(editability_error)?;
    let viewer_id = viewer.id.into_inner();
    let before_raw = get_pull_request(client, owner, repository, pull_request_number).await?;
    let before =
        pull_request_maintainer_snapshot(&before_raw, owner, repository, pull_request_number)?;
    let (state, workflow_risk) =
        maintainer_editability_context(client, &before, viewer_id, guard.requested_value).await?;
    ensure_preflight(&before, viewer_id, state, workflow_risk, guard)?;

    let updated_raw: octocrab::models::pulls::PullRequest = client
        .patch(
            pull_request_route(owner, repository, pull_request_number),
            Some(&maintainer_editability_request(guard.requested_value)),
        )
        .await
        .map_err(editability_error)?;
    let updated =
        pull_request_maintainer_snapshot(&updated_raw, owner, repository, pull_request_number)?;
    ensure_updated(&before, &updated, viewer_id, guard.requested_value)?;

    let confirmed_raw = get_pull_request(client, owner, repository, pull_request_number)
        .await
        .map_err(postflight_conflict)?;
    let confirmed =
        pull_request_maintainer_snapshot(&confirmed_raw, owner, repository, pull_request_number)?;
    ensure_updated(&before, &confirmed, viewer_id, guard.requested_value)?;
    let (confirmed_state, confirmed_risk) =
        maintainer_editability_context(client, &confirmed, viewer_id, guard.requested_value)
            .await
            .map_err(postflight_conflict)?;
    if confirmed_state != GitHubPullRequestMaintainerEditabilityState::Available {
        return Err(editability_conflict(
            "the pull request is no longer eligible for maintainer edits",
        ));
    }
    Ok(maintainer_editability_from_snapshot(
        confirmed_raw,
        confirmed,
        viewer_id,
        confirmed_state,
        confirmed_risk,
    ))
}

async fn get_pull_request(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<octocrab::models::pulls::PullRequest, AppError> {
    client
        .pulls(owner, repository)
        .get(pull_request_number)
        .await
        .map_err(editability_error)
}

async fn maintainer_editability_context(
    client: &octocrab::Octocrab,
    snapshot: &PullRequestMaintainerSnapshot,
    viewer_id: u64,
    inspect_workflows: bool,
) -> Result<
    (
        GitHubPullRequestMaintainerEditabilityState,
        GitHubPullRequestWorkflowRisk,
    ),
    AppError,
> {
    let head = snapshot.head_repository.as_ref();
    let mut shape = MaintainerEditabilityShape {
        open: snapshot.open,
        merged: snapshot.merged,
        viewer_is_author: viewer_id == snapshot.author_id,
        cross_repository: head
            .is_some_and(|repository| repository.id != snapshot.base_repository_id),
        head_is_fork: head.is_some_and(|repository| repository.fork),
        head_owner_is_viewer: head.is_some_and(|repository| repository.owner_id == viewer_id),
        head_owner_is_user: head
            .is_some_and(|repository| repository.owner_type.eq_ignore_ascii_case("user")),
        head_is_live: head.is_some(),
    };
    let initial_state = maintainer_editability_state(&shape);
    if initial_state != GitHubPullRequestMaintainerEditabilityState::Available {
        return Ok((initial_state, GitHubPullRequestWorkflowRisk::Unknown));
    }
    let head = head.expect("available editability requires a head repository");
    shape.head_is_live =
        head_branch_matches(client, head, &snapshot.head_ref, &snapshot.head_sha).await?;
    let state = maintainer_editability_state(&shape);
    if state != GitHubPullRequestMaintainerEditabilityState::Available {
        return Ok((state, GitHubPullRequestWorkflowRisk::Unknown));
    }
    let risk = if inspect_workflows {
        head_workflow_risk(client, head, &snapshot.head_sha).await?
    } else {
        GitHubPullRequestWorkflowRisk::Unknown
    };
    Ok((state, risk))
}

async fn head_branch_matches(
    client: &octocrab::Octocrab,
    head: &HeadRepositorySnapshot,
    head_ref: &str,
    head_sha: &str,
) -> Result<bool, AppError> {
    let (owner, repository) = repository_parts(&head.full_name)?;
    let branch = utf8_percent_encode(head_ref, NON_ALPHANUMERIC).to_string();
    let route = format!("/repos/{owner}/{repository}/branches/{branch}");
    match client
        .get::<octocrab::models::repos::Branch, _, _>(route, None::<&()>)
        .await
    {
        Ok(branch) => {
            let branch = branch_from_octocrab(branch);
            Ok(branch.name == head_ref && branch.sha == head_sha)
        }
        Err(error) if github_error_status(&error) == Some(404) => Ok(false),
        Err(error) => Err(editability_error(error)),
    }
}

async fn head_workflow_risk(
    client: &octocrab::Octocrab,
    head: &HeadRepositorySnapshot,
    head_sha: &str,
) -> Result<GitHubPullRequestWorkflowRisk, AppError> {
    let (owner, repository) = repository_parts(&head.full_name)?;
    match client
        .repos(owner, repository)
        .get_content()
        .path(WORKFLOWS_PATH)
        .r#ref(head_sha)
        .send()
        .await
    {
        Ok(contents) => Ok(
            if contents.items.iter().any(|content| {
                content.r#type == "file"
                    && (content.name.ends_with(".yml") || content.name.ends_with(".yaml"))
            }) {
                GitHubPullRequestWorkflowRisk::Present
            } else {
                GitHubPullRequestWorkflowRisk::Absent
            },
        ),
        Err(error) if github_error_status(&error) == Some(404) => {
            Ok(GitHubPullRequestWorkflowRisk::Absent)
        }
        Err(error) => match editability_error(error) {
            error @ (AppError::GitHubAuthentication(_) | AppError::GitHubRateLimited(_)) => {
                Err(error)
            }
            _ => Ok(GitHubPullRequestWorkflowRisk::Unknown),
        },
    }
}

fn pull_request_maintainer_snapshot(
    pull_request: &octocrab::models::pulls::PullRequest,
    owner: &str,
    repository: &str,
    pull_request_number: u64,
) -> Result<PullRequestMaintainerSnapshot, AppError> {
    let node_id = required_text(pull_request.node_id.clone(), "pull request Node ID")?;
    let author = pull_request.user.as_ref().ok_or_else(incomplete_response)?;
    let base = pull_request
        .base
        .repo
        .as_ref()
        .ok_or_else(incomplete_response)?;
    let base_repository = required_text(base.full_name.clone(), "base repository")?;
    if pull_request.number != pull_request_number
        || !base_repository.eq_ignore_ascii_case(&format!("{owner}/{repository}"))
    {
        return Err(editability_conflict(
            "GitHub returned a pull request outside the requested repository",
        ));
    }
    let head_repository = pull_request
        .head
        .repo
        .as_ref()
        .map(|head| {
            let owner = head.owner.as_ref().ok_or_else(incomplete_response)?;
            Ok(HeadRepositorySnapshot {
                id: head.id.into_inner(),
                full_name: required_text(head.full_name.clone(), "head repository")?,
                owner_id: owner.id.into_inner(),
                owner_type: required_text(
                    Some(owner.r#type.clone()),
                    "head repository owner type",
                )?,
                private: head.private.ok_or_else(incomplete_response)?,
                fork: head.fork.ok_or_else(incomplete_response)?,
            })
        })
        .transpose()?;
    Ok(PullRequestMaintainerSnapshot {
        id: pull_request.id.into_inner(),
        node_id,
        number: pull_request.number,
        author_id: author.id.into_inner(),
        author_login: author.login.clone(),
        open: matches!(pull_request.state, Some(octocrab::models::IssueState::Open)),
        draft: pull_request.draft.unwrap_or(false),
        merged: pull_request.merged.unwrap_or(false),
        current_value: pull_request
            .maintainer_can_modify
            .ok_or_else(incomplete_response)?,
        base_repository_id: base.id.into_inner(),
        base_repository,
        head_repository,
        head_ref: required_text(
            Some(pull_request.head.ref_field.clone()),
            "pull request head ref",
        )?,
        head_sha: required_text(Some(pull_request.head.sha.clone()), "pull request head SHA")?,
    })
}

fn maintainer_editability_state(
    shape: &MaintainerEditabilityShape,
) -> GitHubPullRequestMaintainerEditabilityState {
    if !shape.open || shape.merged {
        GitHubPullRequestMaintainerEditabilityState::Closed
    } else if !shape.viewer_is_author {
        GitHubPullRequestMaintainerEditabilityState::NotAuthor
    } else if !shape.head_is_live {
        GitHubPullRequestMaintainerEditabilityState::HeadUnavailable
    } else if !shape.cross_repository {
        GitHubPullRequestMaintainerEditabilityState::SameRepository
    } else if !shape.head_is_fork || !shape.head_owner_is_viewer || !shape.head_owner_is_user {
        GitHubPullRequestMaintainerEditabilityState::OrganizationFork
    } else {
        GitHubPullRequestMaintainerEditabilityState::Available
    }
}

fn ensure_preflight(
    snapshot: &PullRequestMaintainerSnapshot,
    viewer_id: u64,
    state: GitHubPullRequestMaintainerEditabilityState,
    workflow_risk: GitHubPullRequestWorkflowRisk,
    guard: &GitHubPullRequestMaintainerEditabilityGuard,
) -> Result<(), AppError> {
    let head = snapshot
        .head_repository
        .as_ref()
        .ok_or_else(|| editability_conflict("the pull request head repository is unavailable"))?;
    if state != GitHubPullRequestMaintainerEditabilityState::Available
        || viewer_id != snapshot.author_id
        || snapshot.current_value != guard.expected_current_value
        || snapshot.id != guard.expected_pull_request_id
        || snapshot.node_id != guard.expected_pull_request_node_id
        || snapshot.author_id != guard.expected_author_id
        || head.id != guard.expected_head_repository_id
        || snapshot.head_ref != guard.expected_head_ref
        || snapshot.head_sha != guard.expected_head_sha
        || (guard.requested_value
            && !workflow_risk_is_covered_by_warning(guard.expected_workflow_risk, workflow_risk))
        || snapshot.current_value == guard.requested_value
    {
        return Err(editability_conflict(
            "the pull request maintainer-editability snapshot changed; refresh before trying again",
        ));
    }
    Ok(())
}

fn workflow_risk_is_covered_by_warning(
    expected: GitHubPullRequestWorkflowRisk,
    actual: GitHubPullRequestWorkflowRisk,
) -> bool {
    expected != GitHubPullRequestWorkflowRisk::Absent
        || actual == GitHubPullRequestWorkflowRisk::Absent
}

fn ensure_updated(
    before: &PullRequestMaintainerSnapshot,
    updated: &PullRequestMaintainerSnapshot,
    viewer_id: u64,
    requested_value: bool,
) -> Result<(), AppError> {
    if updated.id == before.id
        && updated.node_id == before.node_id
        && updated.number == before.number
        && updated.author_id == before.author_id
        && updated.author_login == before.author_login
        && viewer_id == before.author_id
        && updated.open
        && !updated.merged
        && updated.draft == before.draft
        && updated.base_repository_id == before.base_repository_id
        && updated
            .base_repository
            .eq_ignore_ascii_case(&before.base_repository)
        && updated.head_repository == before.head_repository
        && updated.head_ref == before.head_ref
        && updated.head_sha == before.head_sha
        && updated.current_value == requested_value
    {
        Ok(())
    } else {
        Err(editability_conflict(
            "GitHub did not persist the selected maintainer-editability setting",
        ))
    }
}

fn maintainer_editability_from_snapshot(
    pull_request: octocrab::models::pulls::PullRequest,
    snapshot: PullRequestMaintainerSnapshot,
    viewer_id: u64,
    state: GitHubPullRequestMaintainerEditabilityState,
    workflow_risk: GitHubPullRequestWorkflowRisk,
) -> GitHubPullRequestMaintainerEditability {
    let head = snapshot.head_repository.as_ref();
    GitHubPullRequestMaintainerEditability {
        pull_request: pull_request_from_octocrab(pull_request),
        state,
        workflow_risk,
        pull_request_id: snapshot.id,
        pull_request_node_id: snapshot.node_id,
        pull_request_number: snapshot.number,
        author_id: snapshot.author_id,
        author_login: snapshot.author_login,
        viewer_id,
        current_value: snapshot.current_value,
        draft: snapshot.draft,
        merged: snapshot.merged,
        base_repository_id: snapshot.base_repository_id,
        base_repository: snapshot.base_repository,
        head_repository_id: head.map(|repository| repository.id),
        head_repository: head.map(|repository| repository.full_name.clone()),
        head_repository_owner_type: head.map(|repository| repository.owner_type.clone()),
        head_repository_private: head.map(|repository| repository.private),
        head_repository_fork: head.map(|repository| repository.fork),
        head_ref: snapshot.head_ref,
        head_sha: snapshot.head_sha,
    }
}

fn required_text(value: Option<String>, field: &str) -> Result<String, AppError> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| editability_conflict(format!("GitHub omitted the {field}")))
}

fn repository_parts(full_name: &str) -> Result<(&str, &str), AppError> {
    let (owner, repository) = full_name
        .split_once('/')
        .ok_or_else(|| editability_conflict("GitHub returned an invalid head repository"))?;
    if owner.is_empty() || repository.is_empty() || repository.contains('/') {
        Err(editability_conflict(
            "GitHub returned an invalid head repository",
        ))
    } else {
        Ok((owner, repository))
    }
}

fn pull_request_route(owner: &str, repository: &str, pull_request_number: u64) -> String {
    format!("/repos/{owner}/{repository}/pulls/{pull_request_number}")
}

fn maintainer_editability_request(requested_value: bool) -> serde_json::Value {
    serde_json::json!({ "maintainer_can_modify": requested_value })
}

fn incomplete_response() -> AppError {
    editability_conflict("GitHub returned incomplete pull request maintainer-editability data")
}

fn editability_conflict(message: impl Into<String>) -> AppError {
    AppError::GitHubPullRequestMaintainerEditabilityConflict(message.into())
}

fn postflight_conflict(error: AppError) -> AppError {
    editability_conflict(format!(
        "the write may have persisted, but Harbor could not verify it: {error}; refresh before trying again"
    ))
}

fn editability_error(error: octocrab::Error) -> AppError {
    if let octocrab::Error::GitHub { source, .. } = &error {
        if source.status_code.as_u16() == 401 {
            return AppError::GitHubAuthentication(error.to_string());
        }
        if matches!(source.status_code.as_u16(), 404 | 422) {
            return editability_conflict(format!(
                "{}; refresh the pull request before trying again",
                source.message
            ));
        }
    }
    if matches!(
        error,
        octocrab::Error::Serde { .. } | octocrab::Error::Json { .. }
    ) {
        return editability_conflict(format!(
            "GitHub returned malformed maintainer-editability data: {error}"
        ));
    }
    github_error(error)
}

fn github_error_status(error: &octocrab::Error) -> Option<u16> {
    match error {
        octocrab::Error::GitHub { source, .. } => Some(source.status_code.as_u16()),
        _ => None,
    }
}

#[cfg(test)]
mod tests;
