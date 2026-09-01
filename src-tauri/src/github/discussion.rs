use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client,
    discussion_comment_minimize::{
        mutate_discussion_comment as mutate_discussion_comment_backend,
        GitHubDiscussionCommentMutation,
    },
    github_error, GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const DISCUSSION_PAGE_SIZE: i32 = 30;
const DISCUSSION_REPLY_PAGE_SIZE: i32 = 100;

const DISCUSSION_SUMMARY_FRAGMENT: &str = r#"
fragment HarborDiscussionSummary on Discussion {
  id
  number
  title
  body
  url
  closed
  stateReason
  locked
  author { login avatarUrl }
  authorAssociation
  category { id name slug description emoji isAnswerable }
  answer { id }
  answerChosenAt
  answerChosenBy { login }
  commentSummary: comments { totalCount }
  createdAt
  updatedAt
  upvoteCount
  viewerCanClose
  viewerCanDelete
  viewerCanReopen
  viewerCanUpdate
  viewerCanUpvote
  viewerDidAuthor
  viewerHasUpvoted
}
"#;

const DISCUSSION_COMMENT_FRAGMENT: &str = r#"
fragment HarborDiscussionComment on DiscussionComment {
  id
  body
  url
  author { login avatarUrl }
  authorAssociation
  createdAt
  updatedAt
  isAnswer
  isMinimized
  minimizedReason
  deletedAt
  upvoteCount
  viewerCanDelete
  viewerCanMarkAsAnswer
  viewerCanUnmarkAsAnswer
  viewerCanUpdate
  viewerCanUpvote
  viewerCanMinimize
  viewerCanUnminimize
  viewerDidAuthor
  viewerHasUpvoted
}
"#;

const DISCUSSION_POLL_FRAGMENT: &str = r#"
fragment HarborDiscussionPoll on DiscussionPoll {
  id
  question
  totalVoteCount
  viewerCanVote
  viewerHasVoted
  options(
    first: 100
    orderBy: { field: AUTHORED_ORDER, direction: ASC }
  ) {
    nodes { id option totalVoteCount viewerHasVoted }
  }
}
"#;

const DISCUSSION_CATEGORIES_QUERY: &str = r#"
query HarborDiscussionCategories($owner: String!, $repository: String!) {
  repository(owner: $owner, name: $repository) {
    id
    hasDiscussionsEnabled
    discussionCategories(first: 100) {
      nodes { id name slug description emoji isAnswerable }
    }
  }
}
"#;

const DISCUSSIONS_QUERY: &str = r#"
query HarborDiscussions(
  $owner: String!
  $repository: String!
  $categoryId: ID
  $answered: Boolean
  $states: [DiscussionState!]
  $orderBy: DiscussionOrder!
  $after: String
  $first: Int!
) {
  repository(owner: $owner, name: $repository) {
    hasDiscussionsEnabled
    discussions(
      first: $first
      after: $after
      categoryId: $categoryId
      answered: $answered
      states: $states
      orderBy: $orderBy
    ) {
      totalCount
      pageInfo { endCursor hasNextPage }
      nodes { ...HarborDiscussionSummary }
    }
  }
}
"#;

const DISCUSSION_DETAIL_QUERY: &str = r#"
query HarborDiscussionDetail(
  $owner: String!
  $repository: String!
  $number: Int!
  $after: String
  $first: Int!
  $replyFirst: Int!
) {
  repository(owner: $owner, name: $repository) {
    discussion(number: $number) {
      ...HarborDiscussionSummary
      poll { ...HarborDiscussionPoll }
      comments(first: $first, after: $after) {
        totalCount
        pageInfo { endCursor hasNextPage }
        nodes {
          ...HarborDiscussionComment
          replies(first: $replyFirst) {
            totalCount
            pageInfo { hasNextPage }
            nodes { ...HarborDiscussionComment }
          }
        }
      }
    }
  }
}
"#;

const DISCUSSION_POLL_SNAPSHOT_QUERY: &str = r#"
query HarborDiscussionPollSnapshot($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    discussion(number: $number) {
      ...HarborDiscussionSummary
      poll { ...HarborDiscussionPoll }
    }
  }
}
"#;

const DISCUSSION_COMMENT_SNAPSHOT_QUERY: &str = r#"
query HarborDiscussionCommentSnapshot($commentId: ID!) {
  node(id: $commentId) {
    __typename
    ... on DiscussionComment {
      id
      deletedAt
      viewerCanDelete
      replyTo { id }
      replies { totalCount }
      discussion {
        number
        repository { nameWithOwner }
      }
    }
  }
}
"#;

const DISCUSSION_SNAPSHOT_QUERY: &str = r#"
query HarborDiscussionSnapshot($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    discussion(number: $number) { ...HarborDiscussionSummary }
  }
}
"#;

const CREATE_DISCUSSION_MUTATION: &str = r#"
mutation HarborCreateDiscussion(
  $repositoryId: ID!
  $categoryId: ID!
  $title: String!
  $body: String!
) {
  createDiscussion(input: {
    repositoryId: $repositoryId
    categoryId: $categoryId
    title: $title
    body: $body
  }) {
    discussion { ...HarborDiscussionSummary }
  }
}
"#;

const UPDATE_DISCUSSION_MUTATION: &str = r#"
mutation HarborUpdateDiscussion(
  $discussionId: ID!
  $categoryId: ID!
  $title: String!
  $body: String!
) {
  updateDiscussion(input: {
    discussionId: $discussionId
    categoryId: $categoryId
    title: $title
    body: $body
  }) {
    discussion { ...HarborDiscussionSummary }
  }
}
"#;

const ADD_DISCUSSION_COMMENT_MUTATION: &str = r#"
mutation HarborAddDiscussionComment(
  $discussionId: ID!
  $replyToId: ID
  $body: String!
) {
  addDiscussionComment(input: {
    discussionId: $discussionId
    replyToId: $replyToId
    body: $body
  }) {
    comment { ...HarborDiscussionComment }
  }
}
"#;

const UPDATE_DISCUSSION_COMMENT_MUTATION: &str = r#"
mutation HarborUpdateDiscussionComment($commentId: ID!, $body: String!) {
  updateDiscussionComment(input: { commentId: $commentId, body: $body }) {
    comment { ...HarborDiscussionComment }
  }
}
"#;

