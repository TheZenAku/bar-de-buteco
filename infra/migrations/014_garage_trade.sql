-- Garages, plates and keys (docs/sistemas/garagem.md) and trades between players (docs/sistemas/troca.md).
-- A vehicle stops being "the model this player has" and becomes a thing of its own, with an id and a plate. Its one owner column is also its key: there is no second copy of a key to duplicate.
-- Every step can run again on a database that already has it: a legacy baseline replays all the migrations.
ALTER TABLE player_vehicles ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE player_vehicles ADD COLUMN IF NOT EXISTS plate text;
-- Bikes bought before this keep their state and get a plate from their place in line: HLD plus a counter, unique among themselves.
WITH numbered AS (SELECT user_id,model,row_number() OVER (ORDER BY bought_at,user_id,model)-1 AS n FROM player_vehicles WHERE id IS NULL)
UPDATE player_vehicles AS vehicle SET
  id=gen_random_uuid()::text,
  plate='HLD'||((numbered.n/2600)%10)::text||chr(65+((numbered.n/100)%26)::int)||lpad((numbered.n%100)::text,2,'0')
FROM numbered WHERE vehicle.id IS NULL AND vehicle.user_id=numbered.user_id AND vehicle.model=numbered.model;
ALTER TABLE player_vehicles DROP CONSTRAINT IF EXISTS player_vehicles_plate_key;
ALTER TABLE player_vehicles DROP CONSTRAINT IF EXISTS player_vehicles_pkey;
ALTER TABLE player_vehicles ALTER COLUMN id SET NOT NULL;
ALTER TABLE player_vehicles ALTER COLUMN plate SET NOT NULL;
ALTER TABLE player_vehicles ADD PRIMARY KEY (id);
ALTER TABLE player_vehicles ADD CONSTRAINT player_vehicles_plate_key UNIQUE (plate);
CREATE INDEX IF NOT EXISTS player_vehicles_owner_idx ON player_vehicles(user_id,bought_at);
-- One row per trade that happened, written in the same transaction as what it moved: a retry finds it and changes nothing. No foreign keys: it outlives the accounts, as a record.
CREATE TABLE IF NOT EXISTS trades (
  id text PRIMARY KEY,
  user_a text NOT NULL,
  user_b text NOT NULL,
  offer_a jsonb NOT NULL,
  offer_b jsonb NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(user_a<>user_b)
);
CREATE INDEX IF NOT EXISTS trades_user_a_idx ON trades(user_a,created_at DESC);
CREATE INDEX IF NOT EXISTS trades_user_b_idx ON trades(user_b,created_at DESC);
