-- WhatsApp: liga um telefone (so digitos, com pais) a uma empresa. E o opt-in do
-- dono para conversar/receber avisos pelo WhatsApp. Um telefone pertence a uma
-- empresa (phone UNIQUE); resolve a mensagem recebida -> empresa -> cerebro unico.
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone        TEXT NOT NULL UNIQUE,
  opted_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_contacts_company_idx ON whatsapp_contacts (company_id);

-- Idempotencia: a Meta reentrega o webhook quando nao recebe 200 a tempo. Guardar
-- o id da mensagem ja processada evita responder/gravar em duplicidade.
CREATE TABLE IF NOT EXISTS whatsapp_inbound (
  message_id   TEXT PRIMARY KEY,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
