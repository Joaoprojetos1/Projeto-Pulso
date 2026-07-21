-- Pulso — migração 0003: contas de acesso (login de verdade)
-- Cada dono se cadastra e passa a ter uma conta ligada à sua empresa.
-- Senha nunca é guardada em texto: só o hash (scrypt). Token de sessão também
-- só entra aqui como hash — o token cru vive só no aparelho do dono.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,          -- guardado em minúsculas
  password_hash TEXT NOT NULL,                 -- scrypt: 'salt:derivado' (hex)
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,                 -- sha256 do token; o cru nunca é guardado
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_user ON auth_tokens (user_id);
