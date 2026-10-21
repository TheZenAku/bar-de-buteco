ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS character_config jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS equipped_skin text NOT NULL DEFAULT 'custom';
CREATE TABLE IF NOT EXISTS wallets (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK(balance>=0)
);
CREATE TABLE IF NOT EXISTS skin_inventory (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skin_id text NOT NULL, acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,skin_id)
);
CREATE TABLE IF NOT EXISTS currency_ledger (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS currency_ledger_user_idx ON currency_ledger(user_id,created_at);
