use async_trait::async_trait;
use base64::Engine;

use super::*;

#[async_trait]
impl GitHubCodeClient for super::super::tests::FakeGitHubClient {
    async fn repository_code_overview(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
    ) -> Result<GitHubCodeOverview, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, reference),
            ("octocat", "hello-world", "main")
        );
        Ok(GitHubCodeOverview {
            branches: vec![GitHubBranch {
                name: "main".to_string(),
                sha: "abc1234".to_string(),
                protected: true,
            }],
            tags: vec![GitHubTag {
                name: "v0.1.0".to_string(),
                sha: "abc1234".to_string(),
                zipball_url: "https://github.com/octocat/hello-world/archive/v0.1.0.zip"
                    .to_string(),
                tarball_url: "https://github.com/octocat/hello-world/archive/v0.1.0.tar.gz"
                    .to_string(),
            }],
            tags_have_more: false,
            commits: vec![GitHubCommitSummary {
                sha: "abc1234".to_string(),
                short_sha: "abc1234".to_string(),
                title: "Ship the workspace".to_string(),
                author: Some("Octo Cat".to_string()),
                url: "https://github.com/octocat/hello-world/commit/abc1234".to_string(),
            }],
            commits_have_more: false,
            readme: None,
            can_write: true,
            is_archived: false,
        })
    }

    async fn repository_commits(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        _path: &str,
        page: u32,
    ) -> Result<GitHubRepositoryCommitPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, reference),
            ("octocat", "hello-world", "main")
        );
        Ok(GitHubRepositoryCommitPage {
            commits: vec![GitHubRepositoryCommit {
                sha: "abc1234".to_string(),
                short_sha: "abc1234".to_string(),
                title: "Ship the workspace".to_string(),
                message: "Ship the workspace".to_string(),
                author: Some("Octo Cat".to_string()),
                author_login: Some("octocat".to_string()),
                author_avatar_url: Some("https://github.com/octocat.png".to_string()),
                committed_at: Some("2026-08-25T08:00:00+00:00".to_string()),
                url: "https://github.com/octocat/hello-world/commit/abc1234".to_string(),
                verified: Some(true),
            }],
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn repository_tags(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        page: u32,
    ) -> Result<GitHubTagPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubTagPage {
            tags: Vec::new(),
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn repository_blame(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubBlame, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, reference),
            ("octocat", "hello-world", "main")
        );
        assert!(!path.is_empty());
        Ok(GitHubBlame { ranges: Vec::new() })
    }

    async fn search_repository_code(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        query: &str,
        page: u32,
    ) -> Result<GitHubCodeSearchPage, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        assert!(!query.is_empty());
        Ok(GitHubCodeSearchPage {
            results: Vec::new(),
            total_count: 0,
            incomplete_results: false,
            page,
            has_previous: page > 1,
            has_more: false,
        })
    }

    async fn repository_contents(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubContentListing, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, reference, path),
            ("octocat", "hello-world", "main", "")
        );
        Ok(GitHubContentListing {
            entries: vec![GitHubContentEntry {
                name: "src".to_string(),
                path: "src".to_string(),
                sha: "abc123".to_string(),
                kind: "dir".to_string(),
                size: 0,
                url: Some("https://github.com/octocat/hello-world/tree/main/src".to_string()),
            }],
        })
    }

    async fn repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFilePreview, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, reference, path),
            ("octocat", "hello-world", "main", "src/lib.rs")
        );
        Ok(GitHubFilePreview::Text {
            name: "lib.rs".to_string(),
            path: "src/lib.rs".to_string(),
            sha: "abc123".to_string(),
            size: 30,
            url: Some("https://github.com/octocat/hello-world/blob/main/src/lib.rs".to_string()),
            raw_url: Some(
                "https://raw.githubusercontent.com/octocat/hello-world/main/src/lib.rs".to_string(),
            ),
            content: "pub fn harbor() {\n    todo!()\n}\n".to_string(),
        })
    }

    async fn download_repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        reference: &str,
        path: &str,
    ) -> Result<GitHubFileDownload, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, reference),
            ("octocat", "hello-world", "main")
        );
        assert_eq!(path, "src/lib.rs");
        Ok(GitHubFileDownload {
            bytes: b"fixture".to_vec(),
        })
    }
}

