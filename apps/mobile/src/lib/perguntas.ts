/**
 * Respostas DETERMINÍSTICAS do chat (sem IA).
 *
 * As três perguntas de partida têm resposta certa a partir dos números que o
 * motor JÁ calculou — então não precisam de IA generativa. Isto vale na
 * demonstração (onde não há servidor) e serve de rede de segurança. Segue a
 * regra de ouro: o app NÃO calcula nada novo, só lê o que veio pronto e redige.
 */

import type { CashProjectionPoint, DashboardJson } from './api';
import { brl, dataBR, pct } from './format';

function semAcento(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove os acentos (marcas combinantes)
}

function contem(texto: string, termos: string[]): boolean {
  return termos.some((t) => texto.includes(t));
}

function num(dash: DashboardJson, key: string): number | null {
  const v = dash.snapshot.indicators[key]?.value;
  return typeof v === 'number' ? v : null;
}

function projecao(dash: DashboardJson): CashProjectionPoint[] {
  const v = dash.snapshot.indicators.cash_projection?.value;
  return Array.isArray(v) ? (v as CashProjectionPoint[]) : [];
}

function zeroOn(dash: DashboardJson): string | null {
  return projecao(dash).find((p) => p.zeroOn)?.zeroOn ?? null;
}

/**
 * Tenta responder a pergunta com os números prontos. Devolve o texto, ou null
 * se a pergunta não é uma das determinísticas (aí o chamador dá outra resposta).
 */
export function responderDeterministico(dash: DashboardJson, pergunta: string): string | null {
  const q = semAcento(pergunta);
  const saldo = num(dash, 'cash_balance');

  // 1) "Quando meu caixa zera?"
  if (contem(q, ['zera', 'zerar', 'acaba', 'acabar', 'quando o caixa', 'quando meu caixa'])) {
    const z = zeroOn(dash);
    if (z) {
      const base = `No ritmo de hoje, seu caixa pode zerar em ${dataBR(z)}.`;
      return saldo !== null ? `${base} Hoje você tem ${brl(saldo)} em caixa.` : base;
    }
    return 'Pelo cálculo de agora, seu caixa não zera dentro dos próximos 90 dias. Está saudável.';
  }

  // 2) "Quem me deve?" (concentração / a receber)
  if (contem(q, ['quem me deve', 'quem me devem', 'me deve', 'a receber', 'concentr', 'maior cliente'])) {
    const share = num(dash, 'customer_concentration');
    const conc = dash.snapshot.indicators.customer_concentration?.inputs ?? {};
    const cliente = typeof conc.topCustomer === 'string' ? conc.topCustomer : null;
    const aReceber = num(dash, 'ncg');
    const partes: string[] = [];
    if (aReceber !== null) partes.push(`Você tem cerca de ${brl(aReceber)} a receber.`);
    if (cliente && share !== null) {
      partes.push(`O maior peso é ${cliente}, com ${pct(share)} do seu faturamento. Se ele atrasar, o caixa sente.`);
    }
    return partes.length ? partes.join(' ') : null;
  }

  // 3) "Dá pra pagar as contas do mês?"
  if (contem(q, ['pagar as contas', 'pagar o mes', 'fecho o mes', 'fechar o mes', 'da pra pagar', 'consigo pagar', 'pagar tudo'])) {
    const z = zeroOn(dash);
    const custoFixo = num(dash, 'fixed_cost_monthly');
    const p30 = projecao(dash).find((p) => p.horizonDays === 30)?.projectedCents ?? null;
    if (z) {
      const base = `No ritmo de hoje o mês aperta: seu caixa pode zerar em ${dataBR(z)}.`;
      return custoFixo !== null
        ? `${base} O custo fixo do mês é ${brl(custoFixo)}. Vale antecipar recebimentos ou segurar gastos não essenciais.`
        : base;
    }
    if (p30 !== null && p30 >= 0) {
      return `Pelo cálculo de agora, o mês fecha no positivo: a projeção para 30 dias é ${brl(p30)}.`;
    }
    return 'Pelo cálculo de agora, o mês fica apertado. Olhe o painel para ver de onde vem o aperto.';
  }

  return null;
}
