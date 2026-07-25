-- Configurações globais operacionais (chave/valor), controladas pelo operador.
-- Primeiro uso: o "modo teste de assinatura" (ativa sem cobrar, para testes).
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- padrão DESLIGADO: nenhum ambiente nasce em modo teste.
INSERT INTO app_settings (key, value) VALUES ('subscription_test_mode', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;