const CLOSE_DISCUSSION_MUTATION: &str = r#"
mutation HarborCloseDiscussion($discussionId: ID!, $reason: DiscussionCloseReason!) {
  closeDiscussion(input: { discussionId: $discussionId, reason: $reason }) {
    discussion { ...HarborDiscussionSummary }
  }
}
"#;

const REOPEN_DISCUSSION_MUTATION: &str = r#"
mutation HarborReopenDiscussion($discussionId: ID!) {
  reopenDiscussion(input: { discussionId: $discussionId }) {
    discussion { ...HarborDiscussionSummary }
  }
}
"#;

const ADD_UPVOTE_MUTATION: &str = r#"
mutation HarborAddDiscussionUpvote($subjectId: ID!) {
  addUpvote(input: { subjectId: $subjectId }) {
    subject {
      ... on Discussion { id upvoteCount viewerCanUpvote viewerHasUpvoted }
      ... on DiscussionComment { id upvoteCount viewerCanUpvote viewerHasUpvoted }
    }
  }
}
"#;

const REMOVE_UPVOTE_MUTATION: &str = r#"
mutation HarborRemoveDiscussionUpvote($subjectId: ID!) {
  removeUpvote(input: { subjectId: $subjectId }) {
    subject {
      ... on Discussion { id upvoteCount viewerCanUpvote viewerHasUpvoted }
      ... on DiscussionComment { id upvoteCount viewerCanUpvote viewerHasUpvoted }
    }
  }
}
"#;

const MARK_DISCUSSION_ANSWER_MUTATION: &str = r#"
mutation HarborMarkDiscussionAnswer($commentId: ID!) {
  markDiscussionCommentAsAnswer(input: { id: $commentId }) {
    discussion { ...HarborDiscussionSummary }
  }
}
"#;

const UNMARK_DISCUSSION_ANSWER_MUTATION: &str = r#"
mutation HarborUnmarkDiscussionAnswer($commentId: ID!) {
  unmarkDiscussionCommentAsAnswer(input: { id: $commentId }) {
    discussion { ...HarborDiscussionSummary }
  }
}
"#;

const ADD_DISCUSSION_POLL_VOTE_MUTATION: &str = r#"
mutation HarborAddDiscussionPollVote($pollOptionId: ID!) {
  addDiscussionPollVote(input: { pollOptionId: $pollOptionId }) {
    pollOption {
      id
      poll { ...HarborDiscussionPoll }
    }
  }
}
"#;

const DELETE_DISCUSSION_MUTATION: &str = r#"
mutation HarborDeleteDiscussion($discussionId: ID!) {
  deleteDiscussion(input: { id: $discussionId }) {
    discussion { id number }
  }
}
"#;

