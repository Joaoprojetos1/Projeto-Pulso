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
  name?: string;
  phone?: string;
  source?: string;
}

// só dígitos; celular BR = 10 (fixo) ou 11 (com o 9) após remover formatação
function cleanPhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11 ? digits : null;
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
            name: { type: 'string', maxLength: 120 },
            phone: { type: 'string', maxLength: 30 },
            source: { type: 'string', maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);
      const name = req.body.name?.trim() || null;
      const phone = cleanPhone(req.body.phone);
      // idempotente: o mesmo e-mail não duplica. Se voltar com nome/telefone
      // (ex.: já tinha entrado só com e-mail), completamos o que estiver vazio.
      await sql`
        INSERT INTO interest_emails (email, name, phone, source)
        VALUES (${email}, ${name}, ${phone}, ${req.body.source ?? 'site'})
        ON CONFLICT (email) DO UPDATE
          SET name  = COALESCE(interest_emails.name,  EXCLUDED.name),
              phone = COALESCE(interest_emails.phone, EXCLUDED.phone)`;
      return reply.code(201).send({ ok: true });
    },
  );
}
