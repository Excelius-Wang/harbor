use super::*;
use crate::error::AppError;

#[async_trait::async_trait]
impl GitHubIssueTypeClient for super::super::tests::FakeGitHubClient {
    async fn issue_type_status(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        issue_number: u64,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, issue_number),
            ("octocat", "hello-world", 7)
        );
        Ok(status(None, true))
    }

    async fn update_issue_type(
        &self,
        token: &str,
        mutation: IssueTypeMutation<'_>,
    ) -> Result<GitHubIssueTypeStatus, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(mutation.expected_issue_node_id, "I_7");
        Ok(status(mutation.issue_type_node_id, true))
    }
}

fn status(current: Option<&str>, viewer_can_update: bool) -> GitHubIssueTypeStatus {
    GitHubIssueTypeStatus {
        repository_id: "R_1".to_string(),
        repository_full_name: "octocat/hello-world".to_string(),
        issue_node_id: "I_7".to_string(),
        issue_number: 7,
        current_issue_type: current.map(|node_id| GitHubIssueType {
            id: None,
            node_id: node_id.to_string(),
            name: "Bug".to_string(),
            description: Some("An unexpected problem".to_string()),
        }),
        available_issue_types: vec![GitHubIssueType {
            id: Some(410),
            node_id: "IT_bug".to_string(),
            name: "Bug".to_string(),
            description: Some("An unexpected problem".to_string()),
        }],
        viewer_can_update,
    }
}

#[test]
fn issue_type_payload_uses_the_official_mutation_and_nullable_id() {
    let payload = issue_type_update_payload("I_7", None);
    assert_eq!(payload["variables"]["issueId"], "I_7");
    assert!(payload["variables"]["issueTypeId"].is_null());
    assert!(payload["query"]
        .as_str()
        .expect("mutation")
        .contains("updateIssueIssueType"));
}

#[test]
fn issue_types_parse_numeric_and_graphql_identity_without_duplicates() {
    let values = serde_json::json!([
        {
            "id": 410,
            "node_id": "IT_bug",
            "name": "Bug",
            "description": "An unexpected problem"
        },
        {
            "id": 411,
            "node_id": "IT_task",
            "name": "Task",
            "description": null
        }
    ]);
    let parsed = issue_types_from_rest_value(values).expect("issue types");
    assert_eq!(parsed[0].id, Some(410));
    assert_eq!(parsed[0].node_id, "IT_bug");
    assert_eq!(parsed[1].description, None);
    assert!(issue_types_from_rest_value(serde_json::json!([
        {"id": 410, "node_id": "IT_bug", "name": "Bug"},
        {"id": 411, "node_id": "IT_bug", "name": "Task"}
    ]))
    .is_err());
}

#[test]
fn issue_type_preflight_rejects_stale_identity_permission_noop_and_unknown_type() {
    let current = status(Some("IT_bug"), true);
    let stale = IssueTypeMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_other",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: None,
    };
    assert!(matches!(
        ensure_issue_type_preflight(&current, stale),
        Err(AppError::GitHubIssueStateConflict(_))
    ));

    let denied = IssueTypeMutation {
        expected_issue_node_id: "I_7",
        issue_type_node_id: None,
        ..stale
    };
    assert!(matches!(
        ensure_issue_type_preflight(&status(Some("IT_bug"), false), denied),
        Err(AppError::GitHubPermission(_))
    ));

    let noop = IssueTypeMutation {
        expected_issue_node_id: "I_7",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: Some("IT_bug"),
        ..stale
    };
    assert!(matches!(
        ensure_issue_type_preflight(&current, noop),
        Err(AppError::Validation(_))
    ));

    let unknown = IssueTypeMutation {
        expected_issue_node_id: "I_7",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: Some("IT_unknown"),
        ..stale
    };
    assert!(matches!(
        ensure_issue_type_preflight(&current, unknown),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn issue_type_serialization_keeps_frontend_field_names() {
    let value = serde_json::to_value(status(None, true)).expect("status JSON");
    assert_eq!(value["repositoryId"], "R_1");
    assert_eq!(value["issueNodeId"], "I_7");
    assert_eq!(value["availableIssueTypes"][0]["nodeId"], "IT_bug");
    assert_eq!(value["viewerCanUpdate"], true);
}

#[test]
fn issue_type_postflight_requires_the_selected_type_to_persist() {
    let status = status(Some("IT_bug"), true);
    let returned = IssueTypeIssue {
        id: "I_7".to_string(),
        number: 7,
        viewer_can_update: true,
        issue_type: Some(IssueTypeNode {
            id: "IT_task".to_string(),
            name: "Task".to_string(),
            description: None,
        }),
        repository: Some(IssueTypeRepositoryIdentity {
            id: "R_1".to_string(),
            name_with_owner: "octocat/hello-world".to_string(),
        }),
    };
    let mutation = IssueTypeMutation {
        owner: "octocat",
        repository: "hello-world",
        issue_number: 7,
        expected_issue_node_id: "I_7",
        expected_issue_type_node_id: Some("IT_bug"),
        issue_type_node_id: Some("IT_task"),
    };
    assert!(matches!(
        ensure_issue_type_postflight(&status, &returned, mutation),
        Err(AppError::GitHub(_))
    ));
}
