/**
 * Custo fixo por CONFIRMAÇÃO, não por formulário (itens 2.7 e 2.8).
 *
 * O motor (core/fixed-cost.ts) infere os débitos recorrentes dos lançamentos já
 * enviados; o dono confirma, corrige ou acrescenta. A SOMA dos itens confirmados
 * vira `companies.declared_fixed_cost_cents` (o que o core já consome), e os
 * itens ficam guardados para o "de onde vem esse número".
 *
 * REGRA: a inferência é do CORE (determinística). Aqui só carregamos os dados,
 * chamamos o core e persistimos — nenhuma conta financeira nesta camada.
 */

import { inferFixedCosts } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import type { AlertWriterModel } from '../ai/writer';
import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import type { PushSender } from '../push';
import { saoPauloToday } from '../quota';
import { buildDashboard, computeAndStore, loadCompanySnapshot } from './snapshots';

/** Data mais recente com saldo (o "hoje" do negócio), senão hoje. */
async function latestAsOf(sql: Sql, companyId: string): Promise<string> {
  const [b] = await sql`
    SELECT observed_on::text AS d FROM cash_balances
    WHERE company_id = ${companyId} ORDER BY observed_on DESC LIMIT 1`;
  return (b?.d as string | undefined) ?? saoPauloToday();
}

async function loadItems(sql: Sql, companyId: string) {
  const rows = await sql`
    SELECT id, label, amount_cents, category, source
    FROM fixed_cost_items WHERE company_id = ${companyId}
    ORDER BY amount_cents DESC`;
  return rows.map((r) => ({
    id: r.id as string,
    label: r.label as string,
    amountCents: r.amount_cents as number,
    category: (r.category as string | null) ?? null,
    // 'payroll' entra quando o dono confirma a extração de uma folha de pagamento
    source: r.source as 'inferred' | 'manual' | 'payroll',
  }));
}

export function registerFixedCost(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
  // O que o motor identificou como recorrente + o que o dono já confirmou.
  app.get('/me/fixed-cost', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });

    const asOf = await latestAsOf(sql, company.id);
    const snap = await loadCompanySnapshot(sql, company, asOf);
    const suggestions = inferFixedCosts(snap.entries, asOf);
    const items = await loadItems(sql, company.id);

    return {
      // sugestões do motor (o dono confirma/corrige)
      suggestions: suggestions.map((s) => ({
        label: s.label,
        monthlyCents: s.monthlyCents,
        occurrences: s.occurrences,
        category: s.category ?? null,
        months: s.months,
      })),
      items,
      declaredFixedCostCents: company.declared_fixed_cost_cents ?? null,
    };
  });

  // O dono confirma a lista final. Substituímos os itens, somamos e mandamos o
  // motor recalcular. A soma é o custo fixo que o core usa.
  app.put<{ Body: { items: Array<{ label: string; amountCents: number; category?: string | null; source?: 'inferred' | 'manual' | 'payroll' }> } }>(
    '/me/fixed-cost',
    {
      schema: {
        body: {
          type: 'object',
          required: ['items'],
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              maxItems: 60,
              items: {
                type: 'object',
                required: ['label', 'amountCents'],
                additionalProperties: false,
                properties: {
                  label: { type: 'string', minLength: 1, maxLength: 120 },
                  amountCents: { type: 'integer', minimum: 0 },
                  category: { type: ['string', 'null'], maxLength: 120 },
                  source: { type: 'string', enum: ['inferred', 'manual', 'payroll'] },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const total = req.body.items.reduce((s, i) => s + i.amountCents, 0);

      await sql.begin(async (tx) => {
        await tx`DELETE FROM fixed_cost_items WHERE company_id = ${company.id}`;
        if (req.body.items.length > 0) {
          const rows = req.body.items.map((i) => ({
            company_id: company.id,
            label: i.label,
            amount_cents: i.amountCents,
            category: i.category ?? null,
            source: i.source ?? 'manual',
          }));
          await tx`INSERT INTO fixed_cost_items ${tx(rows)}`;
        }
        await tx`UPDATE companies SET declared_fixed_cost_cents = ${total} WHERE id = ${company.id}`;
      });

      // o motor lê o custo fixo do objeto company; atualiza a cópia local e recalcula
      company.declared_fixed_cost_cents = total;
      const asOf = await latestAsOf(sql, company.id);
      await computeAndStore(sql, company, asOf, alertWriter, pushSender, app.log);

      const dash = await buildDashboard(sql, company);
      return reply.code(200).send({
        items: await loadItems(sql, company.id),
        declaredFixedCostCents: total,
        dashboard: dash,
      });
    },
  );
}
