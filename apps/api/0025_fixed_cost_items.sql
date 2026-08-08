-- Fim da digitação (item 2.7/2.8): o custo fixo deixa de ser perguntado em
-- branco. O motor infere dos lançamentos recorrentes (core/fixed-cost.ts) e o
-- dono CONFIRMA item a item. Guardamos os itens confirmados aqui para o "de onde
-- vem esse número"; a SOMA vira o `companies.declared_fixed_cost_cents` (o que o
-- core já consome). `source` distingue o que veio inferido do que o dono digitou.

CREATE TABLE fixed_cost_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  category     TEXT,
  source       TEXT NOT NULL DEFAULT 'manual',   -- inferred | manual
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fixed_cost_items_company ON fixed_cost_items (company_id);
