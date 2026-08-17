-- Sócios/contas para a inteligência do motor: aporte de sócio NAO e receita,
-- retirada de sócio NAO e custo (o dinheiro segue no caixa, que vem do banco).
-- A lista PARTE do quadro societario do CNPJ e o dono ACRESCENTA contas PF que
-- nao batem com o nome exato (aporte costuma cair de conta pessoal). O CODIGO
-- casa o nome com a contraparte do lancamento; o DONO confirma a classificacao;
-- so entao o motor deixa de contar. REGRA (provisoria, o especialista valida):
-- pro-labore CONTA como custo; aporte/retirada ficam de fora.

CREATE TABLE company_partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,                 -- sem acento, maiusculas (para casar)
  source          TEXT NOT NULL DEFAULT 'manual',-- cnpj | manual
  note            TEXT,                          -- qualificacao (cnpj) ou observacao do dono
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, normalized_name)
);
CREATE INDEX idx_company_partners_company ON company_partners (company_id);

-- Classificacao de um lancamento em relacao aos socios. NULL = normal (conta).
--   aporte     -> entrada de socio: NAO e receita (fica fora do motor)
--   retirada   -> saida p/ socio: NAO e custo   (fica fora do motor)
--   pro_labore -> remuneracao do socio: CONTA como custo (provisorio; a validar)
--   nao_socio  -> o dono disse que NAO e movimento de socio (nao repropor)
ALTER TABLE entries ADD COLUMN party_class TEXT;
