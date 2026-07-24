/**
 * Medição do consumo da IA.
 *
 * Só observa: registra quantos tokens cada chamada à Anthropic gastou, para
 * a voz dos alertas e para a conversa. NÃO muda o comportamento da IA.
 *
 * Regra desta passada: gravamos TODA chamada, inclusive as que o fiscal
 * (grounding) reprovou — o token foi cobrado mesmo quando o texto é descartado.
 * Os números vêm do campo `usage` da resposta da API (input/output tokens).
 */

import { callCostCents } from './prices';
import type { Sql } from '../db';

export type AiUsageKind = 'alert_writer' | 'chat';

/** Consumo de UMA chamada ao modelo. `model` = o modelo que respondeu (res.model). */
export interface AiCallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Coletor entregue a writeAlert/askPulso. Recebe o consumo de CADA chamada ao
 * modelo (uma por tentativa, então também as reprovadas pelo fiscal). É síncrono
 * de propósito: só junta na lista; quem grava no banco é a rota, depois.
 */
export type UsageSink = (usage: AiCallUsage) => void;

/**
 * Grava as linhas de consumo de uma requisição. Best-effort na chamada (a rota
 * embrulha em try/catch): medir NUNCA pode derrubar o alerta ou a conversa.
 */
export async function recordAiUsage(
  sql: Sql,
  companyId: string,
  kind: AiUsageKind,
  usages: AiCallUsage[],
): Promise<void> {
  if (usages.length === 0) return;
  const rows = usages.map((u) => ({
    company_id: companyId,
    kind,
    model: u.model,
    input_tokens: u.inputTokens,
    output_tokens: u.outputTokens,
  }));
  await sql`
    INSERT INTO ai_usage ${sql(rows, 'company_id', 'kind', 'model', 'input_tokens', 'output_tokens')}`;
}

export interface AiUsageRollup {
  companyId: string;
  companyName: string | null;
  kind: AiUsageKind;
  model: string;
  month: string; // 'YYYY-MM'
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Custo estimado em centavos (tokens × tabela de preços dos modelos). */
  costCents: number;
}

/**
 * Agrega o consumo por empresa, tipo, modelo e mês: total de tokens, número de
 * chamadas e custo estimado em R$. Fonte do endpoint interno GET /admin/ai-usage.
 */
export async function aggregateAiUsage(sql: Sql): Promise<AiUsageRollup[]> {
  const rows = await sql`
    SELECT u.company_id,
           c.name                                                    AS company_name,
           u.kind::text                                              AS kind,
           u.model,
           to_char(date_trunc('month', u.created_at), 'YYYY-MM')     AS month,
           count(*)::int                                             AS calls,
           sum(u.input_tokens)::bigint                               AS input_tokens,
           sum(u.output_tokens)::bigint                              AS output_tokens
    FROM ai_usage u
    LEFT JOIN companies c ON c.id = u.company_id
    GROUP BY u.company_id, c.name, u.kind, u.model, month
    ORDER BY month DESC, c.name NULLS LAST, u.kind, u.model`;

  return rows.map((r) => {
    const inputTokens = r.input_tokens as number;
    const outputTokens = r.output_tokens as number;
    return {
      companyId: r.company_id as string,
      companyName: (r.company_name as string | null) ?? null,
      kind: r.kind as AiUsageKind,
      model: r.model as string,
      month: r.month as string,
      calls: r.calls as number,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costCents: callCostCents(r.model as string, inputTokens, outputTokens),
    };
  });
}
