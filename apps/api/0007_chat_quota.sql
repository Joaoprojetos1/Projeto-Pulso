-- Cota mensal de perguntas do chat, por empresa.
--
-- A IA custa por chamada. A cota protege o custo sem punir o dono: ao estourar,
-- a conversa avisa com clareza e diz quando renova; os alertas e o painel NÃO
-- dependem da cota e seguem funcionando.
--
-- O valor por plano será definido depois — aqui fica só a coluna configurável
-- por empresa (padrão 50).
--
-- A CONTAGEM reaproveita a tabela `ai_usage` criada na 0006 (metering):
-- contamos as linhas com kind = 'chat' do mês corrente. O alerta semanal é
-- gravado lá como kind = 'alert_writer', então NUNCA entra na cota.

ALTER TABLE companies
  ADD COLUMN chat_quota_monthly INTEGER NOT NULL DEFAULT 50
  CHECK (chat_quota_monthly >= 0);
