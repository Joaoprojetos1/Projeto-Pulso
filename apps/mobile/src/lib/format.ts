/**
 * Formatação de APRESENTAÇÃO (pt-BR). Não é cálculo: o app só desenha
 * números que o servidor já calculou.
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

export function brl(cents: number): string {
  const negativo = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const milhar = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const base = centavos === 0 ? `R$ ${milhar}` : `R$ ${milhar},${String(centavos).padStart(2, '0')}`;
  return negativo ? `−${base}` : base;
}

export function dataBR(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]}`;
}

export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function dias(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`;
}

/** Rótulos pt-BR para as chaves de `facts` — a seção "de onde vem esse número". */
const ROTULOS: Record<string, string> = {
  zeroOn: 'O caixa zera em',
  openingBalanceCents: 'Caixa hoje',
  cashBalanceCents: 'Caixa hoje',
  avgLatenessDays: 'Atraso médio dos clientes',
  pmrDays: 'Recebimento médio',
  pmpDays: 'Pagamento médio',
  cashCycleDays: 'Ciclo de caixa',
  monthlyFixedCostCents: 'Custo fixo mensal',
  revenueGrowthRatio: 'Crescimento da receita',
  revenueDropRatio: 'Queda da receita',
  revenueCurrentCents: 'Receita do mês',
  revenuePreviousCents: 'Receita do mês anterior',
  ncgCents: 'Dinheiro preso na operação',
  ncgOverRevenue: 'Preso em relação à receita',
  fixedCostOverRevenue: 'Custo fixo sobre a receita',
  topCustomer: 'Maior cliente',
  topCustomerShare: 'Fatia do maior cliente',
  customerCount: 'Clientes identificados',
};

export function rotuloFact(key: string): string {
  return ROTULOS[key] ?? key;
}

export function valorFact(key: string, value: unknown): string {
  if (value === null || value === undefined) return '·';
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? dataBR(value) : value;
  }
  if (typeof value !== 'number') return String(value);
  if (/Cents$/.test(key)) return brl(value);
  if (/(Ratio|Share|OverRevenue)$/i.test(key)) return pct(value);
  if (/Days$/.test(key)) return dias(value);
  if (/Count$/.test(key)) return String(value);
  return String(value);
}