fn content_json(name: &str, path: &str, kind: &str) -> serde_json::Value {
    serde_json::json!({
        "name": name,
        "path": path,
        "sha": "abc123",
        "encoding": null,
        "content": null,
        "size": 10,
        "url": format!("https://api.github.com/repos/octocat/hello-world/contents/{path}"),
        "html_url": format!("https://github.com/octocat/hello-world/blob/main/{path}"),
        "git_url": null,
        "download_url": null,
        "type": kind,
        "_links": {
            "git": null,
            "html": null,
            "self": format!("https://api.github.com/repos/octocat/hello-world/contents/{path}")
        },
        "license": null
    })
}

#[test]
fn content_listing_places_directories_before_files() {
    let file = serde_json::from_value(content_json("README.md", "README.md", "file"))
        .expect("file fixture");
    let directory =
        serde_json::from_value(content_json("src", "src", "dir")).expect("directory fixture");

    let listing = content_listing_from_octocrab(vec![file, directory]);

    assert_eq!(listing.entries[0].name, "src");
    assert_eq!(listing.entries[1].name, "README.md");
}

#[test]
fn file_preview_decodes_utf8_text() {
    let mut file = content_json("main.rs", "src/main.rs", "file");
    file["encoding"] = serde_json::json!("base64");
    file["content"] = serde_json::json!("Zm4gbWFpbigpIHt9Cg==");
    file["size"] = serde_json::json!(13);
    let file = serde_json::from_value(file).expect("file fixture");

    let preview = file_preview_from_octocrab(vec![file]).expect("file preview");

    assert_eq!(
        preview,
        GitHubFilePreview::Text {
            name: "main.rs".to_string(),
            path: "src/main.rs".to_string(),
            sha: "abc123".to_string(),
            size: 13,
            url: Some("https://github.com/octocat/hello-world/blob/main/src/main.rs".to_string()),
            raw_url: None,
            content: "fn main() {}\n".to_string(),
        }
    );
}

#[test]
fn file_preview_marks_binary_content_as_unsupported() {
    let mut file = content_json("logo.png", "assets/logo.png", "file");
    file["encoding"] = serde_json::json!("base64");
    file["content"] = serde_json::json!("AAEC");
    file["size"] = serde_json::json!(3);
    let file = serde_json::from_value(file).expect("file fixture");

    let preview = file_preview_from_octocrab(vec![file]).expect("file preview");

    assert_eq!(
        preview,
        GitHubFilePreview::Unsupported {
            name: "logo.png".to_string(),
            path: "assets/logo.png".to_string(),
            sha: "abc123".to_string(),
            size: 3,
            url: Some(
                "https://github.com/octocat/hello-world/blob/main/assets/logo.png".to_string()
            ),
            raw_url: None,
            reason: GitHubFilePreviewUnsupportedReason::Binary,
        }
    );
}

#[test]
fn file_preview_skips_content_above_the_safe_limit() {
    let mut file = content_json("fixture.txt", "fixtures/fixture.txt", "file");
    file["size"] = serde_json::json!(MAX_FILE_PREVIEW_BYTES + 1);
    let file = serde_json::from_value(file).expect("file fixture");

    let preview = file_preview_from_octocrab(vec![file]).expect("file preview");

    assert!(matches!(
        preview,
        GitHubFilePreview::Unsupported {
            reason: GitHubFilePreviewUnsupportedReason::TooLarge,
            ..
        }
    ));
}

