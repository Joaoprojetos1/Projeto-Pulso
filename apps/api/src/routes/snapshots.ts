import { addDays, computeAll, CORE_VERSION, diagnose, evaluate, projectCash } from '@pulso/core';
import type { CashProjection, CompanySnapshot, DiagnosisHistoryPoint, DiagnosisStage } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import { writeDiagnosis } from '../ai/diagnosis-writer';
import { writeWeekly, type WeeklyFacts } from '../ai/weekly-writer';
import { recordAiUsage, type AiCallUsage } from '../ai/usage';
import { writeAlert, type AlertWriterModel } from '../ai/writer';
import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { companyParamsSchema, DATE_PATTERN, findCompany, toCompanyJson, type CompanyRow } from '../http';
import type { PushMessage, PushSender } from '../push';

/**
 * Cálculo e leitura.
 *
 * REGRA: nenhuma conta financeira aqui. Esta rota carrega dados do banco,
 * entrega ao core (computeAll + evaluate) e persiste o resultado. Se uma
 * soma de dinheiro aparecer neste arquivo, ela está no lugar errado.
 */

export async function loadCompanySnapshot(
  sql: Sql,
  company: CompanyRow,
  asOf: string,
): Promise<CompanySnapshot> {
  const entryRows = await sql`
    SELECT id::text AS id, kind::text AS kind, amount_cents,
           issued_on::text AS issued_on, due_on::text AS due_on, settled_on::text AS settled_on,
           counterparty, category, cost_type::text AS cost_type
    FROM entries WHERE company_id = ${company.id}`;

  const balanceRows = await sql`
    SELECT observed_on::text AS observed_on, balance_cents
    FROM cash_balances WHERE company_id = ${company.id}
    ORDER BY observed_on`;

  // Fase 2: contas PREVISTAS alimentam a projeção. Só as 'prevista' importam —
  // a confirmada já virou realidade e vive em `entries` (a dedup R5 do core
  // também barra, mas nem carregamos o irrelevante).
  const plannedRows = await sql`
    SELECT id::text AS id, kind::text AS kind, amount_cents, due_on::text AS due_on,
           counterparty, category, recurrence::text AS recurrence, status::text AS status,
           confirmed_on::text AS confirmed_on
    FROM planned_entries
    WHERE company_id = ${company.id} AND status = 'prevista'`;

  return {
    asOf,
    entries: entryRows.map((r) => ({
      id: r.id as string,
      kind: r.kind as 'receivable' | 'payable',
      amountCents: r.amount_cents as number,
      issuedOn: r.issued_on as string,
      dueOn: r.due_on as string,
      settledOn: (r.settled_on as string | null) ?? null,
      counterparty: (r.counterparty as string | null) ?? undefined,
      category: (r.category as string | null) ?? undefined,
      costType: (r.cost_type as 'fixed' | 'variable' | null) ?? undefined,
    })),
    balances: balanceRows.map((r) => ({
      observedOn: r.observed_on as string,
      balanceCents: r.balance_cents as number,
    })),
    planned: plannedRows.map((r) => ({
      id: r.id as string,
      kind: r.kind as 'receivable' | 'payable',
      amountCents: r.amount_cents as number,
      dueOn: r.due_on as string,
      recurrence: r.recurrence as 'none' | 'monthly',
      status: r.status as 'prevista' | 'realizada',
      confirmedOn: (r.confirmed_on as string | null) ?? null,
      counterparty: (r.counterparty as string | null) ?? undefined,
      category: (r.category as string | null) ?? undefined,
    })),
    declaredFixedCostCents: company.declared_fixed_cost_cents ?? undefined,
  };
}

/**
 * Entrega no celular os alertas sérios (warn/critical) que ainda não foram
 * avisados. Trava anti-spam: o mesmo tipo de alerta (rule_key) não repete
 * em 12h. Nunca falha o snapshot — push é entrega, não cálculo.
 */
/** Tipos de alerta já entregues nas últimas 12h. Lido ANTES de recalcular
 *  (o recálculo apaga e recria os alertas do dia, junto do pushed_at). */
async function recentlyPushedRuleKeys(sql: Sql, companyId: string): Promise<Set<string>> {
  const rows = await sql`
    SELECT DISTINCT rule_key FROM alerts
    WHERE company_id = ${companyId} AND pushed_at IS NOT NULL AND pushed_at > now() - interval '12 hours'`;
  return new Set(rows.map((r) => r.rule_key as string));
}

