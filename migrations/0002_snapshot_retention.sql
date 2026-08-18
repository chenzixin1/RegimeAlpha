ALTER TABLE snapshots ADD COLUMN deactivated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_snapshots_deactivated_at
  ON snapshots(deactivated_at);
