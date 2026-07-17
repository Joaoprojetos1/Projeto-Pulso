import { describe, expect, it } from 'vitest';

import {
  cashBalance,
  averageReceivableDays,
  averagePayableDays,
  cashCycle,
  workingCapitalNeed,
  revenueInWindow,
  monthlyFixedCost,
  contributionMargin,
  customerConcentration,
  projectCash,
  type CashProjection,
} from './indicators';
import { balance, entry, snapshot } from './testkit';

// ---------------------------------------------------------------
// 01 — Saldo de caixa
// ---------------------------------------------------------------
describe('cashBalance', () => {
  it('caso feliz: usa o saldo mais recente até asOf', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [
        balance('2026-06-01', 500000),
        balance('2026-06-28', 800000),
      ],
    });
    const r = cashBalance(snap);
    expect(r.value).toBe(800000);
    expect(r.inputs.observedOn).toBe('2026-06-28');
    expect(r.inputs.stalenessDays).toBe(3);
  });

  it('dado insuficiente: sem nenhum saldo informado → null', () => {
    const r = cashBalance(snapshot({ asOf: '2026-07-01' }));
    expect(r.value).toBeNull();
    expect(r.insufficientReason).toMatch(/Nenhum saldo/);
  });

  it('borda: ignora saldo observado depois de asOf', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [
        balance('2026-06-20', 300000),
        balance('2026-07-15', 999999), // futuro: não pode vazar
      ],
    });
    expect(cashBalance(snap).value).toBe(300000);
  });
});

// ---------------------------------------------------------------
// 03 — Prazo médio de recebimento (PMR)
// ---------------------------------------------------------------
describe('averageReceivableDays', () => {
  it('caso feliz: média dos dias reais levados para receber', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-31' }), // 30d
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-10' }), // 40d
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-20' }), // 50d
      ],
    });
    const r = averageReceivableDays(snap);
    expect(r.value).toBe(40);
    expect(r.inputs.settledCount).toBe(3);
  });

  it('borda: pondera pelo valor, não conta simples', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-21' }), // 20d, peso 1
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-21' }), // 20d, peso 1
        entry({ kind: 'receivable', amountCents: 200000, issuedOn: '2026-04-05', settledOn: '2026-06-24' }), // 80d, peso 2
      ],
    });
    // simples seria 40; ponderado = (20+20+160)/4 = 50
    expect(averageReceivableDays(snap).value).toBe(50);
  });

  it('dado insuficiente: menos de 3 liquidações → null, nunca chuta', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-31' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-10' }),
      ],
    });
    const r = averageReceivableDays(snap);
    expect(r.value).toBeNull();
    expect(r.inputs.settledCount).toBe(2);
    expect(r.insufficientReason).toMatch(/mínimo 3/);
  });

  it('borda: janela vazia (nada liquidado) → null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01' })], // em aberto
    });
    expect(averageReceivableDays(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 04 — Prazo médio de pagamento (PMP)
// ---------------------------------------------------------------
describe('averagePayableDays', () => {
  it('caso feliz', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-11' }), // 10d
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-13' }), // 12d
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-15' }), // 14d
      ],
    });
    expect(averagePayableDays(snap).value).toBe(12);
  });

  it('dado insuficiente: menos de 3 → null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-11' })],
    });
    expect(averagePayableDays(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 05 — Ciclo de caixa
// ---------------------------------------------------------------
describe('cashCycle', () => {
  it('caso feliz: PMR + 0 (serviço, sem estoque) − PMP', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        // 3 recebimentos ~45d
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-15' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-15' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-15' }),
        // 3 pagamentos ~15d
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' }),
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' }),
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' }),
      ],
    });
    const r = cashCycle(snap);
    expect(r.value).toBe(45 - 15);
    expect(r.inputs.pme).toBe(0);
  });

  it('dado insuficiente: sem PMR ou sem PMP → null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' })],
    });
    expect(cashCycle(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 06 — Necessidade de capital de giro (NCG)
// ---------------------------------------------------------------
describe('workingCapitalNeed', () => {
  it('caso feliz: a receber em aberto − a pagar em aberto', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 500000 }), // aberto
        entry({ kind: 'payable', amountCents: 200000 }), // aberto
        entry({ kind: 'receivable', amountCents: 999999, settledOn: '2026-06-01' }), // liquidado: não conta
      ],
    });
    const r = workingCapitalNeed(snap);
    expect(r.value).toBe(300000);
    expect(r.inputs.openReceivablesCents).toBe(500000);
    expect(r.inputs.openPayablesCents).toBe(200000);
  });

  it('borda: nada em aberto → 0 (não null; é um valor conhecido)', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 100000, settledOn: '2026-06-01' })],
    });
    expect(workingCapitalNeed(snap).value).toBe(0);
  });
});

// ---------------------------------------------------------------
// 07 — Receita na janela (competência)
// ---------------------------------------------------------------
describe('revenueInWindow', () => {
  it('caso feliz: soma recebíveis por data de emissão, ignora o resto', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-06-10' }),
        entry({ kind: 'receivable', amountCents: 300000, issuedOn: '2026-06-20' }),
        entry({ kind: 'receivable', amountCents: 999999, issuedOn: '2026-04-01' }), // fora da janela
        entry({ kind: 'payable', amountCents: 999999, issuedOn: '2026-06-15' }), // pagável não é receita
      ],
    });
    const r = revenueInWindow(snap, '2026-06-01', '2026-06-30');
    expect(r.value).toBe(400000);
    expect(r.inputs.entryCount).toBe(2);
  });

  it('borda: janela sem lançamento → 0', () => {
    const snap = snapshot({ asOf: '2026-07-01' });
    expect(revenueInWindow(snap, '2026-06-01', '2026-06-30').value).toBe(0);
  });
});

