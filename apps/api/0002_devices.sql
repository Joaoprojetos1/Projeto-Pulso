-- Pulso — migração 0002: aparelhos que recebem o aviso (push)
-- Onde o Pulso entrega a notificação "seu caixa pode zerar". Um endereço
-- (push token do Expo) por aparelho. Um dono pode ter mais de um aparelho.

CREATE TABLE device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,      -- ExponentPushToken[...]; o mesmo aparelho nunca duplica
  platform     TEXT,                      -- 'android' | 'ios' (informativo)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX device_tokens_company ON device_tokens (company_id);
