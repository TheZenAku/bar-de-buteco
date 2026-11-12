-- EMPRESA BRASIL como empresa: donos e gerentes, carteira da firma, extrato, compra de matéria-prima e candidaturas. Expansiva e reexecutável.
CREATE TABLE IF NOT EXISTS companies (
  id text PRIMARY KEY,
  name text NOT NULL,
  balance bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_balance CHECK (balance >= 0)
);
INSERT INTO companies (id, name) VALUES ('empresa-brasil', 'EMPRESA BRASIL') ON CONFLICT (id) DO NOTHING;

-- Quem manda na firma. A senha é de cada dono (protege as transferências e compras dele); a administração pode apagá-la.
CREATE TABLE IF NOT EXISTS company_members (
  company_id text NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL,
  password_hash text,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id),
  CONSTRAINT company_members_role CHECK (role IN ('owner','manager'))
);
CREATE INDEX IF NOT EXISTS company_members_user_idx ON company_members (user_id);

CREATE TABLE IF NOT EXISTS company_ledger (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  reason text NOT NULL,
  ref text,
  actor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_ledger_company_idx ON company_ledger (company_id, created_at DESC);

-- A compra de matéria-prima custa à firma: o preço (price) e o imposto por cima dele (tax).
ALTER TABLE factory_orders ADD COLUMN IF NOT EXISTS tax integer NOT NULL DEFAULT 0;
ALTER TABLE factory_orders ADD COLUMN IF NOT EXISTS paid_by text;

-- Candidaturas: quem se candidata fica 'applied' até um dono ou gerente admitir.
ALTER TABLE employments DROP CONSTRAINT IF EXISTS employments_status;
ALTER TABLE employments ADD CONSTRAINT employments_status CHECK (status IN ('hired','resigned','dismissed','applied'));
