/**
 * Pulso core — INFERÊNCIA DE CUSTO FIXO (fim da digitação, item 2.7).
 *
 * O custo fixo deixa de ser perguntado em branco. A partir dos lançamentos já
 * enviados, o motor identifica os débitos RECORRENTES (valor estável + cadência
 * mensal) e propõe cada um para o dono confirmar ("identifiquei aluguel de R$ X e
 * folha de R$ Y por mês, confere?"). O dono confirma, corrige ou acrescenta.
 *
 * PURO e DETERMINÍSTICO: mesma entrada, mesma saída. É a "engenharia de coleta"
 * levada ao custo fixo — entra no "de onde vem esse número" como qualquer input.
 * NÃO decide nada sozinho: só PROPÕE; a confirmação é do dono.
 *
 * PREMISSAS_V1 (calibrar com o Marco): o que conta como "recorrente" e "estável".
 */

import type { CompanySnapshot, Entry, IsoDate } from './types';

/** Mês de referência de uma data ISO ('YYYY-MM-DD' -> 'YYYY-MM'). */
function monthOf(d: IsoDate): string {
  return d.slice(0, 7);
}

/** Mínimo de meses distintos para um débito ser considerado recorrente. */
export const FIXED_COST_MIN_MONTHS = 2;
/** Variação máxima do valor mensal ainda tratada como "estável" (±25%). */
export const FIXED_COST_AMOUNT_TOLERANCE = 0.25;
/** Janela de análise: meses anteriores ao asOf considerados (o custo de hoje). */
export const FIXED_COST_WINDOW_MONTHS = 6;

export interface FixedCostSuggestion {
  /** Rótulo em linguagem de dono (contraparte ou categoria). */
  label: string;
  /** Valor mensal típico (mediana dos meses), em centavos. */
  monthlyCents: number;
  /** Em quantos meses distintos apareceu (força da evidência). */
  occurrences: number;
  /** Categoria crua do lançamento, quando houver. */
  category?: string;
  /** Meses em que apareceu (YYYY-MM), para auditoria. */
  months: string[];
}

/** Mediana inteira de uma lista não vazia (centavos). */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return Math.round((s[mid - 1]! + s[mid]!) / 2);
}

/** Chave de agrupamento de um débito: contraparte, senão categoria. */
function groupKey(e: Entry): { key: string; label: string; category?: string } | null {
  const cp = e.counterparty?.trim();
  if (cp) return { key: `cp:${cp.toLowerCase()}`, label: cp, category: e.category };
  const cat = e.category?.trim();
  if (cat) return { key: `cat:${cat.toLowerCase()}`, label: cat, category: cat };
  return null; // sem identificação: não dá pra rotular um custo fixo
}

/**
 * Infere os custos fixos recorrentes a partir dos lançamentos. Considera só as
 * SAÍDAS (payable) dos últimos meses; agrupa por contraparte/categoria; soma por
 * mês; e propõe quando há ≥ FIXED_COST_MIN_MONTHS meses com valor ESTÁVEL.
 */
export function inferFixedCosts(
  entries: Entry[],
  asOf: string,
  opts: { minMonths?: number; tolerance?: number; windowMonths?: number } = {},
): FixedCostSuggestion[] {
  const minMonths = opts.minMonths ?? FIXED_COST_MIN_MONTHS;
  const tolerance = opts.tolerance ?? FIXED_COST_AMOUNT_TOLERANCE;
  const windowMonths = opts.windowMonths ?? FIXED_COST_WINDOW_MONTHS;

  const asOfMonth = monthOf(asOf); // 'YYYY-MM'
  const dentroDaJanela = (mes: string): boolean => {
    // diferença em meses entre `mes` e `asOfMonth`, dentro da janela e no passado
    const [ay, am] = asOfMonth.split('-').map(Number) as [number, number];
    const [my, mm] = mes.split('-').map(Number) as [number, number];
    const diff = (ay - my) * 12 + (am - mm);
    return diff >= 0 && diff < windowMonths;
  };

  // agrupa: chave -> mês -> total do mês (centavos)
  const grupos = new Map<
    string,
    { label: string; category?: string; porMes: Map<string, number> }
  >();

  for (const e of entries) {
    if (e.kind !== 'payable') continue;
    const g = groupKey(e);
    if (!g) continue;
    const mes = monthOf(e.settledOn ?? e.issuedOn);
    if (!dentroDaJanela(mes)) continue;

    let grupo = grupos.get(g.key);
    if (!grupo) {
      grupo = { label: g.label, category: g.category, porMes: new Map() };
      grupos.set(g.key, grupo);
    }
    grupo.porMes.set(mes, (grupo.porMes.get(mes) ?? 0) + e.amountCents);
  }

  const sugestoes: FixedCostSuggestion[] = [];
  for (const grupo of grupos.values()) {
    const meses = [...grupo.porMes.keys()].sort();
    if (meses.length < minMonths) continue;

    const valores = meses.map((m) => grupo.porMes.get(m)!);
    const med = median(valores);
    if (med <= 0) continue;

    // estável: todo mês dentro da tolerância em torno da mediana
    const estavel = valores.every((v) => Math.abs(v - med) <= med * tolerance);
    if (!estavel) continue;

    sugestoes.push({
      label: grupo.label,
      monthlyCents: med,
      occurrences: meses.length,
      ...(grupo.category ? { category: grupo.category } : {}),
      months: meses,
    });
  }

  // maiores primeiro (o que mais pesa no custo fixo)
  return sugestoes.sort((a, b) => b.monthlyCents - a.monthlyCents);
}

/** Conveniência: infere direto do snapshot da empresa. */
export function inferFixedCostsFromSnapshot(snap: CompanySnapshot): FixedCostSuggestion[] {
  return inferFixedCosts(snap.entries, snap.asOf);
}
