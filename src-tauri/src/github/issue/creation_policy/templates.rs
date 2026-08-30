use serde::{Deserialize, Serialize};

use super::super::super::{code::decode_base64_content, github_error, is_not_found};
use crate::error::AppError;

const ISSUE_TEMPLATE_DIRECTORY_PATH: &str = ".github/ISSUE_TEMPLATE";
const ISSUE_TEMPLATE_PREFIX: &str = ".github/ISSUE_TEMPLATE/";
const ISSUE_TEMPLATE_MAX_BYTES: usize = 64 * 1024;
const ISSUE_TEMPLATE_MAX_FILES: usize = 100;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubIssueTemplate {
    pub path: String,
    pub kind: GitHubIssueTemplateKind,
    pub name: String,
    pub about: String,
    pub default_title: String,
    pub body: String,
    pub labels: Vec<String>,
    pub assignees: Vec<String>,
    pub template_url: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum GitHubIssueTemplateKind {
    Markdown,
    Form,
    GitHub,
}

pub(super) async fn load_issue_templates(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
) -> Result<Vec<GitHubIssueTemplate>, AppError> {
    let contents = match client
        .repos(owner, repository)
        .get_content()
        .path(ISSUE_TEMPLATE_DIRECTORY_PATH)
        .send()
        .await
    {
        Ok(contents) => contents,
        Err(error) if is_not_found(&error) => return Ok(Vec::new()),
        Err(error) => return Err(github_error(error)),
    };
    let mut templates = contents
        .items
        .into_iter()
        .filter_map(template_file)
        .collect::<Vec<_>>();
    if templates.len() > ISSUE_TEMPLATE_MAX_FILES {
        return Err(AppError::GitHub(
            "GitHub returned too many Issue templates".to_string(),
        ));
    }
    templates.sort_by(|left, right| {
        left.kind
            .sort_order()
            .cmp(&right.kind.sort_order())
            .then_with(|| left.file_name.cmp(&right.file_name))
    });

    let mut loaded = Vec::with_capacity(templates.len());
    for template in templates {
        if let Some(template) = load_issue_template(client, owner, repository, template).await? {
            loaded.push(template);
        }
    }
    Ok(loaded)
}

struct IssueTemplateFile {
    path: String,
    file_name: String,
    kind: IssueTemplateFileKind,
}

#[derive(Clone, Copy)]
enum IssueTemplateFileKind {
    Markdown,
    Form,
}

impl IssueTemplateFileKind {
    fn sort_order(self) -> u8 {
        match self {
            Self::Form => 0,
            Self::Markdown => 1,
        }
    }
}

fn template_file(content: octocrab::models::repos::Content) -> Option<IssueTemplateFile> {
    if content.r#type != "file" {
        return None;
    }
    let file_name = content
        .path
        .strip_prefix(ISSUE_TEMPLATE_PREFIX)?
        .to_string();
    if file_name.is_empty()
        || file_name.len() > 255
        || file_name.contains('/')
        || file_name.chars().any(char::is_control)
        || is_configuration_file(&file_name)
    {
        return None;
    }
    let kind = if file_name.to_ascii_lowercase().ends_with(".md") {
        IssueTemplateFileKind::Markdown
    } else if file_name.to_ascii_lowercase().ends_with(".yml")
        || file_name.to_ascii_lowercase().ends_with(".yaml")
    {
        IssueTemplateFileKind::Form
    } else {
        return None;
    };
    Some(IssueTemplateFile {
        path: content.path,
        file_name,
        kind,
    })
}

fn is_configuration_file(file_name: &str) -> bool {
    matches!(
        file_name.to_ascii_lowercase().as_str(),
        "config.yml" | "config.yaml"
    )
}

async fn load_issue_template(
    client: &octocrab::Octocrab,
    owner: &str,
    repository: &str,
    template: IssueTemplateFile,
) -> Result<Option<GitHubIssueTemplate>, AppError> {
    let contents = match client
        .repos(owner, repository)
        .get_content()
        .path(&template.path)
        .send()
        .await
    {
        Ok(contents) => contents,
        Err(error) if is_not_found(&error) => return Ok(None),
        Err(error) => return Err(github_error(error)),
    };
    let mut items = contents.items;
    if items.len() != 1 {
        return Err(AppError::GitHub(
            "GitHub did not return one Issue template file".to_string(),
        ));
    }
    let content = items.pop().expect("one Issue template file");
    if content.r#type != "file" || content.path != template.path {
        return Err(AppError::GitHub(
            "GitHub returned an invalid Issue template file".to_string(),
        ));
    }
    let size = usize::try_from(content.size).map_err(|_| {
        AppError::GitHub("GitHub returned an invalid Issue template size".to_string())
    })?;
    if size > ISSUE_TEMPLATE_MAX_BYTES {
        return Ok(Some(external_template(owner, repository, template)));
    }
    if content.encoding.as_deref() != Some("base64") {
        return Err(AppError::GitHub(
            "GitHub returned unsupported Issue template content".to_string(),
        ));
    }
    let encoded = content.content.ok_or_else(|| {
        AppError::GitHub("GitHub did not return Issue template content".to_string())
    })?;
    let source = decode_base64_content(&encoded, "Issue template")?;
    if source.len() > ISSUE_TEMPLATE_MAX_BYTES {
        return Ok(Some(external_template(owner, repository, template)));
    }
    let source = match String::from_utf8(source) {
        Ok(source) => source,
        Err(_) => return Ok(Some(external_template(owner, repository, template))),
    };
    Ok(Some(match template.kind {
        IssueTemplateFileKind::Markdown => markdown_template(owner, repository, template, &source),
        IssueTemplateFileKind::Form => form_template(owner, repository, template, &source),
    }))
}

