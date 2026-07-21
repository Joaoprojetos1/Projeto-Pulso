-- Pulso — migração 0004: contas PREVISTAS (camada de planejamento do dono)
--
-- SEPARAÇÃO INVIOLÁVEL: esta tabela é a camada PREVISTO (o que o dono planeja).
-- Ela NUNCA se mistura com `entries` (a camada REALIZADO, a verdade do extrato).
-- Uma conta prevista só "vira verdade" ao ser confirmada (graduação): aí
-- guardamos a data real (confirmed_on) — a diferença prevista×real é o que,
-- mais adiante, ensina o atraso de cada cliente.
--
-- Futuro: integrações (maquininha, API) preencherão o REALIZADO automaticamente.
-- O cadastro manual continua aqui, no PREVISTO. Por isso as camadas já nascem
-- separadas — a integração pluga sem refatorar.

CREATE TYPE planned_status  AS ENUM ('prevista', 'realizada');
CREATE TYPE recurrence_kind AS ENUM ('none', 'monthly');

CREATE TABLE planned_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  kind         entry_kind NOT NULL,                 -- receivable (a receber) | payable (a pagar)
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  due_on       DATE NOT NULL,                       -- data PREVISTA
  counterparty TEXT,                                -- cliente (a receber) ou fornecedor (a pagar)
  category     TEXT,                                -- folha, fornecedor, imposto, aluguel...
  recurrence   recurrence_kind NOT NULL DEFAULT 'none',  -- avulsa = none; recorrente = monthly

  status       planned_status NOT NULL DEFAULT 'prevista',
  confirmed_on DATE,                                -- data REAL na graduação (só quando 'realizada')

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX planned_entries_company ON planned_entries (company_id, due_on);
