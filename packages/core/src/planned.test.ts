import { describe, expect, it } from 'vitest';

import { fusePlannedIntoProjection, type PlannedFusionContext } from './planned';
import { planned } from './testkit';

// asOf fixo; atraso médio 10 dias; horizonte 90 dias (fim = 2026-10-13).
const CTX: PlannedFusionContext = {
  asOf: '2026-07-15',
  avgLatenessDays: 10,
  maxHorizonDays: 90,
};

describe('R1 — prevista a pagar entra em due_on como saída', () => {
  it('paga no vencimento, valor negativo', () => {
    const f = fusePlannedIntoProjection(
      [planned({ kind: 'payable', amountCents: 500_000, dueOn: '2026-08-01' })],
      CTX,
    );
    expect(f.events).toHaveLength(1);
    expect(f.events[0]).toMatchObject({
      day: '2026-08-01',
      deltaCents: -500_000,
      kind: 'payable',
      reason: 'due',
    });
    expect(f.plannedCount).toBe(1);
    expect(f.plannedTotalCents).toBe(500_000);
  });
});

describe('R2 — prevista a receber entra em due_on + atraso médio, como entrada', () => {
  it('recebe atrasado pelo atraso médio real (não na data prometida)', () => {
    const f = fusePlannedIntoProjection(
      [planned({ kind: 'receivable', amountCents: 300_000, dueOn: '2026-08-01' })],
      CTX,
    );
    expect(f.events[0]).toMatchObject({
      day: '2026-08-11', // 01/08 + 10 dias
      deltaCents: 300_000,
      kind: 'receivable',
      reason: 'due',
    });
  });
});

describe('R3 — vencida e não confirmada NÃO some', () => {
  it('a pagar vencida projeta no dia seguinte ao asOf (vai ter que pagar)', () => {
    const f = fusePlannedIntoProjection(
      [planned({ kind: 'payable', amountCents: 200_000, dueOn: '2026-07-01' })],
      CTX,
    );
    expect(f.events[0]).toMatchObject({
      day: '2026-07-16', // asOf + 1
      deltaCents: -200_000,
      reason: 'overdue_payable',
    });
  });

  it('a receber vencida projeta com o DOBRO do atraso médio (sinal de risco)', () => {
    const f = fusePlannedIntoProjection(
      [planned({ kind: 'receivable', amountCents: 400_000, dueOn: '2026-07-01' })],
      CTX,
    );
    expect(f.events[0]).toMatchObject({
      day: '2026-07-21', // 01/07 + 2*10
      deltaCents: 400_000,
      reason: 'overdue_receivable',
    });
  });

  it('a receber vencida nunca projeta antes de amanhã (clamp)', () => {
    const f = fusePlannedIntoProjection(
      [planned({ kind: 'receivable', amountCents: 100_000, dueOn: '2026-07-14' })],
      { ...CTX, avgLatenessDays: 0 }, // dobro de 0 cairia no passado
    );
    expect(f.events[0]!.day).toBe('2026-07-16'); // clampado para amanhã
  });
});

describe('R4 — recorrência mensal expande dentro do horizonte', () => {
  it('uma ocorrência por mês até o maxHorizon', () => {
    const f = fusePlannedIntoProjection(
      [planned({ kind: 'payable', amountCents: 100_000, dueOn: '2026-08-05', recurrence: 'monthly' })],
      CTX,
    );
    // 05/08, 05/09, 05/10 (05/11 já passa do fim = 13/10)
    expect(f.events.map((e) => e.day)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
    expect(f.plannedCount).toBe(3);
    expect(f.plannedTotalCents).toBe(300_000);
  });

  it('recorrência antiga não empilha meses vencidos: só a mais recente vencida entra', () => {
    const f = fusePlannedIntoProjection(
      [planned({ kind: 'payable', amountCents: 100_000, dueOn: '2026-05-05', recurrence: 'monthly' })],
      CTX,
    );
    // 05/05 e 05/06 são história (mais de ~1 mês vencidas); 05/07 vencida -> amanhã;
    // depois 05/08, 05/09, 05/10 no futuro
    expect(f.events.map((e) => e.day)).toEqual([
      '2026-07-16', // 05/07 vencida -> asOf+1
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
    ]);
  });
});

describe('R5 — deduplicação: conta confirmada não entra', () => {
  it('status realizada é ignorado (o realizado já vive em entries)', () => {
    const f = fusePlannedIntoProjection(
      [
        planned({ kind: 'payable', amountCents: 500_000, dueOn: '2026-08-01', status: 'realizada', confirmedOn: '2026-07-30' }),
        planned({ kind: 'receivable', amountCents: 300_000, dueOn: '2026-08-01' }),
      ],
      CTX,
    );
    expect(f.events).toHaveLength(1);
    expect(f.events[0]!.kind).toBe('receivable');
  });
});

describe('janela do horizonte', () => {
  it('descarta o que cai depois do horizonte (recebível que só chega tarde demais)', () => {
    const f = fusePlannedIntoProjection(
      // vence 08/10, +10 de atraso = 18/10, já passa do fim (13/10)
      [planned({ kind: 'receivable', amountCents: 100_000, dueOn: '2026-10-08' })],
      CTX,
    );
    expect(f.events).toHaveLength(0);
  });
});