const DELETE_DISCUSSION_COMMENT_MUTATION: &str = r#"
mutation HarborDeleteDiscussionComment($commentId: ID!) {
  deleteDiscussionComment(input: { id: $commentId }) {
    comment { id deletedAt }
  }
}
"#;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubDiscussionState {
    Open,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubDiscussionStateFilter {
    All,
    Open,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubDiscussionAnsweredFilter {
    All,
    Answered,
    Unanswered,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubDiscussionSort {
    Updated,
    Created,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubDiscussionCloseReason {
    Resolved,
    Outdated,
    Duplicate,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubDiscussionFilters {
    pub category_id: Option<String>,
    pub state: GitHubDiscussionStateFilter,
    pub answered: GitHubDiscussionAnsweredFilter,
    pub sort: GitHubDiscussionSort,
    pub after: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionCategory {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub emoji: String,
    pub is_answerable: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionCategoryPage {
    pub enabled: bool,
    pub repository_id: String,
    pub categories: Vec<GitHubDiscussionCategory>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionSummary {
    pub id: String,
    pub number: u64,
    pub title: String,
    pub body: String,
    pub url: String,
    pub state: GitHubDiscussionState,
    pub state_reason: Option<String>,
    pub locked: bool,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub author_association: String,
    pub category: GitHubDiscussionCategory,
    pub answer_id: Option<String>,
    pub answer_chosen_at: Option<String>,
    pub answer_chosen_by: Option<String>,
    pub comment_count: u64,
    pub upvote_count: u64,
    pub created_at: String,
    pub updated_at: String,
    pub viewer_can_close: bool,
    pub viewer_can_delete: bool,
    pub viewer_can_reopen: bool,
    pub viewer_can_update: bool,
    pub viewer_can_upvote: bool,
    pub viewer_did_author: bool,
    pub viewer_has_upvoted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionPage {
    pub enabled: bool,
    pub discussions: Vec<GitHubDiscussionSummary>,
    pub total_count: u64,
    pub end_cursor: Option<String>,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionComment {
    pub id: String,
    pub body: String,
    pub url: String,
    pub author: Option<String>,
    pub author_avatar_url: Option<String>,
    pub author_association: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_answer: bool,
    pub is_minimized: bool,
    pub minimized_reason: Option<String>,
    pub deleted_at: Option<String>,
    pub upvote_count: u64,
    pub viewer_can_delete: bool,
    pub viewer_can_mark_as_answer: bool,
    pub viewer_can_unmark_as_answer: bool,
    pub viewer_can_update: bool,
    pub viewer_can_upvote: bool,
    pub viewer_can_minimize: bool,
    pub viewer_can_unminimize: bool,
    pub viewer_did_author: bool,
    pub viewer_has_upvoted: bool,
    pub replies: Vec<GitHubDiscussionComment>,
    pub replies_have_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionPollOption {
    pub id: String,
    pub option: String,
    pub total_vote_count: u64,
    pub viewer_has_voted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionPoll {
    pub id: String,
    pub question: String,
    pub total_vote_count: u64,
    pub viewer_can_vote: bool,
    pub viewer_has_voted: bool,
    pub options: Vec<GitHubDiscussionPollOption>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionDetailPage {
    pub discussion: GitHubDiscussionSummary,
    pub poll: Option<GitHubDiscussionPoll>,
    pub comments: Vec<GitHubDiscussionComment>,
    pub comment_count: u64,
    pub end_cursor: Option<String>,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionVote {
    pub subject_id: String,
    pub upvote_count: u64,
    pub viewer_can_upvote: bool,
    pub viewer_has_upvoted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionDeletion {
    pub discussion_id: String,
    pub discussion_number: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubDiscussionCommentDeletion {
    pub comment_id: String,
    pub reply_to_id: Option<String>,
    pub deleted_at: Option<String>,
    pub preserved: bool,
}

#[async_trait]
pub(crate) trait GitHubDiscussionClient: Send + Sync {
    async fn discussion_categories(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubDiscussionCategoryPage, AppError>;

    async fn discussions(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubDiscussionFilters,
    ) -> Result<GitHubDiscussionPage, AppError>;

    async fn discussion_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        after: Option<&str>,
    ) -> Result<GitHubDiscussionDetailPage, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn create_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn update_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError>;

    #[allow(clippy::too_many_arguments)]
    async fn create_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        reply_to_id: Option<&str>,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError>;

    async fn update_discussion_comment(
        &self,
        token: &str,
        comment_id: &str,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError>;

    async fn mutate_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        mutation: &GitHubDiscussionCommentMutation,
    ) -> Result<(), AppError>;

    async fn update_discussion_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        state: GitHubDiscussionState,
        close_reason: Option<GitHubDiscussionCloseReason>,
    ) -> Result<GitHubDiscussionSummary, AppError>;

    async fn update_discussion_upvote(
        &self,
        token: &str,
        subject_id: &str,
        upvoted: bool,
    ) -> Result<GitHubDiscussionVote, AppError>;

    async fn update_discussion_answer(
        &self,
        token: &str,
        comment_id: &str,
        answered: bool,
    ) -> Result<GitHubDiscussionSummary, AppError>;

    async fn add_discussion_poll_vote(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        poll_option_id: &str,
    ) -> Result<GitHubDiscussionPoll, AppError>;

    async fn delete_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
    ) -> Result<GitHubDiscussionDeletion, AppError>;

    async fn delete_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        comment_id: &str,
    ) -> Result<GitHubDiscussionCommentDeletion, AppError>;
}

impl GitHubService {
    pub async fn discussion_categories(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubDiscussionCategoryPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .discussion_categories(&token, owner, repository)
            .await
    }

    pub async fn discussions(
        &self,
        owner: &str,
        repository: &str,
        filters: &GitHubDiscussionFilters,
    ) -> Result<GitHubDiscussionPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .discussions(&token, owner, repository, filters)
            .await
    }

    pub async fn discussion_detail(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        after: Option<&str>,
    ) -> Result<GitHubDiscussionDetailPage, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .discussion_detail(&token, owner, repository, discussion_number, after)
            .await
    }

    pub async fn create_discussion(
        &self,
        owner: &str,
        repository: &str,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_discussion(&token, owner, repository, category_id, title, body)
            .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn update_discussion(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_discussion(
                &token,
                owner,
                repository,
                discussion_number,
                category_id,
                title,
                body,
            )
            .await
    }

    pub async fn create_discussion_comment(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        reply_to_id: Option<&str>,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .create_discussion_comment(
                &token,
                owner,
                repository,
                discussion_number,
                reply_to_id,
                body,
            )
            .await
    }

    pub async fn update_discussion_comment(
        &self,
        comment_id: &str,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_discussion_comment(&token, comment_id, body)
            .await
    }

    pub async fn mutate_discussion_comment(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        mutation: &GitHubDiscussionCommentMutation,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .mutate_discussion_comment(&token, owner, repository, discussion_number, mutation)
            .await
    }

    pub async fn update_discussion_state(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        state: GitHubDiscussionState,
        close_reason: Option<GitHubDiscussionCloseReason>,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_discussion_state(
                &token,
                owner,
                repository,
                discussion_number,
                state,
                close_reason,
            )
            .await
    }

    pub async fn update_discussion_upvote(
        &self,
        subject_id: &str,
        upvoted: bool,
    ) -> Result<GitHubDiscussionVote, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_discussion_upvote(&token, subject_id, upvoted)
            .await
    }

    pub async fn update_discussion_answer(
        &self,
        comment_id: &str,
        answered: bool,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_discussion_answer(&token, comment_id, answered)
            .await
    }

    pub async fn add_discussion_poll_vote(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        poll_option_id: &str,
    ) -> Result<GitHubDiscussionPoll, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .add_discussion_poll_vote(&token, owner, repository, discussion_number, poll_option_id)
            .await
    }

    pub async fn delete_discussion(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
    ) -> Result<GitHubDiscussionDeletion, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_discussion(&token, owner, repository, discussion_number)
            .await
    }

    pub async fn delete_discussion_comment(
        &self,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        comment_id: &str,
    ) -> Result<GitHubDiscussionCommentDeletion, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .delete_discussion_comment(&token, owner, repository, discussion_number, comment_id)
            .await
    }
}

#[async_trait]
impl GitHubDiscussionClient for OctocrabGitHubClient {
    async fn discussion_categories(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubDiscussionCategoryPage, AppError> {
        let client = authenticated_client(token)?;
        let payload = serde_json::json!({
            "query": DISCUSSION_CATEGORIES_QUERY,
            "variables": { "owner": owner, "repository": repository }
        });
        let response: DiscussionCategoriesQuery =
            client.graphql(&payload).await.map_err(github_error)?;
        discussion_categories_from_graphql(response)
    }

    async fn discussions(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        filters: &GitHubDiscussionFilters,
    ) -> Result<GitHubDiscussionPage, AppError> {
        let client = authenticated_client(token)?;
        let payload = discussions_payload(owner, repository, filters);
        let response: DiscussionsQuery = client.graphql(&payload).await.map_err(github_error)?;
        discussion_page_from_graphql(response)
    }

    async fn discussion_detail(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        after: Option<&str>,
    ) -> Result<GitHubDiscussionDetailPage, AppError> {
        let client = authenticated_client(token)?;
        fetch_discussion_detail(&client, owner, repository, discussion_number, after).await
    }

    async fn create_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let client = authenticated_client(token)?;
        let categories = fetch_discussion_categories(&client, owner, repository).await?;
        ensure_discussion_category(&categories, category_id)?;
        if !categories.enabled {
            return Err(AppError::Validation(
                "discussions are disabled for this repository".to_string(),
            ));
        }
        let payload = graphql_payload(
            CREATE_DISCUSSION_MUTATION,
            serde_json::json!({
                "repositoryId": categories.repository_id,
                "categoryId": category_id,
                "title": title,
                "body": body,
            }),
            true,
        );
        let response: DiscussionMutation = client.graphql(&payload).await.map_err(github_error)?;
        discussion_from_mutation(response.create_discussion, "created")
    }

    async fn update_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        category_id: &str,
        title: &str,
        body: &str,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let client = authenticated_client(token)?;
        let current =
            fetch_discussion_summary(&client, owner, repository, discussion_number).await?;
        if !current.viewer_can_update {
            return Err(AppError::GitHubPermission(
                "the signed-in account cannot update this discussion".to_string(),
            ));
        }
        let categories = fetch_discussion_categories(&client, owner, repository).await?;
        ensure_discussion_category(&categories, category_id)?;
        let payload = graphql_payload(
            UPDATE_DISCUSSION_MUTATION,
            serde_json::json!({
                "discussionId": current.id,
                "categoryId": category_id,
                "title": title,
                "body": body,
            }),
            true,
        );
        let response: DiscussionMutation = client.graphql(&payload).await.map_err(github_error)?;
        discussion_from_mutation(response.update_discussion, "updated")
    }

    async fn create_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        reply_to_id: Option<&str>,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError> {
        let client = authenticated_client(token)?;
        let discussion =
            fetch_discussion_summary(&client, owner, repository, discussion_number).await?;
        if discussion.state == GitHubDiscussionState::Closed || discussion.locked {
            return Err(AppError::Validation(
                "closed or locked discussions cannot receive comments".to_string(),
            ));
        }
        let payload = graphql_payload(
            ADD_DISCUSSION_COMMENT_MUTATION,
            serde_json::json!({
                "discussionId": discussion.id,
                "replyToId": reply_to_id,
                "body": body,
            }),
            false,
        );
        let response: DiscussionCommentMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        discussion_comment_from_mutation(response.add_discussion_comment, "created")
    }

    async fn update_discussion_comment(
        &self,
        token: &str,
        comment_id: &str,
        body: &str,
    ) -> Result<GitHubDiscussionComment, AppError> {
        let client = authenticated_client(token)?;
        let payload = graphql_payload(
            UPDATE_DISCUSSION_COMMENT_MUTATION,
            serde_json::json!({ "commentId": comment_id, "body": body }),
            false,
        );
        let response: DiscussionCommentMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        discussion_comment_from_mutation(response.update_discussion_comment, "updated")
    }

    async fn mutate_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        mutation: &GitHubDiscussionCommentMutation,
    ) -> Result<(), AppError> {
        mutate_discussion_comment_backend(token, owner, repository, discussion_number, mutation)
            .await
    }

    async fn update_discussion_state(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        state: GitHubDiscussionState,
        close_reason: Option<GitHubDiscussionCloseReason>,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let client = authenticated_client(token)?;
        let current =
            fetch_discussion_summary(&client, owner, repository, discussion_number).await?;
        if current.state == state {
            return Ok(current);
        }
        let (query, variables) = match state {
            GitHubDiscussionState::Open => {
                if !current.viewer_can_reopen {
                    return Err(AppError::GitHubPermission(
                        "the signed-in account cannot reopen this discussion".to_string(),
                    ));
                }
                (
                    REOPEN_DISCUSSION_MUTATION,
                    serde_json::json!({ "discussionId": current.id }),
                )
            }
            GitHubDiscussionState::Closed => {
                if !current.viewer_can_close {
                    return Err(AppError::GitHubPermission(
                        "the signed-in account cannot close this discussion".to_string(),
                    ));
                }
                let reason = close_reason.ok_or_else(|| {
                    AppError::Validation("a discussion close reason is required".to_string())
                })?;
                (
                    CLOSE_DISCUSSION_MUTATION,
                    serde_json::json!({
                        "discussionId": current.id,
                        "reason": discussion_close_reason_graphql(reason),
                    }),
                )
            }
        };
        let payload = graphql_payload(query, variables, true);
        let response: DiscussionMutation = client.graphql(&payload).await.map_err(github_error)?;
        let payload = match state {
            GitHubDiscussionState::Open => response.reopen_discussion,
            GitHubDiscussionState::Closed => response.close_discussion,
        };
        discussion_from_mutation(payload, "changed state for")
    }

    async fn update_discussion_upvote(
        &self,
        token: &str,
        subject_id: &str,
        upvoted: bool,
    ) -> Result<GitHubDiscussionVote, AppError> {
        let client = authenticated_client(token)?;
        let query = if upvoted {
            ADD_UPVOTE_MUTATION
        } else {
            REMOVE_UPVOTE_MUTATION
        };
        let payload = serde_json::json!({
            "query": query,
            "variables": { "subjectId": subject_id }
        });
        let response: DiscussionVoteMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let subject = if upvoted {
            response.add_upvote.and_then(|payload| payload.subject)
        } else {
            response.remove_upvote.and_then(|payload| payload.subject)
        }
        .ok_or_else(|| AppError::GitHub("GitHub did not return the updated upvote".to_string()))?;
        if subject.id != subject_id || subject.viewer_has_upvoted != upvoted {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected upvote state".to_string(),
            ));
        }
        Ok(subject.into())
    }

    async fn update_discussion_answer(
        &self,
        token: &str,
        comment_id: &str,
        answered: bool,
    ) -> Result<GitHubDiscussionSummary, AppError> {
        let client = authenticated_client(token)?;
        let query = if answered {
            MARK_DISCUSSION_ANSWER_MUTATION
        } else {
            UNMARK_DISCUSSION_ANSWER_MUTATION
        };
        let payload = graphql_payload(query, serde_json::json!({ "commentId": comment_id }), true);
        let response: DiscussionAnswerMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let discussion = if answered {
            response
                .mark_discussion_comment_as_answer
                .and_then(|payload| payload.discussion)
        } else {
            response
                .unmark_discussion_comment_as_answer
                .and_then(|payload| payload.discussion)
        }
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the discussion answer state".to_string())
        })?;
        let discussion = discussion_summary_from_graphql(discussion);
        let answer_matches = discussion.answer_id.as_deref() == Some(comment_id);
        if answer_matches != answered {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected discussion answer".to_string(),
            ));
        }
        Ok(discussion)
    }

    async fn add_discussion_poll_vote(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        poll_option_id: &str,
    ) -> Result<GitHubDiscussionPoll, AppError> {
        let client = authenticated_client(token)?;
        let current = fetch_discussion_poll(&client, owner, repository, discussion_number).await?;
        let option = current
            .options
            .iter()
            .find(|option| option.id == poll_option_id)
            .ok_or_else(|| {
                AppError::Validation(
                    "the selected poll option does not belong to this discussion".to_string(),
                )
            })?;
        if option.viewer_has_voted {
            return Ok(current);
        }
        if !current.viewer_can_vote {
            return Err(AppError::GitHubPermission(
                "the signed-in account cannot vote in this discussion poll".to_string(),
            ));
        }

        let payload = graphql_payload(
            ADD_DISCUSSION_POLL_VOTE_MUTATION,
            serde_json::json!({ "pollOptionId": poll_option_id }),
            false,
        );
        let response: DiscussionPollVoteMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let poll_option = response
            .add_discussion_poll_vote
            .and_then(|payload| payload.poll_option)
            .ok_or_else(|| {
                AppError::GitHub("GitHub did not return the updated poll option".to_string())
            })?;
        if poll_option.id != poll_option_id {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected poll option".to_string(),
            ));
        }
        let poll = poll_option.poll.ok_or_else(|| {
            AppError::GitHub("GitHub did not return the updated discussion poll".to_string())
        })?;
        let poll = discussion_poll_from_graphql(poll);
        if poll.id != current.id
            || !poll.viewer_has_voted
            || !poll
                .options
                .iter()
                .any(|option| option.id == poll_option_id && option.viewer_has_voted)
        {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected discussion poll vote".to_string(),
            ));
        }
        Ok(poll)
    }

    async fn delete_discussion(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
    ) -> Result<GitHubDiscussionDeletion, AppError> {
        let client = authenticated_client(token)?;
        let current =
            fetch_discussion_summary(&client, owner, repository, discussion_number).await?;
        if !current.viewer_can_delete {
            return Err(AppError::GitHubPermission(
                "the signed-in account cannot delete this discussion".to_string(),
            ));
        }
        let payload = serde_json::json!({
            "query": DELETE_DISCUSSION_MUTATION,
            "variables": { "discussionId": current.id }
        });
        let response: DeleteDiscussionMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let deleted = response
            .delete_discussion
            .and_then(|payload| payload.discussion)
            .ok_or_else(|| {
                AppError::GitHub("GitHub did not return the deleted discussion".to_string())
            })?;
        if deleted.id != current.id || deleted.number != discussion_number {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected deleted discussion".to_string(),
            ));
        }
        Ok(GitHubDiscussionDeletion {
            discussion_id: deleted.id,
            discussion_number: deleted.number,
        })
    }

    async fn delete_discussion_comment(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        discussion_number: u64,
        comment_id: &str,
    ) -> Result<GitHubDiscussionCommentDeletion, AppError> {
        let client = authenticated_client(token)?;
        let snapshot = fetch_discussion_comment_snapshot(&client, comment_id).await?;
        let snapshot = validate_discussion_comment_snapshot(
            snapshot,
            owner,
            repository,
            discussion_number,
            comment_id,
        )?;
        if !snapshot.viewer_can_delete {
            return Err(AppError::GitHubPermission(
                "the signed-in account cannot delete this discussion comment".to_string(),
            ));
        }

        let payload = serde_json::json!({
            "query": DELETE_DISCUSSION_COMMENT_MUTATION,
            "variables": { "commentId": comment_id }
        });
        let response: DeleteDiscussionCommentMutation =
            client.graphql(&payload).await.map_err(github_error)?;
        let deleted = response
            .delete_discussion_comment
            .and_then(|payload| payload.comment)
            .ok_or_else(|| {
                AppError::GitHub("GitHub did not return the deleted discussion comment".to_string())
            })?;
        if deleted.id != comment_id {
            return Err(AppError::GitHub(
                "GitHub returned an unexpected deleted discussion comment".to_string(),
            ));
        }
        Ok(GitHubDiscussionCommentDeletion {
            comment_id: deleted.id,
            reply_to_id: snapshot.reply_to.map(|reply| reply.id),
            deleted_at: deleted.deleted_at,
            preserved: snapshot.replies.total_count > 0,
        })
    }
}

