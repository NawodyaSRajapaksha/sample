-- Stable authentication schema for the production Worker.
-- This migration is intentionally additive and safe to run against an existing D1 database.

CREATE TABLE IF NOT EXISTS yamamoto_admin_state_v1 (
  email TEXT PRIMARY KEY,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS yamamoto_admin_bootstrap_v1 (
  email TEXT PRIMARY KEY,
  initialized_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS yamamoto_sessions_v2 (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_yamamoto_sessions_v2_expires ON yamamoto_sessions_v2(expires_at);

-- Ensure the two fixed administrator state rows exist. Password hashes remain in the Worker
-- and are not stored in this migration.
INSERT OR IGNORE INTO yamamoto_admin_state_v1 (email, must_change_password, updated_at)
VALUES ('fujim2021@gmail.com', 1, datetime('now'));

INSERT OR IGNORE INTO yamamoto_admin_state_v1 (email, must_change_password, updated_at)
VALUES ('nawodyasrajapaksha@gmail.com', 1, datetime('now'));

INSERT OR IGNORE INTO yamamoto_admin_bootstrap_v1 (email, initialized_at)
VALUES ('fujim2021@gmail.com', datetime('now'));

INSERT OR IGNORE INTO yamamoto_admin_bootstrap_v1 (email, initialized_at)
VALUES ('nawodyasrajapaksha@gmail.com', datetime('now'));
