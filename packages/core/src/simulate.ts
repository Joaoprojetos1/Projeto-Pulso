/**
 * Simulação "e se" — o Pulso deixa de ser só monitor e vira consultor.
 *
 * PURO e DETERMINÍSTICO, como todo o core. Aplica ajustes hipotéticos a uma
 * CÓPIA do snapshot e roda a MESMA projeção auditada (projectCash). Devolve a
 * curva real, a curva simulada e as duas datas de zeragem. A cópia existe só
 * para responder "e se?" — nada aqui altera o dado de verdade.
 *
 * NENHUMA IA envolvida: é a aritmética do próprio core, o mesmo motor que
 * decide o alerta. Responde "e se eu adiar o pagamento X em 15 dias?" sem custo.
 */

import { addDays } from './dates';
import { monthlyFixedCost, projectCash, type CashProjection } from './indicators';
import type { Cents, CompanySnapshot, EntryKind, IsoDate, PlannedEntry } from './types';

/** Um ajuste hipotético. Tipado: só o que o dono pode "e se". */
export type SimulationDelta =
  | { type: 'delayPayable'; entryId: string; days: number }
  | { type: 'anticipateReceivable'; entryId: string; days: number }
  | { type: 'adjustFixedCost'; deltaCents: Cents }
  | { type: 'addPlanned'; kind: EntryKind; amountCents: Cents; dueOn: IsoDate };

/** Um ponto da curva de caixa: o dia e o saldo projetado nele. */
export interface SimulationPoint {
  day: IsoDate;
  cents: Cents;
}

export interface SimulationCurve {
  curve: SimulationPoint[];
  /** Primeiro dia em que a curva fica negativa. null = não zera no horizonte. */
  zeroOn: IsoDate | null;
}

export interface SimulationResult {
  asOf: IsoDate;
  horizonDays: number;
  /** A curva de hoje, sem mexer em nada. */
  original: SimulationCurve;
  /** A curva com os ajustes hipotéticos aplicados. */
  simulated: SimulationCurve;
  /** Deltas que casaram e entraram na conta (auditoria). */
  applied: SimulationDelta[];
  /** Deltas ignorados (id inexistente, tipo errado, valor inválido). */
  ignored: SimulationDelta[];
}

const DEFAULT_HORIZON = 90;

/** Cópia rasa-o-suficiente: só o que a simulação mexe (entries e planned). */
function deepCopy(snap: CompanySnapshot): CompanySnapshot {
  return {
    ...snap,
    entries: snap.entries.map((e) => ({ ...e })),
    balances: snap.balances.map((b) => ({ ...b })),
    planned: (snap.planned ?? []).map((p) => ({ ...p })),
  };
}

/**
 * Roda a projeção dia a dia (1..horizonDays) e devolve a curva completa + a
 * zeragem. Reaproveita projectCash pedindo TODOS os dias como horizontes —
 * assim a curva sai do mesmo motor auditado, sem o app interpolar.
 */
function curveFrom(
  snap: CompanySnapshot,
  horizonDays: number,
  fixedOverride?: Cents | null,
): SimulationCurve {
  const days = Array.from({ length: horizonDays }, (_, i) => i + 1);
  const ind =
    fixedOverride === undefined
      ? projectCash(snap, days)
      : projectCash(snap, days, { fixedCostOverrideCents: fixedOverride });

  const points = ind.value as CashProjection[] | null;
  if (!points) return { curve: [], zeroOn: null };

  const curve: SimulationPoint[] = [];
  const opening = ind.inputs.openingBalanceCents;
  if (typeof opening === 'number') curve.push({ day: snap.asOf, cents: opening });
  for (const p of points) {
    curve.push({ day: addDays(snap.asOf, p.horizonDays), cents: p.projectedCents });
  }

  return { curve, zeroOn: (ind.inputs.zeroOn as IsoDate | null) ?? null };
}

/**
 * Aplica os deltas a uma cópia do snapshot e projeta o antes e o depois.
 * Deltas inválidos (id que não existe, valor não-inteiro, dias <= 0) são
 * ignorados — a simulação nunca inventa nem quebra, só deixa de aplicar.
 */
export function simulate(
  snap: CompanySnapshot,
  deltas: SimulationDelta[],
  opts: { horizonDays?: number } = {},
): SimulationResult {
  const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON;

  const copy = deepCopy(snap);
  const planned = copy.planned ?? (copy.planned = []);
  const applied: SimulationDelta[] = [];
  const ignored: SimulationDelta[] = [];

  let fixedDelta = 0;
  let hasFixedDelta = false;
  let simSeq = 0;

  for (const d of deltas) {
    switch (d.type) {
      case 'delayPayable': {
        const e = copy.entries.find((x) => x.id === d.entryId && x.kind === 'payable');
        if (e && Number.isFinite(d.days) && d.days > 0) {
          e.dueOn = addDays(e.dueOn, Math.round(d.days));
          applied.push(d);
        } else ignored.push(d);
        break;
      }
      case 'anticipateReceivable': {
        const e = copy.entries.find((x) => x.id === d.entryId && x.kind === 'receivable');
        if (e && Number.isFinite(d.days) && d.days > 0) {
          e.dueOn = addDays(e.dueOn, -Math.round(d.days));
          applied.push(d);
        } else ignored.push(d);
        break;
      }
      case 'adjustFixedCost': {
        if (Number.isInteger(d.deltaCents) && d.deltaCents !== 0) {
          fixedDelta += d.deltaCents;
          hasFixedDelta = true;
          applied.push(d);
        } else ignored.push(d);
        break;
      }
      case 'addPlanned': {
        if (
          (d.kind === 'receivable' || d.kind === 'payable') &&
          Number.isInteger(d.amountCents) &&
          d.amountCents > 0 &&
          typeof d.dueOn === 'string'
        ) {
          const p: PlannedEntry = {
            id: `sim-${simSeq++}`,
            kind: d.kind,
            amountCents: d.amountCents,
            dueOn: d.dueOn,
            recurrence: 'none',
            status: 'prevista',
            confirmedOn: null,
            category: 'simulacao',
          };
          planned.push(p);
          applied.push(d);
        } else ignored.push(d);
        break;
      }
      default:
        ignored.push(d);
    }
  }

  // Custo fixo: um corte não pode virar lançamento (lançamento é sempre
  // positivo), então ajustamos o custo fixo mensal usado pela projeção.
  let fixedOverride: Cents | null | undefined;
  if (hasFixedDelta) {
    const base = monthlyFixedCost(snap).value ?? 0;
    fixedOverride = Math.max(0, base + fixedDelta);
  }

  return {
    asOf: snap.asOf,
    horizonDays,
    original: curveFrom(snap, horizonDays),
    simulated: curveFrom(copy, horizonDays, fixedOverride),
    applied,
    ignored,
  };
}
