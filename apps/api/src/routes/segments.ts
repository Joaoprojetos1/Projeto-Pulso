import {
  BLOCKS,
  getSegment,
  listSegments,
  questionnaireFor,
  scoreSurvey,
  segmentCoverage,
  segmentFields,
  type SegmentField,
  type SurveyAnswer,
  type SurveyResult,
} from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { companyParamsSchema, findCompany, type CompanyRow } from '../http';
import type { PushSender } from '../push';
import { saoPauloToday } from '../quota';
import type { AlertWriterModel } from '../ai/writer';
import { requireAdmin } from './admin/guard';
import { buildDashboard, computeAndStore } from './snapshots';

/**
 * Segmentos: números do mês (insumo dos indicadores de segmento) e diagnóstico
 * de gestão (o checklist). REGRA DA CASA: nenhuma conta financeira aqui — só
 * gravamos os números e chamamos o mesmo motor (core) para recalcular.
 */

const MONTH_PATTERN = '^\\d{4}-\\d{2}$';

// ---- leitura dos números do mês, agrupados por mês ----
interface OpRow {
  month: string;
  field: string;
  value_num: number;
}

async function readOperations(sql: Sql, company: CompanyRow) {
  const rows = (await sql`
    SELECT to_char(ref_month, 'YYYY-MM') AS month, field, value_num
    FROM monthly_operations WHERE company_id = ${company.id}
    ORDER BY ref_month DESC, field`) as unknown as OpRow[];

  const byMonth = new Map<string, Record<string, number>>();
  for (const r of rows) {
    if (!byMonth.has(r.month)) byMonth.set(r.month, {});
    byMonth.get(r.month)![r.field] = Number(r.value_num);
  }

  const fields: SegmentField[] = segmentFields(company.niche);
  const present = new Set(rows.map((r) => r.field));
  return {
    segment: company.niche,
    segmentLabel: getSegment(company.niche)?.label ?? null,
    fields, // definição do formulário (slug, label, unidade)
    months: [...byMonth.entries()].map(([month, values]) => ({ month, values })),
    coverage: segmentCoverage(company.niche, present),
  };
}

/** Devolutiva determinística do diagnóstico de gestão (o writer pode refinar depois). */
function surveyDevolutiva(result: SurveyResult): string {
  if (result.overall === null) return 'Responda o questionário para receber a leitura da sua gestão.';
  const [w1, w2] = result.weakest;
  if (!w1) return `Sua gestão está em ${result.overall} de 100. Continue acompanhando os números.`;
  const focos = [w1, w2].filter(Boolean).map((w) => `${w!.label} (${w!.focus})`).join(' e ');
  return `Sua gestão está em ${result.overall} de 100. Os pontos mais frágeis são ${focos}. Comece por aí.`;
}

async function readSurvey(sql: Sql, company: CompanyRow) {
  const rows = (await sql`
    SELECT question_id, answer, answered_on::text AS answered_on
    FROM management_survey_answers WHERE company_id = ${company.id}`) as unknown as Array<{
    question_id: string;
    answer: 'sim' | 'parcial' | 'nao';
    answered_on: string;
  }>;
  const answers: SurveyAnswer[] = rows.map((r) => ({ questionId: r.question_id, value: r.answer, answeredOn: r.answered_on }));
  const result = scoreSurvey(company.niche, answers);
  return {
    questions: questionnaireFor(company.niche),
    blocks: BLOCKS,
    answers: Object.fromEntries(rows.map((r) => [r.question_id, r.answer])),
    result,
    devolutiva: surveyDevolutiva(result),
  };
}

export function registerSegments(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
  // catálogo de segmentos (para o seletor do app/admin)
  app.get('/segments', async () => ({ segments: listSegments() }));

  // ---- números do mês do dono logado ----
  app.get('/me/operations', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    return readOperations(sql, company);
  });

  app.post<{ Body: { month: string; values: Record<string, number> } }>(
    '/me/operations',
    {
      schema: {
        body: {
          type: 'object',
          required: ['month', 'values'],
          additionalProperties: false,
          properties: {
            month: { type: 'string', pattern: MONTH_PATTERN },
            values: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const pkg = getSegment(company.niche);
      if (!pkg) return reply.code(400).send({ error: 'Sua empresa ainda não tem um segmento definido.' });

      const { month, values } = req.body;
      const validos = new Set(pkg.fields.map((f) => f.slug));
      const entradas = Object.entries(values);
      for (const [field] of entradas) {
        if (!validos.has(field)) return reply.code(400).send({ error: `Campo desconhecido para este segmento: ${field}.` });
      }

      const refMonth = `${month}-01`;
      for (const [field, value] of entradas) {
        await sql`
          INSERT INTO monthly_operations (company_id, ref_month, segment, field, value_num)
          VALUES (${company.id}, ${refMonth}, ${company.niche}, ${field}, ${value})
          ON CONFLICT (company_id, ref_month, field)
          DO UPDATE SET value_num = EXCLUDED.value_num, updated_at = now()`;
      }

      // recalcula com o mesmo motor (os indicadores de segmento passam a valer)
      const today = saoPauloToday();
      await computeAndStore(sql, company, today, alertWriter, pushSender, app.log);
      const dash = await buildDashboard(sql, company);
      const ops = await readOperations(sql, company);
      return reply.code(201).send({ ...ops, dashboard: dash });
    },
  );

  // ---- diagnóstico de gestão (questionário) do dono logado ----
  app.get('/me/survey', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    return readSurvey(sql, company);
  });

  app.post<{ Body: { answers: Record<string, 'sim' | 'parcial' | 'nao'> } }>(
    '/me/survey',
    {
      schema: {
        body: {
          type: 'object',
          required: ['answers'],
          additionalProperties: false,
          properties: {
            answers: { type: 'object', additionalProperties: { enum: ['sim', 'parcial', 'nao'] } },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const validos = new Set(questionnaireFor(company.niche).map((q) => q.id));
      const today = saoPauloToday();
      for (const [questionId, answer] of Object.entries(req.body.answers)) {
        if (!validos.has(questionId)) continue; // ignora perguntas fora do questionário do segmento
        await sql`
          INSERT INTO management_survey_answers (company_id, question_id, answer, answered_on)
          VALUES (${company.id}, ${questionId}, ${answer}, ${today})
          ON CONFLICT (company_id, question_id)
          DO UPDATE SET answer = EXCLUDED.answer, answered_on = EXCLUDED.answered_on, updated_at = now()`;
      }
      return reply.code(201).send(await readSurvey(sql, company));
    },
  );

  // ---- admin: números do mês e diagnóstico de gestão de qualquer empresa ----
  app.get<{ Params: { id: string } }>('/admin/companies/:id/operations', { schema: { params: companyParamsSchema } }, async (req, reply) => {
    const admin = await requireAdmin(sql, req, reply);
    if (!admin) return reply;
    const company = await findCompany(sql, req.params.id);
    if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
    return readOperations(sql, company);
  });

  app.get<{ Params: { id: string } }>('/admin/companies/:id/survey', { schema: { params: companyParamsSchema } }, async (req, reply) => {
    const admin = await requireAdmin(sql, req, reply);
    if (!admin) return reply;
    const company = await findCompany(sql, req.params.id);
    if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
    return readSurvey(sql, company);
  });
}
