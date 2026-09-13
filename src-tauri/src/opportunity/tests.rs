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
