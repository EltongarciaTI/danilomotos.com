-- =====================================================
-- DANILO MOTOS — DASHBOARD FINANCEIRA
-- Execute este SQL no Supabase > SQL Editor
-- =====================================================

-- 1) GASTOS (loja e pessoal)
create table if not exists financial_expenses (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('business','personal')),
  category    text not null,
  description text,
  amount      numeric(12,2) not null check (amount >= 0),
  payment_method text,
  expense_date   date not null,
  receipt_url    text,
  motorcycle_id  text references motos(id) on delete set null,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 2) FICHA FINANCEIRA DA MOTO (compra / venda)
create table if not exists motorcycle_financials (
  id            bigint generated always as identity primary key,
  motorcycle_id text not null references motos(id) on delete cascade,
  purchase_price  numeric(12,2),
  sale_price      numeric(12,2),
  sold_at         date,
  notes           text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (motorcycle_id)
);

-- 3) CUSTOS EXTRAS POR MOTO
create table if not exists motorcycle_costs (
  id            bigint generated always as identity primary key,
  motorcycle_id text not null references motos(id) on delete cascade,
  description   text not null,
  amount        numeric(12,2) not null check (amount >= 0),
  cost_date     date not null,
  receipt_url   text,
  created_at    timestamptz default now()
);

-- 4) METAS MENSAIS
create table if not exists financial_goals (
  id                     bigint generated always as identity primary key,
  month                  int not null check (month between 1 and 12),
  year                   int not null,
  business_expense_limit numeric(12,2),
  personal_expense_limit numeric(12,2),
  profit_goal            numeric(12,2),
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique (month, year)
);

-- 5) VENDAS
create table if not exists financial_sales (
  id            bigint generated always as identity primary key,
  motorcycle_id text references motos(id) on delete set null,
  sale_price    numeric(12,2) not null check (sale_price >= 0),
  payment_method text,
  sale_date     date not null,
  receipt_url   text,
  notes         text,
  created_at    timestamptz default now()
);

-- 6) INFORMAÇÕES GERAIS DA MOTO (antigo dono, onde comprou, chassi, placa)
create table if not exists motorcycle_info (
  id                    bigint generated always as identity primary key,
  motorcycle_id         text not null references motos(id) on delete cascade,
  where_purchased       text,
  chassis_number        text,
  plate                 text,
  previous_owner_name   text,
  previous_owner_phone  text,
  previous_owner_address text,
  previous_owner_notes  text,
  purchase_notes        text,
  general_notes         text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  unique (motorcycle_id)
);

-- 7) DOCUMENTOS DA MOTO (CRV, DUT, CRLV, NF — com upload PDF/imagem)
create table if not exists motorcycle_documents (
  id            bigint generated always as identity primary key,
  motorcycle_id text not null references motos(id) on delete cascade,
  doc_type      text not null,
  location      text,
  status        text default 'pendente' check (status in ('em_dia','atrasado','pendente')),
  delay_days    int default 0,
  expiry_date   date,
  file_url      text,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 8) DADOS DO COMPRADOR (preenchido ao vender a moto)
create table if not exists motorcycle_buyer (
  id            bigint generated always as identity primary key,
  motorcycle_id text not null references motos(id) on delete cascade,
  buyer_name    text,
  buyer_phone   text,
  buyer_cpf     text,
  buyer_address text,
  sale_date     date,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (motorcycle_id)
);

-- ── RLS (Row Level Security) ──────────────────────────
alter table financial_expenses       enable row level security;
alter table motorcycle_financials    enable row level security;
alter table motorcycle_costs         enable row level security;
alter table financial_goals          enable row level security;
alter table financial_sales          enable row level security;
alter table motorcycle_info          enable row level security;
alter table motorcycle_documents     enable row level security;
alter table motorcycle_buyer         enable row level security;

create policy "auth_all" on financial_expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on motorcycle_financials
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on motorcycle_costs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on financial_goals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on financial_sales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on motorcycle_info
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on motorcycle_documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on motorcycle_buyer
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Bucket para comprovantes e documentos ────────────
insert into storage.buckets (id, name, public)
values ('financeiro', 'financeiro', false)
on conflict (id) do nothing;

-- Somente autenticados podem fazer upload/download/delete
create policy "auth_upload" on storage.objects
  for insert with check (bucket_id = 'financeiro' and auth.role() = 'authenticated');

create policy "auth_select" on storage.objects
  for select using (bucket_id = 'financeiro' and auth.role() = 'authenticated');

create policy "auth_delete" on storage.objects
  for delete using (bucket_id = 'financeiro' and auth.role() = 'authenticated');

-- 9) GASTOS FIXOS RECORRENTES (templates mensais)
create table if not exists fixed_expenses (
  id             bigint generated always as identity primary key,
  description    text not null,
  category       text not null,
  amount         numeric(12,2) not null check (amount >= 0),
  type           text not null check (type in ('business','personal')),
  payment_method text,
  active         boolean default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

alter table fixed_expenses enable row level security;

create policy "auth_all" on fixed_expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── CORREÇÃO RLS motos (proteger escrita, leitura pública para o site) ──
-- Remove policy padrão permissiva se existir, recria com separação read/write
drop policy if exists "Enable read access for all users" on motos;
drop policy if exists "Allow public read" on motos;

-- Leitura pública (necessário para o site vitrine)
create policy if not exists "public_read" on motos
  for select using (true);

-- Escrita apenas para autenticados
create policy if not exists "auth_write" on motos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── ÍNDICES para performance ──────────────────────────
create index if not exists idx_expenses_date   on financial_expenses(expense_date);
create index if not exists idx_expenses_type   on financial_expenses(type);
create index if not exists idx_sales_date      on financial_sales(sale_date);
create index if not exists idx_costs_moto      on motorcycle_costs(motorcycle_id);
create index if not exists idx_docs_moto       on motorcycle_documents(motorcycle_id);
create index if not exists idx_fixed_active    on fixed_expenses(active);
