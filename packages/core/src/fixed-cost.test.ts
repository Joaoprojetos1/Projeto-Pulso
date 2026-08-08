import { describe, expect, it } from 'vitest';

import { inferFixedCosts } from './fixed-cost';
import type { Entry } from './types';

let seq = 0;
function pay(counterparty: string, amountCents: number, month: string, over: Partial<Entry> = {}): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    kind: 'payable',
    amountCents,
    issuedOn: `${month}-05`,
    dueOn: `${month}-10`,
    settledOn: `${month}-10`,
    counterparty,
    ...over,
  };
}

const MESES = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];

describe('inferência de custo fixo', () => {
  it('propõe um débito recorrente e estável (aluguel todo mês)', () => {
    const entries = MESES.map((m) => pay('Imobiliária São Lucas', 700_000, m, { category: 'aluguel' }));
    const sug = inferFixedCosts(entries, '2026-07-15');
    expect(sug).toHaveLength(1);
    expect(sug[0]!.label).toBe('Imobiliária São Lucas');
    expect(sug[0]!.monthlyCents).toBe(700_000);
    expect(sug[0]!.occurrences).toBe(6);
    expect(sug[0]!.category).toBe('aluguel');
  });

  it('ignora débito de um mês só (não é recorrente)', () => {
    const entries = [pay('Reforma Ltda', 1_200_000, '2026-06')];
    expect(inferFixedCosts(entries, '2026-07-15')).toHaveLength(0);
  });

  it('ignora débito com valor instável (compra variável)', () => {
    // varia demais entre meses -> não é custo fixo
    const entries = [
      pay('MedSupply', 200_000, '2026-05'),
      pay('MedSupply', 900_000, '2026-06'),
      pay('MedSupply', 350_000, '2026-07'),
    ];
    expect(inferFixedCosts(entries, '2026-07-15')).toHaveLength(0);
  });

  it('não confunde recebíveis com custo fixo', () => {
    const entries = MESES.map((m) => pay('Convênio', 800_000, m, { kind: 'receivable' }));
    expect(inferFixedCosts(entries, '2026-07-15')).toHaveLength(0);
  });

  it('soma os débitos do mesmo fornecedor no mês antes de comparar', () => {
    // folha paga em duas parcelas no mês, estável no total (1.8M) todo mês
    const entries = MESES.flatMap((m) => [
      pay('Folha de pagamento', 1_000_000, m, { issuedOn: `${m}-05`, settledOn: `${m}-05` }),
      pay('Folha de pagamento', 800_000, m, { issuedOn: `${m}-20`, settledOn: `${m}-20` }),
    ]);
    const sug = inferFixedCosts(entries, '2026-07-15');
    expect(sug).toHaveLength(1);
    expect(sug[0]!.monthlyCents).toBe(1_800_000);
  });

  it('respeita a janela: débito antigo fora da janela não conta', () => {
    // 3 meses, mas todos há mais de 6 meses do asOf
    const antigos = ['2025-01', '2025-02', '2025-03'].map((m) => pay('Antigo', 500_000, m));
    expect(inferFixedCosts(antigos, '2026-07-15')).toHaveLength(0);
  });

  it('ordena as sugestões da maior para a menor', () => {
    const entries = [
      ...MESES.map((m) => pay('Aluguel', 700_000, m)),
      ...MESES.map((m) => pay('Software', 90_000, m)),
      ...MESES.map((m) => pay('Folha', 1_800_000, m)),
    ];
    const sug = inferFixedCosts(entries, '2026-07-15');
    expect(sug.map((s) => s.label)).toEqual(['Folha', 'Aluguel', 'Software']);
  });
});
