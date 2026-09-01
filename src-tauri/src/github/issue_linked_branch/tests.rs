use super::*;
use crate::{
    error::AppError,
    github::issue_related::test_support::{mock_github, MockResponse},
};

const DEFAULT_OID: &str = "0123456789abcdef0123456789abcdef01234567";
const BRANCH_OID: &str = "89abcdef0123456789abcdef0123456789abcdef";

#[async_trait::async_trait]
impl GitHubIssueLinkedBranchClient for super::super::tests::FakeGitHubClient {
    async fn issue_linked_branches(
        &self,
        token: &str,
        request: IssueLinkedBranchRequest<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                request.owner,
                request.repository,
                request.issue_number,
                request.expected_issue_node_id,
                request.after
            ),
            ("octocat", "hello-world", 7, "I_7", None)
        );
        Ok(page(false, true, Vec::new()))
    }

    async fn create_issue_linked_branch(
        &self,
        token: &str,
        mutation: IssueLinkedBranchCreateMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(mutation.request.expected_issue_node_id, "I_7");
        Ok(page(
            false,
            false,
            vec![GitHubIssueLinkedBranch {
                id: "LB_1".to_string(),
                name: "issue-7".to_string(),
                repository_id: "R_1".to_string(),
                repository_full_name: "octocat/hello-world".to_string(),
                oid: BRANCH_OID.to_string(),
            }],
        ))
    }

    async fn delete_issue_linked_branch(
        &self,
        token: &str,
        mutation: IssueLinkedBranchDeleteMutation<'_>,
    ) -> Result<GitHubIssueLinkedBranchPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(mutation.linked_branch_id, "LB_1");
        Ok(page(false, true, Vec::new()))
    }
}

fn request(after: Option<&'static str>) -> IssueLinkedBranchRequest<'static> {
    linked_branch_request("octocat", "hello-world", 7, "I_7", after).expect("linked branch request")
}

fn mutation_create(name: Option<&'static str>) -> IssueLinkedBranchCreateMutation<'static> {
    IssueLinkedBranchCreateMutation {
        request: request(None),
        expected_default_branch_oid: DEFAULT_OID,
        branch_name: name,
    }
}

fn mutation_delete() -> IssueLinkedBranchDeleteMutation<'static> {
    IssueLinkedBranchDeleteMutation {
        request: request(None),
        linked_branch_id: "LB_1",
        expected_branch_name: "issue-7",
        expected_branch_oid: BRANCH_OID,
    }
}

fn branch(id: &str, name: &str, oid: &str) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "ref": {
            "name": name,
            "repository": { "id": "R_1", "nameWithOwner": "octocat/hello-world" },
            "target": { "oid": oid }
        }
    })
}

fn page_response(permission: &str, branches: &[serde_json::Value], has_next: bool) -> String {
    serde_json::json!({
        "data": {
            "repository": {
                "id": "R_1",
                "nameWithOwner": "octocat/hello-world",
                "viewerPermission": permission,
                "defaultBranchRef": {
                    "name": "main",
                    "target": { "oid": DEFAULT_OID }
                },
                "issue": {
                    "id": "I_7",
                    "number": 7,
                    "linkedBranches": {
                        "totalCount": branches.len(),
                        "nodes": branches,
                        "pageInfo": {
                            "hasNextPage": has_next,
                            "endCursor": if has_next { Some("CURSOR_1") } else { None::<&str> }
                        }
                    }
                }
            }
        }
    })
    .to_string()
}

fn page(
    has_next: bool,
    viewer_can_create: bool,
    branches: Vec<GitHubIssueLinkedBranch>,
) -> GitHubIssueLinkedBranchPage {
    GitHubIssueLinkedBranchPage {
        repository_id: "R_1".to_string(),
        repository_full_name: "octocat/hello-world".to_string(),
        issue_node_id: "I_7".to_string(),
        issue_number: 7,
        default_branch: "main".to_string(),
        default_branch_oid: DEFAULT_OID.to_string(),
        viewer_can_create,
        branches,
        next_cursor: has_next.then(|| "CURSOR_1".to_string()),
    }
}

#[test]
fn linked_branch_contract_uses_official_queries_and_mutations() {
    assert!(LINKED_BRANCH_QUERY.contains("linkedBranches"));
    assert!(LINKED_BRANCH_QUERY.contains("defaultBranchRef"));
    assert!(CREATE_LINKED_BRANCH_MUTATION.contains("createLinkedBranch"));
    assert!(CREATE_LINKED_BRANCH_MUTATION.contains("... on Commit { oid }"));
    assert!(DELETE_LINKED_BRANCH_MUTATION.contains("deleteLinkedBranch"));
}

#[test]
fn create_preflight_requires_identity_default_revision_and_write_permission() {
    let mutation = mutation_create(Some("issue-7"));
    assert!(ensure_create_preflight(&page(false, true, Vec::new()), mutation).is_ok());

    let mut stale = page(false, true, Vec::new());
    stale.issue_node_id = "I_other".to_string();
    assert!(matches!(
        ensure_create_preflight(&stale, mutation),
        Err(AppError::GitHubIssueStateConflict(_))
    ));

    let mut changed_default = page(false, true, Vec::new());
    changed_default.default_branch_oid = BRANCH_OID.to_string();
    assert!(matches!(
        ensure_create_preflight(&changed_default, mutation),
        Err(AppError::GitHubIssueStateConflict(_))
    ));

    assert!(matches!(
        ensure_create_preflight(&page(false, false, Vec::new()), mutation),
        Err(AppError::GitHubPermission(_))
    ));
}

