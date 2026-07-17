/**
 * Clínica Vida Plena — a clínica SAUDÁVEL. Dados 100% inventados.
 *
 * Perfil: receita estável (~R$ 60 mil/mês), 60% particular à vista,
 * 40% convênio que promete 30 dias e paga ~10 atrasado. Custos fixos
 * pagos em dia, caixa folgado. Nenhuma regra deve disparar: o Pulso
 * diz "semana tranquila".
 */

import { addDays } from '@pulso/core';
import type { CashBalance, CompanySnapshot, Entry } from '@pulso/core';
import { dia, lancamento } from './helpers';

const ASOF = '2026-07-15';

const PACIENTES = [
  'Ana Prado',
  'Bruno Sales',
  'Carla Nunes',
  'Diego Fontes',
  'Elisa Rocha',
  'Fábio Terra',
];

// três convênios equilibrados: nenhum passa de 30% do faturamento
const CONVENIOS: Array<[nome: string, valorCents: number]> = [
  ['Unimed Regional', 800_000],
  ['Bradesco Saúde', 800_000],
  ['SulAmérica', 800_000],
];

const MESES = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
const DIAS_PARTICULAR = [3, 8, 13, 18, 23, 27];

function mesDeMovimento(mes: string, diasParticular: number[]): Entry[] {
  const rows: Entry[] = [];

  // consultas particulares: R$ 6.000 cada bloco, pagas na hora
  diasParticular.forEach((d, i) => {
    const data = dia(mes, d);
    rows.push(
      lancamento({
        kind: 'receivable',
        amountCents: 600_000,
        issuedOn: data,
        settledOn: data,
        counterparty: PACIENTES[i % PACIENTES.length],
        category: 'consulta_particular',
      }),
    );
  });

  // convênios: fatura dia 28, promete 30 dias, paga ~10 dias atrasado
  if (dia(mes, 28) <= ASOF) {
    for (const [nome, valor] of CONVENIOS) {
      const emissao = dia(mes, 28);
      const vencimento = addDays(emissao, 30);
      const pagamento = addDays(vencimento, 10);
      rows.push(
        lancamento({
          kind: 'receivable',
          amountCents: valor,
          issuedOn: emissao,
          dueOn: vencimento,
          settledOn: pagamento <= ASOF ? pagamento : null,
          counterparty: nome,
          category: 'convenio',
        }),
      );
    }
  }

  // custos fixos, pagos em dia (à vista)
  const fixos: Array<[diaMes: number, valor: number, quem: string, cat: string]> = [
    [5, 700_000, 'Imobiliária São Lucas', 'aluguel'],
    [5, 1_800_000, 'Folha de pagamento', 'salarios'],
    [10, 90_000, 'ClinicSoft (sistema)', 'software'],
  ];
  for (const [d, valor, quem, cat] of fixos) {
    const data = dia(mes, d);
    if (data > ASOF) continue;
    rows.push(
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

  // materiais (custo variável), à vista
  const dataMateriais = dia(mes, 12);
  if (dataMateriais <= ASOF) {
    rows.push(
      lancamento({
        kind: 'payable',
        amountCents: 600_000,
        issuedOn: dataMateriais,
        settledOn: dataMateriais,
        counterparty: 'MedSupply Distribuidora',
        category: 'materiais',
        costType: 'variable',
      }),
    );
  }

  return rows;
}

const entries: Entry[] = [
  ...MESES.flatMap((m) => mesDeMovimento(m, DIAS_PARTICULAR)),
  // julho até o dia 15: só as consultas que já aconteceram
  ...mesDeMovimento('2026-07', [3, 8, 13]),
];

// saldo conferido toda metade de mês, estável e folgado
const balances: CashBalance[] = [
  { observedOn: '2026-01-14', balanceCents: 6_400_000 },
  { observedOn: '2026-02-14', balanceCents: 6_700_000 },
  { observedOn: '2026-03-14', balanceCents: 7_000_000 },
  { observedOn: '2026-04-14', balanceCents: 7_300_000 },
  { observedOn: '2026-05-14', balanceCents: 7_600_000 },
  { observedOn: '2026-06-14', balanceCents: 7_800_000 },
  { observedOn: '2026-07-14', balanceCents: 8_000_000 },
];

export const clinicaSaudavel: CompanySnapshot = {
  asOf: ASOF,
  entries,
  balances,
};
