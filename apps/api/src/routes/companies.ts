import type { FastifyInstance } from 'fastify';

import type { Sql } from '../db';
import { companyParamsSchema, findCompany, toCompanyJson, type CompanyRow } from '../http';
import { requireAdmin } from './admin/guard';

interface CompanyBody {
  name: string;
  cnpj?: string;
  niche?: string;
  declaredFixedCostCents?: number;
}

export function registerCompanies(app: FastifyInstance, sql: Sql) {
  app.post<{ Body: CompanyBody }>(
    '/companies',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            cnpj: { type: 'string' },
            niche: { type: 'string' },
            declaredFixedCostCents: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const [row] = await sql`
        INSERT INTO companies (name, cnpj, niche, declared_fixed_cost_cents)
        VALUES (${b.name}, ${b.cnpj ?? null}, ${b.niche ?? 'clinica'}, ${b.declaredFixedCostCents ?? null})
        RETURNING id, name, cnpj, niche, declared_fixed_cost_cents, created_at`;
      return reply.code(201).send(toCompanyJson(row as CompanyRow));
    },
  );

  // Listar TODAS as empresas (com CNPJ) é dado sensível: só operador (admin).
  // Sem o guard, qualquer um enumeraria a base inteira de clínicas.
  app.get('/companies', async (req, reply) => {
    const admin = await requireAdmin(sql, req, reply);
    if (!admin) return reply;
    const rows = await sql`
      SELECT id, name, cnpj, niche, declared_fixed_cost_cents, created_at
      FROM companies ORDER BY created_at LIMIT 100`;
    return { companies: rows.map((r) => toCompanyJson(r as unknown as CompanyRow)) };
  });

  app.get<{ Params: { id: string } }>(
    '/companies/:id',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
      return toCompanyJson(company);
    },
  );
}
