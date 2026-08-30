use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{authenticated_client, github_error, GitHubService, OctocrabGitHubClient};
use crate::error::AppError;

const MAX_REACTION_SUBJECTS: usize = 100;
const MAX_REACTION_SUBJECT_ID_BYTES: usize = 256;

const REACTION_SUBJECTS_QUERY: &str = r#"
query HarborReactionSubjects(
  $owner: String!
  $repository: String!
  $ids: [ID!]!
) {
  repository(owner: $owner, name: $repository) { id }
  nodes(ids: $ids) {
    __typename
    ... on Reactable {
      id
      viewerCanReact
      reactionGroups { ...HarborReactionGroup }
    }
    ... on Issue { repository { id } }
    ... on PullRequest { repository { id } }
    ... on IssueComment { repository { id } }
    ... on PullRequestReview { repository { id } }
    ... on PullRequestReviewComment { repository { id } }
    ... on CommitComment { repository { id } }
    ... on Discussion { repository { id } }
    ... on Release { repository { id } }
    ... on DiscussionComment {
      discussion { repository { id } }
    }
  }
}

fragment HarborReactionGroup on ReactionGroup {
  content
  viewerHasReacted
  reactors { totalCount }
}
"#;

const ADD_REACTION_MUTATION: &str = r#"
mutation HarborAddReaction($subjectId: ID!, $content: ReactionContent!) {
  addReaction(input: { subjectId: $subjectId, content: $content }) {
    subject { __typename id viewerCanReact }
    reactionGroups { ...HarborReactionGroup }
  }
}

fragment HarborReactionGroup on ReactionGroup {
  content
  viewerHasReacted
  reactors { totalCount }
}
"#;

const REMOVE_REACTION_MUTATION: &str = r#"
mutation HarborRemoveReaction($subjectId: ID!, $content: ReactionContent!) {
  removeReaction(input: { subjectId: $subjectId, content: $content }) {
    subject { __typename id viewerCanReact }
    reactionGroups { ...HarborReactionGroup }
  }
}

