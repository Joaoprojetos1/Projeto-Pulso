import { GENERIC_NICHE, isKnownNiche, nicheLabel, STAGE_ORDER } from '@pulso/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ChatModel } from '../ai/chat';
import type { AuthedUser } from '../auth';
import type { Sql } from '../db';
import { UUID_PATTERN } from '../http';
import { CompanyNotFoundError, converseAsSpecialist } from '../services/conversation';
import {
  GUIDANCE_SCOPES,
  isStage,
  MAX_EXAMPLE_ANSWER,
  MAX_EXAMPLE_QUESTION,
  MAX_GUIDANCE_BODY,
  MAX_GUIDANCE_TITLE,
  RULE_OPTIONS,
  scopeLabel,
  STAGE_LABELS,
  validScopeKey,
  type GuidanceScope,
} from '../services/specialist';
import { notFound, rateLimited, recordAudit, requireAdmin } from './admin/guard';

/**
 * Bancada do especialista — superfície de OPERADOR (papel admin).
 *
 * É onde o consultor ensina o Ivo sem depender de publicar código:
 *  - ORIENTAÇÕES: o que recomendar (geral, por estágio, por aviso). Tem rascunho,
 *    publicação, histórico e desfazer.
 *  - ENSAIO: perguntar ao Ivo como se fosse o dono de uma empresa, com ou sem os
 *    rascunhos, e ver quais orientações entraram e o que o fiscal barrou.
 *  - EXEMPLOS: a resposta corrigida por ele ("eu diria assim") vira referência.
 *
 * Tudo aqui é TEXTO de orientação. Nenhuma fórmula, limiar ou número de empresa
 * passa por estas rotas. Toda escrita é auditada (sem o texto: só ids e tamanhos).
 */

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

interface GuidanceRow {
  id: string;
  scope: GuidanceScope;
  scope_key: string;
  niche: string | null;
  title: string;
  body: string;
  published_body: string | null;
  published_at: Date | null;
  updated_at: Date;
}

function guidanceJson(r: GuidanceRow) {
  // rascunho: nunca publicada | publicada: no ar igual à tela | alterada: no ar,
  // mas a tela tem mudanças que ainda não valem.
  const status = r.published_body == null ? 'rascunho' : r.published_body === r.body ? 'publicada' : 'alterada';
  return {
    id: r.id,
    scope: r.scope,
    scopeKey: r.scope_key,
    scopeLabel: scopeLabel(r.scope, r.scope_key),
    niche: r.niche,
    nicheLabel: r.niche ? nicheLabel(r.niche) : null,
    title: r.title,
    body: r.body,
    publishedBody: r.published_body,
    publishedAt: iso(r.published_at),
    updatedAt: iso(r.updated_at),
    status,
  };
}

const GUIDANCE_COLUMNS = 'id, scope, scope_key, niche, title, body, published_body, published_at, updated_at';

/** Data para a tela, sempre em ISO (o texto cru do banco não é lido pelo navegador). */
function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Texto obrigatório: tira espaço das pontas; vazio vira null (quem chama recusa). */
function clean(value: string | undefined | null): string | null {
  const t = (value ?? '').trim();
  return t.length > 0 ? t : null;
}

/** null/'' = todos os segmentos; senão precisa ser um segmento conhecido. */
function parseNiche(value: string | null | undefined): { ok: true; niche: string | null } | { ok: false } {
  if (value == null || value === '') return { ok: true, niche: null };
  return isKnownNiche(value) ? { ok: true, niche: value } : { ok: false };
}

