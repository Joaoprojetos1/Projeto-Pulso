/**
 * Dados de DEMONSTRAÇÃO — a "Horizonte Comércio", 100% inventada. Entra quando
 * o servidor não está no ar ou quando o visitante toca em "Ver o Pulso
 * funcionando", sempre rotulada como demonstração na tela.
 *
 * É de propósito um cenário SAUDÁVEL: caixa projetado positivo e subindo, sem
 * risco de zeragem, estágio verde — e apenas UM aviso âmbar leve (o prazo de
 * recebimento subindo) para mostrar como os avisos funcionam sem assustar.
 *
 * Nenhum número aqui foi calculado pelo app: é um retrato pronto, no mesmo
 * formato que o servidor devolve. Empresa neutra (sem segmento).
 */

import type { DashboardJson } from './api';

export const DEMO_DASHBOARD: DashboardJson = {
  company: { id: 'demo', name: 'Horizonte Comércio', niche: 'comercio' },
  snapshot: {
    asOf: '2026-07-15',
    coreVersion: '0.1.0',
    computedAt: '2026-07-15T12:00:00Z',
    indicators: {
      cash_balance: {
        key: 'cash_balance',
        value: 4_800_000,
        unit: 'cents',
        inputs: { observedOn: '2026-07-14', stalenessDays: 1 },
      },
      cash_projection: {
        key: 'cash_projection',
        // positivo e subindo nos três horizontes, sem data de zeragem
        value: [
          { horizonDays: 30, projectedCents: 6_100_000 },
          { horizonDays: 60, projectedCents: 7_400_000 },
          { horizonDays: 90, projectedCents: 8_800_000 },
        ],
        unit: 'cents',
        inputs: {
          openingBalanceCents: 4_800_000,
          avgLatenessDays: 9,
          monthlyFixedCostCents: 2_200_000,
        },
      },
      pmr: { key: 'pmr', value: 41, unit: 'days', inputs: { settledCount: 32 } },
      pmp: { key: 'pmp', value: 28, unit: 'days', inputs: { settledCount: 24 } },
      cash_cycle: { key: 'cash_cycle', value: 30, unit: 'days', inputs: { pmr: 41, pmp: 28, pme: 17 } },
      ncg: {
        key: 'ncg',
        value: 2_600_000,
        unit: 'cents',
        inputs: { openReceivablesCents: 3_800_000, openPayablesCents: 1_200_000 },
      },
      revenue_current: {
        key: 'revenue_current',
        value: 9_600_000,
        unit: 'cents',
        inputs: { entryCount: 34 },
      },
      revenue_previous: {
        key: 'revenue_previous',
        value: 9_000_000,
        unit: 'cents',
        inputs: { entryCount: 31 },
      },
      contribution_margin: {
        key: 'contribution_margin',
        value: 0.42,
        unit: 'ratio',
        inputs: { revenueCents: 9_600_000, variableCostCents: 5_568_000 },
      },
      fixed_cost_monthly: {
        key: 'fixed_cost_monthly',
        value: 2_200_000,
        unit: 'cents',
        inputs: { source: 'declared' },
      },
      customer_concentration: {
        key: 'customer_concentration',
        value: 0.22,
        unit: 'ratio',
        inputs: { topCustomer: 'Cliente Silva', customerCount: 14 },
      },
    },
  },
  // tendência do exemplo (atual × anterior) — fictícia, como o resto
  comparativos: {
    cash_cycle: { atual: 30, anterior: 24 }, // subiu: o recebimento está mais lento (o aviso âmbar)
    contribution_margin: { atual: 0.42, anterior: 0.41 }, // estável/levemente melhor
    revenue_current: { atual: 9_600_000, anterior: 9_000_000 }, // receita cresceu
  },
  // diagnóstico do exemplo — caixa saudável, veio de um momento de atenção
  diagnosis: {
    stage: 'saudavel',
    drivers: [{ premissa: 'P1', stage: 'saudavel', facts: { projectedCents: 6_100_000 } }],
    transitions: { previousStage: 'atencao', direction: 'melhorou' },
    facts: { unavailable: {}, cashBalanceCents: 4_800_000, firedPremissas: [] },
    text: {
      title: 'Seu caixa está saudável',
      body: 'A projeção segue positiva e subindo nos próximos 90 dias. Só fique de olho no prazo de recebimento, que subiu no último mês.',
      modelVersion: 'demo',
    },
  },
  alerts: [
    {
      ruleKey: 'receivables_slowing',
      severity: 'warn',
      facts: {
        pmrDays: 41,
        pmrPreviousDays: 33,
        avgLatenessDays: 9,
        cashCycleDays: 30,
      },
      textTitle: 'Você está recebendo mais devagar',
      textBody:
        'O prazo médio para o dinheiro cair na conta subiu de 33 para 41 dias no último mês. O caixa continua saudável, mas dá pra corrigir cedo, antes de apertar.',
    },
  ],
};
