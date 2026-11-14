-- Remove the old /armas test kit from every account. Real Ribeiro weapons and parts are preserved.
DELETE FROM weapon_parts WHERE source = 'teste';
DELETE FROM weapon_arsenal WHERE source = 'teste';

-- New rows must always state a real origin; keep a safe production default for older writers.
ALTER TABLE weapon_parts ALTER COLUMN source SET DEFAULT 'ribeiro';
ALTER TABLE weapon_arsenal ALTER COLUMN source SET DEFAULT 'ribeiro';
