use super::*;

#[test]
fn security_routes_are_repository_scoped() {
    assert_eq!(
        dependabot_alert_route("harbor", "desktop", 17),
        "/repos/harbor/desktop/dependabot/alerts/17"
    );
    assert_eq!(
        code_scanning_instances_route("harbor", "desktop", 23),
        "/repos/harbor/desktop/code-scanning/alerts/23/instances"
    );
    assert_eq!(
        secret_scanning_locations_route("harbor", "desktop", 31),
        "/repos/harbor/desktop/secret-scanning/alerts/31/locations"
    );
}

#[test]
fn family_filters_map_to_each_official_state_vocabulary() {
    let filters = GitHubSecurityAlertFilters {
        state: GitHubSecurityAlertStateFilter::Closed,
        severity: GitHubSecurityAlertSeverityFilter::High,
        sort: GitHubSecurityAlertSort::Updated,
        page: 3,
    };
    let dependabot = serde_json::to_value(DependabotListParameters::from_filters(&filters))
        .expect("serialize Dependabot filters");
    let code = serde_json::to_value(CodeScanningListParameters::from_filters(&filters))
        .expect("serialize code scanning filters");
    let secret = serde_json::to_value(SecretScanningListParameters::from_filters(&filters))
        .expect("serialize secret scanning filters");

    assert_eq!(
        dependabot["state"],
        serde_json::json!(["dismissed", "fixed", "auto_dismissed"])
    );
    assert_eq!(dependabot["severity"], serde_json::json!(["high"]));
    assert_eq!(code["state"], "closed");
    assert_eq!(code["severity"], "high");
    assert_eq!(secret["state"], "resolved");
    assert_eq!(secret["hide_secret"], true);
}

#[test]
fn dependabot_detail_keeps_current_risk_metadata() {
    let raw: RawDependabotAlert = serde_json::from_value(serde_json::json!({
        "number": 7,
        "state": "open",
        "dependency": {
            "package": { "ecosystem": "npm", "name": "semver" },
            "manifest_path": "pnpm-lock.yaml",
            "scope": "runtime",
            "relationship": "direct"
        },
        "security_advisory": {
            "ghsa_id": "GHSA-xxxx-yyyy-zzzz",
            "cve_id": "CVE-2026-1234",
            "summary": "Improper input validation",
            "description": "Upgrade the dependency to the patched release.",
            "severity": "high",
            "cvss": { "score": 7.5, "vector_string": "CVSS:3.1/test" },
            "cvss_severities": {
                "cvss_v3": { "score": 7.5, "vector_string": "CVSS:3.1/test" },
                "cvss_v4": { "score": 8.7, "vector_string": "CVSS:4.0/test" }
            },
            "epss": { "percentage": 0.0123, "percentile": "0.843" },
            "cwes": [{ "cwe_id": "CWE-20", "name": "Improper Input Validation" }],
            "references": [{ "url": "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz" }],
            "published_at": "2026-08-01T00:00:00Z",
            "withdrawn_at": null
        },
        "security_vulnerability": {
            "vulnerable_version_range": "< 7.7.0",
            "first_patched_version": { "identifier": "7.7.0" }
        },
        "html_url": "https://github.com/harbor/desktop/security/dependabot/7",
        "created_at": "2026-08-02T00:00:00Z",
        "updated_at": "2026-08-03T00:00:00Z",
        "dismissed_at": null,
        "dismissed_by": null,
        "dismissed_reason": null,
        "dismissed_comment": null,
        "fixed_at": null,
        "auto_dismissed_at": null,
        "assignees": [{ "login": "maintainer", "avatar_url": "https://avatars.example/1" }]
    }))
    .expect("parse Dependabot alert");

    let detail = dependabot_detail(raw).expect("map Dependabot detail");
    let GitHubSecurityAlertDetail::Dependabot {
        cvss_score,
        cvss_vector,
        epss_percentage,
        epss_percentile,
        first_patched_version,
        ..
    } = detail
    else {
        panic!("expected Dependabot detail");
    };
    assert_eq!(cvss_score, Some(8.7));
    assert_eq!(cvss_vector.as_deref(), Some("CVSS:4.0/test"));
    assert_eq!(epss_percentage, Some(0.0123));
    assert_eq!(epss_percentile, Some(0.843));
    assert_eq!(first_patched_version.as_deref(), Some("7.7.0"));
}

