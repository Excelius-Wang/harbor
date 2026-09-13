use super::types::{Config, Saved};
use keyring::{Entry, Error};
use rusqlite::{Connection, OptionalExtension};
use std::path::Path;

fn connect(path: &Path) -> Result<Connection, String> {
    std::fs::create_dir_all(path.parent().ok_or("storage")?).map_err(|_| "storage")?;
    let db = Connection::open(path).map_err(|_| "storage")?;
    db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS monitor_state (id INTEGER PRIMARY KEY CHECK (id=1), value TEXT NOT NULL);").map_err(|_| "storage")?;
    Ok(db)
}
pub fn load(path: &Path) -> Result<Saved, String> {
    let mut db = connect(path)?;
    let value: Option<String> = db
        .query_row("SELECT value FROM monitor_state WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|_| "storage")?;
    let Some(value) = value else {
        return Ok(Saved::default());
    };
    if let Ok(saved) = serde_json::from_str(&value) {
        return Ok(saved);
    }

    let mut recovered = Saved {
        error: Some("stateRecovered".into()),
        ..Saved::default()
    };
    if let Ok(raw) = serde_json::from_str::<serde_json::Value>(&value) {
        if let Some(mut config) = raw
            .get("config")
            .and_then(|config| serde_json::from_value::<Config>(config.clone()).ok())
        {
            if config.validate().is_ok() {
                recovered.config = config;
            }
        }
    }
    // Preserve one original payload locally before replacing unreadable state. Keychain
    // credentials remain untouched; recovery does not assume a key is still available.
    let transaction = db.transaction().map_err(|_| "storage")?;
    transaction.execute_batch("CREATE TABLE IF NOT EXISTS monitor_state_recovery (id INTEGER PRIMARY KEY CHECK (id=1), value TEXT NOT NULL);").map_err(|_| "storage")?;
    transaction
        .execute(
            "INSERT OR REPLACE INTO monitor_state_recovery VALUES (1, ?1)",
            [&value],
        )
        .map_err(|_| "storage")?;
    transaction
        .execute(
            "INSERT OR REPLACE INTO monitor_state VALUES (1, ?1)",
            [serde_json::to_string(&recovered).map_err(|_| "storage")?],
        )
        .map_err(|_| "storage")?;
    transaction.commit().map_err(|_| "storage")?;
    Ok(recovered)
}
pub fn save(path: &Path, saved: &Saved) -> Result<(), String> {
    let db = connect(path)?;
    db.execute(
        "INSERT OR REPLACE INTO monitor_state VALUES (1, ?1)",
        [serde_json::to_string(saved).map_err(|_| "storage")?],
    )
    .map_err(|_| "storage")?;
    Ok(())
}
pub fn key(endpoint: &str, replacement: Option<&str>) -> Result<Option<String>, String> {
    let entry = Entry::new("com.harbor.desktop.monitor", endpoint).map_err(|_| "credentials")?;
    if let Some(value) = replacement {
        entry.set_password(value).map_err(|_| "credentials")?;
    }
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(_) => Err("credentials".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_raw(path: &Path, value: &str) {
        connect(path)
            .unwrap()
            .execute(
                "INSERT OR REPLACE INTO monitor_state VALUES (1, ?1)",
                [value],
            )
            .unwrap();
    }

    fn backup(path: &Path) -> String {
        connect(path)
            .unwrap()
            .query_row(
                "SELECT value FROM monitor_state_recovery WHERE id=1",
                [],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn invalid_json_recovers_paused_and_preserves_one_original_payload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("monitor.sqlite");
        write_raw(&path, "{broken");
        let recovered = load(&path).unwrap();
        assert!(!recovered.enabled);
        assert!(!recovered.has_api_key);
        assert_eq!(recovered.error.as_deref(), Some("stateRecovered"));
        assert!(recovered.config.repositories.is_empty());
        assert_eq!(backup(&path), "{broken");
        assert_eq!(
            load(&path).unwrap().error.as_deref(),
            Some("stateRecovered")
        );
        assert_eq!(backup(&path), "{broken");
        write_raw(&path, "second broken payload");
        load(&path).unwrap();
        assert_eq!(backup(&path), "second broken payload");
        let count: i64 = connect(&path)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM monitor_state_recovery", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn malformed_nested_state_preserves_validated_configuration() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("monitor.sqlite");
        let mut raw = serde_json::to_value(Saved::default()).unwrap();
        raw["config"]["repositories"] = serde_json::json!(["ACME/Widget"]);
        raw["config"]["endpoint"] = serde_json::json!("https://model.example/v1");
        raw["config"]["model"] = serde_json::json!("test-model");
        raw["items"] = serde_json::json!({"broken": {"title": 42}});
        raw["enabled"] = serde_json::json!(true);
        raw["hasApiKey"] = serde_json::json!(true);
        let payload = raw.to_string();
        write_raw(&path, &payload);
        let recovered = load(&path).unwrap();
        assert_eq!(recovered.config.repositories, vec!["acme/widget"]);
        assert_eq!(recovered.config.model, "test-model");
        assert!(recovered.items.is_empty());
        assert!(recovered.cursors.is_empty());
        assert!(!recovered.enabled);
        assert!(!recovered.has_api_key);
        assert_eq!(backup(&path), payload);

        raw["config"]["endpoint"] = serde_json::json!("http://unsafe.example");
        write_raw(&path, &raw.to_string());
        assert!(load(&path).unwrap().config.repositories.is_empty());
    }

    #[test]
    fn valid_rows_and_missing_state_keep_existing_behavior() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("monitor.sqlite");
        let initial = load(&path).unwrap();
        assert!(initial.error.is_none());
        let saved = Saved {
            owner: Some("alice".into()),
            enabled: true,
            has_api_key: true,
            next_check_at: 1234,
            ..Saved::default()
        };
        save(&path, &saved).unwrap();
        assert_eq!(
            serde_json::to_value(load(&path).unwrap()).unwrap(),
            serde_json::to_value(saved).unwrap()
        );
    }

    #[test]
    fn database_io_errors_are_not_recovered_as_empty_state() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("monitor.sqlite");
        std::fs::write(&path, "not a SQLite database").unwrap();
        assert!(matches!(load(&path), Err(code) if code == "storage"));
    }
}
