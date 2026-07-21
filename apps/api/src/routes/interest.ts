import type { FastifyInstance } from 'fastify';

import { normalizeEmail } from '../auth';
import type { Sql } from '../db';

/**
 * Lista de interesse do site.
 *
 * Ponto de integração ISOLADO: enquanto o app não está publicado, o CTA do site
 * guarda só o e-mail de quem quer ser avisado. Quando o app publicar, o site
 * troca o CTA pelos links das lojas e esta rota vira a base de aviso de
 * lançamento. Nada aqui toca dados financeiros.
 */

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

interface Body {
  email: string;
  source?: string;
}

export function registerInterest(app: FastifyInstance, sql: Sql) {
  app.post<{ Body: Body }>(
    '/interesse',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
            source: { type: 'string', maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);
      // idempotente: o mesmo e-mail não duplica nem dá erro pro visitante
      await sql`
        INSERT INTO interest_emails (email, source)
        VALUES (${email}, ${req.body.source ?? 'site'})
        ON CONFLICT (email) DO NOTHING`;
      return reply.code(201).send({ ok: true });
    },
  );
}
