-- Pulso — migração 0005: lista de interesse (cadastro simples do site)
-- Enquanto o app não está publicado, o CTA do site coleta só o e-mail de quem
-- quer ser avisado. Quando o app publicar, o CTA passa a apontar para as lojas
-- e esta tabela vira a base de aviso de lançamento.

CREATE TABLE interest_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,   -- guardado em minúsculas
  source     TEXT,                   -- de onde veio (ex.: 'site')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
