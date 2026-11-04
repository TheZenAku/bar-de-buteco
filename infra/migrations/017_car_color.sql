ALTER TABLE player_vehicles ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#ccc9c2';
ALTER TABLE player_vehicles ADD CONSTRAINT player_vehicles_color_check CHECK (color ~ '^#[0-9a-fA-F]{6}$');
