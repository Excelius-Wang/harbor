use std::collections::HashSet;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue::{GitHubIssueState, GitHubIssueStateReason},
    issue_related::{graphql_node_id_is_valid, issue_url_matches, IssueGraphQlRequest},
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const PINNED_ISSUE_LIMIT: usize = 3;
const PINNED_ISSUE_QUERY_SIZE: i32 = 4;

const PINNED_ISSUES_QUERY: &str = r#"
query HarborPinnedIssues($owner: String!, $repository: String!, $first: Int!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
    pinnedIssues(first: $first) {
      totalCount
      nodes {
        id
        pinnedBy { login }
        repository { id nameWithOwner }
        issue {
          id
          number
          title
          url
          state
          stateReason
          isPinned
          repository { id nameWithOwner }
        }
      }
    }
  }
}
"#;

const ISSUE_PIN_PREFLIGHT_QUERY: &str = r#"
query HarborIssuePinPreflight(
  $owner: String!
  $repository: String!
  $number: Int!
  $first: Int!
) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
    pinnedIssues(first: $first) {
      totalCount
      nodes {
        id
        pinnedBy { login }
        repository { id nameWithOwner }
        issue {
          id
          number
          title
          url
          state
          stateReason
          isPinned
          repository { id nameWithOwner }
        }
      }
    }
    target: issue(number: $number) {
      id
      number
      title
      url
      state
      stateReason
      isPinned
      repository { id nameWithOwner }
    }
  }
}
"#;

const PIN_ISSUE_MUTATION: &str = r#"
mutation HarborPinIssue($issueId: ID!) {
  result: pinIssue(input: { issueId: $issueId }) {
    issue {
      id
      number
      title
      url
      state
      stateReason
      isPinned
      repository { id nameWithOwner }
    }
  }
}
"#;

