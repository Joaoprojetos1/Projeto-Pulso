/**
 * "O que eu faço?" — próximos passos concretos para cada alerta.
 *
 * IMPORTANTE (regra do CLAUDE.md): o app NÃO calcula e NÃO inventa número. Aqui
 * são só CONSELHOS em texto-modelo por tipo de alerta, que encaixam os números
 * que o servidor JÁ mandou (os `facts`). Mesma ideia dos mini-cards do painel.
 */

import type { AlertJson } from './api';
import { brl, dataBR, dias, pct } from './format';

function n(facts: AlertJson['facts'], chave: string): number | null {
  const v = facts[chave];
  return typeof v === 'number' ? v : null;
}
function s(facts: AlertJson['facts'], chave: string): string | null {
  const v = facts[chave];
  return typeof v === 'string' ? v : null;
}

/** Lista de passos (já em português do dono) para o alerta. */
export function acoesParaAlerta(alerta: AlertJson): string[] {
  const f = alerta.facts;
  const passos: string[] = [];

  switch (alerta.ruleKey) {
    case 'cash_runway': {
      const zeroOn = s(f, 'zeroOn');
      const pmr = n(f, 'pmrDays');
      if (zeroOn) passos.push(`O ponto de risco é ${dataBR(zeroOn)}. O melhor momento de agir é antes dessa data.`);
      passos.push(
        pmr !== null
          ? `Fale com seus maiores clientes para antecipar recebimentos: hoje você recebe em média em ${dias(pmr)}.`
          : 'Fale com seus maiores clientes para antecipar recebimentos.',
      );
      passos.push('Segure o que der de custos não essenciais até o caixa voltar a respirar.');
      passos.push('Se precisar, negocie prazo com fornecedores para alinhar o que entra com o que sai.');
      break;
    }
    case 'scissor': {
      const pmr = n(f, 'pmrDays');
      const pmp = n(f, 'pmpDays');
      const ncg = n(f, 'ncgCents');
      if (ncg !== null) passos.push(`Priorize cobrar o que está em aberto: há cerca de ${brl(ncg)} presos a receber.`);
      passos.push(
        pmr !== null && pmp !== null
          ? `Reveja prazos: você recebe em ${dias(pmr)} e paga em ${dias(pmp)}. Quanto mais perto, melhor pro caixa.`
          : 'Reveja os prazos de recebimento com clientes e de pagamento com fornecedores.',
      );
      passos.push('Evite ampliar as vendas a prazo sem caixa para sustentar o intervalo até receber.');
      break;
    }
    case 'receivables_slowing': {
      const pmr = n(f, 'pmrDays');
      passos.push(
        pmr !== null
          ? `Hoje o dinheiro leva em média ${dias(pmr)} para cair na conta. Combine prazos mais curtos com seus maiores clientes.`
          : 'Combine prazos mais curtos de pagamento com seus maiores clientes.',
      );
      passos.push('Ofereça uma condição melhor para quem paga à vista ou adianta.');
      passos.push('Acompanhe toda semana quem está atrasando, para cobrar cedo e sem desgaste.');
      break;
    }
    case 'concentration': {
      const cliente = s(f, 'topCustomer');
      const fatia = n(f, 'topCustomerShare');
      const quem = cliente ?? 'seu maior cliente';
      const quanto = fatia !== null ? ` (${pct(fatia)} do faturamento)` : '';
      passos.push(`Busque novos clientes para reduzir a dependência de ${quem}${quanto}.`);
      passos.push('Tenha um plano B de caixa caso esse cliente atrase ou deixe de comprar.');
      break;
    }
    default:
      passos.push('Abra a conversa e me pergunte o que fazer com esses números. Eu explico com base neles.');
  }

  return passos;
}
