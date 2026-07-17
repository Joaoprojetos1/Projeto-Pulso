/**
 * Ajudante para montar lançamentos das clínicas fictícias.
 * Dados 100% inventados. Nenhum dado real de cliente entra no repo.
 */

import type { CostType, Entry, EntryKind, IsoDate } from '@pulso/core';

export interface LancamentoInput {
  kind: EntryKind;
  amountCents: number;
  issuedOn: IsoDate;
  /** Se omitido, vence no dia da emissão (à vista). */
  dueOn?: IsoDate;
  /** Se omitido, fica em aberto (null). */
  settledOn?: IsoDate | null;
  counterparty?: string;
  category?: string;
  costType?: CostType;
}

let seq = 0;

export function lancamento(p: LancamentoInput): Entry {
  seq += 1;
  return {
    id: `fx${seq}`,
    kind: p.kind,
    amountCents: p.amountCents,
    issuedOn: p.issuedOn,
    dueOn: p.dueOn ?? p.issuedOn,
    settledOn: p.settledOn === undefined ? null : p.settledOn,
    counterparty: p.counterparty,
    category: p.category,
    costType: p.costType,
  };
}

export function dia(mes: string, d: number): IsoDate {
  return `${mes}-${String(d).padStart(2, '0')}`;
}
