-- The custom character creator is retired; players wear skins only. Nathan is the free default skin.
UPDATE user_profiles SET equipped_skin='nathan' WHERE equipped_skin='custom';
ALTER TABLE user_profiles ALTER COLUMN equipped_skin SET DEFAULT 'nathan';
ALTER TABLE user_profiles DROP COLUMN IF EXISTS character_config;
