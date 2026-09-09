CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'ミニショベル',
  description TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  price_mode TEXT NOT NULL DEFAULT 'contact' CHECK (price_mode IN ('show','contact')),
  price TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('published','draft','sold')),
  images_json TEXT NOT NULL DEFAULT '[]',
  specs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO products
(id,title,category,description,video_url,price_mode,price,status,images_json,specs_json,created_at,updated_at)
VALUES
('kubota-kh-012','クボタ KH-012 ミニショベル','ミニショベル','クボタ KH-012。1tクラスのコンパクトなミニショベルです。写真・動画・主要仕様をご確認いただけます。','https://youtu.be/JqDzWHW0vWM','show','¥1,500,000','published','["/assets/kubota-kh012.jpg"]','[{"key":"メーカー","value":"クボタ"},{"key":"型式","value":"KH-012"},{"key":"クラス","value":"1tクラス"},{"key":"機械種類","value":"ミニショベル"},{"key":"燃料","value":"ディーゼル"}]','2026-09-09T00:00:00.000Z','2026-09-09T00:00:00.000Z'),
('mini-excavator-contact','小型ミニショベル','ミニショベル','在庫・仕様・状態に応じて価格をご案内する商品です。詳しい価格はLINEからメールを送ってご確認ください。','https://youtu.be/JqDzWHW0vWM','contact','','published','["/assets/kubota-kh012.jpg"]','[{"key":"機械種類","value":"ミニショベル"},{"key":"価格","value":"お問い合わせ"}]','2026-09-09T00:00:00.000Z','2026-09-09T00:00:00.000Z'),
('sold-mini-excavator-example','売約済み｜小型ミニショベル（表示例）','ミニショベル','売約済み商品の表示例です。','https://youtu.be/JqDzWHW0vWM','show','','sold','["/assets/kubota-kh012.jpg"]','[{"key":"機械種類","value":"ミニショベル"},{"key":"販売状態","value":"売約済み"}]','2026-09-09T00:00:00.000Z','2026-09-09T00:00:00.000Z');
