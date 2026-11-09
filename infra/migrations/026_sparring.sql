-- Zeca's sparring (docs/sistemas/zeca.md): where each player is on the ladder of three fights, and when they last won a prize.
-- Expand-only: a new table, nothing existing changes. A player with no row is on the first step with no wait.
CREATE TABLE IF NOT EXISTS sparring_progress (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier smallint NOT NULL DEFAULT 0 CHECK(tier >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK(wins >= 0),
  last_win_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
