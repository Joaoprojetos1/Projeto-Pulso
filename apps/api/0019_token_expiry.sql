-- Tokens de sessão passam a expirar (segurança). Padrão: 60 dias a partir da
-- criação. Tokens antigos ganham validade a partir do created_at. A checagem de
-- validade fica no auth.ts (WHERE expires_at > now()).
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '60 days');
UPDATE auth_tokens SET expires_at = created_at + interval '60 days' WHERE expires_at IS NULL;
