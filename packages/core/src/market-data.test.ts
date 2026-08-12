import { describe, expect, it } from 'vitest';

import { compareToMarket } from './market-reference';
import { MARKET_BENCHMARKS, TABLE_MARKET_REFERENCE, marketReferenceFrom } from './market-data';
import type { MarketBenchmark } from './market-reference';

const MARGEM: MarketBenchmark = {
  segment: 'varejo',
  indicatorKey: 'varejo_margem_bruta',
  typicalValue: 0.52,
  direction: 'higher_is_better',
  source: 'Teste',
  asOfMonth: '2026-06',
};

describe('referência de mercado — tabela e comparação', () => {
  it('tabela vazia hoje: nunca compara (degrada elegante, nada inventado)', () => {
    expect(MARKET_BENCHMARKS).toHaveLength(0);
    expect(TABLE_MARKET_REFERENCE.benchmarkFor('varejo', 'varejo_margem_bruta')).toBeNull();
  });

  it('marketReferenceFrom casa por segmento + indicador', () => {
    const ref = marketReferenceFrom([MARGEM]);
    expect(ref.benchmarkFor('varejo', 'varejo_margem_bruta')).toEqual(MARGEM);
    expect(ref.benchmarkFor('clinica', 'varejo_margem_bruta')).toBeNull();
    expect(ref.benchmarkFor('varejo', 'outro_indicador')).toBeNull();
  });

  it('margem acima do mercado é FAVORÁVEL (higher_is_better)', () => {
    const c = compareToMarket(0.6, MARGEM);
    expect(c.position).toBe('acima');
    expect(c.favorable).toBe(true);
  });

  it('margem abaixo do mercado NÃO é favorável', () => {
    const c = compareToMarket(0.4, MARGEM);
    expect(c.position).toBe('abaixo');
    expect(c.favorable).toBe(false);
  });

  it('para indicador em que MENOR é melhor (CMV/glosa), abaixo do mercado é favorável', () => {
    const cmv: MarketBenchmark = { ...MARGEM, indicatorKey: 'restaurante_cmv', direction: 'lower_is_better' };
    expect(compareToMarket(0.3, cmv).favorable).toBe(true); // abaixo do tipico
    expect(compareToMarket(0.7, cmv).favorable).toBe(false);
  });

  it('dentro da tolerância = na média (sem julgar acima/abaixo)', () => {
    const c = compareToMarket(0.53, MARGEM); // ~2% de 0.52, dentro dos 5%
    expect(c.position).toBe('na_media');
  });
});
