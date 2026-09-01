use std::collections::HashSet;

use async_trait::async_trait;
use octocrab::FromResponse;
use serde::{Deserialize, Serialize};

use super::{
    authenticated_client, github_error,
    issue_related::{api_request, graphql_node_id_is_valid},
    GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_TYPE_ROUTE: &str = "/repos/{owner}/{repository}/issue-types";

const ISSUE_TYPE_STATUS_QUERY: &str = r#"
query HarborIssueTypeStatus($owner: String!, $repository: String!, $issueNumber: Int!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    issue(number: $issueNumber) {
      id
      number
      viewerCanUpdate
      issueType {
        id
        name
        description
      }
    }
  }
}
"#;

const UPDATE_ISSUE_TYPE_MUTATION: &str = r#"
mutation HarborUpdateIssueType($issueId: ID!, $issueTypeId: ID) {
  updateIssueIssueType(input: {
    issueId: $issueId
    issueTypeId: $issueTypeId
  }) {
    issue {
      id
      number
      viewerCanUpdate
      issueType {
        id
        name
        description
      }
      repository { id nameWithOwner }
    }
  }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueType {
    pub id: Option<u64>,
    pub node_id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTypeStatus {
    pub repository_id: String,
    pub repository_full_name: String,
    pub issue_node_id: String,
    pub issue_number: u64,
    pub current_issue_type: Option<GitHubIssueType>,
    pub available_issue_types: Vec<GitHubIssueType>,
    pub viewer_can_update: bool,
}

#[derive(Clone, Copy)]
pub(crate) struct IssueTypeMutation<'a> {
    pub(crate) owner: &'a str,
    pub(crate) repository: &'a str,
    pub(crate) issue_number: u64,
    pub(crate) expected_issue_node_id: &'a str,
    pub(crate) expected_issue_type_node_id: Option<&'a str>,
    pub(crate) issue_type_node_id: Option<&'a str>,
}

#[async_trait]
pub(crate) trait GitHubIssueTypeClient: Send + Sync {
    async fn issue_type_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueTypeStatus, AppError>;

    async fn update_issue_type(
        &self,
        token: &str,
        mutation: IssueTypeMutation<'_>,
    ) -> Result<GitHubIssueTypeStatus, AppError>;
}

impl GitHubService {
    pub async fn issue_type_status(
        &self,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .issue_type_status(&token, owner, repository, issue_number)
            .await
    }

    pub async fn update_issue_type(
        &self,
        mutation: IssueTypeMutation<'_>,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        let token = self.load_access_token().await?;
        self.client.update_issue_type(&token, mutation).await
    }
}

#[async_trait]
impl GitHubIssueTypeClient for OctocrabGitHubClient {
    async fn issue_type_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        let client = authenticated_client(token)?;
        load_issue_type_status_with_client(&client, owner, repository, issue_number).await
    }

    async fn update_issue_type(
        &self,
        token: &str,
        mutation: IssueTypeMutation<'_>,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        let read_client = authenticated_client(token)?;
        let status = load_issue_type_status_with_client(
            &read_client,
            mutation.owner,
            mutation.repository,
            mutation.issue_number,
        )
        .await?;
        ensure_issue_type_preflight(&status, mutation)?;

        let write_client = issue_type_client(token)?;
        let returned = execute_issue_type_update(&write_client, mutation, &status).await?;
        let postflight = load_issue_type_status_with_client(
            &write_client,
            mutation.owner,
            mutation.repository,
            mutation.issue_number,
        )
        .await
        .map_err(|error| post_write_error(error, mutation.issue_number))?;
        ensure_issue_type_postflight(&postflight, &returned, mutation)?;
        Ok(postflight)
    }
}

async fn load_issue_type_status_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    issue_number: u64,
) -> Result<GitHubIssueTypeStatus, AppError> {
    let number = i32::try_from(issue_number).map_err(|_| {
        AppError::Validation("issue number is too large for GitHub GraphQL".to_string())
    })?;
    let payload = serde_json::json!({
        "query": ISSUE_TYPE_STATUS_QUERY,
        "variables": {"owner": owner, "repository": repository, "issueNumber": number},
    });
    let response: IssueTypeStatusResponse = client.graphql(&payload).await.map_err(github_error)?;
    let repository_node = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue type repository".to_string())
    })?;
    ensure_repository_identity(
        &repository_node.id,
        &repository_node.name_with_owner,
        owner,
        repository,
    )?;
    let issue = repository_node.issue.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the requested Issue for its type".to_string())
    })?;
    if issue.number != issue_number || !graphql_node_id_is_valid(&issue.id) {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected Issue type identity".to_string(),
        ));
    }
    let available_issue_types = load_issue_types_with_client(client, owner, repository).await?;
    let current_issue_type = issue.issue_type.map(issue_type_from_graphql).transpose()?;
    Ok(GitHubIssueTypeStatus {
        repository_id: repository_node.id,
        repository_full_name: repository_node.name_with_owner,
        issue_node_id: issue.id,
        issue_number: issue.number,
        current_issue_type,
        available_issue_types,
        viewer_can_update: issue.viewer_can_update,
    })
}

