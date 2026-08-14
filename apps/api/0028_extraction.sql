-- Extração por tipo com IA -> confere (código) -> confirma (dono) -> motor
-- (próxima fatia; decidida com o especialista, ver CLAUDE.md "Exceção controlada").
--
-- Quando o dono envia um arquivo de um tipo EXTRAÍVEL (hoje: folha de pagamento),
-- a IA lê o arquivo só para TRANSCREVER os valores daquele tipo; o CÓDIGO valida
-- (parse BR + faixa) e guarda a PROPOSTA aqui, SEM tocar no motor. O dono confirma
-- ("li R$ X de folha, confere?") e só então o valor entra (folha -> custo fixo).
--
-- `imports.extraction`: a proposta transcrita (só rótulos genéricos + centavos já
--   validados pelo código — NUNCA texto bruto nem PII). NULL quando não houve extração.
-- `imports.status` ganha dois valores:
--   extracted (proposta pronta, aguardando o dono confirmar) | confirmed (aplicada ao motor).
--
-- Sem migração de dados: coluna nova, nulável. Idempotente (roda no boot).

ALTER TABLE imports
  ADD COLUMN IF NOT EXISTS extraction JSONB;
