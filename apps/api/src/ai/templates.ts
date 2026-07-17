/**
 * Textos padrão por regra — o "reserva" determinístico da IA.
 *
 * Sempre corretos por construção: só usam números de `facts`, já formatados.
 * Entram quando não há chave de API, quando o modelo falha ou quando o
 * texto gerado reprova no fiscal de números. O alerta nunca fica mudo.
 */

import type { AlertFact } from '@pulso/core';

import { formatCentsBRL, formatDateBR, formatPercent } from './format';

export const TEMPLATE_VERSION = 'template-v1';

export interface AlertText {
  title: string;
  body: string;
}

export function templateFor(alert: AlertFact): AlertText {
  const f = alert.facts;

  switch (alert.ruleKey) {
    case 'cash_runway': {
      const dia = typeof f.zeroOn === 'string' ? formatDateBR(f.zeroOn) : 'breve';
      return {
        title: `Seu caixa pode zerar em ${dia}`,
        body: `No ritmo de hoje, o dinheiro em conta acaba em ${dia}. Ainda dá tempo de agir — vale olhar isso agora.`,
      };
    }

    case 'scissor': {
      const pct =
        typeof f.revenueGrowthRatio === 'number' ? formatPercent(f.revenueGrowthRatio) : null;
      return {
        title: 'Você vende mais, mas o dinheiro demora a chegar',
        body: pct
          ? `Sua receita cresceu ${pct} e mesmo assim o caixa aperta: há muito dinheiro preso a receber. Vale rever prazos com convênios e fornecedores.`
          : 'Sua receita cresce e mesmo assim o caixa aperta: há muito dinheiro preso a receber. Vale rever prazos com convênios e fornecedores.',
      };
    }

    case 'revenue_drop_fixed_cost': {
      const pct =
        typeof f.revenueDropRatio === 'number' ? formatPercent(f.revenueDropRatio) : null;
      const fixo =
        typeof f.monthlyFixedCostCents === 'number'
          ? formatCentsBRL(f.monthlyFixedCostCents)
          : null;
      return {
        title: 'Sua receita caiu e os custos continuam os mesmos',
        body:
          pct && fixo
            ? `A receita caiu ${pct} em relação ao mês anterior, e o custo fixo segue em ${fixo} por mês. Hora de ver de onde dá para aliviar.`
            : 'A receita caiu em relação ao mês anterior e o custo fixo não acompanhou. Hora de ver de onde dá para aliviar.',
      };
    }

    case 'concentration': {
      const quem = typeof f.topCustomer === 'string' ? f.topCustomer : 'Um único cliente';
      const pct =
        typeof f.topCustomerShare === 'number' ? formatPercent(f.topCustomerShare) : null;
      return {
        title: 'Boa parte do seu faturamento vem de um cliente só',
        body: pct
          ? `${quem} responde por ${pct} do que você fatura. Se ele atrasar ou sair, o impacto no caixa é grande.`
          : `${quem} concentra uma fatia grande do seu faturamento. Se ele atrasar ou sair, o impacto no caixa é grande.`,
      };
    }

    case 'all_clear':
      return {
        title: 'Semana tranquila',
        body: 'Seus números seguem estáveis e nada pede atenção hoje. Continue registrando os movimentos que o Pulso segue de olho.',
      };

    default:
      return {
        title: 'Novidade nos seus números',
        body: 'Encontramos um ponto de atenção nos seus números. Abra o Pulso para ver os detalhes.',
      };
  }
}