async function notifyNewAlerts(
  sql: Sql,
  pushSender: PushSender,
  companyId: string,
  written: Array<{ id: string; ruleKey: string; severity: string; title: string | null; body: string | null }>,
  jaAvisado: Set<string>,
): Promise<void> {
  const serios = written.filter((a) => a.severity === 'warn' || a.severity === 'critical');
  if (serios.length === 0) return;

  const tokenRows = await sql`SELECT token FROM device_tokens WHERE company_id = ${companyId}`;
  if (tokenRows.length === 0) return;
  const tokens = tokenRows.map((r) => r.token as string);

  const aEnviar = serios.filter((a) => !jaAvisado.has(a.ruleKey));
  if (aEnviar.length === 0) return;

  const messages: PushMessage[] = [];
  for (const a of aEnviar) {
    for (const to of tokens) {
      messages.push({
        to,
        title: a.title ?? 'Pulso',
        body: a.body ?? 'Há um sinal importante no seu caixa.',
        data: { kind: 'alert', ruleKey: a.ruleKey },
      });
    }
  }

  await pushSender.send(messages);
  const ids = aEnviar.map((a) => a.id);
  await sql`UPDATE alerts SET pushed_at = now() WHERE id = ANY(${ids})`;
}

type Payload = Record<string, { value?: unknown }> | null | undefined;

function valorInd(payload: Payload, key: string): number | null {
  const v = payload?.[key]?.value;
  return typeof v === 'number' ? v : null;
}

/**
 * Comparativo atual × anterior dos indicadores de topo (Ciclo, Margem, Receita).
 * TUDO já foi calculado pelo core — aqui só comparamos dois retratos. Receita
 * usa o mês anterior do próprio snapshot; Ciclo e Margem usam o snapshot
 * anterior (aparecem só quando já existe histórico — nunca inventamos).
 */
function montarComparativos(atual: Payload, anterior: Payload) {
  return {
    cash_cycle: { atual: valorInd(atual, 'cash_cycle'), anterior: valorInd(anterior, 'cash_cycle') },
    contribution_margin: {
      atual: valorInd(atual, 'contribution_margin'),
      anterior: valorInd(anterior, 'contribution_margin'),
    },
    revenue_current: {
      atual: valorInd(atual, 'revenue_current'),
      anterior: valorInd(atual, 'revenue_previous'),
    },
  };
}

/**
 * Histórico para o diagnóstico: resume os snapshots ANTERIORES (indicadores +
 * o estágio já gravado) para as premissas que dependem de períodos anteriores
 * (P3 tesoura, P4 média móvel do ciclo, P5 margem caindo). O core segue puro —
 * ele recebe isto pronto, nunca busca nada.
 */
async function loadDiagnosisHistory(
  sql: Sql,
  companyId: string,
  asOf: string,
): Promise<{ points: DiagnosisHistoryPoint[] }> {
  const rows = await sql`
    SELECT as_of::text AS as_of, payload, diagnosis
    FROM indicator_snapshots
    WHERE company_id = ${companyId} AND as_of < ${asOf}
    ORDER BY as_of DESC
    LIMIT 3`;

  // rows vêm do mais recente ao mais antigo; o core espera do mais ANTIGO ao recente
  const points: DiagnosisHistoryPoint[] = rows.reverse().map((r) => {
    const p = r.payload as Payload;
    const stage = (r.diagnosis as { stage?: DiagnosisStage } | null)?.stage ?? null;
    return {
      asOf: r.as_of as string,
      ncgCents: valorInd(p, 'ncg'),
      revenueCents: valorInd(p, 'revenue_current'),
      cashCycleDays: valorInd(p, 'cash_cycle'),
      contributionMargin: valorInd(p, 'contribution_margin'),
      stage,
    };
  });
  return { points };
}

/**
 * Monta a resposta do dashboard (último snapshot + alertas ordenados).
 * Retorna null quando a empresa ainda não tem nenhum cálculo (conta nova).
 * Fonte única usada tanto pela rota pública quanto pela rota logada (/me).
 */
