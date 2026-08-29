use super::*;

fn author_json() -> serde_json::Value {
    serde_json::json!({
        "login": "octocat",
        "id": 1,
        "node_id": "MDQ6VXNlcjE=",
        "avatar_url": "https://github.com/images/error/octocat_happy.gif",
        "gravatar_id": "",
        "url": "https://api.github.com/users/octocat",
        "html_url": "https://github.com/octocat",
        "followers_url": "https://api.github.com/users/octocat/followers",
        "following_url": "https://api.github.com/users/octocat/following{/other_user}",
        "gists_url": "https://api.github.com/users/octocat/gists{/gist_id}",
        "starred_url": "https://api.github.com/users/octocat/starred{/owner}{/repo}",
        "subscriptions_url": "https://api.github.com/users/octocat/subscriptions",
        "organizations_url": "https://api.github.com/users/octocat/orgs",
        "repos_url": "https://api.github.com/users/octocat/repos",
        "events_url": "https://api.github.com/users/octocat/events{/privacy}",
        "received_events_url": "https://api.github.com/users/octocat/received_events",
        "type": "User",
        "site_admin": false
    })
}

fn release_fixture(asset_state: &str, asset_size: i64) -> Release {
    serde_json::from_value(serde_json::json!({
        "url": "https://api.github.com/repos/octocat/hello-world/releases/88",
        "html_url": "https://github.com/octocat/hello-world/releases/tag/v1.0.0",
        "assets_url": "https://api.github.com/repos/octocat/hello-world/releases/88/assets",
        "upload_url": "https://uploads.github.com/repos/octocat/hello-world/releases/88/assets{?name,label}",
        "tarball_url": "https://api.github.com/repos/octocat/hello-world/tarball/v1.0.0",
        "zipball_url": "https://api.github.com/repos/octocat/hello-world/zipball/v1.0.0",
        "id": 88,
        "node_id": "RE_kwDOA",
        "tag_name": "v1.0.0",
        "target_commitish": "main",
        "name": null,
        "body": "## Harbor 1.0\n\nA focused release.",
        "draft": false,
        "prerelease": true,
        "immutable": true,
        "created_at": "2026-08-28T08:00:00Z",
        "published_at": "2026-08-28T09:00:00Z",
        "author": author_json(),
        "assets": [{
            "url": "https://api.github.com/repos/octocat/hello-world/releases/assets/96",
            "browser_download_url": "https://github.com/octocat/hello-world/releases/download/v1.0.0/harbor.dmg",
            "id": 96,
            "node_id": "RA_kwDOA",
            "name": "harbor.dmg",
            "label": "macOS",
            "state": asset_state,
            "content_type": "application/x-apple-diskimage",
            "size": asset_size,
            "digest": "sha256:0123456789abcdef",
            "download_count": 42,
            "created_at": "2026-08-28T08:30:00Z",
            "updated_at": "2026-08-28T08:40:00Z",
            "uploader": null
        }]
    }))
    .expect("release fixture")
}

fn release() -> GitHubRelease {
    release_from_octocrab(release_fixture("uploaded", 12)).expect("mapped release")
}

fn mutation_input() -> GitHubReleaseMutationInput {
    GitHubReleaseMutationInput {
        tag_name: "v1.0.0".to_string(),
        target_commitish: "main".to_string(),
        name: "Harbor 1.0".to_string(),
        body: "A focused release.".to_string(),
        draft: false,
        prerelease: true,
    }
}

#[async_trait]
impl GitHubReleaseClient for super::super::tests::FakeGitHubClient {
    async fn list_releases(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubReleasePage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubReleasePage {
            releases: vec![release()],
            page,
            has_previous: page > 1,
            has_more: page == 1,
        })
    }

    async fn release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<GitHubRelease, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, release_id),
            ("octocat", "hello-world", 88)
        );
        Ok(release())
    }

    async fn download_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<GitHubFileDownload, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, release_id, asset_id),
            ("octocat", "hello-world", 88, 96)
        );
        Ok(GitHubFileDownload {
            bytes: b"release-asset".to_vec(),
        })
    }

    async fn download_release_archive(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        format: GitHubReleaseArchiveFormat,
    ) -> Result<GitHubFileDownload, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, release_id),
            ("octocat", "hello-world", 88)
        );
        assert_eq!(format, GitHubReleaseArchiveFormat::TarGz);
        Ok(GitHubFileDownload {
            bytes: b"source-archive".to_vec(),
        })
    }

    async fn create_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        input: &GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert_eq!(input, &mutation_input());
        Ok(release())
    }

    async fn update_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        input: &GitHubReleaseMutationInput,
    ) -> Result<GitHubRelease, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, release_id),
            ("octocat", "hello-world", 88)
        );
        assert_eq!(input, &mutation_input());
        Ok(release())
    }

    async fn delete_release(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, release_id),
            ("octocat", "hello-world", 88)
        );
        Ok(())
    }

    async fn upload_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        upload: &GitHubReleaseAssetUpload,
    ) -> Result<GitHubReleaseAsset, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, release_id),
            ("octocat", "hello-world", 88)
        );
        assert_eq!(upload.name, "harbor.dmg");
        assert_eq!(upload.size, 12);
        let mut release = release();
        Ok(release.assets.remove(0))
    }

    async fn delete_release_asset(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        release_id: u64,
        asset_id: u64,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, release_id, asset_id),
            ("octocat", "hello-world", 88, 96)
        );
        Ok(())
    }
}

