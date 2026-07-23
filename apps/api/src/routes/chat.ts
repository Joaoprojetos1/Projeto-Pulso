import type { FastifyInstance } from 'fastify';

import {
  askPulso,
  CHAT_FALLBACK_VERSION,
  NO_DATA_REPLY,
  type ChatModel,
  type ChatTurn,
} from '../ai/chat';
import { recordAiUsage, type AiCallUsage } from '../ai/usage';
import type { Sql } from '../db';
import { companyParamsSchema, findCompany } from '../http';
import { assertWithinChatQuota, QuotaExceededError, quotaExceededPayload } from '../quota';

/**
 * Conversa. A rota carrega o ÚLTIMO snapshot (números já calculados) e
 * os alertas dele, e entrega ao modelo. Lançamentos nunca saem daqui
 * para o prompt — a regra de ouro vale também na conversa.
 */

interface ChatBody {
  messages: ChatTurn[];
}

const chatBodySchema = {
  type: 'object',
  required: ['messages'],
  additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        required: ['role', 'content'],
        additionalProperties: false,
        properties: {
          role: { enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
    },
  },
} as const;

/**
 * Gera a resposta do Pulso para uma empresa (último snapshot + alertas).
 * Fonte única usada pela rota pública e pela rota logada (/me/chat).
 */
export async function replyForCompany(
  sql: Sql,
  chatModel: ChatModel | null,
  company: { id: string; name: string; niche: string },
  messages: ChatTurn[],
): Promise<{ reply: string; modelVersion: string }> {
  const [snapshot] = await sql`
    SELECT id, as_of::text AS as_of, payload
    FROM indicator_snapshots
    WHERE company_id = ${company.id}
    ORDER BY as_of DESC
    LIMIT 1`;

  if (!snapshot) {
    return { reply: NO_DATA_REPLY, modelVersion: CHAT_FALLBACK_VERSION };
  }

  // cota mensal: se a empresa já usou as perguntas do mês, para AQUI —
  // lança QuotaExceededError (a rota devolve 402) e a IA nunca é chamada.
  await assertWithinChatQuota(sql, company.id);

  const alertRows = await sql`
    SELECT rule_key, severity::text AS severity, facts, text_title, text_body
    FROM alerts
    WHERE snapshot_id = ${snapshot.id}
    ORDER BY CASE severity::text WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END`;

  const aiUsage: AiCallUsage[] = [];
  const answer = await askPulso(
    chatModel,
    {
      profile: { name: company.name, niche: company.niche },
      asOf: snapshot.as_of as string,
      indicators: snapshot.payload,
      alerts: alertRows.map((a) => ({
        ruleKey: a.rule_key,
        severity: a.severity,
        facts: a.facts,
        title: a.text_title,
        body: a.text_body,
      })),
    },
    messages,
    (u) => aiUsage.push(u),
  );

  // medição do consumo da IA (best-effort): nunca derruba a conversa
  try {
    await recordAiUsage(sql, company.id, 'chat', aiUsage);
  } catch {
    // medir não pode quebrar responder
  }

  return { reply: answer.text, modelVersion: answer.modelVersion };
}

export function registerChat(app: FastifyInstance, sql: Sql, chatModel: ChatModel | null = null) {
  app.post<{ Params: { id: string }; Body: ChatBody }>(
    '/companies/:id/chat',
    { schema: { params: companyParamsSchema, body: chatBodySchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
      try {
        return await replyForCompany(sql, chatModel, company, req.body.messages);
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          return reply.code(402).send(quotaExceededPayload(e));
        }
        throw e;
      }
    },
  );
}