async fn load_issue_types_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<Vec<GitHubIssueType>, AppError> {
    let route = ISSUE_TYPE_ROUTE
        .replace("{owner}", owner)
        .replace("{repository}", repository);
    let request = api_request(client, route)?;
    let response = client.execute(request).await.map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    let values = serde_json::Value::from_response(response)
        .await
        .map_err(|error| {
            AppError::GitHub(format!("GitHub returned invalid issue types: {error}"))
        })?;
    issue_types_from_rest_value(values)
}

fn issue_types_from_rest_value(value: serde_json::Value) -> Result<Vec<GitHubIssueType>, AppError> {
    let values = value.as_array().ok_or_else(|| {
        AppError::GitHub("GitHub returned invalid issue types: expected an array".to_string())
    })?;
    let mut ids = HashSet::with_capacity(values.len());
    values
        .iter()
        .cloned()
        .map(issue_type_from_rest_value)
        .map(|result| {
            let issue_type = result?;
            if !ids.insert(issue_type.node_id.clone()) {
                return Err(AppError::GitHub(
                    "GitHub returned duplicate Issue types".to_string(),
                ));
            }
            Ok(issue_type)
        })
        .collect()
}

fn issue_type_from_rest_value(value: serde_json::Value) -> Result<GitHubIssueType, AppError> {
    let id = value
        .get("id")
        .and_then(serde_json::Value::as_u64)
        .filter(|id| *id > 0)
        .ok_or_else(|| AppError::GitHub("GitHub returned an invalid Issue type ID".to_string()))?;
    let node_id = value
        .get("node_id")
        .and_then(serde_json::Value::as_str)
        .filter(|id| graphql_node_id_is_valid(id))
        .ok_or_else(|| {
            AppError::GitHub("GitHub returned an invalid Issue type node ID".to_string())
        })?
        .to_string();
    let name = value
        .get("name")
        .and_then(serde_json::Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| AppError::GitHub("GitHub returned an invalid Issue type name".to_string()))?
        .to_string();
    let description = value
        .get("description")
        .and_then(|value| value.as_str().map(str::to_string));
    Ok(GitHubIssueType {
        id: Some(id),
        node_id,
        name,
        description,
    })
}

fn ensure_issue_type_preflight(
    status: &GitHubIssueTypeStatus,
    mutation: IssueTypeMutation<'_>,
) -> Result<(), AppError> {
    if status.issue_node_id != mutation.expected_issue_node_id {
        return Err(AppError::GitHubIssueStateConflict(
            "the Issue changed; refresh before updating its type".to_string(),
        ));
    }
    let current_id = status
        .current_issue_type
        .as_ref()
        .map(|issue_type| issue_type.node_id.as_str());
    if current_id != mutation.expected_issue_type_node_id {
        return Err(AppError::GitHubIssueStateConflict(
            "the Issue type changed; refresh before updating it".to_string(),
        ));
    }
    if !status.viewer_can_update {
        return Err(AppError::GitHubPermission(
            "write access is required to update an Issue type".to_string(),
        ));
    }
    if mutation.issue_type_node_id == mutation.expected_issue_type_node_id {
        return Err(AppError::Validation(
            "the Issue already has the selected type".to_string(),
        ));
    }
    if let Some(issue_type_id) = mutation.issue_type_node_id {
        if !graphql_node_id_is_valid(issue_type_id)
            || !status
                .available_issue_types
                .iter()
                .any(|issue_type| issue_type.node_id == issue_type_id)
        {
            return Err(AppError::Validation(
                "the selected Issue type is not available in this repository".to_string(),
            ));
        }
    }
    Ok(())
}

async fn execute_issue_type_update(
    client: &octocrab::Octocrab,
    mutation: IssueTypeMutation<'_>,
    status: &GitHubIssueTypeStatus,
) -> Result<IssueTypeIssue, AppError> {
    let payload = issue_type_update_payload(&status.issue_node_id, mutation.issue_type_node_id);
    let response: UpdateIssueTypeResponse = client
        .graphql(&payload)
        .await
        .map_err(issue_type_write_error)?;
    let issue = response
        .update_issue_issue_type
        .and_then(|payload| payload.issue)
        .ok_or_else(|| {
            confirmation_error(mutation.issue_number, "the mutation returned no Issue")
        })?;
    if issue.id != status.issue_node_id
        || issue.number != mutation.issue_number
        || issue.repository.as_ref().is_none_or(|repository| {
            repository.id != status.repository_id
                || !repository
                    .name_with_owner
                    .eq_ignore_ascii_case(&status.repository_full_name)
        })
    {
        return Err(confirmation_error(
            mutation.issue_number,
            "the mutation returned a different Issue",
        ));
    }
    Ok(issue)
}

