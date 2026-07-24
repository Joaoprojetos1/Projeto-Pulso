import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { aggregateAiUsage } from '../../ai/usage';
import type { AuthedUser } from '../../auth';
import type { AlertWriterModel } from '../../ai/writer';
import type { Sql } from '../../db';
import { findCompany, UUID_PATTERN } from '../../http';
import type { PushSender } from '../../push';
import { saoPauloToday } from '../../quota';
import { computeAndStore } from '../snapshots';
import { notFound, rateLimited, recordAudit, requireAdmin } from './guard';
import { companyDossier, economy, health, leads, operationSummary, overview, pilotMetrics } from './queries';

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

export function registerAdmin(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
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
    const [companies, summary] = await Promise.all([overview(sql), operationSummary(sql)]);
    return { companies, summary };
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

  app.get('/admin/economy', async (req, reply) => {
    const admin = await gate(req, reply);
    if (!admin) return reply;
    return await economy(sql);
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

  app.patch<{
    Params: { id: string };
    Body: { name?: string; phone?: string; chatQuota?: number; planId?: string; subscriptionStatus?: string };
  }>(
    '/admin/companies/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            phone: { type: 'string', maxLength: 25 },
            chatQuota: { type: 'integer', minimum: 0, maximum: 100000 },
            planId: { type: 'string', minLength: 1, maxLength: 40 },
            subscriptionStatus: { enum: ['pendente', 'ativa', 'cancelada'] },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const { name, phone, chatQuota, planId, subscriptionStatus } = req.body;
      if (
        name === undefined &&
        phone === undefined &&
        chatQuota === undefined &&
        planId === undefined &&
        subscriptionStatus === undefined
      ) {
        return reply.code(400).send({ error: 'Nada para atualizar.' });
      }
      if (planId !== undefined) {
        const [p] = await sql`SELECT 1 FROM plans WHERE id = ${planId}`;
        if (!p) return reply.code(400).send({ error: 'Plano inexistente.' });
      }
      // telefone: guarda só os dígitos (como no cadastro). COALESCE mantém o atual
      // quando não vier — serve para preencher retroativo, não para limpar.
      let phoneDigits: string | null = null;
      if (phone !== undefined) {
        const d = phone.replace(/\D/g, '');
        if (d.length < 10 || d.length > 11) {
          return reply.code(400).send({ error: 'Telefone inválido. Use DDD + número.' });
        }
        phoneDigits = d;
      }

      const [updated] = await sql`
        UPDATE companies SET
          name                = COALESCE(${name ?? null}, name),
          phone               = COALESCE(${phoneDigits}, phone),
          chat_quota_monthly  = COALESCE(${chatQuota ?? null}, chat_quota_monthly),
          plan_id             = COALESCE(${planId ?? null}, plan_id),
          subscription_status = COALESCE(${subscriptionStatus ?? null}, subscription_status)
        WHERE id = ${req.params.id}
        RETURNING id::text AS id, name, phone, plan_id, subscription_status, chat_quota_monthly`;
      if (!updated) return notFound(reply);

      await recordAudit(sql, admin.userId, 'company.update', { type: 'company', id: req.params.id }, req.body);
      return {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        planId: updated.plan_id,
        subscriptionStatus: updated.subscription_status,
        chatQuota: updated.chat_quota_monthly,
      };
    },
  );

  // excluir cadastro: remove a empresa e TODOS os dados associados. Exige o nome
  // exato como confirmação (dupla checagem também no servidor). Auditado.
  app.delete<{ Params: { id: string }; Body: { confirmName: string } }>(
    '/admin/companies/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['confirmName'],
          additionalProperties: false,
          properties: { confirmName: { type: 'string', minLength: 1, maxLength: 120 } },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const [company] = await sql`SELECT id::text AS id, name FROM companies WHERE id = ${req.params.id}`;
      if (!company) return notFound(reply);

      const informado = req.body.confirmName.trim().toLowerCase();
      if (informado !== (company.name as string).trim().toLowerCase()) {
        return reply.code(400).send({ error: 'O nome digitado não confere com o da empresa.' });
      }

      const id = req.params.id;
      await sql.begin(async (tx) => {
        // filhos que dependem do usuário (não têm FK direto para a empresa)
        await tx`DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE company_id = ${id})`;
        await tx`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE company_id = ${id})`;
        await tx`DELETE FROM users WHERE company_id = ${id}`;
        // filhos com company_id (a maioria já teria ON DELETE CASCADE; explícito é seguro)
        await tx`DELETE FROM chat_messages WHERE company_id = ${id}`;
        await tx`DELETE FROM ai_usage WHERE company_id = ${id}`;
        await tx`DELETE FROM planned_entries WHERE company_id = ${id}`;
        await tx`DELETE FROM device_tokens WHERE company_id = ${id}`;
        await tx`DELETE FROM alerts WHERE company_id = ${id}`;
        await tx`DELETE FROM entries WHERE company_id = ${id}`;
        await tx`DELETE FROM imports WHERE company_id = ${id}`;
        await tx`DELETE FROM indicator_snapshots WHERE company_id = ${id}`;
        await tx`DELETE FROM cash_balances WHERE company_id = ${id}`;
        await tx`DELETE FROM companies WHERE id = ${id}`;
      });

      await recordAudit(sql, admin.userId, 'company.delete', { type: 'company', id }, { name: company.name });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/companies/:id/reprocess',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const company = await findCompany(sql, req.params.id);
      if (!company) return notFound(reply);

      // reprocessa com o core ATUAL: chama o mesmo motor (computeAndStore) direto,
      // com o writer/push já ligados, recomputando o último dia calculado; sem
      // snapshot ainda, usa hoje. Imports são append-only, então recomputar é seguro.
      const [last] = await sql`
        SELECT as_of::text AS as_of FROM indicator_snapshots
        WHERE company_id = ${req.params.id} ORDER BY as_of DESC LIMIT 1`;
      const asOf = (last?.as_of as string | undefined) ?? saoPauloToday();

      const result = await computeAndStore(sql, company, asOf, alertWriter, pushSender, app.log);

      await recordAudit(sql, admin.userId, 'company.reprocess', { type: 'company', id: req.params.id }, { asOf });
      return reply.code(201).send(result);
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

  // ---- planos (gestão) ---------------------------------------------------

  const planParams = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1, maxLength: 40 } },
  } as const;

  app.get('/admin/plans', async (req, reply) => {
    const admin = await gate(req, reply);
    if (!admin) return reply;
    const rows = await sql`
      SELECT id, name, price_cents, chat_limit_monthly, active, sort
      FROM plans ORDER BY sort, price_cents`;
    return {
      plans: rows.map((p) => ({
        id: p.id,
        name: p.name,
        priceCents: p.price_cents,
        chatLimitMonthly: p.chat_limit_monthly,
        active: p.active,
        sort: p.sort,
      })),
    };
  });

  app.post<{
    Body: { id: string; name: string; priceCents: number; chatLimitMonthly: number; sort?: number };
  }>(
    '/admin/plans',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'name', 'priceCents', 'chatLimitMonthly'],
          additionalProperties: false,
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 40 },
            name: { type: 'string', minLength: 1, maxLength: 60 },
            priceCents: { type: 'integer', minimum: 0 },
            chatLimitMonthly: { type: 'integer', minimum: 0 },
            sort: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const b = req.body;
      try {
        await sql`
          INSERT INTO plans (id, name, price_cents, chat_limit_monthly, sort)
          VALUES (${b.id.trim().toLowerCase()}, ${b.name}, ${b.priceCents}, ${b.chatLimitMonthly}, ${b.sort ?? 0})`;
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          return reply.code(409).send({ error: 'Já existe um plano com esse identificador.' });
        }
        throw err;
      }
      await recordAudit(sql, admin.userId, 'plan.create', { type: 'plan', id: b.id }, b);
      return reply.code(201).send({ ok: true });
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { name?: string; priceCents?: number; chatLimitMonthly?: number; active?: boolean; sort?: number };
  }>(
    '/admin/plans/:id',
    {
      schema: {
        params: planParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 60 },
            priceCents: { type: 'integer', minimum: 0 },
            chatLimitMonthly: { type: 'integer', minimum: 0 },
            active: { type: 'boolean' },
            sort: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const b = req.body;
      const [updated] = await sql`
        UPDATE plans SET
          name               = COALESCE(${b.name ?? null}, name),
          price_cents        = COALESCE(${b.priceCents ?? null}, price_cents),
          chat_limit_monthly = COALESCE(${b.chatLimitMonthly ?? null}, chat_limit_monthly),
          active             = COALESCE(${b.active ?? null}, active),
          sort               = COALESCE(${b.sort ?? null}, sort)
        WHERE id = ${req.params.id}
        RETURNING id`;
      if (!updated) return notFound(reply);
      await recordAudit(sql, admin.userId, 'plan.update', { type: 'plan', id: req.params.id }, b);
      return { ok: true };
    },
  );
}
