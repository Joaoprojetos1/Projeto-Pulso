/**
 * Pulso core — SEGMENTO: varejo de roupa.
 *
 * Margem bruta, giro de estoque anualizado, devoluções, ticket médio, margem
 * operacional. Fórmulas puras com `inputs` (auditoria).
 *
 * REGRA DE JANELA: o giro anualiza o CMV pela JANELA REAL (CMV do período ×
 * 12/nº-de-meses), nunca assumindo um ano cheio de dados que não existem.
 */

import { insufficient, latestMonthWith, ratio, sumOver, valueAt, windowMonths } from './helpers';
import type { SegmentField, SegmentIndicatorFn, SegmentPackage, SegmentRule } from './types';

const F = {
  receitaBruta: 'receita_bruta',
  devolucoes: 'devolucoes',
  cmv: 'cmv',
  estoqueFinal: 'estoque_final',
  atendimentos: 'atendimentos',
  custoOperacional: 'custo_operacional',
} as const;

const FIELDS: SegmentField[] = [
  { slug: F.receitaBruta, label: 'Receita bruta no mês', description: 'Tudo que você vendeu no mês, antes de devoluções.', unit: 'cents' },
  { slug: F.devolucoes, label: 'Devoluções no mês', description: 'O valor do que foi devolvido/trocado pelos clientes.', unit: 'cents' },
  { slug: F.cmv, label: 'Custo da mercadoria vendida (CMV) no mês', description: 'Quanto custou, no preço de compra, a mercadoria que você vendeu.', unit: 'cents' },
  { slug: F.estoqueFinal, label: 'Estoque no fim do mês (a preço de custo)', description: 'Quanto vale o estoque parado no fechamento, pelo que você pagou nele.', unit: 'cents', pointInTime: true },
  { slug: F.atendimentos, label: 'Nº de vendas (atendimentos) no mês', description: 'Quantas vendas você fechou no mês.', unit: 'count' },
  { slug: F.custoOperacional, label: 'Custo operacional do mês', description: 'Custos para operar a loja (aluguel, equipe, contas), fora a mercadoria e impostos.', unit: 'cents' },
];

// receita líquida = receita bruta − devoluções
const receitaLiquida = (bruta: number, dev: number) => bruta - dev;

