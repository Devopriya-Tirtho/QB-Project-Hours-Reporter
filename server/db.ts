import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'database.sqlite'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS qb_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    realmId TEXT UNIQUE,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry INTEGER,
    connected_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS report_history (
    id TEXT PRIMARY KEY,
    requested_by TEXT,
    requested_at INTEGER,
    filters TEXT,
    recipient_email TEXT,
    status TEXT,
    error_message TEXT
  );
`);

export default db;