async fn fetch_discussion_categories(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubDiscussionCategoryPage, AppError> {
    let payload = serde_json::json!({
        "query": DISCUSSION_CATEGORIES_QUERY,
        "variables": { "owner": owner, "repository": repository }
    });
    let response: DiscussionCategoriesQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    discussion_categories_from_graphql(response)
}

async fn fetch_discussion_detail(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    discussion_number: u64,
    after: Option<&str>,
) -> Result<GitHubDiscussionDetailPage, AppError> {
    let number = graphql_discussion_number(discussion_number)?;
    let payload = graphql_payload(
        DISCUSSION_DETAIL_QUERY,
        serde_json::json!({
            "owner": owner,
            "repository": repository,
            "number": number,
            "after": after,
            "first": DISCUSSION_PAGE_SIZE,
            "replyFirst": DISCUSSION_REPLY_PAGE_SIZE,
        }),
        true,
    );
    let response: DiscussionDetailQuery = client.graphql(&payload).await.map_err(github_error)?;
    discussion_detail_from_graphql(response)
}

async fn fetch_discussion_summary(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    discussion_number: u64,
) -> Result<GitHubDiscussionSummary, AppError> {
    let payload = graphql_payload(
        DISCUSSION_SNAPSHOT_QUERY,
        serde_json::json!({
            "owner": owner,
            "repository": repository,
            "number": graphql_discussion_number(discussion_number)?,
        }),
        true,
    );
    let response: DiscussionDetailQuery = client.graphql(&payload).await.map_err(github_error)?;
    response
        .repository
        .and_then(|repository| repository.discussion)
        .map(discussion_summary_from_graphql)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the requested discussion".to_string())
        })
}

