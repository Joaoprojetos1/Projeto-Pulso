import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { aggregateAiUsage } from '../ai/usage';
import type { Sql } from '../db';

/**
 * Rotas internas de operação. NÃO são para o app nem para o cliente final.
 *
 * Guarda simples: se PULSO_ADMIN_TOKEN estiver definido no ambiente, exige o
 * header `x-admin-token` batendo com ele. Sem a variável (dev/teste), fica
 * aberta — não há PII nem dado financeiro aqui, só contagens.
 */
function adminBlocked(req: FastifyRequest, reply: FastifyReply): boolean {
  const required = process.env.PULSO_ADMIN_TOKEN;
  if (required && req.headers['x-admin-token'] !== required) {
    reply.code(401).send({ error: 'Acesso restrito.' });
    return true;
  }
  return false;
}

export interface PilotMetrics {
  companyId: string;
  companyName: string;
  /** Janela dos últimos 30 dias. As perguntas do piloto: dado chega? dono responde? dono age? */
  last30Days: {
    importsReceived: number; // dado chega?
    alertsSent: number; // o Pulso avisou?
    alertsOpened: number; // o dono viu?
    chatQuestions: number; // o dono responde/interage?
    plannedCreated: number; // o dono planeja?
    plannedConfirmed: number; // o dono age (gradua o previsto)?
  };
}

/** Métricas do piloto por empresa, últimos 30 dias. */
export async function pilotMetrics(sql: Sql): Promise<PilotMetrics[]> {
  const companies = await sql`SELECT id::text AS id, name FROM companies ORDER BY name`;

  const imports = await sql`
    SELECT company_id::text AS id, count(*)::int AS n
    FROM imports WHERE imported_at > now() - interval '30 days'
    GROUP BY company_id`;

  const alerts = await sql`
    SELECT company_id::text AS id,
           count(*) FILTER (WHERE pushed_at IS NOT NULL)::int AS sent,
           count(*) FILTER (WHERE opened_at IS NOT NULL)::int AS opened
    FROM alerts WHERE created_at > now() - interval '30 days'
    GROUP BY company_id`;

  const chat = await sql`
    SELECT company_id::text AS id, count(*)::int AS n
    FROM chat_messages WHERE role = 'user' AND created_at > now() - interval '30 days'
    GROUP BY company_id`;

  const planned = await sql`
    SELECT company_id::text AS id,
           count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS created,
           count(*) FILTER (WHERE status = 'realizada' AND confirmed_on > current_date - 30)::int AS confirmed
    FROM planned_entries
    GROUP BY company_id`;

  const num = (rows: readonly Record<string, unknown>[], id: string, field: string): number => {
    const row = rows.find((r) => r.id === id);
    return row ? (row[field] as number) : 0;
  };

  return companies.map((c) => ({
    companyId: c.id as string,
    companyName: c.name as string,
    last30Days: {
      importsReceived: num(imports, c.id as string, 'n'),
      alertsSent: num(alerts, c.id as string, 'sent'),
      alertsOpened: num(alerts, c.id as string, 'opened'),
      chatQuestions: num(chat, c.id as string, 'n'),
      plannedCreated: num(planned, c.id as string, 'created'),
      plannedConfirmed: num(planned, c.id as string, 'confirmed'),
    },
  }));
}

export function registerAdmin(app: FastifyInstance, sql: Sql) {
  app.get('/admin/ai-usage', async (req, reply) => {
    if (adminBlocked(req, reply)) return reply;
    const usage = await aggregateAiUsage(sql);
    return { usage };
  });

  app.get('/admin/pilot-metrics', async (req, reply) => {
    if (adminBlocked(req, reply)) return reply;
    const metrics = await pilotMetrics(sql);
    return { metrics };
  });
}