// ---------------------------------------------------------------
// 09 — Custo fixo mensal
// ---------------------------------------------------------------
describe('monthlyFixedCost', () => {
  it('caso feliz: deriva dos lançamentos fixos (total / meses da janela)', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'payable', amountCents: 300000, issuedOn: '2026-05-01', costType: 'fixed' }),
        entry({ kind: 'payable', amountCents: 300000, issuedOn: '2026-06-01', costType: 'fixed' }),
        entry({ kind: 'payable', amountCents: 300000, issuedOn: '2026-06-15', costType: 'fixed' }),
        entry({ kind: 'payable', amountCents: 999999, issuedOn: '2026-06-01', costType: 'variable' }), // variável não entra
      ],
    });
    const r = monthlyFixedCost(snap);
    expect(r.value).toBe(300000); // 900000 / (90/30)
    expect(r.inputs.source).toBe('derived_from_entries');
  });

  it('fallback: sem lançamento fixo usa o declarado no onboarding', () => {
    const snap = snapshot({ asOf: '2026-07-01', declaredFixedCostCents: 600000 });
    const r = monthlyFixedCost(snap);
    expect(r.value).toBe(600000);
    expect(r.inputs.source).toBe('declared_at_onboarding');
  });

  it('dado insuficiente: sem fixo e sem declarado → null', () => {
    const r = monthlyFixedCost(snapshot({ asOf: '2026-07-01' }));
    expect(r.value).toBeNull();
    expect(r.insufficientReason).toBeTruthy();
  });
});

// ---------------------------------------------------------------
// 08 — Margem de contribuição
// ---------------------------------------------------------------
describe('contributionMargin', () => {
  it('caso feliz: (receita − custo variável) / receita', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-06-10' }),
        entry({ kind: 'payable', amountCents: 40000, issuedOn: '2026-06-10', costType: 'variable' }),
        entry({ kind: 'payable', amountCents: 999999, issuedOn: '2026-06-10', costType: 'fixed' }), // fixo não entra
      ],
    });
    expect(contributionMargin(snap).value).toBeCloseTo(0.6, 10);
  });

  it('dado insuficiente: sem receita na janela → null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'payable', amountCents: 40000, issuedOn: '2026-06-10', costType: 'variable' })],
    });
    expect(contributionMargin(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 10 — Concentração de clientes
// ---------------------------------------------------------------
describe('customerConcentration', () => {
  it('caso feliz: fatia do maior cliente sobre o total', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 700000, issuedOn: '2026-06-01', counterparty: 'Convênio X' }),
        entry({ kind: 'receivable', amountCents: 200000, issuedOn: '2026-06-01', counterparty: 'Particular A' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-06-01', counterparty: 'Particular B' }),
      ],
    });
    const r = customerConcentration(snap);
    expect(r.value).toBeCloseTo(0.7, 10);
    expect(r.inputs.topCustomer).toBe('Convênio X');
    expect(r.inputs.customerCount).toBe(3);
  });

  it('dado insuficiente: sem receita identificada por cliente → null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-06-01' })], // sem counterparty
    });
    expect(customerConcentration(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 02 — Projeção de caixa (O HERÓI) — o teste que define o produto
// ---------------------------------------------------------------
describe('projectCash', () => {
  it('dado insuficiente: sem saldo de caixa não há de onde projetar → null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 500000 })],
    });
    const r = projectCash(snap);
    expect(r.value).toBeNull();
    expect(r.insufficientReason).toMatch(/Sem saldo/);
  });

  it('borda: só saldo, sem lançamentos nem custo → não zera, projeção plana', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [balance('2026-07-01', 500000)],
    });
    const value = projectCash(snap).value as CashProjection[];
    for (const p of value) {
      expect(p.zeroOn).toBeNull();
      expect(p.projectedCents).toBe(500000);
    }
  });

  it('Dona Maria: vende mais, lucro no papel, recebe em 45d e paga à vista → ACUSA zeroOn', () => {
    // A tese do produto. A empresa está crescendo — R$ 30 mil a receber —
    // mas o dinheiro chega tarde demais e ela paga o fornecedor agora.
    const snap = snapshot({
      asOf: '2026-07-01',
      declaredFixedCostCents: 600000, // R$ 6.000/mês → R$ 200/dia de sangria
      balances: [balance('2026-07-01', 800000)], // R$ 8.000 hoje
      entries: [
        // histórico liquidado: o cliente promete 30 e paga 15 dias atrasado (recebe em ~45d)
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-15', dueOn: '2026-05-15', settledOn: '2026-05-30' }),
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-20', dueOn: '2026-05-20', settledOn: '2026-06-04' }),
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-25', dueOn: '2026-05-25', settledOn: '2026-06-09' }),
        // fornecedor à vista: sai já, nos próximos dias
        entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-05' }),
        entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-10' }),
        entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-15' }),
        // a venda grande (lucro no papel): R$ 30 mil, mas chega atrasada (dueOn +15d = 04/ago)
        entry({ kind: 'receivable', amountCents: 3000000, issuedOn: '2026-06-25', dueOn: '2026-07-20' }),
      ],
    });

    const ind = projectCash(snap);
    const value = ind.value as CashProjection[];
    const at30 = value.find((p) => p.horizonDays === 30)!;

    // O ponto: mesmo com R$ 30 mil "entrando", o caixa zera antes.
    expect(at30.zeroOn).toBe('2026-07-10');
    expect(at30.projectedCents).toBeLessThan(0);

    // Auditoria: projeta pelo atraso REAL (15d), não pela data prometida.
    expect(ind.inputs.avgLatenessDays).toBe(15);
    expect(ind.inputs.openingBalanceCents).toBe(800000);
  });
});
