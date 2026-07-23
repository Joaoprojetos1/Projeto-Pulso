/**
 * Pulso core — indicadores.
 *
 * Funções puras. Cada uma devolve valor + inputs (auditoria).
 * Quando falta dado, devolve value:null com motivo. NUNCA estima.
 */

import { addDays, daysBetween } from './dates';
import { fusePlannedIntoProjection } from './planned';
import type {
  Cents,
  CompanySnapshot,
  Entry,
  Indicator,
  IndicatorSet,
  IsoDate,
} from './types';

export const CORE_VERSION = '0.1.0';

// Utilitários de data em ./dates (reaproveitados por planned.ts sem criar
// dependência circular); o index reexporta ./dates para quem consome @pulso/core.

const inWindow = (d: IsoDate, from: IsoDate, to: IsoDate) => d >= from && d <= to;

/** Média ponderada por valor. Retorna null se não houver peso. */
function weightedAvg(pairs: Array<{ value: number; weight: number }>): number | null {
  const totalWeight = pairs.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return null;
  const sum = pairs.reduce((s, p) => s + p.value * p.weight, 0);
  return sum / totalWeight;
}

// ---------------------------------------------------------------
// 01 — Saldo de caixa atual
// ---------------------------------------------------------------

export function cashBalance(snap: CompanySnapshot): Indicator<Cents> {
  const sorted = [...snap.balances]
    .filter((b) => b.observedOn <= snap.asOf)
    .sort((a, b) => (a.observedOn < b.observedOn ? 1 : -1));

  const latest = sorted[0];
  if (!latest) {
    return {
      key: 'cash_balance',
      value: null,
      unit: 'cents',
      inputs: {},
      insufficientReason: 'Nenhum saldo bancário informado.',
    };
  }

  const staleness = daysBetween(latest.observedOn, snap.asOf);

  return {
    key: 'cash_balance',
    value: latest.balanceCents,
    unit: 'cents',
    inputs: {
      observedOn: latest.observedOn,
      stalenessDays: staleness,
    },
  };
}

// ---------------------------------------------------------------
// 03 / 04 — Prazo médio de recebimento e de pagamento
//
// Definição: média ponderada por valor dos dias efetivamente levados
// (settledOn - issuedOn), sobre o que foi LIQUIDADO na janela.
//
// Por que não DSO contábil (AR/receita*dias): para PME, o que dói é o
// prazo real praticado, não o indicador de balanço. E o dono entende
// "você está recebendo em 46 dias" — não entende DSO.
// ---------------------------------------------------------------

function averageTerm(
  entries: Entry[],
  kind: 'receivable' | 'payable',
  from: IsoDate,
  to: IsoDate,
): { avg: number | null; count: number; volume: Cents } {
  const settled = entries.filter(
    (e) => e.kind === kind && e.settledOn !== null && inWindow(e.settledOn, from, to),
  );

  const avg = weightedAvg(
    settled.map((e) => ({
      value: daysBetween(e.issuedOn, e.settledOn as IsoDate),
      weight: e.amountCents,
    })),
  );

  return {
    avg,
    count: settled.length,
    volume: settled.reduce((s, e) => s + e.amountCents, 0),
  };
}

const MIN_SAMPLE = 3; // abaixo disso, o número mente

export function averageReceivableDays(
  snap: CompanySnapshot,
  windowDays = 90,
): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const r = averageTerm(snap.entries, 'receivable', from, snap.asOf);

  if (r.avg === null || r.count < MIN_SAMPLE) {
    return {
      key: 'pmr',
      value: null,
      unit: 'days',
      inputs: { settledCount: r.count },
      window: { from, to: snap.asOf },
      insufficientReason: `Apenas ${r.count} recebimentos liquidados na janela (mínimo ${MIN_SAMPLE}).`,
    };
  }

  return {
    key: 'pmr',
    value: Math.round(r.avg),
    unit: 'days',
    inputs: { settledCount: r.count, settledVolumeCents: r.volume },
    window: { from, to: snap.asOf },
  };
}

