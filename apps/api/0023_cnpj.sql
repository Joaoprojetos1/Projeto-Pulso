-- Cadastro da empresa por CNPJ (item 2.3) + sistemas que a empresa usa.
--
-- O dono informa só o CNPJ; o servidor consulta uma API pública (BrasilAPI com
-- fallback para ReceitaWS) e traz razão social, nome fantasia, endereço,
-- situação, CNAE e quadro societário — tudo gravado aqui. O segmento vem
-- sugerido pelo CNAE e o dono confirma. Depois, quais sistemas usa para cada
-- finalidade (contas, estoque, serviços, banco) e em que formato exporta —
-- metadados que orientam o parsing depois.

ALTER TABLE companies
  ADD COLUMN razao_social        TEXT,
  ADD COLUMN nome_fantasia       TEXT,
  ADD COLUMN situacao_cadastral  TEXT,
  ADD COLUMN cnae_principal      TEXT,
  ADD COLUMN cnae_descricao      TEXT,
  ADD COLUMN endereco            JSONB,   -- { logradouro, numero, bairro, municipio, uf, cep }
  ADD COLUMN quadro_societario   JSONB,   -- [ { nome, qualificacao } ]
  ADD COLUMN cnpj_consultado_em  TIMESTAMPTZ;

-- Cache das consultas de CNPJ: a API pública é lenta e tem limite; guardamos o
-- payload NORMALIZADO por CNPJ (só dígitos) para não bater a cada visita.
CREATE TABLE cnpj_cache (
  cnpj          TEXT PRIMARY KEY,        -- 14 dígitos, sem máscara
  data          JSONB NOT NULL,          -- payload já normalizado (fonte única)
  fonte         TEXT NOT NULL,           -- brasilapi | receitaws
  consultado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sistemas que a empresa usa, por FINALIDADE. Orientam o parsing (que formato
-- esperar de cada fonte). Uma linha por finalidade da empresa.
CREATE TABLE company_systems (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purpose       TEXT NOT NULL,   -- payables_receivables | inventory | services | bank
  system_name   TEXT,            -- nome do sistema (campo livre)
  export_format TEXT,            -- pdf | excel_csv | photo | none
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, purpose)
);