fn markdown_template(
    owner: &str,
    repository: &str,
    template: IssueTemplateFile,
    source: &str,
) -> GitHubIssueTemplate {
    let Some((frontmatter, body)) = split_markdown_frontmatter(source) else {
        return external_template(owner, repository, template);
    };
    let Ok(metadata) = serde_yaml_ng::from_str::<RawMarkdownIssueTemplate>(frontmatter) else {
        return external_template(owner, repository, template);
    };
    let Some(name) = template_name(&metadata.name) else {
        return external_template(owner, repository, template);
    };
    let Some(about) = template_about(&metadata.about) else {
        return external_template(owner, repository, template);
    };
    let Some(labels) = metadata.labels.normalize(100, 128) else {
        return external_template(owner, repository, template);
    };
    let Some(assignees) = metadata.assignees.normalize(10, 100) else {
        return external_template(owner, repository, template);
    };
    if metadata.issue_type.is_some()
        || metadata.projects.is_some()
        || metadata.title.chars().any(char::is_control)
        || body.contains('\0')
    {
        return external_template(owner, repository, template);
    }
    GitHubIssueTemplate {
        path: template.path,
        kind: GitHubIssueTemplateKind::Markdown,
        name,
        about,
        default_title: metadata.title,
        body: body.to_string(),
        labels,
        assignees,
        template_url: template_url(owner, repository, &template.file_name),
    }
}

fn form_template(
    owner: &str,
    repository: &str,
    template: IssueTemplateFile,
    source: &str,
) -> GitHubIssueTemplate {
    let metadata = serde_yaml_ng::from_str::<RawIssueFormTemplate>(source).ok();
    let (name, about) = metadata
        .and_then(|metadata| {
            let RawIssueFormTemplate {
                name,
                description,
                body,
            } = metadata;
            let _ = body.len();
            Some((template_name(&name)?, template_about(&description)?))
        })
        .unwrap_or_else(|| (template.file_name.clone(), String::new()));
    GitHubIssueTemplate {
        path: template.path,
        kind: GitHubIssueTemplateKind::Form,
        name,
        about,
        default_title: String::new(),
        body: String::new(),
        labels: Vec::new(),
        assignees: Vec::new(),
        template_url: template_url(owner, repository, &template.file_name),
    }
}

fn external_template(
    owner: &str,
    repository: &str,
    template: IssueTemplateFile,
) -> GitHubIssueTemplate {
    GitHubIssueTemplate {
        path: template.path,
        kind: GitHubIssueTemplateKind::GitHub,
        name: template.file_name.clone(),
        about: String::new(),
        default_title: String::new(),
        body: String::new(),
        labels: Vec::new(),
        assignees: Vec::new(),
        template_url: template_url(owner, repository, &template.file_name),
    }
}

fn template_url(owner: &str, repository: &str, file_name: &str) -> String {
    let mut url = url::Url::parse(&format!(
        "https://github.com/{owner}/{repository}/issues/new"
    ))
    .expect("GitHub Issue template URL is valid");
    url.query_pairs_mut().append_pair("template", file_name);
    url.into()
}

fn split_markdown_frontmatter(source: &str) -> Option<(&str, &str)> {
    let mut lines = source.split_inclusive('\n');
    let opening = lines.next()?;
    if line_content(opening) != "---" {
        return None;
    }
    let frontmatter_start = opening.len();
    let mut offset = frontmatter_start;
    for line in lines {
        let line_end = offset + line.len();
        if line_content(line) == "---" {
            return Some((&source[frontmatter_start..offset], &source[line_end..]));
        }
        offset = line_end;
    }
    None
}

fn line_content(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RawMarkdownIssueTemplate {
    name: String,
    about: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    labels: RawStringList,
    #[serde(default)]
    assignees: RawStringList,
    #[serde(rename = "type")]
    issue_type: Option<serde_yaml_ng::Value>,
    projects: Option<serde_yaml_ng::Value>,
}

#[derive(Default, Deserialize)]
#[serde(untagged)]
enum RawStringList {
    #[default]
    Empty,
    CommaSeparated(String),
    List(Vec<String>),
}

impl RawStringList {
    fn normalize(self, maximum_items: usize, maximum_length: usize) -> Option<Vec<String>> {
        let values = match self {
            Self::Empty => Vec::new(),
            Self::CommaSeparated(values) if values.trim().is_empty() => Vec::new(),
            Self::CommaSeparated(values) => values.split(',').map(str::to_string).collect(),
            Self::List(values) => values,
        };
        if values.len() > maximum_items {
            return None;
        }
        let mut normalized = Vec::with_capacity(values.len());
        for value in values {
            let value = value.trim().to_string();
            if value.is_empty()
                || value.len() > maximum_length
                || value.chars().any(char::is_control)
                || normalized
                    .iter()
                    .any(|existing: &String| existing.eq_ignore_ascii_case(&value))
            {
                return None;
            }
            normalized.push(value);
        }
        Some(normalized)
    }
}

#[derive(Deserialize)]
struct RawIssueFormTemplate {
    name: String,
    description: String,
    body: Vec<serde_yaml_ng::Value>,
}

fn template_name(value: &str) -> Option<String> {
    let value = template_text(value, 256)?;
    (value.chars().count() > 3).then_some(value)
}

fn template_about(value: &str) -> Option<String> {
    template_text(value, 1_024)
}

fn template_text(value: &str, maximum_length: usize) -> Option<String> {
    let value = value.trim().to_string();
    (!value.is_empty() && value.len() <= maximum_length && !value.chars().any(char::is_control))
        .then_some(value)
}
