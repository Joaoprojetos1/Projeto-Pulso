/**
 * Motor de diagnóstico — o "momento" da empresa.
 *
 * Hoje o produto tem indicadores soltos e alertas pontuais. Falta o julgamento
 * SINTÉTICO que um consultor faz: "sua empresa está em Pressão, por causa disto".
 * Este módulo produz esse veredito a partir dos indicadores já calculados —
 * puro, sem I/O, sem banco. O core nunca busca nada; o histórico chega pronto.
 *
 * PREMISSAS DE MERCADO ADOTADAS (V1) — liberadas pelo Marco. Cada uma é uma
 * função avaliadora nomeada abaixo, comentada com PREMISSA_V1 + o fundamento.
 * A calibração fina (Parte B) acontece na sessão de casos com o especialista;
 * onde o julgamento dele divergir desta régua, é aqui que se ajusta.
 *
 *  #   Premissa                                                          Fundamento
 *  P1  Reserva: 3+ meses de custo fixo = saudável; <2 meses = atenção;   Régua clássica de liquidez PME
 *      <1 mês = pressão                                                   (reserva de emergência PJ)
 *  P2  Zeragem projetada: <=15d = UTI; <=60d = crítico; 61-90d = pressão Horizonte mínimo de reação
 *  P3  Tesoura persistente (NCG crescendo acima da receita por 2+        Modelo Fleuriet de capital de giro
 *      períodos) = pressão
 *  P4  Ciclo de caixa piorando 20%+ vs. média móvel própria = sinal      Régua relativa: cada negócio tem
 *      forte, independente do nível absoluto                             o seu normal
 *  P5  Margem de contribuição < 30% em serviços = frágil; queda por 2    Prática de análise de serviços
 *      meses seguidos pesa mais que o nível
 *  P6  Receita < 1,2x ponto de equilíbrio = operação sem folga          Margem de segurança operacional
 *  P7  Concentração: 1 cliente > 30% = risco relevante; > 50% =          Corte padrão de análise de
 *      risco estrutural                                                  crédito/auditoria
 *  P8  Inadimplência > 5% da carteira vencida há 90+ dias = problema     Prática de carteira em serviços
 *      estrutural
 *
 * COMPOSIÇÃO DO ESTÁGIO (o pior resultado entre as avaliadoras):
 *   uti     : caixa atual negativo OU P2 <= 15d
 *   critico : P2 <= 60d
 *   pressao : P2 61-90d, OU P1 < 1 mês, OU P3, OU (P4 E P5 juntas)
 *   atencao : pelo menos uma avaliadora em severidade warn
 *   saudavel: nenhuma disparada
 *
 * Nota de composição: o enunciado do P8/P4/P5/P6/P7 mapeia essas premissas a
 * severidade "warn" (candidata a Atenção); as regras de Pressão+ são movidas só
 * por P1/P2/P3 e pela combinação P4+P5. Quando duas ou mais avaliadoras warn
 * disparam sem formar uma regra de Pressão, o estágio segue Atenção (o pior
 * entre as contribuições). Isso é V1; a Parte B recalibra.
 */

import type { IndicatorSet } from './types';

export type DiagnosisStage = 'saudavel' | 'atencao' | 'pressao' | 'critico' | 'uti';

/** Ordem ordinal: quanto maior o índice, pior. */
export const STAGE_ORDER: DiagnosisStage[] = ['saudavel', 'atencao', 'pressao', 'critico', 'uti'];
const rank = (s: DiagnosisStage): number => STAGE_ORDER.indexOf(s);

export type PremissaId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';
/** Um driver pode ser uma premissa ou o caixa negativo (que não é premissa da tabela). */
export type DriverId = PremissaId | 'caixa_negativo';

type Facts = Record<string, number | string | boolean | null>;

/** Resultado de uma avaliadora que DISPAROU. */
export interface PremissaResult {
  premissa: PremissaId;
  /** Estágio que ESTA premissa sustenta sozinha. */
  stage: DiagnosisStage;
  facts: Facts;
}

/** Avaliadora: dispara (PremissaResult), não dispara (null), ou não dá pra avaliar. */
type EvalResult = PremissaResult | { premissa: PremissaId; unavailable: string } | null;

