-- Pulso — migração 0006: consumo da IA (MEDIÇÃO, não cobrança)
--
-- Registra CADA chamada à API da Anthropic — a voz dos alertas
-- (kind='alert_writer') e a conversa (kind='chat') —, INCLUSIVE as chamadas que
-- o fiscal (grounding) reprovou: o token foi gasto mesmo quando o texto é
-- descartado, então o custo precisa aparecer aqui.
--
-- Só medir. Esta tabela não muda em nada o comportamento da IA; ela só observa.
-- Os valores de input_tokens/output_tokens vêm do campo `usage` da resposta da API.

CREATE TYPE ai_usage_kind AS ENUM ('alert_writer', 'chat');

CREATE TABLE ai_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind          ai_usage_kind NOT NULL,
  model         TEXT NOT NULL,                 -- o modelo que respondeu (res.model)
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_company_created ON ai_usage (company_id, created_at DESC);
