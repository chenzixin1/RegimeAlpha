PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS update_runs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  requested_end TEXT,
  data_through TEXT,
  generated_at TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_update_runs_started_at
  ON update_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  data_through TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  requested_start TEXT,
  requested_end TEXT,
  chunk_count INTEGER NOT NULL,
  byte_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS active_snapshot (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  activated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshot_chunks (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS snapshot_sections (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  section_json TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, section_key)
);

CREATE TABLE IF NOT EXISTS market_regimes (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  week_end TEXT NOT NULL,
  week_start TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  label_zh TEXT NOT NULL,
  confidence REAL NOT NULL,
  row_json TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, week_end)
);

CREATE INDEX IF NOT EXISTS idx_market_regimes_snapshot_week
  ON market_regimes(snapshot_id, week_end DESC);

CREATE TABLE IF NOT EXISTS assets (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  display_symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL,
  proxy_note TEXT,
  asset_json TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, symbol)
);

CREATE TABLE IF NOT EXISTS asset_weekly_regimes (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  week_end TEXT NOT NULL,
  week_start TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  label_zh TEXT NOT NULL,
  confidence REAL NOT NULL,
  row_json TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, symbol, week_end)
);

CREATE INDEX IF NOT EXISTS idx_asset_weekly_snapshot_symbol_week
  ON asset_weekly_regimes(snapshot_id, symbol, week_end DESC);

CREATE TABLE IF NOT EXISTS preview_candles (
  snapshot_id TEXT PRIMARY KEY,
  week_end TEXT NOT NULL,
  candles_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
