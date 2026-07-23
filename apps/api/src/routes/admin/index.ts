import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { aggregateAiUsage } from '../../ai/usage';
import type { AuthedUser } from '../../auth';
import type { Sql } from '../../db';
import { UUID_PATTERN } from '../../http';
import { notFound, rateLimited, recordAudit, requireAdmin } from './guard';
import { companyDossier, health, leads, overview, pilotMetrics } from './queries';

/**
 * Área de operação (admin). Ferramenta interna para João e Marco.
 *
 * TODA rota exige papel admin (senão 404, ver guard). TODA escrita é auditada.
 * O admin consome só estas rotas — nenhuma lógica financeira vive aqui nem no
 * cliente. Linguagem interna pode ser técnica (é ferramenta de operador).
 */

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

export function registerAdmin(app: FastifyInstance, sql: Sql) {
  // porteiro: rate limit + papel admin. Devolve o admin ou null (já respondeu).
  const gate = async (
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<AuthedUser | null> => {
    if (rateLimited(req, reply)) return null;
    return requireAdmin(sql, req, reply);
  };

  // ---- leitura -----------------------------------------------------------

  app.get('/admin/overview', async (req, reply) => {
    const admin = await gate(req, reply);
    if (!admin) return reply;
    return { companies: await overview(sql) };
  });

  app.get<{ Params: { id: string } }>(
    '/admin/companies/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const dossier = await companyDossier(sql, req.params.id);
      if (!dossier) return notFound(reply);
      return dossier;
    },
  );

  app.get<{ Querystring: { q?: string } }>(
    '/admin/leads',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { q: { type: 'string', maxLength: 120 } },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      return { leads: await leads(sql, req.query.q?.trim() || undefined) };
    },
  );

  app.get('/admin/ai-usage', async (req, reply) => {
    const admin = await gate(req, reply);
    if (!admin) return reply;
    return { usage: await aggregateAiUsage(sql) };
  });

  app.get('/admin/pilot-metrics', async (req, reply) => {
    const admin = await gate(req, reply);
    if (!admin) return reply;
    return { metrics: await pilotMetrics(sql) };
  });

  app.get('/admin/health', async (req, reply) => {
    const admin = await gate(req, reply);
    if (!admin) return reply;
    return await health(sql);
  });

  // ---- escrita (tudo auditado) ------------------------------------------

  app.patch<{ Params: { id: string }; Body: { name?: string; chatQuota?: number; plan?: string } }>(
    '/admin/companies/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            chatQuota: { type: 'integer', minimum: 0, maximum: 100000 },
            plan: { type: 'string', minLength: 1, maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const { name, chatQuota, plan } = req.body;
      if (name === undefined && chatQuota === undefined && plan === undefined) {
        return reply.code(400).send({ error: 'Nada para atualizar.' });
      }

      const [updated] = await sql`
        UPDATE companies SET
          name               = COALESCE(${name ?? null}, name),
          chat_quota_monthly = COALESCE(${chatQuota ?? null}, chat_quota_monthly),
          plan               = COALESCE(${plan ?? null}, plan)
        WHERE id = ${req.params.id}
        RETURNING id::text AS id, name, plan, chat_quota_monthly`;
      if (!updated) return notFound(reply);

      await recordAudit(sql, admin.userId, 'company.update', { type: 'company', id: req.params.id }, req.body);
      return {
        id: updated.id,
        name: updated.name,
        plan: updated.plan,
        chatQuota: updated.chat_quota_monthly,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/companies/:id/reprocess',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const [company] = await sql`SELECT id FROM companies WHERE id = ${req.params.id}`;
      if (!company) return notFound(reply);

      // reprocessa com o core ATUAL. Reusa a rota real de snapshot (mesmo motor,
      // mesmo writer/push já ligados) recomputando o último dia calculado; sem
      // snapshot ainda, usa hoje. Imports são append-only, então recomputar é seguro.
      const [last] = await sql`
        SELECT as_of::text AS as_of FROM indicator_snapshots
        WHERE company_id = ${req.params.id} ORDER BY as_of DESC LIMIT 1`;
      const asOf = (last?.as_of as string | undefined) ?? new Date().toISOString().slice(0, 10);

      const res = await app.inject({
        method: 'POST',
        url: `/companies/${req.params.id}/snapshots`,
        payload: { asOf },
      });

      await recordAudit(sql, admin.userId, 'company.reprocess', { type: 'company', id: req.params.id }, { asOf });
      return reply.code(res.statusCode).send(res.json());
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/users/:id/reset-password',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const [user] = await sql`SELECT email FROM users WHERE id = ${req.params.id}`;
      if (!user) return notFound(reply);

      // reusa o fluxo existente (gera token de 1h + envia e-mail). Não expomos o
      // token cru na resposta do admin — o dono recebe por e-mail, como sempre.
      await app.inject({
        method: 'POST',
        url: '/auth/forgot-password',
        payload: { email: user.email },
      });

      await recordAudit(sql, admin.userId, 'user.reset_password', { type: 'user', id: req.params.id }, null);
      return { ok: true };
    },
  );

  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/admin/leads/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: {
            status: { enum: ['novo', 'contatado', 'convertido', 'descartado'] },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const [updated] = await sql`
        UPDATE interest_emails SET status = ${req.body.status}
        WHERE id = ${req.params.id}
        RETURNING id, status`;
      if (!updated) return notFound(reply);

      await recordAudit(sql, admin.userId, 'lead.update', { type: 'lead', id: req.params.id }, req.body);
      return { id: updated.id, status: updated.status };
    },
  );
}
