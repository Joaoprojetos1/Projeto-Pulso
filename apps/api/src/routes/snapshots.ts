import { computeAll, CORE_VERSION, evaluate } from '@pulso/core';
import type { CompanySnapshot } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import { writeAlert, type AlertWriterModel } from '../ai/writer';
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

async function loadCompanySnapshot(
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

      // lido antes de recalcular: o recálculo do dia apaga os alertas (e o pushed_at)
      const jaAvisado = pushSender
        ? await recentlyPushedRuleKeys(sql, company.id)
        : new Set<string>();

      const snap = await loadCompanySnapshot(sql, company, asOf);
      const indicators = computeAll(snap);
      const alerts = evaluate(indicators);

      // a voz do Pulso: a IA (ou o template) redige a partir dos facts —
      // e de NADA além dos facts
      const profile = { name: company.name, niche: company.niche };
      const written = await Promise.all(
        alerts.map(async (a) => ({ alert: a, text: await writeAlert(alertWriter, a, profile) })),
      );

      const gravados: Array<{
        id: string;
        ruleKey: string;
        severity: string;
        title: string | null;
        body: string | null;
      }> = [];
      const snapshotId = await sql.begin(async (tx) => {
        const [s] = await tx`
          INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload)
          VALUES (${company.id}, ${asOf}, ${CORE_VERSION}, ${tx.json(indicators as never)})
          ON CONFLICT (company_id, as_of)
          DO UPDATE SET core_version = EXCLUDED.core_version,
                        payload = EXCLUDED.payload,
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

      // entrega no celular (best-effort): nunca derruba o snapshot
      if (pushSender) {
        try {
          await notifyNewAlerts(sql, pushSender, company.id, gravados, jaAvisado);
        } catch (err) {
          app.log.error({ err }, 'falha ao enviar push dos alertas');
        }
      }

      return reply.code(201).send({
        snapshotId,
        asOf,
        coreVersion: CORE_VERSION,
        alerts: written.map(({ alert: a, text }) => ({
          ruleKey: a.ruleKey,
          severity: a.severity,
          facts: a.facts,
          textTitle: text.title,
          textBody: text.body,
          modelVersion: text.modelVersion,
        })),
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/companies/:id/dashboard',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });

      const [snapshot] = await sql`
        SELECT id, as_of::text AS as_of, core_version, payload, computed_at
        FROM indicator_snapshots
        WHERE company_id = ${company.id}
        ORDER BY as_of DESC
        LIMIT 1`;
      if (!snapshot) {
        return reply.code(404).send({
          error: 'Nenhum cálculo feito ainda. Importe dados e crie um snapshot primeiro.',
        });
      }

      // ordenação de apresentação (o pior primeiro), espelhando o core
      const alertRows = await sql`
        SELECT rule_key, severity::text AS severity, facts, text_title, text_body, created_at
        FROM alerts
        WHERE snapshot_id = ${snapshot.id}
        ORDER BY CASE severity::text WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, created_at`;

      return {
        company: toCompanyJson(company),
        snapshot: {
          asOf: snapshot.as_of,
          coreVersion: snapshot.core_version,
          computedAt: snapshot.computed_at,
          indicators: snapshot.payload,
        },
        alerts: alertRows.map((a) => ({
          ruleKey: a.rule_key,
          severity: a.severity,
          facts: a.facts,
          textTitle: a.text_title,
          textBody: a.text_body,
          createdAt: a.created_at,
        })),
      };
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
}