#[test]
fn file_preview_skips_text_above_the_safe_line_limit() {
    let text = "x\n".repeat(MAX_FILE_PREVIEW_LINES + 1);
    let mut file = content_json("generated.txt", "fixtures/generated.txt", "file");
    file["encoding"] = serde_json::json!("base64");
    file["content"] = serde_json::json!(base64::prelude::BASE64_STANDARD.encode(&text));
    file["size"] = serde_json::json!(text.len());
    let file = serde_json::from_value(file).expect("file fixture");

    let preview = file_preview_from_octocrab(vec![file]).expect("file preview");

    assert!(matches!(
        preview,
        GitHubFilePreview::Unsupported {
            reason: GitHubFilePreviewUnsupportedReason::TooLarge,
            ..
        }
    ));
}

#[test]
fn file_preview_serializes_the_frontend_discriminator() {
    let preview = GitHubFilePreview::Unsupported {
        name: "generated.txt".to_string(),
        path: "fixtures/generated.txt".to_string(),
        sha: "abc123".to_string(),
        size: MAX_FILE_PREVIEW_BYTES + 1,
        url: None,
        raw_url: None,
        reason: GitHubFilePreviewUnsupportedReason::TooLarge,
    };

    let value = serde_json::to_value(preview).expect("serialized preview");

    assert_eq!(value["kind"], "unsupported");
    assert_eq!(value["reason"], "tooLarge");
}

#[test]
fn readme_content_is_decoded_without_panicking() {
    let mut readme = content_json("README.md", "README.md", "file");
    readme["encoding"] = serde_json::json!("base64");
    readme["content"] = serde_json::json!("IyBIZWxsbyBmcm9tIEhhcmJvcgo=");
    let readme = serde_json::from_value(readme).expect("readme fixture");

    let mapped = readme_from_octocrab(readme).expect("decoded README");

    assert_eq!(mapped.content, "# Hello from Harbor\n");
}

#[test]
fn code_search_keeps_useful_filters_but_enforces_repository_scope() {
    assert_eq!(
        repository_code_search_query(
            "octocat",
            "hello-world",
            "render OR (repo:other/project) org:other language:rust path:src"
        ),
        "render language:rust path:src repo:octocat/hello-world"
    );
}

#[test]
fn blame_ranges_keep_commit_and_line_attribution() {
    let range = blame_range_from_graphql(RepositoryBlameRange {
        starting_line: 4,
        ending_line: 9,
        age: 2,
        commit: RepositoryBlameCommit {
            oid: "abcdef123456".to_string(),
            abbreviated_oid: "abcdef1".to_string(),
            message: "Keep blame in the file viewer".to_string(),
            message_headline: "Keep blame in the file viewer".to_string(),
            committed_date: "2026-08-25T10:00:00Z".to_string(),
            url: "https://github.com/octocat/hello-world/commit/abcdef123456".to_string(),
            author: Some(RepositoryBlameAuthor {
                name: Some("Octo Cat".to_string()),
                user: Some(RepositoryBlameUser {
                    login: "octocat".to_string(),
                    avatar_url: "https://github.com/octocat.png".to_string(),
                }),
            }),
        },
    });

    assert_eq!((range.starting_line, range.ending_line), (4, 9));
    assert_eq!(range.commit.short_sha, "abcdef1");
    assert_eq!(range.commit.author_login.as_deref(), Some("octocat"));
    assert_eq!(range.commit.verified, None);
}

#[test]
fn code_search_result_uses_the_first_available_text_fragment() {
    let result = code_search_result_from_github(CodeSearchItem {
        name: "main.rs".to_string(),
        path: "src/main.rs".to_string(),
        sha: "abcdef1".to_string(),
        html_url: "https://github.com/octocat/hello-world/blob/main/src/main.rs".to_string(),
        text_matches: Some(vec![CodeSearchTextMatch {
            fragment: Some("\nfn render() {}\n".to_string()),
        }]),
    });

    assert_eq!(result.path, "src/main.rs");
    assert_eq!(result.fragment.as_deref(), Some("fn render() {}"));
}
