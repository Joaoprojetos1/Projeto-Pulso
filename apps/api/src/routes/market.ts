import { isSegmentId, type SegmentId } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import type { Sql } from '../db';
import { refreshBenchmarks, type BenchmarkResearcher } from '../services/market';
import { requireAdmin } from './admin/guard';

/**
 * Referência de mercado (item 3.6) — superfície de OPERADOR.
 *
 * A IA pesquisa a média do setor + a fonte e o código valida (services/market).
 * Aqui o operador dispara a atualização e lê o que está gravado. O dono NÃO chama
 * isto — ele só VÊ o "acima/abaixo do mercado" na home (via buildDashboard). Sem
 * IA configurada, a atualização recusa (503) e o resto do produto não muda.
 */
export function registerMarket(app: FastifyInstance, sql: Sql, researcher: BenchmarkResearcher | null = null) {
  // Dispara a pesquisa+atualização (todos os alvos, ou de um segmento).
  app.post<{ Body: { segment?: string } }>(
    '/admin/market/refresh',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { segment: { type: 'string', maxLength: 40 } },
        },
      },
    },
    async (req, reply) => {
      const admin = await requireAdmin(sql, req, reply);
      if (!admin) return reply;
      if (!researcher) {
        return reply.code(503).send({ error: 'Pesquisa de mercado indisponível: IA não configurada.' });
      }
      const segment = req.body?.segment;
      if (segment != null && !isSegmentId(segment)) {
        return reply.code(422).send({ error: 'Segmento não suportado.' });
      }
      const result = await refreshBenchmarks(sql, researcher, {
        segment: segment as SegmentId | undefined,
        log: (msg, extra) => req.log.info(extra, `mercado: ${msg}`),
      });
      req.log.info({ updated: result.updated, skipped: result.skipped.length }, 'mercado: pesquisa concluída');
      return reply.send(result);
    },
  );

  // Lê os benchmarks gravados (com fonte e data) — para o painel e para conferência.
  app.get('/admin/market', async (req, reply) => {
    const admin = await requireAdmin(sql, req, reply);
    if (!admin) return reply;
    const rows = await sql`
      SELECT segment, indicator_key, typical_value, range_min, range_max, direction,
             source, as_of_month, fetched_at::text AS fetched_at
      FROM market_benchmarks ORDER BY segment, indicator_key`;
    return {
      benchmarks: rows.map((r) => ({
        segment: r.segment,
        indicatorKey: r.indicator_key,
        typicalValue: Number(r.typical_value),
        rangeMin: r.range_min != null ? Number(r.range_min) : null,
        rangeMax: r.range_max != null ? Number(r.range_max) : null,
        direction: r.direction,
        source: r.source,
        asOfMonth: r.as_of_month,
        fetchedAt: r.fetched_at,
      })),
    };
  });
}
