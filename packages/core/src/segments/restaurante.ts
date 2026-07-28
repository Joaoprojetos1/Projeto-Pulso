/**
 * Pulso core — SEGMENTO: restaurante.
 *
 * CMV %, taxa efetiva de marketplace, dependência de delivery, ticket por
 * cliente, margem operacional. Fórmulas puras com `inputs` (auditoria).
 * Nenhum indicador aqui anualiza — todos são do mês de referência.
 */

import { insufficient, latestMonthWith, ratio, valueAt, windowMonths } from './helpers';
import type { SegmentField, SegmentIndicatorFn, SegmentPackage, SegmentRule } from './types';

const F = {
  receitaLiquida: 'receita_liquida',
  insumos: 'insumos',
  faturamentoDelivery: 'faturamento_delivery',
  taxasMarketplace: 'taxas_marketplace',
  clientes: 'clientes',
  custoOperacional: 'custo_operacional',
} as const;

const FIELDS: SegmentField[] = [
  { slug: F.receitaLiquida, label: 'Receita líquida no mês', description: 'Tudo que entrou no mês (salão + delivery), já sem impostos sobre venda.', unit: 'cents' },
  { slug: F.insumos, label: 'Insumos (comida e bebida) no mês', description: 'Quanto você gastou com os insumos do que foi vendido — o custo da comida.', unit: 'cents' },
  { slug: F.faturamentoDelivery, label: 'Faturamento de delivery no mês', description: 'Quanto do faturamento veio de delivery (iFood, Rappi, próprio).', unit: 'cents' },
  { slug: F.taxasMarketplace, label: 'Taxas de marketplace no mês', description: 'O total de taxas e comissões que os apps de delivery cobraram.', unit: 'cents' },
  { slug: F.clientes, label: 'Nº de clientes atendidos no mês', description: 'Quantos clientes (ou pedidos) você atendeu.', unit: 'count' },
  { slug: F.custoOperacional, label: 'Custo operacional do mês', description: 'Custos para operar (aluguel, equipe, contas), fora insumos e impostos.', unit: 'cents' },
];

