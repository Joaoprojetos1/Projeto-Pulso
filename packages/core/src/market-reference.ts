/**
 * PONTO DE EXTENSÃO (item 3.6) — referência de mercado por segmento.
 *
 * NÃO IMPLEMENTADO de propósito: aqui vive só o CONTRATO. No futuro, uma fonte de
 * referência (pesquisa própria, base setorial, parceiro) implementa esta interface
 * e o produto passa a comparar: "a margem média do varejo de roupa é 52%; a sua
 * está acima/abaixo". Nada aqui calcula nem inventa número — quando não houver
 * provedor, o produto simplesmente não compara (degradação elegante).
 *
 * A comparação é APRESENTAÇÃO: o core segue calculando o indicador da empresa como
 * hoje; a referência só acrescenta o "em relação ao mercado".
 */

import type { SegmentId } from './segments/types';

/** Como o valor de referência se relaciona com o indicador da empresa. */
export type BenchmarkDirection =
  | 'higher_is_better' // margem, ocupação: acima do mercado é bom
  | 'lower_is_better' // CMV, glosa, ciclo: abaixo do mercado é bom
  | 'neutral';

/** Um ponto de referência de mercado para um indicador de um segmento. */
export interface MarketBenchmark {
  segment: SegmentId;
  /** `key` do indicador (universal ou de segmento) a que a referência se aplica. */
  indicatorKey: string;
  /** Valor típico de mercado, na MESMA unidade do indicador. */
  typicalValue: number;
  /** Faixa saudável (opcional), na mesma unidade. */
  range?: { min: number; max: number };
  direction: BenchmarkDirection;
  /** De onde veio a referência (para a tela dar crédito e o dono confiar). */
  source: string;
  /** Quando a referência foi apurada ('YYYY-MM'), para não usar dado velho como novo. */
  asOfMonth?: string;
}

/**
 * A fonte de referência de mercado. Uma futura implementação injeta isto; o
 * produto chama `benchmarkFor` e, se vier null, não compara.
 */
export interface MarketReference {
  benchmarkFor(segment: SegmentId, indicatorKey: string): MarketBenchmark | null;
}

/** Provedor NULO (padrão até existir uma fonte real): nunca compara. */
export const NO_MARKET_REFERENCE: MarketReference = {
  benchmarkFor: () => null,
};

/**
 * Resultado de uma comparação, quando há referência. Puro: recebe o valor da
 * empresa e o benchmark, devolve a leitura relativa — sem chamar IA.
 */
export interface MarketComparison {
  benchmark: MarketBenchmark;
  companyValue: number;
  /** Posição da empresa frente ao mercado. */
  position: 'acima' | 'abaixo' | 'na_media';
  /** true quando a posição é FAVORÁVEL (considerando a direção do indicador). */
  favorable: boolean;
}

/** Compara o valor da empresa com o benchmark. Determinístico. */
export function compareToMarket(
  companyValue: number,
  benchmark: MarketBenchmark,
  toleranceRatio = 0.05,
): MarketComparison {
  const diff = companyValue - benchmark.typicalValue;
  const naMedia = Math.abs(diff) <= Math.abs(benchmark.typicalValue) * toleranceRatio;
  const position = naMedia ? 'na_media' : diff > 0 ? 'acima' : 'abaixo';
  let favorable = true;
  if (position !== 'na_media') {
    if (benchmark.direction === 'higher_is_better') favorable = position === 'acima';
    else if (benchmark.direction === 'lower_is_better') favorable = position === 'abaixo';
  }
  return { benchmark, companyValue, position, favorable };
}
