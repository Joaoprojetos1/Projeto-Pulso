/**
 * Clínica Horizonte — a clínica da TESOURA. Dados 100% inventados.
 *
 * O cenário "Dona Maria" em forma de clínica: a receita cresce todo mês
 * (R$ 40 mil em fevereiro → R$ 74 mil em julho), há lucro no papel, MAS:
 *   - 80% da receita é convênio, que promete 30 dias e paga 15 atrasado
 *     (o dinheiro chega ~45 dias depois de atender);
 *   - fornecedores e salários são pagos à vista;
 *   - o caixa vem derretendo mês a mês.
 *
 * Este snapshot DEVE disparar `cash_runway` (crítico) e `scissor` (warn).
 * Também dispara `concentration`: metade do faturamento é um convênio só.
 */

import { addDays } from '@pulso/core';
import type { CashBalance, CompanySnapshot, Entry } from '@pulso/core';
import { dia, lancamento } from './helpers';

const ASOF = '2026-07-15';

// receita mensal em centavos: crescendo sem parar
const FATURAMENTO: Array<[mes: string, totalCents: number]> = [
  ['2026-02', 4_000_000],
  ['2026-03', 4_600_000],
  ['2026-04', 5_200_000],
  ['2026-05', 5_800_000],
  ['2026-06', 6_600_000],
  ['2026-07', 7_400_000],
];

const PACIENTES = ['Marina Costa', 'Otávio Lins', 'Paula Reis', 'Renato Dias'];

const entries: Entry[] = [];

for (const [mes, total] of FATURAMENTO) {
  // 20% particular à vista, em dois blocos (dias 6 e 16)
  [6, 16].forEach((d, i) => {
    const data = dia(mes, d);
    if (data > ASOF) return;
    entries.push(
      lancamento({
        kind: 'receivable',
        amountCents: Math.round(total * 0.1),
        issuedOn: data,
        settledOn: data,
        counterparty: PACIENTES[i % PACIENTES.length],
        category: 'consulta_particular',
      }),
    );
  });

  // 80% convênio: fatura dia 26, promete 30 dias, paga 15 atrasado
  const convenios: Array<[nome: string, fatia: number]> = [
    ['Unimed Regional', 0.5], // metade do faturamento num convênio só
    ['IPSEMG', 0.3],
  ];
  const emissao = dia(mes, 26);
  if (emissao <= ASOF) {
    for (const [nome, fatia] of convenios) {
      const vencimento = addDays(emissao, 30);
      const pagamento = addDays(vencimento, 15);
      entries.push(
        lancamento({
          kind: 'receivable',
          amountCents: Math.round(total * fatia),
          issuedOn: emissao,
          dueOn: vencimento,
          settledOn: pagamento <= ASOF ? pagamento : null,
          counterparty: nome,
          category: 'convenio',
        }),
      );
    }
  }

  // custos fixos altos, pagos à vista
  const fixos: Array<[diaMes: number, valor: number, quem: string, cat: string]> = [
    [5, 900_000, 'Imobiliária Central', 'aluguel'],
    [5, 2_400_000, 'Folha de pagamento', 'salarios'],
    [8, 120_000, 'ClinicSoft (sistema)', 'software'],
  ];
  for (const [d, valor, quem, cat] of fixos) {
    const data = dia(mes, d);
    if (data > ASOF) continue;
    entries.push(
      lancamento({
        kind: 'payable',
        amountCents: valor,
        issuedOn: data,
        settledOn: data,
        counterparty: quem,
        category: cat,
        costType: 'fixed',
      }),
    );
  }

  // materiais crescem junto com a receita (25%), pagos à vista
  const dataMateriais = dia(mes, 12);
  if (dataMateriais <= ASOF) {
    entries.push(
      lancamento({
        kind: 'payable',
        amountCents: Math.round(total * 0.25),
        issuedOn: dataMateriais,
        settledOn: dataMateriais,
        counterparty: 'MedSupply Distribuidora',
        category: 'materiais',
        costType: 'variable',
      }),
    );
  }
}

// o caixa derretendo mês a mês — o lucro está no papel, não na conta
const balances: CashBalance[] = [
  { observedOn: '2026-02-14', balanceCents: 5_200_000 },
  { observedOn: '2026-03-14', balanceCents: 4_600_000 },
  { observedOn: '2026-04-14', balanceCents: 3_900_000 },
  { observedOn: '2026-05-14', balanceCents: 3_100_000 },
  { observedOn: '2026-06-14', balanceCents: 2_300_000 },
  { observedOn: '2026-07-14', balanceCents: 1_500_000 },
];

export const clinicaTesoura: CompanySnapshot = {
  asOf: ASOF,
  entries,
  balances,
};