export async function buildDashboard(sql: Sql, company: CompanyRow) {
  const [snapshot] = await sql`
    SELECT id, as_of::text AS as_of, core_version, payload, diagnosis, weekly_summary, computed_at
    FROM indicator_snapshots
    WHERE company_id = ${company.id}
    ORDER BY as_of DESC
    LIMIT 1`;
  if (!snapshot) return null;

  // snapshot anterior (para a tendência de Ciclo e Margem); pode não existir
  const [anterior] = await sql`
    SELECT payload
    FROM indicator_snapshots
    WHERE company_id = ${company.id} AND as_of < ${snapshot.as_of}
    ORDER BY as_of DESC
    LIMIT 1`;

  const alertRows = await sql`
    SELECT id, rule_key, severity::text AS severity, facts, text_title, text_body,
           created_at, opened_at, acted_at
    FROM alerts
    WHERE snapshot_id = ${snapshot.id}
    ORDER BY CASE severity::text WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, created_at`;

  // Curva DIÁRIA da projeção (item 14): o mesmo motor, pedindo todos os dias.
  // Fica FORA do payload (não vai para o prompt do chat, não infla o token);
  // é recalculada aqui, fresca, a partir dos mesmos dados do snapshot.
  const asOf = snapshot.as_of as string;
  const snapCurva = await loadCompanySnapshot(sql, company, asOf);
  const projDiaria = projectCash(snapCurva, Array.from({ length: 90 }, (_, i) => i + 1));
  const pontos = projDiaria.value as CashProjection[] | null;
  const abertura = projDiaria.inputs.openingBalanceCents;
  const projectionCurve = pontos
    ? [
        ...(typeof abertura === 'number' ? [{ day: asOf, cents: abertura }] : []),
        ...pontos.map((p) => ({ day: addDays(asOf, p.horizonDays), cents: p.projectedCents })),
      ]
    : [];

  return {
    company: toCompanyJson(company),
    snapshot: {
      asOf: snapshot.as_of,
      coreVersion: snapshot.core_version,
      computedAt: snapshot.computed_at,
      indicators: snapshot.payload,
    },
    comparativos: montarComparativos(
      snapshot.payload as Payload,
      (anterior?.payload as Payload) ?? null,
    ),
    // diagnóstico do momento (null nos snapshots antigos, anteriores à 0008)
    diagnosis: snapshot.diagnosis ?? null,
    // resumo da semana (null quando não há snapshot anterior de >= 5 dias)
    weeklySummary: snapshot.weekly_summary ?? null,
    // curva diária da projeção, para o gráfico interativo (scrubbing) do app
    projectionCurve,
    alerts: alertRows.map((a) => ({
      // id + opened/acted para o app marcar lido/agido a partir do próprio painel
      id: a.id,
      ruleKey: a.rule_key,
      severity: a.severity,
      facts: a.facts,
      textTitle: a.text_title,
      textBody: a.text_body,
      createdAt: a.created_at,
      openedAt: a.opened_at,
      actedAt: a.acted_at,
    })),
  };
}

/**
 * Roda o motor para uma empresa e persiste o snapshot do dia (indicadores +
 * diagnóstico + resumo da semana + alertas), entregando no celular os alertas
 * sérios ainda não avisados. Fonte ÚNICA usada tanto pela rota pública
 * (/companies/:id/snapshots) quanto pela rota do dono logado (/me/setup).
 * REGRA: nenhuma conta financeira aqui — o cálculo é todo do core.
 */
