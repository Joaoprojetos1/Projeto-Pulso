-- Pulso — migração 0014: assinatura (entitlement) da empresa
-- A venda acontece no SITE (checkout web, sem comissão de loja de app). Quando o
-- pagamento é confirmado — pelo webhook do provedor OU na mão pelo operador (PIX
-- no piloto) — a empresa fica ATIVA num plano, até uma data. O app lê isto e
-- destrava os benefícios. A coluna `plan` já existe (0013, default 'piloto');
-- aqui entram o STATUS e a validade. Colunas idempotentes (não quebram nada).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscribed_until DATE;   -- null = sem validade (ativa até cancelar)

-- garante os valores possíveis do status (só adiciona a checagem se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_subscription_status_chk') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_subscription_status_chk
      CHECK (subscription_status IN ('none', 'active', 'canceled', 'past_due'));
  END IF;
END $$;
