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

export type PlannedStatus = 'prevista' | 'realizada';
export type PlannedRecurrence = 'none' | 'monthly';

/**
 * Conta PREVISTA — a camada de planejamento do dono (a pagar / a receber).
 *
 * SEPARAÇÃO INVIOLÁVEL: nunca se mistura com `Entry` (o REALIZADO, a verdade do
 * extrato). Uma conta prevista só "vira verdade" ao ser confirmada (status
 * 'realizada' + confirmedOn); enquanto 'prevista', é planejamento — e é isso
 * que a projeção de caixa passa a considerar (ver planned.ts).
 */
export interface PlannedEntry {
  id: string;
  kind: EntryKind;
  amountCents: Cents; // sempre positivo; o sinal vem de `kind`
  dueOn: IsoDate; // data prevista
  recurrence: PlannedRecurrence;
  status: PlannedStatus;
  confirmedOn: IsoDate | null; // data real na graduação (só quando 'realizada')
  counterparty?: string;
  category?: string;
}

/**
 * Um número operacional do mês, que NÃO é lançamento (glosa, CMV, estoque,
 * atendimentos, horas de agenda). É o insumo dos indicadores de SEGMENTO.
 *
 * ADITIVO e genérico de propósito: uma categoria (`field`, slug do campo do
 * segmento) + um valor inteiro. `value` é centavos, contagem OU horas inteiras,
 * conforme a `unit` que o campo declara no pacote do segmento (ver
 * `segments/`). Nunca uma coluna por métrica — assim o schema não incha a cada
 * segmento novo. O core não sabe de onde o número veio (o dono digita).
 */
export interface MonthlyOperation {
  month: string; // mês de referência 'YYYY-MM'
  field: string; // slug do campo do segmento (ex.: 'convenio_glosas')
  value: number; // inteiro: centavos, contagem ou horas — conforme o campo
}

/** Tudo que o core precisa saber sobre uma empresa. */
export interface CompanySnapshot {
  asOf: IsoDate;
  entries: Entry[];
  balances: CashBalance[];
  /** Contas previstas do dono. Alimentam a projeção de caixa (Fase 2). */
  planned?: PlannedEntry[];
  /** Custo fixo declarado no onboarding, quando não dá pra inferir dos lançamentos. */
  declaredFixedCostCents?: Cents;
  /**
   * Segmento da empresa (o `niche`). Seleciona o pacote de indicadores/regras
   * de segmento em `computeAll`. Ausente ou desconhecido = só o núcleo universal.
   */
  niche?: string;
  /** Números operacionais do mês — insumo dos indicadores de segmento. */
  monthlyOps?: MonthlyOperation[];
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
  // 'times' (ADITIVO, para segmentos): um múltiplo por ano, ex. giro de estoque
  // "4x". Não é percentual — o formatador não deve multiplicar por 100.
  unit: 'cents' | 'days' | 'ratio' | 'date' | 'count' | 'times';
  /** Os números crus que entraram na conta. Auditoria. */
  inputs: Record<string, number | string | null>;
  /** Janela considerada, quando aplicável. */
  window?: { from: IsoDate; to: IsoDate };
  /** Preenchido quando value é null: por que não deu pra calcular. */
  insufficientReason?: string;
  /**
   * Degradação elegante (ADITIVO): quando `value` é null, quais campos canônicos
   * faltaram e quais fontes os forneceriam. Reaproveita `requirements.ts`.
   * É metadado de coleta: NÃO afeta o cálculo nem o critério de suficiência.
   */
  missing?: { fields: string[]; sources: string[] };
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
