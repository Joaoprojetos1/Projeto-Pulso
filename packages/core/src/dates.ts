/**
 * Pulso core — utilitários de data (UTC puro, sem timezone).
 *
 * Datas de negócio ('YYYY-MM-DD'). Ficam num módulo próprio para serem
 * reaproveitadas tanto por indicators.ts quanto por planned.ts sem criar
 * dependência circular entre eles.
 */

import type { IsoDate } from './types';

/** Dias inteiros de `a` até `b` (b - a). Negativo se b for antes de a. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** `d` deslocada em `n` dias (n pode ser negativo). */
export function addDays(d: IsoDate, n: number): IsoDate {
  const t = Date.parse(`${d}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * `d` deslocada em `n` meses. Se o dia não existir no mês destino (ex.: 31 de
 * janeiro + 1 mês), cai no último dia do mês (28/29 de fevereiro). Assim uma
 * conta recorrente no dia 31 não "pula" meses curtos.
 */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const [y, m, day] = d.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth(); // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dd = String(Math.min(day, lastDay)).padStart(2, '0');
  const mm = String(month + 1).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
