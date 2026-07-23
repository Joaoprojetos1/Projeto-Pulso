import type { FastifyInstance } from 'fastify';

import { aggregateAiUsage } from '../ai/usage';
import type { Sql } from '../db';

/**
 * Rotas internas de operação. NÃO são para o app nem para o cliente final.
 *
 * Guarda simples: se PULSO_ADMIN_TOKEN estiver definido no ambiente, exige o
 * header `x-admin-token` batendo com ele. Sem a variável (dev/teste), fica
 * aberta — não há PII nem dado financeiro aqui, só contagem de tokens.
 */
export function registerAdmin(app: FastifyInstance, sql: Sql) {
  app.get('/admin/ai-usage', async (req, reply) => {
    const required = process.env.PULSO_ADMIN_TOKEN;
    if (required && req.headers['x-admin-token'] !== required) {
      return reply.code(401).send({ error: 'Acesso restrito.' });
    }

    const usage = await aggregateAiUsage(sql);
    return { usage };
  });
}
