-- Logística e finanças da EMPRESA BRASIL: cargas dos caminhões dos motoristas e o cofre da cidade. Expansiva e reexecutável.
CREATE TABLE IF NOT EXISTS city_treasury (
  id text PRIMARY KEY,
  balance bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO city_treasury (id, balance) VALUES ('city', 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS city_treasury_ledger (
  id text PRIMARY KEY,
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  reason text NOT NULL,
  ref text,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS city_treasury_ledger_created_idx ON city_treasury_ledger (created_at DESC);

CREATE TABLE IF NOT EXISTS factory_shipments (
  id text PRIMARY KEY,
  kind text NOT NULL,
  status text NOT NULL,
  vehicle_id text NOT NULL,
  plate text NOT NULL DEFAULT '',
  driver_id text NOT NULL,
  loader_id text NOT NULL DEFAULT '',
  material text NOT NULL,
  pallets integer NOT NULL,
  bags integer NOT NULL,
  order_id text,
  dest_x double precision NOT NULL DEFAULT 0,
  dest_z double precision NOT NULL DEFAULT 0,
  dest_label text NOT NULL DEFAULT '',
  distance_m integer NOT NULL DEFAULT 0,
  gross integer NOT NULL DEFAULT 0,
  tax integer NOT NULL DEFAULT 0,
  staff integer NOT NULL DEFAULT 0,
  owner_share integer NOT NULL DEFAULT 0,
  freight integer NOT NULL DEFAULT 0,
  owner_id text NOT NULL DEFAULT '',
  request_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  departed_at timestamptz,
  delivered_at timestamptz,
  CONSTRAINT factory_shipments_kind CHECK (kind IN ('sale','purchase')),
  CONSTRAINT factory_shipments_status CHECK (status IN ('loaded','in_transit','to_supplier','returning','delivered','cancelled')),
  CONSTRAINT factory_shipments_values CHECK (pallets > 0 AND bags > 0 AND gross >= 0 AND tax >= 0 AND staff >= 0 AND owner_share >= 0 AND freight >= 0)
);
CREATE INDEX IF NOT EXISTS factory_shipments_status_idx ON factory_shipments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS factory_shipments_driver_idx ON factory_shipments (driver_id, status);