export interface Driver {
  premissa: DriverId;
  stage: DiagnosisStage;
  facts: Facts;
}

/** Um período anterior, resumido pela API a partir dos indicator_snapshots. */
export interface DiagnosisHistoryPoint {
  asOf: string;
  ncgCents: number | null;
  revenueCents: number | null;
  cashCycleDays: number | null;
  contributionMargin: number | null;
  /** Estágio daquele período, se já diagnosticado (para as transições). */
  stage?: DiagnosisStage | null;
}

export interface DiagnosisHistoryInput {
  /** Períodos anteriores, do mais ANTIGO ao mais RECENTE. Não inclui o atual. */
  points: DiagnosisHistoryPoint[];
}

export interface Diagnosis {
  stage: DiagnosisStage;
  facts: {
    /** Premissas que não puderam ser avaliadas, com o motivo (diagnóstico honesto). */
    unavailable: Partial<Record<PremissaId, string>>;
    cashBalanceCents: number | null;
    firedPremissas: PremissaId[];
  };
  /** Premissas que sustentam o estágio ("por que você está em Pressão"). */
  drivers: Driver[];
  transitions: {
    previousStage: DiagnosisStage | null;
    direction: 'melhorou' | 'piorou' | 'igual' | null;
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const asNum = (v: unknown): number | null => (typeof v === 'number' ? v : null);

// ---------------------------------------------------------------
// Avaliadoras (uma por premissa)
// ---------------------------------------------------------------

/** PREMISSA_V1 P1 — reserva de caixa em meses de custo fixo. Régua clássica de
 *  liquidez PME (reserva de emergência PJ): 3+ meses saudável, <2 atenção, <1 pressão. */
function evalReserve(ind: IndicatorSet): EvalResult {
  const cash = asNum(ind.cash_balance?.value);
  const fixed = asNum(ind.fixed_cost_monthly?.value);
  if (cash === null || fixed === null || fixed <= 0) {
    return { premissa: 'P1', unavailable: 'Sem saldo de caixa ou custo fixo para medir a reserva.' };
  }
  const months = cash / fixed;
  const facts: Facts = {
    reserveMonths: round2(months),
    cashBalanceCents: cash,
    monthlyFixedCostCents: fixed,
  };
  if (months < 1) return { premissa: 'P1', stage: 'pressao', facts };
  if (months < 2) return { premissa: 'P1', stage: 'atencao', facts };
  return null; // >= 2 meses não sinaliza (saudável a partir de 3; [2,3) é zona neutra)
}

/** PREMISSA_V1 P2 — dias até a zeragem projetada. Horizonte mínimo de reação
 *  para renegociar/antecipar: <=15d UTI, <=60d crítico, 61-90d pressão. */
function evalRunway(ind: IndicatorSet): EvalResult {
  const proj = ind.cash_projection;
  if (!proj || proj.value === null) {
    return { premissa: 'P2', unavailable: 'Sem projeção de caixa.' };
  }
  const zeroInDays = asNum(proj.inputs?.zeroInDays);
  if (zeroInDays === null) return null; // não zera no horizonte → não dispara
  const facts: Facts = { zeroInDays, zeroOn: (proj.inputs?.zeroOn as string | null) ?? null };
  if (zeroInDays <= 15) return { premissa: 'P2', stage: 'uti', facts };
  if (zeroInDays <= 60) return { premissa: 'P2', stage: 'critico', facts };
  if (zeroInDays <= 90) return { premissa: 'P2', stage: 'pressao', facts };
  return null;
}

/** PREMISSA_V1 P3 — tesoura persistente. Modelo Fleuriet: NCG crescendo acima da
 *  receita por 2+ períodos consecutivos (a empresa vende mais e o caixa aperta). */
function evalScissor(ind: IndicatorSet, history?: DiagnosisHistoryInput): EvalResult {
  const ncg = asNum(ind.ncg?.value);
  const rev = asNum(ind.revenue_current?.value);
  if (ncg === null || rev === null) {
    return { premissa: 'P3', unavailable: 'Sem NCG ou receita atual.' };
  }
  const pts = history?.points ?? [];
  if (pts.length < 2) {
    return { premissa: 'P3', unavailable: 'Histórico insuficiente (precisa de 2 períodos anteriores).' };
  }
  // sequência do mais antigo ao atual → duas transições para ver PERSISTÊNCIA
  const seq = [...pts.slice(-2), { ncgCents: ncg, revenueCents: rev }];
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1];
    const b = seq[i];
    if (a.ncgCents === null || b.ncgCents === null || a.revenueCents === null || b.revenueCents === null) {
      return null;
    }
    const ncgGrow = a.ncgCents > 0 ? (b.ncgCents - a.ncgCents) / a.ncgCents : b.ncgCents > 0 ? Infinity : 0;
    const revGrow = a.revenueCents > 0 ? (b.revenueCents - a.revenueCents) / a.revenueCents : b.revenueCents > 0 ? Infinity : 0;
    if (!(b.ncgCents > a.ncgCents && ncgGrow > revGrow)) return null; // quebrou a persistência
  }
  return { premissa: 'P3', stage: 'pressao', facts: { ncgCents: ncg, revenueCents: rev, periodsChecked: seq.length } };
}

