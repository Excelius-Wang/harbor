use std::path::Path;

use git2::{Repository, Signature};
use tempfile::TempDir;

use super::*;
use crate::github::tests::FakeGitHubClient;

#[async_trait]
impl GitHubWikiClient for FakeGitHubClient {
    async fn repository_wiki_access(
        &self,
        token: &str,
        owner: &str,
        repository: &str,
    ) -> Result<GitHubWikiAccess, AppError> {
        assert_eq!(token, "github-user-access-token");
        assert_eq!((owner, repository), ("octocat", "hello-world"));
        Ok(GitHubWikiAccess {
            repository_id: 1,
            owner: owner.to_string(),
            repository: repository.to_string(),
            enabled: true,
            can_edit: true,
            archived: false,
        })
    }
}

fn identity() -> GitHubIdentity {
    GitHubIdentity {
        login: "octocat".to_string(),
        avatar_url: None,
    }
}

fn signature() -> Signature<'static> {
    Signature::now("octocat", "octocat@users.noreply.github.com").expect("signature")
}

fn seed_remote(root: &TempDir) -> (Repository, String) {
    seed_remote_on_branch(root, "master")
}

fn seed_remote_on_branch(root: &TempDir, branch: &str) -> (Repository, String) {
    let remote_path = root.path().join("remote.git");
    let remote = Repository::init_bare(&remote_path).expect("bare remote");
    let home = remote.blob(b"# Home\n\nWelcome.").expect("home blob");
    let sidebar = remote.blob(b"* [Home](Home)").expect("sidebar blob");
    let mut builder = remote.treebuilder(None).expect("tree builder");
    builder.insert("Home.md", home, 0o100644).expect("home");
    builder
        .insert("_Sidebar.md", sidebar, 0o100644)
        .expect("sidebar");
    let tree_id = builder.write().expect("tree");
    drop(builder);
    let tree = remote.find_tree(tree_id).expect("find tree");
    let signature = signature();
    remote
        .commit(
            Some(&format!("refs/heads/{branch}")),
            &signature,
            &signature,
            "Initial Wiki",
            &tree,
            &[],
        )
        .expect("initial commit");
    remote
        .set_head(&format!("refs/heads/{branch}"))
        .expect("remote HEAD");
    drop(tree);
    let url = Url::from_file_path(&remote_path)
        .expect("file URL")
        .to_string();
    (remote, url)
}

fn access() -> GitHubWikiAccess {
    GitHubWikiAccess {
        repository_id: 1,
        owner: "octocat".to_string(),
        repository: "hello-world".to_string(),
        enabled: true,
        can_edit: true,
        archived: false,
    }
}

#[test]
fn wiki_titles_become_safe_markdown_paths() {
    assert_eq!(
        page_path_from_title("  Release   process  ", "md").expect("path"),
        "Release   process.md"
    );
    assert_eq!(
        page_path_from_title("部署手册", "md").expect("unicode path"),
        "部署手册.md"
    );
    assert!(page_path_from_title("../secrets", "md").is_err());
    assert!(page_path_from_title("   ", "md").is_err());
}

#[test]
fn wiki_page_summary_preserves_special_pages_and_markup() {
    assert_eq!(
        page_summary("Home.md", "a".repeat(40), 12).expect("home"),
        GitHubWikiPageSummary {
            path: "Home.md".to_string(),
            title: "Home".to_string(),
            kind: GitHubWikiPageKind::Home,
            markdown: true,
            blob_sha: "a".repeat(40),
            byte_size: 12,
        }
    );
    assert_eq!(
        page_summary("_Sidebar.textile", "a".repeat(40), 12)
            .expect("sidebar")
            .kind,
        GitHubWikiPageKind::Sidebar
    );
    assert!(
        !page_summary("Architecture.adoc", "a".repeat(40), 12)
            .expect("asciidoc")
            .markdown
    );
    assert!(page_summary("diagram.png", "a".repeat(40), 12).is_none());
}

