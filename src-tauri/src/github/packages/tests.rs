use async_trait::async_trait;
use std::sync::{Arc, Mutex};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

use super::*;
use crate::github::SystemCredentialStore;

struct MockResponse {
    status: &'static str,
    body: String,
}

async fn mock_github(
    responses: Vec<MockResponse>,
) -> (
    octocrab::Octocrab,
    Arc<Mutex<Vec<String>>>,
    tokio::task::JoinHandle<()>,
) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("mock bind");
    let address = listener.local_addr().expect("mock address");
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = Arc::clone(&requests);
    let server = tokio::spawn(async move {
        for response in responses {
            let (mut stream, _) = listener.accept().await.expect("mock accept");
            let mut buffer = Vec::new();
            loop {
                let mut chunk = [0_u8; 1024];
                let read = stream.read(&mut chunk).await.expect("mock read");
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
                if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8(buffer).expect("request utf8");
            captured
                .lock()
                .expect("request lock")
                .push(request.lines().next().unwrap_or_default().to_string());
            let payload = format!(
                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response.status,
                response.body.len(),
                response.body
            );
            stream
                .write_all(payload.as_bytes())
                .await
                .expect("mock write");
        }
    });
    let client = octocrab::Octocrab::builder()
        .base_uri(format!("http://{address}"))
        .expect("mock base uri")
        .personal_token("github-user-access-token".to_string())
        .build()
        .expect("mock client");
    (client, requests, server)
}

fn package_api_json() -> serde_json::Value {
    serde_json::json!({
        "id": 42,
        "name": "harbor/desktop",
        "package_type": "container",
        "visibility": "private",
        "version_count": 2,
        "owner": { "login": "octocat" },
        "html_url": "https://github.com/users/octocat/packages/container/package/harbor%2Fdesktop",
        "created_at": "2026-08-20T08:00:00Z",
        "updated_at": "2026-08-29T08:00:00Z",
        "repository": null
    })
}

fn version_api_json() -> serde_json::Value {
    serde_json::json!({
        "id": 84,
        "name": "sha256:abc123",
        "html_url": "https://github.com/users/octocat/packages/container/harbor/84",
        "created_at": "2026-08-20T08:00:00Z",
        "updated_at": "2026-08-29T08:00:00Z",
        "description": null,
        "license": null,
        "deleted_at": "2026-08-29T09:00:00Z",
        "metadata": { "container": { "tags": ["latest", "v1.0.0"] } }
    })
}

fn fake_package() -> GitHubPackage {
    GitHubPackage {
        id: 42,
        name: "harbor/desktop".to_string(),
        package_type: GitHubPackageType::Container,
        visibility: GitHubPackageVisibilityValue::Private,
        version_count: 2,
        owner: "octocat".to_string(),
        url: "https://github.com/users/octocat/packages/container/package/harbor%2Fdesktop"
            .to_string(),
        created_at: "2026-08-20T08:00:00Z".to_string(),
        updated_at: "2026-08-29T08:00:00Z".to_string(),
        repository: Some(GitHubPackageRepository {
            name: "harbor".to_string(),
            full_name: "octocat/harbor".to_string(),
            url: "https://github.com/octocat/harbor".to_string(),
        }),
    }
}

fn fake_version(state: GitHubPackageVersionState) -> GitHubPackageVersion {
    GitHubPackageVersion {
        id: 84,
        name: "sha256:abc123".to_string(),
        state,
        metadata: GitHubPackageVersionMetadata::Container {
            tags: vec!["latest".to_string(), "v1.0.0".to_string()],
        },
        description: None,
        license: None,
        deleted_at: (state == GitHubPackageVersionState::Deleted)
            .then(|| "2026-08-29T09:00:00Z".to_string()),
        url: "https://github.com/users/octocat/packages/container/harbor/84".to_string(),
        created_at: "2026-08-20T08:00:00Z".to_string(),
        updated_at: "2026-08-29T08:00:00Z".to_string(),
    }
}

#[tokio::test]
#[ignore = "requires saved Harbor GitHub OAuth credentials with read:packages"]
async fn live_harbor_oauth_lists_personal_packages() {
    let service = GitHubService::new(
        Arc::new(OctocrabGitHubClient),
        Arc::new(SystemCredentialStore::default()),
        None,
    );

    let page = service
        .personal_packages(GitHubPackageType::Container, None, 1)
        .await
        .expect("Harbor OAuth should list personal Packages");

    assert_eq!(page.page, 1);
}

