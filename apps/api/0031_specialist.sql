-- Ivo - migracao 0031: bancada do especialista
--
-- O especialista (consultor financeiro responsavel pelo produto) passa a ensinar
-- o Ivo sem depender de publicar codigo. Duas coisas, e so texto:
--
--  1. ORIENTACOES: o que recomendar em cada situacao (geral, por estagio do
--     diagnostico, por aviso). Entram no prompt da IA.
--  2. EXEMPLOS: respostas que ele corrigiu ("eu diria assim"). Entram na conversa
--     como referencia de tom e de raciocinio.
--
-- NADA aqui e numero de empresa nem formula: o calculo segue 100% no core, e os
-- fiscais (numeros e juizo) continuam conferindo o texto final por fora.
--
-- Rascunho x publicado: `body` e o que esta sendo editado; `published_body` e o
-- que a IA usa de verdade. Publicar copia um no outro e grava uma versao, para
-- dar para voltar atras.

CREATE TABLE specialist_guidance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          TEXT NOT NULL CHECK (scope IN ('geral', 'estagio', 'aviso')),
  scope_key      TEXT NOT NULL DEFAULT '',  -- '' (geral) | estagio | ruleKey do aviso
  niche          TEXT,                      -- NULL = vale para todos os segmentos
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,             -- rascunho (o que esta na tela)
  published_body TEXT,                      -- o que a IA usa; NULL = desligada
  published_at   TIMESTAMPTZ,
  updated_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX specialist_guidance_scope ON specialist_guidance (scope, scope_key);

-- Uma linha por publicacao: e o historico que permite desfazer.
CREATE TABLE specialist_guidance_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guidance_id  UUID NOT NULL REFERENCES specialist_guidance(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX specialist_guidance_versions_guidance
  ON specialist_guidance_versions (guidance_id, published_at DESC);

-- Respostas corrigidas pelo especialista. `original_answer` guarda o que a IA
-- tinha dito (para ele ver o antes e o depois); `answer` e a versao dele.
CREATE TABLE specialist_examples (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question        TEXT NOT NULL,
  original_answer TEXT,
  answer          TEXT NOT NULL,
  niche           TEXT,                     -- NULL = vale para todos os segmentos
  stage           TEXT,                     -- estagio da empresa quando foi corrigido
  active          BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX specialist_examples_active ON specialist_examples (active, created_at DESC);