/** PREMISSA_V1 P4 — ciclo de caixa piorando 20%+ vs. a própria média móvel.
 *  Régua relativa: cada negócio tem o seu normal. Sozinho é sinal (warn);
 *  junto do P5 vira Pressão. */
function evalCycle(ind: IndicatorSet, history?: DiagnosisHistoryInput): EvalResult {
  const cycle = asNum(ind.cash_cycle?.value);
  if (cycle === null) return { premissa: 'P4', unavailable: 'Sem ciclo de caixa atual.' };
  const prior = (history?.points ?? []).map((p) => p.cashCycleDays).filter((v): v is number => v !== null && v !== undefined);
  if (prior.length < 2) {
    return { premissa: 'P4', unavailable: 'Histórico insuficiente para a média móvel do ciclo.' };
  }
  const avg = prior.reduce((s, v) => s + v, 0) / prior.length;
  if (avg <= 0) return null;
  const deterioration = (cycle - avg) / avg;
  if (deterioration >= 0.2) {
    return {
      premissa: 'P4',
      stage: 'atencao',
      facts: { cashCycleDays: cycle, movingAvgDays: round2(avg), deteriorationPct: round2(deterioration * 100) },
    };
  }
  return null;
}

/** PREMISSA_V1 P5 — margem de contribuição frágil. Prática de serviços: <30% é
 *  frágil; cair 2 meses seguidos pesa mais que o nível. Junto do P4 vira Pressão. */
function evalMargin(ind: IndicatorSet, history?: DiagnosisHistoryInput): EvalResult {
  const m = asNum(ind.contribution_margin?.value);
  if (m === null) return { premissa: 'P5', unavailable: 'Sem margem de contribuição.' };
  const priors = (history?.points ?? []).map((p) => p.contributionMargin);
  const p1 = priors[priors.length - 1];
  const p2 = priors[priors.length - 2];
  const caindo2Meses = typeof p1 === 'number' && typeof p2 === 'number' && m < p1 && p1 < p2;
  const fragil = m < 0.3;
  if (fragil || caindo2Meses) {
    return { premissa: 'P5', stage: 'atencao', facts: { contributionMargin: round2(m), fragil, caindo2Meses } };
  }
  return null;
}

/** PREMISSA_V1 P6 — margem de segurança operacional. Receita < 1,2x o ponto de
 *  equilíbrio = operação sem folga. */
function evalOperating(ind: IndicatorSet): EvalResult {
  const be = asNum(ind.break_even_revenue?.value);
  const rev = asNum(ind.revenue_current?.value);
  if (be === null || rev === null) {
    return {
      premissa: 'P6',
      unavailable: ind.break_even_revenue?.insufficientReason ?? 'Sem ponto de equilíbrio ou receita.',
    };
  }
  if (rev < 1.2 * be) {
    const ratio = be > 0 ? rev / be : Infinity;
    return { premissa: 'P6', stage: 'atencao', facts: { revenueCents: rev, breakEvenCents: be, safetyRatio: round2(ratio) } };
  }
  return null;
}