const UNPIN_ISSUE_MUTATION: &str = r#"
mutation HarborUnpinIssue($issueId: ID!) {
  result: unpinIssue(input: { issueId: $issueId }) {
    issue {
      id
      number
      title
      url
      state
      stateReason
      isPinned
      repository { id nameWithOwner }
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubIssuePinAction {
    Pin,
    Unpin,
}

pub(crate) type IssuePinAction = GitHubIssuePinAction;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPinnedIssue {
    pub node_id: String,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: GitHubIssueState,
    pub state_reason: Option<GitHubIssueStateReason>,
    pub pinned_by: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubPinnedIssuePage {
    pub repository_id: String,
    pub repository_full_name: String,
    pub viewer_can_manage: bool,
    pub issues: Vec<GitHubPinnedIssue>,
}

#[derive(Clone, Copy)]
pub(crate) struct IssuePinMutation<'a> {
    request: IssueGraphQlRequest<'a>,
    action: IssuePinAction,
}

impl<'a> IssuePinMutation<'a> {
    pub(crate) fn new(
        owner: &'a str,
        repository: &'a str,
        issue_number: u64,
        expected_issue_node_id: &'a str,
        action: IssuePinAction,
    ) -> Result<Self, AppError> {
        Ok(Self {
            request: IssueGraphQlRequest::new(
                owner,
                repository,
                issue_number,
                expected_issue_node_id,
            )?,
            action,
        })
    }
}

#[async_trait]
pub(crate) trait GitHubIssuePinClient: Send + Sync {
    async fn pinned_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPinnedIssuePage, AppError>;

    async fn update_issue_pin(
        &self,
        token: &str,
        mutation: IssuePinMutation<'_>,
    ) -> Result<GitHubPinnedIssuePage, AppError>;
}

impl GitHubService {
    pub async fn pinned_issues(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPinnedIssuePage, AppError> {
        let token = self.load_access_token().await?;
        self.client.pinned_issues(&token, owner, repository).await
    }

    pub async fn update_issue_pin(
        &self,
        mutation: IssuePinMutation<'_>,
    ) -> Result<GitHubPinnedIssuePage, AppError> {
        let token = self.load_access_token().await?;
        self.client.update_issue_pin(&token, mutation).await
    }
}

#[async_trait]
impl GitHubIssuePinClient for OctocrabGitHubClient {
    async fn pinned_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPinnedIssuePage, AppError> {
        let client = authenticated_client(token)?;
        load_pinned_issues_with_client(&client, owner, repository).await
    }

    async fn update_issue_pin(
        &self,
        token: &str,
        mutation: IssuePinMutation<'_>,
    ) -> Result<GitHubPinnedIssuePage, AppError> {
        let client = issue_pin_client(token)?;
        update_issue_pin_with_client(&client, mutation).await
    }
}

fn issue_pin_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

async fn load_pinned_issues_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubPinnedIssuePage, AppError> {
    let payload = serde_json::json!({
        "query": PINNED_ISSUES_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "first": PINNED_ISSUE_QUERY_SIZE,
        }
    });
    let response: IssuePinQueryResponse = client.graphql(&payload).await.map_err(github_error)?;
    Ok(snapshot_from_graphql(response, owner, repository)?.page)
}

async fn update_issue_pin_with_client(
    client: &octocrab::Octocrab,
    mutation: IssuePinMutation<'_>,
) -> Result<GitHubPinnedIssuePage, AppError> {
    let preflight = load_issue_pin_snapshot(client, mutation.request).await?;
    ensure_preflight(&preflight, mutation)?;

    let response = execute_issue_pin_mutation(
        client,
        mutation,
        &preflight.page.repository_id,
        &preflight.page.repository_full_name,
    )
    .await?;
    ensure_mutation_response(&response, &preflight, mutation)?;

    let postflight = load_issue_pin_snapshot(client, mutation.request)
        .await
        .map_err(post_write_error)?;
    ensure_postflight(&postflight, &preflight, mutation)?;
    Ok(postflight.page)
}

async fn load_issue_pin_snapshot(
    client: &octocrab::Octocrab,
    request: IssueGraphQlRequest<'_>,
) -> Result<IssuePinSnapshot, AppError> {
    let number = i32::try_from(request.issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    let payload = serde_json::json!({
        "query": ISSUE_PIN_PREFLIGHT_QUERY,
        "variables": {
            "owner": request.owner,
            "repository": request.repository,
            "number": number,
            "first": PINNED_ISSUE_QUERY_SIZE,
        }
    });
    let response: IssuePinQueryResponse = client.graphql(&payload).await.map_err(github_error)?;
    snapshot_from_graphql(response, request.owner, request.repository)
}

fn snapshot_from_graphql(
    response: IssuePinQueryResponse,
    owner: &str,
    repository: &str,
) -> Result<IssuePinSnapshot, AppError> {
    let repository_snapshot = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue repository".to_string())
    })?;
    let expected_full_name = format!("{owner}/{repository}");
    if !graphql_node_id_is_valid(&repository_snapshot.id)
        || !repository_snapshot
            .name_with_owner
            .eq_ignore_ascii_case(&expected_full_name)
    {
        return Err(invalid_snapshot("repository identity"));
    }
    let pinned = repository_snapshot.pinned_issues.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the repository's pinned Issues".to_string())
    })?;
    if pinned.total_count > PINNED_ISSUE_LIMIT || pinned.nodes.len() != pinned.total_count {
        return Err(invalid_snapshot("pinned Issue count"));
    }

    let mut pin_ids = HashSet::new();
    let mut node_ids = HashSet::new();
    let mut issue_numbers = HashSet::new();
    let mut issues = Vec::with_capacity(pinned.nodes.len());
    for pinned_issue in pinned.nodes {
        let pinned_issue = pinned_issue.ok_or_else(|| invalid_snapshot("pinned Issue node"))?;
        if !graphql_node_id_is_valid(&pinned_issue.id)
            || !pin_ids.insert(pinned_issue.id.clone())
            || !graphql_node_id_is_valid(&pinned_issue.repository.id)
            || pinned_issue.repository.id != repository_snapshot.id
            || !pinned_issue
                .repository
                .name_with_owner
                .eq_ignore_ascii_case(&repository_snapshot.name_with_owner)
            || pinned_issue.pinned_by.login.trim().is_empty()
        {
            return Err(invalid_snapshot("pinned Issue identity"));
        }
        let issue = validated_issue(
            pinned_issue.issue,
            &repository_snapshot.id,
            &repository_snapshot.name_with_owner,
        )?;
        if issue.is_pinned != Some(true)
            || !node_ids.insert(issue.node_id.clone())
            || !issue_numbers.insert(issue.number)
        {
            return Err(invalid_snapshot("pinned Issue state"));
        }
        issues.push(GitHubPinnedIssue {
            node_id: issue.node_id,
            number: issue.number,
            title: issue.title,
            url: issue.url,
            state: issue.state,
            state_reason: issue.state_reason,
            pinned_by: pinned_issue.pinned_by.login,
        });
    }

    let target = repository_snapshot
        .target
        .map(|target| {
            validated_issue(
                target,
                &repository_snapshot.id,
                &repository_snapshot.name_with_owner,
            )
        })
        .transpose()?;
    Ok(IssuePinSnapshot {
        page: GitHubPinnedIssuePage {
            repository_id: repository_snapshot.id,
            repository_full_name: repository_snapshot.name_with_owner,
            viewer_can_manage: permission_can_write(
                repository_snapshot.viewer_permission.as_deref(),
            ),
            issues,
        },
        target,
    })
}