// ---------------------------------------------------------------
// CMV % — insumos sobre receita líquida (mês recente)
// ---------------------------------------------------------------
const cmvPercentual: SegmentIndicatorFn = ({ ops }) => {
  const key = 'restaurante_cmv';
  const m = latestMonthWith(ops, [F.insumos, F.receitaLiquida]);
  if (!m) return insufficient(key, 'ratio', 'Sem insumos e receita no mês.', [F.insumos, F.receitaLiquida]);
  const insumos = valueAt(ops, m, F.insumos)!;
  const receita = valueAt(ops, m, F.receitaLiquida)!;
  const v = ratio(insumos, receita);
  if (v === null) return insufficient(key, 'ratio', 'Receita líquida zerada no mês.', [F.receitaLiquida], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, insumosCents: insumos, receitaLiquidaCents: receita }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Taxa efetiva de marketplace — taxas ÷ faturamento de delivery (mês recente)
// ---------------------------------------------------------------
const taxaMarketplace: SegmentIndicatorFn = ({ ops }) => {
  const key = 'restaurante_marketplace';
  const m = latestMonthWith(ops, [F.taxasMarketplace, F.faturamentoDelivery]);
  if (!m) return insufficient(key, 'ratio', 'Sem taxas e faturamento de delivery no mês.', [F.taxasMarketplace, F.faturamentoDelivery]);
  const taxas = valueAt(ops, m, F.taxasMarketplace)!;
  const delivery = valueAt(ops, m, F.faturamentoDelivery)!;
  const v = ratio(taxas, delivery);
  if (v === null) return insufficient(key, 'ratio', 'Sem faturamento de delivery no mês.', [F.faturamentoDelivery], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, taxasCents: taxas, faturamentoDeliveryCents: delivery }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Dependência de delivery — faturamento de delivery ÷ receita total (mês recente)
// ---------------------------------------------------------------
const deliveryShare: SegmentIndicatorFn = ({ ops }) => {
  const key = 'restaurante_delivery_share';
  const m = latestMonthWith(ops, [F.faturamentoDelivery, F.receitaLiquida]);
  if (!m) return insufficient(key, 'ratio', 'Sem faturamento de delivery e receita no mês.', [F.faturamentoDelivery, F.receitaLiquida]);
  const delivery = valueAt(ops, m, F.faturamentoDelivery)!;
  const receita = valueAt(ops, m, F.receitaLiquida)!;
  const v = ratio(delivery, receita);
  if (v === null) return insufficient(key, 'ratio', 'Receita líquida zerada no mês.', [F.receitaLiquida], { month: m });
  return { key, value: v, unit: 'ratio', inputs: { month: m, faturamentoDeliveryCents: delivery, receitaLiquidaCents: receita }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// ---------------------------------------------------------------
// Ticket médio por cliente — receita líquida ÷ nº de clientes (mês recente)
// ---------------------------------------------------------------
const ticketMedio: SegmentIndicatorFn = ({ ops }) => {
  const key = 'restaurante_ticket_medio';
  const m = latestMonthWith(ops, [F.receitaLiquida, F.clientes]);
  if (!m) return insufficient(key, 'cents', 'Sem receita e nº de clientes no mês.', [F.receitaLiquida, F.clientes]);
  const receita = valueAt(ops, m, F.receitaLiquida)!;
  const clientes = valueAt(ops, m, F.clientes)!;
  const v = ratio(receita, clientes);
  if (v === null) return insufficient(key, 'cents', 'Sem clientes no mês para o ticket.', [F.clientes], { month: m });
  return { key, value: Math.round(v), unit: 'cents', inputs: { month: m, receitaLiquidaCents: receita, clientes }, window: { from: `${m}-01`, to: `${m}-01` } };
};

// margem operacional de um mês (helper interno para o valor E a tendência)
function margemDoMes(ops: { month: string; field: string; value: number }[], m: string): number | null {
  const receita = valueAt(ops, m, F.receitaLiquida);
  const insumos = valueAt(ops, m, F.insumos);
  const custo = valueAt(ops, m, F.custoOperacional);
  if (receita === null || insumos === null || custo === null || receita === 0) return null;
  return (receita - insumos - custo) / receita;
}

// ---------------------------------------------------------------
// Margem operacional — (receita líq. − insumos − custo operacional) ÷ receita
// Expõe `caindoVsMesAnterior` (insumo da regra de dependência de delivery).
// ---------------------------------------------------------------
const margemOperacional: SegmentIndicatorFn = ({ ops }) => {
  const key = 'restaurante_margem_operacional';
  const meses = windowMonths(ops, [F.receitaLiquida, F.insumos, F.custoOperacional]);
  if (meses.length === 0) return insufficient(key, 'ratio', 'Faltam receita, insumos ou custo operacional no mês.', [F.receitaLiquida, F.insumos, F.custoOperacional]);
  const m = meses[meses.length - 1]!;
  const v = margemDoMes(ops, m);
  if (v === null) return insufficient(key, 'ratio', 'Receita líquida zerada no mês.', [F.receitaLiquida], { month: m });
  const anterior = meses.length >= 2 ? margemDoMes(ops, meses[meses.length - 2]!) : null;
  // 1 = caindo, 0 = estável/subindo, null = sem mês anterior (inputs não aceita boolean)
  const caindoVsMesAnterior = anterior !== null ? (v < anterior ? 1 : 0) : null;
  return {
    key,
    value: v,
    unit: 'ratio',
    inputs: { month: m, receitaLiquidaCents: valueAt(ops, m, F.receitaLiquida)!, insumosCents: valueAt(ops, m, F.insumos)!, custoOperacionalCents: valueAt(ops, m, F.custoOperacional)!, margemMesAnterior: anterior, caindoVsMesAnterior },
    window: { from: `${m}-01`, to: `${m}-01` },
  };
};

/** Limiares PREMISSA_V1 (calibração do especialista). */
export const RESTAURANTE_THRESHOLDS = {
  cmvWarn: 0.35,
  cmvCritical: 0.45,
  marketplaceMax: 0.28, // taxa efetiva acima de 28% corrói a margem
  deliveryShareMax: 0.6, // acima de 60% da receita + margem caindo
};

const cmvAltoRule: SegmentRule = (ind) => {
  const v = ind.restaurante_cmv?.value as number | null;
  if (v === null || v === undefined || v < RESTAURANTE_THRESHOLDS.cmvWarn) return null;
  const critical = v >= RESTAURANTE_THRESHOLDS.cmvCritical;
  return { ruleKey: 'restaurante_cmv_alto', severity: critical ? 'critical' : 'warn', facts: { cmv: v, insumosCents: ind.restaurante_cmv?.inputs?.insumosCents ?? null, receitaLiquidaCents: ind.restaurante_cmv?.inputs?.receitaLiquidaCents ?? null } };
};

const marketplaceCaroRule: SegmentRule = (ind) => {
  const v = ind.restaurante_marketplace?.value as number | null;
  if (v === null || v === undefined || v <= RESTAURANTE_THRESHOLDS.marketplaceMax) return null;
  return { ruleKey: 'restaurante_marketplace_caro', severity: 'warn', facts: { taxaEfetiva: v, taxasCents: ind.restaurante_marketplace?.inputs?.taxasCents ?? null, faturamentoDeliveryCents: ind.restaurante_marketplace?.inputs?.faturamentoDeliveryCents ?? null } };
};

const dependenciaDeliveryRule: SegmentRule = (ind) => {
  const share = ind.restaurante_delivery_share?.value as number | null;
  const caindo = ind.restaurante_margem_operacional?.inputs?.caindoVsMesAnterior as number | null | undefined;
  if (share === null || share === undefined || share <= RESTAURANTE_THRESHOLDS.deliveryShareMax) return null;
  if (caindo !== 1) return null; // só alerta se a margem operacional está caindo
  return {
    ruleKey: 'restaurante_dependencia_delivery',
    severity: 'warn',
    facts: { deliveryShare: share, margemOperacional: ind.restaurante_margem_operacional?.value ?? null, margemMesAnterior: ind.restaurante_margem_operacional?.inputs?.margemMesAnterior ?? null },
  };
};

export const restaurante: SegmentPackage = {
  id: 'restaurante',
  label: 'Restaurante',
  fields: FIELDS,
  requirements: [
    { key: 'restaurante_cmv', question: 'Quanto da receita vai embora em insumos (comida)?', required: [F.insumos, F.receitaLiquida] },
    { key: 'restaurante_marketplace', question: 'Quanto os apps de delivery cobram de fato sobre o delivery?', required: [F.taxasMarketplace, F.faturamentoDelivery] },
    { key: 'restaurante_delivery_share', question: 'Quanto da sua receita depende de delivery?', required: [F.faturamentoDelivery, F.receitaLiquida] },
    { key: 'restaurante_ticket_medio', question: 'Quanto gasta, em média, cada cliente?', required: [F.receitaLiquida, F.clientes] },
    { key: 'restaurante_margem_operacional', question: 'Quanto sobra da operação depois de tudo?', required: [F.receitaLiquida, F.insumos, F.custoOperacional] },
  ],
  indicators: [cmvPercentual, taxaMarketplace, deliveryShare, ticketMedio, margemOperacional],
  rules: [cmvAltoRule, marketplaceCaroRule, dependenciaDeliveryRule],
  labels: {
    restaurante_cmv: { label: 'CMV', hint: 'quanto da receita vira custo de comida' },
    restaurante_marketplace: { label: 'Taxa de delivery', hint: 'quanto os apps cobram de fato' },
    restaurante_delivery_share: { label: 'Peso do delivery', hint: 'quanto da receita vem de delivery' },
    restaurante_ticket_medio: { label: 'Ticket médio', hint: 'quanto gasta cada cliente' },
    restaurante_margem_operacional: { label: 'Margem operacional', hint: 'quanto sobra depois de tudo' },
  },
};

export const RESTAURANTE_FIELDS = F;
