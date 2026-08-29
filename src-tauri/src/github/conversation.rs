use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient};

const CONVERSATION_CONTROLS_QUERY: &str = r#"
query HarborConversationControls(
  $owner: String!
  $repository: String!
  $number: Int!
) {
  repository(owner: $owner, name: $repository) {
    viewerPermission
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue {
        id
        number
        locked
        activeLockReason
        viewerCanSubscribe
        viewerSubscription
      }
      ... on PullRequest {
        id
        number
        locked
        activeLockReason
        viewerCanSubscribe
        viewerSubscription
      }
    }
  }
}
"#;

const UPDATE_SUBSCRIPTION_MUTATION: &str = r#"
mutation HarborUpdateConversationSubscription(
  $subscribableId: ID!
  $state: SubscriptionState!
) {
  updateSubscription(input: {
    subscribableId: $subscribableId
    state: $state
  }) {
    subscribable {
      id
      viewerCanSubscribe
      viewerSubscription
    }
  }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubConversationKind {
    Issue,
    PullRequest,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubConversationLockAction {
    Lock,
    Unlock,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubConversationLockReason {
    OffTopic,
    TooHeated,
    Resolved,
    Spam,
}

impl GitHubConversationLockReason {
    fn as_octocrab(self) -> octocrab::params::LockReason {
        match self {
            Self::OffTopic => octocrab::params::LockReason::OffTopic,
            Self::TooHeated => octocrab::params::LockReason::TooHeated,
            Self::Resolved => octocrab::params::LockReason::Resolved,
            Self::Spam => octocrab::params::LockReason::Spam,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubConversationSubscriptionAction {
    Subscribe,
    Unsubscribe,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubConversationSubscriptionState {
    Subscribed,
    Unsubscribed,
    Ignored,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubConversationControls {
    pub kind: GitHubConversationKind,
    pub number: u64,
    pub locked: bool,
    pub lock_reason: Option<GitHubConversationLockReason>,
    pub viewer_can_lock: bool,
    pub viewer_can_subscribe: bool,
    pub viewer_subscription: Option<GitHubConversationSubscriptionState>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ConversationSnapshot {
    node_id: String,
    controls: GitHubConversationControls,
}

#[async_trait]
pub(crate) trait GitHubConversationClient: Send + Sync {
    async fn conversation_controls(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
    ) -> Result<GitHubConversationControls, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn update_conversation_lock(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationLockAction,
        reason: Option<GitHubConversationLockReason>,
    ) -> Result<GitHubConversationControls, AppError>;

    async fn update_conversation_subscription(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationSubscriptionAction,
    ) -> Result<GitHubConversationControls, AppError>;
}

#[async_trait]
impl GitHubConversationClient for OctocrabGitHubClient {
    async fn conversation_controls(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
    ) -> Result<GitHubConversationControls, AppError> {
        let client = authenticated_client(token)?;
        Ok(
            fetch_conversation_snapshot(&client, owner, repository, number, kind)
                .await?
                .controls,
        )
    }

    async fn update_conversation_lock(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationLockAction,
        reason: Option<GitHubConversationLockReason>,
    ) -> Result<GitHubConversationControls, AppError> {
        ensure_lock_action(action, reason)?;
        let client = authenticated_client(token)?;
        let current = fetch_conversation_snapshot(&client, owner, repository, number, kind).await?;
        let requested_locked = action == GitHubConversationLockAction::Lock;
        if current.controls.locked == requested_locked {
            return Ok(current.controls);
        }
        if !current.controls.viewer_can_lock {
            return Err(AppError::GitHubPermission(
                "write access is required to lock or unlock this conversation".to_string(),
            ));
        }

        let handler = client.issues(owner, repository);
        let accepted = match action {
            GitHubConversationLockAction::Lock => handler
                .lock(
                    number,
                    reason.map(GitHubConversationLockReason::as_octocrab),
                )
                .await
                .map_err(github_error)?,
            GitHubConversationLockAction::Unlock => {
                handler.unlock(number).await.map_err(github_error)?
            }
        };
        if !accepted {
            return Err(AppError::GitHub(
                "GitHub did not accept the conversation lock update".to_string(),
            ));
        }

        let updated = fetch_conversation_snapshot(&client, owner, repository, number, kind).await?;
        if updated.controls.locked != requested_locked
            || (requested_locked && reason.is_some() && updated.controls.lock_reason != reason)
        {
            return Err(AppError::GitHubPermission(
                "GitHub did not persist the requested conversation lock state".to_string(),
            ));
        }
        Ok(updated.controls)
    }

    async fn update_conversation_subscription(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationSubscriptionAction,
    ) -> Result<GitHubConversationControls, AppError> {
        let client = authenticated_client(token)?;
        let current = fetch_conversation_snapshot(&client, owner, repository, number, kind).await?;
        let requested_state = subscription_state_for_action(action);
        if current.controls.viewer_subscription == Some(requested_state) {
            return Ok(current.controls);
        }
        if !current.controls.viewer_can_subscribe {
            return Err(AppError::GitHubPermission(
                "the signed-in account cannot change this conversation subscription".to_string(),
            ));
        }

        let payload = subscription_mutation_payload(&current.node_id, action);
        let response: ConversationSubscriptionMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        ensure_subscription_mutation_response(response, &current.node_id, requested_state)?;

        let updated = fetch_conversation_snapshot(&client, owner, repository, number, kind).await?;
        if updated.controls.viewer_subscription != Some(requested_state) {
            return Err(AppError::GitHubPermission(
                "GitHub did not persist the requested conversation subscription".to_string(),
            ));
        }
        Ok(updated.controls)
    }
}

impl GitHubService {
    pub async fn conversation_controls(
        &self,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
    ) -> Result<GitHubConversationControls, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .conversation_controls(&token, owner, repository, number, kind)
            .await
    }

    pub async fn update_conversation_lock(
        &self,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationLockAction,
        reason: Option<GitHubConversationLockReason>,
    ) -> Result<GitHubConversationControls, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_conversation_lock(&token, owner, repository, number, kind, action, reason)
            .await
    }

    pub async fn update_conversation_subscription(
        &self,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationSubscriptionAction,
    ) -> Result<GitHubConversationControls, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_conversation_subscription(&token, owner, repository, number, kind, action)
            .await
    }
}

async fn fetch_conversation_snapshot(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    number: u64,
    kind: GitHubConversationKind,
) -> Result<ConversationSnapshot, AppError> {
    let payload = conversation_query_payload(owner, repository, number)?;
    let response: ConversationControlsQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    conversation_snapshot_from_response(response, number, kind)
}

fn conversation_query_payload(
    owner: &str,
    repository: &str,
    number: u64,
) -> Result<serde_json::Value, AppError> {
    let number = i32::try_from(number).map_err(|_| {
        AppError::Validation("conversation number exceeds GitHub's supported range".to_string())
    })?;
    if number < 1 {
        return Err(AppError::Validation(
            "conversation number must be at least 1".to_string(),
        ));
    }
    Ok(serde_json::json!({
        "query": CONVERSATION_CONTROLS_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "number": number,
        }
    }))
}

fn conversation_snapshot_from_response(
    response: ConversationControlsQuery,
    number: u64,
    expected_kind: GitHubConversationKind,
) -> Result<ConversationSnapshot, AppError> {
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested repository".to_string())
    })?;
    let item = repository.issue_or_pull_request.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested Issue or pull request".to_string())
    })?;
    let kind = match item.typename.as_str() {
        "Issue" => GitHubConversationKind::Issue,
        "PullRequest" => GitHubConversationKind::PullRequest,
        _ => {
            return Err(AppError::GitHub(
                "GitHub returned an unsupported conversation type".to_string(),
            ));
        }
    };
    if kind != expected_kind || item.number != number {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue or pull request".to_string(),
        ));
    }

    Ok(ConversationSnapshot {
        node_id: item.id,
        controls: GitHubConversationControls {
            kind,
            number: item.number,
            locked: item.locked,
            lock_reason: item.active_lock_reason.map(Into::into),
            viewer_can_lock: viewer_can_lock(repository.viewer_permission.as_deref()),
            viewer_can_subscribe: item.viewer_can_subscribe,
            viewer_subscription: item.viewer_subscription.map(Into::into),
        },
    })
}

