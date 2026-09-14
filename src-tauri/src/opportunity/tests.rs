use super::*;
use serde_json::json;
fn config() -> Config {
    Config {
        repositories: vec!["acme/widget".into()],
        endpoint: "https://model.example/v1".into(),
        model: "test".into(),
        ..Default::default()
    }
}
fn issue(number: u64, created: &str, updated: &str) -> serde_json::Value {
    json!({"number":number,"title":"Focus lost","created_at":created,"updated_at":updated,"state":"open","labels":[],"assignees":[],"locked":false})
}
const BASE: &str = "2026-09-13T10:00:00Z";
const NEXT: &str = "2026-09-13T11:00:00Z";
#[test]
fn validates_repository_names_and_model_destinations() {
    let mut c = config();
    c.repositories = vec!["ACME/Widget".into(), "acme/widget".into()];
    c.validate().unwrap();
    assert_eq!(c.repositories.len(), 1);
    c.endpoint = "https://user:secret@example.com/v1".into();
    assert!(c.validate().is_err());
    c = config();
    c.repositories = vec!["../repo".into()];
    assert!(c.validate().is_err());
    c = config();
    c.interval_seconds = 0;
    assert!(c.validate().is_err());
}
#[test]
fn baseline_excludes_history_and_prs_and_deduplicates_updates() {
    let mut s = Saved {
        config: config(),
        ..Default::default()
    };
    let old = issue(1, "2026-09-01T00:00:00Z", NEXT);
    let new = issue(2, NEXT, NEXT);
    let mut pr = issue(3, NEXT, NEXT);
    pr["pull_request"] = json!({});
    observe(&mut s, "acme/widget", vec![old, new.clone(), pr], BASE).unwrap();
    assert_eq!(s.items.len(), 1);
    s.items.get_mut("acme/widget#2").unwrap().pending = false;
    observe(&mut s, "acme/widget", vec![new], BASE).unwrap();
    assert!(!s.items["acme/widget#2"].pending);
}
#[test]
fn closure_removes_previous_analysis_and_assignments_skip_model() {
    let mut s = Saved {
        config: config(),
        ..Default::default()
    };
    observe(&mut s, "acme/widget", vec![issue(1, BASE, BASE)], BASE).unwrap();
    s.items.get_mut("acme/widget#1").unwrap().analysis = Some(Analysis {
        decision: "recommend".into(),
        ..Default::default()
    });
    let mut closed = issue(1, BASE, NEXT);
    closed["state"] = json!("closed");
    observe(&mut s, "acme/widget", vec![closed], BASE).unwrap();
    assert!(s.items["acme/widget#1"].analysis.is_none());
    assert!(!s.items["acme/widget#1"].pending);
    let mut assigned = issue(2, BASE, NEXT);
    assigned["assignees"] = json!([{"login":"someone"}]);
    assert!(!filter(&assigned, &config()));
}
#[test]
fn sqlite_reopens_with_pending_work_and_cursor_without_secrets() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("monitor.sqlite");
    let mut s = Saved {
        config: config(),
        ..Default::default()
    };
    observe(&mut s, "acme/widget", vec![issue(1, BASE, NEXT)], BASE).unwrap();
    s.cursors.insert(
        "acme/widget".into(),
        Cursor {
            baseline: BASE.into(),
            since: NEXT.into(),
        },
    );
    storage::save(&path, &s).unwrap();
    let restored = storage::load(&path).unwrap();
    assert!(restored.items["acme/widget#1"].pending);
    assert_eq!(restored.cursors["acme/widget"].since, NEXT);
    let serialized = serde_json::to_string(&restored).unwrap();
    assert!(!serialized.contains("apiKey"));
}
#[tokio::test]
async fn pause_cancels_in_flight_work_and_survives_restart() {
    let dir = tempfile::tempdir().unwrap();
    let monitor = Monitor::new(dir.path().join("monitor.sqlite"));
    monitor.initialize().await.unwrap();
    let cancel = {
        let mut s = monitor.inner.lock().unwrap();
        s.saved.config = config();
        s.saved.has_api_key = true;
        s.saved.enabled = true;
        s.busy = true;
        s.cancel.clone()
    };
    monitor.enabled(false).await.unwrap();
    assert!(cancel.is_cancelled());
    let reloaded = Monitor::new(monitor.path.clone());
    reloaded.initialize().await.unwrap();
    assert!(!reloaded.snapshot().unwrap().enabled);
}
#[tokio::test]
async fn configuration_cannot_change_during_a_check() {
    let dir = tempfile::tempdir().unwrap();
    let monitor = Monitor::new(dir.path().join("monitor.sqlite"));
    monitor.initialize().await.unwrap();
    monitor.inner.lock().unwrap().busy = true;
    assert!(matches!(monitor.save_config(config(),None).await,Err(code) if code=="busy"));
}
#[test]
fn malformed_model_decisions_are_rejected() {
    let a = Analysis {
        decision: "assigned".into(),
        summary: "Claimed".into(),
        ..Default::default()
    };
    assert!(a.validate().is_err());
}
#[tokio::test]
async fn snapshot_never_returns_raw_issue_bodies() {
    let dir = tempfile::tempdir().unwrap();
    let m = Monitor::new(dir.path().join("monitor.sqlite"));
    m.initialize().await.unwrap();
    {
        let mut s = m.inner.lock().unwrap();
        s.saved.config = config();
        observe(
            &mut s.saved,
            "acme/widget",
            vec![issue(1, BASE, NEXT)],
            BASE,
        )
        .unwrap();
        s.saved.items.get_mut("acme/widget#1").unwrap().analysis = Some(Analysis {
            decision: "recommend".into(),
            ..Default::default()
        });
    }
    assert!(m.snapshot().unwrap().items[0].issue.is_null());
}

