/**
 * Pulso core — SEGMENTO: clínica médica.
 *
 * Indicadores próprios da clínica sobre os "números do mês": glosa, prazo de
 * convênio, ticket (convênio × particular), ocupação de agenda, margem
 * operacional. Fórmulas puras, com `inputs` para auditoria do especialista.
 *
 * REGRA DE JANELA (anti-erro da planilha): o prazo de convênio usa a JANELA REAL
 * (nº de meses preenchidos × 30 dias), nunca "ano cheio". Ver DIAS_POR_MES.
 */

import type { Indicator } from '../types';
import { DIAS_POR_MES, insufficient, latestMonthWith, ratio, valueAt, windowMonths } from './helpers';
import type { SegmentContext, SegmentField, SegmentIndicatorFn, SegmentPackage, SegmentRule } from './types';

// slugs dos campos do formulário mensal
const F = {
  fatBruto: 'convenio_faturamento_bruto',
  glosas: 'convenio_glosas',
  aReceber: 'convenio_a_receber',
  atendConvenio: 'convenio_atendimentos',
  receitaParticular: 'particular_receita',
  atendParticular: 'particular_atendimentos',
  horasDisp: 'agenda_horas_disponiveis',
  horasOcup: 'agenda_horas_ocupadas',
  custoOperacional: 'custo_operacional',
} as const;

const FIELDS: SegmentField[] = [
  { slug: F.fatBruto, label: 'Faturamento bruto de convênios no mês', description: 'Tudo que você faturou de convênios antes de qualquer glosa.', unit: 'cents' },
  { slug: F.glosas, label: 'Glosas de convênios no mês', description: 'O que os convênios recusaram ou cortaram do que você faturou.', unit: 'cents' },
  { slug: F.aReceber, label: 'A receber de convênios (saldo no fim do mês)', description: 'Quanto os convênios ainda te devem no fechamento do mês.', unit: 'cents', pointInTime: true },
  { slug: F.atendConvenio, label: 'Atendimentos por convênio no mês', description: 'Quantos atendimentos foram por convênio.', unit: 'count' },
  { slug: F.receitaParticular, label: 'Receita particular no mês', description: 'O que entrou de pacientes particulares (sem convênio).', unit: 'cents' },
  { slug: F.atendParticular, label: 'Atendimentos particulares no mês', description: 'Quantos atendimentos foram particulares.', unit: 'count' },
  { slug: F.horasDisp, label: 'Horas de agenda disponíveis no mês', description: 'Total de horas que a agenda tinha para atender.', unit: 'hours' },
  { slug: F.horasOcup, label: 'Horas de agenda ocupadas no mês', description: 'Quantas dessas horas foram efetivamente ocupadas.', unit: 'hours' },
  { slug: F.custoOperacional, label: 'Custo operacional do mês', description: 'Os custos para operar a clínica no mês (aluguel, equipe, contas), fora impostos.', unit: 'cents' },
];

// receita de convênio reconhecida = faturamento bruto − glosas
const receitaConvenio = (fat: number, glosa: number) => fat - glosa;

