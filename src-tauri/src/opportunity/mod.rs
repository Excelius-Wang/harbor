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
            let saved = storage::load(&this.path)?;
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
            let state = this.inner.lock().map_err(|_| "storage")?;
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
                if state.saved.config != config {
                    for item in state.saved.items.values_mut() {
                        item.pending = true;
                    }
                }
                state.saved.config = config;
                state.saved.has_api_key = true;
                state.saved.error = None;
                state.saved.next_check_at = 0;
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
            let mut items: Vec<_> = state
                .saved
                .items
                .values()
                .filter(|i| i.pending && config.repositories.contains(&i.repository))
                .cloned()
                .collect();
            items.sort_by(|a, b| {
                a.checked_at
                    .cmp(&b.checked_at)
                    .then_with(|| a.id.cmp(&b.id))
            });
            items.into_iter().take(10).collect()
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
            item.checked_at = Some(chrono::Utc::now().to_rfc3339());
            match result {
                Ok(analysis) => {
                    item.analysis = analysis;
                    item.pending = false;
                    item.error = None;
                }
                Err(failure) => {
                    let code = self.failure(failure);
                    item.error = Some(code.clone());
                    errors.push(code);
                }
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
            .is_some_and(|i| i.updated_at == updated && i.issue == issue)
        {
            continue;
        }
        let relevant = filter(&issue, &saved.config);
        saved.items.insert(
            id.clone(),
            Opportunity {
                id,
                repository: repo.into(),
                number,
                title: issue["title"].as_str().ok_or("response")?.into(),
                updated_at: updated,
                checked_at: None,
                analysis: None,
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
#[tauri::command]
pub async fn opportunity_snapshot(state: tauri::State<'_, Monitor>) -> Result<Snapshot, String> {
    state.initialize().await?;
    state.snapshot()
}
#[tauri::command]
pub async fn opportunity_save_config(
    state: tauri::State<'_, Monitor>,
    config: Config,
    api_key: Option<String>,
) -> Result<Snapshot, String> {
    state.save_config(config, api_key).await
}
#[tauri::command]
pub async fn opportunity_set_enabled(
    state: tauri::State<'_, Monitor>,
    enabled: bool,
) -> Result<Snapshot, String> {
    state.enabled(enabled).await
}
#[tauri::command]
pub async fn opportunity_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, Monitor>,
    history_days: Option<u32>,
) -> Result<Snapshot, String> {
    state.launch(app, history_days.unwrap_or(0)).await
}