#[test]
fn assignment_change_in_the_same_second_invalidates_recommendation() {
    let mut s = Saved {
        config: config(),
        ..Default::default()
    };
    let original = issue(1, BASE, NEXT);
    observe(&mut s, "acme/widget", vec![original.clone()], BASE).unwrap();
    s.items.get_mut("acme/widget#1").unwrap().analysis = Some(Analysis {
        decision: "recommend".into(),
        ..Default::default()
    });
    let mut assigned = original;
    assigned["assignees"] = json!([{"login":"maintainer"}]);
    observe(&mut s, "acme/widget", vec![assigned], BASE).unwrap();
    assert!(s.items["acme/widget#1"].analysis.is_none());
    assert!(!s.items["acme/widget#1"].pending);
}

#[tokio::test]
async fn snapshots_hide_another_accounts_recommendations_without_running_a_cycle() {
    let dir = tempfile::tempdir().unwrap();
    let monitor = Monitor::new(dir.path().join("monitor.sqlite"));
    monitor.initialize().await.unwrap();
    {
        let mut state = monitor.inner.lock().unwrap();
        state.saved.owner = Some("alice".into());
        state.saved.config = config();
        observe(
            &mut state.saved,
            "acme/widget",
            vec![issue(1, BASE, NEXT)],
            BASE,
        )
        .unwrap();
        state.saved.items.get_mut("acme/widget#1").unwrap().analysis = Some(Analysis {
            decision: "recommend".into(),
            ..Default::default()
        });
        state.saved.last_checked_at = Some(NEXT.into());
    }
    assert_eq!(
        scope_snapshot(monitor.snapshot().unwrap(), Some("alice"))
            .items
            .len(),
        1
    );
    for owner in [None, Some("bob")] {
        let snapshot = scope_snapshot(monitor.snapshot().unwrap(), owner);
        assert!(snapshot.items.is_empty());
        assert_eq!(snapshot.pending_count, 0);
        assert!(snapshot.last_checked_at.is_none());
    }
    assert_eq!(
        scope_snapshot(monitor.snapshot().unwrap(), Some("alice"))
            .items
            .len(),
        1
    );
}