fragment HarborReactionGroup on ReactionGroup {
  content
  viewerHasReacted
  reactors { totalCount }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubReactionSubjectKind {
    Issue,
    PullRequest,
    CommitComment,
    IssueComment,
    PullRequestReview,
    PullRequestReviewComment,
    Discussion,
    DiscussionComment,
    Release,
}

impl GitHubReactionSubjectKind {
    fn as_graphql(self) -> &'static str {
        match self {
            Self::Issue => "Issue",
            Self::PullRequest => "PullRequest",
            Self::CommitComment => "CommitComment",
            Self::IssueComment => "IssueComment",
            Self::PullRequestReview => "PullRequestReview",
            Self::PullRequestReviewComment => "PullRequestReviewComment",
            Self::Discussion => "Discussion",
            Self::DiscussionComment => "DiscussionComment",
            Self::Release => "Release",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReactionSubjectRef {
    pub id: String,
    pub kind: GitHubReactionSubjectKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
pub enum GitHubReactionContent {
    #[serde(rename = "thumbsUp", alias = "THUMBS_UP")]
    ThumbsUp,
    #[serde(rename = "thumbsDown", alias = "THUMBS_DOWN")]
    ThumbsDown,
    #[serde(rename = "laugh", alias = "LAUGH")]
    Laugh,
    #[serde(rename = "hooray", alias = "HOORAY")]
    Hooray,
    #[serde(rename = "confused", alias = "CONFUSED")]
    Confused,
    #[serde(rename = "heart", alias = "HEART")]
    Heart,
    #[serde(rename = "rocket", alias = "ROCKET")]
    Rocket,
    #[serde(rename = "eyes", alias = "EYES")]
    Eyes,
}

impl GitHubReactionContent {
    fn as_graphql(self) -> &'static str {
        match self {
            Self::ThumbsUp => "THUMBS_UP",
            Self::ThumbsDown => "THUMBS_DOWN",
            Self::Laugh => "LAUGH",
            Self::Hooray => "HOORAY",
            Self::Confused => "CONFUSED",
            Self::Heart => "HEART",
            Self::Rocket => "ROCKET",
            Self::Eyes => "EYES",
        }
    }

    fn sort_order(self) -> u8 {
        match self {
            Self::ThumbsUp => 0,
            Self::ThumbsDown => 1,
            Self::Laugh => 2,
            Self::Hooray => 3,
            Self::Confused => 4,
            Self::Heart => 5,
            Self::Rocket => 6,
            Self::Eyes => 7,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReactionGroup {
    pub content: GitHubReactionContent,
    pub count: u64,
    pub viewer_has_reacted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReactionSubject {
    pub id: String,
    pub kind: GitHubReactionSubjectKind,
    pub viewer_can_react: bool,
    pub groups: Vec<GitHubReactionGroup>,
}

#[async_trait]
pub(crate) trait GitHubReactionClient: Send + Sync {
    async fn reaction_subjects(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        subjects: &[GitHubReactionSubjectRef],
    ) -> Result<Vec<GitHubReactionSubject>, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn update_reaction(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        subject: &GitHubReactionSubjectRef,
        content: GitHubReactionContent,
        reacted: bool,
    ) -> Result<GitHubReactionSubject, AppError>;
}

impl GitHubService {
    pub async fn reaction_subjects(
        &self,
        owner: &str,
        repository: &str,
        subjects: &[GitHubReactionSubjectRef],
    ) -> Result<Vec<GitHubReactionSubject>, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .reaction_subjects(&token, owner, repository, subjects)
            .await
    }

    pub async fn update_reaction(
        &self,
        owner: &str,
        repository: &str,
        subject: &GitHubReactionSubjectRef,
        content: GitHubReactionContent,
        reacted: bool,
    ) -> Result<GitHubReactionSubject, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_reaction(&token, owner, repository, subject, content, reacted)
            .await
    }
}

#[async_trait]
impl GitHubReactionClient for OctocrabGitHubClient {
    async fn reaction_subjects(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        subjects: &[GitHubReactionSubjectRef],
    ) -> Result<Vec<GitHubReactionSubject>, AppError> {
        let subjects = normalize_reaction_subjects(subjects.to_vec())?;
        reaction_subjects_with_client(token, owner, repository, &subjects).await
    }

    async fn update_reaction(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        subject: &GitHubReactionSubjectRef,
        content: GitHubReactionContent,
        reacted: bool,
    ) -> Result<GitHubReactionSubject, AppError> {
        let requested_subject = normalize_reaction_subject(subject.clone())?;
        ensure_reaction_content_supported(requested_subject.kind, content)?;
        let current = reaction_subjects_with_client(
            token,
            owner,
            repository,
            std::slice::from_ref(&requested_subject),
        )
        .await?
        .into_iter()
        .find(|candidate| {
            candidate.id == requested_subject.id && candidate.kind == requested_subject.kind
        })
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the requested reaction subject".to_string())
        })?;
        let viewer_has_reacted = current
            .groups
            .iter()
            .find(|group| group.content == content)
            .is_some_and(|group| group.viewer_has_reacted);
        if viewer_has_reacted == reacted {
            return Ok(current);
        }
        if reacted && !current.viewer_can_react {
            return Err(AppError::GitHubPermission(
                "GitHub does not allow the viewer to react to this subject".to_string(),
            ));
        }

        let client = authenticated_client(token)?;
        let query = if reacted {
            ADD_REACTION_MUTATION
        } else {
            REMOVE_REACTION_MUTATION
        };
        let payload = serde_json::json!({
            "query": query,
            "variables": {
                "subjectId": requested_subject.id,
                "content": content.as_graphql(),
            }
        });
        let response: UpdateReactionMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let mutation = if reacted {
            response.add_reaction
        } else {
            response.remove_reaction
        }
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the reaction mutation".to_string())
        })?;
        let returned_subject = mutation.subject.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the updated reaction subject".to_string())
        })?;
        if returned_subject.id != current.id
            || returned_subject.type_name != current.kind.as_graphql()
        {
            return Err(AppError::GitHub(
                "GitHub returned a different reaction subject".to_string(),
            ));
        }
        let reaction_groups = mutation.reaction_groups.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the updated reaction groups".to_string())
        })?;
        let result = GitHubReactionSubject {
            id: returned_subject.id,
            kind: current.kind,
            viewer_can_react: returned_subject.viewer_can_react,
            groups: reaction_groups_from_graphql(reaction_groups)?,
        };
        let returned_state = result
            .groups
            .iter()
            .find(|group| group.content == content)
            .is_some_and(|group| group.viewer_has_reacted);
        if returned_state != reacted {
            return Err(AppError::GitHub(
                "GitHub did not apply the requested reaction state".to_string(),
            ));
        }
        Ok(result)
    }
}