async fn fetch_discussion_poll(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    discussion_number: u64,
) -> Result<GitHubDiscussionPoll, AppError> {
    let payload = graphql_payload(
        DISCUSSION_POLL_SNAPSHOT_QUERY,
        serde_json::json!({
            "owner": owner,
            "repository": repository,
            "number": graphql_discussion_number(discussion_number)?,
        }),
        true,
    );
    let response: DiscussionDetailQuery = client.graphql(&payload).await.map_err(github_error)?;
    response
        .repository
        .and_then(|repository| repository.discussion)
        .and_then(|discussion| discussion.poll)
        .map(discussion_poll_from_graphql)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the requested discussion poll".to_string())
        })
}

async fn fetch_discussion_comment_snapshot(
    client: &octocrab::Octocrab,
    comment_id: &str,
) -> Result<GraphQlDiscussionCommentSnapshotNode, AppError> {
    let payload = serde_json::json!({
        "query": DISCUSSION_COMMENT_SNAPSHOT_QUERY,
        "variables": { "commentId": comment_id }
    });
    let response: DiscussionCommentSnapshotQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    response.node.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested discussion comment".to_string())
    })
}

fn validate_discussion_comment_snapshot(
    snapshot: GraphQlDiscussionCommentSnapshotNode,
    owner: &str,
    repository: &str,
    discussion_number: u64,
    comment_id: &str,
) -> Result<ValidatedDiscussionCommentSnapshot, AppError> {
    if snapshot.type_name != "DiscussionComment" {
        return Err(AppError::Validation(
            "the selected node is not a discussion comment".to_string(),
        ));
    }
    let id = snapshot.id.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the discussion comment identity".to_string())
    })?;
    if id != comment_id {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected discussion comment".to_string(),
        ));
    }
    let discussion = snapshot.discussion.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the comment's discussion".to_string())
    })?;
    let expected_repository = format!("{owner}/{repository}");
    if !discussion
        .repository
        .name_with_owner
        .eq_ignore_ascii_case(&expected_repository)
        || discussion.number != discussion_number
    {
        return Err(AppError::Validation(
            "the selected comment does not belong to this discussion".to_string(),
        ));
    }
    Ok(ValidatedDiscussionCommentSnapshot {
        viewer_can_delete: snapshot.viewer_can_delete.unwrap_or(false),
        reply_to: snapshot.reply_to,
        replies: snapshot.replies.unwrap_or_default(),
    })
}

