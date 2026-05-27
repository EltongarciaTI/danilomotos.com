-- Danilo Motos — Schema inicial pós-migração Supabase → VPS
-- Compatível com o que existia em produção (10 tabelas + auth + storage_objects)
-- Postgres 16

BEGIN;

-- ============================================================================
-- USERS (Auth) — substitui auth.users do Supabase
-- Mantém hash bcrypt original do Danilo (compatível com bcryptjs no Node)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id           bigserial PRIMARY KEY,
  uuid         uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email        text NOT NULL UNIQUE,
  encrypted_password text NOT NULL,  -- bcrypt $2a$10$...
  email_confirmed_at timestamptz,
  last_sign_in_at    timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- SESSIONS — guarda sessões JWT (revogáveis)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,   -- sha256 do JWT (pra revogar)
  expires_at   timestamptz NOT NULL,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- ============================================================================
-- MOTOS — catálogo principal
-- ============================================================================
CREATE TABLE IF NOT EXISTS motos (
  id           text PRIMARY KEY,
  status       text NOT NULL DEFAULT 'ativo'
                 CHECK (status IN ('ativo','vendida','reservada')),
  titulo       text,
  preco        text,         -- mantido como text por compat (formato BR livre)
  ano          text,
  km           integer,
  cor          text,
  cilindrada   text,
  combustivel  text,
  cambio       text,
  partida      text,
  observacoes  text,
  youtube      text,
  whatsapp_texto text,
  emplacada    boolean DEFAULT false,
  destaque     boolean NOT NULL DEFAULT false,
  observacoes_internas text,
  obs_internas text,
  ordem        integer DEFAULT 999,
  capa_path    text,
  fotos_paths  jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS motos_status_idx ON motos(status);
CREATE INDEX IF NOT EXISTS motos_ordem_idx  ON motos(ordem);

-- ============================================================================
-- MOTORCYCLE_FINANCIALS — preço de compra/venda por moto (1:1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS motorcycle_financials (
  id             bigserial PRIMARY KEY,
  motorcycle_id  text NOT NULL UNIQUE REFERENCES motos(id) ON DELETE CASCADE,
  purchase_price numeric,
  sale_price     numeric,
  sold_at        date,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ============================================================================
-- MOTORCYCLE_INFO — chassis, placa, dono anterior (1:1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS motorcycle_info (
  id                     bigserial PRIMARY KEY,
  motorcycle_id          text NOT NULL UNIQUE REFERENCES motos(id) ON DELETE CASCADE,
  where_purchased        text,
  chassis_number         text,
  plate                  text,
  previous_owner_name    text,
  previous_owner_phone   text,
  previous_owner_address text,
  previous_owner_notes   text,
  purchase_notes         text,
  general_notes          text,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

-- ============================================================================
-- MOTORCYCLE_DOCUMENTS — docs por moto
-- ============================================================================
CREATE TABLE IF NOT EXISTS motorcycle_documents (
  id             bigserial PRIMARY KEY,
  motorcycle_id  text NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  doc_type       text NOT NULL,
  location       text,
  status         text DEFAULT 'pendente'
                   CHECK (status IN ('em_dia','atrasado','pendente')),
  delay_days     integer DEFAULT 0,
  expiry_date    date,
  file_url       text,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS motorcycle_documents_moto_idx ON motorcycle_documents(motorcycle_id);

-- ============================================================================
-- MOTORCYCLE_BUYER — comprador final (1:1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS motorcycle_buyer (
  id             bigserial PRIMARY KEY,
  motorcycle_id  text NOT NULL UNIQUE REFERENCES motos(id) ON DELETE CASCADE,
  buyer_name     text,
  buyer_phone    text,
  buyer_cpf      text,
  buyer_address  text,
  sale_date      date,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ============================================================================
-- MOTORCYCLE_COSTS — custos por moto (peças, manutenção)
-- ============================================================================
CREATE TABLE IF NOT EXISTS motorcycle_costs (
  id             bigserial PRIMARY KEY,
  motorcycle_id  text NOT NULL REFERENCES motos(id) ON DELETE CASCADE,
  description    text NOT NULL,
  amount         numeric NOT NULL CHECK (amount >= 0),
  cost_date      date NOT NULL,
  receipt_url    text,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS motorcycle_costs_moto_idx ON motorcycle_costs(motorcycle_id);

-- ============================================================================
-- FINANCIAL_EXPENSES — despesas business/personal
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_expenses (
  id              bigserial PRIMARY KEY,
  type            text NOT NULL CHECK (type IN ('business','personal')),
  category        text NOT NULL,
  description     text,
  amount          numeric NOT NULL CHECK (amount >= 0),
  payment_method  text,
  expense_date    date NOT NULL,
  receipt_url     text,
  motorcycle_id   text REFERENCES motos(id) ON DELETE SET NULL,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_expenses_date_idx ON financial_expenses(expense_date);

-- ============================================================================
-- FINANCIAL_SALES — vendas registradas
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_sales (
  id              bigserial PRIMARY KEY,
  motorcycle_id   text REFERENCES motos(id) ON DELETE SET NULL,
  sale_price      numeric NOT NULL CHECK (sale_price >= 0),
  payment_method  text,
  sale_date       date NOT NULL,
  receipt_url     text,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_sales_date_idx ON financial_sales(sale_date);

-- ============================================================================
-- FINANCIAL_GOALS — metas mensais
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_goals (
  id                     bigserial PRIMARY KEY,
  month                  integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                   integer NOT NULL,
  business_expense_limit numeric,
  personal_expense_limit numeric,
  profit_goal            numeric,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  UNIQUE(month, year)
);

-- ============================================================================
-- FIXED_EXPENSES — despesas fixas recorrentes
-- ============================================================================
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id              bigserial PRIMARY KEY,
  description     text NOT NULL,
  category        text NOT NULL,
  amount          numeric NOT NULL CHECK (amount >= 0),
  type            text NOT NULL CHECK (type IN ('business','personal')),
  payment_method  text,
  active          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- ============================================================================
-- Trigger: updated_at automático em todas as tabelas com updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='updated_at'
    GROUP BY table_name
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I;
       CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END$$;

COMMIT;
