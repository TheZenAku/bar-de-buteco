ALTER TABLE player_vehicles ADD COLUMN IF NOT EXISTS fuel double precision NOT NULL DEFAULT 100;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='player_vehicles_fuel_check' AND conrelid='player_vehicles'::regclass) THEN
    ALTER TABLE player_vehicles ADD CONSTRAINT player_vehicles_fuel_check CHECK (fuel >= 0 AND fuel <= 100);
  END IF;
END $$;
