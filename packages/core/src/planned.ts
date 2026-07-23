/**
 * Fusão das contas PREVISTAS na projeção de caixa (Fase 2).
 *
 * Contexto: o dono cadastra contas previstas (a pagar / a receber). Até a Fase 1
 * elas só apareciam numa lista — a projeção IGNORAVA. Esta é a correção da
 * mentira atual do produto: o futuro projetado passa a considerar o que o dono
 * declarou, mas do jeito REALISTA (o dono é otimista; a projeção não pode ser).
 *
 * REGRAS (cada uma testada isolada em planned.test.ts):
 *   R1. Prevista a PAGAR entra na curva em `dueOn`, como SAÍDA.
 *   R2. Prevista a RECEBER entra em `dueOn + atraso médio real` (avgLateness, o
 *       mesmo que projectCash calcula), como ENTRADA.
 *   R3. VENCIDA e não confirmada (dueOn <= asOf, sem confirmedOn) NÃO some:
 *         a pagar  -> projeta no dia SEGUINTE ao asOf (vai ter que pagar);
 *         a receber -> projeta com o DOBRO do atraso médio (sinal de risco),
 *                      nunca antes de amanhã.
 *   R4. Recorrência 'monthly' expande UMA ocorrência por mês dentro do horizonte,
 *       cada ocorrência seguindo R1-R3.
 *   R5. Deduplicação: conta CONFIRMADA (status 'realizada') NÃO entra — o vínculo
 *       de confirmação é o próprio status; o valor realizado já vive em `entries`.
 *
 * Puro: sem I/O, sem banco. Entrada tipada -> eventos de caixa tipados.
 */

import { addDays, addMonths } from './dates';
import type { Cents, EntryKind, IsoDate, PlannedEntry } from './types';

/** Por que a conta caiu naquele dia — auditoria e futura explicação ao dono. */
export type PlannedReason =
  | 'due' // R1/R2: no vencimento (com atraso médio, se a receber)
  | 'overdue_payable' // R3: a pagar vencida → amanhã
  | 'overdue_receivable'; // R3: a receber vencida → dobro do atraso

/** Um movimento de caixa que uma conta prevista adiciona à curva de projeção. */
export interface PlannedCashEvent {
  day: IsoDate; // dia em que o dinheiro se move
  deltaCents: Cents; // + entrada, - saída
  kind: EntryKind;
  sourceId: string; // id da conta prevista de origem
  reason: PlannedReason;
}

export interface PlannedFusionContext {
  asOf: IsoDate;
  /** Atraso médio real da empresa (dias). O mesmo valor que projectCash calcula. */
  avgLatenessDays: number;
  /** Maior horizonte da projeção — limita a expansão da recorrência. */
  maxHorizonDays: number;
}

export interface PlannedFusion {
  /** Eventos que caem dentro do horizonte (amanhã .. asOf+maxHorizon). */
  events: PlannedCashEvent[];
  /** Quantos movimentos previstos entraram na projeção (ocorrências, não contas). */
  plannedCount: number;
  /** Soma bruta (valor absoluto) desses movimentos, em centavos. */
  plannedTotalCents: Cents;
}

/**
 * Ocorrências de uma conta dentro do horizonte. Avulsa: uma, em `dueOn`.
 * Mensal: uma por mês. Ocorrências muito antigas (mais de ~1 mês vencidas) são
 * história, não projeção — a mais recente vencida ainda entra (pela R3), mas não
 * empilhamos meses e meses de atraso.
 */
function occurrences(p: PlannedEntry, ctx: PlannedFusionContext): IsoDate[] {
  if (p.recurrence !== 'monthly') return [p.dueOn];

  const floor = addDays(ctx.asOf, -31);
  const horizonEnd = addDays(ctx.asOf, ctx.maxHorizonDays);
  const out: IsoDate[] = [];

  let occ = p.dueOn;
  while (occ < floor) occ = addMonths(occ, 1); // pula o passado distante
  while (occ <= horizonEnd) {
    out.push(occ);
    occ = addMonths(occ, 1);
  }
  return out;
}

/** Onde e com que sinal uma ocorrência entra na curva (R1-R3). */
function eventFor(
  p: PlannedEntry,
  occDue: IsoDate,
  o: { asOf: IsoDate; lateness: number; tomorrow: IsoDate },
): PlannedCashEvent {
  // "vencida" = venceu hoje ou antes e não foi confirmada (só previstas chegam aqui)
  const overdue = occDue <= o.asOf;

  if (p.kind === 'payable') {
    // R1 (futura, no vencimento) / R3 (vencida, amanhã: vai ter que pagar)
    return {
      day: overdue ? o.tomorrow : occDue,
      deltaCents: -p.amountCents,
      kind: 'payable',
      sourceId: p.id,
      reason: overdue ? 'overdue_payable' : 'due',
    };
  }

  // receivable
  if (overdue) {
    // R3: dobro do atraso médio (risco), nunca antes de amanhã
    const late = addDays(occDue, 2 * o.lateness);
    return {
      day: late < o.tomorrow ? o.tomorrow : late,
      deltaCents: p.amountCents,
      kind: 'receivable',
      sourceId: p.id,
      reason: 'overdue_receivable',
    };
  }
  // R2: vencimento + atraso médio real
  return {
    day: addDays(occDue, o.lateness),
    deltaCents: p.amountCents,
    kind: 'receivable',
    sourceId: p.id,
    reason: 'due',
  };
}

/**
 * Funde as contas previstas em eventos de caixa que projectCash aplica na curva.
 * Só contas 'prevista' entram (R5). O que cai fora da janela (amanhã .. horizonte)
 * é descartado — inclusive recebível que só chegaria depois do horizonte.
 */
export function fusePlannedIntoProjection(
  planned: readonly PlannedEntry[],
  ctx: PlannedFusionContext,
): PlannedFusion {
  const lateness = Math.max(0, Math.round(ctx.avgLatenessDays));
  const tomorrow = addDays(ctx.asOf, 1);
  const horizonEnd = addDays(ctx.asOf, ctx.maxHorizonDays);

  const events: PlannedCashEvent[] = [];
  for (const p of planned) {
    if (p.status !== 'prevista') continue; // R5: confirmada não entra
    for (const occDue of occurrences(p, ctx)) {
      const ev = eventFor(p, occDue, { asOf: ctx.asOf, lateness, tomorrow });
      if (ev.day < tomorrow || ev.day > horizonEnd) continue; // fora da janela
      events.push(ev);
    }
  }

  const plannedTotalCents = events.reduce((s, e) => s + Math.abs(e.deltaCents), 0);
  return { events, plannedCount: events.length, plannedTotalCents };
}
