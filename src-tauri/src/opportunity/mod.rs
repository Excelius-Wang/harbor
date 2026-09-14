mod network;
mod storage;
#[cfg(test)]
mod tests;
mod types;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;
use types::*;

struct Runtime {
    saved: Saved,
    busy: bool,
    cancel: CancellationToken,
    loaded: bool,
}
#[derive(Clone)]
pub struct Monitor {
    inner: Arc<Mutex<Runtime>>,
    init: Arc<AsyncMutex<()>>,
    path: PathBuf,
}
impl Monitor {
    pub fn new(path: PathBuf) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Runtime {
                saved: Saved::default(),
                busy: false,
                cancel: CancellationToken::new(),
                loaded: false,
            })),
            init: Arc::new(AsyncMutex::new(())),
            path,
        }
    }
    async fn initialize(&self) -> Result<(), String> {
        let _guard = self.init.lock().await;
        if self.inner.lock().map_err(|_| "storage")?.loaded {
            return Ok(());
        }
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut saved = storage::load(&this.path)?;
            prune(&mut saved, chrono::Utc::now());
            storage::save(&this.path, &saved)?;
            let mut state = this.inner.lock().map_err(|_| "storage")?;
            state.saved = saved;
            state.loaded = true;
            Ok::<_, String>(())
        })
        .await
        .map_err(|_| "storage")?
    }
    async fn persist(&self) -> Result<(), String> {
        let this = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut state = this.inner.lock().map_err(|_| "storage")?;
            prune(&mut state.saved, chrono::Utc::now());
            storage::save(&this.path, &state.saved)
        })
        .await
        .map_err(|_| "storage")?
    }
    fn snapshot(&self) -> Result<Snapshot, String> {
        let state = self.inner.lock().map_err(|_| "storage")?;
        let s = &state.saved;
        let mut items: Vec<_> = s
            .items
            .values()
            .filter(|i| {
                s.config.repositories.contains(&i.repository)
                    && i.analysis.as_ref().is_some_and(|a| a.decision != "skip")
            })
            .cloned()
            .collect();
        // Raw issue bodies are not needed by the view and may be large.
        for item in &mut items {
            item.issue = serde_json::Value::Null;
        }
        items.sort_by(|a, b| {
            b.checked_at
                .cmp(&a.checked_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(Snapshot {
            owner: s.owner.clone(),
            config: s.config.clone(),
            has_api_key: s.has_api_key,
            enabled: s.enabled,
            busy: state.busy,
            last_checked_at: s.last_checked_at.clone(),
            next_check_at: s.next_check_at.max(s.cooldown_until),
            error: s.error.clone(),
            items,
            pending_count: s
                .items
                .values()
                .filter(|i| i.pending && s.config.repositories.contains(&i.repository))
                .count(),
        })
    }
    async fn save_config(
        &self,
        mut config: Config,
        api_key: Option<String>,
    ) -> Result<Snapshot, String> {
        self.initialize().await?;
        config.validate()?;
        // Reserve the runtime while keychain I/O is in flight, so no check starts with half a config.
        {
            let mut state = self.inner.lock().map_err(|_| "storage")?;
            if state.busy {
                return Err("busy".into());
            }
            state.busy = true;
        }
        let endpoint = config.endpoint.clone();
        let key_result = tokio::task::spawn_blocking(move || {
            storage::key(
                &endpoint,
                api_key.as_deref().filter(|k| !k.trim().is_empty()),
            )
        })
        .await
        .map_err(|_| "credentials".to_string())
        .and_then(|v| v);
        let result = match key_result {
            Ok(Some(key)) if !key.trim().is_empty() => {
                let mut state = self.inner.lock().map_err(|_| "storage")?;
                apply_config(&mut state.saved, config, chrono::Utc::now().timestamp());
                Ok(())
            }
            Ok(_) => Err("apiKey".into()),
            Err(error) => Err(error),
        };
        self.inner.lock().map_err(|_| "storage")?.busy = false;
        result?;
        self.persist().await?;
        self.snapshot()
    }
    pub(crate) async fn enabled(&self, enabled: bool) -> Result<Snapshot, String> {
        self.initialize().await?;
        {
            let mut state = self.inner.lock().map_err(|_| "storage")?;
            if enabled && (state.saved.config.repositories.is_empty() || !state.saved.has_api_key) {
                return Err("configure".into());
            }
            state.saved.enabled = enabled;
            if enabled {
                state.saved.next_check_at = 0;
            } else {
                state.cancel.cancel();
            }
        }
        self.persist().await?;
        self.snapshot()
    }
    async fn launch(&self, app: tauri::AppHandle, history_days: u32) -> Result<Snapshot, String> {
        self.initialize().await?;
        if history_days > 90 {
            return Err("history".into());
        }
        let (config, cancel) = {
            let mut state = self.inner.lock().map_err(|_| "storage")?;
            if state.busy {
                return Err("busy".into());
            }
            if state.saved.cooldown_until > chrono::Utc::now().timestamp() {
                return Err("rateLimit".into());
            }
            if state.saved.config.repositories.is_empty() || !state.saved.has_api_key {
                return Err("configure".into());
            }
            state.busy = true;
            state.saved.error = None;
            state.cancel = CancellationToken::new();
            (state.saved.config.clone(), state.cancel.clone())
        };
        let this = self.clone();
        tauri::async_runtime::spawn(async move {
            let result = this.cycle(&app, &config, &cancel, history_days).await;
            if let Ok(mut state) = this.inner.lock() {
                if let Err(error) = result {
                    if error != "cancelled" {
                        state.saved.error = Some(error.clone());
                        if ["authentication", "credentials", "apiKey", "notConnected"]
                            .contains(&error.as_str())
                        {
                            state.saved.enabled = false;
                        }
                    }
                }
                if state.saved.error.is_none() && !cancel.is_cancelled() {
                    state.saved.last_checked_at = Some(chrono::Utc::now().to_rfc3339());
                }
                state.saved.next_check_at =
                    chrono::Utc::now().timestamp() + config.interval_seconds as i64;
                // Keep busy until persistence finishes so the next cycle cannot race it.
            }
            if this.persist().await.is_err() {
                if let Ok(mut state) = this.inner.lock() {
                    state.saved.error = Some("storage".into());
                    state.saved.enabled = false;
                }
            }
            if let Ok(mut state) = this.inner.lock() {
                state.busy = false;
            }
        });
        self.snapshot()
    }
    fn failure(&self, failure: network::Failure) -> String {
        if let Ok(mut state) = self.inner.lock() {
            state.saved.cooldown_until = state.saved.cooldown_until.max(failure.retry_at);
        }
        failure.code
    }
    async fn cycle(
        &self,
        app: &tauri::AppHandle,
        config: &Config,
        cancel: &CancellationToken,
        history_days: u32,
    ) -> Result<(), String> {
        let github = &app.state::<crate::app_state::AppState>().github;
        let connection = github.status().await.map_err(|_| "notConnected")?;
        let owner = connection.identity.ok_or("notConnected")?.login;
        let token = github
            .load_access_token()
            .await
            .map_err(|_| "notConnected")?;
        let endpoint = config.endpoint.clone();
        let key = tokio::task::spawn_blocking(move || storage::key(&endpoint, None))
            .await
            .map_err(|_| "credentials")??
            .ok_or("apiKey")?;
        let client = network::client().map_err(|e| e.code)?;
        let started = chrono::Utc::now();
        {
            let mut state = self.inner.lock().map_err(|_| "storage")?;
            if state.saved.owner.as_ref() != Some(&owner) {
                state.saved.items.clear();
                state.saved.cursors.clear();
                state.saved.owner = Some(owner);
            }
        }
        let mut errors = Vec::new();
        for repo in &config.repositories {
            if cancel.is_cancelled() {
                return Err("cancelled".into());
            }
            let cursor = {
                let mut state = self.inner.lock().map_err(|_| "storage")?;
                state
                    .saved
                    .cursors
                    .entry(repo.clone())
                    .or_insert_with(|| Cursor {
                        baseline: started.to_rfc3339(),
                        since: started.to_rfc3339(),
                    })
                    .clone()
            };
            self.persist().await?;
            let since = if history_days > 0 {
                started - chrono::Duration::days(history_days as i64)
            } else {
                chrono::DateTime::parse_from_rfc3339(&cursor.since)
                    .map_err(|_| "storage")?
                    .to_utc()
            } - chrono::Duration::seconds(60);
            let query: String = url::form_urlencoded::Serializer::new(String::new())
                .append_pair("since", &since.to_rfc3339())
                .finish();
            match network::pages(&client, &token, &format!("/repos/{repo}/issues?state=all&sort=created&direction=asc&per_page=100&{query}"),100,cancel).await {
                Ok(issues) => {
                    let mut state = self.inner.lock().map_err(|_| "storage")?;
                    let cutoff = if history_days > 0 { (started-chrono::Duration::days(history_days as i64)).to_rfc3339() } else { cursor.baseline.clone() };
                    observe(&mut state.saved, repo, issues, &cutoff)?;
                    if history_days == 0 { state.saved.cursors.get_mut(repo).ok_or("storage")?.since = started.to_rfc3339(); }
                },
                Err(failure) => { let limited = failure.retry_at > 0; errors.push(self.failure(failure)); if limited || cancel.is_cancelled() { break; } }
            }
            self.persist().await?;
        }
        if self
            .inner
            .lock()
            .map_err(|_| "storage")?
            .saved
            .cooldown_until
            > chrono::Utc::now().timestamp()
        {
            return Err("rateLimit".into());
        }
        let pending: Vec<_> = {
            let state = self.inner.lock().map_err(|_| "storage")?;
            pending_items(&state.saved, config)
        };
        for mut item in pending {
            if cancel.is_cancelled() {
                return Err("cancelled".into());
            }
            let result = async {
                let issue = network::github(
                    &client,
                    &token,
                    &format!("/repos/{}/issues/{}", item.repository, item.number),
                    cancel,
                )
                .await?;
                item.issue = issue;
                item.title = item.issue["title"]
                    .as_str()
                    .unwrap_or(&item.title)
                    .to_string();
                if !filter(&item.issue, config) {
                    return Ok(None);
                }
                let comments = network::pages(
                    &client,
                    &token,
                    &format!(
                        "/repos/{}/issues/{}/comments?per_page=100",
                        item.repository, item.number
                    ),
                    10,
                    cancel,
                )
                .await?;
                network::analyze(&client, &key, config, &item.issue, comments, cancel)
                    .await
                    .map(Some)
            }
            .await;
            if let Err(code) = apply_analysis_result(
                &mut item,
                result.map_err(|failure| self.failure(failure)),
                chrono::Utc::now().to_rfc3339(),
            ) {
                errors.push(code);
            }
            self.inner
                .lock()
                .map_err(|_| "storage")?
                .saved
                .items
                .insert(item.id.clone(), item);
            self.persist().await?;
            if self
                .inner
                .lock()
                .map_err(|_| "storage")?
                .saved
                .cooldown_until
                > chrono::Utc::now().timestamp()
            {
                break;
            }
        }
        errors.into_iter().next().map_or(Ok(()), Err)
    }
}
// A compact digest preserves same-second change detection without retaining issue bodies.
fn fingerprint(issue: &serde_json::Value) -> String {
    git2::Oid::hash_object(git2::ObjectType::Blob, issue.to_string().as_bytes())
        .map(|oid| oid.to_string())
        .unwrap_or_default()
}
const MAX_RECORDS: usize = 10_000;
fn prune(saved: &mut Saved, now: chrono::DateTime<chrono::Utc>) {
    let cutoff = now - chrono::Duration::days(90);
    saved
        .cursors
        .retain(|repo, _| saved.config.repositories.contains(repo));
    saved.items.retain(|_, item| {
        saved.config.repositories.contains(&item.repository)
            && chrono::DateTime::parse_from_rfc3339(&item.updated_at)
                .is_ok_and(|updated| updated >= cutoff)
    });
    for item in saved.items.values_mut() {
        if item.fingerprint.is_empty() && !item.issue.is_null() {
            item.fingerprint = fingerprint(&item.issue);
        }
        // Pending work fetches fresh issue data; completed work only needs the brief and digest.
        item.issue = serde_json::Value::Null;
        if item
            .analysis
            .as_ref()
            .is_some_and(|analysis| analysis.decision == "skip")
        {
            item.analysis = None;
        }
    }
    if saved.items.len() > MAX_RECORDS {
        let mut oldest: Vec<_> = saved
            .items
            .values()
            .map(|item| (item.updated_at.clone(), item.id.clone()))
            .collect();
        oldest.sort();
        for (_, id) in oldest.into_iter().take(saved.items.len() - MAX_RECORDS) {
            saved.items.remove(&id);
        }
    }
}
fn observe(
    saved: &mut Saved,
    repo: &str,
    issues: Vec<serde_json::Value>,
    cutoff: &str,
) -> Result<(), String> {
    let cutoff = chrono::DateTime::parse_from_rfc3339(cutoff).map_err(|_| "response")?;
    for issue in issues {
        if issue["pull_request"].is_object() {
            continue;
        }
        let number = issue["number"].as_u64().ok_or("response")?;
        let id = format!("{repo}#{number}");
        let created =
            chrono::DateTime::parse_from_rfc3339(issue["created_at"].as_str().ok_or("response")?)
                .map_err(|_| "response")?;
        if created < cutoff && !saved.items.contains_key(&id) {
            continue;
        }
        let updated = issue["updated_at"].as_str().ok_or("response")?.to_string();
        if saved
            .items
            .get(&id)
            .is_some_and(|i| i.updated_at == updated && i.fingerprint == fingerprint(&issue))
        {
            continue;
        }
        let relevant = filter(&issue, &saved.config);
        let previous = saved.items.get(&id).filter(|_| relevant);
        let checked_at = previous.as_ref().and_then(|item| item.checked_at.clone());
        let analysis = previous.and_then(|item| item.analysis.clone());
        let last_attempt_at = previous.and_then(|item| item.last_attempt_at.clone());
        saved.items.insert(
            id.clone(),
            Opportunity {
                fingerprint: fingerprint(&issue),
                id,
                repository: repo.into(),
                number,
                title: issue["title"].as_str().ok_or("response")?.into(),
                updated_at: updated,
                checked_at,
                last_attempt_at,
                analysis,
                pending: relevant,
                error: None,
                issue,
            },
        );
    }
    Ok(())
}
pub fn background(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let monitor = app.state::<Monitor>().inner().clone();
        if monitor.initialize().await.is_err() {
            return;
        }
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            let due = monitor
                .inner
                .lock()
                .map(|s| {
                    s.saved.enabled
                        && !s.busy
                        && s.saved.next_check_at.max(s.saved.cooldown_until)
                            <= chrono::Utc::now().timestamp()
                })
                .unwrap_or(false);
            if due {
                let _ = monitor.launch(app.clone(), 0).await;
            }
        }
    });
}
fn scope_snapshot(mut snapshot: Snapshot, owner: Option<&str>) -> Snapshot {
    if owner.is_none() || snapshot.owner.as_deref() != owner {
        snapshot.items.clear();
        snapshot.pending_count = 0;
        snapshot.last_checked_at = None;
    }
    snapshot
}
async fn visible_snapshot(app: &tauri::AppHandle, state: &Monitor) -> Result<Snapshot, String> {
    let connection = app
        .state::<crate::app_state::AppState>()
        .github
        .status()
        .await
        .map_err(|_| "notConnected")?;
    let owner = connection.identity.map(|identity| identity.login);
    Ok(scope_snapshot(state.snapshot()?, owner.as_deref()))
}
#[tauri::command]
pub async fn opportunity_snapshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, Monitor>,
) -> Result<Snapshot, String> {
    state.initialize().await?;
    visible_snapshot(&app, &state).await
}
#[tauri::command]
pub async fn opportunity_save_config(
    app: tauri::AppHandle,
    state: tauri::State<'_, Monitor>,
    config: Config,
    api_key: Option<String>,
) -> Result<Snapshot, String> {
    state.save_config(config, api_key).await?;
    visible_snapshot(&app, &state).await
}
#[tauri::command]
pub async fn opportunity_set_enabled(
    app: tauri::AppHandle,
    state: tauri::State<'_, Monitor>,
    enabled: bool,
) -> Result<Snapshot, String> {
    state.enabled(enabled).await?;
    visible_snapshot(&app, &state).await
}
#[tauri::command]
pub async fn opportunity_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, Monitor>,
    history_days: Option<u32>,
) -> Result<Snapshot, String> {
    state.launch(app.clone(), history_days.unwrap_or(0)).await?;
    visible_snapshot(&app, &state).await
}

