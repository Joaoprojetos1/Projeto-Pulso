/**
 * Aba Dados: o dono envia arquivos classificados por tipo; o servidor guarda,
 * lê o que sabe ler e mostra a lista do que já foi enviado (transparência).
 *
 * Fecha o ciclo dos parsers: o CÓDIGO lê o EXTRATO BANCÁRIO (PDF Inter/Santander,
 * OFX, CSV, Excel) — dado bruto de lançamento jamais vai a prompt. Os outros tipos
 * passam pela extração-com-confirmação (ai/extract.ts), cada um com seu destino:
 *
 *   folha           → custo fixo
 *   maquininha      → a receber PREVISTO (agenda de recebíveis)
 *   gerencial, estoque, serviços, contábil → números do mês do segmento
 *
 * Tipo sem leitor (ou sem chave de IA, ou sem segmento definido) continua sendo
 * GUARDADO com situação "recebido": o dono vê exatamente o que o motor considera.
 *
 * REGRA: nenhuma conta financeira aqui. Toda soma vem do parser e do core.
 */

import { createHash } from 'node:crypto';

import { segmentFields } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import {
  extractProposal,
  isExtractable,
  shapeOf,
  type ExtractableType,
  type ExtractedItem,
  type ExtractionContext,
  type ExtractionModel,
} from '../ai/extract';
import type { AlertWriterModel } from '../ai/writer';
import { companyFromRequest } from '../auth';
import type { CompanyRow } from '../http';
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
  'payroll',
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

/** Quem "deve" a agenda da maquininha: a adquirente. Identifica o que substituir. */
const CONTRAPARTE_MAQUININHA = 'Maquininha';

/**
 * Aplica uma extração CONFIRMADA ao motor, pela FORMA do tipo:
 *   fixed_cost  (folha)      → itens de custo fixo, soma vira declared_fixed_cost_cents
 *   receivables (maquininha) → contas PREVISTAS a receber (a agenda de recebíveis)
 *   ops         (relatórios) → números do mês do segmento (monthly_operations)
 *
 * REGRA: nenhuma conta financeira de negócio aqui — só gravamos os itens que o
 * DONO confirmou (o mesmo que ele faria à mão) e mandamos o core recalcular.
 */
async function applyConfirmed(
  sql: Sql,
  company: CompanyRow,
  docType: ExtractableType,
  items: ExtractedItem[],
  alertWriter: AlertWriterModel | null,
  pushSender: PushSender | null,
  log: FastifyInstance['log'],
) {
  const shape = shapeOf(docType);

  if (shape === 'fixed_cost') {
    await sql.begin(async (tx) => {
      // uma nova folha SUBSTITUI a anterior (o custo de pessoal do mês é um só,
      // não se acumula entre meses). Os itens inferidos/manuais ficam intactos.
      await tx`DELETE FROM fixed_cost_items WHERE company_id = ${company.id} AND source = ${docType}`;
      if (items.length > 0) {
        const rows = items.map((i) => ({
          company_id: company.id,
          label: i.label,
          amount_cents: i.amountCents ?? 0,
          category: 'Pessoal',
          source: docType,
        }));
        await tx`INSERT INTO fixed_cost_items ${tx(rows)}`;
      }
      const [{ total }] = await tx`
        SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total
        FROM fixed_cost_items WHERE company_id = ${company.id}`;
      await tx`UPDATE companies SET declared_fixed_cost_cents = ${Number(total)} WHERE id = ${company.id}`;
      company.declared_fixed_cost_cents = Number(total);
    });
  } else if (shape === 'receivables') {
    await sql.begin(async (tx) => {
      // a agenda nova SUBSTITUI a anterior da maquininha (é a mesma agenda,
      // atualizada). O que já foi confirmado como realizado e o que o dono
      // cadastrou à mão ficam intactos.
      await tx`
        DELETE FROM planned_entries
        WHERE company_id = ${company.id} AND kind = 'receivable'
          AND status = 'prevista' AND counterparty = ${CONTRAPARTE_MAQUININHA}`;
      if (items.length > 0) {
        const rows = items
          .filter((i) => i.dueOn && i.amountCents)
          .map((i) => ({
            company_id: company.id,
            kind: 'receivable',
            amount_cents: i.amountCents!,
            due_on: i.dueOn!,
            counterparty: CONTRAPARTE_MAQUININHA,
            category: i.label.slice(0, 60),
            recurrence: 'none',
            status: 'prevista',
          }));
        if (rows.length > 0) await tx`INSERT INTO planned_entries ${tx(rows)}`;
      }
    });
  } else {
    // ops: cada item é (campo do segmento, mês, valor) — o mesmo caminho do
    // formulário "Números do mês", agora vindo do arquivo em vez do teclado.
    for (const i of items) {
      if (!i.field || !i.month) continue;
      const valor = i.amountCents ?? i.quantity;
      if (valor == null) continue;
      await sql`
        INSERT INTO monthly_operations (company_id, ref_month, segment, field, value_num)
        VALUES (${company.id}, ${`${i.month}-01`}, ${company.niche}, ${i.field}, ${valor})
        ON CONFLICT (company_id, ref_month, field)
        DO UPDATE SET value_num = EXCLUDED.value_num, updated_at = now()`;
    }
  }

  const asOf = await latestAsOf(sql, company.id);
  await computeAndStore(sql, company, asOf, alertWriter, pushSender, log);
}

