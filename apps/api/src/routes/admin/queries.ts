import { CORE_VERSION } from '@pulso/core';

import { callCostCents } from '../../ai/prices';
import type { Sql } from '../../db';

/**
 * Leituras da área de operação. Só SELECT — nenhuma conta financeira aqui
 * (o cálculo é do core, como sempre). Nunca devolve texto de conversa de
 * cliente; chat aparece só como contagem.
 */

const SP = 'America/Sao_Paulo';

// ---------------------------------------------------------------------------
// Overview: uma linha por empresa (o alarme operacional nº 1 = tempo sem dado)
// ---------------------------------------------------------------------------

export interface OverviewRow {
  companyId: string;
  name: string;
  phone: string | null;
  plan: string | null; // nome do plano (null = ainda sem plano)
  subscriptionStatus: string; // pendente | ativa | cancelada
  chatQuota: number; // efetiva (override da empresa, senão o limite do plano)
  isDemo: boolean;
  stage: string | null; // estágio do diagnóstico do último snapshot
  lastImportAt: string | null;
  daysSinceImport: number | null; // null = nunca importou
  /** Dias desde o último DADO (import OU caixa informado → snapshot). null = nunca. */
  daysSinceData: number | null;
  unopenedAlerts: number;
  chatQuestionsMonth: number;
}

/** Números do topo da operação (o negócio de uma olhada). */
export interface OperationSummary {
  activeSubscribers: number;
  pendingPayment: number;
  monthlyRevenueCents: number;
  aiInteractionsMonth: number;
}

export async function operationSummary(sql: Sql): Promise<OperationSummary> {
  const [subs] = await sql`
    SELECT
      count(*) FILTER (WHERE c.subscription_status = 'ativa')::int     AS ativos,
      count(*) FILTER (WHERE c.subscription_status = 'pendente')::int  AS pendentes,
      coalesce(sum(p.price_cents) FILTER (WHERE c.subscription_status = 'ativa'), 0)::bigint AS receita_cents
    FROM companies c LEFT JOIN plans p ON p.id = c.plan_id
    WHERE c.is_demo = false`;
  const [ia] = await sql`
    SELECT count(*)::int AS n FROM ai_usage
    WHERE kind = 'chat'
      AND (created_at AT TIME ZONE ${SP}) >= date_trunc('month', (now() AT TIME ZONE ${SP}))`;
  return {
    activeSubscribers: (subs?.ativos as number) ?? 0,
    pendingPayment: (subs?.pendentes as number) ?? 0,
    monthlyRevenueCents: Number(subs?.receita_cents ?? 0),
    aiInteractionsMonth: (ia?.n as number) ?? 0,
  };
}

const num = (rows: readonly Record<string, unknown>[], id: string, field: string): number => {
  const row = rows.find((r) => r.id === id);
  return row ? (row[field] as number) : 0;
};

