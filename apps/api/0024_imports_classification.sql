-- Aba Dados (itens 2.5 e 2.6): o dono envia vários arquivos, de vários meses,
-- cada um CLASSIFICADO por tipo, e vê a lista do que já enviou (transparência do
-- insumo). Aqui damos ao registro de importação o tipo, o nome e a situação.
--
-- `doc_type`: bank_statement | inventory | management | services | card_acquirer
--             | accounting | other
-- `status`:   processed (lido e virou lançamento) | received (guardado, leitor
--             ainda não disponível para o tipo) | error
--
-- period_start/end passam a ser NULOS: um arquivo recebido mas ainda não lido
-- não tem período conhecido (não inventamos um).

ALTER TABLE imports
  ADD COLUMN doc_type TEXT,
  ADD COLUMN filename TEXT,
  ADD COLUMN status   TEXT NOT NULL DEFAULT 'processed';

ALTER TABLE imports ALTER COLUMN period_start DROP NOT NULL;
ALTER TABLE imports ALTER COLUMN period_end   DROP NOT NULL;
