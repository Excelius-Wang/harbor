use base64::Engine;

use super::templates::GitHubIssueTemplateKind;
use super::*;
use crate::github::issue_related::test_support::{mock_github, MockResponse};

fn config_response(config: &str) -> String {
    serde_json::json!({
        "name": "config.yml",
        "path": ".github/ISSUE_TEMPLATE/config.yml",
        "sha": "abc123",
        "encoding": "base64",
        "content": base64::prelude::BASE64_STANDARD.encode(config),
        "size": config.len(),
        "url": "https://api.github.com/repos/octocat/hello-world/contents/.github/ISSUE_TEMPLATE/config.yml",
        "html_url": "https://github.com/octocat/hello-world/blob/main/.github/ISSUE_TEMPLATE/config.yml",
        "git_url": null,
        "download_url": null,
        "type": "file",
        "_links": {
            "git": null,
            "html": null,
            "self": "https://api.github.com/repos/octocat/hello-world/contents/.github/ISSUE_TEMPLATE/config.yml"
        },
        "license": null
    })
    .to_string()
}

fn template_file_response(path: &str, source: &str) -> String {
    let name = path.rsplit('/').next().expect("template file name");
    serde_json::json!({
        "name": name,
        "path": path,
        "sha": "abc123",
        "encoding": "base64",
        "content": base64::prelude::BASE64_STANDARD.encode(source),
        "size": source.len(),
        "url": format!("https://api.github.com/repos/octocat/hello-world/contents/{path}"),
        "html_url": format!("https://github.com/octocat/hello-world/blob/main/{path}"),
        "git_url": null,
        "download_url": null,
        "type": "file",
        "_links": {
            "git": null,
            "html": null,
            "self": format!("https://api.github.com/repos/octocat/hello-world/contents/{path}")
        },
        "license": null
    })
    .to_string()
}

fn template_directory_entry(file_name: &str) -> serde_json::Value {
    let path = format!(".github/ISSUE_TEMPLATE/{file_name}");
    let api_url = format!("https://api.github.com/repos/octocat/hello-world/contents/{path}");
    let html_url = format!("https://github.com/octocat/hello-world/blob/main/{path}");
    serde_json::json!({
        "name": file_name,
        "path": path,
        "sha": "template123",
        "size": 256,
        "url": api_url,
        "html_url": html_url,
        "git_url": null,
        "download_url": null,
        "type": "file",
        "_links": { "git": null, "html": null, "self": api_url },
        "license": null
    })
}

fn template_directory_response() -> String {
    serde_json::json!([
        template_directory_entry("bug.md"),
        template_directory_entry("bug.yml")
    ])
    .to_string()
}

fn repository_permission_response(permission: &str) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "viewerPermission": permission
            }
        }
    })
    .to_string()
}

#[tokio::test]
async fn transport_blocks_blank_issues_for_non_maintainers_and_preserves_contact_links() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: config_response(
                "blank_issues_enabled: false\ncontact_links:\n  - name: Community support\n    about: Ask a question\n    url: https://example.com/support\n",
            ),
        },
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({ "message": "Not Found" }).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: repository_permission_response("TRIAGE"),
        },
    ])
    .await;

    let policy = load_issue_creation_policy_with_client(&client, "octocat", "hello-world")
        .await
        .expect("creation policy");
    server.await.expect("mock server");

    assert!(!policy.blank_issue_allowed);
    assert_eq!(policy.contact_links.len(), 1);
    assert_eq!(policy.contact_links[0].name, "Community support");
    assert_eq!(policy.contact_links[0].url, "https://example.com/support");
    assert_eq!(
        policy.template_chooser_url,
        "https://github.com/octocat/hello-world/issues/new/choose"
    );
    let requests = requests.lock().expect("requests");
    assert!(
        requests[0].starts_with(
            "GET /repos/octocat/hello-world/contents/.github/ISSUE_TEMPLATE/config.yml? HTTP/1.1"
        ),
        "unexpected configuration request: {}",
        requests[0]
    );
    assert!(requests[1]
        .starts_with("GET /repos/octocat/hello-world/contents/.github/ISSUE_TEMPLATE? HTTP/1.1"));
    assert!(requests[2].contains("viewerPermission"));
}

