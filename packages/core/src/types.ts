/**
 * Pulso core — tipos.
 *
 * REGRA: este pacote é PURO. Sem I/O, sem banco, sem HTTP, sem SDK de IA.
 * Entrada tipada -> saída tipada. É o ativo auditável do produto.
 */

/** Dinheiro SEMPRE em centavos, inteiro. Nunca float. */
export type Cents = number;

/** Data de negócio, sem hora. ISO 'YYYY-MM-DD'. */
export type IsoDate = string;

export type EntryKind = 'receivable' | 'payable';
export type CostType = 'fixed' | 'variable';

export interface Entry {
  id: string;
  kind: EntryKind;
  amountCents: Cents; // sempre positivo; o sinal vem de `kind`
  issuedOn: IsoDate; // competência — quando o negócio aconteceu
  dueOn: IsoDate; // quando era pra pagar/receber
  settledOn: IsoDate | null; // null = em aberto
  counterparty?: string;
  category?: string;
  costType?: CostType;
}

export interface CashBalance {
  observedOn: IsoDate;
  balanceCents: Cents;
}

/** Tudo que o core precisa saber sobre uma empresa. */
export interface CompanySnapshot {
  asOf: IsoDate;
  entries: Entry[];
  balances: CashBalance[];
  /** Custo fixo declarado no onboarding, quando não dá pra inferir dos lançamentos. */
  declaredFixedCostCents?: Cents;
}

/**
 * Todo indicador devolve o valor E as entradas que usou.
 *
 * Isso não é luxo: é o que permite o especialista auditar contra a planilha
 * dele, e é o que a tela mostra em "de onde vem esse número". Sem `inputs`,
 * um número contestado vira sessão de debug.
 */
export interface Indicator<T = number> {
  key: string;
  value: T | null; // null = não há dado suficiente. NUNCA chutar.
  unit: 'cents' | 'days' | 'ratio' | 'date' | 'count';
  /** Os números crus que entraram na conta. Auditoria. */
  inputs: Record<string, number | string | null>;
  /** Janela considerada, quando aplicável. */
  window?: { from: IsoDate; to: IsoDate };
  /** Preenchido quando value é null: por que não deu pra calcular. */
  insufficientReason?: string;
}

export type IndicatorSet = Record<string, Indicator<any>>;

export type Severity = 'ok' | 'warn' | 'critical';

/**
 * Uma regra de alerta. Recebe indicadores, devolve fato ou nada.
 *
 * O modelo NUNCA decide se deve alertar. A regra decide; o modelo só redige
 * a partir de `facts`.
 */
export interface AlertFact {
  ruleKey: string;
  severity: Severity;
  /** Números determinísticos que a IA vai transformar em texto. */
  facts: Record<string, number | string | null>;
}

export type Rule = (indicators: IndicatorSet) => AlertFact | null;
