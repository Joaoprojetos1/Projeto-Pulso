-- Índices para as consultas reais (todas idempotentes).
-- Memória do chat: SELECT ... WHERE company_id = ? ORDER BY created_at DESC.
CREATE INDEX IF NOT EXISTS chat_messages_company_created ON chat_messages (company_id, created_at DESC);
-- Uso de IA por empresa/mês (economia, dossiê, /admin/ai-usage).
CREATE INDEX IF NOT EXISTS ai_usage_company_created ON ai_usage (company_id, created_at);
-- Contas previstas: listagem e projeção por empresa, ordenadas por vencimento.
CREATE INDEX IF NOT EXISTS planned_entries_company_due ON planned_entries (company_id, due_on);
-- Dados enviados (dossiê): imports por empresa, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS imports_company_imported ON imports (company_id, imported_at DESC);