#[test]
fn code_scanning_model_accepts_new_dismissal_reasons_without_enum_drift() {
    let raw: RawCodeScanningAlert = serde_json::from_value(serde_json::json!({
        "number": 42,
        "state": "dismissed",
        "created_at": "2026-08-01T00:00:00Z",
        "updated_at": "2026-08-02T00:00:00Z",
        "html_url": "https://github.com/harbor/desktop/security/code-scanning/42",
        "fixed_at": null,
        "dismissed_at": "2026-08-03T00:00:00Z",
        "dismissed_by": { "login": "maintainer", "avatar_url": null },
        "dismissed_reason": "mitigated",
        "dismissed_comment": "A repository guard blocks this path.",
        "rule": {
            "id": "rust/path-injection",
            "name": "rust/path-injection",
            "severity": "error",
            "security_severity_level": "high",
            "description": "Untrusted path reaches a file operation",
            "full_description": "Validate the path before using it.",
            "tags": ["security", "external/cwe/cwe-022"],
            "help": "Review the input boundary.",
            "help_uri": "https://codeql.github.com/"
        },
        "tool": { "name": "CodeQL" },
        "most_recent_instance": {
            "ref": "refs/heads/main",
            "state": "dismissed",
            "commit_sha": "0123456789012345678901234567890123456789",
            "message": { "text": "This path is user controlled." },
            "location": { "path": "src/file.rs", "start_line": 17, "end_line": 18 },
            "classifications": []
        },
        "assignees": []
    }))
    .expect("parse code scanning alert");

    let detail = code_scanning_detail(raw).expect("map code scanning detail");
    let GitHubSecurityAlertDetail::CodeScanning {
        dismissed_reason, ..
    } = detail
    else {
        panic!("expected code scanning detail");
    };
    assert_eq!(dismissed_reason.as_deref(), Some("mitigated"));
}

#[test]
fn secret_scanning_never_serializes_the_secret_literal() {
    let secret_literal = concat!("github", "_pat_", "fixture_value_that_must_not_escape");
    let raw: RawSecretScanningAlert = serde_json::from_value(serde_json::json!({
        "number": 9,
        "state": "open",
        "created_at": "2026-08-01T00:00:00Z",
        "updated_at": "2026-08-02T00:00:00Z",
        "html_url": "https://github.com/harbor/desktop/security/secret-scanning/9",
        "resolution": null,
        "resolution_comment": null,
        "resolved_at": null,
        "resolved_by": null,
        "secret_type": "github_personal_access_token",
        "secret_type_display_name": "GitHub Personal Access Token",
        "secret": secret_literal,
        "validity": "active",
        "publicly_leaked": false,
        "multi_repo": false,
        "assigned_to": null,
        "push_protection_bypassed": false,
        "push_protection_bypassed_at": null,
        "push_protection_bypassed_by": null,
        "metadata": []
    }))
    .expect("parse secret scanning alert");

    let detail = secret_scanning_detail(raw).expect("map secret scanning detail");
    let serialized = serde_json::to_string(&detail).expect("serialize secret scanning detail");
    assert!(!serialized.contains(secret_literal));
    assert!(!serialized.contains("\"secret\""));
}

#[test]
fn secret_locations_keep_commit_and_non_commit_evidence() {
    let commit = secret_scanning_location(RawSecretScanningLocation {
        kind: "commit".to_string(),
        details: serde_json::json!({
            "path": "config/token.txt",
            "start_line": 4,
            "end_line": 4,
            "commit_sha": "0123456789012345678901234567890123456789",
            "commit_url": "https://api.github.com/repos/harbor/desktop/git/commits/0123"
        }),
    });
    let issue = secret_scanning_location(RawSecretScanningLocation {
        kind: "issue_body".to_string(),
        details: serde_json::json!({
            "issue_body_url": "https://api.github.com/repos/harbor/desktop/issues/12"
        }),
    });

    assert_eq!(commit.path.as_deref(), Some("config/token.txt"));
    assert_eq!(commit.start_line, Some(4));
    assert!(commit
        .url
        .as_deref()
        .is_some_and(|url| url.ends_with("/0123")));
    assert_eq!(issue.kind, "issue_body");
    assert!(issue.url.as_deref().is_some_and(|url| url.ends_with("/12")));
}

#[test]
fn closing_requires_a_family_specific_reason() {
    let missing_reason = GitHubSecurityAlertMutation::Dependabot {
        state: GitHubSecurityAlertMutationState::Closed,
        reason: None,
        comment: String::new(),
    };
    let reopened_with_reason = GitHubSecurityAlertMutation::SecretScanning {
        state: GitHubSecurityAlertMutationState::Open,
        reason: Some(GitHubSecretScanningResolution::Revoked),
        comment: String::new(),
    };

    assert!(matches!(
        validate_security_mutation(&missing_reason),
        Err(AppError::Validation(_))
    ));
    assert!(matches!(
        validate_security_mutation(&reopened_with_reason),
        Err(AppError::Validation(_))
    ));
}

#[test]
fn official_mutation_reason_names_are_preserved() {
    assert_eq!(
        dependabot_reason_name(GitHubDependabotDismissReason::TolerableRisk),
        "tolerable_risk"
    );
    assert_eq!(
        code_scanning_reason_name(GitHubCodeScanningDismissReason::WontFix),
        "won't fix"
    );
    assert_eq!(
        secret_scanning_resolution_name(GitHubSecretScanningResolution::FalsePositive),
        "false_positive"
    );
}
