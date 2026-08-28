use super::*;

fn raw_user(login: &str) -> RawGistUser {
    RawGistUser {
        login: login.to_string(),
        avatar_url: Some(format!("https://avatars.githubusercontent.com/{login}")),
    }
}

fn raw_file(filename: &str, content: &str) -> RawGistFile {
    RawGistFile {
        filename: Some(filename.to_string()),
        language: Some("Markdown".to_string()),
        content_type: Some("text/markdown".to_string()),
        raw_url: Some(format!(
            "https://gist.githubusercontent.com/octocat/example/raw/{filename}"
        )),
        size: content.len() as u64,
        truncated: false,
        content: Some(content.to_string()),
    }
}

fn raw_gist(owner: &str) -> RawGist {
    RawGist {
        id: "abc123".to_string(),
        html_url: "https://gist.github.com/octocat/abc123".to_string(),
        description: Some("Useful notes".to_string()),
        public: false,
        owner: Some(raw_user(owner)),
        user: None,
        comments: 2,
        comments_enabled: Some(true),
        created_at: "2026-08-20T12:00:00Z".to_string(),
        updated_at: "2026-08-28T12:00:00Z".to_string(),
        files: BTreeMap::from([
            ("notes.md".to_string(), raw_file("notes.md", "# Notes")),
            ("query.sql".to_string(), raw_file("query.sql", "select 1;")),
        ]),
        fork_of: None,
    }
}

#[test]
fn gist_routes_keep_account_sources_and_selected_identity() {
    assert_eq!(gist_list_route(GitHubGistSource::Mine), "/gists");
    assert_eq!(gist_list_route(GitHubGistSource::Starred), "/gists/starred");
    assert_eq!(gist_list_route(GitHubGistSource::Public), "/gists/public");
    assert_eq!(gist_route("abc123"), "/gists/abc123");
    assert_eq!(
        gist_comment_route("abc123", 42),
        "/gists/abc123/comments/42"
    );
}

#[test]
fn gist_mapping_keeps_owner_files_relationships_and_parent() {
    let mut raw = raw_gist("OctoCat");
    raw.fork_of = Some(Box::new(RawGist {
        id: "parent123".to_string(),
        html_url: "https://gist.github.com/hubot/parent123".to_string(),
        description: None,
        public: true,
        owner: Some(raw_user("hubot")),
        user: None,
        comments: 0,
        comments_enabled: None,
        created_at: "2026-08-01T00:00:00Z".to_string(),
        updated_at: "2026-08-01T00:00:00Z".to_string(),
        files: BTreeMap::new(),
        fork_of: None,
    }));

    let gist = gist_from_raw(raw, "octocat", true);

    assert_eq!(gist.id, "abc123");
    assert_eq!(gist.owner.as_deref(), Some("OctoCat"));
    assert!(gist.viewer_owns);
    assert!(gist.starred);
    assert_eq!(gist.files.len(), 2);
    assert_eq!(gist.files[0].filename, "notes.md");
    assert_eq!(gist.files[0].content.as_deref(), Some("# Notes"));
    assert_eq!(
        gist.fork_of.as_ref().map(|parent| parent.id.as_str()),
        Some("parent123")
    );
}

#[test]
fn gist_update_plan_renames_adds_and_deletes_files() {
    let current = raw_gist("octocat");
    let input = GitHubGistUpdateInput {
        description: Some("Updated".to_string()),
        files: vec![
            GitHubGistFileMutation {
                original_filename: Some("notes.md".to_string()),
                filename: "README.md".to_string(),
                content: Some("# Updated".to_string()),
                deleted: false,
            },
            GitHubGistFileMutation {
                original_filename: Some("query.sql".to_string()),
                filename: "query.sql".to_string(),
                content: None,
                deleted: true,
            },
            GitHubGistFileMutation {
                original_filename: None,
                filename: "script.ts".to_string(),
                content: Some("export {};".to_string()),
                deleted: false,
            },
        ],
    };

    assert_eq!(
        expected_updated_file_names(&current, &input).expect("valid update"),
        BTreeSet::from(["README.md".to_string(), "script.ts".to_string()])
    );
    assert_eq!(
        serde_json::to_value(update_file_request(&input)).expect("serialize update"),
        serde_json::json!({
            "notes.md": {"filename": "README.md", "content": "# Updated"},
            "query.sql": null,
            "script.ts": {"content": "export {};"}
        })
    );
}

#[test]
fn gist_update_plan_rejects_unknown_duplicate_and_last_file_deletions() {
    let current = raw_gist("octocat");
    let unknown = GitHubGistUpdateInput {
        description: None,
        files: vec![GitHubGistFileMutation {
            original_filename: Some("missing.md".to_string()),
            filename: "missing.md".to_string(),
            content: Some(String::new()),
            deleted: false,
        }],
    };
    assert!(expected_updated_file_names(&current, &unknown).is_err());

    let duplicate = GitHubGistUpdateInput {
        description: None,
        files: vec![GitHubGistFileMutation {
            original_filename: Some("notes.md".to_string()),
            filename: "query.sql".to_string(),
            content: Some(String::new()),
            deleted: false,
        }],
    };
    assert!(expected_updated_file_names(&current, &duplicate).is_err());

    let one_file = RawGist {
        files: BTreeMap::from([("notes.md".to_string(), raw_file("notes.md", "notes"))]),
        ..raw_gist("octocat")
    };
    let deletion = GitHubGistUpdateInput {
        description: None,
        files: vec![GitHubGistFileMutation {
            original_filename: Some("notes.md".to_string()),
            filename: "notes.md".to_string(),
            content: None,
            deleted: true,
        }],
    };
    assert!(expected_updated_file_names(&one_file, &deletion).is_err());
}

#[test]
fn gist_create_verification_requires_personal_owner_visibility_and_files() {
    let input = GitHubGistCreateInput {
        description: Some("Useful notes".to_string()),
        public: false,
        files: vec![
            GitHubGistFileInput {
                filename: "notes.md".to_string(),
                content: "# Notes".to_string(),
            },
            GitHubGistFileInput {
                filename: "query.sql".to_string(),
                content: "select 1;".to_string(),
            },
        ],
    };
    let gist = gist_from_raw(raw_gist("octocat"), "octocat", false);
    assert!(verify_created_gist(&gist, &input, "octocat").is_ok());

    let other = gist_from_raw(raw_gist("hubot"), "octocat", false);
    assert!(verify_created_gist(&other, &input, "octocat").is_err());
}

#[test]
fn gist_comment_capabilities_and_scope_follow_authenticated_ownership() {
    let raw = RawGistComment {
        id: 42,
        url: "https://api.github.com/gists/abc123/comments/42".to_string(),
        body: "Looks useful".to_string(),
        user: Some(raw_user("hubot")),
        author_association: Some("NONE".to_string()),
        created_at: "2026-08-28T12:00:00Z".to_string(),
        updated_at: "2026-08-28T12:00:00Z".to_string(),
    };
    assert!(ensure_comment_scope(&raw, "abc123").is_ok());
    assert!(ensure_comment_scope(&raw, "different").is_err());

    let viewer_comment = comment_from_raw(raw.clone(), "hubot", false);
    assert!(viewer_comment.viewer_can_update);
    assert!(viewer_comment.viewer_can_delete);

    let owner_comment = comment_from_raw(raw, "octocat", true);
    assert!(!owner_comment.viewer_can_update);
    assert!(owner_comment.viewer_can_delete);
}