fn validated_issue(
    issue: GraphQlIssue,
    expected_repository_id: &str,
    expected_repository_full_name: &str,
) -> Result<IssueSnapshot, AppError> {
    let expected_path = format!("/{}/issues/{}", expected_repository_full_name, issue.number);
    if !graphql_node_id_is_valid(&issue.id)
        || issue.number == 0
        || issue.title.trim().is_empty()
        || issue.repository.id != expected_repository_id
        || !issue
            .repository
            .name_with_owner
            .eq_ignore_ascii_case(expected_repository_full_name)
        || !issue_url_matches(&issue.url, "github.com", &expected_path)
        || issue.is_pinned.is_none()
    {
        return Err(invalid_snapshot("Issue identity"));
    }
    Ok(IssueSnapshot {
        node_id: issue.id,
        number: issue.number,
        title: issue.title,
        url: issue.url,
        state: issue.state.into(),
        state_reason: issue.state_reason,
        is_pinned: issue.is_pinned,
    })
}

fn ensure_preflight(
    snapshot: &IssuePinSnapshot,
    mutation: IssuePinMutation<'_>,
) -> Result<(), AppError> {
    if !snapshot.page.viewer_can_manage {
        return Err(AppError::GitHubPermission(
            "repository write permission is required to update pinned Issues".to_string(),
        ));
    }
    let target = snapshot.target.as_ref().ok_or_else(|| {
        AppError::GitHubIssueStateConflict(
            "the selected Issue is no longer available; refresh before trying again".to_string(),
        )
    })?;
    if target.node_id != mutation.request.expected_issue_node_id
        || target.number != mutation.request.issue_number
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the selected Issue identity changed; refresh before trying again".to_string(),
        ));
    }
    if snapshot
        .page
        .issues
        .iter()
        .any(|issue| issue.number == target.number && issue.node_id != target.node_id)
    {
        return Err(AppError::GitHubIssueStateConflict(
            "the selected Issue identity changed; refresh before trying again".to_string(),
        ));
    }
    let listed = snapshot
        .page
        .issues
        .iter()
        .any(|issue| issue.node_id == target.node_id && issue.number == target.number);
    if target.is_pinned != Some(listed) {
        return Err(invalid_snapshot("Issue pin state"));
    }
    match mutation.action {
        IssuePinAction::Pin if listed => Err(AppError::GitHubIssueStateConflict(
            "the Issue is already pinned".to_string(),
        )),
        IssuePinAction::Pin if snapshot.page.issues.len() >= PINNED_ISSUE_LIMIT => {
            Err(AppError::GitHubIssueStateConflict(
                "GitHub allows at most three pinned Issues in a repository".to_string(),
            ))
        }
        IssuePinAction::Unpin if !listed => Err(AppError::GitHubIssueStateConflict(
            "the Issue is no longer pinned".to_string(),
        )),
        _ => Ok(()),
    }
}

async fn execute_issue_pin_mutation(
    client: &octocrab::Octocrab,
    mutation: IssuePinMutation<'_>,
    repository_id: &str,
    repository_full_name: &str,
) -> Result<IssueSnapshot, AppError> {
    let query = match mutation.action {
        IssuePinAction::Pin => PIN_ISSUE_MUTATION,
        IssuePinAction::Unpin => UNPIN_ISSUE_MUTATION,
    };
    let payload = serde_json::json!({
        "query": query,
        "variables": { "issueId": mutation.request.expected_issue_node_id }
    });
    let response: IssuePinMutationResponse = client
        .graphql(&payload)
        .await
        .map_err(|error| post_write_error(github_error(error)))?;
    let issue = response
        .result
        .and_then(|result| result.issue)
        .ok_or_else(|| write_may_have_persisted("GitHub did not return the updated Issue"))?;
    validated_issue(issue, repository_id, repository_full_name)
        .map_err(|error| write_may_have_persisted(&error.to_string()))
}

fn ensure_mutation_response(
    response: &IssueSnapshot,
    preflight: &IssuePinSnapshot,
    mutation: IssuePinMutation<'_>,
) -> Result<(), AppError> {
    let expected_pinned = mutation.action == IssuePinAction::Pin;
    let target = preflight
        .target
        .as_ref()
        .expect("preflight target validated");
    if response.node_id != target.node_id
        || response.number != target.number
        || response.is_pinned != Some(expected_pinned)
    {
        return Err(write_may_have_persisted(
            "the mutation response did not match the requested pin state",
        ));
    }
    Ok(())
}

