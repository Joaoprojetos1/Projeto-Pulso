/**
 * Pulso core — segmentos: utilitários puros de acesso aos números do mês.
 *
 * Nada aqui calcula indicador; só organiza os `MonthlyOperation` para as
 * fórmulas ficarem legíveis. Determinístico, sem I/O.
 */

import type { Indicator, MonthlyOperation } from '../types';

/**
 * Dias por mês usados na anualização/prazo dos indicadores de segmento.
 *
 * Constante e explícita DE PROPÓSITO. É aqui que mora a defesa contra o erro
 * conhecido da planilha de referência: prazos e giros usam a JANELA REAL
 * (quantos meses o dono preencheu × 30 dias), NUNCA "ano cheio" (365 dias / ×12)
 * quando só há dados parciais. Ver `windowMonths` e o teste do único mês.
 */
export const DIAS_POR_MES = 30;

/** Todos os meses (asc) em que TODOS os campos pedidos estão presentes. */
export function windowMonths(ops: MonthlyOperation[], fields: string[]): string[] {
  const byMonth = new Map<string, Set<string>>();
  for (const o of ops) {
    if (!fields.includes(o.field)) continue;
    if (!byMonth.has(o.month)) byMonth.set(o.month, new Set());
    byMonth.get(o.month)!.add(o.field);
  }
  return [...byMonth.entries()]
    .filter(([, present]) => fields.every((f) => present.has(f)))
    .map(([m]) => m)
    .sort();
}

/** O mês mais recente em que TODOS os campos pedidos existem, ou null. */
export function latestMonthWith(ops: MonthlyOperation[], fields: string[]): string | null {
  const ms = windowMonths(ops, fields);
  return ms.length ? ms[ms.length - 1]! : null;
}

/** Valor de um campo num mês específico (null se não houver). */
export function valueAt(
  ops: MonthlyOperation[],
  month: string,
  field: string,
): number | null {
  const hit = ops.find((o) => o.month === month && o.field === field);
  return hit ? hit.value : null;
}

/** Soma de um campo sobre uma lista de meses (assume presença; use windowMonths). */
export function sumOver(ops: MonthlyOperation[], months: string[], field: string): number {
  let s = 0;
  for (const m of months) s += valueAt(ops, m, field) ?? 0;
  return s;
}

/** Constrói um indicador SEM valor, com o campo faltante estruturado (degradação elegante). */
export function insufficient(
  key: string,
  unit: Indicator['unit'],
  reason: string,
  missingFields: string[],
  inputs: Indicator['inputs'] = {},
): Indicator<number> {
  return {
    key,
    value: null,
    unit,
    inputs,
    insufficientReason: reason,
    // números do mês vêm da mão do dono (fonte 'manual').
    missing: { fields: missingFields, sources: ['manual'] },
  };
}

/** Razão segura: null quando o denominador é zero/ausente (nunca divide por zero). */
export function ratio(numerator: number, denominator: number | null): number | null {
  if (denominator === null || denominator === 0) return null;
  return numerator / denominator;
}
