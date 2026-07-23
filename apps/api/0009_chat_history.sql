-- Memória da conversa: cada pergunta do dono e cada resposta do Pulso.
--
-- A IA deixa de olhar só o snapshot atual e passa a lembrar a conversa. O
-- contexto do askPulso inclui as últimas N mensagens daqui (mais os alertas
-- recentes e o diagnóstico atual/anterior, que já vivem em outras tabelas).
--
-- Numerada 0009 porque a 0008 já é o diagnóstico (o prompt pedia "0008", mas
-- esse número foi ocupado antes).

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_company_created ON chat_messages (company_id, created_at);