export async function computeAndStore(
  sql: Sql,
  company: CompanyRow,
  asOf: string,
  alertWriter: AlertWriterModel | null,
  pushSender: PushSender | null,
  log?: { error: (obj: unknown, msg?: string) => void },
) {
  // lido antes de recalcular: o recálculo do dia apaga os alertas (e o pushed_at)
  const jaAvisado = pushSender
    ? await recentlyPushedRuleKeys(sql, company.id)
    : new Set<string>();

  const snap = await loadCompanySnapshot(sql, company, asOf);
      const indicators = computeAll(snap);
      const alerts = evaluate(indicators);

      // diagnóstico do momento: o core julga a partir dos indicadores + o
      // histórico dos snapshots anteriores (resumido pela API).
      const history = await loadDiagnosisHistory(sql, company.id, asOf);
      const diag = diagnose(indicators, history);

      // a voz do Pulso: a IA (ou o template) redige a partir dos facts —
      // e de NADA além dos facts
      const profile = { name: company.name, niche: company.niche };
      const aiUsage: AiCallUsage[] = [];
      const written = await Promise.all(
        alerts.map(async (a) => ({
          alert: a,
          text: await writeAlert(alertWriter, a, profile, (u) => aiUsage.push(u)),
        })),
      );

      // a voz do diagnóstico (mesmo writer + fiscal dos alertas).
      // NÃO medimos esta chamada em ai_usage por ora: a métrica de metering trata
      // kind='alert_writer' como "um por alerta". Se o custo do diagnóstico
      // precisar entrar, criar um kind='diagnosis' dedicado (enum + migração).
      const diagText = await writeDiagnosis(alertWriter, diag, profile);
      const diagnosisStored = { ...diag, text: diagText };

      // Resumo da semana: se existe um snapshot de >= 5 dias antes, o writer redige
      // o que mudou (não medido em ai_usage, como o diagnóstico — ver nota acima).
      const [prevSemana] = await sql`
        SELECT as_of::text AS as_of, payload
        FROM indicator_snapshots
        WHERE company_id = ${company.id} AND as_of <= (${asOf}::date - 5)
        ORDER BY as_of DESC
        LIMIT 1`;
      let weeklyStored: unknown = null;
      if (prevSemana) {
        const prevPayload = prevSemana.payload as Payload;
        const ivNow = (k: string): number | null => {
          const v = (indicators[k] as { value?: unknown } | undefined)?.value;
          return typeof v === 'number' ? v : null;
        };
        const facts: WeeklyFacts = {
          cashNowCents: ivNow('cash_balance'),
          cashPrevCents: valorInd(prevPayload, 'cash_balance'),
          cashCycleNow: ivNow('cash_cycle'),
          cashCyclePrev: valorInd(prevPayload, 'cash_cycle'),
          revenueNowCents: ivNow('revenue_current'),
          revenuePrevCents: valorInd(prevPayload, 'revenue_current'),
          daysBetween: Math.round(
            (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${prevSemana.as_of}T00:00:00Z`)) / 86_400_000,
          ),
        };
        const weeklyText = await writeWeekly(alertWriter, facts, profile);
        weeklyStored = { text: weeklyText, facts, comparedTo: prevSemana.as_of };
      }

      const gravados: Array<{
        id: string;
        ruleKey: string;
        severity: string;
        title: string | null;
        body: string | null;
      }> = [];
      const snapshotId = await sql.begin(async (tx) => {
        const [s] = await tx`
          INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload, diagnosis, weekly_summary)
          VALUES (${company.id}, ${asOf}, ${CORE_VERSION}, ${tx.json(indicators as never)},
                  ${tx.json(diagnosisStored as never)},
                  ${weeklyStored ? tx.json(weeklyStored as never) : null})
          ON CONFLICT (company_id, as_of)
          DO UPDATE SET core_version = EXCLUDED.core_version,
                        payload = EXCLUDED.payload,
                        diagnosis = EXCLUDED.diagnosis,
                        weekly_summary = EXCLUDED.weekly_summary,
                        computed_at = now()
          RETURNING id`;

        // recalcular o mesmo dia substitui os alertas daquele dia
        await tx`DELETE FROM alerts WHERE snapshot_id = ${s.id}`;
        for (const { alert: a, text } of written) {
          const [row] = await tx`
            INSERT INTO alerts (company_id, snapshot_id, rule_key, severity, facts,
                                text_title, text_body, model_version)
            VALUES (${company.id}, ${s.id}, ${a.ruleKey}, ${a.severity}, ${tx.json(a.facts as never)},
                    ${text.title}, ${text.body}, ${text.modelVersion})
            RETURNING id`;
          gravados.push({
            id: row.id as string,
            ruleKey: a.ruleKey,
            severity: a.severity,
            title: text.title,
            body: text.body,
          });
        }
        return s.id as string;
      });

  // medição do consumo da IA (best-effort): nunca derruba o snapshot
  try {
    await recordAiUsage(sql, company.id, 'alert_writer', aiUsage);
  } catch (err) {
    log?.error({ err }, 'falha ao registrar consumo de IA');
  }

  // entrega no celular (best-effort): nunca derruba o snapshot
  if (pushSender) {
    try {
      await notifyNewAlerts(sql, pushSender, company.id, gravados, jaAvisado);
    } catch (err) {
      log?.error({ err }, 'falha ao enviar push dos alertas');
    }
  }

  return {
    snapshotId,
    asOf,
    coreVersion: CORE_VERSION,
    diagnosis: diagnosisStored,
    alerts: written.map(({ alert: a, text }) => ({
      ruleKey: a.ruleKey,
      severity: a.severity,
      facts: a.facts,
      textTitle: text.title,
      textBody: text.body,
      modelVersion: text.modelVersion,
    })),
  };
}

export function registerSnapshots(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
  app.post<{ Params: { id: string }; Body: { asOf?: string } | undefined }>(
    '/companies/:id/snapshots',
    {
      schema: {
        params: companyParamsSchema,
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: { asOf: { type: 'string', pattern: DATE_PATTERN } },
        },
      },
    },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
      const asOf = req.body?.asOf ?? new Date().toISOString().slice(0, 10);
      const result = await computeAndStore(sql, company, asOf, alertWriter, pushSender, app.log);
      return reply.code(201).send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/companies/:id/dashboard',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });

      const dash = await buildDashboard(sql, company);
      if (!dash) {
        return reply.code(404).send({
          error: 'Nenhum cálculo feito ainda. Importe dados e crie um snapshot primeiro.',
        });
      }
      return dash;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/companies/:id/alerts',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });

      const rows = await sql`
        SELECT id, rule_key, severity::text AS severity, facts, text_title, text_body,
               created_at, pushed_at, opened_at, acted_at
        FROM alerts
        WHERE company_id = ${company.id}
        ORDER BY created_at DESC
        LIMIT 100`;

      return {
        alerts: rows.map((a) => ({
          id: a.id,
          ruleKey: a.rule_key,
          severity: a.severity,
          facts: a.facts,
          textTitle: a.text_title,
          textBody: a.text_body,
          createdAt: a.created_at,
          pushedAt: a.pushed_at,
          openedAt: a.opened_at,
          actedAt: a.acted_at,
        })),
      };
    },
  );

  // ---- Insumo do dono logado: caixa hoje + custo fixo → o motor gira ----
  // Onboarding MÍNIMO. Com as Contas (a receber/pagar) já cadastradas, estes
  // dois números bastam para a projeção de caixa e os alertas rodarem numa
  // conta real, sem depender do import de arquivo do especialista. NENHUMA
  // conta aqui: só guardamos os números e chamamos o mesmo motor.
  app.get('/me/setup', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });

    const [bal] = await sql`
      SELECT observed_on::text AS observed_on, balance_cents
      FROM cash_balances WHERE company_id = ${company.id}
      ORDER BY observed_on DESC LIMIT 1`;
    const [planned] = await sql`
      SELECT count(*)::int AS count FROM planned_entries
      WHERE company_id = ${company.id} AND status = 'prevista'`;
    const [snap] = await sql`
      SELECT 1 FROM indicator_snapshots WHERE company_id = ${company.id} LIMIT 1`;

    return {
      name: company.name,
      cashBalanceCents: (bal?.balance_cents as number | undefined) ?? null,
      cashBalanceOn: (bal?.observed_on as string | undefined) ?? null,
      fixedCostCents: company.declared_fixed_cost_cents ?? null,
      plannedCount: (planned?.count as number | undefined) ?? 0,
      hasSnapshot: Boolean(snap),
    };
  });

  app.post<{ Body: { cashBalanceCents: number; fixedCostCents: number } }>(
    '/me/setup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['cashBalanceCents', 'fixedCostCents'],
          additionalProperties: false,
          properties: {
            cashBalanceCents: { type: 'integer' }, // pode ser negativo: cheque especial
            fixedCostCents: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const today = new Date().toISOString().slice(0, 10);
      await sql`
        INSERT INTO cash_balances (company_id, observed_on, balance_cents)
        VALUES (${company.id}, ${today}, ${req.body.cashBalanceCents})
        ON CONFLICT (company_id, observed_on)
        DO UPDATE SET balance_cents = EXCLUDED.balance_cents`;
      await sql`
        UPDATE companies SET declared_fixed_cost_cents = ${req.body.fixedCostCents}
        WHERE id = ${company.id}`;

      // o motor lê o custo fixo do objeto company; atualizamos a cópia local
      company.declared_fixed_cost_cents = req.body.fixedCostCents;
      await computeAndStore(sql, company, today, alertWriter, pushSender, app.log);

      // devolve o painel já recalculado, para o app mostrar o resultado na hora
      const dash = await buildDashboard(sql, company);
      return reply.code(201).send(dash ?? { company: toCompanyJson(company), snapshot: null, alerts: [] });
    },
  );
}
