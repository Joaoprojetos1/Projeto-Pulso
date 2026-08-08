/**
 * Consulta de CNPJ (cadastro da empresa por CNPJ — item 2.3).
 *
 * O dono informa só o CNPJ; aqui consultamos uma API PÚBLICA e trazemos razão
 * social, nome fantasia, endereço, situação, CNAE e quadro societário. Duas
 * fontes com FALLBACK entre elas (BrasilAPI → ReceitaWS) e CACHE no banco (a API
 * pública é lenta e limitada). Tudo normalizado para uma forma única, para o
 * resto do sistema não saber de qual fonte veio.
 *
 * Sem cálculo financeiro: é cadastro. O `fetcher` é injetável para teste.
 */

import type { Sql } from '../db';

export type CnpjSource = 'brasilapi' | 'receitaws' | 'cache';

export interface CnpjSocio {
  nome: string;
  qualificacao: string | null;
}

export interface CnpjEndereco {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
}

/** Forma NORMALIZADA — a única que o resto do sistema conhece. */
export interface CnpjData {
  cnpj: string; // 14 dígitos, sem máscara
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacao: string | null;
  cnaePrincipal: string | null;
  cnaeDescricao: string | null;
  endereco: CnpjEndereco;
  quadroSocietario: CnpjSocio[];
  /** Segmento sugerido pelo CNAE (o dono confirma ou corrige). */
  suggestedNiche: string | null;
}

export class CnpjInvalidoError extends Error {
  constructor() {
    super('CNPJ inválido.');
    this.name = 'CnpjInvalidoError';
  }
}

export class CnpjNaoEncontradoError extends Error {
  constructor() {
    super('CNPJ não encontrado nas bases públicas.');
    this.name = 'CnpjNaoEncontradoError';
  }
}

