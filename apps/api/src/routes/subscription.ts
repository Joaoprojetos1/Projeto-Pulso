import type { FastifyInstance } from 'fastify';

import { companyFromRequest, normalizeEmail, userFromRequest } from '../auth';
import type { Sql } from '../db';
import { DATE_PATTERN, UUID_PATTERN } from '../http';

/**
 * Assinatura (entitlement) — o "gatilho de ativação".
 *
 * A venda acontece no SITE (checkout web, sem comissão de loja). Quando o
 * pagamento é confirmado, a empresa fica ATIVA num plano e o app destrava.
 * Três portas para ativar:
 *   1. /webhooks/subscription  — o provedor de pagamento avisa (genérico; um
 *      adaptador por provedor pluga aqui depois). Protegido por segredo.
 *   2. /admin/companies/:id/subscription — o operador ativa na mão (PIX no piloto).
 *   3. /me/subscription (GET)  — o app lê o estado para destravar/mostrar o plano.
 *
 * NENHUMA conta financeira aqui — só o direito de acesso.
 */

const PLANOS = ['piloto', 'essencial', 'crescimento', 'pro'] as const;
const STATUS = ['none', 'active', 'canceled', 'past_due'] as const;

/** Ativa = status 'active' e (sem validade OU validade ainda no futuro). */
function estaAtiva(status: string, until: string | null): boolean {
  if (status !== 'active') return false;
  if (!until) return true; // ativa até cancelar
  return until >= new Date().toISOString().slice(0, 10);
}

async function aplicar(
  sql: Sql,
  companyId: string,
  dados: { plan?: string; status: string; periodEnd?: string | null },
): Promise<void> {
  await sql`
    UPDATE companies
    SET plan = COALESCE(${dados.plan ?? null}, plan),
        subscription_status = ${dados.status},
        subscribed_until = ${dados.periodEnd ?? null}
    WHERE id = ${companyId}`;
}

async function lerAssinatura(sql: Sql, companyId: string) {
  const [row] = await sql`
    SELECT plan, subscription_status, subscribed_until::text AS until
    FROM companies WHERE id = ${companyId}`;
  const plan = (row?.plan as string) ?? 'piloto';
  const status = (row?.subscription_status as string) ?? 'none';
  const until = (row?.until as string | null) ?? null;
  return { plan, status, until, active: estaAtiva(status, until) };
}

export function registerSubscription(app: FastifyInstance, sql: Sql) {
  // 1) Webhook do provedor (genérico). Sem PULSO_WEBHOOK_SECRET setado, recusa
  //    TUDO — nada é ativado por engano. O provedor real ganha um adaptador que
  //    valida a assinatura dele e chama esta mesma lógica.
  app.post<{ Body: { email: string; plan?: string; status: string; periodEnd?: string } }>(
    '/webhooks/subscription',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'status'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 200 },
            plan: { enum: PLANOS as unknown as string[] },
            status: { enum: STATUS as unknown as string[] },
            periodEnd: { type: 'string', pattern: DATE_PATTERN },
          },
        },
      },
    },
    async (req, reply) => {
      const secret = process.env.PULSO_WEBHOOK_SECRET;
      const got = req.headers['x-webhook-secret'];
      if (!secret || got !== secret) return reply.code(401).send({ error: 'não autorizado' });

      const [user] = await sql`
        SELECT company_id FROM users WHERE email = ${normalizeEmail(req.body.email)}`;
      if (!user) return reply.code(404).send({ error: 'Nenhuma conta com esse e-mail.' });

      await aplicar(sql, user.company_id as string, {
        plan: req.body.plan,
        status: req.body.status,
        periodEnd: req.body.periodEnd ?? null,
      });
      return reply.send({ ok: true });
    },
  );

  // 2) Estado da assinatura do dono logado (o app lê para destravar/mostrar).
  app.get('/me/subscription', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    return lerAssinatura(sql, company.id);
  });

  // 3) Ativação MANUAL pelo operador (admin) — pro piloto: pagou no PIX, ativa
  //    na mão. Guardado pelo PAPEL (vem do banco). 404 se não for admin: a rota
  //    nem se revela.
  app.post<{ Params: { id: string }; Body: { plan?: string; status?: string; periodEnd?: string } }>(
    '/admin/companies/:id/subscription',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', pattern: UUID_PATTERN } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            plan: { enum: PLANOS as unknown as string[] },
            status: { enum: STATUS as unknown as string[] },
            periodEnd: { type: 'string', pattern: DATE_PATTERN },
          },
        },
      },
    },
    async (req, reply) => {
      const u = await userFromRequest(sql, req);
      if (!u || u.role !== 'admin') return reply.code(404).send({ error: 'Não encontrado.' });

      const [c] = await sql`SELECT id FROM companies WHERE id = ${req.params.id}`;
      if (!c) return reply.code(404).send({ error: 'Empresa não encontrada.' });

      await aplicar(sql, req.params.id, {
        plan: req.body.plan,
        status: req.body.status ?? 'active',
        periodEnd: req.body.periodEnd ?? null,
      });
      return reply.send({ id: req.params.id, ...(await lerAssinatura(sql, req.params.id)) });
    },
  );
}
