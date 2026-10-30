-- The administration console (apps/api/src/admin-console.ts, apps/api/src/pricing-service.ts):
-- prices changed in the panel, the event log (API and world) and the state of each report.
CREATE TABLE IF NOT EXISTS economy_prices (
  key text PRIMARY KEY CHECK(key ~ '^[a-z]+:[a-z0-9-]+$'),
  value integer NOT NULL CHECK(value >= 0 AND value <= 1000000000),
  updated_by text REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- What happened in the game that no other table records (entries and exits of the bar, shifts, faints, logins).
-- user_id has no foreign key: a log line outlives whatever it mentions.
CREATE TABLE IF NOT EXISTS game_logs (
  id text PRIMARY KEY,
  source text NOT NULL CHECK(source IN ('api','world')),
  event text NOT NULL CHECK(length(event) BETWEEN 1 AND 64),
  user_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_logs_created_idx ON game_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS game_logs_user_idx ON game_logs(user_id,created_at DESC);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by text REFERENCES users(id);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution text;
-- The economy and the log read these tables by time across every account.
CREATE INDEX IF NOT EXISTS currency_ledger_created_idx ON currency_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_ledger_created_idx ON inventory_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_created_idx ON moderation_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports(created_at DESC);