#[test]
fn credentials_are_restricted_to_the_exact_canonical_wiki_url() {
    let expected = Url::parse("https://github.com/octocat/hello-world.wiki.git").expect("URL");
    assert!(is_exact_wiki_credential_url(expected.as_str(), &expected));
    assert!(!is_exact_wiki_credential_url(
        "https://github.com.evil.example/octocat/hello-world.wiki.git",
        &expected
    ));
    assert!(!is_exact_wiki_credential_url(
        "https://token@github.com/octocat/hello-world.wiki.git",
        &expected
    ));
    assert!(!is_exact_wiki_credential_url(
        "https://github.com:444/octocat/hello-world.wiki.git",
        &expected
    ));
    assert!(!is_exact_wiki_credential_url(
        "https://github.com/octocat/other.wiki.git",
        &expected
    ));
}

#[test]
fn transport_discovers_a_nonstandard_default_branch() {
    let root = TempDir::new().expect("temp root");
    let (_remote, remote_url) = seed_remote_on_branch(&root, "wiki-main");
    let synced =
        sync_wiki_repository(&root.path().join("cache.git"), &remote_url, "").expect("Wiki sync");
    assert_eq!(synced.default_branch, "wiki-main");
    assert_eq!(
        remote_head(&synced.repo, &synced.default_branch).expect("head"),
        synced
            .repo
            .find_reference("refs/remotes/origin/wiki-main")
            .expect("tracking ref")
            .target()
            .expect("tracking target")
    );
}

#[test]
fn authentication_failures_are_not_misreported_as_uninitialized() {
    let root = TempDir::new().expect("temp root");
    let cache_path = root.path().join("cache.git");
    let authentication = git2::Error::from_str("request failed with status code: 401");
    let missing = git2::Error::from_str("remote: Repository not found");
    assert!(!is_uninitialized_wiki_error(&authentication));
    assert!(is_uninitialized_wiki_error(&missing));
    assert!(is_uninitialized_after_metadata(
        &authentication,
        &cache_path
    ));
    fs::create_dir_all(&cache_path).expect("cache directory");
    fs::write(cache_path.join(CACHE_BRANCH_MARKER), "master").expect("branch marker");
    assert!(!is_uninitialized_after_metadata(
        &authentication,
        &cache_path
    ));
}

#[test]
fn cache_config_never_persists_an_access_token() {
    let root = TempDir::new().expect("temp root");
    let cache = open_or_initialize_cache(
        &root.path().join("cache.git"),
        "https://github.com/octocat/hello-world.wiki.git",
    )
    .expect("cache");
    let config = cache.config().expect("config");
    let origin = config.get_string("remote.origin.url").expect("origin URL");
    assert_eq!(origin, "https://github.com/octocat/hello-world.wiki.git");
    assert!(!origin.contains("secret-oauth-token"));
}

#[test]
fn local_transport_fetches_reads_commits_and_pushes_pages() {
    let root = TempDir::new().expect("temp root");
    let (remote, remote_url) = seed_remote(&root);
    let cache_path = root.path().join("cache.git");
    let cache = sync_wiki_repository(&cache_path, &remote_url, "").expect("sync Wiki");
    let initial =
        overview_from_repository(&cache.repo, &cache.default_branch, access(), false, Some(1))
            .expect("overview");
    assert_eq!(initial.pages.len(), 1);
    assert_eq!(initial.pages[0].path, "Home.md");
    assert_eq!(
        initial.sidebar.expect("sidebar").kind,
        GitHubWikiPageKind::Sidebar
    );

    let expected_head = initial.head_sha.expect("head");
    let (path, _) = commit_page_mutation(
        &cache.repo,
        &cache.default_branch,
        &GitHubWikiPageMutationInput {
            original_path: None,
            title: "Release process".to_string(),
            content: "# Release process\n\nShip it.".to_string(),
            expected_head,
            expected_blob_sha: None,
            message: None,
        },
        &identity(),
    )
    .expect("commit page");
    assert_eq!(path, "Release process.md");
    push_wiki_head(&cache.repo, &remote_url, &cache.default_branch, "").expect("push page");
    let refreshed = sync_wiki_repository(&cache_path, &remote_url, "").expect("refresh Wiki");

    let remote_head = remote
        .find_reference("refs/heads/master")
        .expect("remote head")
        .target()
        .expect("remote target");
    let remote_tree = remote
        .find_commit(remote_head)
        .expect("remote commit")
        .tree()
        .expect("remote tree");
    assert!(remote_tree.get_name("Release process.md").is_some());
    let page = read_page_at_head(
        &refreshed.repo,
        &remote_head.to_string(),
        "Release process.md",
    )
    .expect("read page");
    assert_eq!(page.title, "Release process");
    assert_eq!(page.content, "# Release process\n\nShip it.");
}

