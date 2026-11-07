-- The truck's cargo hold: what each vehicle keeps, apart from its owner's backpack (docs/sistemas/caminhao.md).
-- Expand-only: nothing existing changes. The rows follow the vehicle (a sold or traded truck keeps its load).
-- No foreign key on purpose: 014_garage_trade.sql redoes player_vehicles' primary key and must stay re-runnable over a finished
-- database (a legacy baseline does exactly that), which a key depending on that index would stop. HighfoodService.setVehicle clears the
-- rows of a vehicle it takes away.
CREATE TABLE IF NOT EXISTS vehicle_storage (
  vehicle_id text NOT NULL,
  item_id text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(vehicle_id,item_id)
);
