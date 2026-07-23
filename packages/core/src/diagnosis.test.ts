import { describe, expect, it } from 'vitest';

import {
  diagnose,
  type DiagnosisHistoryInput,
  type DiagnosisHistoryPoint,
} from './diagnosis';
import type { Indicator, IndicatorSet } from './types';

// ---------------------------------------------------------------
// Fábrica de IndicatorSet: tudo SAUDÁVEL por padrão; cada teste sobrescreve
// só o indicador que importa. (Testa diagnose isolado, sem passar pelo core.)
// ---------------------------------------------------------------
const ind = (over: Partial<Record<string, Indicator<unknown>>> = {}): IndicatorSet => {
  const base: Record<string, Indicator<unknown>> = {
    cash_balance: { key: 'cash_balance', value: 5_000_000, unit: 'cents', inputs: {} },
    fixed_cost_monthly: { key: 'fixed_cost_monthly', value: 1_000_000, unit: 'cents', inputs: {} }, // reserva = 5 meses
    cash_projection: { key: 'cash_projection', value: [], unit: 'cents', inputs: { zeroInDays: null, zeroOn: null } },
    ncg: { key: 'ncg', value: 100_000, unit: 'cents', inputs: {} },
    revenue_current: { key: 'revenue_current', value: 5_000_000, unit: 'cents', inputs: {} },
    revenue_previous: { key: 'revenue_previous', value: 5_000_000, unit: 'cents', inputs: {} },
    cash_cycle: { key: 'cash_cycle', value: 40, unit: 'days', inputs: {} },
    contribution_margin: { key: 'contribution_margin', value: 0.5, unit: 'ratio', inputs: {} },
    customer_concentration: { key: 'customer_concentration', value: 0.1, unit: 'ratio', inputs: { topCustomer: 'Cliente X' } },
    break_even_revenue: { key: 'break_even_revenue', value: 1_000_000, unit: 'cents', inputs: {} }, // receita 5x = folga
    delinquency_rate: { key: 'delinquency_rate', value: 0, unit: 'ratio', inputs: {} },
  };
  return { ...base, ...over } as IndicatorSet;
};

const proj = (zeroInDays: number | null): Indicator<unknown> => ({
  key: 'cash_projection',
  value: [],
  unit: 'cents',
  inputs: { zeroInDays, zeroOn: zeroInDays !== null ? '2026-08-01' : null },
});

const cents = (key: string, value: number | null): Indicator<unknown> => ({ key, value, unit: 'cents', inputs: {} });
const ratio = (key: string, value: number | null): Indicator<unknown> => ({ key, value, unit: 'ratio', inputs: {} });

const hist = (points: DiagnosisHistoryPoint[]): DiagnosisHistoryInput => ({ points });
const drivers = (r: ReturnType<typeof diagnose>) => r.drivers.map((d) => d.premissa);

// ---------------------------------------------------------------
// Um cenário por estágio
// ---------------------------------------------------------------
describe('diagnose — um cenário por estágio', () => {
  it('saudável: nada dispara', () => {
    const r = diagnose(ind());
    expect(r.stage).toBe('saudavel');
    expect(r.drivers).toHaveLength(0);
  });

  it('atenção: exatamente uma avaliadora em warn (concentração > 30%)', () => {
    const r = diagnose(ind({ customer_concentration: ratio('customer_concentration', 0.4) }));
    expect(r.stage).toBe('atencao');
    expect(drivers(r)).toContain('P7');
  });

  it('pressão: reserva abaixo de 1 mês (P1)', () => {
    const r = diagnose(ind({ cash_balance: cents('cash_balance', 500_000) })); // 0,5 mês
    expect(r.stage).toBe('pressao');
    expect(drivers(r)).toContain('P1');
  });

  it('pressão: P4 e P5 juntas (ciclo piorando + margem frágil)', () => {
    const history = hist([
      { asOf: '2026-05', ncgCents: null, revenueCents: null, cashCycleDays: 40, contributionMargin: null },
      { asOf: '2026-06', ncgCents: null, revenueCents: null, cashCycleDays: 40, contributionMargin: null },
    ]);
    const r = diagnose(
      ind({
        cash_cycle: { key: 'cash_cycle', value: 60, unit: 'days', inputs: {} }, // 60 vs média 40 = +50%
        contribution_margin: ratio('contribution_margin', 0.25), // < 30% = frágil
      }),
      history,
    );
    expect(r.stage).toBe('pressao');
    expect(drivers(r)).toEqual(expect.arrayContaining(['P4', 'P5']));
  });

  it('crítico: zeragem em 45 dias (P2)', () => {
    const r = diagnose(ind({ cash_projection: proj(45) }));
    expect(r.stage).toBe('critico');
    expect(drivers(r)).toContain('P2');
  });

  it('UTI: zeragem em 10 dias (P2)', () => {
    const r = diagnose(ind({ cash_projection: proj(10) }));
    expect(r.stage).toBe('uti');
  });

  it('UTI: caixa atual negativo', () => {
    const r = diagnose(ind({ cash_balance: cents('cash_balance', -50_000) }));
    expect(r.stage).toBe('uti');
    expect(drivers(r).map(String)).toContain('caixa_negativo');
  });
});