#[tokio::test]
async fn transport_defaults_to_blank_issues_when_the_configuration_is_missing() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({ "message": "Not Found" }).to_string(),
        },
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({ "message": "Not Found" }).to_string(),
        },
    ])
    .await;

    let policy = load_issue_creation_policy_with_client(&client, "octocat", "hello-world")
        .await
        .expect("default creation policy");
    server.await.expect("mock server");

    assert!(policy.blank_issue_allowed);
    assert!(policy.contact_links.is_empty());
    assert_eq!(requests.lock().expect("requests").len(), 2);
}

#[tokio::test]
async fn transport_keeps_maintainer_blank_issues_available_when_templates_are_required() {
    let (client, _requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: config_response("blank_issues_enabled: false\n"),
        },
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({ "message": "Not Found" }).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: repository_permission_response("WRITE"),
        },
    ])
    .await;

    let policy = load_issue_creation_policy_with_client(&client, "octocat", "hello-world")
        .await
        .expect("maintainer creation policy");
    server.await.expect("mock server");

    assert!(policy.blank_issue_allowed);
}

#[tokio::test]
async fn transport_returns_native_markdown_templates_and_yaml_form_fallbacks() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({ "message": "Not Found" }).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: template_directory_response(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: template_file_response(
                ".github/ISSUE_TEMPLATE/bug.yml",
                "name: Structured bug\ndescription: File a structured report\nbody: []\n",
            ),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: template_file_response(
                ".github/ISSUE_TEMPLATE/bug.md",
                "---\nname: Bug report\nabout: Tell us what happened\ntitle: '[Bug] '\nlabels: bug, triage\nassignees: ''\n---\n## What happened?\n",
            ),
        },
    ])
    .await;

    let policy = load_issue_creation_policy_with_client(&client, "octocat", "hello-world")
        .await
        .expect("creation policy");
    server.await.expect("mock server");

    assert_eq!(policy.templates.len(), 2);
    assert_eq!(policy.templates[0].kind, GitHubIssueTemplateKind::Form);
    assert_eq!(policy.templates[0].name, "Structured bug");
    assert_eq!(
        policy.templates[0].template_url,
        "https://github.com/octocat/hello-world/issues/new?template=bug.yml"
    );
    assert_eq!(policy.templates[1].kind, GitHubIssueTemplateKind::Markdown);
    assert_eq!(policy.templates[1].name, "Bug report");
    assert_eq!(policy.templates[1].about, "Tell us what happened");
    assert_eq!(policy.templates[1].default_title, "[Bug] ");
    assert_eq!(policy.templates[1].labels, ["bug", "triage"]);
    assert!(policy.templates[1].assignees.is_empty());
    assert_eq!(policy.templates[1].body, "## What happened?\n");
    let requests = requests.lock().expect("requests");
    assert!(requests[1]
        .starts_with("GET /repos/octocat/hello-world/contents/.github/ISSUE_TEMPLATE? HTTP/1.1"));
    assert!(requests[2].contains("/contents/.github/ISSUE_TEMPLATE/bug.yml?"));
    assert!(requests[3].contains("/contents/.github/ISSUE_TEMPLATE/bug.md?"));
}

#[tokio::test]
async fn transport_routes_markdown_templates_with_unsupported_metadata_to_github() {
    let (client, _requests, server) = mock_github(vec![
        MockResponse {
            status: "404 Not Found",
            headers: vec![],
            body: serde_json::json!({ "message": "Not Found" }).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!([template_directory_entry("bug.md")]).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: template_file_response(
                ".github/ISSUE_TEMPLATE/bug.md",
                "---\nname: Bug report\nabout: Tell us what happened\nmilestone: 7\n---\n## What happened?\n",
            ),
        },
    ])
    .await;

    let policy = load_issue_creation_policy_with_client(&client, "octocat", "hello-world")
        .await
        .expect("creation policy");
    server.await.expect("mock server");

    assert_eq!(policy.templates.len(), 1);
    assert_eq!(policy.templates[0].kind, GitHubIssueTemplateKind::GitHub);
    assert_eq!(
        policy.templates[0].template_url,
        "https://github.com/octocat/hello-world/issues/new?template=bug.md"
    );
}
