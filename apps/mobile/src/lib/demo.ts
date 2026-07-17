/**
 * Dados de DEMONSTRAÇÃO — a Clínica Horizonte, 100% inventada (a mesma
 * das fixtures do servidor). Entram quando o servidor não está no ar,
 * sempre rotulados como demonstração na tela.
 *
 * Nenhum número aqui foi calculado pelo app: é um retrato pronto, no
 * mesmo formato que o servidor devolve.
 */

import type { DashboardJson } from './api';

export const DEMO_DASHBOARD: DashboardJson = {
  company: { id: 'demo', name: 'Clínica Horizonte', niche: 'clinica' },
  snapshot: {
    asOf: '2026-07-15',
    coreVersion: '0.1.0',
    computedAt: '2026-07-15T12:00:00Z',
    indicators: {
      cash_balance: {
        key: 'cash_balance',
        value: 1_500_000,
        unit: 'cents',
        inputs: { observedOn: '2026-07-14', stalenessDays: 1 },
      },
      cash_projection: {
        key: 'cash_projection',
        value: [
          { horizonDays: 30, projectedCents: 3_360_000, zeroOn: '2026-07-29' },
          { horizonDays: 60, projectedCents: -60_000, zeroOn: '2026-07-29' },
          { horizonDays: 90, projectedCents: -3_480_000, zeroOn: '2026-07-29' },
        ],
        unit: 'cents',
        inputs: {
          openingBalanceCents: 1_500_000,
          avgLatenessDays: 12,
          monthlyFixedCostCents: 3_420_000,
          zeroOn: '2026-07-29',
        },
      },
      pmr: { key: 'pmr', value: 36, unit: 'days', inputs: { settledCount: 22 } },
      pmp: { key: 'pmp', value: 0, unit: 'days', inputs: { settledCount: 18 } },
      cash_cycle: { key: 'cash_cycle', value: 36, unit: 'days', inputs: { pmr: 36, pmp: 0, pme: 0 } },
      ncg: {
        key: 'ncg',
        value: 5_280_000,
        unit: 'cents',
        inputs: { openReceivablesCents: 5_280_000, openPayablesCents: 0 },
      },
      revenue_current: {
        key: 'revenue_current',
        value: 6_680_000,
        unit: 'cents',
        inputs: { entryCount: 3 },
      },
      revenue_previous: {
        key: 'revenue_previous',
        value: 5_880_000,
        unit: 'cents',
        inputs: { entryCount: 3 },
      },
      contribution_margin: {
        key: 'contribution_margin',
        value: 0.75,
        unit: 'ratio',
        inputs: { revenueCents: 6_680_000, variableCostCents: 1_670_000 },
      },
      fixed_cost_monthly: {
        key: 'fixed_cost_monthly',
        value: 3_420_000,
        unit: 'cents',
        inputs: { source: 'derived_from_entries' },
      },
      customer_concentration: {
        key: 'customer_concentration',
        value: 0.486,
        unit: 'ratio',
        inputs: { topCustomer: 'Unimed Regional', customerCount: 6 },
      },
    },
  },
  alerts: [
    {
      ruleKey: 'cash_runway',
      severity: 'critical',
      facts: {
        zeroOn: '2026-07-29',
        openingBalanceCents: 1_500_000,
        avgLatenessDays: 12,
        pmrDays: 36,
        pmpDays: 0,
        monthlyFixedCostCents: 3_420_000,
      },
      textTitle: 'Seu caixa pode zerar em 29 de julho',
      textBody:
        'No ritmo de hoje, o dinheiro em conta acaba em 29 de julho. Ainda dá tempo de agir — vale olhar isso agora.',
    },
    {
      ruleKey: 'scissor',
      severity: 'warn',
      facts: {
        revenueGrowthRatio: 0.136,
        revenueCurrentCents: 6_680_000,
        revenuePreviousCents: 5_880_000,
        ncgCents: 5_280_000,
        ncgOverRevenue: 0.79,
        pmrDays: 36,
        pmpDays: 0,
      },
      textTitle: 'Você vende mais, mas o dinheiro demora a chegar',
      textBody:
        'Sua receita cresceu 14% e mesmo assim o caixa aperta: há muito dinheiro preso a receber. Vale rever prazos com convênios e fornecedores.',
    },
    {
      ruleKey: 'concentration',
      severity: 'warn',
      facts: { topCustomerShare: 0.486, topCustomer: 'Unimed Regional', customerCount: 6 },
      textTitle: 'Boa parte do seu faturamento vem de um cliente só',
      textBody:
        'Unimed Regional responde por 49% do que você fatura. Se ele atrasar ou sair, o impacto no caixa é grande.',
    },
  ],
};
