/**
 * Pulso core — motor de regras.
 *
 * REGRA CENTRAL: quem decide alertar é o código, não o modelo.
 * Cada regra recebe indicadores e devolve `facts` — números crus.
 * A camada de IA transforma `facts` em texto. Só isso.
 *
 * Se você se pegar querendo passar a decisão pro modelo ("veja se tem
 * algo preocupante aqui"), parou. Escreva a regra.
 */

import type { AlertFact, IndicatorSet, Rule } from './types';
import type { CashProjection } from './indicators';

/** Limiares em um lugar só. É aqui que o especialista mexe. */
export const THRESHOLDS = {
  runwayCriticalDays: 60,
  cycleWorseningRatio: 0.2, // ciclo 20% pior que a média histórica
  concentrationRatio: 0.3, // 1 cliente > 30% do faturamento
  marginDropRatio: 0.05, // margem caiu 5 p.p.
  scissorGapRatio: 0.15, // NCG cresce 15% mais rápido que a receita
};

// ---------------------------------------------------------------
// O caixa vai zerar
// ---------------------------------------------------------------
export const cashRunwayRule: Rule = (ind) => {
  const proj = ind.cash_projection?.value as CashProjection[] | null;
  if (!proj) return null;

  const withZero = proj.find((p) => p.zeroOn !== null);
  if (!withZero?.zeroOn) return null;

  return {
    ruleKey: 'cash_runway',
    severity: 'critical',
    facts: {
      zeroOn: withZero.zeroOn,
      openingBalanceCents: ind.cash_projection.inputs.openingBalanceCents ?? null,
      avgLatenessDays: ind.cash_projection.inputs.avgLatenessDays ?? null,
      pmrDays: ind.pmr?.value ?? null,
      pmpDays: ind.pmp?.value ?? null,
      monthlyFixedCostCents: ind.fixed_cost_monthly?.value ?? null,
    },
  };
};

// ---------------------------------------------------------------
// A TESOURA — a tese do produto
// A receita sobe, mas a NCG sobe mais rápido: a empresa está financiando
// o próprio crescimento com dinheiro que não tem.
// ---------------------------------------------------------------
export const scissorRule: Rule = (ind) => {
  const rc = ind.revenue_current?.value as number | null;
  const rp = ind.revenue_previous?.value as number | null;
  const ncg = ind.ncg?.value as number | null;

  if (rc === null || rp === null || ncg === null || rp === 0) return null;

  const revenueGrowth = (rc - rp) / rp;
  // NCG como proporção da receita: se cresce, cada real vendido consome mais caixa
  const ncgOverRevenue = rc === 0 ? null : ncg / rc;
  if (ncgOverRevenue === null) return null;

  // Cresceu receita E a operação está consumindo caixa desproporcional
  if (revenueGrowth > 0 && ncgOverRevenue > THRESHOLDS.scissorGapRatio) {
    return {
      ruleKey: 'scissor',
      severity: 'warn',
      facts: {
        revenueGrowthRatio: revenueGrowth,
        revenueCurrentCents: rc,
        revenuePreviousCents: rp,
        ncgCents: ncg,
        ncgOverRevenue,
        pmrDays: ind.pmr?.value ?? null,
        pmpDays: ind.pmp?.value ?? null,
      },
    };
  }
  return null;
};

// ---------------------------------------------------------------
// Receita caiu e custo fixo não — o exemplo literal do especialista
// ---------------------------------------------------------------
export const revenueDropFixedCostRule: Rule = (ind) => {
  const rc = ind.revenue_current?.value as number | null;
  const rp = ind.revenue_previous?.value as number | null;
  const fixed = ind.fixed_cost_monthly?.value as number | null;

  if (rc === null || rp === null || fixed === null || rp === 0) return null;

  const drop = (rp - rc) / rp;
  if (drop <= 0.05) return null;

  return {
    ruleKey: 'revenue_drop_fixed_cost',
    severity: 'warn',
    facts: {
      revenueDropRatio: drop,
      revenueCurrentCents: rc,
      revenuePreviousCents: rp,
      monthlyFixedCostCents: fixed,
      fixedCostOverRevenue: rc === 0 ? null : fixed / rc,
    },
  };
};

// ---------------------------------------------------------------
// Concentração de clientes
// ---------------------------------------------------------------
export const concentrationRule: Rule = (ind) => {
  const c = ind.customer_concentration?.value as number | null;
  if (c === null || c <= THRESHOLDS.concentrationRatio) return null;

  return {
    ruleKey: 'concentration',
    severity: 'warn',
    facts: {
      topCustomerShare: c,
      topCustomer: (ind.customer_concentration.inputs.topCustomer as string) ?? null,
      customerCount: (ind.customer_concentration.inputs.customerCount as number) ?? null,
    },
  };
};

// ---------------------------------------------------------------
// Silêncio também é sinal.
// Se nenhuma regra disparou, o produto ainda fala. Presença cria hábito;
// sumir uma semana faz o cara esquecer que o Pulso existe.
// ---------------------------------------------------------------
export const allClearRule = (ind: IndicatorSet, fired: AlertFact[]): AlertFact | null => {
  if (fired.length > 0) return null;
  return {
    ruleKey: 'all_clear',
    severity: 'ok',
    facts: {
      cashBalanceCents: (ind.cash_balance?.value as number) ?? null,
      cashCycleDays: (ind.cash_cycle?.value as number) ?? null,
      revenueCurrentCents: (ind.revenue_current?.value as number) ?? null,
    },
  };
};

export const RULES: Rule[] = [
  cashRunwayRule,
  scissorRule,
  revenueDropFixedCostRule,
  concentrationRule,
];

/** Avalia tudo. Ordena por severidade: o dono vê o pior primeiro. */
export function evaluate(ind: IndicatorSet): AlertFact[] {
  const fired = RULES.map((r) => r(ind)).filter((f): f is AlertFact => f !== null);

  const clear = allClearRule(ind, fired);
  if (clear) return [clear];

  const order = { critical: 0, warn: 1, ok: 2 } as const;
  return fired.sort((a, b) => order[a.severity] - order[b.severity]);
}