#[async_trait]
impl GitHubPackagesClient for super::super::tests::FakeGitHubClient {
    async fn personal_packages(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        visibility: Option<GitHubPackageVisibility>,
        page: u32,
    ) -> Result<GitHubPackagePage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(package_type, GitHubPackageType::Container);
        assert_eq!(visibility, Some(GitHubPackageVisibility::Private));
        assert_eq!(page, 1);
        Ok(GitHubPackagePage {
            packages: vec![fake_package()],
            page,
            has_previous: false,
            has_more: false,
        })
    }

    async fn personal_package(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        package_name: &str,
    ) -> Result<GitHubPackage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(package_type, GitHubPackageType::Container);
        assert_eq!(package_name, "harbor/desktop");
        Ok(fake_package())
    }

    async fn personal_package_versions(
        &self,
        token: &str,
        package_type: GitHubPackageType,
        package_name: &str,
        state: GitHubPackageVersionState,
        page: u32,
    ) -> Result<GitHubPackageVersionPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(package_type, GitHubPackageType::Container);
        assert_eq!(package_name, "harbor/desktop");
        assert_eq!(state, GitHubPackageVersionState::Active);
        assert_eq!(page, 1);
        Ok(GitHubPackageVersionPage {
            versions: vec![fake_version(state)],
            state,
            page,
            has_previous: false,
            has_more: false,
        })
    }

    async fn mutate_personal_package_version(
        &self,
        token: &str,
        input: &GitHubPackageVersionMutationInput,
    ) -> Result<GitHubPackageVersionMutationResult, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(input.package_type, GitHubPackageType::Container);
        assert_eq!(input.package_name, "harbor/desktop");
        assert_eq!(input.expected_package_id, 42);
        assert_eq!(input.version_id, 84);
        assert_eq!(input.expected_version_name, "sha256:abc123");
        assert_eq!(input.action, GitHubPackageVersionAction::Delete);
        Ok(GitHubPackageVersionMutationResult {
            package_id: input.expected_package_id,
            package_type: input.package_type,
            package_name: input.package_name.clone(),
            version_id: input.version_id,
            version_name: input.expected_version_name.clone(),
            action: input.action,
        })
    }
}

#[test]
fn package_routes_encode_names_as_one_path_segment() {
    assert_eq!(
        package_route(GitHubPackageType::Container, "harbor/desktop"),
        "/user/packages/container/harbor%2Fdesktop"
    );
    assert_eq!(
        package_version_route(GitHubPackageType::Npm, "@harbor/app", 84),
        "/user/packages/npm/%40harbor%2Fapp/versions/84"
    );
}

#[test]
fn package_inputs_are_bounded_and_preserve_registry_names() {
    assert_eq!(
        normalize_package_name("  @harbor/desktop  ").unwrap(),
        "@harbor/desktop"
    );
    assert!(normalize_package_name("\n").is_err());
    assert!(normalize_package_name(&"a".repeat(MAX_PACKAGE_NAME_BYTES + 1)).is_err());
    assert_eq!(validate_package_page(1).unwrap(), 1);
    assert_eq!(
        validate_package_page(PACKAGE_PAGE_LIMIT).unwrap(),
        PACKAGE_PAGE_LIMIT
    );
    assert!(validate_package_page(0).is_err());
    assert!(validate_package_page(PACKAGE_PAGE_LIMIT + 1).is_err());
}

#[test]
fn package_request_enums_reject_unknown_and_organization_only_values() {
    assert!(serde_json::from_value::<GitHubPackageType>(serde_json::json!("future")).is_err());
    assert!(
        serde_json::from_value::<GitHubPackageVisibility>(serde_json::json!("internal")).is_err()
    );
    assert!(
        serde_json::from_value::<GitHubPackageVisibility>(serde_json::json!("future")).is_err()
    );
    assert!(
        serde_json::from_value::<GitHubPackageVersionState>(serde_json::json!("archived")).is_err()
    );
    assert!(
        serde_json::from_value::<GitHubPackageVersionAction>(serde_json::json!("publish")).is_err()
    );
}

#[test]
fn known_oauth_scopes_gate_package_reads_and_writes() {
    assert!(ensure_package_scopes(&[], &["read:packages"]).is_ok());
    let normalized_write_scopes = vec!["write:packages".to_string()];
    assert!(ensure_package_scopes(&normalized_write_scopes, &["read:packages"]).is_ok());
    assert!(ensure_package_scopes(
        &["read:packages".to_string(), "delete:packages".to_string()],
        &["read:packages", "delete:packages"],
    )
    .is_ok());
    assert!(matches!(
        ensure_package_scopes(
            &["read:packages".to_string()],
            &["read:packages", "write:packages"],
        ),
        Err(AppError::GitHubPermission(_))
    ));
}

