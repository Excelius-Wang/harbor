use async_trait::async_trait;

use super::*;

const SHA: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEXT_SHA: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

#[async_trait]
impl GitHubCodeMutationClient for super::super::super::tests::FakeGitHubClient {
    async fn commit_repository_file(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        branch: &str,
        message: &str,
        mutation: &GitHubRepositoryFileMutation,
    ) -> Result<GitHubRepositoryFileCommit, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, branch),
            ("octocat", "hello-world", "main")
        );
        assert_eq!(message, "Update src/lib.rs");
        assert_eq!(
            mutation,
            &GitHubRepositoryFileMutation::Update {
                path: "src/lib.rs".to_string(),
                expected_sha: SHA.to_string(),
                content: "pub fn harbor() {}\n".to_string(),
            }
        );
        Ok(GitHubRepositoryFileCommit {
            branch: branch.to_string(),
            commit_sha: NEXT_SHA.to_string(),
            short_sha: "bbbbbbb".to_string(),
            message: message.to_string(),
            url: format!("https://github.com/{owner}/{repository}/commit/{NEXT_SHA}"),
            file: Some(GitHubContentEntry {
                name: "lib.rs".to_string(),
                path: "src/lib.rs".to_string(),
                sha: NEXT_SHA.to_string(),
                kind: "file".to_string(),
                size: 20,
                url: Some(format!(
                    "https://github.com/{owner}/{repository}/blob/{branch}/src/lib.rs"
                )),
            }),
            previous_path: None,
        })
    }

    async fn create_repository_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        source_branch: &str,
        expected_source_sha: &str,
        branch: &str,
    ) -> Result<GitHubBranch, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (
                owner,
                repository,
                source_branch,
                expected_source_sha,
                branch
            ),
            ("octocat", "hello-world", "main", SHA, "feature/code-write")
        );
        Ok(GitHubBranch {
            name: branch.to_string(),
            sha: SHA.to_string(),
            protected: false,
        })
    }

    async fn delete_repository_branch(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
        branch: &str,
        expected_sha: &str,
    ) -> Result<(), AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!(
            (owner, repository, branch, expected_sha),
            ("octocat", "hello-world", "feature/code-write", SHA)
        );
        Ok(())
    }
}

#[test]
fn branch_names_follow_git_reference_rules() {
    assert_eq!(
        normalize_branch_name(" feature/code-write ").expect("valid branch"),
        "feature/code-write"
    );
    for invalid in [
        "",
        "HEAD",
        "-feature",
        ".hidden",
        "feature//write",
        "feature..write",
        "feature@{write",
        "feature.lock",
        "feature.lock/write",
        "feature write",
        "feature?write",
        "@",
    ] {
        assert!(
            normalize_branch_name(invalid).is_err(),
            "accepted {invalid:?}"
        );
    }
    assert_eq!(
        encode_branch_path("feature/issue#18"),
        "feature%2Fissue%2318"
    );
}

#[test]
fn file_mutations_preserve_content_but_normalize_guards_and_paths() {
    let mutation = validate_file_mutation(GitHubRepositoryFileMutation::Rename {
        path: "/src/old.rs/".to_string(),
        expected_sha: SHA.to_ascii_uppercase(),
        new_path: "/src/new.rs/".to_string(),
        content: "fn main() {\n    println!(\"harbor\");\n}\n".to_string(),
    })
    .expect("valid rename");

    assert_eq!(
        mutation,
        GitHubRepositoryFileMutation::Rename {
            path: "src/old.rs".to_string(),
            expected_sha: SHA.to_string(),
            new_path: "src/new.rs".to_string(),
            content: "fn main() {\n    println!(\"harbor\");\n}\n".to_string(),
        }
    );
}

#[test]
fn rename_tree_payload_is_one_atomic_write_and_delete() {
    let payload = CreateTreeRequest {
        base_tree: SHA,
        tree: vec![
            TreeMutationEntry::Write {
                path: "src/new.rs".to_string(),
                mode: "100755".to_string(),
                kind: "blob",
                content: "fn main() {}\n".to_string(),
            },
            TreeMutationEntry::Delete {
                path: "src/old.rs".to_string(),
                mode: "100755".to_string(),
                kind: "blob",
                sha: None,
            },
        ],
    };
    let value = serde_json::to_value(payload).expect("serialize tree payload");

    assert_eq!(value["base_tree"], SHA);
    assert_eq!(value["tree"][0]["path"], "src/new.rs");
    assert_eq!(value["tree"][0]["mode"], "100755");
    assert_eq!(value["tree"][0]["content"], "fn main() {}\n");
    assert_eq!(value["tree"][1]["path"], "src/old.rs");
    assert!(value["tree"][1]["sha"].is_null());
}

#[test]
fn file_mutations_reject_stale_or_unsafe_inputs() {
    assert!(
        validate_file_mutation(GitHubRepositoryFileMutation::Update {
            path: "../secret".to_string(),
            expected_sha: "short".to_string(),
            content: String::new(),
        })
        .is_err()
    );
    assert!(
        validate_file_mutation(GitHubRepositoryFileMutation::Rename {
            path: "README.md".to_string(),
            expected_sha: SHA.to_string(),
            new_path: "README.md".to_string(),
            content: String::new(),
        })
        .is_err()
    );
    assert!(normalize_commit_message("   ").is_err());
}