pub(crate) fn normalize_reaction_subjects(
    subjects: Vec<GitHubReactionSubjectRef>,
) -> Result<Vec<GitHubReactionSubjectRef>, AppError> {
    if subjects.is_empty() {
        return Err(AppError::Validation(
            "at least one reaction subject is required".to_string(),
        ));
    }
    if subjects.len() > MAX_REACTION_SUBJECTS {
        return Err(AppError::Validation(format!(
            "at most {MAX_REACTION_SUBJECTS} reaction subjects may be loaded at once"
        )));
    }
    let mut normalized = Vec::with_capacity(subjects.len());
    for subject in subjects {
        let subject = normalize_reaction_subject(subject)?;
        if let Some(existing) = normalized
            .iter()
            .find(|existing: &&GitHubReactionSubjectRef| existing.id == subject.id)
        {
            if existing.kind != subject.kind {
                return Err(AppError::Validation(
                    "reaction subject ID was provided with conflicting kinds".to_string(),
                ));
            }
        } else {
            normalized.push(subject);
        }
    }
    Ok(normalized)
}

pub(crate) fn normalize_reaction_subject(
    mut subject: GitHubReactionSubjectRef,
) -> Result<GitHubReactionSubjectRef, AppError> {
    let subject_id = subject.id.trim();
    if subject_id.is_empty()
        || subject_id.len() > MAX_REACTION_SUBJECT_ID_BYTES
        || subject_id.chars().any(char::is_whitespace)
        || subject_id.chars().any(char::is_control)
    {
        return Err(AppError::Validation(
            "reaction subject ID is invalid".to_string(),
        ));
    }
    subject.id = subject_id.to_string();
    Ok(subject)
}

fn ensure_reaction_content_supported(
    kind: GitHubReactionSubjectKind,
    content: GitHubReactionContent,
) -> Result<(), AppError> {
    if kind == GitHubReactionSubjectKind::Release
        && matches!(
            content,
            GitHubReactionContent::ThumbsDown | GitHubReactionContent::Confused
        )
    {
        return Err(AppError::Validation(
            "GitHub Releases do not support this reaction".to_string(),
        ));
    }
    Ok(())
}

async fn reaction_subjects_with_client(
    token: &str,
    owner: &str,
    repository: &str,
    subjects: &[GitHubReactionSubjectRef],
) -> Result<Vec<GitHubReactionSubject>, AppError> {
    let client = authenticated_client(token)?;
    let payload = serde_json::json!({
        "query": REACTION_SUBJECTS_QUERY,
        "variables": {
            "owner": owner,
            "repository": repository,
            "ids": subjects.iter().map(|subject| &subject.id).collect::<Vec<_>>(),
        },
    });
    let response: ReactionSubjectsQuery = client.graphql(&payload).await.map_err(github_error)?;
    let repository_id = response
        .repository
        .map(|repository| repository.id)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the selected reaction repository".to_string())
        })?;
    if response.nodes.len() != subjects.len() {
        return Err(AppError::GitHub(
            "GitHub returned an incomplete reaction subject list".to_string(),
        ));
    }
    response
        .nodes
        .into_iter()
        .zip(subjects)
        .filter_map(|(subject, expected)| {
            subject.map(|subject| reaction_subject_from_graphql(subject, expected, &repository_id))
        })
        .collect()
}

