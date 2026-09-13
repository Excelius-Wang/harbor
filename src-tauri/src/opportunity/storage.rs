use super::types::Saved;
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
    let db = connect(path)?;
    let value: Option<String> = db
        .query_row("SELECT value FROM monitor_state WHERE id=1", [], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|_| "storage")?;
    value
        .map(|v| serde_json::from_str(&v).map_err(|_| "storage".into()))
        .unwrap_or(Ok(Saved::default()))
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