fn ensure_issue_type_postflight(
    status: &GitHubIssueTypeStatus,
    returned: &IssueTypeIssue,
    mutation: IssueTypeMutation<'_>,
) -> Result<(), AppError> {
    let returned_type_id = returned
        .issue_type
        .as_ref()
        .map(|issue_type| issue_type.id.as_str());
    let status_type_id = status
        .current_issue_type
        .as_ref()
        .map(|issue_type| issue_type.node_id.as_str());
    if status.issue_node_id != mutation.expected_issue_node_id
        || status.issue_node_id != returned.id
        || status.issue_number != mutation.issue_number
        || status_type_id != mutation.issue_type_node_id
        || returned_type_id != mutation.issue_type_node_id
    {
        return Err(confirmation_error(
            mutation.issue_number,
            "the Issue type did not persist",
        ));
    }
    Ok(())
}

fn issue_type_update_payload(issue_id: &str, issue_type_id: Option<&str>) -> serde_json::Value {
    serde_json::json!({
        "query": UPDATE_ISSUE_TYPE_MUTATION,
        "variables": {"issueId": issue_id, "issueTypeId": issue_type_id},
    })
}

fn ensure_repository_identity(
    id: &str,
    name_with_owner: &str,
    owner: &str,
    repository: &str,
) -> Result<(), AppError> {
    if !graphql_node_id_is_valid(id)
        || !name_with_owner.eq_ignore_ascii_case(&format!("{owner}/{repository}"))
    {
        return Err(AppError::GitHub(
            "GitHub returned an unexpected Issue type repository identity".to_string(),
        ));
    }
    Ok(())
}

fn issue_type_from_graphql(issue_type: IssueTypeNode) -> Result<GitHubIssueType, AppError> {
    if !graphql_node_id_is_valid(&issue_type.id) || issue_type.name.trim().is_empty() {
        return Err(AppError::GitHub(
            "GitHub returned an invalid current Issue type".to_string(),
        ));
    }
    Ok(GitHubIssueType {
        id: None,
        node_id: issue_type.id,
        name: issue_type.name,
        description: issue_type.description,
    })
}

fn confirmation_error(issue_number: u64, detail: &str) -> AppError {
    AppError::GitHub(format!(
        "GitHub updated Issue #{issue_number}, but Harbor could not confirm its type ({detail}); refresh the Issue before retrying"
    ))
}

fn post_write_error(error: AppError, issue_number: u64) -> AppError {
    match error {
        error @ (AppError::GitHubPermission(_) | AppError::GitHubRateLimited(_)) => error,
        error => confirmation_error(issue_number, &error.to_string()),
    }
}

fn issue_type_write_error(error: octocrab::Error) -> AppError {
    match github_error(error) {
        AppError::GitHubPermission(message) => AppError::GitHubPermission(message),
        AppError::GitHubRateLimited(message) => AppError::GitHubRateLimited(message),
        AppError::GitHub(message) => AppError::GitHub(format!(
            "{message}; the Issue type may have changed, so refresh the Issue before retrying"
        )),
        other => other,
    }
}

fn issue_type_client(token: &str) -> Result<octocrab::Octocrab, AppError> {
    octocrab::Octocrab::builder()
        .add_retry_config(octocrab::service::middleware::retry::RetryConfig::None)
        .personal_token(token.to_string())
        .build()
        .map_err(|error| AppError::GitHub(error.to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueTypeStatusResponse {
    repository: Option<IssueTypeRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueTypeRepository {
    id: String,
    name_with_owner: String,
    issue: Option<IssueTypeIssue>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueTypeIssue {
    id: String,
    number: u64,
    viewer_can_update: bool,
    issue_type: Option<IssueTypeNode>,
    repository: Option<IssueTypeRepositoryIdentity>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueTypeRepositoryIdentity {
    id: String,
    name_with_owner: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueTypeNode {
    id: String,
    name: String,
    description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateIssueTypeResponse {
    update_issue_issue_type: Option<UpdateIssueTypePayload>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateIssueTypePayload {
    issue: Option<IssueTypeIssue>,
}

#[cfg(test)]
mod tests;