export function averagePayableDays(
  snap: CompanySnapshot,
  windowDays = 90,
): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const r = averageTerm(snap.entries, 'payable', from, snap.asOf);

  if (r.avg === null || r.count < MIN_SAMPLE) {
    return {
      key: 'pmp',
      value: null,
      unit: 'days',
      inputs: { settledCount: r.count },
      window: { from, to: snap.asOf },
      insufficientReason: `Apenas ${r.count} pagamentos liquidados na janela (mínimo ${MIN_SAMPLE}).`,
    };
  }

  return {
    key: 'pmp',
    value: Math.round(r.avg),
    unit: 'days',
    inputs: { settledCount: r.count, settledVolumeCents: r.volume },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 05 — Ciclo de caixa
//
// Ciclo = PMR + PME - PMP
//
// NOTA DE DOMÍNIO: clínica médica é serviço, não tem estoque.
// PME (prazo médio de estocagem) = 0 no nicho do MVP.
// Quando entrar padaria/comércio, PME passa a existir e esta função muda.
// Deixado explícito de propósito — não é esquecimento.
// ---------------------------------------------------------------

export function cashCycle(snap: CompanySnapshot): Indicator<number> {
  const pmr = averageReceivableDays(snap);
  const pmp = averagePayableDays(snap);
  const pme = 0; // serviço: sem estoque

  if (pmr.value === null || pmp.value === null) {
    return {
      key: 'cash_cycle',
      value: null,
      unit: 'days',
      inputs: { pmr: pmr.value, pmp: pmp.value, pme },
      insufficientReason: pmr.insufficientReason ?? pmp.insufficientReason,
    };
  }

  return {
    key: 'cash_cycle',
    value: pmr.value + pme - pmp.value,
    unit: 'days',
    inputs: { pmr: pmr.value, pmp: pmp.value, pme },
  };
}

// ---------------------------------------------------------------
// 06 — Necessidade de capital de giro (NCG)
//
// NCG = contas a receber em aberto - contas a pagar em aberto
//
// É quanto de dinheiro a operação está consumindo pra existir.
// Quando isso cresce mais rápido que a receita, é a TESOURA: a empresa
// vende mais, lucra no papel, e some o dinheiro.
// ---------------------------------------------------------------

export function workingCapitalNeed(snap: CompanySnapshot): Indicator<Cents> {
  const open = snap.entries.filter((e) => e.settledOn === null);
  const ar = open.filter((e) => e.kind === 'receivable').reduce((s, e) => s + e.amountCents, 0);
  const ap = open.filter((e) => e.kind === 'payable').reduce((s, e) => s + e.amountCents, 0);

  return {
    key: 'ncg',
    value: ar - ap,
    unit: 'cents',
    inputs: {
      openReceivablesCents: ar,
      openPayablesCents: ap,
      openReceivablesCount: open.filter((e) => e.kind === 'receivable').length,
      openPayablesCount: open.filter((e) => e.kind === 'payable').length,
    },
  };
}

// ---------------------------------------------------------------
// 07 — Receita do período (competência)
// ---------------------------------------------------------------

export function revenueInWindow(
  snap: CompanySnapshot,
  from: IsoDate,
  to: IsoDate,
): Indicator<Cents> {
  const rows = snap.entries.filter(
    (e) => e.kind === 'receivable' && inWindow(e.issuedOn, from, to),
  );

  return {
    key: 'revenue',
    value: rows.reduce((s, e) => s + e.amountCents, 0),
    unit: 'cents',
    inputs: { entryCount: rows.length },
    window: { from, to },
  };
}

// ---------------------------------------------------------------
// 09 — Custo fixo mensal
// ---------------------------------------------------------------

export function monthlyFixedCost(snap: CompanySnapshot, windowDays = 90): Indicator<Cents> {
  const from = addDays(snap.asOf, -windowDays);
  const fixed = snap.entries.filter(
    (e) => e.kind === 'payable' && e.costType === 'fixed' && inWindow(e.issuedOn, from, snap.asOf),
  );

  if (fixed.length === 0) {
    if (snap.declaredFixedCostCents != null) {
      return {
        key: 'fixed_cost_monthly',
        value: snap.declaredFixedCostCents,
        unit: 'cents',
        inputs: { source: 'declared_at_onboarding' },
      };
    }
    return {
      key: 'fixed_cost_monthly',
      value: null,
      unit: 'cents',
      inputs: {},
      insufficientReason: 'Nenhum custo classificado como fixo, e nada declarado no onboarding.',
    };
  }

  const total = fixed.reduce((s, e) => s + e.amountCents, 0);
  const months = windowDays / 30;

  return {
    key: 'fixed_cost_monthly',
    value: Math.round(total / months),
    unit: 'cents',
    inputs: { source: 'derived_from_entries', totalCents: total, months, entryCount: fixed.length },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 08 — Margem de contribuição
// ---------------------------------------------------------------

export function contributionMargin(snap: CompanySnapshot, windowDays = 90): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const revenue = revenueInWindow(snap, from, snap.asOf).value ?? 0;

  const variable = snap.entries
    .filter(
      (e) =>
        e.kind === 'payable' && e.costType === 'variable' && inWindow(e.issuedOn, from, snap.asOf),
    )
    .reduce((s, e) => s + e.amountCents, 0);

  if (revenue === 0) {
    return {
      key: 'contribution_margin',
      value: null,
      unit: 'ratio',
      inputs: { revenueCents: 0, variableCostCents: variable },
      window: { from, to: snap.asOf },
      insufficientReason: 'Sem receita na janela.',
    };
  }

  return {
    key: 'contribution_margin',
    value: (revenue - variable) / revenue,
    unit: 'ratio',
    inputs: { revenueCents: revenue, variableCostCents: variable },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 10 — Concentração de clientes
// ---------------------------------------------------------------

export function customerConcentration(
  snap: CompanySnapshot,
  windowDays = 180,
): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const rows = snap.entries.filter(
    (e) => e.kind === 'receivable' && inWindow(e.issuedOn, from, snap.asOf) && e.counterparty,
  );

  const total = rows.reduce((s, e) => s + e.amountCents, 0);
  if (total === 0) {
    return {
      key: 'customer_concentration',
      value: null,
      unit: 'ratio',
      inputs: {},
      window: { from, to: snap.asOf },
      insufficientReason: 'Sem receita identificada por cliente na janela.',
    };
  }

  const byCustomer = new Map<string, Cents>();
  for (const e of rows) {
    const k = e.counterparty as string;
    byCustomer.set(k, (byCustomer.get(k) ?? 0) + e.amountCents);
  }

  const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    key: 'customer_concentration',
    value: top[1] / total,
    unit: 'ratio',
    inputs: {
      topCustomer: top[0],
      topCustomerCents: top[1],
      totalCents: total,
      customerCount: byCustomer.size,
    },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 09b — Ponto de equilíbrio (break-even) — insumo da premissa P6 do diagnóstico
//
// Receita mensal mínima para cobrir o custo fixo, dado quanto sobra de cada
// venda (margem de contribuição): break_even = custo_fixo / margem.
// Abaixo dele, a operação não se paga.
// ---------------------------------------------------------------

export function operatingBreakEven(snap: CompanySnapshot): Indicator<Cents> {
  const fixed = monthlyFixedCost(snap);
  const margin = contributionMargin(snap);

  if (fixed.value === null || margin.value === null || margin.value <= 0) {
    return {
      key: 'break_even_revenue',
      value: null,
      unit: 'cents',
      inputs: { monthlyFixedCostCents: fixed.value, contributionMargin: margin.value },
      insufficientReason:
        fixed.value === null
          ? 'Sem custo fixo para calcular o ponto de equilíbrio.'
          : margin.value === null
            ? 'Sem margem de contribuição para calcular o ponto de equilíbrio.'
            : 'Margem de contribuição zero ou negativa: ponto de equilíbrio indefinido.',
    };
  }

  return {
    key: 'break_even_revenue',
    value: Math.round(fixed.value / margin.value),
    unit: 'cents',
    inputs: { monthlyFixedCostCents: fixed.value, contributionMargin: margin.value },
  };
}

// ---------------------------------------------------------------
// 10b — Inadimplência da carteira (90+ dias) — insumo da premissa P8
//
// Dos recebíveis em aberto, que fração (por valor) está vencida há 90+ dias.
// É a carteira que não vira caixa.
// ---------------------------------------------------------------

export function delinquencyRate(snap: CompanySnapshot): Indicator<number> {
  const openRec = snap.entries.filter((e) => e.kind === 'receivable' && e.settledOn === null);
  const total = openRec.reduce((s, e) => s + e.amountCents, 0);

  if (total === 0) {
    return {
      key: 'delinquency_rate',
      value: null,
      unit: 'ratio',
      inputs: {},
      insufficientReason: 'Sem recebíveis em aberto para avaliar inadimplência.',
    };
  }

  const aged = openRec.filter((e) => daysBetween(e.dueOn, snap.asOf) >= 90);
  const agedTotal = aged.reduce((s, e) => s + e.amountCents, 0);

  return {
    key: 'delinquency_rate',
    value: agedTotal / total,
    unit: 'ratio',
    inputs: {
      overdue90PlusCents: agedTotal,
      openReceivablesCents: total,
      overdue90PlusCount: aged.length,
    },
  };
}

// ---------------------------------------------------------------
// 02 — Projeção de caixa (O HERÓI)
//
// caixa_projetado(d) = saldo_hoje
//                    + recebíveis em aberto que vencem até d, ATRASADOS pelo
//                      atraso médio real do cliente (não pela data prometida)
//                    - pagáveis em aberto que vencem até d
//                    - custo fixo proporcional ao período
//
// A parte não óbvia é o `atrasoRealMedio`: usar a data de vencimento
// prometida é o erro clássico. O cliente promete 30 e paga em 46. Projetar
// pelo prometido é o que faz o dono achar que tem dinheiro que não tem.
// ---------------------------------------------------------------

export interface CashProjection {
  horizonDays: number;
  projectedCents: Cents;
  /** Primeiro dia em que a projeção fica negativa. null = não zera no horizonte. */
  zeroOn: IsoDate | null;
}

export function projectCash(
  snap: CompanySnapshot,
  horizons: number[] = [30, 60, 90],
  // Gancho de SIMULAÇÃO (ver simulate.ts). Opcional e aditivo: sem ele, o
  // comportamento é EXATAMENTE o de sempre. Quando presente, substitui o custo
  // fixo mensal usado na projeção — é o único jeito de modelar um CORTE de custo
  // fixo, já que um lançamento nunca é negativo. Nada mais muda.
  opts: { fixedCostOverrideCents?: Cents | null } = {},
): Indicator<CashProjection[]> {
  const balance = cashBalance(snap);
  const fixed = monthlyFixedCost(snap);
  const fixedValue =
    opts.fixedCostOverrideCents !== undefined ? opts.fixedCostOverrideCents : fixed.value;
  const pmr = averageReceivableDays(snap);

  if (balance.value === null) {
    return {
      key: 'cash_projection',
      value: null,
      unit: 'cents',
      inputs: {},
      insufficientReason: 'Sem saldo de caixa: não há de onde projetar.',
    };
  }

  const open = snap.entries.filter((e) => e.settledOn === null);

  // Atraso médio real: quanto o cliente atrasa além do prometido.
  // Se não dá pra medir, assume zero (conservador para o lado do "não invente").
  const settledR = snap.entries.filter((e) => e.kind === 'receivable' && e.settledOn);
  const avgLateness =
    weightedAvg(
      settledR.map((e) => ({
        value: daysBetween(e.dueOn, e.settledOn as IsoDate),
        weight: e.amountCents,
      })),
    ) ?? 0;
  const latenessDays = Math.max(0, Math.round(avgLateness));

  // Constrói a curva dia a dia até o maior horizonte.
  const maxH = Math.max(...horizons);

  // Fase 2: as contas PREVISTAS do dono entram na curva (realista, não otimista).
  // A fusão (planned.ts) devolve os movimentos já com a data e o sinal certos;
  // aqui só somamos por dia. As confirmadas não entram (o realizado já está em
  // `entries`). O atraso médio usado é o MESMO da projeção (latenessDays).
  const fusion = fusePlannedIntoProjection(snap.planned ?? [], {
    asOf: snap.asOf,
    avgLatenessDays: latenessDays,
    maxHorizonDays: maxH,
  });
  const plannedByDay = new Map<IsoDate, Cents>();
  for (const ev of fusion.events) {
    plannedByDay.set(ev.day, (plannedByDay.get(ev.day) ?? 0) + ev.deltaCents);
  }

  let running = balance.value;
  let zeroOn: IsoDate | null = null;
  const curve = new Map<number, Cents>();

  for (let d = 1; d <= maxH; d++) {
    const day = addDays(snap.asOf, d);

    for (const e of open) {
      if (e.kind === 'receivable') {
        // chega atrasado, do jeito que a vida é
        if (addDays(e.dueOn, latenessDays) === day) running += e.amountCents;
      } else {
        if (e.dueOn === day) running -= e.amountCents;
      }
    }

    // custo fixo diluído por dia
    if (fixedValue !== null) running -= Math.round(fixedValue / 30);

    // contas previstas do dono que se movem neste dia
    const planned = plannedByDay.get(day);
    if (planned) running += planned;

    if (running < 0 && zeroOn === null) zeroOn = day;
    curve.set(d, running);
  }

  const value: CashProjection[] = horizons.map((h) => ({
    horizonDays: h,
    projectedCents: curve.get(h) ?? balance.value!,
    zeroOn: zeroOn && daysBetween(snap.asOf, zeroOn) <= h ? zeroOn : null,
  }));

  return {
    key: 'cash_projection',
    value,
    unit: 'cents',
    inputs: {
      openingBalanceCents: balance.value,
      avgLatenessDays: latenessDays,
      monthlyFixedCostCents: fixedValue,
      openReceivablesCount: open.filter((e) => e.kind === 'receivable').length,
      openPayablesCount: open.filter((e) => e.kind === 'payable').length,
      pmrDays: pmr.value,
      // Fase 2: quantas previstas entraram e quanto somam (para "de onde vem")
      plannedCount: fusion.plannedCount,
      plannedTotalCents: fusion.plannedTotalCents,
      zeroOn,
      // dias até zerar (insumo da premissa P2 do diagnóstico); null se não zera
      zeroInDays: zeroOn ? daysBetween(snap.asOf, zeroOn) : null,
    },
  };
}

// ---------------------------------------------------------------
// Orquestrador
// ---------------------------------------------------------------

export function computeAll(snap: CompanySnapshot): IndicatorSet {
  const prevFrom = addDays(snap.asOf, -60);
  const prevTo = addDays(snap.asOf, -31);
  const currFrom = addDays(snap.asOf, -30);

  return {
    cash_balance: cashBalance(snap),
    cash_projection: projectCash(snap),
    pmr: averageReceivableDays(snap),
    pmp: averagePayableDays(snap),
    cash_cycle: cashCycle(snap),
    ncg: workingCapitalNeed(snap),
    revenue_current: revenueInWindow(snap, currFrom, snap.asOf),
    revenue_previous: revenueInWindow(snap, prevFrom, prevTo),
    contribution_margin: contributionMargin(snap),
    fixed_cost_monthly: monthlyFixedCost(snap),
    customer_concentration: customerConcentration(snap),
    break_even_revenue: operatingBreakEven(snap),
    delinquency_rate: delinquencyRate(snap),
  };
}
