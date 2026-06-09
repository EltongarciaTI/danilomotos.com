-- ============================================================
-- DANILO MOTOS — SQL para rodar no Supabase SQL Editor
-- Execute cada bloco na ordem. Blocos são idempotentes
-- (IF NOT EXISTS / DO NOTHING), seguro rodar mais de uma vez.
-- ============================================================


-- ============================================================
-- 1. financial_expenses — colunas novas usadas pelo dashboard
-- ============================================================

-- Campo: se o gasto é recorrente (usado no filtro da Visão Geral)
ALTER TABLE financial_expenses
  ADD COLUMN IF NOT EXISTS recorrente BOOLEAN DEFAULT FALSE;

-- Campo: data de vencimento do gasto
ALTER TABLE financial_expenses
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Campo: status de pagamento ('pendente', 'pago', 'atrasado')
ALTER TABLE financial_expenses
  ADD COLUMN IF NOT EXISTS paid_status TEXT DEFAULT 'pago';

-- Índice para filtros por mês/ano (melhora performance da Visão Geral)
CREATE INDEX IF NOT EXISTS idx_fin_exp_date
  ON financial_expenses (expense_date);

CREATE INDEX IF NOT EXISTS idx_fin_exp_type_date
  ON financial_expenses (type, expense_date);


-- ============================================================
-- 2. motorcycle_financials — colunas novas
-- ============================================================

-- Campo: valor de compra da moto (usado no modal Registrar Venda)
ALTER TABLE motorcycle_financials
  ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12,2);

-- Campo: data em que a moto foi vendida
ALTER TABLE motorcycle_financials
  ADD COLUMN IF NOT EXISTS sold_at DATE;

-- Campo: controle de atualização
ALTER TABLE motorcycle_financials
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Índice por moto
CREATE INDEX IF NOT EXISTS idx_moto_fin_motorcycle
  ON motorcycle_financials (motorcycle_id);


-- ============================================================
-- 3. fixed_expenses — tabela de gastos fixos recorrentes
--    (só cria se ainda não existir)
-- ============================================================

CREATE TABLE IF NOT EXISTS fixed_expenses (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT    NOT NULL DEFAULT 'business',  -- 'business' | 'personal'
  category    TEXT    NOT NULL,
  description TEXT    NOT NULL,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: apenas usuários autenticados acessam
ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fixed_expenses' AND policyname = 'auth_users_all'
  ) THEN
    CREATE POLICY auth_users_all ON fixed_expenses
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;


-- ============================================================
-- 4. RLS — garantir que financial_expenses e motorcycle_financials
--    só sejam acessados por usuários autenticados
-- ============================================================

-- financial_expenses
ALTER TABLE financial_expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'financial_expenses' AND policyname = 'auth_users_all'
  ) THEN
    CREATE POLICY auth_users_all ON financial_expenses
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- motorcycle_financials
ALTER TABLE motorcycle_financials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'motorcycle_financials' AND policyname = 'auth_users_all'
  ) THEN
    CREATE POLICY auth_users_all ON motorcycle_financials
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- motos
ALTER TABLE motos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'motos' AND policyname = 'auth_users_all'
  ) THEN
    CREATE POLICY auth_users_all ON motos
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END
$$;


-- ============================================================
-- 5. VERIFICAÇÃO FINAL — confira se tudo foi criado
-- ============================================================

-- Lista colunas de financial_expenses
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'financial_expenses'
ORDER BY ordinal_position;

-- Lista colunas de motorcycle_financials
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'motorcycle_financials'
ORDER BY ordinal_position;

-- Confirma que fixed_expenses existe e lista estrutura
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'fixed_expenses'
ORDER BY ordinal_position;

-- Total de gastos fixos ativos (deve bater com tela Gastos Fixos)
SELECT
  COUNT(*) FILTER (WHERE active = true) AS ativos,
  COUNT(*) FILTER (WHERE active = false) AS inativos,
  SUM(amount) FILTER (WHERE active = true) AS total_ativo
FROM fixed_expenses;
