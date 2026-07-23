-- Pulso — migração 0013: área de operação (admin) integrada ao login
--
-- O admin NÃO é um sistema à parte: é um PAPEL do usuário. O mesmo login do
-- dono passa a carregar um papel; só quem for 'admin' alcança as rotas /admin.
-- Papel novo entra como 'owner' por padrão (ninguém vira admin por acidente).
--
-- Também adiciona:
--  - plano da empresa (para o operador editar plano/cota);
--  - marca de demonstração (a área admin nunca deve listar dado de teste como real);
--  - status do lead (a lista de espera do site vira funil: novo -> contatado -> ...);
--  - trilha de auditoria: TODA ação de escrita do admin é registrada aqui.

ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'
  CHECK (role IN ('owner', 'admin'));

ALTER TABLE companies
  ADD COLUMN plan TEXT NOT NULL DEFAULT 'piloto';

ALTER TABLE companies
  ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE interest_emails
  ADD COLUMN status TEXT NOT NULL DEFAULT 'novo'
  CHECK (status IN ('novo', 'contatado', 'convertido', 'descartado'));

-- Trilha de auditoria do admin. Guarda QUEM fez O QUÊ, em qual alvo e com qual
-- payload. Nunca guarda dado financeiro cru nem texto de conversa de cliente.
CREATE TABLE admin_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,          -- ex.: 'company.update', 'company.reprocess'
  target_type   TEXT,                   -- ex.: 'company', 'user', 'lead'
  target_id     TEXT,
  payload       JSONB,                  -- o que mudou (sem PII financeira)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_created ON admin_audit (created_at DESC);
CREATE INDEX admin_audit_admin   ON admin_audit (admin_user_id, created_at DESC);
