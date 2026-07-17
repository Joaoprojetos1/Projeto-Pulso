import { describe, expect, it } from 'vitest';

import { computeAll, evaluate } from '@pulso/core';
import { clinicaSaudavel } from './clinica-saudavel';
import { clinicaTesoura } from './clinica-tesoura';

describe('clínica saudável (Vida Plena)', () => {
  it('nenhuma regra dispara: o Pulso diz "semana tranquila"', () => {
    const alerts = evaluate(computeAll(clinicaSaudavel));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ruleKey).toBe('all_clear');
    expect(alerts[0]!.severity).toBe('ok');
  });

  it('os números de base saem calculados, não null', () => {
    const ind = computeAll(clinicaSaudavel);
    expect(ind.cash_balance!.value).toBe(8_000_000);
    // convênio paga em ~40 dias mas é minoria: média ponderada fica em 16
    expect(ind.pmr!.value).toBe(16);
    expect(ind.pmp!.value).toBe(0); // paga tudo à vista
    expect(ind.contribution_margin!.value).not.toBeNull();
  });
});

describe('clínica da tesoura (Horizonte)', () => {
  it('dispara cash_runway: o caixa zera ANTES do dinheiro do convênio chegar', () => {
    const alerts = evaluate(computeAll(clinicaTesoura));
    const runway = alerts.find((a) => a.ruleKey === 'cash_runway');
    expect(runway).toBeDefined();
    expect(runway!.severity).toBe('critical');
    // determinístico: R$ 15 mil no dia 14/07, queimando R$ 114 mil/mês de fixo
    expect(runway!.facts.zeroOn).toBe('2026-07-29');
  });

  it('dispara scissor: receita crescendo e a operação comendo o caixa', () => {
    const alerts = evaluate(computeAll(clinicaTesoura));
    const scissor = alerts.find((a) => a.ruleKey === 'scissor');
    expect(scissor).toBeDefined();
    expect(scissor!.severity).toBe('warn');
    expect(scissor!.facts.revenueGrowthRatio as number).toBeGreaterThan(0);
    expect(scissor!.facts.ncgOverRevenue as number).toBeGreaterThan(0.15);
  });

  it('o crítico vem primeiro, e a dependência da Unimed também aparece', () => {
    const alerts = evaluate(computeAll(clinicaTesoura));
    expect(alerts[0]!.ruleKey).toBe('cash_runway');
    const conc = alerts.find((a) => a.ruleKey === 'concentration');
    expect(conc).toBeDefined();
    expect(conc!.facts.topCustomer).toBe('Unimed Regional');
  });
});