export function registerImport(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
  extractionModel: ExtractionModel | null = null,
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

      // Tipos EXTRAÍVEIS por IA. O CÓDIGO lê o arquivo → a IA TRANSCREVE os
      // valores → o CÓDIGO valida. Guardamos a PROPOSTA e o dono confirma antes
      // de qualquer número entrar no motor (nada é aplicado aqui). Sem modelo de
      // IA (sem chave), sem segmento definido (os relatórios dependem dos campos
      // do segmento) ou se a leitura falhar, cai no "recebido" honesto — leitura
      // automática indisponível, sem chutar.
      const campos = segmentFields(company.niche);
      const extraivel =
        docType !== 'bank_statement' &&
        isExtractable(docType) &&
        !!extractionModel &&
        (shapeOf(docType) !== 'ops' || campos.length > 0);

      if (extraivel && extractionModel && isExtractable(docType)) {
        const ctx: ExtractionContext = { fields: campos, today: saoPauloToday() };
        try {
          const proposal = await extractProposal(extractionModel, docType, buf, ctx);
          const [imp] = await sql`
            INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count, doc_type, filename, status, extraction)
            VALUES (${company.id}, ${docType}, NULL, NULL, ${fileHash}, ${proposal.items.length}, ${docType}, ${req.body.filename}, 'extracted',
                    ${sql.json({ items: proposal.items, issues: proposal.issues, shape: proposal.shape, modelVersion: proposal.modelVersion } as never)})
            RETURNING id`;
          const dash = await buildDashboard(sql, company);
          return reply.code(201).send({
            ...(dash ?? { company: toCompanyJson(company), snapshot: null, alerts: [] }),
            import: {
              id: imp!.id as string,
              docType,
              status: 'extracted',
              proposal: { items: proposal.items, issues: proposal.issues, shape: proposal.shape },
            },
          });
        } catch (err) {
          // leitura/transcrição falhou: guarda como erro (transparência), sem derrubar
          app.log.warn({ err, docType }, 'extração por tipo falhou; guardando como erro');
          await sql`
            INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count, doc_type, filename, status)
            VALUES (${company.id}, ${docType}, NULL, NULL, ${fileHash}, 0, ${docType}, ${req.body.filename}, 'error')`;
          const msg = err instanceof ParseError ? err.message : 'Não consegui ler este arquivo automaticamente.';
          return reply.code(422).send({ error: msg });
        }
      }

      // Tipos ainda SEM leitor: guardamos o arquivo classificado com situação
      // "recebido" (transparência), sem tentar interpretar.
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
             row_count, imported_at, extraction
      FROM imports WHERE company_id = ${company.id}
      ORDER BY imported_at DESC`;
    return {
      imports: rows.map((r) => {
        const ext = r.extraction as { items?: ExtractedItem[]; issues?: string[]; shape?: string } | null;
        return {
          id: r.id,
          docType: (r.doc_type as string | null) ?? r.source,
          filename: r.filename,
          status: r.status,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          rowCount: r.row_count,
          importedAt: r.imported_at,
          // proposta pendente (status 'extracted'): o app mostra para o dono confirmar
          proposal:
            r.status === 'extracted' && ext
              ? {
                  items: ext.items ?? [],
                  issues: ext.issues ?? [],
                  shape:
                    ext.shape ??
                    (isExtractable((r.doc_type as string) ?? '') ? shapeOf(r.doc_type as ExtractableType) : null),
                }
              : null,
        };
      }),
    };
  });

  // O dono CONFIRMA a proposta de extração (ex.: os valores lidos da folha). Só
  // aqui o número entra no motor. O corpo traz os itens já revisados/editados —
  // a fonte da verdade é o que o dono confirmou, não o que a IA leu.
  app.post<{
    Params: { id: string };
    Body: {
      items: Array<{
        label: string;
        amountCents?: number;
        quantity?: number;
        field?: string;
        month?: string;
        dueOn?: string;
      }>;
    };
  }>(
    '/me/imports/:id/confirm',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: UUID_PATTERN } } },
        body: {
          type: 'object',
          required: ['items'],
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              maxItems: 120,
              items: {
                type: 'object',
                required: ['label'],
                additionalProperties: false,
                properties: {
                  label: { type: 'string', minLength: 1, maxLength: 120 },
                  amountCents: { type: 'integer', minimum: 0 },
                  quantity: { type: 'integer', minimum: 0 },
                  field: { type: 'string', maxLength: 60 },
                  month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
                  dueOn: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
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

      const [imp] = await sql`
        SELECT id, doc_type, status FROM imports
        WHERE id = ${req.params.id} AND company_id = ${company.id}`;
      if (!imp) return reply.code(404).send({ error: 'Arquivo não encontrado.' });
      const docType = imp.doc_type as string | null;
      if (!docType || !isExtractable(docType)) {
        return reply.code(422).send({ error: 'Este arquivo não tem valores para confirmar.' });
      }
      // confirmar duas vezes duplicaria a agenda/os números: uma vez só.
      if (imp.status === 'confirmed') {
        return reply.code(409).send({ error: 'Este arquivo já foi confirmado.' });
      }

      // RECONFERÊNCIA no servidor: o que volta do app é só uma proposta revisada.
      // Campo tem que existir no segmento, mês não pode ser futuro, data prevista
      // tem que estar na faixa. Item que não passa é IGNORADO (nunca entra torto).
      const shape = shapeOf(docType);
      const slugs = new Set(segmentFields(company.niche).map((f) => f.slug));
      const unidadePorSlug = new Map(segmentFields(company.niche).map((f) => [f.slug, f.unit]));
      const hoje = saoPauloToday();
      const mesAtual = hoje.slice(0, 7);

      const items: ExtractedItem[] = [];
      for (const bruto of req.body.items) {
        const label = bruto.label.trim().slice(0, 120);
        if (!label) continue;
        const item: ExtractedItem = { label };

        if (shape === 'ops') {
          if (!bruto.field || !slugs.has(bruto.field)) continue;
          if (!bruto.month || bruto.month > mesAtual) continue;
          const unit = unidadePorSlug.get(bruto.field)!;
          const valor = unit === 'cents' ? bruto.amountCents : bruto.quantity;
          if (!valor || valor <= 0) continue;
          item.field = bruto.field;
          item.month = bruto.month;
          item.unit = unit;
          if (unit === 'cents') item.amountCents = valor;
          else item.quantity = valor;
        } else if (shape === 'receivables') {
          if (!bruto.dueOn || !bruto.amountCents || bruto.amountCents <= 0) continue;
          item.dueOn = bruto.dueOn;
          item.amountCents = bruto.amountCents;
        } else {
          if (!bruto.amountCents || bruto.amountCents <= 0) continue;
          item.amountCents = bruto.amountCents;
        }
        items.push(item);
      }

      await applyConfirmed(sql, company, docType, items, alertWriter, pushSender, app.log);
      await sql`UPDATE imports SET status = 'confirmed', row_count = ${items.length} WHERE id = ${imp.id}`;

      const dash = await buildDashboard(sql, company);
      return reply.code(200).send({
        ...(dash ?? {}),
        confirmed: { docType, itemsApplied: items.length },
      });
    },
  );

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
