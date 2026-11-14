-- Where each character stood on the map and its needs (hp, stamina, hunger, thirst, bladder, drunk, cores, Morte flags), as JSON.
-- Written by the world every few seconds and on leave/shutdown; read when the character joins. Expand-only: a new table.
CREATE TABLE IF NOT EXISTS player_world_state (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
