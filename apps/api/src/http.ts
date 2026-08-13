import { createHash, timingSafeEqual } from 'node:crypto';

import type { Sql } from './db';

/**
 * Compara dois segredos em TEMPO CONSTANTE (não vaza por timing e não vaza o
 * tamanho): faz o hash dos dois lados e compara os digests de tamanho fixo.
 * Para conferir segredos de webhook (x-webhook-secret, verify_token).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a ?? '').digest();
  const hb = createHash('sha256').update(b ?? '').digest();
  return timingSafeEqual(ha, hb);
}

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
  // Cadastro por CNPJ (migração 0023): opcionais porque nem toda query os
  // seleciona (signup/login trazem só o essencial). `findCompany` traz todos.
  razao_social?: string | null;
  nome_fantasia?: string | null;
  situacao_cadastral?: string | null;
  cnae_principal?: string | null;
  cnae_descricao?: string | null;
  endereco?: unknown | null;
  quadro_societario?: unknown | null;
  cnpj_consultado_em?: Date | null;
}

export async function findCompany(sql: Sql, id: string): Promise<CompanyRow | undefined> {
  const [row] = await sql`
    SELECT id, name, cnpj, niche, declared_fixed_cost_cents, created_at,
           razao_social, nome_fantasia, situacao_cadastral, cnae_principal, cnae_descricao,
           endereco, quadro_societario, cnpj_consultado_em
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
    // dados do cadastro por CNPJ (null enquanto o dono não consultou)
    razaoSocial: c.razao_social ?? null,
    nomeFantasia: c.nome_fantasia ?? null,
    situacaoCadastral: c.situacao_cadastral ?? null,
    cnaePrincipal: c.cnae_principal ?? null,
    cnaeDescricao: c.cnae_descricao ?? null,
    endereco: c.endereco ?? null,
    quadroSocietario: c.quadro_societario ?? null,
    cnpjConsultadoEm: c.cnpj_consultado_em ?? null,
  };
}