fn reaction_subject_from_graphql(
    subject: ReactionSubjectNode,
    expected: &GitHubReactionSubjectRef,
    repository_id: &str,
) -> Result<GitHubReactionSubject, AppError> {
    if subject.id != expected.id || subject.type_name != expected.kind.as_graphql() {
        return Err(AppError::Validation(
            "reaction subject kind does not match the requested subject".to_string(),
        ));
    }
    let subject_repository_id = if expected.kind == GitHubReactionSubjectKind::DiscussionComment {
        subject
            .discussion
            .and_then(|discussion| discussion.repository)
            .map(|repository| repository.id)
    } else {
        subject.repository.map(|repository| repository.id)
    }
    .ok_or_else(|| {
        AppError::GitHub("GitHub did not return the reaction subject repository".to_string())
    })?;
    if subject_repository_id != repository_id {
        return Err(AppError::Validation(
            "reaction subject does not belong to the selected repository".to_string(),
        ));
    }

    Ok(GitHubReactionSubject {
        id: subject.id,
        kind: expected.kind,
        viewer_can_react: subject.viewer_can_react,
        groups: reaction_groups_from_graphql(subject.reaction_groups.unwrap_or_default())?,
    })
}

fn reaction_groups_from_graphql(
    groups: Vec<ReactionGroupNode>,
) -> Result<Vec<GitHubReactionGroup>, AppError> {
    let mut result = Vec::with_capacity(groups.len());
    for group in groups {
        if result
            .iter()
            .any(|existing: &GitHubReactionGroup| existing.content == group.content)
        {
            return Err(AppError::GitHub(
                "GitHub returned duplicate reaction groups".to_string(),
            ));
        }
        if group.viewer_has_reacted && group.reactors.total_count == 0 {
            return Err(AppError::GitHub(
                "GitHub returned an inconsistent reaction group".to_string(),
            ));
        }
        if group.reactors.total_count > 0 || group.viewer_has_reacted {
            result.push(GitHubReactionGroup {
                content: group.content,
                count: group.reactors.total_count,
                viewer_has_reacted: group.viewer_has_reacted,
            });
        }
    }
    result.sort_by_key(|group| group.content.sort_order());
    Ok(result)
}

#[derive(Deserialize)]
struct ReactionSubjectsQuery {
    repository: Option<ReactionRepositoryNode>,
    nodes: Vec<Option<ReactionSubjectNode>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReactionSubjectNode {
    #[serde(rename = "__typename")]
    type_name: String,
    id: String,
    viewer_can_react: bool,
    reaction_groups: Option<Vec<ReactionGroupNode>>,
    repository: Option<ReactionRepositoryNode>,
    discussion: Option<ReactionDiscussionNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReactionRepositoryNode {
    id: String,
}

#[derive(Deserialize)]
struct ReactionDiscussionNode {
    repository: Option<ReactionRepositoryNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReactionGroupNode {
    content: GitHubReactionContent,
    viewer_has_reacted: bool,
    reactors: ReactionReactorsNode,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReactionReactorsNode {
    total_count: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateReactionMutation {
    add_reaction: Option<UpdateReactionPayload>,
    remove_reaction: Option<UpdateReactionPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateReactionPayload {
    subject: Option<UpdatedReactionSubjectNode>,
    reaction_groups: Option<Vec<ReactionGroupNode>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatedReactionSubjectNode {
    #[serde(rename = "__typename")]
    type_name: String,
    id: String,
    viewer_can_react: bool,
}

#[cfg(test)]
mod tests;
