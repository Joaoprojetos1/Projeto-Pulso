/**
 * Sócios da empresa + classificação de movimentos de sócio (inteligência do motor).
 *
 * A lista de sócios parte do quadro societário do CNPJ (semeada em company.ts) e o
 * dono acrescenta contas PF que não batem com o nome exato. O CÓDIGO (services/
 * partners.ts) casa o nome com a contraparte do lançamento e PROPÕE; o DONO confirma
 * a classificação. Só as classes 'aporte' e 'retirada' saem do motor (ver
 * loadCompanySnapshot) — o dinheiro segue no caixa, que vem do banco.
 *
 * REGRA: nenhuma conta financeira aqui. Classificar não recalcula nada sozinho —
 * chamamos o mesmo motor (computeAndStore) para refazer os números.
 */

import type { FastifyInstance } from 'fastify';

import type { AlertWriterModel } from '../ai/writer';
import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { UUID_PATTERN } from '../http';
import {
  matchPartner,
  normalizePartnerName,
  PARTY_CLASSES,
  suggestedClass,
  type PartnerRef,
} from '../services/partners';
import type { PushSender } from '../push';
import { saoPauloToday } from '../quota';
import { buildDashboard, computeAndStore } from './snapshots';

async function latestAsOf(sql: Sql, companyId: string): Promise<string> {
  const [b] = await sql`
    SELECT observed_on::text AS d FROM cash_balances
    WHERE company_id = ${companyId} ORDER BY observed_on DESC LIMIT 1`;
  return (b?.d as string | undefined) ?? saoPauloToday();
}

async function loadPartners(sql: Sql, companyId: string): Promise<PartnerRef[]> {
  const rows = await sql`
    SELECT id::text AS id, name, normalized_name FROM company_partners
    WHERE company_id = ${companyId} ORDER BY source, name`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, normalizedName: r.normalized_name as string }));
}

/** Lista para o app: inclui a origem e a observação. */
async function partnersJson(sql: Sql, companyId: string) {
  const rows = await sql`
    SELECT id::text AS id, name, source, note FROM company_partners
    WHERE company_id = ${companyId} ORDER BY source, name`;
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    source: r.source as 'cnpj' | 'manual',
    note: (r.note as string | null) ?? null,
  }));
}

export function registerPartners(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
  // Lista de sócios/contas (quadro do CNPJ + o que o dono acrescentou).
  app.get('/me/partners', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    return { partners: await partnersJson(sql, company.id) };
  });

  // Acrescenta um nome/conta de sócio (ex.: a conta PF de onde vêm os aportes).
  app.post<{ Body: { name: string; note?: string | null } }>(
    '/me/partners',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 200 },
            note: { type: ['string', 'null'], maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });
      const norm = normalizePartnerName(req.body.name);
      if (!norm) return reply.code(422).send({ error: 'Nome inválido.' });
      await sql`
        INSERT INTO company_partners (company_id, name, normalized_name, source, note)
        VALUES (${company.id}, ${req.body.name.trim()}, ${norm}, 'manual', ${req.body.note ?? null})
        ON CONFLICT (company_id, normalized_name) DO NOTHING`;
      return reply.code(201).send({ partners: await partnersJson(sql, company.id) });
    },
  );

  // Remove um sócio da lista (não altera classificações já feitas).
  app.delete<{ Params: { id: string } }>(
    '/me/partners/:id',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: UUID_PATTERN } } } } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });
      await sql`DELETE FROM company_partners WHERE id = ${req.params.id} AND company_id = ${company.id}`;
      return reply.code(200).send({ partners: await partnersJson(sql, company.id) });
    },
  );

  // Candidatos: lançamentos cuja contraparte casa com um sócio e que ainda não
  // foram classificados. É PROPOSTA — o dono confirma no /classify.
  app.get('/me/partners/candidates', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });

    const partners = await loadPartners(sql, company.id);
    if (partners.length === 0) return { candidates: [] };

    const rows = await sql`
      SELECT id::text AS id, kind::text AS kind, amount_cents,
             counterparty, due_on::text AS due_on, settled_on::text AS settled_on
      FROM entries
      WHERE company_id = ${company.id} AND counterparty IS NOT NULL AND party_class IS NULL`;

    const candidates = rows
      .map((r) => {
        const kind = r.kind as 'receivable' | 'payable';
        const matched = matchPartner(r.counterparty as string, partners);
        if (!matched) return null;
        return {
          entryId: r.id as string,
          counterparty: r.counterparty as string,
          amountCents: r.amount_cents as number,
          kind,
          date: (r.settled_on as string | null) ?? (r.due_on as string | null),
          partnerName: matched.name,
          suggestedClass: suggestedClass(kind), // aporte (entrada) | retirada (saída)
        };
      })
      .filter(Boolean);

    return { candidates };
  });

  // O dono confirma a classificação de um ou mais lançamentos. Só aqui o motor
  // deixa (ou volta) a contar. Recalcula uma vez ao fim.
  app.post<{ Body: { items: Array<{ entryId: string; class: string }> } }>(
    '/me/partners/classify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['items'],
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              items: {
                type: 'object',
                required: ['entryId', 'class'],
                additionalProperties: false,
                properties: {
                  entryId: { type: 'string', pattern: UUID_PATTERN },
                  class: { type: 'string', enum: PARTY_CLASSES as unknown as string[] },
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

      await sql.begin(async (tx) => {
        for (const it of req.body.items) {
          await tx`
            UPDATE entries SET party_class = ${it.class}
            WHERE id = ${it.entryId} AND company_id = ${company.id}`;
        }
      });

      const asOf = await latestAsOf(sql, company.id);
      try {
        await computeAndStore(sql, company, asOf, alertWriter, pushSender, app.log);
      } catch (err) {
        app.log.warn({ err }, 'falha ao recalcular após classificar sócios');
      }
      const dash = await buildDashboard(sql, company);
      return reply.code(200).send({ ...(dash ?? {}), classified: req.body.items.length });
    },
  );
}
