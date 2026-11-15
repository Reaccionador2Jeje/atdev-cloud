-- Persistent, owner-scoped project metadata for the AtDev Cloud dashboard.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_updated
  ON projects(owner_id, updated_at DESC);
