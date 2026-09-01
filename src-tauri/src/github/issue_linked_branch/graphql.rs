use serde::Deserialize;

pub(super) const LINKED_BRANCH_PAGE_SIZE: i32 = 50;
pub(super) const MAX_LINKED_BRANCH_PAGES: usize = 20;

pub(super) const LINKED_BRANCH_QUERY: &str = r#"
query HarborIssueLinkedBranches(
  $owner: String!
  $repository: String!
  $number: Int!
  $first: Int!
  $after: String
) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
    defaultBranchRef {
      name
      target { ... on Commit { oid } }
    }
    issue(number: $number) {
      id
      number
      linkedBranches(first: $first, after: $after) {
        totalCount
        nodes {
          id
          ref {
            name
            repository { id nameWithOwner }
            target { ... on Commit { oid } }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}
"#;

pub(super) const CREATE_LINKED_BRANCH_MUTATION: &str = r#"
mutation HarborCreateIssueLinkedBranch($issueId: ID!, $oid: GitObjectID!, $name: String, $repositoryId: ID!) {
  createLinkedBranch(input: { issueId: $issueId, oid: $oid, name: $name, repositoryId: $repositoryId }) {
    issue { id number repository { id nameWithOwner } }
    linkedBranch {
      id
      ref {
        name
        repository { id nameWithOwner }
        target { ... on Commit { oid } }
      }
    }
  }
}
"#;

pub(super) const LINKED_BRANCH_DESTINATION_QUERY: &str = r#"
query HarborIssueLinkedBranchDestination($owner: String!, $repository: String!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
    defaultBranchRef {
      name
      target { ... on Commit { oid } }
    }
  }
}
"#;

pub(super) const DELETE_LINKED_BRANCH_MUTATION: &str = r#"
mutation HarborDeleteIssueLinkedBranch($linkedBranchId: ID!) {
  deleteLinkedBranch(input: { linkedBranchId: $linkedBranchId }) {
    issue { id number repository { id nameWithOwner } }
  }
}
"#;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedBranchQueryResponse {
    pub(super) repository: Option<LinkedBranchRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedBranchDestinationResponse {
    pub(super) repository: Option<LinkedBranchRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedBranchRepository {
    pub(super) id: String,
    pub(super) name_with_owner: String,
    pub(super) viewer_permission: Option<String>,
    pub(super) default_branch_ref: Option<GraphQlRef>,
    pub(super) issue: Option<LinkedBranchIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedBranchIssue {
    pub(super) id: String,
    pub(super) number: u64,
    pub(super) linked_branches: Option<LinkedBranchConnection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedBranchConnection {
    pub(super) nodes: Vec<Option<GraphQlLinkedBranch>>,
    pub(super) page_info: GraphQlPageInfo,
    #[allow(dead_code)]
    pub(super) total_count: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GraphQlPageInfo {
    pub(super) has_next_page: bool,
    pub(super) end_cursor: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GraphQlLinkedBranch {
    pub(super) id: String,
    #[serde(rename = "ref")]
    pub(super) r#ref: Option<GraphQlRef>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GraphQlRef {
    pub(super) name: String,
    pub(super) repository: Option<GraphQlRepositoryIdentity>,
    pub(super) target: Option<GraphQlTarget>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GraphQlTarget {
    pub(super) oid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct GraphQlRepositoryIdentity {
    pub(super) id: String,
    pub(super) name_with_owner: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateLinkedBranchResponse {
    pub(super) create_linked_branch: Option<CreateLinkedBranchPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateLinkedBranchPayload {
    pub(super) issue: Option<LinkedBranchMutationIssue>,
    pub(super) linked_branch: Option<GraphQlLinkedBranch>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DeleteLinkedBranchResponse {
    pub(super) delete_linked_branch: Option<DeleteLinkedBranchPayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DeleteLinkedBranchPayload {
    pub(super) issue: Option<LinkedBranchMutationIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LinkedBranchMutationIssue {
    pub(super) id: String,
    pub(super) number: u64,
    pub(super) repository: Option<GraphQlRepositoryIdentity>,
}
