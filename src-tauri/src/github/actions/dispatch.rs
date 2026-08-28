use std::collections::{BTreeMap, HashSet};

use async_trait::async_trait;
use http_body_util::BodyExt;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use serde_yaml_ng::{Mapping as YamlMapping, Value as YamlValue};

use super::super::{
    authenticated_client, github_error, AppError, GitHubService, OctocrabGitHubClient,
};
use super::workflows::{load_workflows, workflow_from_github, GitHubWorkflow};
use super::{load_repository_branches, GITHUB_MAX_PAGE_SIZE};

const MAX_WORKFLOW_FILE_BYTES: usize = 1_000_000;
const MAX_WORKFLOW_DISPATCH_INPUTS: usize = 25;
const MAX_WORKFLOW_DISPATCH_INPUT_BYTES: usize = 65_535;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubWorkflowReferenceKind {
    Branch,
    Tag,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubWorkflowDispatchInputType {
    Boolean,
    Choice,
    Number,
    Environment,
    String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowReference {
    pub name: String,
    pub kind: GitHubWorkflowReferenceKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowDispatchOptions {
    pub workflows: Vec<GitHubWorkflow>,
    pub references: Vec<GitHubWorkflowReference>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowDispatchInput {
    pub name: String,
    pub description: Option<String>,
    pub required: bool,
    pub input_type: GitHubWorkflowDispatchInputType,
    pub default_value: Option<JsonValue>,
    pub options: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubWorkflowDispatchConfig {
    pub workflow: GitHubWorkflow,
    pub reference: String,
    pub dispatchable: bool,
    pub inputs: Vec<GitHubWorkflowDispatchInput>,
}

#[async_trait]
pub(crate) trait GitHubWorkflowDispatchClient: Send + Sync {
    async fn workflow_dispatch_options(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWorkflowDispatchOptions, AppError>;

    async fn workflow_dispatch_config(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
    ) -> Result<GitHubWorkflowDispatchConfig, AppError>;

    async fn dispatch_workflow(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
        inputs: &BTreeMap<String, JsonValue>,
    ) -> Result<(), AppError>;
}

#[async_trait]
impl GitHubWorkflowDispatchClient for OctocrabGitHubClient {
    async fn workflow_dispatch_options(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWorkflowDispatchOptions, AppError> {
        let client = authenticated_client(token)?;
        let workflows_request = load_workflows(&client, owner, repository);
        let branches_request = load_repository_branches(&client, owner, repository);
        let tags_request = async {
            let page = client
                .repos(owner, repository)
                .list_tags()
                .per_page(GITHUB_MAX_PAGE_SIZE)
                .send()
                .await
                .map_err(github_error)?;
            client.all_pages(page).await.map_err(github_error)
        };
        let (workflows, branches, tags) =
            tokio::try_join!(workflows_request, branches_request, tags_request)?;

        Ok(workflow_dispatch_options_from_github(
            workflows, branches, tags,
        ))
    }

    async fn workflow_dispatch_config(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
    ) -> Result<GitHubWorkflowDispatchConfig, AppError> {
        let client = authenticated_client(token)?;
        load_workflow_dispatch_config(&client, owner, repository, workflow_id, reference).await
    }

    async fn dispatch_workflow(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
        inputs: &BTreeMap<String, JsonValue>,
    ) -> Result<(), AppError> {
        let client = authenticated_client(token)?;
        let config =
            load_workflow_dispatch_config(&client, owner, repository, workflow_id, reference)
                .await?;
        if !config.dispatchable {
            return Err(AppError::Validation(
                "selected workflow does not declare workflow_dispatch at this reference"
                    .to_string(),
            ));
        }
        let inputs = validated_workflow_dispatch_inputs(&config.inputs, inputs)?;

        client
            .actions()
            .create_workflow_dispatch(owner, repository, workflow_id.to_string(), reference)
            .inputs(JsonValue::Object(inputs))
            .send()
            .await
            .map_err(github_error)
    }
}

impl GitHubService {
    pub async fn workflow_dispatch_options(
        &self,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWorkflowDispatchOptions, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .workflow_dispatch_options(&token, owner, repository)
            .await
    }

    pub async fn workflow_dispatch_config(
        &self,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
    ) -> Result<GitHubWorkflowDispatchConfig, AppError> {
        let token = self.load_access_token().await?;
        self.client
            .workflow_dispatch_config(&token, owner, repository, workflow_id, reference)
            .await
    }

    pub async fn dispatch_workflow(
        &self,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
        inputs: &BTreeMap<String, JsonValue>,
    ) -> Result<(), AppError> {
        let token = self.load_access_token().await?;
        self.client
            .dispatch_workflow(&token, owner, repository, workflow_id, reference, inputs)
            .await
    }
}

fn workflow_dispatch_options_from_github(
    workflows: Vec<GitHubWorkflow>,
    branches: Vec<octocrab::models::repos::Branch>,
    tags: Vec<octocrab::models::repos::Tag>,
) -> GitHubWorkflowDispatchOptions {
    let mut workflows = workflows
        .into_iter()
        .filter(|workflow| workflow.state == "active")
        .collect::<Vec<_>>();
    workflows.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.id.cmp(&right.id))
    });

    let mut branch_references = branches
        .into_iter()
        .map(|branch| GitHubWorkflowReference {
            name: branch.name,
            kind: GitHubWorkflowReferenceKind::Branch,
        })
        .collect::<Vec<_>>();
    branch_references.sort_by(|left, right| left.name.cmp(&right.name));
    let branch_names = branch_references
        .iter()
        .map(|reference| reference.name.as_str())
        .collect::<HashSet<_>>();
    let mut tag_references = tags
        .into_iter()
        .filter(|tag| !branch_names.contains(tag.name.as_str()))
        .map(|tag| GitHubWorkflowReference {
            name: tag.name,
            kind: GitHubWorkflowReferenceKind::Tag,
        })
        .collect::<Vec<_>>();
    tag_references.sort_by(|left, right| left.name.cmp(&right.name));
    branch_references.extend(tag_references);

    GitHubWorkflowDispatchOptions {
        workflows,
        references: branch_references,
    }
}

async fn load_workflow_dispatch_config(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    workflow_id: u64,
    reference: &str,
) -> Result<GitHubWorkflowDispatchConfig, AppError> {
    let workflow = github_workflow(client, owner, repository, workflow_id).await?;
    if workflow.state != "active" {
        return Err(AppError::Validation(
            "selected workflow is not active".to_string(),
        ));
    }
    let source = raw_workflow_file(client, owner, repository, reference, &workflow.path).await?;
    let Some(mut inputs) = workflow_dispatch_inputs(&source)? else {
        return Ok(GitHubWorkflowDispatchConfig {
            workflow,
            reference: reference.to_string(),
            dispatchable: false,
            inputs: Vec::new(),
        });
    };

    if inputs
        .iter()
        .any(|input| input.input_type == GitHubWorkflowDispatchInputType::Environment)
    {
        let environments = repository_environment_names(client, owner, repository).await?;
        for input in &mut inputs {
            if input.input_type == GitHubWorkflowDispatchInputType::Environment {
                input.options.clone_from(&environments);
            }
        }
    }

    Ok(GitHubWorkflowDispatchConfig {
        workflow,
        reference: reference.to_string(),
        dispatchable: true,
        inputs,
    })
}

async fn github_workflow(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    workflow_id: u64,
) -> Result<GitHubWorkflow, AppError> {
    let route = format!("/repos/{owner}/{repository}/actions/workflows/{workflow_id}");
    let workflow: octocrab::models::workflows::WorkFlow =
        client.get(route, None::<&()>).await.map_err(github_error)?;
    Ok(workflow_from_github(workflow))
}

async fn raw_workflow_file(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    reference: &str,
    path: &str,
) -> Result<Vec<u8>, AppError> {
    let response = client
        .repos(owner, repository)
        .raw_file(reference.to_string(), path.trim_start_matches('/'))
        .await
        .map_err(github_error)?;
    let response = octocrab::map_github_error(response)
        .await
        .map_err(github_error)?;
    let bytes = response
        .into_body()
        .collect()
        .await
        .map_err(github_error)?
        .to_bytes();
    if bytes.len() > MAX_WORKFLOW_FILE_BYTES {
        return Err(AppError::Validation(
            "workflow file is too large to inspect safely".to_string(),
        ));
    }
    Ok(bytes.to_vec())
}

async fn repository_environment_names(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<Vec<String>, AppError> {
    let route = format!("/repos/{owner}/{repository}/environments");
    let mut page = 1;
    let mut names = Vec::new();

    loop {
        let response: RawEnvironmentPage = client
            .get(
                route.clone(),
                Some(&WorkflowEnvironmentParameters {
                    per_page: GITHUB_MAX_PAGE_SIZE,
                    page,
                }),
            )
            .await
            .map_err(github_error)?;
        let received = response.environments.len();
        names.extend(
            response
                .environments
                .into_iter()
                .map(|environment| environment.name),
        );
        if names.len() as u64 >= response.total_count
            || received < usize::from(GITHUB_MAX_PAGE_SIZE)
        {
            break;
        }
        page += 1;
    }

    names.sort();
    names.dedup();
    Ok(names)
}

fn workflow_dispatch_inputs(
    source: &[u8],
) -> Result<Option<Vec<GitHubWorkflowDispatchInput>>, AppError> {
    let document: YamlValue = serde_yaml_ng::from_slice(source)
        .map_err(|error| AppError::Validation(format!("workflow YAML is invalid: {error}")))?;
    let root = document
        .as_mapping()
        .ok_or_else(|| AppError::Validation("workflow YAML must contain a mapping".to_string()))?;
    let Some(events) = yaml_mapping_value(root, "on") else {
        return Ok(None);
    };

    match events {
        YamlValue::String(event) => Ok(event
            .eq_ignore_ascii_case("workflow_dispatch")
            .then(Vec::new)),
        YamlValue::Sequence(events) => Ok(events
            .iter()
            .any(|event| {
                event
                    .as_str()
                    .is_some_and(|event| event.eq_ignore_ascii_case("workflow_dispatch"))
            })
            .then(Vec::new)),
        YamlValue::Mapping(events) => {
            let Some(dispatch) = yaml_mapping_value(events, "workflow_dispatch") else {
                return Ok(None);
            };
            parse_workflow_dispatch_definition(dispatch).map(Some)
        }
        _ => Err(AppError::Validation(
            "workflow on definition is invalid".to_string(),
        )),
    }
}

fn parse_workflow_dispatch_definition(
    dispatch: &YamlValue,
) -> Result<Vec<GitHubWorkflowDispatchInput>, AppError> {
    if dispatch.is_null() {
        return Ok(Vec::new());
    }
    let dispatch = dispatch.as_mapping().ok_or_else(|| {
        AppError::Validation("workflow_dispatch definition must be a mapping".to_string())
    })?;
    let Some(inputs) = yaml_mapping_value(dispatch, "inputs") else {
        return Ok(Vec::new());
    };
    if inputs.is_null() {
        return Ok(Vec::new());
    }
    let inputs = inputs.as_mapping().ok_or_else(|| {
        AppError::Validation("workflow_dispatch inputs must be a mapping".to_string())
    })?;
    if inputs.len() > MAX_WORKFLOW_DISPATCH_INPUTS {
        return Err(AppError::Validation(format!(
            "workflow_dispatch supports at most {MAX_WORKFLOW_DISPATCH_INPUTS} inputs"
        )));
    }

    inputs
        .iter()
        .map(|(name, definition)| {
            let name = name.as_str().ok_or_else(|| {
                AppError::Validation("workflow_dispatch input names must be strings".to_string())
            })?;
            if name.trim().is_empty() {
                return Err(AppError::Validation(
                    "workflow_dispatch input names cannot be blank".to_string(),
                ));
            }
            parse_workflow_dispatch_input(name, definition)
        })
        .collect()
}

fn parse_workflow_dispatch_input(
    name: &str,
    definition: &YamlValue,
) -> Result<GitHubWorkflowDispatchInput, AppError> {
    let empty = YamlMapping::new();
    let definition = if definition.is_null() {
        &empty
    } else {
        definition.as_mapping().ok_or_else(|| {
            AppError::Validation(format!("workflow_dispatch input {name} must be a mapping"))
        })?
    };
    let description = yaml_mapping_value(definition, "description")
        .map(|value| yaml_required_string(value, &format!("input {name} description")))
        .transpose()?;
    let required = yaml_mapping_value(definition, "required")
        .map(|value| {
            value.as_bool().ok_or_else(|| {
                AppError::Validation(format!("input {name} required must be a boolean"))
            })
        })
        .transpose()?
        .unwrap_or(false);
    let input_type = yaml_mapping_value(definition, "type")
        .map(|value| yaml_required_string(value, &format!("input {name} type")))
        .transpose()?
        .map(|value| workflow_dispatch_input_type(name, &value))
        .transpose()?
        .unwrap_or(GitHubWorkflowDispatchInputType::String);
    let options = workflow_dispatch_choice_options(name, definition, input_type)?;
    let default_value = yaml_mapping_value(definition, "default")
        .map(|value| workflow_dispatch_default(name, value, input_type, &options))
        .transpose()?
        .flatten();

    Ok(GitHubWorkflowDispatchInput {
        name: name.to_string(),
        description,
        required,
        input_type,
        default_value,
        options,
    })
}

fn workflow_dispatch_input_type(
    name: &str,
    input_type: &str,
) -> Result<GitHubWorkflowDispatchInputType, AppError> {
    match input_type.to_ascii_lowercase().as_str() {
        "boolean" => Ok(GitHubWorkflowDispatchInputType::Boolean),
        "choice" => Ok(GitHubWorkflowDispatchInputType::Choice),
        "number" => Ok(GitHubWorkflowDispatchInputType::Number),
        "environment" => Ok(GitHubWorkflowDispatchInputType::Environment),
        "string" => Ok(GitHubWorkflowDispatchInputType::String),
        _ => Err(AppError::Validation(format!(
            "input {name} has unsupported type {input_type}"
        ))),
    }
}

fn workflow_dispatch_choice_options(
    name: &str,
    definition: &YamlMapping,
    input_type: GitHubWorkflowDispatchInputType,
) -> Result<Vec<String>, AppError> {
    let Some(options) = yaml_mapping_value(definition, "options") else {
        if input_type == GitHubWorkflowDispatchInputType::Choice {
            return Err(AppError::Validation(format!(
                "choice input {name} must declare options"
            )));
        }
        return Ok(Vec::new());
    };
    if input_type != GitHubWorkflowDispatchInputType::Choice {
        return Err(AppError::Validation(format!(
            "only choice input {name} may declare options"
        )));
    }
    let values = options.as_sequence().ok_or_else(|| {
        AppError::Validation(format!("choice input {name} options must be a list"))
    })?;
    let options = values
        .iter()
        .map(|value| yaml_scalar_string(value, &format!("choice input {name} option")))
        .collect::<Result<Vec<_>, _>>()?;
    if options.is_empty() {
        return Err(AppError::Validation(format!(
            "choice input {name} must declare at least one option"
        )));
    }
    Ok(options)
}

fn workflow_dispatch_default(
    name: &str,
    value: &YamlValue,
    input_type: GitHubWorkflowDispatchInputType,
    options: &[String],
) -> Result<Option<JsonValue>, AppError> {
    if value.is_null() {
        return Ok(None);
    }
    let value = match input_type {
        GitHubWorkflowDispatchInputType::Boolean => {
            value.as_bool().map(JsonValue::Bool).ok_or_else(|| {
                AppError::Validation(format!("boolean input {name} default must be a boolean"))
            })?
        }
        GitHubWorkflowDispatchInputType::Number => {
            let YamlValue::Number(number) = value else {
                return Err(AppError::Validation(format!(
                    "number input {name} default must be a number"
                )));
            };
            serde_json::to_value(number).map_err(|error| AppError::Validation(error.to_string()))?
        }
        GitHubWorkflowDispatchInputType::Choice => {
            let default = yaml_scalar_string(value, &format!("choice input {name} default"))?;
            if !options.contains(&default) {
                return Err(AppError::Validation(format!(
                    "choice input {name} default is not one of its options"
                )));
            }
            JsonValue::String(default)
        }
        GitHubWorkflowDispatchInputType::Environment | GitHubWorkflowDispatchInputType::String => {
            JsonValue::String(yaml_required_string(
                value,
                &format!("input {name} default"),
            )?)
        }
    };
    Ok(Some(value))
}

fn validated_workflow_dispatch_inputs(
    definitions: &[GitHubWorkflowDispatchInput],
    provided: &BTreeMap<String, JsonValue>,
) -> Result<JsonMap<String, JsonValue>, AppError> {
    for name in provided.keys() {
        if !definitions
            .iter()
            .any(|definition| &definition.name == name)
        {
            return Err(AppError::Validation(format!(
                "workflow_dispatch input {name} is not declared by the selected workflow"
            )));
        }
    }

    let mut normalized = JsonMap::new();
    for definition in definitions {
        let Some(value) = provided.get(&definition.name) else {
            if definition.required && definition.default_value.is_none() {
                return Err(AppError::Validation(format!(
                    "workflow_dispatch input {} is required",
                    definition.name
                )));
            }
            continue;
        };
        validate_workflow_dispatch_value(definition, value)?;
        normalized.insert(definition.name.clone(), value.clone());
    }

    let serialized =
        serde_json::to_vec(&normalized).map_err(|error| AppError::Validation(error.to_string()))?;
    if serialized.len() > MAX_WORKFLOW_DISPATCH_INPUT_BYTES {
        return Err(AppError::Validation(format!(
            "workflow_dispatch inputs exceed {MAX_WORKFLOW_DISPATCH_INPUT_BYTES} bytes"
        )));
    }
    Ok(normalized)
}

fn validate_workflow_dispatch_value(
    definition: &GitHubWorkflowDispatchInput,
    value: &JsonValue,
) -> Result<(), AppError> {
    let valid = match definition.input_type {
        GitHubWorkflowDispatchInputType::Boolean => value.is_boolean(),
        GitHubWorkflowDispatchInputType::Number => value.is_number(),
        GitHubWorkflowDispatchInputType::String => value
            .as_str()
            .is_some_and(|value| !definition.required || !value.trim().is_empty()),
        GitHubWorkflowDispatchInputType::Choice | GitHubWorkflowDispatchInputType::Environment => {
            value
                .as_str()
                .is_some_and(|value| definition.options.iter().any(|option| option == value))
        }
    };
    if valid {
        Ok(())
    } else {
        Err(AppError::Validation(format!(
            "workflow_dispatch input {} has an invalid value",
            definition.name
        )))
    }
}

fn yaml_mapping_value<'a>(mapping: &'a YamlMapping, name: &str) -> Option<&'a YamlValue> {
    mapping.iter().find_map(|(key, value)| {
        key.as_str()
            .is_some_and(|key| key.eq_ignore_ascii_case(name))
            .then_some(value)
    })
}

fn yaml_required_string(value: &YamlValue, label: &str) -> Result<String, AppError> {
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| AppError::Validation(format!("{label} must be a string")))
}

fn yaml_scalar_string(value: &YamlValue, label: &str) -> Result<String, AppError> {
    match value {
        YamlValue::String(value) => Ok(value.clone()),
        YamlValue::Bool(value) => Ok(value.to_string()),
        YamlValue::Number(value) => Ok(value.to_string()),
        _ => Err(AppError::Validation(format!("{label} must be a scalar"))),
    }
}

#[derive(Serialize)]
struct WorkflowEnvironmentParameters {
    per_page: u8,
    page: u32,
}

#[derive(Deserialize)]
struct RawEnvironmentPage {
    total_count: u64,
    environments: Vec<RawEnvironment>,
}

#[derive(Deserialize)]
struct RawEnvironment {
    name: String,
}

#[cfg(test)]
#[async_trait]
impl GitHubWorkflowDispatchClient for super::super::tests::FakeGitHubClient {
    async fn workflow_dispatch_options(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWorkflowDispatchOptions, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubWorkflowDispatchOptions {
            workflows: vec![GitHubWorkflow {
                id: 7,
                name: "CI".to_string(),
                path: ".github/workflows/ci.yml".to_string(),
                state: "active".to_string(),
                url: "https://github.com/octocat/hello-world/actions/workflows/ci.yml".to_string(),
            }],
            references: vec![GitHubWorkflowReference {
                name: "main".to_string(),
                kind: GitHubWorkflowReferenceKind::Branch,
            }],
        })
    }

    async fn workflow_dispatch_config(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
    ) -> Result<GitHubWorkflowDispatchConfig, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, workflow_id),
            ("octocat", "hello-world", 7)
        );
        assert_eq!(reference, "main");
        Ok(GitHubWorkflowDispatchConfig {
            workflow: GitHubWorkflow {
                id: workflow_id,
                name: "CI".to_string(),
                path: ".github/workflows/ci.yml".to_string(),
                state: "active".to_string(),
                url: "https://github.com/octocat/hello-world/actions/workflows/ci.yml".to_string(),
            },
            reference: reference.to_string(),
            dispatchable: true,
            inputs: Vec::new(),
        })
    }

    async fn dispatch_workflow(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        workflow_id: u64,
        reference: &str,
        inputs: &BTreeMap<String, JsonValue>,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, workflow_id),
            ("octocat", "hello-world", 7)
        );
        assert_eq!(reference, "main");
        assert!(inputs.is_empty());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dispatch_inputs_fixture() -> Vec<GitHubWorkflowDispatchInput> {
        workflow_dispatch_inputs(
            br#"
name: Release
on:
  workflow_dispatch:
    inputs:
      release_name:
        description: Release name
        required: true
        type: string
      dry_run:
        description: Skip publishing
        type: boolean
        default: false
      channel:
        type: choice
        options:
          - nightly
          - stable
        default: nightly
      retries:
        type: number
        default: 2
      target:
        type: environment
"#,
        )
        .expect("valid workflow YAML")
        .expect("workflow_dispatch definition")
    }

    #[test]
    fn parser_keeps_typed_inputs_in_source_order() {
        let inputs = dispatch_inputs_fixture();

        assert_eq!(inputs.len(), 5);
        assert_eq!(inputs[0].name, "release_name");
        assert!(inputs[0].required);
        assert_eq!(inputs[0].description.as_deref(), Some("Release name"));
        assert_eq!(
            inputs[1].input_type,
            GitHubWorkflowDispatchInputType::Boolean
        );
        assert_eq!(inputs[1].default_value, Some(JsonValue::Bool(false)));
        assert_eq!(inputs[2].options, ["nightly", "stable"]);
        assert_eq!(
            inputs[2].default_value,
            Some(JsonValue::String("nightly".to_string()))
        );
        assert_eq!(inputs[3].default_value, Some(serde_json::json!(2)));
        assert_eq!(
            inputs[4].input_type,
            GitHubWorkflowDispatchInputType::Environment
        );
    }

    #[test]
    fn parser_supports_scalar_and_sequence_events() {
        assert_eq!(
            workflow_dispatch_inputs(b"on: workflow_dispatch\n")
                .expect("scalar event")
                .expect("dispatch event"),
            Vec::new()
        );
        assert_eq!(
            workflow_dispatch_inputs(b"on: [push, workflow_dispatch]\n")
                .expect("event sequence")
                .expect("dispatch event"),
            Vec::new()
        );
        assert!(workflow_dispatch_inputs(b"on: [push, pull_request]\n")
            .expect("non-dispatch workflow")
            .is_none());
    }

    #[test]
    fn parser_rejects_invalid_choice_definitions() {
        let missing_options = br#"
on:
  workflow_dispatch:
    inputs:
      channel:
        type: choice
"#;
        let invalid_default = br#"
on:
  workflow_dispatch:
    inputs:
      channel:
        type: choice
        options: [nightly, stable]
        default: canary
"#;

        assert!(matches!(
            workflow_dispatch_inputs(missing_options),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            workflow_dispatch_inputs(invalid_default),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn validation_keeps_native_json_types() {
        let mut definitions = dispatch_inputs_fixture();
        definitions[4].options = vec!["staging".to_string(), "production".to_string()];
        let provided = BTreeMap::from([
            (
                "release_name".to_string(),
                JsonValue::String("v1.0.0".to_string()),
            ),
            ("dry_run".to_string(), JsonValue::Bool(true)),
            (
                "channel".to_string(),
                JsonValue::String("stable".to_string()),
            ),
            ("retries".to_string(), serde_json::json!(3)),
            (
                "target".to_string(),
                JsonValue::String("production".to_string()),
            ),
        ]);

        let normalized =
            validated_workflow_dispatch_inputs(&definitions, &provided).expect("valid inputs");

        assert_eq!(normalized["dry_run"], JsonValue::Bool(true));
        assert_eq!(normalized["retries"], serde_json::json!(3));
        assert_eq!(normalized["target"], "production");
    }

    #[test]
    fn validation_rejects_stale_or_invalid_values() {
        let mut definitions = dispatch_inputs_fixture();
        definitions[4].options = vec!["production".to_string()];

        assert!(matches!(
            validated_workflow_dispatch_inputs(&definitions, &BTreeMap::new()),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            validated_workflow_dispatch_inputs(
                &definitions,
                &BTreeMap::from([("unknown".to_string(), JsonValue::Bool(true))]),
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            validated_workflow_dispatch_inputs(
                &definitions,
                &BTreeMap::from([
                    (
                        "release_name".to_string(),
                        JsonValue::String("v1.0.0".to_string()),
                    ),
                    (
                        "channel".to_string(),
                        JsonValue::String("canary".to_string()),
                    ),
                ]),
            ),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn validation_enforces_githubs_payload_limit() {
        let definitions = vec![GitHubWorkflowDispatchInput {
            name: "notes".to_string(),
            description: None,
            required: false,
            input_type: GitHubWorkflowDispatchInputType::String,
            default_value: None,
            options: Vec::new(),
        }];
        let provided = BTreeMap::from([(
            "notes".to_string(),
            JsonValue::String("x".repeat(MAX_WORKFLOW_DISPATCH_INPUT_BYTES)),
        )]);

        assert!(matches!(
            validated_workflow_dispatch_inputs(&definitions, &provided),
            Err(AppError::Validation(_))
        ));
    }
}
