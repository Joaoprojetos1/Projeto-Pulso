import { describe, expect, it } from 'vitest';

import { cashProjectionBreakdown } from './breakdown';
import { projectCash } from './indicators';
import { balance, entry, planned, snapshot } from './testkit';

/** Soma dos degraus + saldo de partida (o que a escada desenha de ponta a ponta). */
function fechamento(b: NonNullable<ReturnType<typeof cashProjectionBreakdown>>): number {
  return b.steps.reduce((acc, s) => acc + s.deltaCents, b.openingCents);
}

/** Projeção no mesmo horizonte, para conferir se a escada bate. */
function projetado(snap: Parameters<typeof projectCash>[0], h: number): number | null {
  const p = projectCash(snap, [h]).value;
  return p?.[0]?.projectedCents ?? null;
}

describe('composição da projeção (a escada)', () => {
  it('sem saldo informado não há escada (não desenha zeros)', () => {
    expect(cashProjectionBreakdown(snapshot({ asOf: '2026-06-30' }), 30)).toBeNull();
  });

  it('separa o que entra, o que sai e o peso do custo fixo', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      balances: [balance('2026-06-30', 4_800_000)],
      declaredFixedCostCents: 2_200_000,
      entries: [
        entry({ kind: 'receivable', amountCents: 3_100_000, dueOn: '2026-07-10' }),
        entry({ kind: 'payable', amountCents: 900_000, dueOn: '2026-07-05' }),
        // fora da janela de 30 dias: não pode entrar na escada
        entry({ kind: 'receivable', amountCents: 5_000_000, dueOn: '2026-08-20' }),
      ],
    });

    const b = cashProjectionBreakdown(snap, 30)!;
    expect(b.openingCents).toBe(4_800_000);

    const porChave = Object.fromEntries(b.steps.map((s) => [s.key, s]));
    expect(porChave.a_receber!.deltaCents).toBe(3_100_000);
    expect(porChave.a_receber!.count).toBe(1); // o de agosto ficou de fora
    expect(porChave.a_pagar!.deltaCents).toBe(-900_000);
    expect(porChave.custo_fixo!.deltaCents).toBeLessThan(0);
    expect(porChave.previstas).toBeUndefined(); // não há previstas neste caso
  });

  it('contas previstas do dono viram um degrau próprio', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      balances: [balance('2026-06-30', 1_000_000)],
      planned: [planned({ kind: 'receivable', amountCents: 500_000, dueOn: '2026-07-15' })],
    });
    const b = cashProjectionBreakdown(snap, 30)!;
    const previstas = b.steps.find((s) => s.key === 'previstas');
    expect(previstas?.deltaCents).toBe(500_000);
  });

  // ---------------------------------------------------------------------------
  // O TESTE QUE IMPORTA: a escada é uma segunda leitura do MESMO número. Se ela
  // não fechar com a projeção, o dono vê dois valores diferentes para a mesma
  // coisa — e perde a confiança no produto inteiro.
  // ---------------------------------------------------------------------------
  describe('reconciliação com projectCash (ao centavo)', () => {
    const casos: Array<{ nome: string; snap: ReturnType<typeof snapshot> }> = [
      {
        nome: 'saudável, só saldo e custo fixo',
        snap: snapshot({
          asOf: '2026-06-30',
          balances: [balance('2026-06-30', 4_800_000)],
          declaredFixedCostCents: 2_200_000,
        }),
      },
      {
        nome: 'com recebíveis, pagáveis e atraso médio real',
        snap: snapshot({
          asOf: '2026-06-30',
          balances: [balance('2026-06-30', 2_000_000)],
          declaredFixedCostCents: 1_500_000,
          entries: [
            // liquidados: ensinam o atraso médio (prometeu 30, pagou em 46)
            entry({ kind: 'receivable', amountCents: 1_000_000, dueOn: '2026-05-01', settledOn: '2026-05-17' }),
            entry({ kind: 'receivable', amountCents: 2_000_000, dueOn: '2026-05-10', settledOn: '2026-05-26' }),
            // em aberto
            entry({ kind: 'receivable', amountCents: 3_000_000, dueOn: '2026-07-05' }),
            entry({ kind: 'payable', amountCents: 1_200_000, dueOn: '2026-07-12' }),
          ],
        }),
      },
      {
        nome: 'com contas previstas do dono',
        snap: snapshot({
          asOf: '2026-06-30',
          balances: [balance('2026-06-30', 3_000_000)],
          declaredFixedCostCents: 900_000,
          entries: [entry({ kind: 'payable', amountCents: 400_000, dueOn: '2026-07-20' })],
          planned: [
            planned({ kind: 'receivable', amountCents: 800_000, dueOn: '2026-07-08' }),
            planned({ kind: 'payable', amountCents: 300_000, dueOn: '2026-07-22' }),
          ],
        }),
      },
      {
        nome: 'caixa que zera no meio do caminho',
        snap: snapshot({
          asOf: '2026-06-30',
          balances: [balance('2026-06-30', 500_000)],
          declaredFixedCostCents: 3_000_000,
          entries: [entry({ kind: 'payable', amountCents: 2_000_000, dueOn: '2026-07-10' })],
        }),
      },
    ];

    for (const caso of casos) {
      for (const h of [30, 60, 90]) {
        it(`${caso.nome} — ${h} dias`, () => {
          const b = cashProjectionBreakdown(caso.snap, h)!;
          expect(b).not.toBeNull();
          // a escada fecha nela mesma…
          expect(fechamento(b)).toBe(b.endingCents);
          // …e no mesmo número que a projeção mostra no cartão
          expect(b.endingCents).toBe(projetado(caso.snap, h));
        });
      }
    }
  });
});
