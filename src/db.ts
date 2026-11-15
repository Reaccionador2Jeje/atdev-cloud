import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
export const db: Database.Database = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    collection TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_records_scope ON records(owner_id, project, collection);
`);
