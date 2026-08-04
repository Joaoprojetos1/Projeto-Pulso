/**
 * Import de arquivo do dono logado: extrato bancário → schema canônico → motor.
 *
 * Fecha o ciclo dos parsers: o dono sobe o arquivo, o CÓDIGO lê (nunca a IA —
 * dado bruto jamais vai a prompt), converte para `entries`/`cash_balances` e
 * roda o mesmo `computeAndStore` do resto do sistema. Idempotente por hash do
 * arquivo (a tabela `imports` não deixa importar o mesmo arquivo duas vezes).
 *
 * REGRA: nenhuma conta financeira aqui. Toda soma vem do parser (string→centavos)
 * e do core.
 */

import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { AlertWriterModel } from '../ai/writer';
import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { toCompanyJson } from '../http';
import { detectAndParseBankStatement } from '../parsers/detect';
import { ParseError } from '../parsers/types';
import type { PushSender } from '../push';
import { saoPauloToday } from '../quota';
import { buildDashboard, computeAndStore } from './snapshots';

/** Teto do arquivo cru (bytes). Extrato de banco é pequeno; isto é folga. */
const MAX_BYTES = 25 * 1024 * 1024;

export function registerImport(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
  app.post<{ Body: { filename: string; contentBase64: string } }>(
    '/me/import',
    {
      // o corpo carrega o arquivo em base64 (infla ~33%); folga sobre MAX_BYTES
      bodyLimit: 35 * 1024 * 1024,
      schema: {
        body: {
          type: 'object',
          required: ['filename', 'contentBase64'],
          additionalProperties: false,
          properties: {
            filename: { type: 'string', maxLength: 512 },
            contentBase64: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const buf = Buffer.from(req.body.contentBase64, 'base64');
      if (buf.length === 0) return reply.code(400).send({ error: 'Arquivo vazio ou inválido.' });
      if (buf.length > MAX_BYTES) return reply.code(413).send({ error: 'Arquivo grande demais.' });

      // idempotência: o mesmo arquivo não entra duas vezes
      const fileHash = createHash('sha256').update(buf).digest('hex');
      const [existing] = await sql`
        SELECT id FROM imports WHERE company_id = ${company.id} AND file_hash = ${fileHash}`;
      if (existing) {
        const dash = await buildDashboard(sql, company);
        return reply.code(200).send({ ...(dash ?? {}), import: { alreadyImported: true } });
      }

      // o CÓDIGO lê o arquivo (nunca a IA)
      let result;
      try {
        result = await detectAndParseBankStatement(req.body.filename, buf);
      } catch (err) {
        if (err instanceof ParseError) return reply.code(422).send({ error: err.message });
        throw err;
      }

      // amount_cents tem CHECK > 0 no schema: descarta lançamentos de valor zero
      const entries = result.entries.filter((e) => e.amountCents > 0);
      const today = saoPauloToday();
      const datas = entries.map((e) => e.settledOn ?? e.issuedOn).filter(Boolean).sort();
      const periodStart = result.meta.period?.from ?? datas[0] ?? today;
      const periodEnd = result.meta.period?.to ?? datas[datas.length - 1] ?? today;

      await sql.begin(async (tx) => {
        const [imp] = await tx`
          INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count)
          VALUES (${company.id}, ${result.meta.source}, ${periodStart}, ${periodEnd}, ${fileHash}, ${entries.length})
          RETURNING id`;
        if (entries.length > 0) {
          const rows = entries.map((e) => ({
            company_id: company.id,
            import_id: imp!.id as string,
            kind: e.kind,
            amount_cents: e.amountCents,
            issued_on: e.issuedOn,
            due_on: e.dueOn,
            settled_on: e.settledOn ?? null,
            counterparty: e.counterparty ?? null,
            category: e.category ?? null,
            cost_type: e.costType ?? null,
            external_id: e.id,
          }));
          await tx`INSERT INTO entries ${tx(rows)}`;
        }
        for (const b of result.balances) {
          await tx`
            INSERT INTO cash_balances (company_id, observed_on, balance_cents)
            VALUES (${company.id}, ${b.observedOn}, ${b.balanceCents})
            ON CONFLICT (company_id, observed_on) DO UPDATE SET balance_cents = EXCLUDED.balance_cents`;
        }
      });

      // recalcula na data mais recente que temos saldo (o "hoje" do extrato)
      const asOf =
        result.balances.length > 0
          ? result.balances.map((b) => b.observedOn).sort().at(-1)!
          : periodEnd;
      await computeAndStore(sql, company, asOf, alertWriter, pushSender, app.log);

      const dash = await buildDashboard(sql, company);
      return reply.code(201).send({
        ...(dash ?? { company: toCompanyJson(company), snapshot: null, alerts: [] }),
        import: {
          source: result.meta.source,
          rowsImported: entries.length,
          balancesImported: result.balances.length,
          period: { from: periodStart, to: periodEnd },
          warnings: result.warnings.length,
        },
      });
    },
  );
}
