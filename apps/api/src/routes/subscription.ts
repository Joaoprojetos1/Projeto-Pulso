import type { FastifyInstance } from 'fastify';

import { companyFromRequest, normalizeEmail } from '../auth';
import type { Sql } from '../db';
import { DATE_PATTERN } from '../http';

/**
 * Assinatura (entitlement) — o "gatilho de ativação".
 *
 * A venda acontece no SITE (checkout web, sem comissão de loja). Quando o
 * pagamento é confirmado, a empresa fica ATIVA no plano e o app destrava.
 * Portas para ativar:
 *   - /webhooks/subscription  — o provedor avisa (genérico; protegido por segredo).
 *   - /admin/companies/:id (PATCH) — o operador ativa na mão no dossiê (auditado).
 *   - /me/subscription (GET)  — o app lê o estado para destravar/mostrar o plano.
 *   - /plans (GET) — os planos ativos, para a tela "Assine" do app.
 *
 * Status em pt-BR: pendente | ativa | cancelada. NENHUMA conta financeira aqui.
 */

const STATUS = ['pendente', 'ativa', 'cancelada'] as const;

/** Ativa = status 'ativa' e (sem validade OU validade ainda no futuro). */
function estaAtiva(status: string, until: string | null): boolean {
  if (status !== 'ativa') return false;
  if (!until) return true;
  return until >= new Date().toISOString().slice(0, 10);
}

async function lerAssinatura(sql: Sql, companyId: string) {
  const [row] = await sql`
    SELECT c.plan_id, p.name AS plan_name, p.price_cents, p.chat_limit_monthly,
           c.subscription_status, c.subscribed_until::text AS until
    FROM companies c LEFT JOIN plans p ON p.id = c.plan_id
    WHERE c.id = ${companyId}`;
  const status = (row?.subscription_status as string) ?? 'pendente';
  const until = (row?.until as string | null) ?? null;
  return {
    planId: (row?.plan_id as string | null) ?? null,
    planName: (row?.plan_name as string | null) ?? null,
    priceCents: (row?.price_cents as number | null) ?? null,
    chatLimit: (row?.chat_limit_monthly as number | null) ?? null,
    status,
    until,
    active: estaAtiva(status, until),
  };
}

export function registerSubscription(app: FastifyInstance, sql: Sql) {
  // planos ATIVOS para a tela "Assine" do app (não é segredo).
  app.get('/plans', async () => {
    const rows = await sql`
      SELECT id, name, price_cents, chat_limit_monthly
      FROM plans WHERE active = true ORDER BY sort, price_cents`;
    return {
      plans: rows.map((p) => ({
        id: p.id,
        name: p.name,
        priceCents: p.price_cents,
        chatLimitMonthly: p.chat_limit_monthly,
      })),
    };
  });

  // Webhook do provedor (genérico). Sem PULSO_WEBHOOK_SECRET, recusa tudo — nada
  // é ativado por engano. O provedor real ganha um adaptador que valida a
  // assinatura dele e chama esta mesma lógica.
  app.post<{ Body: { email: string; planId?: string; status: string; periodEnd?: string } }>(
    '/webhooks/subscription',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'status'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 200 },
            planId: { type: 'string', maxLength: 40 },
            status: { enum: STATUS as unknown as string[] },
            periodEnd: { type: 'string', pattern: DATE_PATTERN },
          },
        },
      },
    },
    async (req, reply) => {
      const secret = process.env.PULSO_WEBHOOK_SECRET;
      if (!secret || req.headers['x-webhook-secret'] !== secret) {
        return reply.code(401).send({ error: 'não autorizado' });
      }

      const [user] = await sql`
        SELECT company_id FROM users WHERE email = ${normalizeEmail(req.body.email)}`;
      if (!user) return reply.code(404).send({ error: 'Nenhuma conta com esse e-mail.' });

      if (req.body.planId) {
        const [p] = await sql`SELECT 1 FROM plans WHERE id = ${req.body.planId}`;
        if (!p) return reply.code(400).send({ error: 'Plano inexistente.' });
      }

      await sql`
        UPDATE companies
        SET plan_id             = COALESCE(${req.body.planId ?? null}, plan_id),
            subscription_status = ${req.body.status},
            subscribed_until    = ${req.body.periodEnd ?? null}
        WHERE id = ${user.company_id}`;
      return reply.send({ ok: true });
    },
  );

  // Estado da assinatura do dono logado (o app lê para destravar/mostrar).
  app.get('/me/subscription', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    return lerAssinatura(sql, company.id);
  });
}