#[test]
fn stale_wiki_head_preserves_the_draft_as_a_conflict() {
    let root = TempDir::new().expect("temp root");
    let (remote, remote_url) = seed_remote(&root);
    let cache_path = root.path().join("cache.git");
    let cache = sync_wiki_repository(&cache_path, &remote_url, "").expect("sync Wiki");
    let stale_head = remote_head(&cache.repo, &cache.default_branch)
        .expect("initial head")
        .to_string();
    let stale_blob = read_page_at_head(&cache.repo, &stale_head, "Home.md")
        .expect("home")
        .blob_sha;

    let parent_oid = remote
        .find_reference("refs/heads/master")
        .expect("remote head")
        .target()
        .expect("remote target");
    let parent = remote.find_commit(parent_oid).expect("parent");
    let parent_tree = parent.tree().expect("parent tree");
    let blob = remote.blob(b"Remote update").expect("blob");
    let mut builder = remote.treebuilder(Some(&parent_tree)).expect("builder");
    builder.insert("Remote.md", blob, 0o100644).expect("insert");
    let tree_id = builder.write().expect("tree");
    let tree = remote.find_tree(tree_id).expect("tree");
    let signature = signature();
    remote
        .commit(
            Some("refs/heads/master"),
            &signature,
            &signature,
            "Remote update",
            &tree,
            &[&parent],
        )
        .expect("remote commit");
    let refreshed = sync_wiki_repository(&cache_path, &remote_url, "").expect("refresh Wiki");

    let error = commit_page_mutation(
        &refreshed.repo,
        &refreshed.default_branch,
        &GitHubWikiPageMutationInput {
            original_path: Some("Home.md".to_string()),
            title: "Home".to_string(),
            content: "Unsaved local draft".to_string(),
            expected_head: stale_head,
            expected_blob_sha: Some(stale_blob),
            message: None,
        },
        &identity(),
    )
    .expect_err("stale update must fail");
    assert!(matches!(error, AppError::GitHubWikiConflict(_)));
}

#[test]
fn deleting_a_page_pushes_an_authoritative_tree() {
    let root = TempDir::new().expect("temp root");
    let (remote, remote_url) = seed_remote(&root);
    let cache_path = root.path().join("cache.git");
    let cache = sync_wiki_repository(&cache_path, &remote_url, "").expect("sync Wiki");
    let expected_head = remote_head(&cache.repo, &cache.default_branch)
        .expect("head")
        .to_string();
    let expected_blob = read_page_at_head(&cache.repo, &expected_head, "_Sidebar.md")
        .expect("sidebar")
        .blob_sha;
    commit_page_deletion(
        &cache.repo,
        &cache.default_branch,
        "_Sidebar.md",
        &expected_head,
        &expected_blob,
        &identity(),
    )
    .expect("delete page");
    push_wiki_head(&cache.repo, &remote_url, &cache.default_branch, "").expect("push deletion");

    let head = remote
        .find_reference("refs/heads/master")
        .expect("remote head")
        .target()
        .expect("target");
    let tree = remote
        .find_commit(head)
        .expect("commit")
        .tree()
        .expect("tree");
    assert!(tree.get_name("_Sidebar.md").is_none());
    assert!(tree.get_name("Home.md").is_some());
}

