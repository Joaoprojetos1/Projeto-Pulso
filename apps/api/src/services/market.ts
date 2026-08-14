/**
 * Referência de mercado por segmento (item 3.6) — a IA pesquisa, o código valida.
 *
 * A média do setor NÃO é preenchida à mão pelo especialista: a IA pesquisa (com
 * busca na web), CITA a fonte e reatualiza. O especialista valida contra as
 * amostras dele. Aqui vive:
 *   - `loadMarketReference`: monta a `MarketReference` do core a partir do banco,
 *     para o dashboard comparar "você está acima/abaixo do mercado".
 *   - `refreshBenchmarks`: para cada alvo, pede o número + fonte ao pesquisador
 *     (injetável), VALIDA (finito, faixa sã por unidade) e grava. Número inválido
 *     é descartado — nada entra sem passar pela peneira do código.
 *
 * REGRA DE OURO: a referência de mercado é uma CAIXA SEPARADA e etiquetada (com
 * fonte); NUNCA se mistura com os números calculados do caixa da empresa. O que a
 * IA traz aqui é referência EXTERNA, sempre com origem — não é o caixa do cliente.
 */

import { marketReferenceFrom, type BenchmarkDirection, type MarketBenchmark, type MarketReference, type SegmentId } from '@pulso/core';

import type { Sql } from '../db';

/** Unidade do indicador — orienta a validação da faixa sã do valor pesquisado. */
export type BenchmarkUnit = 'ratio' | 'days' | 'times' | 'cents' | 'count';

/** Alvo de pesquisa: qual indicador de qual segmento, e como interpretá-lo. */
export interface ResearchTarget {
  segment: SegmentId;
  indicatorKey: string;
  /** Rótulo em pt-BR (o que a IA vai pesquisar). */
  label: string;
  unit: BenchmarkUnit;
  /** Direção conhecida (não deixamos a IA decidir isto — ela só acha o número). */
  direction: BenchmarkDirection;
}

/**
 * Alvos curados: indicadores de segmento com referência de mercado que faz sentido.
 * A DIREÇÃO é conhecida (definida aqui, não pela IA). A IA só busca o valor típico
 * + a fonte. Novos segmentos/indicadores entram aqui depois de validados.
 */
export const RESEARCH_TARGETS: ResearchTarget[] = [
  { segment: 'clinica', indicatorKey: 'clinica_taxa_glosa', label: 'taxa de glosa de convênios em clínicas', unit: 'ratio', direction: 'lower_is_better' },
  { segment: 'clinica', indicatorKey: 'clinica_ocupacao_agenda', label: 'taxa de ocupação da agenda em clínicas', unit: 'ratio', direction: 'higher_is_better' },
  { segment: 'clinica', indicatorKey: 'clinica_margem_operacional', label: 'margem operacional de clínicas médicas', unit: 'ratio', direction: 'higher_is_better' },
  { segment: 'varejo', indicatorKey: 'varejo_margem_bruta', label: 'margem bruta no varejo', unit: 'ratio', direction: 'higher_is_better' },
  { segment: 'varejo', indicatorKey: 'varejo_giro_estoque', label: 'giro de estoque anual no varejo', unit: 'times', direction: 'higher_is_better' },
  { segment: 'varejo', indicatorKey: 'varejo_devolucoes', label: 'taxa de devolução de vendas no varejo', unit: 'ratio', direction: 'lower_is_better' },
  { segment: 'varejo', indicatorKey: 'varejo_margem_operacional', label: 'margem operacional no varejo', unit: 'ratio', direction: 'higher_is_better' },
];

/** O que a IA devolve para um alvo: o valor típico e DE ONDE tirou. */
export interface ResearchedBenchmark {
  /** Valor típico de mercado, na MESMA unidade do indicador. */
  typicalValue: number;
  range?: { min: number; max: number } | null;
  /** Fonte (nome + URL, de preferência) — é o que a tela mostra e o dono confia. */
  source: string;
  /** 'YYYY-MM' de quando o dado foi apurado (opcional). */
  asOfMonth?: string | null;
}

/** Quem sabe PESQUISAR o número de mercado (com busca na web). Injetável p/ teste. */
export interface BenchmarkResearcher {
  research(target: ResearchTarget): Promise<ResearchedBenchmark | null>;
}