fn graphql_discussion_number(discussion_number: u64) -> Result<i32, AppError> {
    i32::try_from(discussion_number).map_err(|_| {
        AppError::Validation("discussion number exceeds GitHub's GraphQL range".to_string())
    })
}

fn graphql_payload(
    operation: &str,
    variables: serde_json::Value,
    include_summary_fragment: bool,
) -> serde_json::Value {
    let mut query = operation.to_string();
    if include_summary_fragment {
        query.push_str(DISCUSSION_SUMMARY_FRAGMENT);
    }
    if operation.contains("HarborDiscussionComment") {
        query.push_str(DISCUSSION_COMMENT_FRAGMENT);
    }
    if operation.contains("HarborDiscussionPoll") {
        query.push_str(DISCUSSION_POLL_FRAGMENT);
    }
    serde_json::json!({ "query": query, "variables": variables })
}

fn discussions_payload(
    owner: &str,
    repository: &str,
    filters: &GitHubDiscussionFilters,
) -> serde_json::Value {
    let states = match filters.state {
        GitHubDiscussionStateFilter::All => serde_json::Value::Null,
        GitHubDiscussionStateFilter::Open => serde_json::json!(["OPEN"]),
        GitHubDiscussionStateFilter::Closed => serde_json::json!(["CLOSED"]),
    };
    let answered = match filters.answered {
        GitHubDiscussionAnsweredFilter::All => serde_json::Value::Null,
        GitHubDiscussionAnsweredFilter::Answered => serde_json::Value::Bool(true),
        GitHubDiscussionAnsweredFilter::Unanswered => serde_json::Value::Bool(false),
    };
    let order_field = match filters.sort {
        GitHubDiscussionSort::Updated => "UPDATED_AT",
        GitHubDiscussionSort::Created => "CREATED_AT",
    };
    graphql_payload(
        DISCUSSIONS_QUERY,
        serde_json::json!({
            "owner": owner,
            "repository": repository,
            "categoryId": filters.category_id,
            "answered": answered,
            "states": states,
            "orderBy": { "field": order_field, "direction": "DESC" },
            "after": filters.after,
            "first": DISCUSSION_PAGE_SIZE,
        }),
        true,
    )
}

fn discussion_close_reason_graphql(reason: GitHubDiscussionCloseReason) -> &'static str {
    match reason {
        GitHubDiscussionCloseReason::Resolved => "RESOLVED",
        GitHubDiscussionCloseReason::Outdated => "OUTDATED",
        GitHubDiscussionCloseReason::Duplicate => "DUPLICATE",
    }
}

fn ensure_discussion_category(
    categories: &GitHubDiscussionCategoryPage,
    category_id: &str,
) -> Result<(), AppError> {
    if categories
        .categories
        .iter()
        .any(|category| category.id == category_id)
    {
        Ok(())
    } else {
        Err(AppError::Validation(
            "the selected discussion category does not belong to this repository".to_string(),
        ))
    }
}

fn discussion_categories_from_graphql(
    response: DiscussionCategoriesQuery,
) -> Result<GitHubDiscussionCategoryPage, AppError> {
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested repository".to_string())
    })?;
    Ok(GitHubDiscussionCategoryPage {
        enabled: repository.has_discussions_enabled,
        repository_id: repository.id,
        categories: repository
            .discussion_categories
            .nodes
            .into_iter()
            .map(discussion_category_from_graphql)
            .collect(),
    })
}

fn discussion_page_from_graphql(
    response: DiscussionsQuery,
) -> Result<GitHubDiscussionPage, AppError> {
    let repository = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested repository".to_string())
    })?;
    Ok(GitHubDiscussionPage {
        enabled: repository.has_discussions_enabled,
        discussions: repository
            .discussions
            .nodes
            .into_iter()
            .map(discussion_summary_from_graphql)
            .collect(),
        total_count: repository.discussions.total_count,
        end_cursor: repository.discussions.page_info.end_cursor,
        has_more: repository.discussions.page_info.has_next_page,
    })
}

fn discussion_detail_from_graphql(
    response: DiscussionDetailQuery,
) -> Result<GitHubDiscussionDetailPage, AppError> {
    let discussion = response
        .repository
        .and_then(|repository| repository.discussion)
        .ok_or_else(|| {
            AppError::GitHub("GitHub did not return the requested discussion".to_string())
        })?;
    let comments = discussion.comments.clone();
    let poll = discussion.poll.clone().map(discussion_poll_from_graphql);
    Ok(GitHubDiscussionDetailPage {
        discussion: discussion_summary_from_graphql(discussion),
        poll,
        comments: comments
            .nodes
            .into_iter()
            .map(discussion_comment_from_graphql)
            .collect(),
        comment_count: comments.total_count,
        end_cursor: comments.page_info.end_cursor,
        has_more: comments.page_info.has_next_page,
    })
}