#[test]
fn history_comparison_and_revert_keep_git_history_linear() {
    let root = TempDir::new().expect("temp root");
    let (_remote, remote_url) = seed_remote(&root);
    let cache_path = root.path().join("cache.git");
    let initial = sync_wiki_repository(&cache_path, &remote_url, "").expect("initial sync");
    let initial_head = remote_head(&initial.repo, &initial.default_branch)
        .expect("initial head")
        .to_string();
    let initial_page = read_page_at_head(&initial.repo, &initial_head, "Home.md").expect("home");
    let (_, update_commit) = commit_page_mutation(
        &initial.repo,
        &initial.default_branch,
        &GitHubWikiPageMutationInput {
            original_path: Some("Home.md".to_string()),
            title: "Home".to_string(),
            content: "# Home\n\nUpdated.".to_string(),
            expected_head: initial_head.clone(),
            expected_blob_sha: Some(initial_page.blob_sha),
            message: Some("Clarify Home".to_string()),
        },
        &identity(),
    )
    .expect("update commit");
    push_wiki_head(&initial.repo, &remote_url, &initial.default_branch, "").expect("push update");
    let updated = sync_wiki_repository(&cache_path, &remote_url, "").expect("updated sync");
    assert_eq!(
        remote_head(&updated.repo, &updated.default_branch).expect("updated head"),
        update_commit
    );

    let history =
        history_at_head(&updated.repo, &update_commit.to_string(), "Home.md", 1).expect("history");
    assert_eq!(history.revisions.len(), 2);
    assert_eq!(history.revisions[0].message, "Clarify Home");
    let initial_revision = history
        .revisions
        .iter()
        .find(|revision| revision.message == "Initial Wiki")
        .expect("initial revision");
    let revision =
        revision_at_commit(&updated.repo, &initial_revision.sha, "Home.md").expect("revision");
    assert_eq!(revision.content.as_deref(), Some("# Home\n\nWelcome."));
    let comparison = compare_revisions(
        &updated.repo,
        "Home.md",
        &initial_revision.sha,
        &update_commit.to_string(),
    )
    .expect("comparison");
    assert!(comparison.patch.contains("-Welcome."));
    assert!(comparison.patch.contains("+Updated."));

    let updated_page = read_page_at_head(&updated.repo, &update_commit.to_string(), "Home.md")
        .expect("updated page");
    let revert_commit = commit_page_revert(
        &updated.repo,
        &updated.default_branch,
        &GitHubWikiRevertInput {
            path: "Home.md".to_string(),
            expected_head: update_commit.to_string(),
            expected_blob_sha: updated_page.blob_sha,
            source_commit_sha: initial_revision.sha.clone(),
            message: None,
        },
        &identity(),
    )
    .expect("revert commit");
    push_wiki_head(&updated.repo, &remote_url, &updated.default_branch, "").expect("push revert");
    let reverted = sync_wiki_repository(&cache_path, &remote_url, "").expect("reverted sync");
    let reverted_page = read_page_at_head(&reverted.repo, &revert_commit.to_string(), "Home.md")
        .expect("reverted page");
    assert_eq!(reverted_page.content, "# Home\n\nWelcome.");
    assert_eq!(
        reverted
            .repo
            .find_commit(revert_commit)
            .expect("revert commit")
            .parent_id(0)
            .expect("revert parent"),
        update_commit
    );
}

#[test]
fn cache_recovers_from_an_origin_for_another_repository() {
    let root = TempDir::new().expect("temp root");
    let (_remote, remote_url) = seed_remote(&root);
    let cache_path = root.path().join("cache.git");
    sync_wiki_repository(&cache_path, &remote_url, "").expect("sync Wiki");
    let cache = open_or_initialize_cache(&cache_path, "https://github.com/other/repo.wiki.git")
        .expect("reset cache");
    assert_eq!(
        cache
            .find_remote("origin")
            .expect("origin")
            .url()
            .expect("origin URL"),
        "https://github.com/other/repo.wiki.git"
    );
}

#[test]
fn mutation_validation_bounds_page_content_and_revision() {
    let oversized = "x".repeat(MAX_WIKI_PAGE_BYTES + 1);
    let error = validate_mutation_input(&GitHubWikiPageMutationInput {
        original_path: None,
        title: "Page".to_string(),
        content: oversized,
        expected_head: "a".repeat(40),
        expected_blob_sha: None,
        message: None,
    })
    .expect_err("oversized content");
    assert!(matches!(error, AppError::Validation(_)));
    assert!(validate_head_sha("not-a-sha").is_err());
}

#[test]
fn cache_paths_stay_under_the_tauri_cache_root() {
    let root = Path::new("/tmp/harbor-cache/github-wikis");
    assert_eq!(wiki_cache_path(root, 42), root.join("42.git"));
}