// ---------------------------------------------------------------
// Fronteiras do P2 (dias até zerar)
// ---------------------------------------------------------------
describe('diagnose — fronteiras do P2', () => {
  it('15d = UTI, 16d = crítico', () => {
    expect(diagnose(ind({ cash_projection: proj(15) })).stage).toBe('uti');
    expect(diagnose(ind({ cash_projection: proj(16) })).stage).toBe('critico');
  });

  it('60d = crítico, 61d = pressão', () => {
    expect(diagnose(ind({ cash_projection: proj(60) })).stage).toBe('critico');
    expect(diagnose(ind({ cash_projection: proj(61) })).stage).toBe('pressao');
  });

  it('90d = pressão, 91d = não dispara P2', () => {
    expect(diagnose(ind({ cash_projection: proj(90) })).stage).toBe('pressao');
    expect(diagnose(ind({ cash_projection: proj(91) })).stage).toBe('saudavel');
  });
});

// ---------------------------------------------------------------
// P3 exige persistência (Fleuriet)
// ---------------------------------------------------------------
describe('diagnose — P3 tesoura persistente', () => {
  const atual = ind({
    ncg: cents('ncg', 3_000_000),
    revenue_current: cents('revenue_current', 5_000_000),
  });
  const ponto = (asOf: string, ncgCents: number): DiagnosisHistoryPoint => ({
    asOf,
    ncgCents,
    revenueCents: 5_000_000, // receita estável
    cashCycleDays: 40, // igual ao atual → não dispara P4
    contributionMargin: null,
  });

  it('1 período anterior NÃO dispara (histórico insuficiente)', () => {
    const r = diagnose(atual, hist([ponto('2026-06', 2_000_000)]));
    expect(r.facts.unavailable.P3).toBeDefined();
    expect(r.stage).toBe('saudavel');
  });

  it('2 períodos com NCG crescendo acima da receita DISPARAM pressão', () => {
    const r = diagnose(atual, hist([ponto('2026-05', 1_000_000), ponto('2026-06', 2_000_000)]));
    expect(r.stage).toBe('pressao');
    expect(drivers(r)).toContain('P3');
  });
});

// ---------------------------------------------------------------
// Diagnóstico honesto: dado insuficiente entra em unavailable
// ---------------------------------------------------------------
describe('diagnose — dado insuficiente', () => {
  it('premissa sem dado não dispara e é reportada em facts.unavailable', () => {
    const r = diagnose(
      ind({
        break_even_revenue: { key: 'break_even_revenue', value: null, unit: 'cents', inputs: {}, insufficientReason: 'sem margem' },
        delinquency_rate: { key: 'delinquency_rate', value: null, unit: 'ratio', inputs: {}, insufficientReason: 'sem carteira' },
      }),
    );
    expect(r.facts.unavailable.P6).toBe('sem margem');
    expect(r.facts.unavailable.P8).toBe('sem carteira');
    expect(r.stage).toBe('saudavel'); // não vira alarme por falta de dado
  });
});

// ---------------------------------------------------------------
// Transições (trajetória do estágio)
// ---------------------------------------------------------------
describe('diagnose — transições', () => {
  it('registra que piorou vs. o período anterior', () => {
    const r = diagnose(ind({ cash_projection: proj(45) }), // agora crítico
      hist([
        { asOf: '2026-06', ncgCents: null, revenueCents: null, cashCycleDays: null, contributionMargin: null, stage: 'atencao' },
      ]),
    );
    expect(r.transitions.previousStage).toBe('atencao');
    expect(r.transitions.direction).toBe('piorou');
  });
});