/** PREMISSA_V1 P7 — concentração de clientes. Corte padrão de crédito/auditoria:
 *  1 cliente > 30% risco relevante; > 50% risco estrutural. */
function evalConcentration(ind: IndicatorSet): EvalResult {
  const c = asNum(ind.customer_concentration?.value);
  if (c === null) return { premissa: 'P7', unavailable: 'Sem concentração de clientes.' };
  if (c > 0.3) {
    return {
      premissa: 'P7',
      stage: 'atencao',
      facts: { topShare: round2(c), topCustomer: (ind.customer_concentration?.inputs?.topCustomer as string | null) ?? null, structural: c > 0.5 },
    };
  }
  return null;
}

/** PREMISSA_V1 P8 — inadimplência da carteira. Prática de serviços: > 5% vencida
 *  há 90+ dias = problema estrutural. */
function evalDelinquency(ind: IndicatorSet): EvalResult {
  const d = asNum(ind.delinquency_rate?.value);
  if (d === null) {
    return { premissa: 'P8', unavailable: ind.delinquency_rate?.insufficientReason ?? 'Sem carteira vencida para avaliar.' };
  }
  if (d > 0.05) return { premissa: 'P8', stage: 'atencao', facts: { delinquencyRate: round2(d) } };
  return null;
}

const EVALUATORS = [
  evalReserve,
  evalRunway,
  evalScissor,
  evalCycle,
  evalMargin,
  evalOperating,
  evalConcentration,
  evalDelinquency,
];

// ---------------------------------------------------------------
// diagnose — o veredito
// ---------------------------------------------------------------

export function diagnose(indicators: IndicatorSet, history?: DiagnosisHistoryInput): Diagnosis {
  const fired: PremissaResult[] = [];
  const unavailable: Partial<Record<PremissaId, string>> = {};

  for (const fn of EVALUATORS) {
    const r = fn(indicators, history);
    if (!r) continue;
    if ('unavailable' in r) unavailable[r.premissa] = r.unavailable;
    else fired.push(r);
  }

  const cash = asNum(indicators.cash_balance?.value);
  const cashNegative = cash !== null && cash < 0;

  // contribuições ao estágio (cada uma com o seu driver)
  const contributions: Array<{ stage: DiagnosisStage; driver: Driver }> = fired.map((f) => ({
    stage: f.stage,
    driver: { premissa: f.premissa, stage: f.stage, facts: f.facts },
  }));

  // combinação: P4 E P5 juntas => Pressão
  const p4 = fired.find((f) => f.premissa === 'P4');
  const p5 = fired.find((f) => f.premissa === 'P5');
  if (p4 && p5) {
    contributions.push({ stage: 'pressao', driver: { premissa: 'P4', stage: 'pressao', facts: p4.facts } });
    contributions.push({ stage: 'pressao', driver: { premissa: 'P5', stage: 'pressao', facts: p5.facts } });
  }

  // caixa atual negativo => UTI
  if (cashNegative) {
    contributions.push({ stage: 'uti', driver: { premissa: 'caixa_negativo', stage: 'uti', facts: { cashBalanceCents: cash } } });
  }

  // o estágio é o PIOR entre as contribuições
  let stage: DiagnosisStage = 'saudavel';
  for (const c of contributions) if (rank(c.stage) > rank(stage)) stage = c.stage;

  // drivers = o que sustenta o estágio escolhido (dedup por premissa)
  const seen = new Set<DriverId>();
  const drivers: Driver[] = [];
  for (const c of contributions) {
    if (c.stage !== stage) continue;
    if (seen.has(c.driver.premissa)) continue;
    seen.add(c.driver.premissa);
    drivers.push(c.driver);
  }

  const prev = history?.points?.[history.points.length - 1]?.stage ?? null;
  const direction = prev
    ? rank(stage) > rank(prev)
      ? 'piorou'
      : rank(stage) < rank(prev)
        ? 'melhorou'
        : 'igual'
    : null;

  return {
    stage,
    facts: { unavailable, cashBalanceCents: cash, firedPremissas: fired.map((f) => f.premissa) },
    drivers,
    transitions: { previousStage: prev, direction },
  };
}
