import { DatabaseSync } from "node:sqlite";

export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS issues (
        repo TEXT NOT NULL, number INTEGER NOT NULL, payload TEXT NOT NULL,
        fingerprint TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        result TEXT, error TEXT, attempted_at TEXT, analyzed_at TEXT,
        PRIMARY KEY (repo, number)
      );
    `);
  }
  get(key) {
    const row = this.db.prepare("SELECT value FROM state WHERE key = ?").get(key);
    return row ? JSON.parse(row.value) : null;
  }
  set(key, value) {
    this.db.prepare("INSERT OR REPLACE INTO state VALUES (?, ?)").run(key, JSON.stringify(value));
  }
  observe(repo, issue, fingerprint) {
    this.db
      .prepare(
        `INSERT INTO issues (repo, number, payload, fingerprint) VALUES (?, ?, ?, ?)
      ON CONFLICT(repo, number) DO UPDATE SET payload=excluded.payload,
      status=CASE WHEN issues.fingerprint=excluded.fingerprint THEN issues.status ELSE 'pending' END,
      result=CASE WHEN issues.fingerprint=excluded.fingerprint THEN issues.result ELSE NULL END,
      error=NULL, fingerprint=excluded.fingerprint`
      )
      .run(repo, issue.number, JSON.stringify(issue), fingerprint);
  }
  hasIssue(repo, number) {
    return !!this.db.prepare("SELECT 1 FROM issues WHERE repo=? AND number=?").get(repo, number);
  }
  requeue() {
    this.db.prepare("UPDATE issues SET status='pending', result=NULL").run();
  }
  pending(repos, limit) {
    return this.db
      .prepare(
        `SELECT * FROM issues WHERE status='pending'
      AND repo IN (${repos.map(() => "?").join(",")})
      ORDER BY attempted_at IS NOT NULL, attempted_at, repo, number LIMIT ?`
      )
      .all(...repos, limit);
  }
  finish(repo, number, status, result, now) {
    this.db
      .prepare(
        `UPDATE issues SET status=?, result=?, error=NULL, attempted_at=?, analyzed_at=?
      WHERE repo=? AND number=?`
      )
      .run(status, JSON.stringify(result), now, now, repo, number);
  }
  fail(repo, number, message, now) {
    this.db
      .prepare("UPDATE issues SET error=?, attempted_at=? WHERE repo=? AND number=?")
      .run(message, now, repo, number);
  }
  results() {
    return this.db
      .prepare(
        `SELECT * FROM issues WHERE status IN ('recommend','clarify')
      ORDER BY analyzed_at DESC, repo, number`
      )
      .all()
      .map((row) => ({
        repo: row.repo,
        number: row.number,
        checkedAt: row.analyzed_at,
        issue: JSON.parse(row.payload),
        ...JSON.parse(row.result),
      }));
  }
  async exclusive(work) {
    // One writer owns the entire cycle; a crash rolls back safely, and WAL permits readers.
    try {
      this.db.exec("BEGIN IMMEDIATE");
    } catch {
      throw new Error("Another monitor is using this database.");
    }
    try {
      const result = await work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
