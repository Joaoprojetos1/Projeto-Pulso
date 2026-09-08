/**
 * Dados de DEMONSTRAÇÃO — a "Horizonte Comércio", 100% inventada. Entra quando
 * o servidor não está no ar ou quando o visitante toca em "Ver o Ivo
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

/**
 * Curva diária FICTÍCIA do exemplo, para a régua do fôlego aparecer na
 * demonstração como aparece de verdade. Ancorada nos mesmos números do resto
 * deste arquivo (4.800.000 hoje → 6.100.000 em 30d → 7.400.000 em 60d →
 * 8.800.000 em 90d), com o vaivém de quem paga contas no começo do mês.
 *
 * NÃO é cálculo de produto: é a construção de um dado de mentira, rotulado como
 * demonstração na tela. Na conta real, a curva vem pronta do motor.
 */
function curvaExemplo(): { day: string; cents: number }[] {
  const ancoras = [
    { dia: 0, cents: 4_800_000 },
    { dia: 30, cents: 6_100_000 },
    { dia: 60, cents: 7_400_000 },
    { dia: 90, cents: 8_800_000 },
  ];
  const base = new Date('2026-07-15T12:00:00Z');
  const pontos: { day: string; cents: number }[] = [];
  for (let d = 0; d <= 90; d++) {
    const fim = ancoras.find((a) => a.dia >= d) ?? ancoras[ancoras.length - 1]!;
    const ini = [...ancoras].reverse().find((a) => a.dia <= d) ?? ancoras[0]!;
    const span = fim.dia - ini.dia;
    const t = span === 0 ? 0 : (d - ini.dia) / span;
    const reta = ini.cents + (fim.cents - ini.cents) * t;
    // vaivém do mês: cai perto do dia 5 (contas) e sobe perto do 20 (recebimentos)
    const diaDoMes = (15 + d) % 30;
    const onda = diaDoMes < 8 ? -420_000 * (1 - diaDoMes / 8) : diaDoMes > 18 ? 260_000 : 0;
    const data = new Date(base.getTime() + d * 86_400_000);
    pontos.push({ day: data.toISOString().slice(0, 10), cents: Math.round(reta + onda) });
  }
  return pontos;
}

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
  // régua do fôlego (painel) e escada (detalhe) — os dois desenhos do exemplo
  projectionCurve: curvaExemplo(),
  projectionBreakdown: {
    horizonDays: 30,
    openingCents: 4_800_000,
    steps: [
      { key: 'a_receber', deltaCents: 3_800_000, count: 12 },
      { key: 'a_pagar', deltaCents: -300_000, count: 3 },
      { key: 'custo_fixo', deltaCents: -2_200_000, count: 0 },
    ],
    endingCents: 6_100_000, // fecha com o "caixa projetado · 30 dias" do exemplo
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
