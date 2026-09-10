CREATE TABLE IF NOT EXISTS yamamoto_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'ミニショベル',
  description TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  price_mode TEXT NOT NULL DEFAULT 'contact',
  price TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  featured INTEGER NOT NULL DEFAULT 0,
  images_json TEXT NOT NULL DEFAULT '[]',
  specs_json TEXT NOT NULL DEFAULT '[]',
  line_id TEXT NOT NULL DEFAULT 'yamamotoauto',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS yamamoto_admins (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS yamamoto_sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_yamamoto_products_status ON yamamoto_products(status);
CREATE INDEX IF NOT EXISTS idx_yamamoto_products_featured ON yamamoto_products(featured);
CREATE INDEX IF NOT EXISTS idx_yamamoto_sessions_expires ON yamamoto_sessions(expires_at);
