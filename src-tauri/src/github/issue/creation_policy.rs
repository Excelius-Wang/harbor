use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use super::super::{
    authenticated_client, code::decode_base64_content, github_error, is_not_found,
    issue_related::graphql_node_id_is_valid, GitHubService, OctocrabGitHubClient,
};
use crate::error::AppError;

const ISSUE_TEMPLATE_CONFIG_PATH: &str = ".github/ISSUE_TEMPLATE/config.yml";
const ISSUE_TEMPLATE_CONFIG_MAX_BYTES: usize = 64 * 1024;
const ISSUE_CREATION_POLICY_QUERY: &str = r#"
query HarborIssueCreationPolicy($owner: String!, $repository: String!) {
  repository(owner: $owner, name: $repository) {
    id
    nameWithOwner
    viewerPermission
  }
}
"#;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueContactLink {
    pub name: String,
    pub about: String,
    pub url: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueCreationPolicy {
    pub blank_issue_allowed: bool,
    pub contact_links: Vec<GitHubIssueContactLink>,
    pub template_chooser_url: String,
}

#[async_trait]
pub(crate) trait GitHubIssueCreationPolicyClient: Send + Sync {
    async fn issue_creation_policy(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueCreationPolicy, AppError>;
}

impl GitHubService {
    pub async fn issue_creation_policy(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueCreationPolicy, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .issue_creation_policy(&token, owner, repository)
            .await
    }
}

#[async_trait]
impl GitHubIssueCreationPolicyClient for OctocrabGitHubClient {
    async fn issue_creation_policy(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueCreationPolicy, AppError> {
        let client = authenticated_client(token)?;
        load_issue_creation_policy_with_client(&client, owner, repository).await
    }
}

async fn load_issue_creation_policy_with_client(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<GitHubIssueCreationPolicy, AppError> {
    let configuration = load_issue_template_configuration(client, owner, repository).await?;
    let blank_issue_allowed = if configuration.blank_issues_enabled {
        true
    } else {
        viewer_can_create_maintainer_blank_issues(client, owner, repository).await?
    };

    Ok(GitHubIssueCreationPolicy {
        blank_issue_allowed,
        contact_links: configuration.contact_links,
        template_chooser_url: format!("https://github.com/{owner}/{repository}/issues/new/choose"),
    })
}

async fn load_issue_template_configuration(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<IssueTemplateConfiguration, AppError> {
    let contents = match client
        .repos(owner, repository)
        .get_content()
        .path(ISSUE_TEMPLATE_CONFIG_PATH)
        .send()
        .await
    {
        Ok(contents) => contents,
        Err(error) if is_not_found(&error) => return Ok(IssueTemplateConfiguration::default()),
        Err(error) => return Err(github_error(error)),
    };
    let mut items = contents.items;
    if items.len() != 1 {
        return Err(AppError::GitHub(
            "GitHub did not return one Issue template configuration file".to_string(),
        ));
    }
    let content = items.pop().expect("one Issue template configuration file");
    if content.r#type != "file" || content.path != ISSUE_TEMPLATE_CONFIG_PATH {
        return Err(AppError::GitHub(
            "GitHub returned an invalid Issue template configuration file".to_string(),
        ));
    }
    let size = usize::try_from(content.size).map_err(|_| {
        AppError::GitHub("GitHub returned an invalid Issue template configuration size".to_string())
    })?;
    if size > ISSUE_TEMPLATE_CONFIG_MAX_BYTES {
        return Err(AppError::GitHub(
            "GitHub returned an Issue template configuration that is too large".to_string(),
        ));
    }
    let encoded = content.content.ok_or_else(|| {
        AppError::GitHub("GitHub did not return Issue template configuration content".to_string())
    })?;
    if content.encoding.as_deref() != Some("base64") {
        return Err(AppError::GitHub(
            "GitHub returned an unsupported Issue template configuration encoding".to_string(),
        ));
    }
    let source = decode_base64_content(&encoded, "Issue template configuration")?;
    if source.len() > ISSUE_TEMPLATE_CONFIG_MAX_BYTES {
        return Err(AppError::GitHub(
            "GitHub returned an Issue template configuration that is too large".to_string(),
        ));
    }
    let configuration: RawIssueTemplateConfiguration =
        serde_yaml_ng::from_slice(&source).map_err(|error| {
            AppError::GitHub(format!(
                "GitHub returned invalid Issue template configuration: {error}"
            ))
        })?;
    configuration.into_public()
}

async fn viewer_can_create_maintainer_blank_issues(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<bool, AppError> {
    let payload = serde_json::json!({
        "query": ISSUE_CREATION_POLICY_QUERY,
        "variables": { "owner": owner, "repository": repository },
    });
    let response: IssueCreationPolicyQuery =
        client.graphql(&payload).await.map_err(github_error)?;
    let repository_node = response.repository.ok_or_else(|| {
        AppError::GitHub("GitHub did not return the Issue template repository".to_string())
    })?;
    if !graphql_node_id_is_valid(&repository_node.id)
        || !repository_node
            .name_with_owner
            .eq_ignore_ascii_case(&format!("{owner}/{repository}"))
    {
        return Err(AppError::GitHub(
            "GitHub returned a different Issue template repository".to_string(),
        ));
    }
    Ok(matches!(
        repository_node.viewer_permission.as_deref(),
        Some("WRITE" | "MAINTAIN" | "ADMIN")
    ))
}

#[derive(Default, Deserialize)]
struct RawIssueTemplateConfiguration {
    #[serde(default = "default_blank_issues_enabled")]
    blank_issues_enabled: bool,
    #[serde(default)]
    contact_links: Vec<RawIssueContactLink>,
}

impl RawIssueTemplateConfiguration {
    fn into_public(self) -> Result<IssueTemplateConfiguration, AppError> {
        let contact_links = self
            .contact_links
            .into_iter()
            .map(RawIssueContactLink::into_public)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(IssueTemplateConfiguration {
            blank_issues_enabled: self.blank_issues_enabled,
            contact_links,
        })
    }
}

fn default_blank_issues_enabled() -> bool {
    true
}

#[derive(Deserialize)]
struct RawIssueContactLink {
    name: String,
    about: String,
    url: String,
}

impl RawIssueContactLink {
    fn into_public(self) -> Result<GitHubIssueContactLink, AppError> {
        let name = bounded_non_empty_text(self.name, "contact link name", 256)?;
        let about = bounded_non_empty_text(self.about, "contact link description", 1_024)?;
        let url = contact_link_url(self.url)?;
        Ok(GitHubIssueContactLink { name, about, url })
    }
}

struct IssueTemplateConfiguration {
    blank_issues_enabled: bool,
    contact_links: Vec<GitHubIssueContactLink>,
}

impl Default for IssueTemplateConfiguration {
    fn default() -> Self {
        Self {
            blank_issues_enabled: true,
            contact_links: Vec::new(),
        }
    }
}

fn bounded_non_empty_text(
    value: String,
    label: &str,
    maximum_length: usize,
) -> Result<String, AppError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.len() > maximum_length || value.chars().any(char::is_control) {
        return Err(AppError::GitHub(format!(
            "GitHub returned an invalid {label}"
        )));
    }
    Ok(value)
}

fn contact_link_url(value: String) -> Result<String, AppError> {
    let url = url::Url::parse(&value).map_err(|_| {
        AppError::GitHub("GitHub returned an invalid Issue template contact link URL".to_string())
    })?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AppError::GitHub(
            "GitHub returned an invalid Issue template contact link URL".to_string(),
        ));
    }
    Ok(url.into())
}

#[derive(Deserialize)]
struct IssueCreationPolicyQuery {
    repository: Option<IssueCreationPolicyRepository>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueCreationPolicyRepository {
    id: String,
    name_with_owner: String,
    viewer_permission: Option<String>,
}

#[cfg(test)]
#[async_trait]
impl GitHubIssueCreationPolicyClient for super::super::tests::FakeGitHubClient {
    async fn issue_creation_policy(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubIssueCreationPolicy, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubIssueCreationPolicy {
            blank_issue_allowed: true,
            contact_links: Vec::new(),
            template_chooser_url: "https://github.com/octocat/hello-world/issues/new/choose"
                .to_string(),
        })
    }
}

#[cfg(test)]
mod tests;