#[test]
fn delete_preflight_rejects_stale_or_missing_linked_branch() {
    let mutation = mutation_delete();
    let current = page(
        false,
        true,
        vec![GitHubIssueLinkedBranch {
            id: "LB_1".to_string(),
            name: "issue-7".to_string(),
            repository_id: "R_1".to_string(),
            repository_full_name: "octocat/hello-world".to_string(),
            oid: BRANCH_OID.to_string(),
        }],
    );
    assert!(ensure_delete_preflight(&current, mutation).is_ok());
    assert!(matches!(
        ensure_delete_preflight(&page(false, true, Vec::new()), mutation),
        Err(AppError::GitHubIssueStateConflict(_))
    ));
}

#[test]
fn create_postflight_requires_the_authoritative_branch_repository_id() {
    let mutation = mutation_create(Some("issue-7"));
    let returned = GitHubIssueLinkedBranch {
        id: "LB_1".to_string(),
        name: "issue-7".to_string(),
        repository_id: "R_2".to_string(),
        repository_full_name: "octocat/hello-world".to_string(),
        oid: DEFAULT_OID.to_string(),
    };
    let page = page(false, true, vec![returned.clone()]);
    assert!(matches!(
        ensure_create_postflight(&page, &returned, mutation),
        Err(AppError::GitHub(_))
    ));
}

#[tokio::test]
async fn transport_loads_linked_branches_and_cursor() {
    let (client, requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: page_response("WRITE", &[branch("LB_1", "issue-7", BRANCH_OID)], true),
    }])
    .await;

    let page = load_issue_linked_branches_with_client(&client, request(None))
        .await
        .expect("linked branches");
    server.await.expect("mock server");
    assert_eq!(page.default_branch, "main");
    assert_eq!(page.default_branch_oid, DEFAULT_OID);
    assert!(page.viewer_can_create);
    assert_eq!(page.branches[0].name, "issue-7");
    assert_eq!(page.next_cursor.as_deref(), Some("CURSOR_1"));
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 1);
    assert!(requests[0].contains("linkedBranches"));
}

#[tokio::test]
async fn mutation_preflight_and_postflight_can_reconcile_all_linked_branch_pages() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: page_response("WRITE", &[branch("LB_1", "issue-7", BRANCH_OID)], true),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: page_response("WRITE", &[branch("LB_2", "issue-8", BRANCH_OID)], false),
        },
    ])
    .await;

    let page = load_all_issue_linked_branches_with_client(&client, request(None))
        .await
        .expect("all linked branches");
    server.await.expect("mock server");
    assert_eq!(page.branches.len(), 2);
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 2);
    assert!(requests[1].contains("CURSOR_1"));
}

#[tokio::test]
async fn transport_creates_linked_branch_with_postflight_confirmation() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: page_response("WRITE", &[], false),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: serde_json::json!({
                "data": { "createLinkedBranch": {
                    "issue": { "id": "I_7", "number": 7, "repository": { "id": "R_1", "nameWithOwner": "octocat/hello-world" } },
                    "linkedBranch": branch("LB_1", "issue-7", DEFAULT_OID)
                }}
            }).to_string(),
        },
        MockResponse {
            status: "200 OK",
            headers: vec![],
            body: page_response("WRITE", &[branch("LB_1", "issue-7", DEFAULT_OID)], false),
        },
    ])
    .await;

    let mutation = mutation_create(Some("issue-7"));
    let page = create_issue_linked_branch_with_client(&client, mutation)
        .await
        .expect("created linked branch");
    assert_eq!(page.branches[0].name, "issue-7");
    server.await.expect("mock server");
    assert_eq!(requests.lock().expect("requests").len(), 3);
}

#[tokio::test]
async fn transport_rejects_a_created_branch_from_a_different_repository() {
    let (client, _requests, server) = mock_github(vec![MockResponse {
        status: "200 OK",
        headers: vec![],
        body: serde_json::json!({
            "data": { "createLinkedBranch": {
                "issue": { "id": "I_7", "number": 7, "repository": { "id": "R_1", "nameWithOwner": "octocat/hello-world" } },
                "linkedBranch": {
                    "id": "LB_1",
                    "ref": {
                        "name": "issue-7",
                        "repository": { "id": "R_2", "nameWithOwner": "octocat/other" },
                        "target": { "oid": DEFAULT_OID }
                    }
                }
            }}
        })
        .to_string(),
    }])
    .await;

    let error = execute_create(
        &client,
        mutation_create(Some("issue-7")),
        &page(false, true, Vec::new()),
    )
    .await
    .expect_err("cross-repository branch must be rejected");
    server.await.expect("mock server");
    assert!(matches!(error, AppError::GitHub(_)));
}

#[tokio::test]
async fn transport_does_not_retry_a_failed_linked_branch_write() {
    use std::time::Duration;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        time::timeout,
    };

    let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
    let address = listener.local_addr().expect("mock address");
    let server = tokio::spawn(async move {
        let mut request_count = 0;
        loop {
            let accepted = timeout(Duration::from_secs(2), listener.accept()).await;
            let Ok(Ok((mut stream, _))) = accepted else {
                break;
            };
            request_count += 1;
            let mut buffer = [0_u8; 4096];
            let _ = timeout(Duration::from_secs(1), stream.read(&mut buffer)).await;
            let response =
                "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            stream
                .write_all(response.as_bytes())
                .await
                .expect("mock write");
        }
        request_count
    });
    let client = linked_branch_client_with_base(
        "github-user-access-token",
        Some(&format!("http://{address}")),
    )
    .expect("no-retry client");
    let result: Result<serde_json::Value, _> = client
        .graphql(&serde_json::json!({
            "query": "query HarborRetryProbe { viewer { login } }",
            "variables": {},
        }))
        .await;
    assert!(result.is_err());
    assert_eq!(server.await.expect("mock server"), 1);
}
