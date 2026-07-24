import type { FastifyInstance } from 'fastify';

import type { ChatModel, ChatTurn } from '../ai/chat';
import type { Sql } from '../db';
import { companyParamsSchema } from '../http';
import { QuotaExceededError, quotaExceededPayload } from '../quota';
import { CompanyNotFoundError, converse } from '../services/conversation';
import { requireAdmin } from './admin/guard';

/**
 * Canal APP da conversa — uma casca fina. Todo o cérebro (contexto, memória,
 * fiscal, cota, gravação, medição) vive em services/conversation.ts, para o
 * WhatsApp ser só mais um canal do MESMO cérebro, nunca uma segunda IA.
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

/** A pergunta atual é a última mensagem; a memória (histórico) vem do servidor. */
export function currentUserMessage(messages: ChatTurn[]): string {
  return messages[messages.length - 1]?.content ?? '';
}

export function registerChat(app: FastifyInstance, sql: Sql, chatModel: ChatModel | null = null) {
  app.post<{ Params: { id: string }; Body: ChatBody }>(
    '/companies/:id/chat',
    { schema: { params: companyParamsSchema, body: chatBodySchema } },
    async (req, reply) => {
      // canal APP legado por id: superfície de operador (o dono usa /me/chat)
      const admin = await requireAdmin(sql, req, reply);
      if (!admin) return reply;
      try {
        return await converse(
          { sql, chatModel },
          { companyId: req.params.id, userMessage: currentUserMessage(req.body.messages), channel: 'app' },
        );
      } catch (e) {
        if (e instanceof CompanyNotFoundError) {
          return reply.code(404).send({ error: 'Empresa não encontrada.' });
        }
        if (e instanceof QuotaExceededError) {
          return reply.code(402).send(quotaExceededPayload(e));
        }
        throw e;
      }
    },
  );
}
