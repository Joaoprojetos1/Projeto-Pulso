/**
 * Cadastro da empresa: CNPJ, segmento e sistemas usados (novo onboarding).
 *
 * O dono informa o CNPJ; o servidor consulta a base pública (services/cnpj) e
 * grava razão social, endereço, situação, CNAE e quadro societário. O segmento
 * vem sugerido pelo CNAE e o dono confirma. Depois, quais sistemas usa por
 * finalidade e em que formato exporta — metadados que orientam o parsing.
 *
 * Sem cálculo: é cadastro. NENHUMA conta financeira aqui.
 */

import { isSegmentId } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { findCompany, toCompanyJson } from '../http';
import {
  CnpjInvalidoError,
  CnpjNaoEncontradoError,
  isValidCnpj,
  lookupCnpj,
  normalizeCnpj,
  type LookupDeps,
} from '../services/cnpj';

const PURPOSES = ['payables_receivables', 'inventory', 'services', 'bank'] as const;
const FORMATS = ['pdf', 'excel_csv', 'photo', 'none'] as const;

export function registerCompany(app: FastifyInstance, sql: Sql, cnpjDeps: LookupDeps = {}) {
  // Consulta o CNPJ na base pública e GRAVA no cadastro. Devolve o segmento
  // sugerido (o dono confirma no PATCH). Já preenche `niche` com a sugestão.
  app.post<{ Body: { cnpj: string } }>(
    '/me/company/cnpj',
    {
      schema: {
        body: {
          type: 'object',
          required: ['cnpj'],
          additionalProperties: false,
          properties: { cnpj: { type: 'string', minLength: 11, maxLength: 20 } },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      let result;
      try {
        result = await lookupCnpj(sql, req.body.cnpj, cnpjDeps);
      } catch (err) {
        if (err instanceof CnpjInvalidoError) return reply.code(422).send({ error: err.message });
        if (err instanceof CnpjNaoEncontradoError) return reply.code(404).send({ error: err.message });
        throw err;
      }
      const d = result.data;

      // sugere o segmento só quando reconhecido; senão preserva o atual
      const niche = d.suggestedNiche ?? company.niche;

      await sql`
        UPDATE companies SET
          cnpj = ${normalizeCnpj(req.body.cnpj)},
          razao_social = ${d.razaoSocial},
          nome_fantasia = ${d.nomeFantasia},
          situacao_cadastral = ${d.situacao},
          cnae_principal = ${d.cnaePrincipal},
          cnae_descricao = ${d.cnaeDescricao},
          endereco = ${sql.json(d.endereco as never)},
          quadro_societario = ${sql.json(d.quadroSocietario as never)},
          cnpj_consultado_em = now(),
          niche = ${niche},
          name = COALESCE(NULLIF(${d.nomeFantasia ?? d.razaoSocial}, ''), name)
        WHERE id = ${company.id}`;

      const updated = await findCompany(sql, company.id);
      return reply.code(200).send({
        company: updated ? toCompanyJson(updated) : null,
        suggestedNiche: d.suggestedNiche,
        source: result.source,
      });
    },
  );

  // Confirma/corrige o segmento (e opcionalmente o nome de exibição). O `cnpj`
  // opcional é o FALLBACK do onboarding: quando a consulta pública falha (rede),
  // ainda gravamos o CNPJ que o dono digitou, para o cadastro contar como completo
  // (a base pública pode ser reconsultada depois). Não busca dados aqui — só grava.
  app.patch<{ Body: { niche?: string; name?: string; cnpj?: string } }>(
    '/me/company',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            niche: { type: 'string' },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            cnpj: { type: 'string', minLength: 11, maxLength: 20 },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });

      if (req.body.niche != null && !isSegmentId(req.body.niche)) {
        return reply.code(422).send({ error: 'Segmento não suportado.' });
      }
      if (req.body.cnpj != null && !isValidCnpj(req.body.cnpj)) {
        return reply.code(422).send({ error: 'CNPJ inválido. Confira os números.' });
      }
      if (req.body.niche != null) {
        await sql`UPDATE companies SET niche = ${req.body.niche} WHERE id = ${company.id}`;
      }
      if (req.body.name != null) {
        await sql`UPDATE companies SET name = ${req.body.name} WHERE id = ${company.id}`;
      }
      if (req.body.cnpj != null) {
        await sql`UPDATE companies SET cnpj = ${normalizeCnpj(req.body.cnpj)} WHERE id = ${company.id}`;
      }
      const updated = await findCompany(sql, company.id);
      return { company: updated ? toCompanyJson(updated) : null };
    },
  );

  // Sistemas que a empresa usa, por finalidade (orientam o parsing depois).
  app.get('/me/company/systems', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    const rows = await sql`
      SELECT purpose, system_name, export_format
      FROM company_systems WHERE company_id = ${company.id}`;
    return {
      systems: rows.map((r) => ({
        purpose: r.purpose,
        systemName: r.system_name,
        exportFormat: r.export_format,
      })),
    };
  });

  app.put<{ Body: { systems: Array<{ purpose: string; systemName?: string | null; exportFormat?: string | null }> } }>(
    '/me/company/systems',
    {
      schema: {
        body: {
          type: 'object',
          required: ['systems'],
          additionalProperties: false,
          properties: {
            systems: {
              type: 'array',
              maxItems: 20,
              items: {
                type: 'object',
                required: ['purpose'],
                additionalProperties: false,
                properties: {
                  purpose: { type: 'string', enum: PURPOSES as unknown as string[] },
                  systemName: { type: ['string', 'null'], maxLength: 200 },
                  exportFormat: { type: ['string', 'null'], enum: [...FORMATS, null] as unknown as string[] },
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
        for (const sysrow of req.body.systems) {
          await tx`
            INSERT INTO company_systems (company_id, purpose, system_name, export_format, updated_at)
            VALUES (${company.id}, ${sysrow.purpose}, ${sysrow.systemName ?? null}, ${sysrow.exportFormat ?? null}, now())
            ON CONFLICT (company_id, purpose)
            DO UPDATE SET system_name = EXCLUDED.system_name,
                          export_format = EXCLUDED.export_format,
                          updated_at = now()`;
        }
      });

      const rows = await sql`
        SELECT purpose, system_name, export_format
        FROM company_systems WHERE company_id = ${company.id}`;
      return reply.code(200).send({
        systems: rows.map((r) => ({
          purpose: r.purpose,
          systemName: r.system_name,
          exportFormat: r.export_format,
        })),
      });
    },
  );
}
