-- Segmento padrão: 'geral' (era 'clinica', herança do MVP de clínicas).
--
-- DEFEITO QUE ISTO CORRIGE: toda empresa nova nascia como CLÍNICA até o dono
-- escolher o segmento. Enquanto isso o produto mostrava pergunta de clínica no
-- diagnóstico de gestão, indicador de clínica no painel e — depois da leitura de
-- relatórios por arquivo — pediria à IA os CAMPOS DE CLÍNICA para um comércio.
-- Chutar o segmento é o mesmo erro de chutar um número.
--
-- O genérico ('geral', GENERIC_NICHE no core) roda só o núcleo universal: nada
-- de setor aparece até o dono dizer a que setor pertence, na esteira.
--
-- Só o DEFAULT muda: as empresas existentes ficam como estão (quem escolheu
-- 'clinica' de verdade continua clínica; não dá para distinguir do padrão antigo
-- olhando o banco, e sobrescrever apagaria escolha real).

ALTER TABLE companies ALTER COLUMN niche SET DEFAULT 'geral';
