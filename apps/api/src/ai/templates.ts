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
          ? `Sua receita cresceu ${pct} e mesmo assim o caixa aperta: há muito dinheiro preso a receber. Vale rever prazos com clientes e fornecedores.`
          : 'Sua receita cresce e mesmo assim o caixa aperta: há muito dinheiro preso a receber. Vale rever prazos com clientes e fornecedores.',
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

    // ---- Segmento: clínica ----
    case 'clinica_glosa_alta': {
      const pct = typeof f.glosaRate === 'number' ? formatPercent(f.glosaRate) : null;
      return {
        title: 'Os convênios estão glosando demais',
        body: pct
          ? `Os convênios cortaram ${pct} do que você faturou neste mês. Vale revisar e contestar as glosas.`
          : 'Os convênios cortaram uma fatia grande do que você faturou. Vale revisar e contestar as glosas.',
      };
    }
    case 'clinica_ocupacao_baixa': {
      const pct = typeof f.ocupacao === 'number' ? formatPercent(f.ocupacao) : null;
      return {
        title: 'Sua agenda está ociosa',
        body: pct
          ? `Só ${pct} da agenda foi ocupada no mês. Há espaço para atender mais sem aumentar custo.`
          : 'Boa parte da agenda ficou vazia no mês. Há espaço para atender mais sem aumentar custo.',
      };
    }
    case 'clinica_convenio_prazo_piorando': {
      const dias = typeof f.pmrConvenioDays === 'number' ? `${f.pmrConvenioDays} dias` : null;
      return {
        title: 'Os convênios estão demorando mais a pagar',
        body: dias
          ? `O prazo dos convênios subiu para ${dias}, acima da sua média. Vale cobrar o que está atrasado.`
          : 'O prazo dos convênios subiu acima da sua média. Vale cobrar o que está atrasado.',
      };
    }

    // ---- Segmento: varejo de roupa ----
    case 'varejo_giro_baixo': {
      const giro = typeof f.giro === 'number' ? String(f.giro).replace('.', ',') : null;
      return {
        title: 'Seu estoque está girando devagar',
        body: giro
          ? `Seu estoque gira ${giro} vezes por ano, abaixo do saudável. É muito dinheiro parado em mercadoria.`
          : 'Seu estoque está girando devagar. É muito dinheiro parado em mercadoria.',
      };
    }
    case 'varejo_margem_baixa': {
      const pct = typeof f.margemBruta === 'number' ? formatPercent(f.margemBruta) : null;
      return {
        title: 'Sua margem bruta está apertada',
        body: pct
          ? `Sobra ${pct} de cada venda depois do custo da mercadoria. Vale rever preço ou custo de compra.`
          : 'Está sobrando pouco de cada venda depois do custo da mercadoria. Vale rever preço ou custo de compra.',
      };
    }
    case 'varejo_devolucoes_altas': {
      const pct = typeof f.devolucoes === 'number' ? formatPercent(f.devolucoes) : null;
      return {
        title: 'As devoluções estão altas',
        body: pct
          ? `${pct} das suas vendas voltaram como devolução neste mês. Vale olhar tamanho, qualidade e a foto do produto.`
          : 'Uma fatia grande das vendas voltou como devolução. Vale olhar tamanho, qualidade e a foto do produto.',
      };
    }

    // ---- Segmento: restaurante ----
    case 'restaurante_cmv_alto': {
      const pct = typeof f.cmv === 'number' ? formatPercent(f.cmv) : null;
      return {
        title: 'O custo da comida está alto',
        body: pct
          ? `Os insumos consumiram ${pct} da sua receita neste mês. Vale rever ficha técnica, compras e desperdício.`
          : 'Os insumos consumiram uma fatia grande da receita. Vale rever ficha técnica, compras e desperdício.',
      };
    }
    case 'restaurante_marketplace_caro': {
      const pct = typeof f.taxaEfetiva === 'number' ? formatPercent(f.taxaEfetiva) : null;
      return {
        title: 'As taxas de delivery estão pesando',
        body: pct
          ? `Os apps ficaram com ${pct} do seu faturamento de delivery. Vale negociar a taxa ou incentivar o pedido direto.`
          : 'Os apps estão ficando com uma fatia grande do delivery. Vale negociar a taxa ou incentivar o pedido direto.',
      };
    }
    case 'restaurante_dependencia_delivery': {
      const pct = typeof f.deliveryShare === 'number' ? formatPercent(f.deliveryShare) : null;
      return {
        title: 'Você depende muito do delivery',
        body: pct
          ? `${pct} da sua receita vem de delivery e a margem está caindo. Vale fortalecer o salão e o pedido próprio.`
          : 'Boa parte da receita vem de delivery e a margem está caindo. Vale fortalecer o salão e o pedido próprio.',
      };
    }

    default:
      return {
        title: 'Novidade nos seus números',
        body: 'Encontramos um ponto de atenção nos seus números. Abra o Pulso para ver os detalhes.',
      };
  }
}
