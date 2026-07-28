/**
 * Pulso core — segmentos: tipos compartilhados.
 *
 * Um SEGMENTO (clínica, varejo de roupa, restaurante) é um PACOTE ADITIVO sobre
 * o núcleo universal: declara indicadores próprios, os campos operacionais que
 * eles consomem, as regras de alerta específicas e os rótulos em linguagem de
 * dono. O núcleo NUNCA muda por causa de um segmento.
 *
 * Toda regra da casa continua valendo aqui: indicador é função PURA, testada,
 * devolve `inputs` (auditoria) e devolve `value: null` estruturado quando falta
 * dado — jamais calcula com janela errada.
 */

import type { AlertFact, Indicator, IndicatorSet, MonthlyOperation } from '../types';

/** Segmentos com pacote implementado. Empresa fora desta lista roda só o núcleo. */
export type SegmentId = 'clinica' | 'varejo' | 'restaurante';

/** Unidade do número operacional que o dono digita no formulário mensal. */
export type OpsUnit =
  | 'cents' // dinheiro, sempre em centavos inteiros
  | 'count' // contagem (atendimentos, clientes, vendas)
  | 'hours'; // horas inteiras (agenda)

/**
 * Um campo do formulário "Números do mês" de um segmento.
 *
 * `pointInTime`: quando true, o valor é um SALDO tirado no fim do mês (estoque,
 * a receber) — os indicadores usam o mês mais recente, nunca somam. Quando false
 * é um FLUXO do mês (faturamento, glosas, atendimentos) — pode ser somado numa
 * janela.
 */
export interface SegmentField {
  slug: string;
  label: string; // linguagem de dono, sem jargão
  description: string;
  unit: OpsUnit;
  pointInTime?: boolean;
}

/**
 * Requisito de dado de um indicador de segmento (mesmo espírito do
 * `requirements.ts` universal, mas sobre os campos operacionais do segmento).
 * Sem qualquer um dos `required`, o indicador não existe.
 */
export interface SegmentRequirement {
  key: string; // bate com o `key` do indicador
  question: string; // a pergunta que ele responde ao dono
  required: string[]; // slugs de SegmentField
}

/** Contexto entregue a cada indicador de segmento. Já vem pronto — puro. */
export interface SegmentContext {
  asOf: string;
  ops: MonthlyOperation[];
}

export type SegmentIndicatorFn = (ctx: SegmentContext) => Indicator<number>;

/** Regra de segmento: lê os indicadores (universais + de segmento) e decide. */
export type SegmentRule = (indicators: IndicatorSet) => AlertFact | null;

export interface SegmentPackage {
  id: SegmentId;
  label: string; // "Clínica", "Varejo de roupa", "Restaurante"
  fields: SegmentField[];
  requirements: SegmentRequirement[];
  indicators: SegmentIndicatorFn[];
  rules: SegmentRule[];
  /** Rótulo em linguagem de dono por `key` de indicador (para o app). */
  labels: Record<string, { label: string; hint: string }>;
}
