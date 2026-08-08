-- Alerta de INFORMAÇÃO FALTANTE (recomendação de gestão) — item 4 da revisão.
--
-- Quando a cobertura de dados BLOQUEIA um juízo relevante (ex.: não dá para
-- avaliar a saúde do caixa sem as contas a pagar e a receber), o produto não
-- fica calado nem finge: gera uma recomendação determinística com o que falta,
-- por que importa e o que o dono precisa fazer (o texto vem do core, claims.ts).
--
-- Uma linha por (empresa, tipo de afirmação). `first_recommended_on` guarda a
-- PRIMEIRA vez que recomendamos aquilo — é o que permite o histórico consultável
-- ("há três meses recomendamos que você enviasse as contas a pagar").
-- `resolved_on` marca quando o dado chegou e o juízo deixou de estar bloqueado.

CREATE TABLE missing_info_recommendations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  claim_type           TEXT NOT NULL,          -- cash_health, cash_zero_date, margin, ...
  priority             TEXT NOT NULL,          -- alta | media | baixa
  title                TEXT NOT NULL,          -- o que falta
  why                  TEXT NOT NULL,          -- por que importa
  action               TEXT NOT NULL,          -- o que fazer
  first_recommended_on DATE NOT NULL,          -- primeira vez que recomendamos
  last_seen_on         DATE NOT NULL,          -- snapshot mais recente em que ainda faltava
  resolved_on          DATE,                   -- quando o juízo deixou de estar bloqueado
  UNIQUE (company_id, claim_type)
);

-- consulta quente: as recomendações AINDA abertas de uma empresa
CREATE INDEX idx_missing_info_open
  ON missing_info_recommendations (company_id)
  WHERE resolved_on IS NULL;