fn ensure_postflight(
    postflight: &IssuePinSnapshot,
    preflight: &IssuePinSnapshot,
    mutation: IssuePinMutation<'_>,
) -> Result<(), AppError> {
    let expected_pinned = mutation.action == IssuePinAction::Pin;
    let target = postflight.target.as_ref().ok_or_else(|| {
        write_may_have_persisted("the postflight did not return the selected Issue")
    })?;
    let expected_target = preflight
        .target
        .as_ref()
        .expect("preflight target validated");
    let listed = postflight
        .page
        .issues
        .iter()
        .any(|issue| issue.node_id == target.node_id && issue.number == target.number);
    let conflicting_identity = postflight
        .page
        .issues
        .iter()
        .any(|issue| issue.number == target.number && issue.node_id != target.node_id);
    if postflight.page.repository_id != preflight.page.repository_id
        || !postflight
            .page
            .repository_full_name
            .eq_ignore_ascii_case(&preflight.page.repository_full_name)
        || target.node_id != expected_target.node_id
        || target.number != expected_target.number
        || target.is_pinned != Some(expected_pinned)
        || listed != expected_pinned
        || conflicting_identity
    {
        return Err(write_may_have_persisted(
            "the postflight did not match the requested pin state",
        ));
    }
    Ok(())
}

fn permission_can_write(permission: Option<&str>) -> bool {
    matches!(permission, Some("WRITE" | "MAINTAIN" | "ADMIN"))
}

fn invalid_snapshot(part: &str) -> AppError {
    AppError::GitHub(format!("GitHub returned an invalid {part}"))
}

fn write_may_have_persisted(message: &str) -> AppError {
    AppError::GitHubIssueStateConflict(format!(
        "{message}; the pinned Issue update may have persisted"
    ))
}

fn post_write_error(error: AppError) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => write_may_have_persisted(&error.to_string()),
    }
}

#[derive(Deserialize)]
struct IssuePinQueryResponse {
    repository: Option<GraphQlRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlRepository {
    id: String,
    name_with_owner: String,
    viewer_permission: Option<String>,
    pinned_issues: Option<GraphQlPinnedIssueConnection>,
    target: Option<GraphQlIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPinnedIssueConnection {
    total_count: usize,
    nodes: Vec<Option<GraphQlPinnedIssue>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPinnedIssue {
    id: String,
    pinned_by: GraphQlActor,
    repository: GraphQlRepositoryIdentity,
    issue: GraphQlIssue,
}

#[derive(Deserialize)]
struct GraphQlActor {
    login: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlIssue {
    id: String,
    number: u64,
    title: String,
    url: String,
    state: GraphQlIssueState,
    state_reason: Option<GitHubIssueStateReason>,
    is_pinned: Option<bool>,
    repository: GraphQlRepositoryIdentity,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlRepositoryIdentity {
    id: String,
    name_with_owner: String,
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

#[derive(Deserialize)]
struct IssuePinMutationResponse {
    result: Option<IssuePinMutationPayload>,
}

#[derive(Deserialize)]
struct IssuePinMutationPayload {
    issue: Option<GraphQlIssue>,
}

struct IssuePinSnapshot {
    page: GitHubPinnedIssuePage,
    target: Option<IssueSnapshot>,
}

struct IssueSnapshot {
    node_id: String,
    number: u64,
    title: String,
    url: String,
    state: GitHubIssueState,
    state_reason: Option<GitHubIssueStateReason>,
    is_pinned: Option<bool>,
}

#[cfg(test)]
#[async_trait]
impl GitHubIssuePinClient for super::tests::FakeGitHubClient {
    async fn pinned_issues(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubPinnedIssuePage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubPinnedIssuePage {
            repository_id: "R_1".to_string(),
            repository_full_name: "octocat/hello-world".to_string(),
            viewer_can_manage: true,
            issues: Vec::new(),
        })
    }

    async fn update_issue_pin(
        &self,
        token: &str,
        mutation: IssuePinMutation<'_>,
    ) -> Result<GitHubPinnedIssuePage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                mutation.request.owner,
                mutation.request.repository,
                mutation.request.issue_number,
                mutation.request.expected_issue_node_id,
                mutation.action,
            ),
            ("octocat", "hello-world", 7, "I_7", IssuePinAction::Pin)
        );
        Ok(GitHubPinnedIssuePage {
            repository_id: "R_1".to_string(),
            repository_full_name: "octocat/hello-world".to_string(),
            viewer_can_manage: true,
            issues: vec![GitHubPinnedIssue {
                node_id: "I_7".to_string(),
                number: 7,
                title: "Issue 7".to_string(),
                url: "https://github.com/octocat/hello-world/issues/7".to_string(),
                state: GitHubIssueState::Open,
                state_reason: None,
                pinned_by: "octocat".to_string(),
            }],
        })
    }
}

#[cfg(test)]
mod tests;
