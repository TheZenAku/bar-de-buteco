-- Owning a firearm no longer puts it directly on the weapon wheel. Players explicitly equip the weapons they want available there.
ALTER TABLE weapon_arsenal
  ADD COLUMN IF NOT EXISTS equipped boolean NOT NULL DEFAULT false;