fn discussion_from_mutation(
    payload: Option<DiscussionMutationPayload>,
    action: &str,
) -> Result<GitHubDiscussionSummary, AppError> {
    payload
        .and_then(|payload| payload.discussion)
        .map(discussion_summary_from_graphql)
        .ok_or_else(|| {
            AppError::GitHub(format!("GitHub did not return the discussion it {action}"))
        })
}

fn discussion_comment_from_mutation(
    payload: Option<DiscussionCommentMutationPayload>,
    action: &str,
) -> Result<GitHubDiscussionComment, AppError> {
    payload
        .and_then(|payload| payload.comment)
        .map(|comment| discussion_comment_from_graphql(comment.without_replies()))
        .ok_or_else(|| {
            AppError::GitHub(format!(
                "GitHub did not return the discussion comment it {action}"
            ))
        })
}

fn discussion_category_from_graphql(
    category: GraphQlDiscussionCategory,
) -> GitHubDiscussionCategory {
    GitHubDiscussionCategory {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        emoji: category.emoji,
        is_answerable: category.is_answerable,
    }
}

fn discussion_summary_from_graphql(discussion: GraphQlDiscussion) -> GitHubDiscussionSummary {
    GitHubDiscussionSummary {
        id: discussion.id,
        number: discussion.number,
        title: discussion.title,
        body: discussion.body,
        url: discussion.url,
        state: if discussion.closed {
            GitHubDiscussionState::Closed
        } else {
            GitHubDiscussionState::Open
        },
        state_reason: discussion.state_reason,
        locked: discussion.locked,
        author: discussion
            .author
            .as_ref()
            .map(|author| author.login.clone()),
        author_avatar_url: discussion.author.and_then(|author| author.avatar_url),
        author_association: discussion.author_association,
        category: discussion_category_from_graphql(discussion.category),
        answer_id: discussion.answer.map(|answer| answer.id),
        answer_chosen_at: discussion.answer_chosen_at,
        answer_chosen_by: discussion.answer_chosen_by.map(|author| author.login),
        comment_count: discussion.comment_summary.total_count,
        upvote_count: discussion.upvote_count,
        created_at: discussion.created_at,
        updated_at: discussion.updated_at,
        viewer_can_close: discussion.viewer_can_close,
        viewer_can_delete: discussion.viewer_can_delete,
        viewer_can_reopen: discussion.viewer_can_reopen,
        viewer_can_update: discussion.viewer_can_update,
        viewer_can_upvote: discussion.viewer_can_upvote,
        viewer_did_author: discussion.viewer_did_author,
        viewer_has_upvoted: discussion.viewer_has_upvoted,
    }
}