export async function overview(sql: Sql): Promise<OverviewRow[]> {
  const companies = await sql`
    SELECT c.id::text AS id, c.name, c.phone, p.name AS plan_name, c.subscription_status,
           c.chat_quota_monthly, p.chat_limit_monthly AS plan_limit, c.is_demo
    FROM companies c LEFT JOIN plans p ON p.id = c.plan_id
    ORDER BY c.name`;

  const lastImport = await sql`
    SELECT company_id::text AS id, max(imported_at) AS last_at
    FROM imports GROUP BY company_id`;

  // sinal universal de "tem dado": todo import E todo caixa informado gera snapshot
  const lastData = await sql`
    SELECT company_id::text AS id, max(computed_at) AS last_at
    FROM indicator_snapshots GROUP BY company_id`;

  const unopened = await sql`
    SELECT company_id::text AS id, count(*)::int AS n
    FROM alerts WHERE opened_at IS NULL GROUP BY company_id`;

  const stages = await sql`
    SELECT DISTINCT ON (company_id) company_id::text AS id, diagnosis->>'stage' AS stage
    FROM indicator_snapshots
    ORDER BY company_id, as_of DESC`;

  const chat = await sql`
    SELECT company_id::text AS id, count(*)::int AS n
    FROM chat_messages
    WHERE role = 'user'
      AND (created_at AT TIME ZONE ${SP}) >= date_trunc('month', (now() AT TIME ZONE ${SP}))
    GROUP BY company_id`;

  const now = Date.now();
  const rows: OverviewRow[] = companies.map((c) => {
    const id = c.id as string;
    const last = lastImport.find((r) => r.id === id)?.last_at as Date | undefined;
    const lastMs = last ? new Date(last).getTime() : null;
    const lastDataAt = lastData.find((r) => r.id === id)?.last_at as Date | undefined;
    const lastDataMs = lastDataAt ? new Date(lastDataAt).getTime() : null;
    return {
      companyId: id,
      name: c.name as string,
      phone: (c.phone as string | null) ?? null,
      plan: (c.plan_name as string | null) ?? null,
      subscriptionStatus: c.subscription_status as string,
      chatQuota:
        (c.chat_quota_monthly as number | null) ?? (c.plan_limit as number | null) ?? 0,
      isDemo: c.is_demo as boolean,
      stage: (stages.find((r) => r.id === id)?.stage as string | null) ?? null,
      lastImportAt: last ? new Date(last).toISOString() : null,
      daysSinceImport: lastMs == null ? null : Math.floor((now - lastMs) / 86_400_000),
      daysSinceData: lastDataMs == null ? null : Math.floor((now - lastDataMs) / 86_400_000),
      unopenedAlerts: num(unopened, id, 'n'),
      chatQuestionsMonth: num(chat, id, 'n'),
    };
  });

  // ordena por "mais tempo sem dado": nunca enviou primeiro, depois mais dias
  rows.sort((a, b) => {
    const da = a.daysSinceData ?? Number.POSITIVE_INFINITY;
    const db = b.daysSinceData ?? Number.POSITIVE_INFINITY;
    return db - da;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Dossiê de uma empresa
// ---------------------------------------------------------------------------

export async function companyDossier(sql: Sql, companyId: string) {
  const [company] = await sql`
    SELECT c.id::text AS id, c.name, c.cnpj, c.niche, c.phone, c.declared_fixed_cost_cents,
           c.plan_id, p.name AS plan_name,
           c.subscription_status, c.is_demo, c.chat_quota_monthly,
           p.chat_limit_monthly AS plan_limit, c.created_at
    FROM companies c LEFT JOIN plans p ON p.id = c.plan_id
    WHERE c.id = ${companyId}`;
  if (!company) return null;

  const [snapshot] = await sql`
    SELECT as_of::text AS as_of, core_version, payload, diagnosis, computed_at
    FROM indicator_snapshots
    WHERE company_id = ${companyId}
    ORDER BY as_of DESC LIMIT 1`;

  const alerts = await sql`
    SELECT id, rule_key, severity::text AS severity, text_title, created_at, opened_at, acted_at
    FROM alerts WHERE company_id = ${companyId}
    ORDER BY created_at DESC LIMIT 100`;

  const imports = await sql`
    SELECT source, period_start::text AS period_start, period_end::text AS period_end,
           row_count, imported_at
    FROM imports WHERE company_id = ${companyId}
    ORDER BY imported_at DESC LIMIT 50`;

  // caixa informado à mão (o dono no "Configurar meu caixa") — conta como dado enviado
  const cashInputs = await sql`
    SELECT observed_on::text AS observed_on, balance_cents
    FROM cash_balances WHERE company_id = ${companyId}
    ORDER BY observed_on DESC LIMIT 50`;

  // interações de IA (chat) usadas no mês corrente
  const [chatUsed] = await sql`
    SELECT count(*)::int AS n FROM ai_usage
    WHERE company_id = ${companyId} AND kind = 'chat'
      AND (created_at AT TIME ZONE ${SP}) >= date_trunc('month', (now() AT TIME ZONE ${SP}))`;

  const users = await sql`
    SELECT id::text AS id, email, role FROM users
    WHERE company_id = ${companyId} ORDER BY created_at`;

  const planned = await sql`
    SELECT kind::text AS kind, status::text AS status,
           count(*)::int AS n, coalesce(sum(amount_cents), 0)::bigint AS total_cents
    FROM planned_entries WHERE company_id = ${companyId}
    GROUP BY kind, status`;

  const aiUsage = await sql`
    SELECT kind::text AS kind, model,
           count(*)::int AS calls,
           coalesce(sum(input_tokens), 0)::bigint  AS input_tokens,
           coalesce(sum(output_tokens), 0)::bigint AS output_tokens
    FROM ai_usage
    WHERE company_id = ${companyId}
      AND (created_at AT TIME ZONE ${SP}) >= date_trunc('month', (now() AT TIME ZONE ${SP}))
    GROUP BY kind, model`;

  // "Números do negócio": lê os indicadores JÁ calculados do último snapshot
  // (valores em CENTAVOS — o app formata em R$; nada é calculado aqui).
  const payload = (snapshot?.payload ?? {}) as Record<string, { value?: unknown } | undefined>;
  const numFrom = (k: string): number | null =>
    typeof payload[k]?.value === 'number' ? (payload[k]!.value as number) : null;
  const businessNumbers = {
    cashCents: numFrom('cash_balance'),
    fixedCostCents: numFrom('fixed_cost_monthly') ?? (company.declared_fixed_cost_cents as number | null) ?? null,
    revenueCents: numFrom('revenue_current'),
    revenuePreviousCents: numFrom('revenue_previous'),
  };

  return {
    company: {
      id: company.id as string,
      name: company.name as string,
      cnpj: (company.cnpj as string | null) ?? null,
      niche: company.niche as string,
      phone: (company.phone as string | null) ?? null,
      planId: (company.plan_id as string | null) ?? null,
      plan: (company.plan_name as string | null) ?? null,
      subscriptionStatus: company.subscription_status as string,
      isDemo: company.is_demo as boolean,
      chatQuota:
        (company.chat_quota_monthly as number | null) ?? (company.plan_limit as number | null) ?? 0,
      createdAt: company.created_at as Date,
    },
    businessNumbers,
    chatUsedMonth: (chatUsed?.n as number) ?? 0,
    snapshot: snapshot
      ? {
          asOf: snapshot.as_of as string,
          coreVersion: snapshot.core_version as string,
          computedAt: snapshot.computed_at as Date,
          indicators: snapshot.payload,
          diagnosis: snapshot.diagnosis ?? null,
        }
      : null,
    users: users.map((u) => ({ id: u.id as string, email: u.email as string, role: u.role as string })),
    alerts: alerts.map((a) => ({
      id: a.id,
      ruleKey: a.rule_key,
      severity: a.severity,
      textTitle: (a.text_title as string | null) ?? null,
      createdAt: a.created_at,
      openedAt: a.opened_at,
      actedAt: a.acted_at,
    })),
    imports: imports.map((i) => ({
      source: i.source,
      periodStart: i.period_start,
      periodEnd: i.period_end,
      rowCount: i.row_count,
      importedAt: i.imported_at,
    })),
    cashInputs: cashInputs.map((c) => ({
      observedOn: c.observed_on as string,
      balanceCents: Number(c.balance_cents),
    })),
    planned: planned.map((p) => ({
      kind: p.kind,
      status: p.status,
      count: p.n,
      totalCents: Number(p.total_cents),
    })),
    aiUsageMonth: aiUsage.map((u) => ({
      kind: u.kind,
      model: u.model,
      calls: u.calls,
      inputTokens: Number(u.input_tokens),
      outputTokens: Number(u.output_tokens),
      totalTokens: Number(u.input_tokens) + Number(u.output_tokens),
    })),
  };
}

// ---------------------------------------------------------------------------
// Saúde do sistema
// ---------------------------------------------------------------------------

export async function health(sql: Sql) {
  const [snap] = await sql`SELECT max(computed_at) AS last_at FROM indicator_snapshots`;
  const [imp7] = await sql`
    SELECT count(*)::int AS n FROM imports WHERE imported_at > now() - interval '7 days'`;
  const [active] = await sql`
    SELECT count(DISTINCT company_id)::int AS n
    FROM imports WHERE imported_at > now() - interval '30 days'`;
  const [companies] = await sql`SELECT count(*)::int AS n FROM companies WHERE is_demo = false`;

  return {
    lastSnapshotAt: (snap?.last_at as Date | null) ?? null,
    importsLast7Days: (imp7?.n as number) ?? 0,
    activeCompaniesLast30Days: (active?.n as number) ?? 0,
    realCompanies: (companies?.n as number) ?? 0,
    coreVersion: CORE_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Leads (lista de espera do site)
// ---------------------------------------------------------------------------

export async function leads(sql: Sql, search?: string) {
  const rows = search
    ? await sql`
        SELECT id, email, name, phone, source, status, created_at
        FROM interest_emails
        WHERE email ILIKE ${'%' + search + '%'} OR name ILIKE ${'%' + search + '%'}
        ORDER BY created_at DESC LIMIT 500`
    : await sql`
        SELECT id, email, name, phone, source, status, created_at
        FROM interest_emails
        ORDER BY created_at DESC LIMIT 500`;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: (r.name as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    source: (r.source as string | null) ?? null,
    status: r.status,
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Métricas do piloto por empresa (30 dias) — mantido da versão anterior
// ---------------------------------------------------------------------------

export interface PilotMetrics {
  companyId: string;
  companyName: string;
  last30Days: {
    importsReceived: number;
    alertsSent: number;
    alertsOpened: number;
    chatQuestions: number;
    plannedCreated: number;
    plannedConfirmed: number;
  };
}

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

// ---------------------------------------------------------------------------
// Economia por plano: quanto sobra por cliente (custo da IA vs preço do plano)
// ---------------------------------------------------------------------------

/**
 * Deriva de ai_usage (conversas do mês) + a tabela de preços dos modelos:
 *  - custo médio por interação, por modelo e no geral;
 *  - por plano ativo: preço, limite, custo estimado se o cliente usar 100% do
 *    limite, e o quanto sobra. NENHUMA conta financeira de cliente aqui —
 *    é métrica gerencial de custo de operação.
 */
export async function economy(sql: Sql) {
  const chatRows = await sql`
    SELECT model,
           count(*)::int              AS calls,
           sum(input_tokens)::bigint  AS input_tokens,
           sum(output_tokens)::bigint AS output_tokens
    FROM ai_usage
    WHERE kind = 'chat'
      AND (created_at AT TIME ZONE ${SP}) >= date_trunc('month', (now() AT TIME ZONE ${SP}))
    GROUP BY model`;

  const byModel = chatRows.map((r) => {
    const calls = r.calls as number;
    const custo = callCostCents(r.model as string, Number(r.input_tokens), Number(r.output_tokens));
    return {
      model: r.model as string,
      calls,
      avgCostCents: calls > 0 ? Math.round(custo / calls) : 0,
    };
  });

  const totalCalls = byModel.reduce((s, m) => s + m.calls, 0);
  const totalCost = chatRows.reduce(
    (s, r) => s + callCostCents(r.model as string, Number(r.input_tokens), Number(r.output_tokens)),
    0,
  );
  // null = ainda não houve conversa suficiente para estimar
  const avgCostCents = totalCalls > 0 ? Math.round(totalCost / totalCalls) : null;

  const plans = await sql`
    SELECT id, name, price_cents, chat_limit_monthly
    FROM plans WHERE active = true ORDER BY sort, price_cents`;

  return {
    avgCostCents,
    byModel,
    plans: plans.map((p) => {
      const limit = p.chat_limit_monthly as number;
      const price = p.price_cents as number;
      const costAtFull = avgCostCents != null ? avgCostCents * limit : null;
      return {
        id: p.id as string,
        name: p.name as string,
        priceCents: price,
        chatLimit: limit,
        costAtFullCents: costAtFull,
        sobraCents: costAtFull != null ? price - costAtFull : null,
      };
    }),
  };
}
