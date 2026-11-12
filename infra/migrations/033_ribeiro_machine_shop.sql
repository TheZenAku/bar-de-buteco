-- Ribeiro Usinagem shares HighCargo's order and shipment ledger with EMPRESA BRASIL.
-- Extend only the purchase-order vocabulary; factory rack constraints stay unchanged.
ALTER TABLE factory_orders DROP CONSTRAINT IF EXISTS factory_orders_kind;
ALTER TABLE factory_orders ADD CONSTRAINT factory_orders_kind
  CHECK (kind IN ('purchase','ribeiro-purchase','sale'));

ALTER TABLE factory_orders DROP CONSTRAINT IF EXISTS factory_orders_material;
ALTER TABLE factory_orders ADD CONSTRAINT factory_orders_material
  CHECK (material IN ('MALTE','MIX','PRODUTO','ACO','ALUMINIO','POLIMERO','MOLAS'));