#[test]
fn hidden_package_routes_treat_not_found_as_a_possible_scope_failure() {
    assert!(package_status_requires_reconnect(Some(404), true));
    assert!(!package_status_requires_reconnect(Some(404), false));
    assert!(!package_status_requires_reconnect(Some(403), true));
}

#[test]
fn package_mapping_keeps_repository_identity() {
    let package = package_from_raw(
        RawPackage {
            id: 42,
            name: "harbor".to_string(),
            package_type: "npm".to_string(),
            visibility: "public".to_string(),
            version_count: 3,
            owner: RawPackageOwner {
                login: "octocat".to_string(),
            },
            html_url: "https://github.com/users/octocat/packages/npm/package/harbor".to_string(),
            created_at: "2026-08-20T08:00:00Z".to_string(),
            updated_at: "2026-08-29T08:00:00Z".to_string(),
            repository: Some(RawPackageRepository {
                name: "harbor".to_string(),
                full_name: "octocat/harbor".to_string(),
                html_url: "https://github.com/octocat/harbor".to_string(),
            }),
        },
        GitHubPackageType::Npm,
    )
    .unwrap();

    assert_eq!(package.owner, "octocat");
    assert_eq!(package.visibility, GitHubPackageVisibilityValue::Public);
    assert_eq!(
        package
            .repository
            .as_ref()
            .map(|repository| repository.full_name.as_str()),
        Some("octocat/harbor")
    );
}

#[test]
fn package_version_mapping_sorts_and_deduplicates_container_tags() {
    let version = package_version_from_raw(
        RawPackageVersion {
            id: 84,
            name: "sha256:abc123".to_string(),
            html_url: "https://github.com/users/octocat/packages/container/harbor/84".to_string(),
            created_at: "2026-08-20T08:00:00Z".to_string(),
            updated_at: "2026-08-29T08:00:00Z".to_string(),
            description: None,
            license: None,
            deleted_at: None,
            metadata: serde_json::json!({
                "container": { "tags": ["v1.0.0", "latest", "v1.0.0"] }
            }),
        },
        GitHubPackageVersionState::Active,
        GitHubPackageType::Container,
    );

    assert_eq!(
        version.metadata,
        GitHubPackageVersionMetadata::Container {
            tags: vec!["latest".to_string(), "v1.0.0".to_string()]
        }
    );
    assert_eq!(version.state, GitHubPackageVersionState::Active);
}

#[test]
fn package_mapping_keeps_unknown_visibility_and_registry_metadata() {
    assert_eq!(
        package_visibility_from_raw("future".to_string()),
        GitHubPackageVisibilityValue::Unknown("future".to_string())
    );
    assert_eq!(
        package_version_metadata_from_raw(
            serde_json::json!({ "maven": { "classifier": "sources" } }),
            GitHubPackageType::Maven,
        ),
        GitHubPackageVersionMetadata::Unknown {
            raw: serde_json::json!({ "maven": { "classifier": "sources" } })
        }
    );
    let malformed_container = serde_json::json!({ "container": { "tags": ["latest", 42] } });
    assert_eq!(
        package_version_metadata_from_raw(
            malformed_container.clone(),
            GitHubPackageType::Container,
        ),
        GitHubPackageVersionMetadata::Unknown {
            raw: malformed_container
        }
    );
}

#[test]
fn package_mapping_rejects_cross_registry_responses() {
    let result = package_from_raw(
        RawPackage {
            id: 42,
            name: "harbor".to_string(),
            package_type: "maven".to_string(),
            visibility: "public".to_string(),
            version_count: 1,
            owner: RawPackageOwner {
                login: "octocat".to_string(),
            },
            html_url: "https://github.com/users/octocat/packages/maven/package/harbor".to_string(),
            created_at: "2026-08-20T08:00:00Z".to_string(),
            updated_at: "2026-08-29T08:00:00Z".to_string(),
            repository: None,
        },
        GitHubPackageType::Npm,
    );

    assert!(matches!(result, Err(AppError::GitHubPackageConflict(_))));
}

fn mutation_input(action: GitHubPackageVersionAction) -> GitHubPackageVersionMutationInput {
    GitHubPackageVersionMutationInput {
        package_type: GitHubPackageType::Container,
        package_name: "harbor/desktop".to_string(),
        expected_package_id: 42,
        version_id: 84,
        expected_version_name: "sha256:abc123".to_string(),
        action,
    }
}

