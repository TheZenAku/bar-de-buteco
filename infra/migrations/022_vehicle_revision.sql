-- Administrative changes must survive delayed saves from a running world.
ALTER TABLE player_vehicles ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
