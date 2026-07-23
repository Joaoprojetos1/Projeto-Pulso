-- Recuperação de senha: token de uso único, com expiração.
--
-- Guardamos só o sha256 do token (o valor cru vai por e-mail e nunca é
-- persistido), igual aos tokens de sessão. Um token vale por 1 hora e some do
-- jogo assim que é usado (used_at).

CREATE TABLE password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,               -- sha256 do token; o cru só existe no e-mail
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,                  -- preenchido na redefinição (uso único)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_tokens_hash ON password_reset_tokens (token_hash);