/** Só os dígitos. */
export function normalizeCnpj(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/** Validação dos dígitos verificadores (não bate na rede). */
export function isValidCnpj(raw: string): boolean {
  const c = normalizeCnpj(raw);
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false; // todos iguais

  const calc = (base: string): number => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = calc(c.slice(0, 12));
  const dv2 = calc(c.slice(0, 12) + String(dv1));
  return c.endsWith(`${dv1}${dv2}`);
}

/**
 * Sugere o segmento SUPORTADO a partir do CNAE principal. Mapeamento grosso por
 * divisão (2 primeiros dígitos); o dono confirma. Nunca "chuta" um segmento não
 * suportado — devolve null e o dono escolhe.
 */
export function suggestNicheFromCnae(cnae: string | null): string | null {
  const digits = (cnae ?? '').replace(/\D/g, '');
  if (digits.length < 2) return null;
  const div = digits.slice(0, 2);
  // 86 = atividades de atenção à saúde humana (clínicas, consultórios)
  if (div === '86') return 'clinica';
  // 47 = comércio varejista; 45/46 = comércio (varejo de roupa etc.)
  if (div === '47') return 'varejo';
  // 56 = alimentação (restaurantes, lanchonetes)
  if (div === '56') return 'restaurante';
  return null;
}

// ---------------------------------------------------------------
// Normalização de cada fonte para CnpjData
// ---------------------------------------------------------------

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

function fromBrasilApi(cnpj: string, raw: Record<string, unknown>): CnpjData {
  const cnae = s(raw.cnae_fiscal);
  const socios = Array.isArray(raw.qsa) ? (raw.qsa as Record<string, unknown>[]) : [];
  return {
    cnpj,
    razaoSocial: s(raw.razao_social),
    nomeFantasia: s(raw.nome_fantasia),
    situacao: s(raw.descricao_situacao_cadastral) ?? s(raw.situacao_cadastral),
    cnaePrincipal: cnae,
    cnaeDescricao: s(raw.cnae_fiscal_descricao),
    endereco: {
      logradouro: s(raw.logradouro),
      numero: s(raw.numero),
      bairro: s(raw.bairro),
      municipio: s(raw.municipio),
      uf: s(raw.uf),
      cep: s(raw.cep),
    },
    quadroSocietario: socios.map((q) => ({
      nome: s(q.nome_socio) ?? s(q.nome) ?? '',
      qualificacao: s(q.qualificacao_socio) ?? s(q.qual),
    })).filter((q) => q.nome.length > 0),
    suggestedNiche: suggestNicheFromCnae(cnae),
  };
}

function fromReceitaWs(cnpj: string, raw: Record<string, unknown>): CnpjData {
  const atividade = Array.isArray(raw.atividade_principal)
    ? (raw.atividade_principal[0] as Record<string, unknown> | undefined)
    : undefined;
  const cnae = s(atividade?.code);
  const socios = Array.isArray(raw.qsa) ? (raw.qsa as Record<string, unknown>[]) : [];
  return {
    cnpj,
    razaoSocial: s(raw.nome),
    nomeFantasia: s(raw.fantasia),
    situacao: s(raw.situacao),
    cnaePrincipal: cnae,
    cnaeDescricao: s(atividade?.text),
    endereco: {
      logradouro: s(raw.logradouro),
      numero: s(raw.numero),
      bairro: s(raw.bairro),
      municipio: s(raw.municipio),
      uf: s(raw.uf),
      cep: s(raw.cep),
    },
    quadroSocietario: socios.map((q) => ({
      nome: s(q.nome) ?? '',
      qualificacao: s(q.qual),
    })).filter((q) => q.nome.length > 0),
    suggestedNiche: suggestNicheFromCnae(cnae),
  };
}

// ---------------------------------------------------------------
// Busca com fallback + cache
// ---------------------------------------------------------------

export interface LookupDeps {
  /** Injetável para teste; em produção usa o fetch global. */
  fetcher?: typeof fetch;
  /** TTL do cache em dias (padrão 30). */
  cacheTtlDays?: number;
}

async function fetchJson(
  fetcher: typeof fetch,
  url: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetcher(url, { headers: { accept: 'application/json' } });
  if (res.status === 404) return null; // não encontrado (não é erro de rede)
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Consulta um CNPJ: cache → BrasilAPI → ReceitaWS. Grava no cache. Lança
 * CnpjInvalidoError (dígito) e CnpjNaoEncontradoError (não achou em nenhuma).
 */
export async function lookupCnpj(
  sql: Sql,
  rawCnpj: string,
  deps: LookupDeps = {},
): Promise<{ data: CnpjData; source: CnpjSource }> {
  const cnpj = normalizeCnpj(rawCnpj);
  if (!isValidCnpj(cnpj)) throw new CnpjInvalidoError();

  const ttl = deps.cacheTtlDays ?? 30;
  const [cached] = await sql`
    SELECT data FROM cnpj_cache
    WHERE cnpj = ${cnpj} AND consultado_em > now() - (${ttl} || ' days')::interval`;
  if (cached) return { data: cached.data as CnpjData, source: 'cache' };

  const fetcher = deps.fetcher ?? fetch;

  // 1) BrasilAPI
  let data: CnpjData | null = null;
  let fonte: 'brasilapi' | 'receitaws' | null = null;
  try {
    const raw = await fetchJson(fetcher, `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (raw) {
      data = fromBrasilApi(cnpj, raw);
      fonte = 'brasilapi';
    }
  } catch {
    // cai no fallback
  }

  // 2) ReceitaWS (fallback)
  if (!data) {
    try {
      const raw = await fetchJson(fetcher, `https://receitaws.com.br/v1/cnpj/${cnpj}`);
      // ReceitaWS devolve 200 com { status: 'ERROR' } quando não acha
      if (raw && s(raw.status) !== 'ERROR' && (s(raw.nome) || Array.isArray(raw.atividade_principal))) {
        data = fromReceitaWs(cnpj, raw);
        fonte = 'receitaws';
      }
    } catch {
      // ambas falharam
    }
  }

  if (!data || !fonte) throw new CnpjNaoEncontradoError();

  await sql`
    INSERT INTO cnpj_cache (cnpj, data, fonte)
    VALUES (${cnpj}, ${sql.json(data as never)}, ${fonte})
    ON CONFLICT (cnpj) DO UPDATE SET data = EXCLUDED.data, fonte = EXCLUDED.fonte, consultado_em = now()`;

  return { data, source: fonte };
}
