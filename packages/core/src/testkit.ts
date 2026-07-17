/**
 * Helpers de teste. NÃO é código de produção e NÃO é exportado pelo index.
 * Constrói `Entry`/`CompanySnapshot` com defaults sensatos para os testes
 * ficarem legíveis — só o que importa em cada caso aparece no teste.
 */

import type { CashBalance, CompanySnapshot, Entry } from './types';

let seq = 0;

export function entry(
  e: Partial<Entry> & Pick<Entry, 'kind' | 'amountCents'>,
): Entry {
  seq += 1;
  const issuedOn = e.issuedOn ?? '2026-05-01';
  return {
    id: e.id ?? `e${seq}`,
    kind: e.kind,
    amountCents: e.amountCents,
    issuedOn,
    dueOn: e.dueOn ?? issuedOn,
    settledOn: e.settledOn ?? null,
    counterparty: e.counterparty,
    category: e.category,
    costType: e.costType,
  };
}

export function balance(observedOn: string, balanceCents: number): CashBalance {
  return { observedOn, balanceCents };
}

export function snapshot(
  over: Partial<CompanySnapshot> & Pick<CompanySnapshot, 'asOf'>,
): CompanySnapshot {
  return {
    asOf: over.asOf,
    entries: over.entries ?? [],
    balances: over.balances ?? [],
    declaredFixedCostCents: over.declaredFixedCostCents,
  };
}
