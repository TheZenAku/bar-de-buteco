CREATE TABLE IF NOT EXISTS item_inventory (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS inventory_ledger (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK(quantity <> 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_ledger_user_idx ON inventory_ledger(user_id,created_at DESC);