/**
 * Faixa sã por unidade — a peneira do CÓDIGO sobre o que a IA trouxe. Fora disto,
 * o número é descartado (não vira referência). Nada de valor absurdo passar.
 */
function valorSano(unit: BenchmarkUnit, v: number): boolean {
  if (!Number.isFinite(v)) return false;
  switch (unit) {
    case 'ratio':
      return v >= 0 && v <= 1; // proporção 0..100%
    case 'times':
      return v > 0 && v <= 100;
    case 'days':
      return v >= 0 && v <= 365;
    case 'count':
      return v >= 0 && v <= 1_000_000;
    case 'cents':
      return v >= 0 && v <= 1_000_000_000; // até R$ 10 mi
    default:
      return false;
  }
}

/** Lê os benchmarks gravados e devolve a `MarketReference` do core (degrada elegante). */
export async function loadMarketReference(sql: Sql): Promise<MarketReference> {
  const rows = await sql`
    SELECT segment, indicator_key, typical_value, range_min, range_max, direction, source, as_of_month
    FROM market_benchmarks`;
  const benchmarks: MarketBenchmark[] = rows.map((r) => ({
    segment: r.segment as SegmentId,
    indicatorKey: r.indicator_key as string,
    typicalValue: Number(r.typical_value),
    range:
      r.range_min != null && r.range_max != null
        ? { min: Number(r.range_min), max: Number(r.range_max) }
        : undefined,
    direction: r.direction as BenchmarkDirection,
    source: r.source as string,
    asOfMonth: (r.as_of_month as string | null) ?? undefined,
  }));
  return marketReferenceFrom(benchmarks);
}

/** Upsert de um benchmark validado. */
async function upsertBenchmark(sql: Sql, t: ResearchTarget, r: ResearchedBenchmark): Promise<void> {
  await sql`
    INSERT INTO market_benchmarks
      (segment, indicator_key, typical_value, range_min, range_max, direction, source, as_of_month, fetched_at)
    VALUES (${t.segment}, ${t.indicatorKey}, ${r.typicalValue}, ${r.range?.min ?? null}, ${r.range?.max ?? null},
            ${t.direction}, ${r.source}, ${r.asOfMonth ?? null}, now())
    ON CONFLICT (segment, indicator_key) DO UPDATE SET
      typical_value = EXCLUDED.typical_value, range_min = EXCLUDED.range_min, range_max = EXCLUDED.range_max,
      direction = EXCLUDED.direction, source = EXCLUDED.source, as_of_month = EXCLUDED.as_of_month, fetched_at = now()`;
}

export interface RefreshResult {
  updated: number;
  skipped: Array<{ indicatorKey: string; reason: string }>;
}

/**
 * Pesquisa e atualiza os benchmarks de todos os alvos (ou de um segmento). Cada
 * número passa pela peneira `valorSano` + exige fonte não-vazia antes de gravar.
 */
export async function refreshBenchmarks(
  sql: Sql,
  researcher: BenchmarkResearcher,
  opts: { segment?: SegmentId; log?: (msg: string, extra?: unknown) => void } = {},
): Promise<RefreshResult> {
  const alvos = opts.segment ? RESEARCH_TARGETS.filter((t) => t.segment === opts.segment) : RESEARCH_TARGETS;
  const res: RefreshResult = { updated: 0, skipped: [] };
  for (const t of alvos) {
    let r: ResearchedBenchmark | null = null;
    try {
      r = await researcher.research(t);
    } catch (err) {
      res.skipped.push({ indicatorKey: t.indicatorKey, reason: `erro na pesquisa: ${(err as Error).message}` });
      continue;
    }
    if (!r) {
      res.skipped.push({ indicatorKey: t.indicatorKey, reason: 'sem resultado' });
      continue;
    }
    if (!valorSano(t.unit, r.typicalValue)) {
      res.skipped.push({ indicatorKey: t.indicatorKey, reason: `valor fora da faixa (${r.typicalValue})` });
      continue;
    }
    if (!r.source || !r.source.trim()) {
      res.skipped.push({ indicatorKey: t.indicatorKey, reason: 'sem fonte' });
      continue;
    }
    await upsertBenchmark(sql, t, r);
    res.updated += 1;
    opts.log?.('benchmark atualizado', { segment: t.segment, indicatorKey: t.indicatorKey, source: r.source });
  }
  return res;
}
