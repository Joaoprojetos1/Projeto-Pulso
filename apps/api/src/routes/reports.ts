/**
 * Aba Relatórios (item 2.9) — o histórico e a leitura de fundo.
 *
 * Duas leituras que só existem no TEMPO: a série de cada indicador ao longo dos
 * snapshots e o histórico das recomendações de melhoria (com data e situação).
 * Tudo já está calculado/gravado; aqui só montamos a série. NENHUMA conta
 * financeira nesta camada — os valores vêm prontos do payload do snapshot.
 */

import { getSegment } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';

/** Rótulos curtos dos indicadores UNIVERSAIS (os de segmento vêm do core). */
const UNIVERSAL_LABELS: Record<string, string> = {
  cash_balance: 'Caixa hoje',
  cash_cycle: 'Ciclo de caixa',
  contribution_margin: 'Margem',
  revenue_current: 'Receita do mês',
  ncg: 'Capital de giro',
  pmr: 'Prazo de recebimento',
  pmp: 'Prazo de pagamento',
  fixed_cost_monthly: 'Custo fixo',
  break_even_revenue: 'Ponto de equilíbrio',
  delinquency_rate: 'Inadimplência',
  customer_concentration: 'Concentração de cliente',
};

type PayloadInd = Record<string, { value?: unknown; unit?: string } | undefined>;

export function registerReports(app: FastifyInstance, sql: Sql) {
  // Série de cada indicador ao longo do tempo (universais + do segmento).
  app.get('/me/history', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });

    const rows = await sql`
      SELECT as_of::text AS as_of, payload,
             (diagnosis->>'stage') AS stage
      FROM indicator_snapshots
      WHERE company_id = ${company.id}
      ORDER BY as_of ASC`;

    // rótulos: universais + os do pacote do segmento da empresa
    const seg = getSegment(company.niche);
    const labels: Record<string, string> = { ...UNIVERSAL_LABELS };
    if (seg) for (const [key, meta] of Object.entries(seg.labels)) labels[key] = meta.label;

    // monta uma série por indicador que tenha ao menos um valor numérico
    const series = new Map<string, { key: string; label: string; unit: string | null; points: { asOf: string; value: number }[] }>();
    for (const r of rows) {
      const asOf = r.as_of as string;
      const payload = (r.payload ?? {}) as PayloadInd;
      for (const key of Object.keys(labels)) {
        const ind = payload[key];
        const value = ind?.value;
        if (typeof value !== 'number') continue;
        let s = series.get(key);
        if (!s) {
          s = { key, label: labels[key]!, unit: ind?.unit ?? null, points: [] };
          series.set(key, s);
        }
        s.points.push({ asOf, value });
      }
    }

    // histórico de estágio (diagnóstico) ao longo do tempo
    const stages = rows
      .filter((r) => r.stage)
      .map((r) => ({ asOf: r.as_of as string, stage: r.stage as string }));

    return {
      snapshots: rows.length,
      indicators: [...series.values()].filter((s) => s.points.length > 0),
      stages,
    };
  });

  // Histórico das recomendações de melhoria (com data e situação).
  app.get('/me/recommendations', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });

    const rows = await sql`
      SELECT claim_type, priority, title, why, action,
             first_recommended_on::text AS first_recommended_on,
             last_seen_on::text AS last_seen_on,
             resolved_on::text AS resolved_on
      FROM missing_info_recommendations
      WHERE company_id = ${company.id}
      ORDER BY (resolved_on IS NULL) DESC,
               CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
               first_recommended_on`;

    return {
      recommendations: rows.map((r) => ({
        claimType: r.claim_type,
        priority: r.priority,
        title: r.title,
        why: r.why,
        action: r.action,
        firstRecommendedOn: r.first_recommended_on,
        lastSeenOn: r.last_seen_on,
        resolvedOn: r.resolved_on,
        status: r.resolved_on ? 'resolvida' : 'aberta',
      })),
    };
  });
}
