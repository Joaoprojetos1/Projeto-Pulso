import { describe, expect, it } from 'vitest';

import { computeAll } from './indicators';
import { evaluate } from './rules';
import { balance, entry, snapshot } from './testkit';

// Caixa que vai zerar — a versão "Dona Maria" já disparando pelo caminho real
// (computeAll → evaluate).
function donaMaria() {
  return snapshot({
    asOf: '2026-07-01',
    declaredFixedCostCents: 600000,
    balances: [balance('2026-07-01', 800000)],
    entries: [
      entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-15', dueOn: '2026-05-15', settledOn: '2026-05-30' }),
      entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-20', dueOn: '2026-05-20', settledOn: '2026-06-04' }),
      entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-25', dueOn: '2026-05-25', settledOn: '2026-06-09' }),
      entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-05' }),
      entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-10' }),
      entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-15' }),
      entry({ kind: 'receivable', amountCents: 3000000, issuedOn: '2026-06-25', dueOn: '2026-07-20' }),
    ],
  });
}

describe('cashRunwayRule', () => {
  it('dispara crítico com a data em que o caixa zera', () => {
    const alerts = evaluate(computeAll(donaMaria()));
    const runway = alerts.find((a) => a.ruleKey === 'cash_runway');
    expect(runway).toBeDefined();
    expect(runway!.severity).toBe('critical');
    expect(runway!.facts.zeroOn).toBe('2026-07-10');
  });
});

describe('scissorRule (a tesoura — tese do produto)', () => {
  it('receita sobe mas a NCG consome caixa desproporcional → warn', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        // mês anterior (janela -60..-31): R$ 10 mil
        entry({ kind: 'receivable', amountCents: 1000000, issuedOn: '2026-05-15', settledOn: '2026-06-14' }),
        // mês atual (janela -30..hoje): R$ 15 mil → cresceu 50%
        entry({ kind: 'receivable', amountCents: 1500000, issuedOn: '2026-06-15', settledOn: '2026-06-30' }),
        // e uma montanha a receber em aberto (emitida fora das janelas de receita,
        // para não inflar o mês atual): a operação está financiando o crescimento
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-15', dueOn: '2026-08-01' }),
      ],
    });
    const alerts = evaluate(computeAll(snap));
    const scissor = alerts.find((a) => a.ruleKey === 'scissor');
    expect(scissor).toBeDefined();
    expect(scissor!.severity).toBe('warn');
    expect(scissor!.facts.revenueGrowthRatio).toBeCloseTo(0.5, 10);
  });
});

describe('allClearRule (silêncio também é sinal)', () => {
  it('quando nada dispara, ainda fala — um ok, não vazio', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [balance('2026-07-01', 500000)],
    });
    const alerts = evaluate(computeAll(snap));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ruleKey).toBe('all_clear');
    expect(alerts[0]!.severity).toBe('ok');
  });
});

describe('evaluate (ordenação)', () => {
  it('o dono vê o pior primeiro: crítico antes de warn', () => {
    const snap = donaMaria();
    // adiciona receita do mês anterior para também disparar a tesoura
    snap.entries.push(
      entry({ kind: 'receivable', amountCents: 1000000, issuedOn: '2026-05-15', dueOn: '2026-06-14', settledOn: '2026-06-29' }),
    );
    const alerts = evaluate(computeAll(snap));
    const keys = alerts.map((a) => a.ruleKey);
    expect(keys).toContain('cash_runway');
    expect(keys).toContain('scissor');
    expect(alerts[0]!.severity).toBe('critical');
  });
});