#[test]
fn retention_bounds_records_and_compacts_payloads_without_breaking_deduplication() {
    let mut saved = Saved {
        config: config(),
        ..Default::default()
    };
    let original = issue(1, BASE, NEXT);
    observe(&mut saved, "acme/widget", vec![original.clone()], BASE).unwrap();
    saved.items.get_mut("acme/widget#1").unwrap().pending = false;
    let now = chrono::DateTime::parse_from_rfc3339(NEXT).unwrap().to_utc();
    prune(&mut saved, now);
    assert!(saved.items["acme/widget#1"].issue.is_null());
    observe(&mut saved, "acme/widget", vec![original], BASE).unwrap();
    assert!(!saved.items["acme/widget#1"].pending);
    let template = saved.items["acme/widget#1"].clone();
    for number in 2..=MAX_RECORDS + 2 {
        let mut item = template.clone();
        item.id = format!("acme/widget#{number}");
        item.number = number as u64;
        saved.items.insert(item.id.clone(), item);
    }
    prune(&mut saved, now);
    assert_eq!(saved.items.len(), MAX_RECORDS);
    prune(&mut saved, now + chrono::Duration::days(91));
    assert!(saved.items.is_empty());
}

#[test]
fn retention_removes_unconfigured_repositories_and_their_cursors() {
    let mut saved = Saved {
        config: config(),
        ..Default::default()
    };
    observe(&mut saved, "acme/widget", vec![issue(1, BASE, NEXT)], BASE).unwrap();
    saved.cursors.insert(
        "acme/widget".into(),
        Cursor {
            baseline: BASE.into(),
            since: NEXT.into(),
        },
    );
    saved.config.repositories = vec!["acme/other".into()];
    prune(
        &mut saved,
        chrono::DateTime::parse_from_rfc3339(NEXT).unwrap().to_utc(),
    );
    assert!(saved.items.is_empty());
    assert!(saved.cursors.is_empty());
}

fn recommended_state() -> Saved {
    let mut saved = Saved {
        config: config(),
        ..Default::default()
    };
    observe(&mut saved, "acme/widget", vec![issue(1, BASE, BASE)], BASE).unwrap();
    let item = saved.items.get_mut("acme/widget#1").unwrap();
    item.pending = false;
    item.checked_at = Some(BASE.into());
    item.analysis = Some(Analysis {
        decision: "recommend".into(),
        summary: "Original brief".into(),
        claim_draft: "Can I investigate?".into(),
        ..Default::default()
    });
    saved
}

#[test]
fn open_update_retains_brief_until_successful_reanalysis() {
    let mut saved = recommended_state();
    let mut updated = issue(1, BASE, NEXT);
    updated["title"] = json!("Updated title");
    observe(&mut saved, "acme/widget", vec![updated.clone()], BASE).unwrap();
    let item = &saved.items["acme/widget#1"];
    assert!(item.pending);
    assert_eq!(item.title, "Updated title");
    assert_eq!(item.analysis.as_ref().unwrap().summary, "Original brief");
    assert_eq!(item.checked_at.as_deref(), Some(BASE));
    let item = saved.items.get_mut("acme/widget#1").unwrap();
    assert_eq!(
        apply_analysis_result(item, Err("network".into()), NEXT.into()),
        Err("network".into())
    );
    assert!(item.pending);
    assert_eq!(item.checked_at.as_deref(), Some(BASE));
    assert_eq!(item.analysis.as_ref().unwrap().summary, "Original brief");
    assert_eq!(item.error.as_deref(), Some("network"));
    observe(&mut saved, "acme/widget", vec![updated], BASE).unwrap();
    let item = saved.items.get_mut("acme/widget#1").unwrap();
    apply_analysis_result(
        item,
        Ok(Some(Analysis {
            decision: "clarify".into(),
            summary: "New brief".into(),
            ..Default::default()
        })),
        NEXT.into(),
    )
    .unwrap();
    assert!(!item.pending);
    assert!(item.error.is_none());
    assert_eq!(item.checked_at.as_deref(), Some(NEXT));
    assert_eq!(item.analysis.as_ref().unwrap().summary, "New brief");
}

#[test]
fn failed_reanalysis_keeps_last_successful_check_time() {
    let mut saved = recommended_state();
    let item = saved.items.get_mut("acme/widget#1").unwrap();
    item.pending = true;
    apply_analysis_result(item, Err("modelResponse".into()), NEXT.into()).unwrap_err();
    assert_eq!(item.checked_at.as_deref(), Some(BASE));
    assert!(item.pending);
}

