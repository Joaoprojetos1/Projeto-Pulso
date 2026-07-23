-- Pulso — migração 0012: lead da lista de interesse ganha nome e telefone
-- O CTA do site virou "Simulação grátis" e agora capta lead completo (nome,
-- e-mail, telefone) em vez de só e-mail. Colunas nullable para não quebrar os
-- registros antigos (que só têm e-mail) nem a rota antiga.

ALTER TABLE interest_emails ADD COLUMN IF NOT EXISTS name  TEXT;
ALTER TABLE interest_emails ADD COLUMN IF NOT EXISTS phone TEXT;   -- só dígitos, DDD+número
