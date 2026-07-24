import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { DATE_PATTERN, UUID_PATTERN } from '../http';
import { saoPauloToday } from '../quota';

/**
 * Contas PREVISTAS — a camada de planejamento do dono (a pagar e a receber).
 *
 * SEPARAÇÃO INVIOLÁVEL: aqui é só o PREVISTO. O REALIZADO (extrato, `entries`)
 * não é tocado. Uma conta só "vira verdade" ao ser confirmada (graduação),
 * quando guardamos a data real — a diferença prevista×real vai ensinar, mais
 * adiante, o atraso de cada cliente. Nada aqui altera número auditado.
 */

interface ContaRow {
  id: string;
  kind: 'receivable' | 'payable';
  amount_cents: number;
  due_on: string;
  counterparty: string | null;
  category: string | null;
  recurrence: 'none' | 'monthly';
  status: 'prevista' | 'realizada';
  confirmed_on: string | null;
  created_at: Date;
}

const hoje = () => saoPauloToday();

/** Estado de apresentação: prevista | vencida (data passou, sem confirmar) | realizada. */
function statusApresentado(r: ContaRow, ref: string): 'prevista' | 'vencida' | 'realizada' {
  if (r.status === 'realizada') return 'realizada';
  return r.due_on < ref ? 'vencida' : 'prevista';
}

function toContaJson(r: ContaRow) {
  return {
    id: r.id,
    kind: r.kind,
    amountCents: r.amount_cents,
    dueOn: r.due_on,
    counterparty: r.counterparty,
    category: r.category,
    recurrence: r.recurrence,
    natureza: r.recurrence === 'monthly' ? 'recorrente' : 'avulsa',
    status: statusApresentado(r, hoje()),
    confirmedOn: r.confirmed_on,
    // TODO combinado com o CEO: enquanto não graduada, é sempre PREVISÃO na tela
    previsao: r.status !== 'realizada',
    createdAt: r.created_at,
  };
}

const createSchema = {
  type: 'object',
  required: ['kind', 'amountCents', 'dueOn'],
  additionalProperties: false,
  properties: {
    kind: { enum: ['receivable', 'payable'] },
    amountCents: { type: 'integer', minimum: 1 },
    dueOn: { type: 'string', pattern: DATE_PATTERN },
    counterparty: { type: 'string', maxLength: 200 },
    category: { type: 'string', maxLength: 80 },
    recurrence: { enum: ['none', 'monthly'] },
  },
} as const;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

interface CreateBody {
  kind: 'receivable' | 'payable';
  amountCents: number;
  dueOn: string;
  counterparty?: string;
  category?: string;
  recurrence?: 'none' | 'monthly';
}

const editSchema = {
  type: 'object',
  required: ['amountCents', 'dueOn'],
  additionalProperties: false,
  properties: {
    amountCents: { type: 'integer', minimum: 1 },
    dueOn: { type: 'string', pattern: DATE_PATTERN },
    counterparty: { type: 'string', maxLength: 200 },
    category: { type: 'string', maxLength: 80 },
    recurrence: { enum: ['none', 'monthly'] },
  },
} as const;

interface EditBody {
  amountCents: number;
  dueOn: string;
  counterparty?: string;
  category?: string;
  recurrence?: 'none' | 'monthly';
}

export function registerPlanned(app: FastifyInstance, sql: Sql) {
  // cadastrar uma conta prevista (a pagar ou a receber)
  app.post<{ Body: CreateBody }>(
    '/me/contas',
    { schema: { body: createSchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login para cadastrar contas.' });

      const b = req.body;
      const [row] = await sql`
        INSERT INTO planned_entries (company_id, kind, amount_cents, due_on, counterparty, category, recurrence)
        VALUES (${company.id}, ${b.kind}, ${b.amountCents}, ${b.dueOn},
                ${b.counterparty ?? null}, ${b.category ?? null}, ${b.recurrence ?? 'none'})
        RETURNING id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                  category, recurrence::text AS recurrence, status::text AS status,
                  confirmed_on::text AS confirmed_on, created_at`;
      return reply.code(201).send(toContaJson(row as unknown as ContaRow));
    },
  );

  // editar uma conta ainda PREVISTA (valor, data, contraparte, categoria, recorrência).
  // Conta já confirmada (graduada) não se edita — vira verdade e sai do planejamento.
  app.patch<{ Params: { id: string }; Body: EditBody }>(
    '/me/contas/:id',
    { schema: { params: idParams, body: editSchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const b = req.body;
      const [row] = await sql`
        UPDATE planned_entries SET
          amount_cents = ${b.amountCents},
          due_on = ${b.dueOn},
          counterparty = ${b.counterparty ?? null},
          category = ${b.category ?? null},
          recurrence = ${b.recurrence ?? 'none'}
        WHERE id = ${req.params.id} AND company_id = ${company.id} AND status = 'prevista'
        RETURNING id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                  category, recurrence::text AS recurrence, status::text AS status,
                  confirmed_on::text AS confirmed_on, created_at`;
      if (!row) return reply.code(404).send({ error: 'Conta não encontrada ou já confirmada.' });
      return toContaJson(row as unknown as ContaRow);
    },
  );

  // listar contas do dono; ?kind=receivable|payable filtra a visão
  app.get<{ Querystring: { kind?: string } }>('/me/contas', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login para ver suas contas.' });

    const kind = req.query.kind === 'payable' || req.query.kind === 'receivable' ? req.query.kind : null;
    const rows = kind
      ? await sql`
          SELECT id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                 category, recurrence::text AS recurrence, status::text AS status,
                 confirmed_on::text AS confirmed_on, created_at
          FROM planned_entries WHERE company_id = ${company.id} AND kind = ${kind}
          ORDER BY due_on`
      : await sql`
          SELECT id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                 category, recurrence::text AS recurrence, status::text AS status,
                 confirmed_on::text AS confirmed_on, created_at
          FROM planned_entries WHERE company_id = ${company.id}
          ORDER BY due_on`;

    return { contas: rows.map((r) => toContaJson(r as unknown as ContaRow)) };
  });

  // graduar: o dono confirma que a conta aconteceu (previsto → realizado)
  app.post<{ Params: { id: string }; Body: { confirmedOn?: string } | undefined }>(
    '/me/contas/:id/confirmar',
    {
      schema: {
        params: idParams,
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: { confirmedOn: { type: 'string', pattern: DATE_PATTERN } },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const quando = req.body?.confirmedOn ?? hoje();
      const [row] = await sql`
        UPDATE planned_entries
        SET status = 'realizada', confirmed_on = ${quando}
        WHERE id = ${req.params.id} AND company_id = ${company.id}
        RETURNING id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                  category, recurrence::text AS recurrence, status::text AS status,
                  confirmed_on::text AS confirmed_on, created_at`;
      if (!row) return reply.code(404).send({ error: 'Conta não encontrada.' });
      return toContaJson(row as unknown as ContaRow);
    },
  );

  // remover uma conta prevista (cadastro de baixo atrito: dá pra desfazer)
  app.delete<{ Params: { id: string } }>(
    '/me/contas/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const [row] = await sql`
        DELETE FROM planned_entries
        WHERE id = ${req.params.id} AND company_id = ${company.id}
        RETURNING id`;
      if (!row) return reply.code(404).send({ error: 'Conta não encontrada.' });
      return { ok: true, id: row.id };
    },
  );
}
