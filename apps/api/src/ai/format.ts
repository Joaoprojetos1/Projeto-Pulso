/**
 * Formatação de APRESENTAÇÃO — não é cálculo financeiro.
 * Converte números já calculados pelo core em texto pt-BR
 * (centavos -> reais, ratio -> percentual, data ISO -> data por extenso).
 */

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const brlInteiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const brlCentavos = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1_500_000 -> "R$ 15.000" · 123_456 -> "R$ 1.234,56" */
export function formatCentsBRL(cents: number): string {
  const reais = cents / 100;
  return cents % 100 === 0 ? brlInteiro.format(reais) : brlCentavos.format(reais);
}

/** '2026-07-29' -> "29 de julho" */
export function formatDateBR(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]}`;
}

/** 0.136 -> "14%" */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