fn discussion_comment_from_graphql(comment: GraphQlDiscussionComment) -> GitHubDiscussionComment {
    GitHubDiscussionComment {
        id: comment.id,
        body: comment.body,
        url: comment.url,
        author: comment.author.as_ref().map(|author| author.login.clone()),
        author_avatar_url: comment.author.and_then(|author| author.avatar_url),
        author_association: comment.author_association,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        is_answer: comment.is_answer,
        is_minimized: comment.is_minimized,
        minimized_reason: comment.minimized_reason,
        deleted_at: comment.deleted_at,
        upvote_count: comment.upvote_count,
        viewer_can_delete: comment.viewer_can_delete,
        viewer_can_mark_as_answer: comment.viewer_can_mark_as_answer,
        viewer_can_unmark_as_answer: comment.viewer_can_unmark_as_answer,
        viewer_can_update: comment.viewer_can_update,
        viewer_can_upvote: comment.viewer_can_upvote,
        viewer_can_minimize: comment.viewer_can_minimize,
        viewer_can_unminimize: comment.viewer_can_unminimize,
        viewer_did_author: comment.viewer_did_author,
        viewer_has_upvoted: comment.viewer_has_upvoted,
        replies_have_more: comment
            .replies
            .as_ref()
            .is_some_and(|replies| replies.page_info.has_next_page),
        replies: comment
            .replies
            .map(|replies| {
                replies
                    .nodes
                    .into_iter()
                    .map(|reply| discussion_comment_from_graphql(reply.without_replies()))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn discussion_poll_from_graphql(poll: GraphQlDiscussionPoll) -> GitHubDiscussionPoll {
    GitHubDiscussionPoll {
        id: poll.id,
        question: poll.question,
        total_vote_count: poll.total_vote_count,
        viewer_can_vote: poll.viewer_can_vote,
        viewer_has_voted: poll.viewer_has_voted,
        options: poll
            .options
            .nodes
            .into_iter()
            .map(|option| GitHubDiscussionPollOption {
                id: option.id,
                option: option.option,
                total_vote_count: option.total_vote_count,
                viewer_has_voted: option.viewer_has_voted,
            })
            .collect(),
    }
}

impl From<GraphQlDiscussionVote> for GitHubDiscussionVote {
    fn from(vote: GraphQlDiscussionVote) -> Self {
        Self {
            subject_id: vote.id,
            upvote_count: vote.upvote_count,
            viewer_can_upvote: vote.viewer_can_upvote,
            viewer_has_upvoted: vote.viewer_has_upvoted,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlActor {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCategory {
    id: String,
    name: String,
    slug: String,
    description: Option<String>,
    emoji: String,
    is_answerable: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlPageInfo {
    end_cursor: Option<String>,
    has_next_page: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussion {
    id: String,
    number: u64,
    title: String,
    body: String,
    url: String,
    closed: bool,
    state_reason: Option<String>,
    locked: bool,
    author: Option<GraphQlActor>,
    author_association: String,
    category: GraphQlDiscussionCategory,
    answer: Option<GraphQlNode>,
    answer_chosen_at: Option<String>,
    answer_chosen_by: Option<GraphQlActor>,
    #[serde(default)]
    poll: Option<GraphQlDiscussionPoll>,
    comment_summary: GraphQlDiscussionCommentCount,
    #[serde(default)]
    comments: GraphQlDiscussionComments,
    created_at: String,
    updated_at: String,
    upvote_count: u64,
    viewer_can_close: bool,
    viewer_can_delete: bool,
    viewer_can_reopen: bool,
    viewer_can_update: bool,
    viewer_can_upvote: bool,
    viewer_did_author: bool,
    viewer_has_upvoted: bool,
}

#[derive(Clone, Debug, Deserialize)]
struct GraphQlNode {
    id: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionComments {
    total_count: u64,
    #[serde(default)]
    nodes: Vec<GraphQlDiscussionComment>,
    #[serde(default)]
    page_info: GraphQlPageInfo,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCommentCount {
    total_count: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionComment {
    id: String,
    body: String,
    url: String,
    author: Option<GraphQlActor>,
    author_association: String,
    created_at: String,
    updated_at: String,
    is_answer: bool,
    is_minimized: bool,
    minimized_reason: Option<String>,
    deleted_at: Option<String>,
    upvote_count: u64,
    viewer_can_delete: bool,
    viewer_can_mark_as_answer: bool,
    viewer_can_unmark_as_answer: bool,
    viewer_can_update: bool,
    viewer_can_upvote: bool,
    viewer_can_minimize: bool,
    viewer_can_unminimize: bool,
    viewer_did_author: bool,
    viewer_has_upvoted: bool,
    #[serde(default)]
    replies: Option<GraphQlDiscussionReplies>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionPoll {
    id: String,
    question: String,
    total_vote_count: u64,
    viewer_can_vote: bool,
    viewer_has_voted: bool,
    options: GraphQlDiscussionPollOptions,
}

#[derive(Clone, Debug, Deserialize)]
struct GraphQlDiscussionPollOptions {
    nodes: Vec<GraphQlDiscussionPollOption>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionPollOption {
    id: String,
    option: String,
    total_vote_count: u64,
    viewer_has_voted: bool,
}

impl GraphQlDiscussionComment {
    fn without_replies(mut self) -> Self {
        self.replies = None;
        self
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionReplies {
    #[allow(dead_code)]
    total_count: u64,
    #[serde(default)]
    nodes: Vec<GraphQlDiscussionComment>,
    page_info: GraphQlPageInfo,
}

#[derive(Deserialize)]
struct DiscussionCommentSnapshotQuery {
    node: Option<GraphQlDiscussionCommentSnapshotNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCommentSnapshotNode {
    #[serde(rename = "__typename")]
    type_name: String,
    id: Option<String>,
    #[allow(dead_code)]
    deleted_at: Option<String>,
    viewer_can_delete: Option<bool>,
    reply_to: Option<GraphQlNode>,
    replies: Option<GraphQlDiscussionCommentSnapshotReplies>,
    discussion: Option<GraphQlDiscussionCommentSnapshotDiscussion>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCommentSnapshotReplies {
    total_count: u64,
}

#[derive(Deserialize)]
struct GraphQlDiscussionCommentSnapshotDiscussion {
    number: u64,
    repository: GraphQlDiscussionCommentSnapshotRepository,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCommentSnapshotRepository {
    name_with_owner: String,
}

struct ValidatedDiscussionCommentSnapshot {
    viewer_can_delete: bool,
    reply_to: Option<GraphQlNode>,
    replies: GraphQlDiscussionCommentSnapshotReplies,
}

#[derive(Deserialize)]
struct DiscussionCategoriesQuery {
    repository: Option<GraphQlDiscussionCategoriesRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionCategoriesRepository {
    id: String,
    has_discussions_enabled: bool,
    discussion_categories: GraphQlDiscussionCategoryConnection,
}

#[derive(Deserialize)]
struct GraphQlDiscussionCategoryConnection {
    nodes: Vec<GraphQlDiscussionCategory>,
}

#[derive(Deserialize)]
struct DiscussionsQuery {
    repository: Option<GraphQlDiscussionsRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionsRepository {
    has_discussions_enabled: bool,
    discussions: GraphQlDiscussionConnection,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionConnection {
    total_count: u64,
    nodes: Vec<GraphQlDiscussion>,
    page_info: GraphQlPageInfo,
}

#[derive(Deserialize)]
struct DiscussionDetailQuery {
    repository: Option<GraphQlDiscussionDetailRepository>,
}

#[derive(Deserialize)]
struct GraphQlDiscussionDetailRepository {
    discussion: Option<GraphQlDiscussion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscussionMutation {
    #[serde(default)]
    create_discussion: Option<DiscussionMutationPayload>,
    #[serde(default)]
    update_discussion: Option<DiscussionMutationPayload>,
    #[serde(default)]
    close_discussion: Option<DiscussionMutationPayload>,
    #[serde(default)]
    reopen_discussion: Option<DiscussionMutationPayload>,
}

#[derive(Deserialize)]
struct DiscussionMutationPayload {
    discussion: Option<GraphQlDiscussion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscussionCommentMutation {
    #[serde(default)]
    add_discussion_comment: Option<DiscussionCommentMutationPayload>,
    #[serde(default)]
    update_discussion_comment: Option<DiscussionCommentMutationPayload>,
}

#[derive(Deserialize)]
struct DiscussionCommentMutationPayload {
    comment: Option<GraphQlDiscussionComment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscussionVoteMutation {
    #[serde(default)]
    add_upvote: Option<DiscussionVoteMutationPayload>,
    #[serde(default)]
    remove_upvote: Option<DiscussionVoteMutationPayload>,
}

#[derive(Deserialize)]
struct DiscussionVoteMutationPayload {
    subject: Option<GraphQlDiscussionVote>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDiscussionVote {
    id: String,
    upvote_count: u64,
    viewer_can_upvote: bool,
    viewer_has_upvoted: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscussionAnswerMutation {
    #[serde(default)]
    mark_discussion_comment_as_answer: Option<DiscussionMutationPayload>,
    #[serde(default)]
    unmark_discussion_comment_as_answer: Option<DiscussionMutationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscussionPollVoteMutation {
    add_discussion_poll_vote: Option<DiscussionPollVoteMutationPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiscussionPollVoteMutationPayload {
    poll_option: Option<GraphQlDiscussionPollVoteOption>,
}

#[derive(Deserialize)]
struct GraphQlDiscussionPollVoteOption {
    id: String,
    poll: Option<GraphQlDiscussionPoll>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteDiscussionMutation {
    delete_discussion: Option<DeleteDiscussionMutationPayload>,
}

#[derive(Deserialize)]
struct DeleteDiscussionMutationPayload {
    discussion: Option<GraphQlDeletedDiscussion>,
}

#[derive(Deserialize)]
struct GraphQlDeletedDiscussion {
    id: String,
    number: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteDiscussionCommentMutation {
    delete_discussion_comment: Option<DeleteDiscussionCommentMutationPayload>,
}

#[derive(Deserialize)]
struct DeleteDiscussionCommentMutationPayload {
    comment: Option<GraphQlDeletedDiscussionComment>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphQlDeletedDiscussionComment {
    id: String,
    deleted_at: Option<String>,
}

#[cfg(test)]
mod tests;
