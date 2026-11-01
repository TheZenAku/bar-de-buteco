-- The profile window (apps/api/src/profile-service.ts): status message, the skills chosen for each skin, and badges.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS status_message text NOT NULL DEFAULT '' CHECK(length(status_message)<=60);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS skill_loadouts jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS badges (
  id text PRIMARY KEY CHECK(id ~ '^[a-z0-9][a-z0-9-]*$' AND length(id)<=40),
  name text NOT NULL CHECK(length(name) BETWEEN 2 AND 32),
  description text NOT NULL CHECK(length(description) BETWEEN 3 AND 140),
  icon text NOT NULL,
  color text NOT NULL CHECK(color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- shown_at: where the player put it among the six on show; null when it stays in the collection.
CREATE TABLE IF NOT EXISTS user_badges (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id text NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  shown_at smallint CHECK(shown_at BETWEEN 0 AND 5),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,badge_id)
);
CREATE INDEX IF NOT EXISTS user_badges_badge_idx ON user_badges(badge_id);
-- The first badge, for testing the window on the owner's account.
INSERT INTO badges(id,name,description,icon,color) VALUES
  ('fundador','Fundador','Estava aqui antes da primeira gelada ser servida. O bar é dele, e a conta também.','trophy','#fac416')
  ON CONFLICT(id) DO NOTHING;
INSERT INTO user_badges(user_id,badge_id,shown_at)
  SELECT id,'fundador',0 FROM users WHERE lower(email)='rafaelrodrigues-2017@hotmail.com'
  ON CONFLICT(user_id,badge_id) DO NOTHING;
