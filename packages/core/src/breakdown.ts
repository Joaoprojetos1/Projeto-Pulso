/**
 * Composição da projeção de caixa — "por que o caixa cai".
 *
 * A projeção (`projectCash`) responde QUANTO sobra num horizonte. Esta função
 * responde DE ONDE vem esse número: quanto entra de recebíveis, quanto sai de
 * contas a pagar, quanto pesa o custo fixo e quanto mexem as contas previstas
 * do dono, no mesmo período. É o que a tela desenha como escada.
 *
 * REGRA DA CASA: o app não pode montar essa conta. Ela é calculada aqui, pura e
 * testada, e chega pronta na tela.
 *
 * DECISÃO DE PROJETO: `projectCash` NÃO foi alterada (é fórmula auditada). Esta
 * função repete a MESMA aritmética, dia a dia, com as mesmas peças
 * (`cashBalance`, `monthlyFixedCost`, `fusePlannedIntoProjection` e o mesmo
 * atraso médio). O que garante que as duas nunca divirjam é o teste de
 * RECONCILIAÇÃO: o fim da escada tem de bater, ao centavo, com a projeção do
 * mesmo horizonte. Se alguém mudar a fórmula lá e esquecer daqui, o teste quebra.
 */

import { addDays } from './dates';
import { averageLatenessDays, cashBalance, monthlyFixedCost } from './indicators';
import { fusePlannedIntoProjection } from './planned';
import type { Cents, CompanySnapshot, IsoDate } from './types';

/** Cada degrau da escada. `deltaCents` positivo entra, negativo sai. */
export type CashStepKey = 'a_receber' | 'a_pagar' | 'custo_fixo' | 'previstas';

export interface CashStep {
  key: CashStepKey;
  deltaCents: Cents;
  /** Quantos lançamentos formam o degrau (custo fixo não tem contagem: 0). */
  count: number;
}

export interface CashBreakdown {
  horizonDays: number;
  /** Saldo de onde a projeção parte (o mesmo `cash_balance`). */
  openingCents: Cents;
  /** Só os degraus que existem (delta diferente de zero), na ordem de leitura. */
  steps: CashStep[];
  /** Saldo projetado no fim do horizonte — bate com `projectCash`. */
  endingCents: Cents;
}

/**
 * Decompõe a projeção do horizonte pedido. Devolve null quando não há de onde
 * projetar (sem saldo informado) — a tela então não desenha escada nenhuma, em
 * vez de mostrar uma escada de zeros.
 */
export function cashProjectionBreakdown(
  snap: CompanySnapshot,
  horizonDays = 30,
): CashBreakdown | null {
  const balance = cashBalance(snap);
  if (balance.value === null) return null;

  const fixedValue = monthlyFixedCost(snap).value;
  const open = snap.entries.filter((e) => e.settledOn === null);

  // MESMO atraso médio da projeção (o cliente promete 30 e paga em 46).
  const latenessDays = averageLatenessDays(snap);

  const fusion = fusePlannedIntoProjection(snap.planned ?? [], {
    asOf: snap.asOf,
    avgLatenessDays: latenessDays,
    maxHorizonDays: horizonDays,
  });
  const plannedByDay = new Map<IsoDate, Cents>();
  for (const ev of fusion.events) {
    plannedByDay.set(ev.day, (plannedByDay.get(ev.day) ?? 0) + ev.deltaCents);
  }

  let receber = 0;
  let receberCount = 0;
  let pagar = 0;
  let pagarCount = 0;
  let custoFixo = 0;
  let previstas = 0;
  let previstasCount = 0;

  for (let d = 1; d <= horizonDays; d++) {
    const day = addDays(snap.asOf, d);

    for (const e of open) {
      if (e.kind === 'receivable') {
        if (addDays(e.dueOn, latenessDays) === day) {
          receber += e.amountCents;
          receberCount += 1;
        }
      } else if (e.dueOn === day) {
        pagar += e.amountCents;
        pagarCount += 1;
      }
    }

    // custo fixo diluído por dia, arredondado igual à projeção
    if (fixedValue !== null) custoFixo += Math.round(fixedValue / 30);

    const planned = plannedByDay.get(day);
    if (planned) {
      previstas += planned;
      previstasCount += 1;
    }
  }

  const steps: CashStep[] = [];
  if (receber !== 0) steps.push({ key: 'a_receber', deltaCents: receber, count: receberCount });
  if (previstas !== 0) {
    steps.push({ key: 'previstas', deltaCents: previstas, count: previstasCount });
  }
  if (pagar !== 0) steps.push({ key: 'a_pagar', deltaCents: -pagar, count: pagarCount });
  if (custoFixo !== 0) steps.push({ key: 'custo_fixo', deltaCents: -custoFixo, count: 0 });

  const endingCents = balance.value + receber - pagar - custoFixo + previstas;

  return { horizonDays, openingCents: balance.value, steps, endingCents };
}
