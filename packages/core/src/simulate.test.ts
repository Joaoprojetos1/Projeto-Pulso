import { describe, expect, it } from 'vitest';

import { simulate, type SimulationDelta } from './simulate';
import { balance, entry, snapshot } from './testkit';

/**
 * Base sem custo fixo: R$ 5.000 em caixa, um pagamento de R$ 8.000 que vence em
 * 20/jun (zera o caixa nesse dia) e um recebível de R$ 7.000 que só chega em
 * 15/jul (tarde demais para evitar a zeragem). asOf = 01/jun.
 */
const ASOF = '2026-06-01';
const base = snapshot({
  asOf: ASOF,
  balances: [balance(ASOF, 500_000)],
  entries: [
    entry({ id: 'pay1', kind: 'payable', amountCents: 800_000, dueOn: '2026-06-20' }),
    entry({ id: 'rec1', kind: 'receivable', amountCents: 700_000, dueOn: '2026-07-15' }),
  ],
});

/** Base com custo fixo declarado (R$ 9.000/mês), sem lançamentos. */
const baseFixed = snapshot({
  asOf: ASOF,
  balances: [balance(ASOF, 500_000)],
  declaredFixedCostCents: 900_000,
});

describe('simulate — estrutura e pureza', () => {
  it('a curva vem do próprio motor (abre no saldo, um ponto por dia)', () => {
    const r = simulate(base, []);
    expect(r.asOf).toBe(ASOF);
    expect(r.horizonDays).toBe(90);
    // abertura (asOf) + 90 dias
    expect(r.original.curve).toHaveLength(91);
    expect(r.original.curve[0]).toEqual({ day: ASOF, cents: 500_000 });
    // sem deltas, real e simulada são idênticas
    expect(r.simulated.curve).toEqual(r.original.curve);
    expect(r.original.zeroOn).toBe('2026-06-20');
  });

  it('NÃO altera o snapshot original (a simulação é uma cópia)', () => {
    const antes = JSON.stringify(base);
    simulate(base, [
      { type: 'delayPayable', entryId: 'pay1', days: 30 },
      { type: 'addPlanned', kind: 'payable', amountCents: 100_000, dueOn: '2026-06-05' },
    ]);
    expect(JSON.stringify(base)).toBe(antes);
  });

  it('ignora deltas inválidos sem quebrar', () => {
    const deltas: SimulationDelta[] = [
      { type: 'delayPayable', entryId: 'nao-existe', days: 10 },
      { type: 'anticipateReceivable', entryId: 'rec1', days: 0 }, // dias <= 0
      { type: 'adjustFixedCost', deltaCents: 0 }, // sem efeito
      { type: 'addPlanned', kind: 'payable', amountCents: -100, dueOn: '2026-06-10' }, // negativo
    ];
    const r = simulate(base, deltas);
    expect(r.applied).toHaveLength(0);
    expect(r.ignored).toHaveLength(4);
    expect(r.simulated.zeroOn).toBe(r.original.zeroOn); // nada mudou
  });
});

describe('simulate — cada tipo de delta', () => {
  it('delayPayable: adiar o pagamento empurra a zeragem para frente', () => {
    const r = simulate(base, [{ type: 'delayPayable', entryId: 'pay1', days: 10 }]);
    expect(r.applied).toHaveLength(1);
    expect(r.original.zeroOn).toBe('2026-06-20');
    expect(r.simulated.zeroOn).toBe('2026-06-30'); // 10 dias depois
  });

  it('anticipateReceivable: antecipar o recebível evita a zeragem no horizonte', () => {
    const r = simulate(base, [{ type: 'anticipateReceivable', entryId: 'rec1', days: 40 }]);
    expect(r.applied).toHaveLength(1);
    // o dinheiro entra em 05/jun, antes do pagamento de 20/jun → não zera mais
    expect(r.simulated.zeroOn).toBeNull();
  });

  it('adjustFixedCost: cortar custo fixo empurra a zeragem; aumentar antecipa', () => {
    const semAjuste = simulate(baseFixed, []);
    const corte = simulate(baseFixed, [{ type: 'adjustFixedCost', deltaCents: -300_000 }]);
    const aumento = simulate(baseFixed, [{ type: 'adjustFixedCost', deltaCents: 300_000 }]);

    expect(semAjuste.original.zeroOn).not.toBeNull();
    // corte: zera MAIS TARDE (data maior)
    expect(corte.simulated.zeroOn! > semAjuste.original.zeroOn!).toBe(true);
    // aumento: zera MAIS CEDO (data menor)
    expect(aumento.simulated.zeroOn! < semAjuste.original.zeroOn!).toBe(true);
  });

  it('addPlanned: uma conta prevista entra na curva', () => {
    // um recebível grande previsto para amanhã segura o caixa
    const r = simulate(base, [
      { type: 'addPlanned', kind: 'receivable', amountCents: 900_000, dueOn: '2026-06-02' },
    ]);
    expect(r.applied).toHaveLength(1);
    expect(r.simulated.zeroOn).toBeNull(); // o reforço evita a zeragem
  });
});

describe('simulate — ADIA vs ANTECIPA a zeragem', () => {
  it('ADIA: adiar o maior pagamento leva a zeragem para depois', () => {
    const r = simulate(base, [{ type: 'delayPayable', entryId: 'pay1', days: 10 }]);
    expect(r.simulated.zeroOn! > r.original.zeroOn!).toBe(true);
  });

  it('ANTECIPA: uma nova conta a pagar antes do vencimento zera o caixa antes', () => {
    const r = simulate(base, [
      { type: 'addPlanned', kind: 'payable', amountCents: 600_000, dueOn: '2026-06-10' },
    ]);
    expect(r.original.zeroOn).toBe('2026-06-20');
    expect(r.simulated.zeroOn).toBe('2026-06-10');
    expect(r.simulated.zeroOn! < r.original.zeroOn!).toBe(true);
  });
});
