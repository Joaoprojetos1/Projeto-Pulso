/**
 * Apresentação dos indicadores de SEGMENTO no app (rótulos e formatação).
 *
 * O app é burro: NÃO calcula. Aqui só mapeamos a `key` de cada indicador de
 * segmento para um rótulo em linguagem de dono e formatamos o valor conforme a
 * unidade que o servidor já mandou. Os nomes espelham packages/core/segments
 * (labels) — se mudarem lá, atualize aqui.
 */

import { brl, dias, pct } from './format';

export const SEGMENT_LABEL: Record<string, string> = {
  clinica: 'Clínica',
  varejo: 'Varejo de roupa',
  restaurante: 'Restaurante',
};

/** Rótulo curto de cada indicador de segmento (linguagem de dono). */
export const SEGMENT_INDICATOR_LABEL: Record<string, string> = {
  // clínica
  clinica_taxa_glosa: 'Glosa dos convênios',
  clinica_pmr_convenio: 'Prazo dos convênios',
  clinica_ticket_convenio: 'Ticket por convênio',
  clinica_ticket_particular: 'Ticket particular',
  clinica_ocupacao_agenda: 'Ocupação da agenda',
  clinica_margem_operacional: 'Margem operacional',
  // varejo
  varejo_margem_bruta: 'Margem bruta',
  varejo_giro_estoque: 'Giro de estoque',
  varejo_devolucoes: 'Devoluções',
  varejo_ticket_medio: 'Ticket médio',
  varejo_margem_operacional: 'Margem operacional',
  // restaurante
  restaurante_cmv: 'CMV',
  restaurante_marketplace: 'Taxa de delivery',
  restaurante_delivery_share: 'Peso do delivery',
  restaurante_ticket_medio: 'Ticket médio',
  restaurante_margem_operacional: 'Margem operacional',
};

/** Formata o valor de um indicador de segmento pela unidade que o servidor mandou. */
export function formatSegmentValue(unit: string, value: number): string {
  switch (unit) {
    case 'cents':
      return brl(value);
    case 'ratio':
      return pct(value);
    case 'days':
      return dias(value);
    case 'times':
      return `${String(value).replace('.', ',')}x`;
    case 'count':
      return String(value);
    default:
      return String(value);
  }
}

/** Um indicador de segmento pronto para exibir (rótulo + valor formatado). */
export interface SegmentIndicatorView {
  key: string;
  label: string;
  valor: string;
}

/**
 * Extrai, de um payload de indicadores (o snapshot.indicators do dashboard), só
 * os de SEGMENTO que têm valor, prontos para a tela. Ignora os universais e os
 * sem valor (dado do mês ainda não informado).
 */
export function segmentIndicatorsFromPayload(
  indicators: Record<string, { key?: string; value: unknown; unit: string }> | undefined,
): SegmentIndicatorView[] {
  if (!indicators) return [];
  const out: SegmentIndicatorView[] = [];
  for (const [key, ind] of Object.entries(indicators)) {
    if (!(key in SEGMENT_INDICATOR_LABEL)) continue;
    if (typeof ind.value !== 'number') continue;
    out.push({ key, label: SEGMENT_INDICATOR_LABEL[key]!, valor: formatSegmentValue(ind.unit, ind.value) });
  }
  return out;
}
