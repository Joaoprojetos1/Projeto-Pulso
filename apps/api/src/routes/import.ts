/**
 * Aba Dados: o dono envia arquivos classificados por tipo; o servidor guarda,
 * lê o que sabe ler e mostra a lista do que já foi enviado (transparência).
 *
 * Fecha o ciclo dos parsers: o CÓDIGO lê (nunca a IA — dado bruto jamais vai a
 * prompt). Hoje o leitor cobre o EXTRATO BANCÁRIO (PDF Inter/Santander, OFX);
 * os demais tipos são GUARDADOS com situação "recebido" até o leitor existir —
 * o dono vê exatamente o que o motor está considerando.
 *
 * REGRA: nenhuma conta financeira aqui. Toda soma vem do parser e do core.
 */

import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { AlertWriterModel } from '../ai/writer';
import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { toCompanyJson, UUID_PATTERN } from '../http';
import { detectAndParseBankStatement } from '../parsers/detect';
import { ParseError } from '../parsers/types';
import type { PushSender } from '../push';
import { saoPauloToday } from '../quota';
import { buildDashboard, computeAndStore } from './snapshots';

/** Teto do arquivo cru (bytes). Extrato de banco é pequeno; isto é folga. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Tipos de documento que a aba Dados aceita. */
const DOC_TYPES = [
  'bank_statement',
  'inventory',
  'management',
  'services',
  'card_acquirer',
  'accounting',
  'other',
] as const;
type DocType = (typeof DOC_TYPES)[number];

/** Data mais recente com saldo (o "hoje" do negócio), senão hoje. */
async function latestAsOf(sql: Sql, companyId: string): Promise<string> {
  const [b] = await sql`
    SELECT observed_on::text AS d FROM cash_balances
    WHERE company_id = ${companyId} ORDER BY observed_on DESC LIMIT 1`;
  return (b?.d as string | undefined) ?? saoPauloToday();
}

export function registerImport(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
  app.post<{ Body: { filename: string; contentBase64: string; docType?: DocType } }>(
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
            docType: { type: 'string', enum: DOC_TYPES as unknown as string[] },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const docType: DocType = req.body.docType ?? 'bank_statement';
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

      // Tipos ainda SEM leitor: guardamos o arquivo classificado com situação
      // "recebido" (transparência), sem tentar interpretar. O extrato bancário é
      // o único com leitor hoje.
      if (docType !== 'bank_statement') {
        await sql`
          INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count, doc_type, filename, status)
          VALUES (${company.id}, ${docType}, NULL, NULL, ${fileHash}, 0, ${docType}, ${req.body.filename}, 'received')`;
        const dash = await buildDashboard(sql, company);
        return reply.code(201).send({
          ...(dash ?? { company: toCompanyJson(company), snapshot: null, alerts: [] }),
          import: { docType, status: 'received', rowsImported: 0 },
        });
      }

      // Extrato bancário: o CÓDIGO lê o arquivo (nunca a IA)
      let result;
      try {
        result = await detectAndParseBankStatement(req.body.filename, buf);
      } catch (err) {
        if (err instanceof ParseError) {
          // guarda o registro com situação de erro, para o dono ver que não deu
          await sql`
            INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count, doc_type, filename, status)
            VALUES (${company.id}, 'bank_statement', NULL, NULL, ${fileHash}, 0, 'bank_statement', ${req.body.filename}, 'error')`;
          return reply.code(422).send({ error: err.message });
        }
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
          INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count, doc_type, filename, status)
          VALUES (${company.id}, ${result.meta.source}, ${periodStart}, ${periodEnd}, ${fileHash}, ${entries.length}, 'bank_statement', ${req.body.filename}, 'processed')
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
          docType: 'bank_statement',
          status: 'processed',
          source: result.meta.source,
          rowsImported: entries.length,
          balancesImported: result.balances.length,
          period: { from: periodStart, to: periodEnd },
          warnings: result.warnings.length,
        },
      });
    },
  );

  // Lista tudo que já foi enviado: tipo, período, data de envio e situação.
  app.get('/me/imports', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    const rows = await sql`
      SELECT id, doc_type, source, filename, status,
             period_start::text AS period_start, period_end::text AS period_end,
             row_count, imported_at
      FROM imports WHERE company_id = ${company.id}
      ORDER BY imported_at DESC`;
    return {
      imports: rows.map((r) => ({
        id: r.id,
        docType: (r.doc_type as string | null) ?? r.source,
        filename: r.filename,
        status: r.status,
        periodStart: r.period_start,
        periodEnd: r.period_end,
        rowCount: r.row_count,
        importedAt: r.imported_at,
      })),
    };
  });

  // Remove um arquivo enviado por engano: apaga o registro (os lançamentos vão
  // junto pela FK ON DELETE CASCADE) e RECALCULA o painel.
  app.delete<{ Params: { id: string } }>(
    '/me/imports/:id',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: UUID_PATTERN } } } } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      const [imp] = await sql`
        SELECT id FROM imports WHERE id = ${req.params.id} AND company_id = ${company.id}`;
      if (!imp) return reply.code(404).send({ error: 'Arquivo não encontrado.' });

      await sql`DELETE FROM imports WHERE id = ${req.params.id} AND company_id = ${company.id}`;
      // recalcula com o que sobrou (best-effort: se não houver mais saldo, cai no vazio)
      const asOf = await latestAsOf(sql, company.id);
      try {
        await computeAndStore(sql, company, asOf, alertWriter, pushSender, app.log);
      } catch (err) {
        app.log.warn({ err }, 'falha ao recalcular após remover import');
      }
      const dash = await buildDashboard(sql, company);
      return reply.code(200).send({ ...(dash ?? {}), removed: true });
    },
  );
}
