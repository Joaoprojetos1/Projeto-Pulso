-- Pulso — migração 0015: planos reais (substituem o "piloto") + assinatura em pt-BR
--
-- Os planos viram uma TABELA editável pelo admin. A cota de chat passa a vir do
-- plano; o override por empresa (chat_quota_monthly) continua e PREVALECE quando
-- preenchido. O subscription_status passa para pt-BR (pendente/ativa/cancelada).
-- Empresas existentes (piloto) migram para o plano Pro, status 'ativa', para
-- nada quebrar. Nada aqui é dado financeiro de cliente.

CREATE TABLE plans (
  id                 TEXT PRIMARY KEY,        -- slug: essencial | pro | premium
  name               TEXT NOT NULL,
  price_cents        INTEGER NOT NULL,
  chat_limit_monthly INTEGER NOT NULL,
  active             BOOLEAN NOT NULL DEFAULT true,
  sort               INTEGER NOT NULL DEFAULT 0
);

INSERT INTO plans (id, name, price_cents, chat_limit_monthly, active, sort) VALUES
  ('essencial', 'Essencial',  9700,  30, true, 1),
  ('pro',       'Pro',       14700, 100, true, 2),
  ('premium',   'Premium',   19700, 300, true, 3);

-- vínculo da empresa ao plano (nullable: conta nova ainda vai escolher)
ALTER TABLE companies ADD COLUMN plan_id TEXT REFERENCES plans(id);

-- cota: o override por empresa passa a ser OPCIONAL (null = usa o limite do plano).
-- O padrão antigo (50) não era um override real, então limpamos para o plano valer.
ALTER TABLE companies ALTER COLUMN chat_quota_monthly DROP DEFAULT;
ALTER TABLE companies ALTER COLUMN chat_quota_monthly DROP NOT NULL;
UPDATE companies SET chat_quota_monthly = NULL WHERE chat_quota_monthly = 50;

-- reconcilia o subscription_status (da 0014: none/active/canceled/past_due) para pt-BR
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_subscription_status_chk;
UPDATE companies SET subscription_status = CASE subscription_status
  WHEN 'active'   THEN 'ativa'
  WHEN 'canceled' THEN 'cancelada'
  WHEN 'past_due' THEN 'cancelada'
  ELSE 'pendente' END;
ALTER TABLE companies ALTER COLUMN subscription_status SET DEFAULT 'pendente';
ALTER TABLE companies ADD CONSTRAINT companies_subscription_status_chk
  CHECK (subscription_status IN ('pendente', 'ativa', 'cancelada'));

-- empresas existentes (piloto) não podem quebrar: viram Pro + ativa
UPDATE companies SET plan_id = 'pro', subscription_status = 'ativa' WHERE plan_id IS NULL;
