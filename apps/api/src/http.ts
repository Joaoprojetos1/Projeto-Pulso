import type { Sql } from './db';

/** Padrões de validação compartilhados pelas rotas. */
export const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
export const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export const companyParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

export interface CompanyRow {
  id: string;
  name: string;
  cnpj: string | null;
  niche: string;
  declared_fixed_cost_cents: number | null;
  created_at: Date;
}

export async function findCompany(sql: Sql, id: string): Promise<CompanyRow | undefined> {
  const [row] = await sql`
    SELECT id, name, cnpj, niche, declared_fixed_cost_cents, created_at
    FROM companies WHERE id = ${id}`;
  return row as CompanyRow | undefined;
}

export function toCompanyJson(c: CompanyRow) {
  return {
    id: c.id,
    name: c.name,
    cnpj: c.cnpj,
    niche: c.niche,
    declaredFixedCostCents: c.declared_fixed_cost_cents,
    createdAt: c.created_at,
  };
}