export function registerSpecialist(app: FastifyInstance, sql: Sql, chatModel: ChatModel | null = null) {
  const gate = async (req: FastifyRequest, reply: FastifyReply): Promise<AuthedUser | null> => {
    if (rateLimited(req, reply)) return null;
    return requireAdmin(sql, req, reply);
  };

  const findGuidance = async (id: string): Promise<GuidanceRow | undefined> => {
    const [row] = await sql.unsafe(`SELECT ${GUIDANCE_COLUMNS} FROM specialist_guidance WHERE id = $1`, [id]);
    return row as unknown as GuidanceRow | undefined;
  };

  // ---- a bancada inteira numa leitura -----------------------------------

  app.get('/admin/specialist', async (req, reply) => {
    const admin = await gate(req, reply);
    if (!admin) return reply;

    const [guidance, examples, companies] = await Promise.all([
      sql.unsafe(`
        SELECT ${GUIDANCE_COLUMNS} FROM specialist_guidance
        ORDER BY CASE scope WHEN 'geral' THEN 0 WHEN 'estagio' THEN 1 ELSE 2 END, scope_key, updated_at DESC`),
      sql`
        SELECT id, question, original_answer, answer, niche, stage, active, created_at
        FROM specialist_examples
        ORDER BY created_at DESC
        LIMIT 300`,
      // empresas para o ensaio: quem tem retrato primeiro (sem retrato o Ivo não responde)
      sql`
        SELECT c.id, c.name, c.niche, c.is_demo, s.stage, s.as_of
        FROM companies c
        LEFT JOIN LATERAL (
          SELECT diagnosis->>'stage' AS stage, as_of::text AS as_of
          FROM indicator_snapshots
          WHERE company_id = c.id
          ORDER BY as_of DESC
          LIMIT 1
        ) s ON true
        ORDER BY (s.as_of IS NULL), c.name
        LIMIT 200`,
    ]);

    return {
      guidance: (guidance as unknown as GuidanceRow[]).map(guidanceJson),
      examples: examples.map((e) => ({
        id: e.id as string,
        question: e.question as string,
        originalAnswer: (e.original_answer as string | null) ?? null,
        answer: e.answer as string,
        niche: (e.niche as string | null) ?? null,
        nicheLabel: e.niche ? nicheLabel(e.niche as string) : null,
        stage: (e.stage as string | null) ?? null,
        stageLabel: e.stage && isStage(e.stage as string) ? STAGE_LABELS[e.stage as keyof typeof STAGE_LABELS] : null,
        active: e.active as boolean,
        createdAt: iso(e.created_at as Date),
      })),
      companies: companies.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        niche: c.niche as string,
        nicheLabel: nicheLabel(c.niche as string),
        isDemo: c.is_demo as boolean,
        hasData: c.as_of != null,
        stage: (c.stage as string | null) ?? null,
        stageLabel: c.stage && isStage(c.stage as string) ? STAGE_LABELS[c.stage as keyof typeof STAGE_LABELS] : null,
      })),
      // as opções dos seletores vêm do servidor: a tela não conhece regra nem estágio
      options: {
        scopes: GUIDANCE_SCOPES,
        stages: STAGE_ORDER.map((s) => ({ key: s, label: STAGE_LABELS[s] })),
        rules: RULE_OPTIONS,
        niches: (['clinica', 'varejo', 'restaurante', GENERIC_NICHE] as const).map((n) => ({
          key: n,
          label: nicheLabel(n) ?? n,
        })),
        limits: {
          title: MAX_GUIDANCE_TITLE,
          body: MAX_GUIDANCE_BODY,
          question: MAX_EXAMPLE_QUESTION,
          answer: MAX_EXAMPLE_ANSWER,
        },
        aiAvailable: chatModel != null,
      },
    };
  });

  // ---- orientações -------------------------------------------------------

  app.post<{
    Body: { scope: string; scopeKey?: string; niche?: string | null; title: string; body: string };
  }>(
    '/admin/specialist/guidance',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['scope', 'title', 'body'],
          properties: {
            scope: { enum: GUIDANCE_SCOPES },
            scopeKey: { type: 'string', maxLength: 60 },
            niche: { type: ['string', 'null'], maxLength: 40 },
            title: { type: 'string', maxLength: MAX_GUIDANCE_TITLE },
            body: { type: 'string', maxLength: MAX_GUIDANCE_BODY },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;

      const scope = req.body.scope as GuidanceScope;
      const scopeKey = req.body.scopeKey ?? '';
      const title = clean(req.body.title);
      const body = clean(req.body.body);
      const niche = parseNiche(req.body.niche);
      if (!title) return reply.code(422).send({ error: 'Dê um título para a orientação.', field: 'title' });
      if (!body) return reply.code(422).send({ error: 'Escreva a orientação.', field: 'body' });
      if (!validScopeKey(scope, scopeKey)) {
        return reply.code(422).send({ error: 'Escolha a que situação a orientação se aplica.', field: 'scopeKey' });
      }
      if (!niche.ok) return reply.code(422).send({ error: 'Segmento não suportado.', field: 'niche' });

      // nasce como RASCUNHO: só vale para o dono depois de publicada
      const [row] = await sql`
        INSERT INTO specialist_guidance (scope, scope_key, niche, title, body, updated_by)
        VALUES (${scope}, ${scopeKey}, ${niche.niche}, ${title}, ${body}, ${admin.userId})
        RETURNING id`;
      await recordAudit(sql, admin.userId, 'specialist.guidance.create', { type: 'guidance', id: row!.id as string }, {
        scope,
        scopeKey,
        niche: niche.niche,
        chars: body.length,
      });
      return reply.code(201).send(guidanceJson((await findGuidance(row!.id as string))!));
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { title?: string; body?: string; niche?: string | null };
  }>(
    '/admin/specialist/guidance/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', maxLength: MAX_GUIDANCE_TITLE },
            body: { type: 'string', maxLength: MAX_GUIDANCE_BODY },
            niche: { type: ['string', 'null'], maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const atual = await findGuidance(req.params.id);
      if (!atual) return notFound(reply);

      const title = req.body.title === undefined ? atual.title : clean(req.body.title);
      const body = req.body.body === undefined ? atual.body : clean(req.body.body);
      if (!title) return reply.code(422).send({ error: 'Dê um título para a orientação.', field: 'title' });
      if (!body) return reply.code(422).send({ error: 'Escreva a orientação.', field: 'body' });
      let niche = atual.niche;
      if (req.body.niche !== undefined) {
        const parsed = parseNiche(req.body.niche);
        if (!parsed.ok) return reply.code(422).send({ error: 'Segmento não suportado.', field: 'niche' });
        niche = parsed.niche;
      }

      // edita só o RASCUNHO: o que está no ar (published_body) não muda aqui
      await sql`
        UPDATE specialist_guidance
        SET title = ${title}, body = ${body}, niche = ${niche},
            updated_by = ${admin.userId}, updated_at = now()
        WHERE id = ${req.params.id}`;
      await recordAudit(sql, admin.userId, 'specialist.guidance.update', { type: 'guidance', id: req.params.id }, {
        chars: body.length,
        niche,
      });
      return guidanceJson((await findGuidance(req.params.id))!);
    },
  );

  // Publicar: o rascunho passa a ser o que a IA usa, e fica uma versão guardada.
  app.post<{ Params: { id: string } }>(
    '/admin/specialist/guidance/:id/publish',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const atual = await findGuidance(req.params.id);
      if (!atual) return notFound(reply);

      // publicar de novo o mesmo texto não cria versão repetida
      if (atual.published_body !== atual.body) {
        await sql.begin(async (tx) => {
          await tx`
            UPDATE specialist_guidance
            SET published_body = body, published_at = now(), updated_by = ${admin.userId}
            WHERE id = ${req.params.id}`;
          await tx`
            INSERT INTO specialist_guidance_versions (guidance_id, body, published_by)
            VALUES (${req.params.id}, ${atual.body}, ${admin.userId})`;
        });
        await recordAudit(sql, admin.userId, 'specialist.guidance.publish', { type: 'guidance', id: req.params.id }, {
          chars: atual.body.length,
        });
      }
      return guidanceJson((await findGuidance(req.params.id))!);
    },
  );

  // Desligar: sai do ar na hora; o texto e o histórico ficam guardados.
  app.post<{ Params: { id: string } }>(
    '/admin/specialist/guidance/:id/unpublish',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const [row] = await sql`
        UPDATE specialist_guidance
        SET published_body = NULL, published_at = NULL, updated_by = ${admin.userId}
        WHERE id = ${req.params.id}
        RETURNING id`;
      if (!row) return notFound(reply);
      await recordAudit(sql, admin.userId, 'specialist.guidance.unpublish', { type: 'guidance', id: req.params.id }, null);
      return guidanceJson((await findGuidance(req.params.id))!);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/admin/specialist/guidance/:id/versions',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      if (!(await findGuidance(req.params.id))) return notFound(reply);
      const rows = await sql`
        SELECT v.id, v.body, v.published_at, u.email
        FROM specialist_guidance_versions v
        LEFT JOIN users u ON u.id = v.published_by
        WHERE v.guidance_id = ${req.params.id}
        ORDER BY v.published_at DESC
        LIMIT 50`;
      return {
        versions: rows.map((v) => ({
          id: v.id as string,
          body: v.body as string,
          publishedAt: iso(v.published_at as Date),
          publishedBy: (v.email as string | null) ?? null,
        })),
      };
    },
  );

  // Voltar a uma versão: ela vira o RASCUNHO. Para valer, ainda precisa publicar
  // (assim ninguém põe texto no ar sem ver).
  app.post<{ Params: { id: string }; Body: { versionId: string } }>(
    '/admin/specialist/guidance/:id/restore',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['versionId'],
          properties: { versionId: { type: 'string', pattern: UUID_PATTERN } },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const [versao] = await sql`
        SELECT body FROM specialist_guidance_versions
        WHERE id = ${req.body.versionId} AND guidance_id = ${req.params.id}`;
      if (!versao) return notFound(reply);
      await sql`
        UPDATE specialist_guidance
        SET body = ${versao.body as string}, updated_by = ${admin.userId}, updated_at = now()
        WHERE id = ${req.params.id}`;
      await recordAudit(sql, admin.userId, 'specialist.guidance.restore', { type: 'guidance', id: req.params.id }, {
        versionId: req.body.versionId,
      });
      return guidanceJson((await findGuidance(req.params.id))!);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/specialist/guidance/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const [row] = await sql`DELETE FROM specialist_guidance WHERE id = ${req.params.id} RETURNING scope, scope_key`;
      if (!row) return notFound(reply);
      await recordAudit(sql, admin.userId, 'specialist.guidance.delete', { type: 'guidance', id: req.params.id }, {
        scope: row.scope,
        scopeKey: row.scope_key,
      });
      return { ok: true };
    },
  );

  // ---- ensaio: perguntar ao Ivo como se fosse o dono ---------------------

  app.post<{ Body: { companyId: string; question: string; includeDrafts?: boolean } }>(
    '/admin/specialist/try',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['companyId', 'question'],
          properties: {
            companyId: { type: 'string', pattern: UUID_PATTERN },
            question: { type: 'string', minLength: 1, maxLength: MAX_EXAMPLE_QUESTION },
            includeDrafts: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      if (!clean(req.body.question)) {
        return reply.code(422).send({ error: 'Escreva a pergunta.', field: 'question' });
      }
      try {
        const out = await converseAsSpecialist(
          { sql, chatModel },
          {
            companyId: req.body.companyId,
            question: req.body.question,
            includeDrafts: req.body.includeDrafts ?? false,
          },
        );
        // evento operacional, sem o texto da pergunta nem da resposta
        req.log.info(
          { orientacoes: out.applied.guidance.length, exemplos: out.applied.examples.length, barrada: out.blocked != null },
          'bancada: ensaio',
        );
        return {
          reply: out.reply,
          modelVersion: out.modelVersion,
          aiAvailable: chatModel != null,
          hasData: out.hasData,
          stage: out.stage,
          stageLabel: out.stage && isStage(out.stage) ? STAGE_LABELS[out.stage] : null,
          blocked: out.blocked,
          applied: {
            guidance: out.applied.guidance.map((g) => ({
              id: g.id,
              title: g.title,
              scopeLabel: scopeLabel(g.scope, g.scopeKey),
            })),
            examples: out.applied.examples.map((e) => ({ id: e.id, question: e.question })),
          },
        };
      } catch (e) {
        if (e instanceof CompanyNotFoundError) return notFound(reply);
        throw e;
      }
    },
  );

  // ---- exemplos: "eu diria assim" ----------------------------------------

  app.post<{
    Body: { question: string; answer: string; originalAnswer?: string | null; niche?: string | null; stage?: string | null };
  }>(
    '/admin/specialist/examples',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['question', 'answer'],
          properties: {
            question: { type: 'string', maxLength: MAX_EXAMPLE_QUESTION },
            answer: { type: 'string', maxLength: MAX_EXAMPLE_ANSWER },
            originalAnswer: { type: ['string', 'null'], maxLength: 4000 },
            niche: { type: ['string', 'null'], maxLength: 40 },
            stage: { type: ['string', 'null'], maxLength: 20 },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const question = clean(req.body.question);
      const answer = clean(req.body.answer);
      const niche = parseNiche(req.body.niche);
      const stage = req.body.stage ?? null;
      if (!question) return reply.code(422).send({ error: 'Falta a pergunta.', field: 'question' });
      if (!answer) return reply.code(422).send({ error: 'Escreva como você responderia.', field: 'answer' });
      if (!niche.ok) return reply.code(422).send({ error: 'Segmento não suportado.', field: 'niche' });
      if (stage != null && !isStage(stage)) {
        return reply.code(422).send({ error: 'Estágio não reconhecido.', field: 'stage' });
      }

      const [row] = await sql`
        INSERT INTO specialist_examples (question, original_answer, answer, niche, stage, created_by)
        VALUES (${question}, ${clean(req.body.originalAnswer)}, ${answer}, ${niche.niche}, ${stage}, ${admin.userId})
        RETURNING id`;
      await recordAudit(sql, admin.userId, 'specialist.example.create', { type: 'example', id: row!.id as string }, {
        niche: niche.niche,
        stage,
        chars: answer.length,
      });
      return reply.code(201).send({ id: row!.id as string });
    },
  );

  app.patch<{ Params: { id: string }; Body: { question?: string; answer?: string; active?: boolean } }>(
    '/admin/specialist/examples/:id',
    {
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            question: { type: 'string', maxLength: MAX_EXAMPLE_QUESTION },
            answer: { type: 'string', maxLength: MAX_EXAMPLE_ANSWER },
            active: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const question = req.body.question === undefined ? null : clean(req.body.question);
      const answer = req.body.answer === undefined ? null : clean(req.body.answer);
      if (req.body.question !== undefined && !question) {
        return reply.code(422).send({ error: 'Falta a pergunta.', field: 'question' });
      }
      if (req.body.answer !== undefined && !answer) {
        return reply.code(422).send({ error: 'Escreva como você responderia.', field: 'answer' });
      }
      const [row] = await sql`
        UPDATE specialist_examples
        SET question = COALESCE(${question}, question),
            answer   = COALESCE(${answer}, answer),
            active   = COALESCE(${req.body.active ?? null}, active),
            updated_at = now()
        WHERE id = ${req.params.id}
        RETURNING id`;
      if (!row) return notFound(reply);
      await recordAudit(sql, admin.userId, 'specialist.example.update', { type: 'example', id: req.params.id }, {
        active: req.body.active ?? null,
        editouTexto: question != null || answer != null,
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/admin/specialist/examples/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const admin = await gate(req, reply);
      if (!admin) return reply;
      const [row] = await sql`DELETE FROM specialist_examples WHERE id = ${req.params.id} RETURNING id`;
      if (!row) return notFound(reply);
      await recordAudit(sql, admin.userId, 'specialist.example.delete', { type: 'example', id: req.params.id }, null);
      return { ok: true };
    },
  );
}
