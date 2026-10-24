-- Expand-only: administrative controls become a transactional outbox (pending → leased → applied | failed).
-- Every new column has a default, so the previous API (DELETE RETURNING) and world keep working against it.
ALTER TABLE game_controls ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE game_controls ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE game_controls ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE game_controls ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE game_controls ADD COLUMN IF NOT EXISTS applied_at timestamptz;
ALTER TABLE game_controls ADD COLUMN IF NOT EXISTS last_error text;
CREATE INDEX IF NOT EXISTS game_controls_status_created_idx ON game_controls (status, created_at);
