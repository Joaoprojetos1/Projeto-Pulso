-- Telefone (WhatsApp) do negócio: informado no cadastro, canal dos avisos
-- futuros e contato do operador no painel. Guardado só com dígitos (DDD + número).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT;