// ---------------------------------------------------------------
// Margem bruta — (receita líquida − CMV) ÷ receita líquida (mês recente)
// ---------------------------------------------------------------
const margemBruta: SegmentIndicatorFn = ({ ops }) => {
  const key = 'varejo_margem_bruta';
  const m = latestMonthWith(ops, [F.receitaBruta, F.devolucoes, F.cmv]);
  if (!m) return insufficient(key, 'ratio', 'Sem receita e CMV no mês.', [F.receitaBruta, F.devolucoes, F.cmv]);
  const liq = receitaLiquida(valueAt(ops, m, F.receitaBruta)!, valueAt(ops, m, F.devolucoes)!);
  const cmv = valueAt(ops, m, F.cmv)!;
  const v = ratio(liq - cmv, liq);
  if (v === null) return insufficient(key, 'ratio', 'Receita líquida zerada no mês.', [F.receitaBruta], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, receitaLiquidaCents: liq, cmvCents: cmv }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Giro de estoque anualizado — CMV do período (anualizado) ÷ estoque final
//
// JANELA REAL: CMV_anual = CMV_do_período × (12 ÷ nº_meses_preenchidos). Com 1
// mês, projeta ×12; NUNCA assume 12 meses de dados. Estoque = mês mais recente.
// ---------------------------------------------------------------
const giroEstoque: SegmentIndicatorFn = ({ ops }) => {
  const key = 'varejo_giro_estoque';
  const meses = windowMonths(ops, [F.cmv]);
  const mEstoque = latestMonthWith(ops, [F.estoqueFinal]);
  if (meses.length === 0 || mEstoque === null) {
    return insufficient(key, 'times', 'Sem CMV no período ou sem estoque final.', [F.cmv, F.estoqueFinal]);
  }
  const cmvPeriodo = sumOver(ops, meses, F.cmv);
  const estoque = valueAt(ops, mEstoque, F.estoqueFinal)!;
  const cmvAnual = cmvPeriodo * (12 / meses.length);
  const v = ratio(cmvAnual, estoque);
  if (v === null) return insufficient(key, 'times', 'Estoque final zerado: giro indefinido.', [F.estoqueFinal], { monthsCount: meses.length });
  return {
    key,
    value: Math.round(v * 100) / 100,
    unit: 'times',
    inputs: { monthsCount: meses.length, cmvPeriodoCents: cmvPeriodo, cmvAnualizadoCents: Math.round(cmvAnual), estoqueFinalCents: estoque },
    window: { from: `${meses[0]}-01`, to: `${meses[meses.length - 1]}-01` },
  };
};

// ---------------------------------------------------------------
// Devoluções sobre receita bruta (mês recente)
// ---------------------------------------------------------------
const devolucoesRate: SegmentIndicatorFn = ({ ops }) => {
  const key = 'varejo_devolucoes';
  const m = latestMonthWith(ops, [F.receitaBruta, F.devolucoes]);
  if (!m) return insufficient(key, 'ratio', 'Sem receita e devoluções no mês.', [F.receitaBruta, F.devolucoes]);
  const bruta = valueAt(ops, m, F.receitaBruta)!;
  const dev = valueAt(ops, m, F.devolucoes)!;
  const v = ratio(dev, bruta);
  if (v === null) return insufficient(key, 'ratio', 'Receita bruta zerada no mês.', [F.receitaBruta], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, devolucoesCents: dev, receitaBrutaCents: bruta }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Ticket médio por atendimento — receita bruta ÷ nº de vendas (mês recente)
// ---------------------------------------------------------------
const ticketMedio: SegmentIndicatorFn = ({ ops }) => {
  const key = 'varejo_ticket_medio';
  const m = latestMonthWith(ops, [F.receitaBruta, F.atendimentos]);
  if (!m) return insufficient(key, 'cents', 'Sem receita e nº de vendas no mês.', [F.receitaBruta, F.atendimentos]);
  const bruta = valueAt(ops, m, F.receitaBruta)!;
  const atend = valueAt(ops, m, F.atendimentos)!;
  const v = ratio(bruta, atend);
  if (v === null) return insufficient(key, 'cents', 'Sem vendas no mês para o ticket.', [F.atendimentos], { month: m });
  return { key, value: Math.round(v), unit: 'cents', inputs: { month: m, receitaBrutaCents: bruta, atendimentos: atend }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Margem operacional — (receita líquida − CMV − custo operacional) ÷ receita líq.
// ---------------------------------------------------------------
const margemOperacional: SegmentIndicatorFn = ({ ops }) => {
  const key = 'varejo_margem_operacional';
  const m = latestMonthWith(ops, [F.receitaBruta, F.devolucoes, F.cmv, F.custoOperacional]);
  if (!m) return insufficient(key, 'ratio', 'Faltam receita, CMV ou custo operacional no mês.', [F.receitaBruta, F.devolucoes, F.cmv, F.custoOperacional]);
  const liq = receitaLiquida(valueAt(ops, m, F.receitaBruta)!, valueAt(ops, m, F.devolucoes)!);
  const cmv = valueAt(ops, m, F.cmv)!;
  const custo = valueAt(ops, m, F.custoOperacional)!;
  const v = ratio(liq - cmv - custo, liq);
  if (v === null) return insufficient(key, 'ratio', 'Receita líquida zerada no mês.', [F.receitaBruta], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, receitaLiquidaCents: liq, cmvCents: cmv, custoOperacionalCents: custo }, window: { from: `${m}-01`, to: `${m}-01` } };
};

/** Limiares PREMISSA_V1 (calibração do especialista). */
export const VAREJO_THRESHOLDS = {
  giroMin: 2, // giro anualizado abaixo de 2 é lento
  margemBrutaMin: 0.4, // margem bruta saudável a partir de 40%
  devolucoesMax: 0.08, // devoluções acima de 8% acendem alerta
};

const giroBaixoRule: SegmentRule = (ind) => {
  const v = ind.varejo_giro_estoque?.value as number | null;
  if (v === null || v === undefined || v >= VAREJO_THRESHOLDS.giroMin) return null;
  return { ruleKey: 'varejo_giro_baixo', severity: 'warn', facts: { giro: v, estoqueFinalCents: ind.varejo_giro_estoque?.inputs?.estoqueFinalCents ?? null } };
};

const margemBaixaRule: SegmentRule = (ind) => {
  const v = ind.varejo_margem_bruta?.value as number | null;
  if (v === null || v === undefined || v >= VAREJO_THRESHOLDS.margemBrutaMin) return null;
  return { ruleKey: 'varejo_margem_baixa', severity: 'warn', facts: { margemBruta: v } };
};

const devolucoesAltasRule: SegmentRule = (ind) => {
  const v = ind.varejo_devolucoes?.value as number | null;
  if (v === null || v === undefined || v <= VAREJO_THRESHOLDS.devolucoesMax) return null;
  return { ruleKey: 'varejo_devolucoes_altas', severity: 'warn', facts: { devolucoes: v } };
};

export const varejo: SegmentPackage = {
  id: 'varejo',
  label: 'Varejo de roupa',
  fields: FIELDS,
  requirements: [
    { key: 'varejo_margem_bruta', question: 'Quanto sobra de cada venda depois do custo da mercadoria?', required: [F.receitaBruta, F.devolucoes, F.cmv] },
    { key: 'varejo_giro_estoque', question: 'Quantas vezes por ano seu estoque gira?', required: [F.cmv, F.estoqueFinal] },
    { key: 'varejo_devolucoes', question: 'Quanto das suas vendas volta como devolução?', required: [F.receitaBruta, F.devolucoes] },
    { key: 'varejo_ticket_medio', question: 'Quanto vale, em média, cada venda?', required: [F.receitaBruta, F.atendimentos] },
    { key: 'varejo_margem_operacional', question: 'Quanto sobra da operação depois de todos os custos?', required: [F.receitaBruta, F.devolucoes, F.cmv, F.custoOperacional] },
  ],
  indicators: [margemBruta, giroEstoque, devolucoesRate, ticketMedio, margemOperacional],
  rules: [giroBaixoRule, margemBaixaRule, devolucoesAltasRule],
  labels: {
    varejo_margem_bruta: { label: 'Margem bruta', hint: 'quanto sobra depois do custo da mercadoria' },
    varejo_giro_estoque: { label: 'Giro de estoque', hint: 'quantas vezes por ano o estoque gira' },
    varejo_devolucoes: { label: 'Devoluções', hint: 'quanto das vendas volta' },
    varejo_ticket_medio: { label: 'Ticket médio', hint: 'quanto vale cada venda' },
    varejo_margem_operacional: { label: 'Margem operacional', hint: 'quanto sobra depois de todos os custos' },
  },
};

export const VAREJO_FIELDS = F;
