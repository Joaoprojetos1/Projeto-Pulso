import { simulate, type SimulationDelta } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { DATE_PATTERN } from '../http';
import { loadCompanySnapshot } from './snapshots';

/**
 * Simulação "e se" do dono logado.
 *
 * REGRA DE OURO INTACTA: nenhuma conta aqui. A rota monta o retrato vivo da
 * empresa (mesmos dados da projeção) e entrega ao core, que aplica os ajustes
 * hipotéticos e devolve as duas curvas. Determinístico, sem IA, sem custo —
 * e nada é alterado de verdade: o core simula sobre uma cópia.
 */

interface SimulateBody {
  deltas: SimulationDelta[];
  horizonDays?: number;
  asOf?: string;
}

const simulateBodySchema = {
  type: 'object',
  required: ['deltas'],
  additionalProperties: false,
  properties: {
    // o core valida e ignora deltas malformados; aqui só barramos o volume
    deltas: { type: 'array', maxItems: 20, items: { type: 'object' } },
    horizonDays: { type: 'integer', minimum: 1, maximum: 365 },
    asOf: { type: 'string', pattern: DATE_PATTERN },
  },
} as const;

export function registerSimulate(app: FastifyInstance, sql: Sql) {
  app.post<{ Body: SimulateBody }>(
    '/me/simulate',
    { schema: { body: simulateBodySchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login para simular.' });

      const asOf = req.body.asOf ?? new Date().toISOString().slice(0, 10);
      const snap = await loadCompanySnapshot(sql, company, asOf);

      const simulation = simulate(snap, req.body.deltas, { horizonDays: req.body.horizonDays });
      return { simulation };
    },
  );
}
