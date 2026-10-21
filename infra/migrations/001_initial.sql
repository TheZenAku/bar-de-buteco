CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY, username text NOT NULL UNIQUE, email text NOT NULL UNIQUE,
  password_hash text NOT NULL, role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL, avatar_config jsonb NOT NULL DEFAULT '{"color":"#cf7549"}'::jsonb
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, blocked_id), CHECK(user_id <> blocked_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY, reporter_id text NOT NULL REFERENCES users(id),
  user_id text NOT NULL REFERENCES users(id), reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id text PRIMARY KEY, actor_id text NOT NULL REFERENCES users(id), user_id text REFERENCES users(id),
  action text NOT NULL, reason text NOT NULL, expires_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_user_idx ON moderation_actions(user_id, action);
CREATE TABLE IF NOT EXISTS game_statistics (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  blackjack_wins integer NOT NULL DEFAULT 0, blackjack_losses integer NOT NULL DEFAULT 0,
  blackjack_draws integer NOT NULL DEFAULT 0, games_played integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS game_results (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS game_controls (
  id text PRIMARY KEY, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), acknowledged boolean NOT NULL DEFAULT false
);
