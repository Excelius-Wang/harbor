use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GitHubCommentMinimizeClassifier {
    Spam,
    Abuse,
    OffTopic,
    Outdated,
    Duplicate,
    Resolved,
    LowQuality,
}

impl GitHubCommentMinimizeClassifier {
    pub(crate) fn graphql_name(self) -> &'static str {
        match self {
            Self::Spam => "SPAM",
            Self::Abuse => "ABUSE",
            Self::OffTopic => "OFF_TOPIC",
            Self::Outdated => "OUTDATED",
            Self::Duplicate => "DUPLICATE",
            Self::Resolved => "RESOLVED",
            Self::LowQuality => "LOW_QUALITY",
        }
    }

    pub(crate) fn response_reason(self) -> &'static str {
        match self {
            Self::Spam => "spam",
            Self::Abuse => "abuse",
            Self::OffTopic => "off-topic",
            Self::Outdated => "outdated",
            Self::Duplicate => "duplicate",
            Self::Resolved => "resolved",
            Self::LowQuality => "low-quality",
        }
    }
}

pub(crate) const MINIMIZE_COMMENT_MUTATION: &str = r#"
mutation HarborMinimizeComment(
  $id: ID!
  $classifier: ReportedContentClassifiers!
  $clientMutationId: String!
) {
  minimizeComment(input: {
    subjectId: $id
    classifier: $classifier
    clientMutationId: $clientMutationId
  }) {
    clientMutationId
  }
}
"#;

pub(crate) const UNMINIMIZE_COMMENT_MUTATION: &str = r#"
mutation HarborUnminimizeComment($id: ID!, $clientMutationId: String!) {
  unminimizeComment(input: {
    subjectId: $id
    clientMutationId: $clientMutationId
  }) {
    clientMutationId
  }
}
"#;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MinimizeCommentMutation {
    pub(crate) minimize_comment: Option<CommentMutationPayload>,
    pub(crate) unminimize_comment: Option<CommentMutationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommentMutationPayload {
    pub(crate) client_mutation_id: Option<String>,
}