fn viewer_can_lock(permission: Option<&str>) -> bool {
    matches!(permission, Some("WRITE" | "MAINTAIN" | "ADMIN"))
}

fn ensure_lock_action(
    action: GitHubConversationLockAction,
    reason: Option<GitHubConversationLockReason>,
) -> Result<(), AppError> {
    if action == GitHubConversationLockAction::Unlock && reason.is_some() {
        return Err(AppError::Validation(
            "an unlock action cannot include a lock reason".to_string(),
        ));
    }
    Ok(())
}

fn subscription_state_for_action(
    action: GitHubConversationSubscriptionAction,
) -> GitHubConversationSubscriptionState {
    match action {
        GitHubConversationSubscriptionAction::Subscribe => {
            GitHubConversationSubscriptionState::Subscribed
        }
        GitHubConversationSubscriptionAction::Unsubscribe => {
            GitHubConversationSubscriptionState::Unsubscribed
        }
    }
}

fn subscription_mutation_payload(
    node_id: &str,
    action: GitHubConversationSubscriptionAction,
) -> serde_json::Value {
    serde_json::json!({
        "query": UPDATE_SUBSCRIPTION_MUTATION,
        "variables": {
            "subscribableId": node_id,
            "state": match action {
                GitHubConversationSubscriptionAction::Subscribe => "SUBSCRIBED",
                GitHubConversationSubscriptionAction::Unsubscribe => "UNSUBSCRIBED",
            },
        }
    })
}