fn apply_config(saved: &mut Saved, config: Config, now: i64) {
    // Polling cadence does not change the facts or preferences used by an analysis.
    let mut previous_analysis_config = saved.config.clone();
    previous_analysis_config.interval_seconds = config.interval_seconds;
    let analysis_changed = previous_analysis_config != config;
    let interval_only =
        !analysis_changed && saved.config.interval_seconds != config.interval_seconds;
    if analysis_changed {
        for item in saved.items.values_mut() {
            item.pending = true;
        }
    }
    saved.next_check_at = if interval_only {
        now + config.interval_seconds as i64
    } else {
        0
    };
    saved.config = config;
    saved.has_api_key = true;
    saved.error = None;
}

fn apply_analysis_result(
    item: &mut Opportunity,
    result: Result<Option<Analysis>, String>,
    checked_at: String,
) -> Result<(), String> {
    item.last_attempt_at = Some(checked_at.clone());
    match result {
        Ok(analysis) => {
            item.checked_at = Some(checked_at);
            item.analysis = analysis;
            item.pending = false;
            item.error = None;
            Ok(())
        }
        Err(code) => {
            item.error = Some(code.clone());
            Err(code)
        }
    }
}

fn pending_items(saved: &Saved, config: &Config) -> Vec<Opportunity> {
    let mut items: Vec<_> = saved
        .items
        .values()
        .filter(|item| item.pending && config.repositories.contains(&item.repository))
        .cloned()
        .collect();
    // Failed attempts rotate behind untried work without changing the brief's timestamp.
    items.sort_by(|a, b| {
        a.last_attempt_at
            .cmp(&b.last_attempt_at)
            .then_with(|| a.id.cmp(&b.id))
    });
    items.into_iter().take(10).collect()
}
