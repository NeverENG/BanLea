-- BanLea 首批迁移（对应开发计划 §11）
-- 通过 tauri-plugin-sql 在应用启动时执行。

-- 方向 / 学科
CREATE TABLE IF NOT EXISTS domains (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 画像版本（主 harness 用 domain_id = 'global'）
CREATE TABLE IF NOT EXISTS portrait_versions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id      TEXT NOT NULL,
  version        INTEGER NOT NULL,
  portrait_json  TEXT NOT NULL,        -- §4 结构化画像（含 27 维）
  confidence     REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  change_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_portrait_domain_version
  ON portrait_versions (domain_id, version);

-- 证据流（§5）
CREATE TABLE IF NOT EXISTS evidence (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id           TEXT NOT NULL,
  type                TEXT NOT NULL,   -- chat|self_report|quiz|reading|reco_click|reco_skip
  summary             TEXT NOT NULL,
  payload             TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL,
  consumed_in_version INTEGER          -- NULL = 尚未被画像吸收
);
CREATE INDEX IF NOT EXISTS idx_evidence_domain ON evidence (domain_id, created_at);

-- 待读书单 / 已读（§3.1 右栏）
CREATE TABLE IF NOT EXISTS reading_list (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id     TEXT NOT NULL,
  source_id     TEXT,
  title         TEXT NOT NULL,
  url           TEXT,
  kind          TEXT,                  -- article|video|repo|doc
  status        TEXT NOT NULL DEFAULT 'todo',  -- todo|reading|done|later
  added_at      TEXT NOT NULL,
  read_at       TEXT,
  dwell_seconds INTEGER NOT NULL DEFAULT 0
);

-- 推荐流：候选 + 反馈信号（§6）
CREATE TABLE IF NOT EXISTS recommendations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL,         -- learn|read
  topic         TEXT NOT NULL,
  reason        TEXT,
  features_json TEXT NOT NULL DEFAULT '{}',
  score         REAL NOT NULL DEFAULT 0,
  shown_at      TEXT,
  clicked       INTEGER NOT NULL DEFAULT 0,
  dwell_seconds INTEGER NOT NULL DEFAULT 0,
  skipped       INTEGER NOT NULL DEFAULT 0
);

-- 排序算法权重（在线学习状态，§6）
CREATE TABLE IF NOT EXISTS ranker_weights (
  feature    TEXT PRIMARY KEY,
  weight     REAL NOT NULL,
  updated_at TEXT NOT NULL
);

-- 辅导会话（左栏按 domain_id 分块，§3.1）
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id  TEXT NOT NULL,           -- 决定归到左栏哪个方向块 / 哪个子 harness
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 会话消息
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,           -- user|assistant
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages (session_id, created_at);
