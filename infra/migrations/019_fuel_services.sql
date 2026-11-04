-- A reservation is not a debit: balance changes only after the nozzle is docked.
CREATE TABLE IF NOT EXISTS fuel_services (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 budget integer NOT NULL CHECK (budget > 0),
 total integer NOT NULL DEFAULT 0 CHECK (total >= 0),
 settled boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS fuel_services_user_idx ON fuel_services(user_id) WHERE NOT settled;
CREATE OR REPLACE FUNCTION protect_fuel_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.balance < OLD.balance AND NEW.balance < COALESCE((SELECT SUM(budget) FROM fuel_services WHERE user_id=NEW.user_id AND NOT settled),0) THEN
  RAISE EXCEPTION 'Saldo reservado para o abastecimento em andamento.' USING ERRCODE='23514', CONSTRAINT='fuel_wallet_reservation';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fuel_wallet_reservation ON wallets;
CREATE TRIGGER fuel_wallet_reservation BEFORE UPDATE OF balance ON wallets FOR EACH ROW EXECUTE FUNCTION protect_fuel_reservation();
