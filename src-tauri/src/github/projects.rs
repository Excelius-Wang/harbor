use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::AppError;

use super::{authenticated_client, github_error, GitHubService, OctocrabGitHubClient};

const PROJECT_PAGE_SIZE: u32 = 30;
const PROJECT_ITEM_PAGE_SIZE: u32 = 30;
const PROJECT_FIELD_LIMIT: u32 = 50;
const PROJECT_VIEW_LIMIT: u32 = 20;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubProjectStateFilter {
    Open,
    Closed,
    All,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubProjectSort {
    Updated,
    Created,
    Title,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubProjectFilters {
    pub state: GitHubProjectStateFilter,
    pub query: String,
    pub sort: GitHubProjectSort,
    pub after: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GitHubProjectItemFilters {
    pub query: String,
    pub archived: bool,
    pub after: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectSummary {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub short_description: Option<String>,
    pub url: String,
    pub public: bool,
    pub closed: bool,
    pub item_count: u32,
    pub updated_at: String,
    pub viewer_can_update: bool,
    pub viewer_can_close: bool,
    pub viewer_can_reopen: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectPage {
    pub projects: Vec<GitHubProjectSummary>,
    pub total_count: u32,
    pub end_cursor: Option<String>,
    pub has_more: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubProjectViewLayout {
    Board,
    Table,
    Roadmap,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectView {
    pub id: String,
    pub number: u32,
    pub name: String,
    pub layout: GitHubProjectViewLayout,
    pub filter: String,
    pub visible_field_ids: Vec<String>,
    pub group_by_field_ids: Vec<String>,
    pub vertical_group_by_field_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubProjectFieldType {
    Assignees,
    LinkedPullRequests,
    Reviewers,
    Labels,
    Milestone,
    Repository,
    Title,
    Text,
    SingleSelect,
    MultiSelect,
    Number,
    Date,
    Iteration,
    Tracks,
    TrackedBy,
    IssueType,
    ParentIssue,
    SubIssuesProgress,
    Created,
    Updated,
    Closed,
    Other,
}

impl GitHubProjectFieldType {
    fn editable(self) -> bool {
        matches!(
            self,
            Self::Text
                | Self::SingleSelect
                | Self::MultiSelect
                | Self::Number
                | Self::Date
                | Self::Iteration
        )
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectFieldOption {
    pub id: String,
    pub name: String,
    pub color: String,
    pub description: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectIteration {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub duration: u32,
    pub completed: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectField {
    pub id: String,
    pub name: String,
    pub data_type: GitHubProjectFieldType,
    pub issue_field: bool,
    pub editable: bool,
    pub options: Vec<GitHubProjectFieldOption>,
    pub iterations: Vec<GitHubProjectIteration>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectRepository {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub url: String,
    pub default_branch: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubProjectItemContent {
    DraftIssue {
        id: String,
        title: String,
        body: String,
    },
    Issue {
        id: String,
        title: String,
        body: String,
        number: u32,
        url: String,
        state: String,
        repository: GitHubProjectRepository,
    },
    PullRequest {
        id: String,
        title: String,
        body: String,
        number: u32,
        url: String,
        state: String,
        repository: GitHubProjectRepository,
    },
    Redacted,
}

#[cfg(test)]
impl GitHubProjectItemContent {
    pub fn title(&self) -> &str {
        match self {
            Self::DraftIssue { title, .. }
            | Self::Issue { title, .. }
            | Self::PullRequest { title, .. } => title,
            Self::Redacted => "",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubProjectFieldValue {
    Text {
        field_id: String,
        text: String,
    },
    Number {
        field_id: String,
        number: f64,
    },
    Date {
        field_id: String,
        date: String,
    },
    SingleSelect {
        field_id: String,
        option_id: String,
        name: String,
        color: String,
    },
    MultiSelect {
        field_id: String,
        options: Vec<GitHubProjectFieldOption>,
    },
    Iteration {
        field_id: String,
        iteration_id: String,
        title: String,
        start_date: String,
        duration: u32,
    },
    Labels {
        field_id: String,
        labels: Vec<GitHubProjectLabel>,
    },
    Users {
        field_id: String,
        users: Vec<GitHubProjectUser>,
    },
    Milestone {
        field_id: String,
        title: String,
    },
    Repository {
        field_id: String,
        full_name: String,
        url: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectLabel {
    pub name: String,
    pub color: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectUser {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectItem {
    pub id: String,
    pub archived: bool,
    pub content: GitHubProjectItemContent,
    pub field_values: Vec<GitHubProjectFieldValue>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectItemPage {
    pub items: Vec<GitHubProjectItem>,
    pub total_count: u32,
    pub end_cursor: Option<String>,
    pub has_more: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectDetail {
    pub project: GitHubProjectSummary,
    pub readme: String,
    pub fields: Vec<GitHubProjectField>,
    pub views: Vec<GitHubProjectView>,
    pub items: GitHubProjectItemPage,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GitHubProjectUpdate {
    pub title: String,
    pub short_description: String,
    pub readme: String,
    pub public: bool,
    pub closed: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubProjectItemAddition {
    DraftIssue { title: String, body: String },
    ExistingItem { url: String },
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum GitHubProjectItemUpdate {
    DraftIssue {
        title: String,
        body: String,
    },
    ClearField {
        field_id: String,
    },
    Text {
        field_id: String,
        text: String,
    },
    Number {
        field_id: String,
        number: f64,
    },
    Date {
        field_id: String,
        date: String,
    },
    SingleSelect {
        field_id: String,
        option_id: String,
    },
    MultiSelect {
        field_id: String,
        option_ids: Vec<String>,
    },
    Iteration {
        field_id: String,
        iteration_id: String,
    },
}

impl GitHubProjectItemUpdate {
    fn field_id(&self) -> Option<&str> {
        match self {
            Self::DraftIssue { .. } => None,
            Self::ClearField { field_id }
            | Self::Text { field_id, .. }
            | Self::Number { field_id, .. }
            | Self::Date { field_id, .. }
            | Self::SingleSelect { field_id, .. }
            | Self::MultiSelect { field_id, .. }
            | Self::Iteration { field_id, .. } => Some(field_id),
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GitHubProjectItemAction {
    Archive,
    Unarchive,
    Delete,
}

#[async_trait]
pub(crate) trait GitHubProjectsClient: Send + Sync {
    async fn list_projects(
        &self,
        token: &str,
        filters: &GitHubProjectFilters,
    ) -> Result<GitHubProjectPage, AppError>;

    async fn project(
        &self,
        token: &str,
        number: u32,
        filters: &GitHubProjectItemFilters,
    ) -> Result<GitHubProjectDetail, AppError>;

    async fn create_project(
        &self,
        token: &str,
        title: &str,
    ) -> Result<GitHubProjectSummary, AppError>;

    async fn update_project(
        &self,
        token: &str,
        number: u32,
        update: &GitHubProjectUpdate,
    ) -> Result<GitHubProjectSummary, AppError>;

    async fn delete_project(&self, token: &str, number: u32) -> Result<(), AppError>;

    async fn add_project_item(
        &self,
        token: &str,
        number: u32,
        addition: &GitHubProjectItemAddition,
    ) -> Result<GitHubProjectItem, AppError>;

    async fn update_project_item(
        &self,
        token: &str,
        number: u32,
        item_id: &str,
        update: &GitHubProjectItemUpdate,
    ) -> Result<GitHubProjectItem, AppError>;

    async fn change_project_item(
        &self,
        token: &str,
        number: u32,
        item_id: &str,
        action: GitHubProjectItemAction,
    ) -> Result<Option<GitHubProjectItem>, AppError>;
}

impl GitHubService {
    pub async fn projects(
        &self,
        filters: &GitHubProjectFilters,
    ) -> Result<GitHubProjectPage, AppError> {
        let token = self.load_access_token().await?;
        self.client.list_projects(&token, filters).await
    }

    pub async fn project(
        &self,
        number: u32,
        filters: &GitHubProjectItemFilters,
    ) -> Result<GitHubProjectDetail, AppError> {
        let token = self.load_access_token().await?;
        self.client.project(&token, number, filters).await
    }

    pub async fn create_project(&self, title: &str) -> Result<GitHubProjectSummary, AppError> {
        let token = self.load_access_token().await?;
        self.client.create_project(&token, title).await
    }

    pub async fn update_project(
        &self,
        number: u32,
        update: &GitHubProjectUpdate,
    ) -> Result<GitHubProjectSummary, AppError> {
        let token = self.load_access_token().await?;
        self.client.update_project(&token, number, update).await
    }

    pub async fn delete_project(&self, number: u32) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client.delete_project(&token, number).await
    }

    pub async fn add_project_item(
        &self,
        number: u32,
        addition: &GitHubProjectItemAddition,
    ) -> Result<GitHubProjectItem, AppError> {
        let token = self.load_access_token().await?;
        self.client.add_project_item(&token, number, addition).await
    }

    pub async fn update_project_item(
        &self,
        number: u32,
        item_id: &str,
        update: &GitHubProjectItemUpdate,
    ) -> Result<GitHubProjectItem, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .update_project_item(&token, number, item_id, update)
            .await
    }

    pub async fn change_project_item(
        &self,
        number: u32,
        item_id: &str,
        action: GitHubProjectItemAction,
    ) -> Result<Option<GitHubProjectItem>, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .change_project_item(&token, number, item_id, action)
            .await
    }
}

const PROJECT_SUMMARY_FIELDS: &str = r#"
  id
  number
  title
  shortDescription
  url
  public
  closed
  updatedAt
  viewerCanUpdate
  viewerCanClose
  viewerCanReopen
  itemCount: items(first: 1, archivedStates: [NOT_ARCHIVED]) { totalCount }
"#;

const PROJECT_FIELD_FRAGMENT: &str = r#"
fragment HarborProjectField on ProjectV2FieldConfiguration {
  __typename
  ... on ProjectV2Field {
    id
    name
    dataType
    isIssueField
  }
  ... on ProjectV2SingleSelectField {
    id
    name
    dataType
    isIssueField
    options { id name color description }
  }
  ... on ProjectV2MultiSelectField {
    id
    name
    dataType
    isIssueField
    multiSelectOptions { id name color description }
  }
  ... on ProjectV2IterationField {
    id
    name
    dataType
    isIssueField
    configuration {
      iterations { id title startDate duration }
      completedIterations { id title startDate duration }
    }
  }
}
"#;

const PROJECT_ITEM_FRAGMENT: &str = r#"
fragment HarborProjectItem on ProjectV2Item {
  id
  isArchived
  createdAt
  updatedAt
  content {
    __typename
    ... on DraftIssue { id title body }
    ... on Issue {
      id title body number url state
      repository {
        nameWithOwner
        name
        url
        owner { login }
        defaultBranchRef { name }
      }
    }
    ... on PullRequest {
      id title body number url state
      repository {
        nameWithOwner
        name
        url
        owner { login }
        defaultBranchRef { name }
      }
    }
  }
  fieldValues(first: 50) {
    nodes {
      __typename
      ... on ProjectV2ItemFieldTextValue {
        text
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldNumberValue {
        number
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldDateValue {
        date
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldSingleSelectValue {
        optionId name color
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldMultiSelectValue {
        options { id name color description }
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldIterationValue {
        iterationId title startDate duration
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldLabelValue {
        labels(first: 20) { nodes { name color } }
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldUserValue {
        users(first: 20) { nodes { login avatarUrl } }
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldMilestoneValue {
        milestone { title }
        field { ... on ProjectV2FieldCommon { id name } }
      }
      ... on ProjectV2ItemFieldRepositoryValue {
        repository { nameWithOwner url }
        field { ... on ProjectV2FieldCommon { id name } }
      }
    }
  }
}
"#;

fn list_projects_query() -> String {
    format!(
        r#"query HarborPersonalProjects($first: Int!, $after: String, $query: String, $orderField: ProjectV2OrderField!) {{
  viewer {{
    projectsV2(first: $first, after: $after, query: $query, orderBy: {{ field: $orderField, direction: DESC }}) {{
      totalCount
      pageInfo {{ hasNextPage endCursor }}
      nodes {{ {PROJECT_SUMMARY_FIELDS} }}
    }}
  }}
}}"#
    )
}

fn project_detail_query() -> String {
    format!(
        r#"query HarborPersonalProject($number: Int!, $firstItems: Int!, $afterItems: String, $itemQuery: String, $archivedStates: [ProjectV2ItemArchivedState!], $firstFields: Int!, $firstViews: Int!) {{
  viewer {{
    login
    projectV2(number: $number) {{
      {PROJECT_SUMMARY_FIELDS}
      readme
      fields(first: $firstFields) {{ nodes {{ ...HarborProjectField }} }}
      views(first: $firstViews, orderBy: {{ field: POSITION, direction: ASC }}) {{
        nodes {{
          id number name layout filter
          configuration {{
            visibleFields(first: $firstFields) {{ nodes {{ ... on ProjectV2FieldCommon {{ id }} }} }}
          }}
          groupByFields(first: 2) {{ nodes {{ ... on ProjectV2FieldCommon {{ id }} }} }}
          verticalGroupByFields(first: 2) {{ nodes {{ ... on ProjectV2FieldCommon {{ id }} }} }}
        }}
      }}
      items(first: $firstItems, after: $afterItems, query: $itemQuery, archivedStates: $archivedStates) {{
        totalCount
        pageInfo {{ hasNextPage endCursor }}
        nodes {{ ...HarborProjectItem }}
      }}
    }}
  }}
}}
{PROJECT_FIELD_FRAGMENT}
{PROJECT_ITEM_FRAGMENT}"#
    )
}

fn project_context_query() -> String {
    format!(
        r#"query HarborPersonalProjectContext($number: Int!, $firstFields: Int!) {{
  viewer {{
    login
    projectV2(number: $number) {{
      {PROJECT_SUMMARY_FIELDS}
      fields(first: $firstFields) {{ nodes {{ ...HarborProjectField }} }}
    }}
  }}
}}
{PROJECT_FIELD_FRAGMENT}"#
    )
}

fn project_item_query() -> String {
    format!(
        r#"query HarborPersonalProjectItem($itemId: ID!) {{
  node(id: $itemId) {{
    ... on ProjectV2Item {{
      ...HarborProjectItem
      project {{ id number owner {{ __typename ... on User {{ login }} }} }}
    }}
  }}
}}
{PROJECT_ITEM_FRAGMENT}"#
    )
}

fn item_mutation(
    operation: &str,
    mutation_name: &str,
    payload_field: &str,
    input_type: &str,
) -> String {
    format!(
        r#"mutation {operation}($input: {input_type}!) {{
  {mutation_name}(input: $input) {{
    {payload_field} {{ ...HarborProjectItem }}
  }}
}}
{PROJECT_ITEM_FRAGMENT}"#
    )
}

fn project_query_payload(query: String, variables: Value) -> Value {
    json!({ "query": query, "variables": variables })
}

#[derive(Debug, Deserialize)]
struct RawProjectPageResponse {
    viewer: RawProjectPageViewer,
}

#[derive(Debug, Deserialize)]
struct RawProjectPageViewer {
    #[serde(rename = "projectsV2")]
    projects_v2: RawProjectConnection,
}

#[derive(Debug, Deserialize)]
struct RawProjectConnection {
    #[serde(rename = "totalCount")]
    total_count: u32,
    #[serde(rename = "pageInfo")]
    page_info: RawPageInfo,
    nodes: Vec<RawProjectSummary>,
}

#[derive(Debug, Deserialize)]
struct RawPageInfo {
    #[serde(rename = "hasNextPage")]
    has_next_page: bool,
    #[serde(rename = "endCursor")]
    end_cursor: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectSummary {
    id: String,
    number: u32,
    title: String,
    #[serde(rename = "shortDescription")]
    short_description: Option<String>,
    url: String,
    public: bool,
    closed: bool,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "viewerCanUpdate")]
    viewer_can_update: bool,
    #[serde(rename = "viewerCanClose")]
    viewer_can_close: bool,
    #[serde(rename = "viewerCanReopen")]
    viewer_can_reopen: bool,
    #[serde(rename = "itemCount")]
    item_count: RawTotalCount,
}

#[derive(Clone, Debug, Deserialize)]
struct RawTotalCount {
    #[serde(rename = "totalCount")]
    total_count: u32,
}

#[derive(Debug, Deserialize)]
struct RawProjectDetailResponse {
    viewer: RawProjectDetailViewer,
}

#[derive(Debug, Deserialize)]
struct RawProjectDetailViewer {
    login: String,
    #[serde(rename = "projectV2")]
    project_v2: Option<RawProjectDetail>,
}

#[derive(Debug, Deserialize)]
struct RawProjectDetail {
    #[serde(flatten)]
    summary: RawProjectSummary,
    readme: Option<String>,
    fields: RawProjectFieldConnection,
    views: RawProjectViewConnection,
    items: RawProjectItemConnection,
}

#[derive(Debug, Deserialize)]
struct RawProjectContextResponse {
    viewer: RawProjectContextViewer,
}

#[derive(Debug, Deserialize)]
struct RawProjectContextViewer {
    login: String,
    #[serde(rename = "projectV2")]
    project_v2: Option<RawProjectContext>,
}

#[derive(Debug, Deserialize)]
struct RawProjectContext {
    #[serde(flatten)]
    summary: RawProjectSummary,
    fields: RawProjectFieldConnection,
}

#[derive(Debug, Deserialize)]
struct RawProjectFieldConnection {
    nodes: Vec<RawProjectField>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectField {
    #[serde(rename = "__typename")]
    type_name: String,
    id: String,
    name: String,
    #[serde(rename = "dataType")]
    data_type: String,
    #[serde(default, rename = "isIssueField")]
    issue_field: bool,
    #[serde(default)]
    options: Vec<RawProjectFieldOption>,
    #[serde(default, rename = "multiSelectOptions")]
    multi_select_options: Vec<RawProjectFieldOption>,
    configuration: Option<RawProjectIterationConfiguration>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectFieldOption {
    id: String,
    name: String,
    color: String,
    #[serde(default)]
    description: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectIterationConfiguration {
    iterations: Vec<RawProjectIteration>,
    #[serde(rename = "completedIterations")]
    completed_iterations: Vec<RawProjectIteration>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectIteration {
    id: String,
    title: String,
    #[serde(rename = "startDate")]
    start_date: String,
    duration: u32,
}

#[derive(Debug, Deserialize)]
struct RawProjectViewConnection {
    nodes: Vec<RawProjectView>,
}

#[derive(Debug, Deserialize)]
struct RawProjectView {
    id: String,
    number: u32,
    name: String,
    layout: String,
    filter: Option<String>,
    configuration: RawProjectViewConfiguration,
    #[serde(rename = "groupByFields")]
    group_by_fields: RawProjectFieldRefConnection,
    #[serde(rename = "verticalGroupByFields")]
    vertical_group_by_fields: RawProjectFieldRefConnection,
}

#[derive(Debug, Deserialize)]
struct RawProjectViewConfiguration {
    #[serde(rename = "visibleFields")]
    visible_fields: RawProjectFieldRefConnection,
}

#[derive(Debug, Deserialize)]
struct RawProjectFieldRefConnection {
    nodes: Vec<RawProjectFieldRef>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectFieldRef {
    id: String,
}

#[derive(Debug, Deserialize)]
struct RawProjectItemConnection {
    #[serde(rename = "totalCount")]
    total_count: u32,
    #[serde(rename = "pageInfo")]
    page_info: RawPageInfo,
    nodes: Vec<RawProjectItem>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectItem {
    id: String,
    #[serde(rename = "isArchived")]
    archived: bool,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    content: Option<RawProjectItemContent>,
    #[serde(rename = "fieldValues")]
    field_values: RawProjectFieldValueConnection,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectItemContent {
    #[serde(rename = "__typename")]
    type_name: String,
    id: Option<String>,
    title: Option<String>,
    body: Option<String>,
    number: Option<u32>,
    url: Option<String>,
    state: Option<String>,
    repository: Option<RawProjectRepository>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectRepository {
    #[serde(rename = "nameWithOwner")]
    full_name: String,
    name: String,
    url: String,
    owner: RawProjectRepositoryOwner,
    #[serde(rename = "defaultBranchRef")]
    default_branch_ref: Option<RawProjectBranch>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectRepositoryOwner {
    login: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectBranch {
    name: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectFieldValueConnection {
    nodes: Vec<Option<RawProjectFieldValue>>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectFieldValue {
    #[serde(rename = "__typename")]
    type_name: String,
    field: Option<RawProjectFieldValueField>,
    text: Option<String>,
    number: Option<f64>,
    date: Option<String>,
    #[serde(rename = "optionId")]
    option_id: Option<String>,
    name: Option<String>,
    color: Option<String>,
    options: Option<Vec<RawProjectFieldOption>>,
    #[serde(rename = "iterationId")]
    iteration_id: Option<String>,
    title: Option<String>,
    #[serde(rename = "startDate")]
    start_date: Option<String>,
    duration: Option<u32>,
    labels: Option<RawProjectLabelConnection>,
    users: Option<RawProjectUserConnection>,
    milestone: Option<RawProjectMilestone>,
    repository: Option<RawProjectFieldRepository>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectFieldValueField {
    id: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectLabelConnection {
    nodes: Vec<RawProjectLabel>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectLabel {
    name: String,
    color: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectUserConnection {
    nodes: Vec<RawProjectUser>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectUser {
    login: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectMilestone {
    title: String,
}

#[derive(Clone, Debug, Deserialize)]
struct RawProjectFieldRepository {
    #[serde(rename = "nameWithOwner")]
    full_name: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct RawProjectItemResponse {
    node: Option<RawProjectItemNode>,
}

#[derive(Debug, Deserialize)]
struct RawProjectItemNode {
    #[serde(flatten)]
    item: RawProjectItem,
    project: RawProjectItemProject,
}

#[derive(Debug, Deserialize)]
struct RawProjectItemProject {
    id: String,
    number: u32,
    owner: RawProjectOwner,
}

#[derive(Debug, Deserialize)]
struct RawProjectOwner {
    #[serde(rename = "__typename")]
    type_name: String,
    login: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawViewerIdentityResponse {
    viewer: RawViewerIdentity,
}

#[derive(Debug, Deserialize)]
struct RawViewerIdentity {
    id: String,
    login: String,
}

#[derive(Debug, Deserialize)]
struct RawProjectMutationResponse {
    #[serde(default, rename = "createProjectV2")]
    create_project: Option<RawProjectMutationPayload>,
    #[serde(default, rename = "updateProjectV2")]
    update_project: Option<RawProjectMutationPayload>,
    #[serde(default, rename = "deleteProjectV2")]
    delete_project: Option<RawProjectMutationPayload>,
}

#[derive(Debug, Deserialize)]
struct RawProjectMutationPayload {
    #[serde(rename = "projectV2")]
    project_v2: Option<RawProjectSummary>,
}

#[derive(Debug, Deserialize)]
struct RawProjectItemMutationResponse {
    #[serde(default, rename = "addProjectV2DraftIssue")]
    add_draft: Option<RawAddDraftPayload>,
    #[serde(default, rename = "addProjectV2ItemById")]
    add_existing: Option<RawItemPayload>,
    #[serde(default, rename = "updateProjectV2ItemFieldValue")]
    update_field: Option<RawProjectV2ItemPayload>,
    #[serde(default, rename = "clearProjectV2ItemFieldValue")]
    clear_field: Option<RawProjectV2ItemPayload>,
    #[serde(default, rename = "archiveProjectV2Item")]
    archive: Option<RawItemPayload>,
    #[serde(default, rename = "unarchiveProjectV2Item")]
    unarchive: Option<RawItemPayload>,
    #[serde(default, rename = "deleteProjectV2Item")]
    delete: Option<RawDeleteProjectItemPayload>,
}

#[derive(Debug, Deserialize)]
struct RawAddDraftPayload {
    #[serde(rename = "projectItem")]
    project_item: Option<RawProjectItem>,
}

#[derive(Debug, Deserialize)]
struct RawItemPayload {
    item: Option<RawProjectItem>,
}

#[derive(Debug, Deserialize)]
struct RawProjectV2ItemPayload {
    #[serde(rename = "projectV2Item")]
    project_v2_item: Option<RawProjectItem>,
}

#[derive(Debug, Deserialize)]
struct RawDeleteProjectItemPayload {
    #[serde(rename = "deletedItemId")]
    deleted_item_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawDraftIssueMutationResponse {
    #[serde(rename = "updateProjectV2DraftIssue")]
    update_draft: Option<RawDraftIssueMutationPayload>,
}

#[derive(Debug, Deserialize)]
struct RawDraftIssueMutationPayload {
    #[serde(rename = "draftIssue")]
    draft_issue: Option<RawDraftIssue>,
}

#[derive(Debug, Deserialize)]
struct RawDraftIssue {
    id: String,
    title: String,
    body: String,
}

#[derive(Debug, Deserialize)]
struct RawResourceResponse {
    repository: Option<RawResourceRepository>,
}

#[derive(Debug, Deserialize)]
struct RawResourceRepository {
    #[serde(rename = "issueOrPullRequest")]
    issue_or_pull_request: Option<RawResourceNode>,
}

#[derive(Debug, Deserialize)]
struct RawResourceNode {
    #[serde(rename = "__typename")]
    type_name: String,
    id: String,
    url: String,
}

#[async_trait]
impl GitHubProjectsClient for OctocrabGitHubClient {
    async fn list_projects(
        &self,
        token: &str,
        filters: &GitHubProjectFilters,
    ) -> Result<GitHubProjectPage, AppError> {
        let client = authenticated_client(token)?;
        let payload = project_query_payload(
            list_projects_query(),
            json!({
                "first": PROJECT_PAGE_SIZE,
                "after": filters.after,
                "query": projects_search_query(filters),
                "orderField": project_order_field(filters.sort),
            }),
        );
        let response: RawProjectPageResponse =
            client.graphql(&payload).await.map_err(projects_error)?;
        Ok(GitHubProjectPage {
            projects: response
                .viewer
                .projects_v2
                .nodes
                .into_iter()
                .map(project_summary)
                .collect(),
            total_count: response.viewer.projects_v2.total_count,
            end_cursor: response.viewer.projects_v2.page_info.end_cursor,
            has_more: response.viewer.projects_v2.page_info.has_next_page,
        })
    }

    async fn project(
        &self,
        token: &str,
        number: u32,
        filters: &GitHubProjectItemFilters,
    ) -> Result<GitHubProjectDetail, AppError> {
        let client = authenticated_client(token)?;
        fetch_project_detail(&client, number, filters).await
    }

    async fn create_project(
        &self,
        token: &str,
        title: &str,
    ) -> Result<GitHubProjectSummary, AppError> {
        let client = authenticated_client(token)?;
        let viewer = fetch_viewer_identity(&client).await?;
        let payload = project_query_payload(
            format!(
                r#"mutation HarborCreatePersonalProject($input: CreateProjectV2Input!) {{
  createProjectV2(input: $input) {{ projectV2 {{ {PROJECT_SUMMARY_FIELDS} }} }}
}}"#
            ),
            json!({ "input": { "ownerId": viewer.id, "title": title } }),
        );
        let response: RawProjectMutationResponse =
            client.graphql(&payload).await.map_err(projects_error)?;
        let project = response
            .create_project
            .and_then(|payload| payload.project_v2)
            .ok_or_else(|| AppError::GitHub("GitHub did not return the created project".into()))?;
        let summary = project_summary(project);
        ensure_project_owner_url(&summary, &viewer.login)?;
        Ok(summary)
    }

    async fn update_project(
        &self,
        token: &str,
        number: u32,
        update: &GitHubProjectUpdate,
    ) -> Result<GitHubProjectSummary, AppError> {
        let client = authenticated_client(token)?;
        let context = fetch_project_context(&client, number).await?;
        ensure_project_write(&context.summary)?;
        let payload = project_query_payload(
            format!(
                r#"mutation HarborUpdatePersonalProject($input: UpdateProjectV2Input!) {{
  updateProjectV2(input: $input) {{ projectV2 {{ {PROJECT_SUMMARY_FIELDS} }} }}
}}"#
            ),
            json!({
                "input": {
                    "projectId": context.summary.id,
                    "title": update.title,
                    "shortDescription": update.short_description,
                    "readme": update.readme,
                    "public": update.public,
                    "closed": update.closed,
                }
            }),
        );
        let response: RawProjectMutationResponse =
            client.graphql(&payload).await.map_err(projects_error)?;
        let summary = response
            .update_project
            .and_then(|payload| payload.project_v2)
            .map(project_summary)
            .ok_or_else(|| AppError::GitHub("GitHub did not return the updated project".into()))?;
        ensure_same_project(&context.summary, &summary)?;
        Ok(summary)
    }

    async fn delete_project(&self, token: &str, number: u32) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let context = fetch_project_context(&client, number).await?;
        ensure_project_write(&context.summary)?;
        let payload = project_query_payload(
            format!(
                r#"mutation HarborDeletePersonalProject($input: DeleteProjectV2Input!) {{
  deleteProjectV2(input: $input) {{ projectV2 {{ {PROJECT_SUMMARY_FIELDS} }} }}
}}"#
            ),
            json!({ "input": { "projectId": context.summary.id } }),
        );
        let response: RawProjectMutationResponse =
            client.graphql(&payload).await.map_err(projects_error)?;
        if let Some(project) = response
            .delete_project
            .and_then(|payload| payload.project_v2)
            .map(project_summary)
        {
            ensure_same_project(&context.summary, &project)?;
        }
        Ok(())
    }

    async fn add_project_item(
        &self,
        token: &str,
        number: u32,
        addition: &GitHubProjectItemAddition,
    ) -> Result<GitHubProjectItem, AppError> {
        let client = authenticated_client(token)?;
        let context = fetch_project_context(&client, number).await?;
        ensure_project_write(&context.summary)?;
        let (query, variables, variant) = match addition {
            GitHubProjectItemAddition::DraftIssue { title, body } => (
                item_mutation(
                    "HarborAddProjectDraftIssue",
                    "addProjectV2DraftIssue",
                    "projectItem",
                    "AddProjectV2DraftIssueInput",
                ),
                json!({
                    "input": {
                        "projectId": context.summary.id,
                        "title": title,
                        "body": body,
                    }
                }),
                AddedItemVariant::Draft,
            ),
            GitHubProjectItemAddition::ExistingItem { url } => {
                let resource = resolve_project_resource(&client, url).await?;
                (
                    item_mutation(
                        "HarborAddProjectItem",
                        "addProjectV2ItemById",
                        "item",
                        "AddProjectV2ItemByIdInput",
                    ),
                    json!({
                        "input": {
                            "projectId": context.summary.id,
                            "contentId": resource.id,
                        }
                    }),
                    AddedItemVariant::Existing,
                )
            }
        };
        let payload = project_query_payload(query, variables);
        let response: RawProjectItemMutationResponse =
            client.graphql(&payload).await.map_err(projects_error)?;
        let item = match variant {
            AddedItemVariant::Draft => response.add_draft.and_then(|payload| payload.project_item),
            AddedItemVariant::Existing => response.add_existing.and_then(|payload| payload.item),
        }
        .ok_or_else(|| AppError::GitHub("GitHub did not return the added project item".into()))?;
        project_item(item)
    }

    async fn update_project_item(
        &self,
        token: &str,
        number: u32,
        item_id: &str,
        update: &GitHubProjectItemUpdate,
    ) -> Result<GitHubProjectItem, AppError> {
        let client = authenticated_client(token)?;
        let context = fetch_project_context(&client, number).await?;
        ensure_project_write(&context.summary)?;
        let current = fetch_project_item(&client, item_id).await?;
        ensure_project_item_scope(&context, &current)?;
        match update {
            GitHubProjectItemUpdate::DraftIssue { title, body } => {
                update_draft_item(&client, current, title, body).await
            }
            _ => update_project_item_field(&client, &context, current, update).await,
        }
    }

    async fn change_project_item(
        &self,
        token: &str,
        number: u32,
        item_id: &str,
        action: GitHubProjectItemAction,
    ) -> Result<Option<GitHubProjectItem>, AppError> {
        let client = authenticated_client(token)?;
        let context = fetch_project_context(&client, number).await?;
        ensure_project_write(&context.summary)?;
        let current = fetch_project_item(&client, item_id).await?;
        ensure_project_item_scope(&context, &current)?;
        change_project_item(&client, &context, current, action).await
    }
}

#[derive(Clone, Copy)]
enum AddedItemVariant {
    Draft,
    Existing,
}

async fn fetch_project_detail(
    client: &octocrab::Octocrab,
    number: u32,
    filters: &GitHubProjectItemFilters,
) -> Result<GitHubProjectDetail, AppError> {
    let payload = project_query_payload(
        project_detail_query(),
        json!({
            "number": number,
            "firstItems": PROJECT_ITEM_PAGE_SIZE,
            "afterItems": filters.after,
            "itemQuery": optional_text(&filters.query),
            "archivedStates": [if filters.archived { "ARCHIVED" } else { "NOT_ARCHIVED" }],
            "firstFields": PROJECT_FIELD_LIMIT,
            "firstViews": PROJECT_VIEW_LIMIT,
        }),
    );
    let response: RawProjectDetailResponse =
        client.graphql(&payload).await.map_err(projects_error)?;
    let project = response.viewer.project_v2.ok_or_else(|| {
        AppError::GitHub("GitHub could not find this project under the signed-in account".into())
    })?;
    project_detail(project, &response.viewer.login)
}

async fn fetch_project_context(
    client: &octocrab::Octocrab,
    number: u32,
) -> Result<ProjectContext, AppError> {
    let payload = project_query_payload(
        project_context_query(),
        json!({ "number": number, "firstFields": PROJECT_FIELD_LIMIT }),
    );
    let response: RawProjectContextResponse =
        client.graphql(&payload).await.map_err(projects_error)?;
    let project = response.viewer.project_v2.ok_or_else(|| {
        AppError::GitHub("GitHub could not find this project under the signed-in account".into())
    })?;
    let summary = project_summary(project.summary);
    ensure_project_owner_url(&summary, &response.viewer.login)?;
    Ok(ProjectContext {
        summary,
        owner_login: response.viewer.login,
        fields: project
            .fields
            .nodes
            .into_iter()
            .map(project_field)
            .collect(),
    })
}

async fn fetch_project_item(
    client: &octocrab::Octocrab,
    item_id: &str,
) -> Result<RawProjectItemNode, AppError> {
    let payload = project_query_payload(project_item_query(), json!({ "itemId": item_id }));
    let response: RawProjectItemResponse =
        client.graphql(&payload).await.map_err(projects_error)?;
    response.node.ok_or_else(|| {
        AppError::GitHub("GitHub could not find this item in the selected project".into())
    })
}

async fn fetch_viewer_identity(client: &octocrab::Octocrab) -> Result<RawViewerIdentity, AppError> {
    let payload = project_query_payload(
        "query HarborProjectViewer { viewer { id login } }".to_string(),
        json!({}),
    );
    let response: RawViewerIdentityResponse =
        client.graphql(&payload).await.map_err(projects_error)?;
    Ok(response.viewer)
}

async fn resolve_project_resource(
    client: &octocrab::Octocrab,
    url: &str,
) -> Result<RawResourceNode, AppError> {
    let resource = parse_project_item_url(url)?;
    let payload = project_query_payload(
        r#"query HarborProjectResource($owner: String!, $repository: String!, $number: Int!) {
  repository(owner: $owner, name: $repository) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue { id url }
      ... on PullRequest { id url }
    }
  }
}"#
        .to_string(),
        json!({
            "owner": resource.owner,
            "repository": resource.repository,
            "number": resource.number,
        }),
    );
    let response: RawResourceResponse = client.graphql(&payload).await.map_err(projects_error)?;
    let node = response
        .repository
        .and_then(|repository| repository.issue_or_pull_request)
        .ok_or_else(|| {
            AppError::Validation("the GitHub issue or pull request was not found".into())
        })?;
    if !matches!(node.type_name.as_str(), "Issue" | "PullRequest") || node.url != resource.url {
        return Err(AppError::Validation(
            "the GitHub URL did not resolve to the requested issue or pull request".into(),
        ));
    }
    Ok(node)
}

async fn update_draft_item(
    client: &octocrab::Octocrab,
    mut current: RawProjectItemNode,
    title: &str,
    body: &str,
) -> Result<GitHubProjectItem, AppError> {
    let content = current.item.content.as_ref().ok_or_else(|| {
        AppError::Validation("only a draft issue can be edited as project draft content".into())
    })?;
    if content.type_name != "DraftIssue" {
        return Err(AppError::Validation(
            "only a draft issue can be edited as project draft content".into(),
        ));
    }
    let draft_id = content
        .id
        .as_deref()
        .ok_or_else(|| AppError::GitHub("GitHub did not return the draft issue identity".into()))?;
    let payload = project_query_payload(
        r#"mutation HarborUpdateProjectDraftIssue($input: UpdateProjectV2DraftIssueInput!) {
  updateProjectV2DraftIssue(input: $input) { draftIssue { id title body } }
}"#
        .to_string(),
        json!({ "input": { "draftIssueId": draft_id, "title": title, "body": body } }),
    );
    let response: RawDraftIssueMutationResponse =
        client.graphql(&payload).await.map_err(projects_error)?;
    let draft = response
        .update_draft
        .and_then(|payload| payload.draft_issue)
        .ok_or_else(|| AppError::GitHub("GitHub did not return the updated draft issue".into()))?;
    if draft.id != draft_id {
        return Err(AppError::GitHub(
            "GitHub returned a different draft issue after the update".into(),
        ));
    }
    current.item.content = Some(RawProjectItemContent {
        type_name: "DraftIssue".into(),
        id: Some(draft.id),
        title: Some(draft.title),
        body: Some(draft.body),
        number: None,
        url: None,
        state: None,
        repository: None,
    });
    project_item(current.item)
}

async fn update_project_item_field(
    client: &octocrab::Octocrab,
    context: &ProjectContext,
    current: RawProjectItemNode,
    update: &GitHubProjectItemUpdate,
) -> Result<GitHubProjectItem, AppError> {
    let field_id = update
        .field_id()
        .ok_or_else(|| AppError::Validation("a project field is required".into()))?;
    let field = context
        .fields
        .iter()
        .find(|field| field.id == field_id)
        .ok_or_else(|| AppError::Validation("the field does not belong to this project".into()))?;
    validate_field_update(field, update)?;

    let (query, variables, cleared) = match update {
        GitHubProjectItemUpdate::ClearField { .. } => (
            item_mutation(
                "HarborClearProjectItemField",
                "clearProjectV2ItemFieldValue",
                "projectV2Item",
                "ClearProjectV2ItemFieldValueInput",
            ),
            json!({
                "input": {
                    "projectId": context.summary.id,
                    "itemId": current.item.id,
                    "fieldId": field_id,
                }
            }),
            true,
        ),
        _ => (
            item_mutation(
                "HarborUpdateProjectItemField",
                "updateProjectV2ItemFieldValue",
                "projectV2Item",
                "UpdateProjectV2ItemFieldValueInput",
            ),
            json!({
                "input": {
                    "projectId": context.summary.id,
                    "itemId": current.item.id,
                    "fieldId": field_id,
                    "value": field_update_value(update)?,
                }
            }),
            false,
        ),
    };
    let payload = project_query_payload(query, variables);
    let response: RawProjectItemMutationResponse =
        client.graphql(&payload).await.map_err(projects_error)?;
    let item = if cleared {
        response
            .clear_field
            .and_then(|payload| payload.project_v2_item)
    } else {
        response
            .update_field
            .and_then(|payload| payload.project_v2_item)
    }
    .ok_or_else(|| AppError::GitHub("GitHub did not return the updated project item".into()))?;
    if item.id != current.item.id {
        return Err(AppError::GitHub(
            "GitHub returned a different project item after the field update".into(),
        ));
    }
    project_item(item)
}

async fn change_project_item(
    client: &octocrab::Octocrab,
    context: &ProjectContext,
    current: RawProjectItemNode,
    action: GitHubProjectItemAction,
) -> Result<Option<GitHubProjectItem>, AppError> {
    let (operation, mutation_name, input_type, deleting) = match action {
        GitHubProjectItemAction::Archive => (
            "HarborArchiveProjectItem",
            "archiveProjectV2Item",
            "ArchiveProjectV2ItemInput",
            false,
        ),
        GitHubProjectItemAction::Unarchive => (
            "HarborUnarchiveProjectItem",
            "unarchiveProjectV2Item",
            "UnarchiveProjectV2ItemInput",
            false,
        ),
        GitHubProjectItemAction::Delete => (
            "HarborDeleteProjectItem",
            "deleteProjectV2Item",
            "DeleteProjectV2ItemInput",
            true,
        ),
    };
    if matches!(action, GitHubProjectItemAction::Archive) && current.item.archived {
        return Err(AppError::Validation(
            "this project item is already archived".into(),
        ));
    }
    if matches!(action, GitHubProjectItemAction::Unarchive) && !current.item.archived {
        return Err(AppError::Validation(
            "this project item is not archived".into(),
        ));
    }
    let query = if deleting {
        format!(
            r#"mutation {operation}($input: {input_type}!) {{
  {mutation_name}(input: $input) {{ deletedItemId }}
}}"#
        )
    } else {
        item_mutation(operation, mutation_name, "item", input_type)
    };
    let payload = project_query_payload(
        query,
        json!({
            "input": {
                "projectId": context.summary.id,
                "itemId": current.item.id,
            }
        }),
    );
    let response: RawProjectItemMutationResponse =
        client.graphql(&payload).await.map_err(projects_error)?;
    if deleting {
        let deleted = response.delete.and_then(|payload| payload.deleted_item_id);
        if deleted.as_deref() != Some(current.item.id.as_str()) {
            return Err(AppError::GitHub(
                "GitHub did not confirm the deleted project item".into(),
            ));
        }
        return Ok(None);
    }
    let item = match action {
        GitHubProjectItemAction::Archive => response.archive.and_then(|payload| payload.item),
        GitHubProjectItemAction::Unarchive => response.unarchive.and_then(|payload| payload.item),
        GitHubProjectItemAction::Delete => None,
    }
    .ok_or_else(|| AppError::GitHub("GitHub did not return the changed project item".into()))?;
    if item.id != current.item.id {
        return Err(AppError::GitHub(
            "GitHub returned a different project item after the change".into(),
        ));
    }
    project_item(item).map(Some)
}

#[derive(Debug)]
struct ProjectContext {
    summary: GitHubProjectSummary,
    owner_login: String,
    fields: Vec<GitHubProjectField>,
}

fn project_detail(
    project: RawProjectDetail,
    owner_login: &str,
) -> Result<GitHubProjectDetail, AppError> {
    let summary = project_summary(project.summary);
    ensure_project_owner_url(&summary, owner_login)?;
    let items = GitHubProjectItemPage {
        items: project
            .items
            .nodes
            .into_iter()
            .map(project_item)
            .collect::<Result<Vec<_>, _>>()?,
        total_count: project.items.total_count,
        end_cursor: project.items.page_info.end_cursor,
        has_more: project.items.page_info.has_next_page,
    };
    Ok(GitHubProjectDetail {
        project: summary,
        readme: project.readme.unwrap_or_default(),
        fields: project
            .fields
            .nodes
            .into_iter()
            .map(project_field)
            .collect(),
        views: project
            .views
            .nodes
            .into_iter()
            .map(project_view)
            .collect::<Result<Vec<_>, _>>()?,
        items,
    })
}

fn project_summary(project: RawProjectSummary) -> GitHubProjectSummary {
    GitHubProjectSummary {
        id: project.id,
        number: project.number,
        title: project.title,
        short_description: project.short_description,
        url: project.url,
        public: project.public,
        closed: project.closed,
        item_count: project.item_count.total_count,
        updated_at: project.updated_at,
        viewer_can_update: project.viewer_can_update,
        viewer_can_close: project.viewer_can_close,
        viewer_can_reopen: project.viewer_can_reopen,
    }
}

fn project_view(view: RawProjectView) -> Result<GitHubProjectView, AppError> {
    let layout = match view.layout.as_str() {
        "BOARD_LAYOUT" => GitHubProjectViewLayout::Board,
        "TABLE_LAYOUT" => GitHubProjectViewLayout::Table,
        "ROADMAP_LAYOUT" => GitHubProjectViewLayout::Roadmap,
        value => {
            return Err(AppError::GitHub(format!(
                "GitHub returned an unsupported project view layout: {value}"
            )))
        }
    };
    Ok(GitHubProjectView {
        id: view.id,
        number: view.number,
        name: view.name,
        layout,
        filter: view.filter.unwrap_or_default(),
        visible_field_ids: view
            .configuration
            .visible_fields
            .nodes
            .into_iter()
            .map(|field| field.id)
            .collect(),
        group_by_field_ids: view
            .group_by_fields
            .nodes
            .into_iter()
            .map(|field| field.id)
            .collect(),
        vertical_group_by_field_ids: view
            .vertical_group_by_fields
            .nodes
            .into_iter()
            .map(|field| field.id)
            .collect(),
    })
}

fn project_field(field: RawProjectField) -> GitHubProjectField {
    let data_type = project_field_type(&field.data_type);
    let options = if field.type_name == "ProjectV2MultiSelectField" {
        field.multi_select_options
    } else {
        field.options
    }
    .into_iter()
    .map(project_field_option)
    .collect();
    let mut iterations = Vec::new();
    if let Some(configuration) = field.configuration {
        iterations.extend(
            configuration
                .iterations
                .into_iter()
                .map(|iteration| project_iteration(iteration, false)),
        );
        iterations.extend(
            configuration
                .completed_iterations
                .into_iter()
                .map(|iteration| project_iteration(iteration, true)),
        );
    }
    GitHubProjectField {
        id: field.id,
        name: field.name,
        data_type,
        issue_field: field.issue_field,
        editable: data_type.editable(),
        options,
        iterations,
    }
}

fn project_field_option(option: RawProjectFieldOption) -> GitHubProjectFieldOption {
    GitHubProjectFieldOption {
        id: option.id,
        name: option.name,
        color: option.color.to_ascii_lowercase(),
        description: option.description,
    }
}

fn project_iteration(iteration: RawProjectIteration, completed: bool) -> GitHubProjectIteration {
    GitHubProjectIteration {
        id: iteration.id,
        title: iteration.title,
        start_date: iteration.start_date,
        duration: iteration.duration,
        completed,
    }
}

fn project_item(item: RawProjectItem) -> Result<GitHubProjectItem, AppError> {
    Ok(GitHubProjectItem {
        id: item.id,
        archived: item.archived,
        content: project_item_content(item.content)?,
        field_values: item
            .field_values
            .nodes
            .into_iter()
            .flatten()
            .filter_map(project_field_value)
            .collect(),
        created_at: item.created_at,
        updated_at: item.updated_at,
    })
}

fn project_item_content(
    content: Option<RawProjectItemContent>,
) -> Result<GitHubProjectItemContent, AppError> {
    let Some(content) = content else {
        return Ok(GitHubProjectItemContent::Redacted);
    };
    match content.type_name.as_str() {
        "DraftIssue" => Ok(GitHubProjectItemContent::DraftIssue {
            id: required(content.id, "draft issue ID")?,
            title: required(content.title, "draft issue title")?,
            body: content.body.unwrap_or_default(),
        }),
        "Issue" => Ok(GitHubProjectItemContent::Issue {
            id: required(content.id, "issue ID")?,
            title: required(content.title, "issue title")?,
            body: content.body.unwrap_or_default(),
            number: required(content.number, "issue number")?,
            url: required(content.url, "issue URL")?,
            state: required(content.state, "issue state")?.to_ascii_lowercase(),
            repository: project_repository(required(content.repository, "issue repository")?),
        }),
        "PullRequest" => Ok(GitHubProjectItemContent::PullRequest {
            id: required(content.id, "pull request ID")?,
            title: required(content.title, "pull request title")?,
            body: content.body.unwrap_or_default(),
            number: required(content.number, "pull request number")?,
            url: required(content.url, "pull request URL")?,
            state: required(content.state, "pull request state")?.to_ascii_lowercase(),
            repository: project_repository(required(
                content.repository,
                "pull request repository",
            )?),
        }),
        _ => Ok(GitHubProjectItemContent::Redacted),
    }
}

fn project_repository(repository: RawProjectRepository) -> GitHubProjectRepository {
    GitHubProjectRepository {
        owner: repository.owner.login,
        name: repository.name,
        full_name: repository.full_name,
        url: repository.url,
        default_branch: repository
            .default_branch_ref
            .map(|branch| branch.name)
            .unwrap_or_else(|| "HEAD".into()),
    }
}

fn project_field_value(value: RawProjectFieldValue) -> Option<GitHubProjectFieldValue> {
    let field_id = value.field?.id;
    match value.type_name.as_str() {
        "ProjectV2ItemFieldTextValue" => Some(GitHubProjectFieldValue::Text {
            field_id,
            text: value.text.unwrap_or_default(),
        }),
        "ProjectV2ItemFieldNumberValue" => Some(GitHubProjectFieldValue::Number {
            field_id,
            number: value.number?,
        }),
        "ProjectV2ItemFieldDateValue" => Some(GitHubProjectFieldValue::Date {
            field_id,
            date: value.date?,
        }),
        "ProjectV2ItemFieldSingleSelectValue" => Some(GitHubProjectFieldValue::SingleSelect {
            field_id,
            option_id: value.option_id?,
            name: value.name.unwrap_or_default(),
            color: value
                .color
                .unwrap_or_else(|| "gray".into())
                .to_ascii_lowercase(),
        }),
        "ProjectV2ItemFieldMultiSelectValue" => Some(GitHubProjectFieldValue::MultiSelect {
            field_id,
            options: value
                .options
                .unwrap_or_default()
                .into_iter()
                .map(project_field_option)
                .collect(),
        }),
        "ProjectV2ItemFieldIterationValue" => Some(GitHubProjectFieldValue::Iteration {
            field_id,
            iteration_id: value.iteration_id?,
            title: value.title.unwrap_or_default(),
            start_date: value.start_date.unwrap_or_default(),
            duration: value.duration.unwrap_or_default(),
        }),
        "ProjectV2ItemFieldLabelValue" => Some(GitHubProjectFieldValue::Labels {
            field_id,
            labels: value
                .labels
                .map(|labels| {
                    labels
                        .nodes
                        .into_iter()
                        .map(|label| GitHubProjectLabel {
                            name: label.name,
                            color: label.color,
                        })
                        .collect()
                })
                .unwrap_or_default(),
        }),
        "ProjectV2ItemFieldUserValue" => Some(GitHubProjectFieldValue::Users {
            field_id,
            users: value
                .users
                .map(|users| {
                    users
                        .nodes
                        .into_iter()
                        .map(|user| GitHubProjectUser {
                            login: user.login,
                            avatar_url: user.avatar_url,
                        })
                        .collect()
                })
                .unwrap_or_default(),
        }),
        "ProjectV2ItemFieldMilestoneValue" => Some(GitHubProjectFieldValue::Milestone {
            field_id,
            title: value.milestone?.title,
        }),
        "ProjectV2ItemFieldRepositoryValue" => {
            let repository = value.repository?;
            Some(GitHubProjectFieldValue::Repository {
                field_id,
                full_name: repository.full_name,
                url: repository.url,
            })
        }
        _ => None,
    }
}

fn project_field_type(value: &str) -> GitHubProjectFieldType {
    match value {
        "ASSIGNEES" => GitHubProjectFieldType::Assignees,
        "LINKED_PULL_REQUESTS" => GitHubProjectFieldType::LinkedPullRequests,
        "REVIEWERS" => GitHubProjectFieldType::Reviewers,
        "LABELS" => GitHubProjectFieldType::Labels,
        "MILESTONE" => GitHubProjectFieldType::Milestone,
        "REPOSITORY" => GitHubProjectFieldType::Repository,
        "TITLE" => GitHubProjectFieldType::Title,
        "TEXT" => GitHubProjectFieldType::Text,
        "SINGLE_SELECT" => GitHubProjectFieldType::SingleSelect,
        "MULTI_SELECT" => GitHubProjectFieldType::MultiSelect,
        "NUMBER" => GitHubProjectFieldType::Number,
        "DATE" => GitHubProjectFieldType::Date,
        "ITERATION" => GitHubProjectFieldType::Iteration,
        "TRACKS" => GitHubProjectFieldType::Tracks,
        "TRACKED_BY" => GitHubProjectFieldType::TrackedBy,
        "ISSUE_TYPE" => GitHubProjectFieldType::IssueType,
        "PARENT_ISSUE" => GitHubProjectFieldType::ParentIssue,
        "SUB_ISSUES_PROGRESS" => GitHubProjectFieldType::SubIssuesProgress,
        "CREATED" => GitHubProjectFieldType::Created,
        "UPDATED" => GitHubProjectFieldType::Updated,
        "CLOSED" => GitHubProjectFieldType::Closed,
        _ => GitHubProjectFieldType::Other,
    }
}

fn projects_search_query(filters: &GitHubProjectFilters) -> Option<String> {
    let state = match filters.state {
        GitHubProjectStateFilter::Open => Some("is:open"),
        GitHubProjectStateFilter::Closed => Some("is:closed"),
        GitHubProjectStateFilter::All => None,
    };
    let query = filters.query.trim();
    match (state, query.is_empty()) {
        (Some(state), false) => Some(format!("{state} {query}")),
        (Some(state), true) => Some(state.into()),
        (None, false) => Some(query.into()),
        (None, true) => None,
    }
}

fn project_order_field(sort: GitHubProjectSort) -> &'static str {
    match sort {
        GitHubProjectSort::Updated => "UPDATED_AT",
        GitHubProjectSort::Created => "CREATED_AT",
        GitHubProjectSort::Title => "TITLE",
    }
}

fn optional_text(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn ensure_project_owner_url(
    project: &GitHubProjectSummary,
    owner_login: &str,
) -> Result<(), AppError> {
    let expected = format!(
        "https://github.com/users/{owner_login}/projects/{}",
        project.number
    );
    if project.url.trim_end_matches('/') != expected {
        return Err(AppError::GitHubPermission(
            "Harbor only manages projects owned by the signed-in personal account".into(),
        ));
    }
    Ok(())
}

fn ensure_project_write(project: &GitHubProjectSummary) -> Result<(), AppError> {
    if project.viewer_can_update {
        Ok(())
    } else {
        Err(AppError::GitHubPermission(
            "the signed-in account cannot update this personal project".into(),
        ))
    }
}

fn ensure_same_project(
    expected: &GitHubProjectSummary,
    actual: &GitHubProjectSummary,
) -> Result<(), AppError> {
    if expected.id == actual.id && expected.number == actual.number {
        Ok(())
    } else {
        Err(AppError::GitHub(
            "GitHub returned a different project after the mutation".into(),
        ))
    }
}

fn ensure_project_item_scope(
    context: &ProjectContext,
    item: &RawProjectItemNode,
) -> Result<(), AppError> {
    if item.project.id != context.summary.id || item.project.number != context.summary.number {
        return Err(AppError::Validation(
            "the item does not belong to the selected project".into(),
        ));
    }
    if item.project.owner.type_name != "User"
        || item.project.owner.login.as_deref() != Some(context.owner_login.as_str())
    {
        return Err(AppError::GitHubPermission(
            "Harbor only changes items in projects owned by the signed-in personal account".into(),
        ));
    }
    Ok(())
}

fn validate_field_update(
    field: &GitHubProjectField,
    update: &GitHubProjectItemUpdate,
) -> Result<(), AppError> {
    if matches!(update, GitHubProjectItemUpdate::ClearField { .. }) {
        return if field.editable {
            Ok(())
        } else {
            Err(AppError::Validation(
                "this project field is read-only".into(),
            ))
        };
    }
    let correct_type = matches!(
        (field.data_type, update),
        (
            GitHubProjectFieldType::Text,
            GitHubProjectItemUpdate::Text { .. }
        ) | (
            GitHubProjectFieldType::Number,
            GitHubProjectItemUpdate::Number { .. }
        ) | (
            GitHubProjectFieldType::Date,
            GitHubProjectItemUpdate::Date { .. }
        ) | (
            GitHubProjectFieldType::SingleSelect,
            GitHubProjectItemUpdate::SingleSelect { .. }
        ) | (
            GitHubProjectFieldType::MultiSelect,
            GitHubProjectItemUpdate::MultiSelect { .. }
        ) | (
            GitHubProjectFieldType::Iteration,
            GitHubProjectItemUpdate::Iteration { .. }
        )
    );
    if !correct_type {
        return Err(AppError::Validation(
            "the project field update does not match the field type".into(),
        ));
    }
    match update {
        GitHubProjectItemUpdate::SingleSelect { option_id, .. } => {
            ensure_option(&field.options, option_id)
        }
        GitHubProjectItemUpdate::MultiSelect { option_ids, .. } => {
            if option_ids.len() > field.options.len() {
                return Err(AppError::Validation(
                    "the project field update contains too many options".into(),
                ));
            }
            for option_id in option_ids {
                ensure_option(&field.options, option_id)?;
            }
            Ok(())
        }
        GitHubProjectItemUpdate::Iteration { iteration_id, .. } => {
            if field
                .iterations
                .iter()
                .any(|iteration| iteration.id == *iteration_id)
            {
                Ok(())
            } else {
                Err(AppError::Validation(
                    "the iteration does not belong to this project field".into(),
                ))
            }
        }
        GitHubProjectItemUpdate::Number { number, .. } if !number.is_finite() => Err(
            AppError::Validation("the project number field must be finite".into()),
        ),
        _ => Ok(()),
    }
}

fn ensure_option(options: &[GitHubProjectFieldOption], option_id: &str) -> Result<(), AppError> {
    if options.iter().any(|option| option.id == option_id) {
        Ok(())
    } else {
        Err(AppError::Validation(
            "the option does not belong to this project field".into(),
        ))
    }
}

fn field_update_value(update: &GitHubProjectItemUpdate) -> Result<Value, AppError> {
    match update {
        GitHubProjectItemUpdate::Text { text, .. } => Ok(json!({ "text": text })),
        GitHubProjectItemUpdate::Number { number, .. } => Ok(json!({ "number": number })),
        GitHubProjectItemUpdate::Date { date, .. } => Ok(json!({ "date": date })),
        GitHubProjectItemUpdate::SingleSelect { option_id, .. } => {
            Ok(json!({ "singleSelectOptionId": option_id }))
        }
        GitHubProjectItemUpdate::MultiSelect { option_ids, .. } => {
            Ok(json!({ "multiSelectOptionIds": option_ids }))
        }
        GitHubProjectItemUpdate::Iteration { iteration_id, .. } => {
            Ok(json!({ "iterationId": iteration_id }))
        }
        GitHubProjectItemUpdate::DraftIssue { .. } | GitHubProjectItemUpdate::ClearField { .. } => {
            Err(AppError::Validation(
                "this project item update does not set a field value".into(),
            ))
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ParsedProjectItemUrl {
    owner: String,
    repository: String,
    number: u32,
    url: String,
}

fn parse_project_item_url(value: &str) -> Result<ParsedProjectItemUrl, AppError> {
    let url = reqwest::Url::parse(value.trim()).map_err(|_| {
        AppError::Validation("enter a complete GitHub issue or pull request URL".into())
    })?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AppError::Validation(
            "enter a complete github.com issue or pull request URL".into(),
        ));
    }
    let segments = url
        .path_segments()
        .map(|segments| {
            segments
                .filter(|segment| !segment.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if segments.len() != 4 || !matches!(segments[2], "issues" | "pull") {
        return Err(AppError::Validation(
            "enter a GitHub issue or pull request URL".into(),
        ));
    }
    let number = segments[3]
        .parse::<u32>()
        .ok()
        .filter(|number| *number > 0 && *number <= i32::MAX as u32)
        .ok_or_else(|| AppError::Validation("the GitHub item number is invalid".into()))?;
    let canonical = format!(
        "https://github.com/{}/{}/{}/{}",
        segments[0], segments[1], segments[2], number
    );
    Ok(ParsedProjectItemUrl {
        owner: segments[0].into(),
        repository: segments[1].into(),
        number,
        url: canonical,
    })
}

fn required<T>(value: Option<T>, field: &str) -> Result<T, AppError> {
    value.ok_or_else(|| {
        AppError::GitHub(format!("GitHub did not return the project item's {field}"))
    })
}

fn projects_error(error: octocrab::Error) -> AppError {
    let message = error.to_string();
    let lower = message.to_ascii_lowercase();
    if lower.contains("required scope")
        || lower.contains("required scopes")
        || lower.contains("read:project")
        || lower.contains("insufficient_scopes")
    {
        AppError::GitHubPermission(
            "reconnect GitHub and grant the project scope to manage personal Projects".into(),
        )
    } else {
        github_error(error)
    }
}

#[cfg(test)]
#[async_trait]
impl GitHubProjectsClient for super::tests::FakeGitHubClient {
    async fn list_projects(
        &self,
        token: &str,
        _filters: &GitHubProjectFilters,
    ) -> Result<GitHubProjectPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        Ok(GitHubProjectPage {
            projects: Vec::new(),
            total_count: 0,
            end_cursor: None,
            has_more: false,
        })
    }

    async fn project(
        &self,
        _token: &str,
        _number: u32,
        _filters: &GitHubProjectItemFilters,
    ) -> Result<GitHubProjectDetail, AppError> {
        Err(AppError::GitHub("project fixture is unavailable".into()))
    }

    async fn create_project(
        &self,
        _token: &str,
        _title: &str,
    ) -> Result<GitHubProjectSummary, AppError> {
        Err(AppError::GitHub("project fixture is unavailable".into()))
    }

    async fn update_project(
        &self,
        _token: &str,
        _number: u32,
        _update: &GitHubProjectUpdate,
    ) -> Result<GitHubProjectSummary, AppError> {
        Err(AppError::GitHub("project fixture is unavailable".into()))
    }

    async fn delete_project(&self, _token: &str, _number: u32) -> Result<(), AppError> {
        Err(AppError::GitHub("project fixture is unavailable".into()))
    }

    async fn add_project_item(
        &self,
        _token: &str,
        _number: u32,
        _addition: &GitHubProjectItemAddition,
    ) -> Result<GitHubProjectItem, AppError> {
        Err(AppError::GitHub("project fixture is unavailable".into()))
    }

    async fn update_project_item(
        &self,
        _token: &str,
        _number: u32,
        _item_id: &str,
        _update: &GitHubProjectItemUpdate,
    ) -> Result<GitHubProjectItem, AppError> {
        Err(AppError::GitHub("project fixture is unavailable".into()))
    }

    async fn change_project_item(
        &self,
        _token: &str,
        _number: u32,
        _item_id: &str,
        _action: GitHubProjectItemAction,
    ) -> Result<Option<GitHubProjectItem>, AppError> {
        Err(AppError::GitHub("project fixture is unavailable".into()))
    }
}

#[cfg(test)]
#[path = "projects/tests.rs"]
mod tests;