// ---------------------------------------------------------------
// Taxa de glosa — glosas sobre o faturamento bruto de convênio (mês mais recente)
// ---------------------------------------------------------------
const taxaGlosa: SegmentIndicatorFn = ({ ops }) => {
  const key = 'clinica_taxa_glosa';
  const m = latestMonthWith(ops, [F.fatBruto, F.glosas]);
  if (!m) return insufficient(key, 'ratio', 'Sem faturamento e glosas de convênio no mês.', [F.fatBruto, F.glosas]);
  const fat = valueAt(ops, m, F.fatBruto)!;
  const glosa = valueAt(ops, m, F.glosas)!;
  const v = ratio(glosa, fat);
  if (v === null) return insufficient(key, 'ratio', 'Faturamento bruto de convênio zerado no mês.', [F.fatBruto], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, glosasCents: glosa, faturamentoBrutoCents: fat }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Prazo médio de recebimento de convênio (dias) — JANELA REAL, nunca ano cheio
//
// PMR = a_receber_atual ÷ (receita_convênio_do_período ÷ dias_do_período)
// dias_do_período = nº de meses preenchidos × 30. Com 1 mês, são 30 dias — o
// motor NÃO usa 365 (o que inflaria o prazo em ~12x, o erro da planilha).
// ---------------------------------------------------------------
const pmrConvenio: SegmentIndicatorFn = ({ ops }) => {
  const key = 'clinica_pmr_convenio';
  const meses = windowMonths(ops, [F.fatBruto, F.glosas]);
  const mReceber = latestMonthWith(ops, [F.aReceber]);
  if (meses.length === 0 || mReceber === null) {
    return insufficient(key, 'days', 'Sem receita de convênio no período ou sem saldo a receber.', [F.fatBruto, F.glosas, F.aReceber]);
  }
  const receitaPeriodo = meses.reduce((s, m) => s + receitaConvenio(valueAt(ops, m, F.fatBruto)!, valueAt(ops, m, F.glosas)!), 0);
  const aReceber = valueAt(ops, mReceber, F.aReceber)!;
  if (receitaPeriodo <= 0) {
    return insufficient(key, 'days', 'Receita de convênio zero ou negativa no período.', [F.fatBruto], { monthsCount: meses.length });
  }
  const diasPeriodo = meses.length * DIAS_POR_MES;
  const pmr = Math.round((aReceber * diasPeriodo) / receitaPeriodo);

  // Tendência "piorando vs. média própria": prazo mês a mês (proxy de 30 dias)
  // nos meses com faturamento, glosas E a receber. Exposto para a regra.
  const mesesTrend = windowMonths(ops, [F.fatBruto, F.glosas, F.aReceber]);
  const serie = mesesTrend
    .map((m) => {
      const rc = receitaConvenio(valueAt(ops, m, F.fatBruto)!, valueAt(ops, m, F.glosas)!);
      return rc > 0 ? (valueAt(ops, m, F.aReceber)! * DIAS_POR_MES) / rc : null;
    })
    .filter((x): x is number => x !== null);
  let worseningRatio: number | null = null;
  let mediaPropriaDias: number | null = null;
  if (serie.length >= 3) {
    const atual = serie[serie.length - 1]!;
    const priors = serie.slice(0, -1);
    const media = priors.reduce((s, v) => s + v, 0) / priors.length;
    if (media > 0) {
      mediaPropriaDias = Math.round(media);
      worseningRatio = (atual - media) / media;
    }
  }

  return {
    key,
    value: pmr,
    unit: 'days',
    inputs: {
      monthsCount: meses.length, // JANELA REAL usada
      diasPeriodo,
      receitaPeriodoCents: receitaPeriodo,
      aReceberCents: aReceber,
      aReceberMonth: mReceber,
      mediaPropriaDias,
      worseningRatio,
    },
    window: { from: `${meses[0]}-01`, to: `${meses[meses.length - 1]}-01` },
  };
};

// ticket médio genérico = receita ÷ atendimentos (mês mais recente)
function ticket(key: string, receitaField: string, atendField: string, ctx: SegmentContext, receitaDe?: (m: string) => number): Indicator<number> {
  const { ops } = ctx;
  const need = receitaDe ? [F.fatBruto, F.glosas, atendField] : [receitaField, atendField];
  const m = latestMonthWith(ops, need);
  if (!m) return insufficient(key, 'cents', 'Sem receita e atendimentos no mês.', need);
  const receita = receitaDe ? receitaDe(m) : valueAt(ops, m, receitaField)!;
  const atend = valueAt(ops, m, atendField)!;
  const v = ratio(receita, atend);
  if (v === null) return insufficient(key, 'cents', 'Sem atendimentos no mês para calcular o ticket.', [atendField], { month: m });
  return { key, value: Math.round(v), unit: 'cents', inputs: { month: m, receitaCents: receita, atendimentos: atend }, window: { from: `${m}-01`, to: `${m}-01` } };
}

const ticketConvenio: SegmentIndicatorFn = (ctx) =>
  ticket('clinica_ticket_convenio', F.fatBruto, F.atendConvenio, ctx, (m) => receitaConvenio(valueAt(ctx.ops, m, F.fatBruto)!, valueAt(ctx.ops, m, F.glosas)!));

const ticketParticular: SegmentIndicatorFn = (ctx) => ticket('clinica_ticket_particular', F.receitaParticular, F.atendParticular, ctx);

// ---------------------------------------------------------------
// Taxa de ocupação de agenda — horas ocupadas sobre disponíveis (mês recente)
// ---------------------------------------------------------------
const ocupacaoAgenda: SegmentIndicatorFn = ({ ops }) => {
  const key = 'clinica_ocupacao_agenda';
  const m = latestMonthWith(ops, [F.horasOcup, F.horasDisp]);
  if (!m) return insufficient(key, 'ratio', 'Sem horas de agenda ocupadas e disponíveis no mês.', [F.horasOcup, F.horasDisp]);
  const ocup = valueAt(ops, m, F.horasOcup)!;
  const disp = valueAt(ops, m, F.horasDisp)!;
  const v = ratio(ocup, disp);
  if (v === null) return insufficient(key, 'ratio', 'Horas disponíveis zeradas no mês.', [F.horasDisp], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, horasOcupadas: ocup, horasDisponiveis: disp }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Margem operacional — (receita total − custo operacional) ÷ receita (mês recente)
// receita = receita de convênio (fat − glosa) + receita particular
// ---------------------------------------------------------------
const margemOperacional: SegmentIndicatorFn = ({ ops }) => {
  const key = 'clinica_margem_operacional';
  const m = latestMonthWith(ops, [F.custoOperacional]);
  if (!m) return insufficient(key, 'ratio', 'Sem custo operacional do mês.', [F.custoOperacional]);
  const fat = valueAt(ops, m, F.fatBruto);
  const glosa = valueAt(ops, m, F.glosas);
  const conv = fat !== null && glosa !== null ? receitaConvenio(fat, glosa) : 0;
  const part = valueAt(ops, m, F.receitaParticular) ?? 0;
  const receita = conv + part;
  const custo = valueAt(ops, m, F.custoOperacional)!;
  if (receita <= 0) return insufficient(key, 'ratio', 'Sem receita no mês para calcular a margem.', [F.fatBruto, F.receitaParticular], { month: m });
  return { key, value: (receita - custo) / receita, unit: 'ratio', inputs: { month: m, receitaCents: receita, custoOperacionalCents: custo }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Regras de alerta — limiares PREMISSA_V1 (calibração do especialista)
// ---------------------------------------------------------------

/** PREMISSA_V1: glosa saudável < 15%; 15–25% atenção; > 25% crítico. */
export const CLINICA_THRESHOLDS = {
  glosaWarn: 0.15,
  glosaCritical: 0.25,
  ocupacaoMin: 0.5, // abaixo de 50% da agenda ociosa demais
  convenioPrazoWorsening: 0.2, // prazo 20% pior que a própria média
};

const glosaAltaRule: SegmentRule = (ind) => {
  const v = ind.clinica_taxa_glosa?.value as number | null;
  if (v === null || v === undefined || v < CLINICA_THRESHOLDS.glosaWarn) return null;
  const critical = v >= CLINICA_THRESHOLDS.glosaCritical;
  return {
    ruleKey: 'clinica_glosa_alta',
    severity: critical ? 'critical' : 'warn',
    facts: { glosaRate: v, faturamentoBrutoCents: ind.clinica_taxa_glosa?.inputs?.faturamentoBrutoCents ?? null, glosasCents: ind.clinica_taxa_glosa?.inputs?.glosasCents ?? null },
  };
};

const ocupacaoBaixaRule: SegmentRule = (ind) => {
  const v = ind.clinica_ocupacao_agenda?.value as number | null;
  if (v === null || v === undefined || v >= CLINICA_THRESHOLDS.ocupacaoMin) return null;
  return {
    ruleKey: 'clinica_ocupacao_baixa',
    severity: 'warn',
    facts: { ocupacao: v, horasOcupadas: ind.clinica_ocupacao_agenda?.inputs?.horasOcupadas ?? null, horasDisponiveis: ind.clinica_ocupacao_agenda?.inputs?.horasDisponiveis ?? null },
  };
};

const convenioPrazoRule: SegmentRule = (ind) => {
  const w = ind.clinica_pmr_convenio?.inputs?.worseningRatio as number | null | undefined;
  if (w === null || w === undefined || w < CLINICA_THRESHOLDS.convenioPrazoWorsening) return null;
  return {
    ruleKey: 'clinica_convenio_prazo_piorando',
    severity: 'warn',
    facts: {
      worseningRatio: w,
      pmrConvenioDays: ind.clinica_pmr_convenio?.value ?? null,
      mediaPropriaDias: ind.clinica_pmr_convenio?.inputs?.mediaPropriaDias ?? null,
    },
  };
};

export const clinica: SegmentPackage = {
  id: 'clinica',
  label: 'Clínica',
  fields: FIELDS,
  requirements: [
    { key: 'clinica_taxa_glosa', question: 'Quanto os convênios estão glosando do que você fatura?', required: [F.fatBruto, F.glosas] },
    { key: 'clinica_pmr_convenio', question: 'Em quantos dias, em média, os convênios te pagam?', required: [F.fatBruto, F.glosas, F.aReceber] },
    { key: 'clinica_ticket_convenio', question: 'Quanto rende, em média, cada atendimento por convênio?', required: [F.fatBruto, F.glosas, F.atendConvenio] },
    { key: 'clinica_ticket_particular', question: 'Quanto rende, em média, cada atendimento particular?', required: [F.receitaParticular, F.atendParticular] },
    { key: 'clinica_ocupacao_agenda', question: 'Quanto da sua agenda está sendo ocupada?', required: [F.horasOcup, F.horasDisp] },
    { key: 'clinica_margem_operacional', question: 'Quanto sobra da operação depois dos custos?', required: [F.custoOperacional] },
  ],
  indicators: [taxaGlosa, pmrConvenio, ticketConvenio, ticketParticular, ocupacaoAgenda, margemOperacional],
  rules: [glosaAltaRule, ocupacaoBaixaRule, convenioPrazoRule],
  labels: {
    clinica_taxa_glosa: { label: 'Glosa dos convênios', hint: 'quanto os convênios cortam do que você fatura' },
    clinica_pmr_convenio: { label: 'Prazo dos convênios', hint: 'dias até o convênio pagar' },
    clinica_ticket_convenio: { label: 'Ticket por convênio', hint: 'quanto rende cada atendimento de convênio' },
    clinica_ticket_particular: { label: 'Ticket particular', hint: 'quanto rende cada atendimento particular' },
    clinica_ocupacao_agenda: { label: 'Ocupação da agenda', hint: 'quanto da agenda está sendo usada' },
    clinica_margem_operacional: { label: 'Margem operacional', hint: 'quanto sobra depois dos custos' },
  },
};

// para os testes
export const CLINICA_FIELDS = F;
