use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub repositories: Vec<String>,
    pub preferences: String,
    pub endpoint: String,
    pub model: String,
    pub interval_seconds: u64,
    pub include_labels: Vec<String>,
    pub exclude_labels: Vec<String>,
    pub language: String,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            repositories: vec![],
            preferences: String::new(),
            endpoint: String::new(),
            model: String::new(),
            interval_seconds: 300,
            include_labels: vec![],
            exclude_labels: vec!["duplicate".into(), "wontfix".into()],
            language: "en".into(),
        }
    }
}
impl Config {
    pub fn validate(&mut self) -> Result<(), String> {
        if self.repositories.is_empty() || self.repositories.len() > 20 {
            return Err("repositories".into());
        }
        for repo in &mut self.repositories {
            *repo = repo.trim().to_ascii_lowercase();
            let parts: Vec<_> = repo.split('/').collect();
            if parts.len() != 2
                || parts.iter().any(|p| {
                    p.is_empty()
                        || *p == "."
                        || *p == ".."
                        || !p
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
                })
            {
                return Err("repositories".into());
            }
        }
        self.repositories.sort();
        self.repositories.dedup();
        if !(60..=86400).contains(&self.interval_seconds) {
            return Err("interval".into());
        }
        self.endpoint = self.endpoint.trim().trim_end_matches('/').to_string();
        let url = url::Url::parse(&self.endpoint).map_err(|_| "endpoint")?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || self.endpoint.len() > 512
        {
            return Err("endpoint".into());
        }
        self.model = self.model.trim().to_string();
        if self.model.is_empty() || self.model.len() > 200 || self.preferences.len() > 8000 {
            return Err("model".into());
        }
        if !["en", "zh-CN"].contains(&self.language.as_str()) {
            return Err("language".into());
        }
        for list in [&mut self.include_labels, &mut self.exclude_labels] {
            if list.len() > 50 {
                return Err("labels".into());
            }
            for label in list {
                *label = label.trim().to_lowercase();
                if label.is_empty() || label.len() > 100 {
                    return Err("labels".into());
                }
            }
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub decision: String,
    pub summary: String,
    pub reasons: Vec<String>,
    pub uncertainties: Vec<String>,
    pub first_step: String,
    pub claim_draft: String,
}
impl Analysis {
    pub fn validate(&self) -> Result<(), String> {
        if !["recommend", "clarify", "skip"].contains(&self.decision.as_str())
            || self.summary.trim().is_empty()
            || [&self.summary, &self.first_step, &self.claim_draft]
                .iter()
                .any(|s| s.len() > 10000)
            || [&self.reasons, &self.uncertainties]
                .iter()
                .any(|xs| xs.len() > 20 || xs.iter().any(|s| s.len() > 3000))
        {
            return Err("modelResponse".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Opportunity {
    #[serde(default)]
    pub fingerprint: String,
    pub id: String,
    pub repository: String,
    pub number: u64,
    pub title: String,
    pub updated_at: String,
    pub checked_at: Option<String>,
    #[serde(default)]
    pub last_attempt_at: Option<String>,
    pub analysis: Option<Analysis>,
    pub pending: bool,
    pub error: Option<String>,
    pub issue: Value,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Cursor {
    pub baseline: String,
    pub since: String,
}
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub config: Config,
    pub has_api_key: bool,
    pub enabled: bool,
    pub owner: Option<String>,
    pub cursors: BTreeMap<String, Cursor>,
    pub items: BTreeMap<String, Opportunity>,
    pub last_checked_at: Option<String>,
    pub next_check_at: i64,
    pub cooldown_until: i64,
    pub error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(skip)]
    pub owner: Option<String>,
    pub config: Config,
    pub has_api_key: bool,
    pub enabled: bool,
    pub busy: bool,
    pub last_checked_at: Option<String>,
    pub next_check_at: i64,
    pub error: Option<String>,
    pub items: Vec<Opportunity>,
    pub pending_count: usize,
}
pub fn filter(issue: &Value, config: &Config) -> bool {
    if issue["state"] != "open"
        || issue["locked"].as_bool().unwrap_or(false)
        || issue["pull_request"].is_object()
        || issue["assignees"].as_array().is_some_and(|a| !a.is_empty())
    {
        return false;
    }
    let labels: Vec<_> = issue["labels"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|l| l["name"].as_str().or_else(|| l.as_str()))
        .map(str::to_lowercase)
        .collect();
    !config.exclude_labels.iter().any(|l| labels.contains(l))
        && (config.include_labels.is_empty()
            || config.include_labels.iter().any(|l| labels.contains(l)))
}
