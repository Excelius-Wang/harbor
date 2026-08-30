use super::*;
use crate::github::{
    issue_related::test_support::{mock_github, MockResponse},
    tests::issue_json,
};

#[tokio::test]
async fn transport_creates_an_issue_with_template_labels_and_assignees() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "201 Created",
        headers: vec![],
        body: issue_json(9, false).to_string(),
    }])
    .await;
    let input = GitHubIssueCreateInput::new(
        "[Bug] Unexpected rendering".to_string(),
        "## What happened?\nThe preview is blank.".to_string(),
        vec!["bug".to_string(), "triage".to_string()],
        vec!["octocat".to_string()],
    );

    let issue = create_issue_with_client(&client, "octocat", "hello-world", &input)
        .await
        .expect("created Issue");
    server.await.expect("mock server");

    assert_eq!(issue.number, 9);
    let request = requests.lock().expect("requests");
    assert!(request[0].starts_with("POST /repos/octocat/hello-world/issues HTTP/1.1"));
    let body = request[0].split_once("\r\n\r\n").expect("request body").1;
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(body).expect("request JSON"),
        serde_json::json!({
            "title": "[Bug] Unexpected rendering",
            "body": "## What happened?\nThe preview is blank.",
            "labels": ["bug", "triage"],
            "assignees": ["octocat"]
        })
    );
}