#[tokio::test]
async fn package_read_transport_uses_every_official_route_and_filter() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            body: serde_json::json!([package_api_json()]).to_string(),
        },
        MockResponse {
            status: "200 OK",
            body: package_api_json().to_string(),
        },
        MockResponse {
            status: "200 OK",
            body: serde_json::json!([version_api_json()]).to_string(),
        },
    ])
    .await;

    let packages = personal_packages_with_client(
        &client,
        GitHubPackageType::Container,
        Some(GitHubPackageVisibility::Private),
        2,
    )
    .await
    .expect("package list");
    let package =
        personal_package_with_client(&client, GitHubPackageType::Container, "harbor/desktop")
            .await
            .expect("package detail");
    let versions = personal_package_versions_with_client(
        &client,
        GitHubPackageType::Container,
        "harbor/desktop",
        GitHubPackageVersionState::Deleted,
        3,
    )
    .await
    .expect("package versions");
    server.await.expect("mock server");

    assert!(packages.has_previous);
    assert_eq!(package.id, 42);
    assert_eq!(versions.state, GitHubPackageVersionState::Deleted);
    let requests = requests.lock().expect("request lock");
    assert!(requests[0].starts_with("GET /user/packages?"));
    for parameter in [
        "package_type=container",
        "visibility=private",
        "page=2",
        "per_page=30",
    ] {
        assert!(requests[0].contains(parameter), "missing {parameter}");
    }
    assert_eq!(
        requests[1],
        "GET /user/packages/container/harbor%2Fdesktop HTTP/1.1"
    );
    assert!(requests[2].starts_with("GET /user/packages/container/harbor%2Fdesktop/versions?"));
    for parameter in ["state=deleted", "page=3", "per_page=30"] {
        assert!(requests[2].contains(parameter), "missing {parameter}");
    }
}

#[tokio::test]
async fn private_package_list_not_found_becomes_a_reconnect_error() {
    let (client, _, server) = mock_github(vec![MockResponse {
        status: "404 Not Found",
        body: serde_json::json!({
            "message": "Not Found",
            "documentation_url": "https://docs.github.com/rest/packages/packages"
        })
        .to_string(),
    }])
    .await;

    let result = personal_packages_with_client(
        &client,
        GitHubPackageType::Container,
        Some(GitHubPackageVisibility::Private),
        1,
    )
    .await;
    server.await.expect("mock server");

    assert!(matches!(result, Err(AppError::GitHubPermission(_))));
}

#[tokio::test]
async fn package_version_delete_accepts_the_official_no_content_response() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            body: package_api_json().to_string(),
        },
        MockResponse {
            status: "200 OK",
            body: version_api_json().to_string(),
        },
        MockResponse {
            status: "204 No Content",
            body: String::new(),
        },
    ])
    .await;

    let result = mutate_personal_package_version_with_client(
        &client,
        &mutation_input(GitHubPackageVersionAction::Delete),
    )
    .await
    .expect("delete version");
    server.await.expect("mock server");

    assert_eq!(result.action, GitHubPackageVersionAction::Delete);
    let requests = requests.lock().expect("request lock");
    assert_eq!(
        requests[1],
        "GET /user/packages/container/harbor%2Fdesktop/versions/84 HTTP/1.1"
    );
    assert_eq!(
        requests[2],
        "DELETE /user/packages/container/harbor%2Fdesktop/versions/84 HTTP/1.1"
    );
}

#[tokio::test]
async fn package_version_restore_accepts_the_official_no_content_response() {
    let (client, requests, server) = mock_github(vec![
        MockResponse {
            status: "200 OK",
            body: package_api_json().to_string(),
        },
        MockResponse {
            status: "200 OK",
            body: serde_json::json!([version_api_json()]).to_string(),
        },
        MockResponse {
            status: "204 No Content",
            body: String::new(),
        },
    ])
    .await;

    let result = mutate_personal_package_version_with_client(
        &client,
        &mutation_input(GitHubPackageVersionAction::Restore),
    )
    .await
    .expect("restore version");
    server.await.expect("mock server");

    assert_eq!(result.action, GitHubPackageVersionAction::Restore);
    let requests = requests.lock().expect("request lock");
    assert!(requests[1]
        .starts_with("GET /user/packages/container/harbor%2Fdesktop/versions?state=deleted"));
    assert_eq!(
        requests[2],
        "POST /user/packages/container/harbor%2Fdesktop/versions/84/restore HTTP/1.1"
    );
}
