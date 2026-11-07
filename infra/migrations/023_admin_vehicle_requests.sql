CREATE TABLE IF NOT EXISTS admin_vehicle_requests (
  id text PRIMARY KEY,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  changed integer NOT NULL,
  skipped integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
