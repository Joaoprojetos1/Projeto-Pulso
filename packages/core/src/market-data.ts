/**
 * Referência de mercado por segmento — A TABELA QUE O ESPECIALISTA PREENCHE.
 *
 * Implementa `MarketReference` (market-reference.ts) sobre uma lista de benchmarks.
 * HOJE ESTÁ VAZIA de propósito: sem número validado, o produto NÃO compara (nada
 * inventado). Quando o Marco/uma fonte real fornecer os valores típicos de mercado,
 * é só acrescentar linhas em `MARKET_BENCHMARKS` — a comparação passa a aparecer
 * sozinha na home, sem mexer em mais nada.
 *
 * COMO PREENCHER (exemplo — descomente e ajuste com números reais):
 *   {
 *     segment: 'varejo',
 *     indicatorKey: 'varejo_margem_bruta', // a `key` do indicador (universal ou de segmento)
 *     typicalValue: 0.52,                  // MESMA unidade do indicador (ratio → 0.52 = 52%)
 *     range: { min: 0.45, max: 0.58 },     // faixa saudável (opcional)
 *     direction: 'higher_is_better',       // acima do mercado é bom? (margem sim; CMV/glosa não)
 *     source: 'Pesquisa setorial X',       // de onde veio (a tela dá crédito)
 *     asOfMonth: '2026-06',                // quando foi apurado
 *   },
 */

import { NO_MARKET_REFERENCE, type MarketBenchmark, type MarketReference } from './market-reference';

/**
 * Os pontos de referência de mercado. VAZIO até haver número validado pelo
 * especialista. Cada linha liga um indicador de um segmento a um valor típico.
 */
export const MARKET_BENCHMARKS: MarketBenchmark[] = [
  // (vazio — preencher com os números do Marco; ver o formato no topo do arquivo)
];

/**
 * Fonte de referência baseada na tabela acima. Casa por segmento + `indicatorKey`.
 * Com a tabela vazia, comporta-se como `NO_MARKET_REFERENCE` (nunca compara).
 */
export const TABLE_MARKET_REFERENCE: MarketReference =
  MARKET_BENCHMARKS.length === 0
    ? NO_MARKET_REFERENCE
    : {
        benchmarkFor(segment, indicatorKey) {
          return (
            MARKET_BENCHMARKS.find(
              (b) => b.segment === segment && b.indicatorKey === indicatorKey,
            ) ?? null
          );
        },
      };

/** Fábrica testável: uma referência sobre uma lista qualquer de benchmarks. */
export function marketReferenceFrom(benchmarks: MarketBenchmark[]): MarketReference {
  if (benchmarks.length === 0) return NO_MARKET_REFERENCE;
  return {
    benchmarkFor(segment, indicatorKey) {
      return (
        benchmarks.find((b) => b.segment === segment && b.indicatorKey === indicatorKey) ?? null
      );
    },
  };
}