#[test]
fn interval_change_preserves_completed_and_pending_analysis() {
    let mut saved = recommended_state();
    observe(&mut saved, "acme/widget", vec![issue(2, BASE, BASE)], BASE).unwrap();
    let before = serde_json::to_value(&saved.items).unwrap();
    let mut config = saved.config.clone();
    config.interval_seconds = 600;
    apply_config(&mut saved, config, 1000);
    assert_eq!(serde_json::to_value(&saved.items).unwrap(), before);
    assert_eq!(saved.next_check_at, 1600);
}

#[test]
fn analysis_setting_changes_still_requeue_candidates() {
    for change in 0..6 {
        let mut saved = recommended_state();
        let mut config = saved.config.clone();
        match change {
            0 => config.preferences = "Rust".into(),
            1 => config.endpoint = "https://other.example/v1".into(),
            2 => config.model = "other".into(),
            3 => config.language = "zh-CN".into(),
            4 => config.include_labels = vec!["bug".into()],
            _ => config.exclude_labels = vec!["blocked".into()],
        }
        apply_config(&mut saved, config, 1000);
        assert!(saved.items["acme/widget#1"].pending);
        assert_eq!(
            saved.items["acme/widget#1"]
                .analysis
                .as_ref()
                .unwrap()
                .summary,
            "Original brief"
        );
        assert_eq!(saved.next_check_at, 0);
    }
}

#[test]
fn ineligible_updates_withdraw_retained_briefs() {
    for change in 0..4 {
        let mut saved = recommended_state();
        let mut updated = issue(1, BASE, NEXT);
        match change {
            0 => updated["state"] = json!("closed"),
            1 => updated["locked"] = json!(true),
            2 => updated["assignees"] = json!([{"login":"owner"}]),
            _ => updated["labels"] = json!([{"name":"duplicate"}]),
        }
        observe(&mut saved, "acme/widget", vec![updated], BASE).unwrap();
        assert!(saved.items["acme/widget#1"].analysis.is_none());
        assert!(!saved.items["acme/widget#1"].pending);
    }
}

#[test]
fn retries_rotate_without_refreshing_the_brief_timestamp() {
    let mut saved = recommended_state();
    observe(
        &mut saved,
        "acme/widget",
        vec![issue(1, BASE, NEXT), issue(2, BASE, NEXT)],
        BASE,
    )
    .unwrap();
    let item = saved.items.get_mut("acme/widget#1").unwrap();
    apply_analysis_result(item, Err("network".into()), NEXT.into()).unwrap_err();
    assert_eq!(pending_items(&saved, &saved.config)[0].number, 2);
    assert_eq!(
        saved.items["acme/widget#1"].checked_at.as_deref(),
        Some(BASE)
    );
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("monitor.sqlite");
    storage::save(&path, &saved).unwrap();
    let loaded = storage::load(&path).unwrap();
    assert_eq!(pending_items(&loaded, &loaded.config)[0].number, 2);
    let mut legacy = serde_json::to_value(&saved).unwrap();
    for item in legacy["items"].as_object_mut().unwrap().values_mut() {
        item.as_object_mut().unwrap().remove("lastAttemptAt");
    }
    assert!(serde_json::from_value::<Saved>(legacy).is_ok());
}

#[test]
fn refreshed_snapshot_keeps_brief_visible_and_rule_rejection_removes_it() {
    let dir = tempfile::tempdir().unwrap();
    let monitor = Monitor::new(dir.path().join("monitor.sqlite"));
    {
        let mut state = monitor.inner.lock().unwrap();
        state.saved = recommended_state();
        observe(
            &mut state.saved,
            "acme/widget",
            vec![issue(1, BASE, NEXT)],
            BASE,
        )
        .unwrap();
    }
    let snapshot = monitor.snapshot().unwrap();
    assert_eq!(snapshot.items.len(), 1);
    assert!(snapshot.items[0].pending);
    assert_eq!(snapshot.items[0].checked_at.as_deref(), Some(BASE));
    {
        let mut state = monitor.inner.lock().unwrap();
        let item = state.saved.items.get_mut("acme/widget#1").unwrap();
        apply_analysis_result(item, Ok(None), NEXT.into()).unwrap();
    }
    assert!(monitor.snapshot().unwrap().items.is_empty());
}
