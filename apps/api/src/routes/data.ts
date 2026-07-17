import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { Sql } from '../db';
import { companyParamsSchema, DATE_PATTERN, findCompany } from '../http';

/**
 * Entrada de dados.
 *
 * Por enquanto a importação aceita lançamentos no formato canônico (JSON).
 * O parser de CSV do sistema da clínica entra aqui quando o export real
 * do especialista chegar — o formato não é inventado antes (KICKOFF, Passo 2).
 */

interface EntryPayload {
  kind: 'receivable' | 'payable';
  amountCents: number;
  issuedOn: string;
  dueOn?: string;
  settledOn?: string | null;
  counterparty?: string;
  category?: string;
  costType?: 'fixed' | 'variable';
  externalId?: string;
}

interface ImportBody {
  source?: string;
  periodStart: string;
  periodEnd: string;
  entries: EntryPayload[];
}

interface BalanceBody {
  observedOn: string;
  balanceCents: number;
}

const dateSchema = { type: 'string', pattern: DATE_PATTERN } as const;

const importBodySchema = {
  type: 'object',
  required: ['periodStart', 'periodEnd', 'entries'],
  additionalProperties: false,
  properties: {
    source: { type: 'string', minLength: 1 },
    periodStart: dateSchema,
    periodEnd: dateSchema,
    entries: {
      type: 'array',
      minItems: 1,
      maxItems: 20_000,
      items: {
        type: 'object',
        required: ['kind', 'amountCents', 'issuedOn'],
        additionalProperties: false,
        properties: {
          kind: { enum: ['receivable', 'payable'] },
          amountCents: { type: 'integer', minimum: 1 },
          issuedOn: dateSchema,
          dueOn: dateSchema,
          settledOn: { anyOf: [dateSchema, { type: 'null' }] },
          counterparty: { type: 'string' },
          category: { type: 'string' },
          costType: { enum: ['fixed', 'variable'] },
          externalId: { type: 'string' },
        },
      },
    },
  },
} as const;

export function registerData(app: FastifyInstance, sql: Sql) {
  app.post<{ Params: { id: string }; Body: ImportBody }>(
    '/companies/:id/imports',
    { schema: { params: companyParamsSchema, body: importBodySchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });

      const b = req.body;
      const fileHash = createHash('sha256').update(JSON.stringify(b.entries)).digest('hex');

      // idempotência: o mesmo arquivo nunca entra duas vezes
      const [existing] = await sql`
        SELECT id FROM imports WHERE company_id = ${company.id} AND file_hash = ${fileHash}`;
      if (existing) {
        return reply.code(200).send({
          imported: false,
          importId: existing.id,
          message: 'Este arquivo já foi importado antes. Nada foi duplicado.',
        });
      }

      try {
        const importId = await sql.begin(async (tx) => {
          const [imp] = await tx`
            INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count)
            VALUES (${company.id}, ${b.source ?? 'manual_json'}, ${b.periodStart}, ${b.periodEnd},
                    ${fileHash}, ${b.entries.length})
            RETURNING id`;

          const rows = b.entries.map((e) => ({
            company_id: company.id,
            import_id: imp.id,
            kind: e.kind,
            amount_cents: e.amountCents,
            issued_on: e.issuedOn,
            due_on: e.dueOn ?? e.issuedOn,
            settled_on: e.settledOn ?? null,
            counterparty: e.counterparty ?? null,
            category: e.category ?? null,
            cost_type: e.costType ?? null,
            external_id: e.externalId ?? null,
          }));

          // lotes de 500 para não estourar o limite de parâmetros do Postgres
          for (let i = 0; i < rows.length; i += 500) {
            await tx`INSERT INTO entries ${tx(rows.slice(i, i + 500))}`;
          }
          return imp.id as string;
        });

        return reply.code(201).send({ imported: true, importId, rowCount: b.entries.length });
      } catch (err) {
        // corrida entre duas importações iguais: o UNIQUE segura, respondemos idempotente
        if ((err as { code?: string }).code === '23505') {
          const [row] = await sql`
            SELECT id FROM imports WHERE company_id = ${company.id} AND file_hash = ${fileHash}`;
          return reply.code(200).send({
            imported: false,
            importId: row?.id ?? null,
            message: 'Este arquivo já foi importado antes. Nada foi duplicado.',
          });
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string }; Body: BalanceBody }>(
    '/companies/:id/balances',
    {
      schema: {
        params: companyParamsSchema,
        body: {
          type: 'object',
          required: ['observedOn', 'balanceCents'],
          additionalProperties: false,
          properties: {
            observedOn: dateSchema,
            // pode ser negativo: cheque especial
            balanceCents: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });

      const b = req.body;
      await sql`
        INSERT INTO cash_balances (company_id, observed_on, balance_cents)
        VALUES (${company.id}, ${b.observedOn}, ${b.balanceCents})
        ON CONFLICT (company_id, observed_on)
        DO UPDATE SET balance_cents = EXCLUDED.balance_cents`;

      return reply.code(201).send({ observedOn: b.observedOn, balanceCents: b.balanceCents });
    },
  );
}
