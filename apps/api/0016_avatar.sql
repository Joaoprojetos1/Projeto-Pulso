-- Foto do avatar do negócio (opcional).
--
-- Guardada como bytes no próprio registro da empresa: o dono envia a foto do
-- app (já reduzida para 256px) e nós devolvemos como data URI. É pequena e
-- pessoal; não justifica tabela/armazenamento externo no piloto.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS avatar_data bytea,
  ADD COLUMN IF NOT EXISTS avatar_mime text;