fn ensure_subscription_mutation_response(
    response: ConversationSubscriptionMutation,
    node_id: &str,
    requested_state: GitHubConversationSubscriptionState,
) -> Result<(), AppError> {
    let subscribable = response
        .update_subscription
        .and_then(|payload| payload.subscribable)
        .ok_or_else(|| {
            AppError::GitHub(
                "GitHub did not return the updated conversation subscription".to_string(),
            )
        })?;
    if subscribable.id == node_id
        && subscribable.viewer_can_subscribe
        && subscribable.viewer_subscription.map(Into::into) == Some(requested_state)
    {
        return Ok(());
    }
    Err(AppError::GitHubPermission(
        "GitHub did not apply the requested conversation subscription".to_string(),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationControlsQuery {
    repository: Option<RawConversationRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawConversationRepository {
    viewer_permission: Option<String>,
    issue_or_pull_request: Option<RawConversationItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawConversationItem {
    #[serde(rename = "__typename")]
    typename: String,
    id: String,
    number: u64,
    locked: bool,
    active_lock_reason: Option<RawLockReason>,
    viewer_can_subscribe: bool,
    viewer_subscription: Option<RawSubscriptionState>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum RawLockReason {
    OffTopic,
    TooHeated,
    Resolved,
    Spam,
}

impl From<RawLockReason> for GitHubConversationLockReason {
    fn from(value: RawLockReason) -> Self {
        match value {
            RawLockReason::OffTopic => Self::OffTopic,
            RawLockReason::TooHeated => Self::TooHeated,
            RawLockReason::Resolved => Self::Resolved,
            RawLockReason::Spam => Self::Spam,
        }
    }
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum RawSubscriptionState {
    Subscribed,
    Unsubscribed,
    Ignored,
    #[serde(other)]
    Unknown,
}

impl From<RawSubscriptionState> for GitHubConversationSubscriptionState {
    fn from(value: RawSubscriptionState) -> Self {
        match value {
            RawSubscriptionState::Subscribed => Self::Subscribed,
            RawSubscriptionState::Unsubscribed => Self::Unsubscribed,
            RawSubscriptionState::Ignored => Self::Ignored,
            RawSubscriptionState::Unknown => Self::Unknown,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationSubscriptionMutation {
    update_subscription: Option<ConversationSubscriptionPayload>,
}

#[derive(Deserialize)]
struct ConversationSubscriptionPayload {
    subscribable: Option<RawSubscriptionMutationNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSubscriptionMutationNode {
    id: String,
    viewer_can_subscribe: bool,
    viewer_subscription: Option<RawSubscriptionState>,
}

#[cfg(test)]
#[async_trait]
impl GitHubConversationClient for super::tests::FakeGitHubClient {
    async fn conversation_controls(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
    ) -> Result<GitHubConversationControls, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubConversationControls {
            kind,
            number,
            locked: false,
            lock_reason: None,
            viewer_can_lock: true,
            viewer_can_subscribe: true,
            viewer_subscription: Some(GitHubConversationSubscriptionState::Unsubscribed),
        })
    }

    async fn update_conversation_lock(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationLockAction,
        reason: Option<GitHubConversationLockReason>,
    ) -> Result<GitHubConversationControls, AppError> {
        let mut controls = self
            .conversation_controls(token, owner, repository, number, kind)
            .await?;
        controls.locked = action == GitHubConversationLockAction::Lock;
        controls.lock_reason = if controls.locked { reason } else { None };
        Ok(controls)
    }

    async fn update_conversation_subscription(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        number: u64,
        kind: GitHubConversationKind,
        action: GitHubConversationSubscriptionAction,
    ) -> Result<GitHubConversationControls, AppError> {
        let mut controls = self
            .conversation_controls(token, owner, repository, number, kind)
            .await?;
        controls.viewer_subscription = Some(subscription_state_for_action(action));
        Ok(controls)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query_response(
        typename: &str,
        number: u64,
        permission: Option<&str>,
        locked: bool,
        lock_reason: Option<&str>,
        subscription: Option<&str>,
    ) -> ConversationControlsQuery {
        serde_json::from_value(serde_json::json!({
            "repository": {
                "viewerPermission": permission,
                "issueOrPullRequest": {
                    "__typename": typename,
                    "id": "I_kwDOexample",
                    "number": number,
                    "locked": locked,
                    "activeLockReason": lock_reason,
                    "viewerCanSubscribe": true,
                    "viewerSubscription": subscription,
                }
            }
        }))
        .expect("conversation response")
    }

    #[test]
    fn query_uses_the_shared_issue_or_pull_request_identity() {
        let payload = conversation_query_payload("octocat", "hello-world", 42)
            .expect("conversation query payload");

        assert_eq!(payload["variables"]["owner"], "octocat");
        assert_eq!(payload["variables"]["repository"], "hello-world");
        assert_eq!(payload["variables"]["number"], 42);
        let query = payload["query"].as_str().expect("query");
        assert!(query.contains("issueOrPullRequest(number: $number)"));
        assert!(query.contains("activeLockReason"));
        assert!(query.contains("viewerSubscription"));
        assert!(conversation_query_payload("octocat", "hello-world", 0).is_err());
        assert!(conversation_query_payload("octocat", "hello-world", i32::MAX as u64 + 1).is_err());
    }

    #[test]
    fn snapshot_maps_lock_permission_reason_and_subscription() {
        let issue = conversation_snapshot_from_response(
            query_response(
                "Issue",
                42,
                Some("WRITE"),
                true,
                Some("TOO_HEATED"),
                Some("IGNORED"),
            ),
            42,
            GitHubConversationKind::Issue,
        )
        .expect("Issue snapshot");
        assert!(issue.controls.locked);
        assert_eq!(
            issue.controls.lock_reason,
            Some(GitHubConversationLockReason::TooHeated)
        );
        assert!(issue.controls.viewer_can_lock);
        assert_eq!(
            issue.controls.viewer_subscription,
            Some(GitHubConversationSubscriptionState::Ignored)
        );

        let pull_request = conversation_snapshot_from_response(
            query_response(
                "PullRequest",
                12,
                Some("READ"),
                false,
                None,
                Some("UNSUBSCRIBED"),
            ),
            12,
            GitHubConversationKind::PullRequest,
        )
        .expect("pull request snapshot");
        assert!(!pull_request.controls.viewer_can_lock);
        assert_eq!(
            pull_request.controls.kind,
            GitHubConversationKind::PullRequest
        );
    }

    #[test]
    fn snapshot_rejects_a_different_kind_or_number() {
        assert!(conversation_snapshot_from_response(
            query_response("PullRequest", 42, Some("WRITE"), false, None, None),
            42,
            GitHubConversationKind::Issue,
        )
        .is_err());
        assert!(conversation_snapshot_from_response(
            query_response("Issue", 43, Some("WRITE"), false, None, None),
            42,
            GitHubConversationKind::Issue,
        )
        .is_err());
    }

    #[test]
    fn subscription_mutation_uses_and_verifies_the_official_state() {
        let payload = subscription_mutation_payload(
            "I_kwDOexample",
            GitHubConversationSubscriptionAction::Subscribe,
        );
        assert_eq!(payload["variables"]["subscribableId"], "I_kwDOexample");
        assert_eq!(payload["variables"]["state"], "SUBSCRIBED");

        let response: ConversationSubscriptionMutation =
            serde_json::from_value(serde_json::json!({
                "updateSubscription": {
                    "subscribable": {
                        "id": "I_kwDOexample",
                        "viewerCanSubscribe": true,
                        "viewerSubscription": "SUBSCRIBED"
                    }
                }
            }))
            .expect("subscription response");
        assert!(ensure_subscription_mutation_response(
            response,
            "I_kwDOexample",
            GitHubConversationSubscriptionState::Subscribed,
        )
        .is_ok());
    }

    #[test]
    fn lock_action_rejects_reasons_when_unlocking() {
        assert!(ensure_lock_action(
            GitHubConversationLockAction::Lock,
            Some(GitHubConversationLockReason::Resolved),
        )
        .is_ok());
        assert!(ensure_lock_action(
            GitHubConversationLockAction::Unlock,
            Some(GitHubConversationLockReason::Resolved),
        )
        .is_err());
    }

    #[test]
    fn lock_reasons_use_githubs_rest_values() {
        let values = [
            GitHubConversationLockReason::OffTopic,
            GitHubConversationLockReason::TooHeated,
            GitHubConversationLockReason::Resolved,
            GitHubConversationLockReason::Spam,
        ]
        .map(|reason| serde_json::to_value(reason.as_octocrab()).expect("lock reason"));

        assert_eq!(
            values,
            [
                serde_json::json!("off-topic"),
                serde_json::json!("too heated"),
                serde_json::json!("resolved"),
                serde_json::json!("spam"),
            ]
        );
    }
}
