-- The collection's cards and skills (docs/sistemas/skins.md). Skills are bought now: what a player owns is here, and they work in every variant of the character.
CREATE TABLE IF NOT EXISTS skill_inventory (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,skill_id)
);
-- What the administration changed on a card or skill (`skin:<id>`, `skill:<id>`, the price table's keys). Without a row, the code's defaults stand; the price is in economy_prices.
CREATE TABLE IF NOT EXISTS skin_catalog (
  key text PRIMARY KEY CHECK(key ~ '^(skin|skill):[a-z0-9-]+$'),
  rarity text NOT NULL CHECK(rarity IN ('common','uncommon','rare','epic','legendary')),
  description text NOT NULL CHECK(length(description) BETWEEN 3 AND 160),
  availability text NOT NULL DEFAULT 'sale' CHECK(availability IN ('sale','closed','hidden')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text REFERENCES users(id)
);
