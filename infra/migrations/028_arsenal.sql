-- The firearms' arsenal (docs/sistemas/armas.md): the weapons each player owns with their parts and upgrade levels, the parts owned, and the rounds
-- per calibre. Expand-only: new tables, nothing existing changes. /armas grants the test kit here (source 'teste'), never resetting what is set.
CREATE TABLE IF NOT EXISTS weapon_arsenal (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weapon_id text NOT NULL,
  parts jsonb NOT NULL DEFAULT '{}'::jsonb,
  upgrades jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'teste',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, weapon_id)
);
CREATE TABLE IF NOT EXISTS weapon_parts (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part_id text NOT NULL,
  source text NOT NULL DEFAULT 'teste',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, part_id)
);
CREATE TABLE IF NOT EXISTS weapon_ammo (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caliber text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, caliber)
);
