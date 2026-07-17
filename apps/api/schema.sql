-- Pulso — schema canônico
-- Regra de ouro: dinheiro SEMPRE em centavos (bigint). Nunca float, nunca numeric decimal.
-- Datas de negócio em DATE (sem hora). Timestamps de sistema em TIMESTAMPTZ.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------
-- Empresa cliente do Pulso (a clínica, a padaria)
-- ---------------------------------------------------------------
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  cnpj          TEXT,
  niche         TEXT NOT NULL DEFAULT 'clinica',   -- nicho único no MVP
  -- Custo fixo mensal declarado no onboarding, quando não dá pra inferir
  declared_fixed_cost_cents BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Cada arquivo importado. Nunca sobrescreve: importação é append.
-- Permite reprocessar tudo se uma fórmula mudar.
-- ---------------------------------------------------------------
CREATE TABLE imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,            -- 'afya_csv', 'omie_csv', 'manual_ofx'
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  file_hash     TEXT NOT NULL,            -- evita importar 2x o mesmo arquivo
  row_count     INT NOT NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, file_hash)
);

-- ---------------------------------------------------------------
-- O CORAÇÃO. Lançamento canônico, independente de ERP.
-- Todo parser converte pra cá. Nada além disso entra no core.
-- ---------------------------------------------------------------
CREATE TYPE entry_kind AS ENUM ('receivable', 'payable');
CREATE TYPE cost_type  AS ENUM ('fixed', 'variable');

CREATE TABLE entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id      UUID NOT NULL REFERENCES imports(id)  ON DELETE CASCADE,

  kind           entry_kind NOT NULL,
  amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),  -- sempre positivo; o sinal está em `kind`

  issued_on      DATE NOT NULL,     -- quando o negócio aconteceu (competência)
  due_on         DATE NOT NULL,     -- quando era pra pagar/receber
  settled_on     DATE,              -- quando efetivamente entrou/saiu. NULL = em aberto

  counterparty   TEXT,              -- cliente ou fornecedor. Alimenta concentração.
  category       TEXT,              -- categoria do ERP, crua
  cost_type      cost_type,         -- só para kind='payable'. Alimenta margem e ponto de equilíbrio.

  external_id    TEXT,              -- id no sistema de origem, pra idempotência
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX entries_company_issued ON entries (company_id, issued_on);
CREATE INDEX entries_company_due    ON entries (company_id, due_on);
CREATE INDEX entries_open           ON entries (company_id, kind) WHERE settled_on IS NULL;

-- ---------------------------------------------------------------
-- Saldo bancário. Não dá pra derivar de `entries` com confiança:
-- a empresa tem dinheiro que não veio de lançamento nenhum.
-- ---------------------------------------------------------------
CREATE TABLE cash_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  observed_on   DATE NOT NULL,
  balance_cents BIGINT NOT NULL,          -- pode ser negativo (cheque especial)
  UNIQUE (company_id, observed_on)
);

-- ---------------------------------------------------------------
-- Snapshot dos indicadores. Guarda o resultado E as entradas usadas.
-- É o que permite o Marco auditar e o app mostrar "de onde vem esse número".
-- ---------------------------------------------------------------
CREATE TABLE indicator_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  as_of         DATE NOT NULL,
  core_version  TEXT NOT NULL,            -- versão do packages/core que calculou
  payload       JSONB NOT NULL,           -- { indicator_key: { value, unit, inputs, window } }
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, as_of)
);

-- ---------------------------------------------------------------
-- Alertas. A regra dispara (código); a IA só redige (text_*).
-- ---------------------------------------------------------------
CREATE TYPE severity AS ENUM ('ok', 'warn', 'critical');

CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_id    UUID NOT NULL REFERENCES indicator_snapshots(id) ON DELETE CASCADE,

  rule_key       TEXT NOT NULL,           -- 'cash_runway', 'scissor', 'cycle_worsening'...
  severity       severity NOT NULL,
  facts          JSONB NOT NULL,          -- números que a regra usou. Determinístico.

  text_title     TEXT,                    -- redigido pela IA a partir de `facts`
  text_body      TEXT,
  model_version  TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_at      TIMESTAMPTZ,
  opened_at      TIMESTAMPTZ,             -- métrica 2 do piloto
  acted_at       TIMESTAMPTZ              -- métrica 3 do piloto
);

CREATE INDEX alerts_company_created ON alerts (company_id, created_at DESC);