#[test]
fn release_mapping_keeps_status_notes_author_and_asset_integrity() {
    let mapped = release();

    assert_eq!(mapped.id, 88);
    assert_eq!(
        mapped.reaction_subject,
        GitHubReactionSubjectRef {
            id: "RE_kwDOA".to_string(),
            kind: GitHubReactionSubjectKind::Release,
        }
    );
    assert_eq!(mapped.name, None);
    assert_eq!(mapped.tag_name, "v1.0.0");
    assert!(mapped.prerelease);
    assert!(mapped.immutable);
    assert_eq!(mapped.author.as_deref(), Some("octocat"));
    assert!(mapped.has_zipball);
    assert!(mapped.has_tarball);
    assert_eq!(mapped.assets[0].name, "harbor.dmg");
    assert_eq!(mapped.assets[0].size, 12);
    assert_eq!(mapped.assets[0].download_count, 42);
    assert_eq!(
        mapped.assets[0].digest.as_deref(),
        Some("sha256:0123456789abcdef")
    );
}

#[test]
fn release_assets_must_belong_to_the_release_and_be_uploaded() {
    let uploaded = release_fixture("uploaded", 12);
    let processing = release_fixture("new", 12);
    let invalid_size = release_fixture("uploaded", -1);

    assert!(ensure_release_id(&uploaded, 88).is_ok());
    assert!(ensure_release_id(&uploaded, 87).is_err());
    assert!(ensure_release_asset_download_allowed(&uploaded.assets[0]).is_ok());
    assert!(ensure_release_asset_download_allowed(&processing.assets[0]).is_err());
    assert!(ensure_release_asset_download_allowed(&invalid_size.assets[0]).is_err());
    assert!(release_asset_from_octocrab(invalid_size.assets[0].clone()).is_err());
}

#[test]
fn release_routes_and_download_names_match_github_and_desktop_rules() {
    assert_eq!(
        release_asset_route("octocat", "hello-world", 96),
        "/repos/octocat/hello-world/releases/assets/96"
    );
    assert_eq!(
        release_asset_download_name(" Harbor:macOS.dmg "),
        "Harbor_macOS.dmg"
    );
    assert_eq!(
        release_archive_download_name("v1.0.0", GitHubReleaseArchiveFormat::Zip),
        "v1.0.0.zip"
    );
    assert_eq!(
        release_archive_download_name("v1.0.0", GitHubReleaseArchiveFormat::TarGz),
        "v1.0.0.tar.gz"
    );
}

#[test]
fn release_mutation_validation_preserves_notes_and_enforces_stable_identity() {
    let mut input = mutation_input();
    input.tag_name = "  v1.0.0  ".to_string();
    input.target_commitish = "  main  ".to_string();
    input.name = "  Harbor 1.0  ".to_string();
    input.body = " before\n\nafter ".to_string();

    let validated = validate_release_input(input).expect("valid release input");
    assert_eq!(validated.tag_name, "v1.0.0");
    assert_eq!(validated.target_commitish, "main");
    assert_eq!(validated.name, "Harbor 1.0");
    assert_eq!(validated.body, " before\n\nafter ");

    let mut invalid = mutation_input();
    invalid.tag_name.clear();
    assert!(validate_release_input(invalid).is_err());
}

#[test]
fn immutable_releases_only_change_title_notes_or_the_complete_release() {
    let immutable = release_fixture("uploaded", 12);
    let input = mutation_input();

    assert!(ensure_release_update_allowed(&immutable, &input).is_ok());
    assert!(ensure_release_assets_mutable(&immutable).is_err());

    let mut changed_tag = input.clone();
    changed_tag.tag_name = "v1.0.1".to_string();
    assert!(ensure_release_update_allowed(&immutable, &changed_tag).is_err());

    let mut mutable = immutable.clone();
    mutable.immutable = Some(false);
    assert!(ensure_release_assets_mutable(&mutable).is_ok());
    assert!(ensure_release_update_allowed(&mutable, &changed_tag).is_ok());
}

#[test]
fn release_upload_urls_encode_file_names_and_reject_untrusted_hosts() {
    let release = release_fixture("uploaded", 12);
    let upload = GitHubReleaseAssetUpload {
        path: PathBuf::from("Harbor macOS #1.dmg"),
        name: "Harbor macOS #1.dmg".to_string(),
        size: 12,
    };
    let url = release_asset_upload_url(&release, &upload).expect("upload URL");
    assert_eq!(url.host_str(), Some("uploads.github.com"));
    assert_eq!(
        url.query_pairs().collect::<Vec<_>>(),
        vec![("name".into(), "Harbor macOS #1.dmg".into())]
    );

    let mut untrusted = release;
    untrusted.upload_url =
        "https://example.com/repos/octocat/hello-world/releases/88/assets".to_string();
    assert!(release_asset_upload_url(&untrusted, &upload).is_err());
}

#[test]
fn release_upload_errors_keep_permission_and_rate_limit_codes() {
    assert!(matches!(
        github_upload_error(
            reqwest::StatusCode::FORBIDDEN,
            br#"{"message":"Resource not accessible"}"#
        ),
        AppError::GitHubPermission(_)
    ));
    assert!(matches!(
        github_upload_error(
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            br#"{"message":"secondary rate limit"}"#
        ),
        AppError::GitHubRateLimited(_)
    ));
}
