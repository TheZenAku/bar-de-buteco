-- Estado e rastreabilidade da EMPRESA BRASIL. Expansiva e reexecutável.
CREATE TABLE IF NOT EXISTS factory_slots (
  marker text PRIMARY KEY,
  material text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  capacity integer NOT NULL DEFAULT 18,
  level_m real NOT NULL DEFAULT 0,
  pallet_id text,
  batch_id text,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factory_slots_material CHECK (material IN ('MALTE','MIX','PRODUTO')),
  CONSTRAINT factory_slots_quantity CHECK (quantity >= 0 AND quantity <= capacity)
);

CREATE TABLE IF NOT EXISTS factory_pallets (
  id text PRIMARY KEY,
  material text NOT NULL,
  quantity integer NOT NULL,
  batch_id text,
  location text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factory_pallets_material CHECK (material IN ('MALTE','MIX','PRODUTO')),
  CONSTRAINT factory_pallets_quantity CHECK (quantity >= 0 AND quantity <= 18)
);
CREATE INDEX IF NOT EXISTS factory_pallets_location_idx ON factory_pallets (location);

CREATE TABLE IF NOT EXISTS factory_orders (
  id text PRIMARY KEY,
  kind text NOT NULL,
  material text NOT NULL,
  pallets integer NOT NULL,
  price integer NOT NULL,
  status text NOT NULL DEFAULT 'open',
  accepted_by text,
  due_at timestamptz,
  request_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factory_orders_kind CHECK (kind IN ('purchase','sale')),
  CONSTRAINT factory_orders_material CHECK (material IN ('MALTE','MIX','PRODUTO')),
  CONSTRAINT factory_orders_status CHECK (status IN ('open','accepted','completed','cancelled','expired')),
  CONSTRAINT factory_orders_values CHECK (pallets > 0 AND price >= 0)
);
CREATE INDEX IF NOT EXISTS factory_orders_status_due_idx ON factory_orders (status,due_at);

CREATE TABLE IF NOT EXISTS factory_batches (
  id text PRIMARY KEY,
  status text NOT NULL,
  tank integer,
  recipe jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality integer NOT NULL DEFAULT 100,
  yield real NOT NULL DEFAULT 0,
  produced_bags integer NOT NULL DEFAULT 0,
  discarded_kg real NOT NULL DEFAULT 0,
  operators jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  penalties jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT factory_batches_quality CHECK (quality >= 0 AND quality <= 100)
);
CREATE INDEX IF NOT EXISTS factory_batches_started_idx ON factory_batches (started_at DESC);

CREATE TABLE IF NOT EXISTS factory_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  actor_id text,
  resource text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factory_events_severity CHECK (severity IN ('info','warning','alarm','critical'))
);
CREATE INDEX IF NOT EXISTS factory_events_created_idx ON factory_events (created_at DESC);
CREATE INDEX IF NOT EXISTS factory_events_actor_idx ON factory_events (actor_id,created_at DESC);

CREATE TABLE IF NOT EXISTS factory_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_runtime (
  id text PRIMARY KEY,
  state jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS factory_ledger (
  request_id text PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  resource text NOT NULL,
  delta jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
