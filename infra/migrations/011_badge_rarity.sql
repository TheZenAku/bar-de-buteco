-- How rare a badge is (BADGE_RARITIES in packages/shared/src/profile.ts). The rarest is the studded card in the profile.
ALTER TABLE badges ADD COLUMN IF NOT EXISTS rarity text NOT NULL DEFAULT 'common' CHECK(rarity IN ('common','uncommon','rare','epic','legendary'));
