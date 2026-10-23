// SQLite storage (built into Node 22.13+). One file in DATA_DIR.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(join(config.dataDir, "jarvis-social.db"));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,            -- instagram | facebook
    external_id TEXT NOT NULL,         -- IG user id or Page id
    page_id TEXT NOT NULL,             -- Page that owns the token (same as external_id for facebook)
    handle TEXT NOT NULL,
    followers INTEGER DEFAULT 0,
    token_enc TEXT NOT NULL,           -- encrypted Page access token
    created_at TEXT NOT NULL,
    UNIQUE (platform, external_id)
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    caption TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL,              -- feed | reels | story
    media_file TEXT,                   -- file name in DATA_DIR/media
    media_kind TEXT,                   -- image | video | null
    thumb TEXT,                        -- small data URL for the app
    when_at TEXT NOT NULL,
    status TEXT NOT NULL,              -- agendado | publicando | publicado | parcial | falhou
    options TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS post_targets (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | publicando | publicado | falhou
    remote_id TEXT,
    error TEXT,
    PRIMARY KEY (post_id, account_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,               -- platform comment id
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    media_id TEXT,
    post_label TEXT,
    created_at TEXT NOT NULL,
    replied_text TEXT,
    dm_text TEXT
  );

  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    keyword TEXT NOT NULL DEFAULT '',
    reply_text TEXT NOT NULL DEFAULT '',
    dm_text TEXT NOT NULL DEFAULT '',
    account_ids TEXT NOT NULL DEFAULT '[]',
    runs INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Columns added after the first release.
const accountColumns = db.prepare("PRAGMA table_info(accounts)").all().map((c) => c.name);
if (!accountColumns.includes("needs_reconnect")) db.exec("ALTER TABLE accounts ADD COLUMN needs_reconnect INTEGER NOT NULL DEFAULT 0");

export const settings = {
  get: (key) => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? null,
  set: (key, value) => db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value))
};
