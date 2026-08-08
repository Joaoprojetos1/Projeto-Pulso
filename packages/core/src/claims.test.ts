import { describe, expect, it } from 'vitest';

import {
  allowedClaims,
  allowedClaimTypes,
  claimEvidenceFromSnapshot,
  missingInfoRecommendations,
  MIN_SETTLED_RECEIVABLES,
  type ClaimEvidence,
  type ClaimType,
} from './claims';
import type { CompanySnapshot, Entry } from './types';

/** Evidência "tudo falso" como base; os testes ligam só o que o caso tem. */
const NADA: ClaimEvidence = {
  balance: false,
  futurePayables: false,
  futureReceivables: false,
  settledReceivables: false,
  revenue: false,
  periodCosts: false,
  previousPeriod: false,
  segmentOps: false,
};

const permOf = (perms: ReturnType<typeof allowedClaims>, type: ClaimType) =>
  perms.find((p) => p.type === type)!;

describe('requisitos de juízo (claims)', () => {
  it('só o saldo informado: nenhum juízo de caixa é autorizado', () => {
    const perms = allowedClaims({ ...NADA, balance: true });

    // o bug real: "está bom" só com o saldo. Aqui isso é PROIBIDO.
    const saude = permOf(perms, 'cash_health');
    expect(saude.allowed).toBe(false);
    expect(saude.missing).toContain('futurePayables');
    expect(saude.missing).toContain('futureReceivables');
    expect(saude.reason).toMatch(/não é possível avaliar a saúde do caixa/i);

    // e a data de zeragem também depende das saídas futuras
    expect(permOf(perms, 'cash_zero_date').allowed).toBe(false);
    expect(allowedClaimTypes({ ...NADA, balance: true })).toHaveLength(0);
  });

  it('saldo + contas a pagar: dá para falar de zeragem, mas NÃO da saúde do caixa', () => {
    const perms = allowedClaims({ ...NADA, balance: true, futurePayables: true });

    // zeragem exige saldo + saídas futuras — autorizada
    expect(permOf(perms, 'cash_zero_date').allowed).toBe(true);

    // saúde do caixa exige TAMBÉM as contas a receber — segue proibida
    const saude = permOf(perms, 'cash_health');
    expect(saude.allowed).toBe(false);
    expect(saude.missing).toEqual(['futureReceivables']);
  });

  it('dados completos: os juízos de caixa ficam autorizados', () => {
    const completo: ClaimEvidence = {
      ...NADA,
      balance: true,
      futurePayables: true,
      futureReceivables: true,
      revenue: true,
      periodCosts: true,
      settledReceivables: true,
      previousPeriod: true,
    };
    const perms = allowedClaims(completo);
    expect(permOf(perms, 'cash_health').allowed).toBe(true);
    expect(permOf(perms, 'cash_zero_date').allowed).toBe(true);
    expect(permOf(perms, 'margin').allowed).toBe(true);
    expect(permOf(perms, 'receivable_term').allowed).toBe(true);
    expect(permOf(perms, 'period_comparison').allowed).toBe(true);
    // sem dado operacional, o juízo de segmento continua bloqueado
    expect(permOf(perms, 'segment_operational').allowed).toBe(false);
  });

  it('segmento sem dado operacional: o juízo de operação fica bloqueado, com recomendação', () => {
    const evidence: ClaimEvidence = {
      ...NADA,
      balance: true,
      futurePayables: true,
      futureReceivables: true,
    };
    const seg = permOf(allowedClaims(evidence), 'segment_operational');
    expect(seg.allowed).toBe(false);
    expect(seg.missing).toEqual(['segmentOps']);

    const recs = missingInfoRecommendations(evidence);
    expect(recs.some((r) => r.claimType === 'segment_operational')).toBe(true);
    // toda recomendação orienta a ação (não só aponta a falta)
    for (const r of recs) expect(r.action.length).toBeGreaterThan(0);
  });

  it('recomendações vêm ordenadas por prioridade (o caixa antes do resto)', () => {
    const recs = missingInfoRecommendations({ ...NADA }); // nada informado: tudo bloqueado
    expect(recs.length).toBeGreaterThan(0);
    // a saúde do caixa (prioridade alta) vem antes de comparação/segmento
    const iCaixa = recs.findIndex((r) => r.claimType === 'cash_health');
    const iComp = recs.findIndex((r) => r.claimType === 'period_comparison');
    expect(iCaixa).toBeGreaterThanOrEqual(0);
    expect(iCaixa).toBeLessThan(iComp);
  });
});

describe('derivação das evidências a partir do snapshot', () => {
  const entry = (over: Partial<Entry>): Entry => ({
    id: Math.random().toString(36).slice(2),
    kind: 'receivable',
    amountCents: 10_000,
    issuedOn: '2026-08-01',
    dueOn: '2026-08-10',
    settledOn: null,
    ...over,
  });

  const snap = (over: Partial<CompanySnapshot>): CompanySnapshot => ({
    asOf: '2026-08-06',
    entries: [],
    balances: [],
    ...over,
  });

  it('só o saldo: apenas `balance`', () => {
    const ev = claimEvidenceFromSnapshot(
      snap({ balances: [{ observedOn: '2026-08-06', balanceCents: 1_000_000 }] }),
    );
    expect(ev.balance).toBe(true);
    expect(ev.futurePayables).toBe(false);
    expect(ev.futureReceivables).toBe(false);
  });

  it('conta a pagar em aberto vira saída futura; conta a receber prevista vira entrada futura', () => {
    const ev = claimEvidenceFromSnapshot(
      snap({
        balances: [{ observedOn: '2026-08-06', balanceCents: 1_000_000 }],
        entries: [entry({ kind: 'payable', settledOn: null })],
        planned: [
          {
            id: 'p1',
            kind: 'receivable',
            amountCents: 5_000,
            dueOn: '2026-09-01',
            recurrence: 'none',
            status: 'prevista',
            confirmedOn: null,
          },
        ],
      }),
    );
    expect(ev.futurePayables).toBe(true);
    expect(ev.futureReceivables).toBe(true);
  });

  it('prazo de recebimento exige recebimentos liquidados suficientes', () => {
    const poucos = Array.from({ length: MIN_SETTLED_RECEIVABLES - 1 }, (_, i) =>
      entry({ kind: 'receivable', settledOn: '2026-08-05', id: `r${i}` }),
    );
    expect(claimEvidenceFromSnapshot(snap({ entries: poucos })).settledReceivables).toBe(false);

    const suficientes = Array.from({ length: MIN_SETTLED_RECEIVABLES }, (_, i) =>
      entry({ kind: 'receivable', settledOn: '2026-08-05', id: `r${i}` }),
    );
    expect(claimEvidenceFromSnapshot(snap({ entries: suficientes })).settledReceivables).toBe(true);
  });

  it('período anterior: um lançamento de mês anterior habilita a comparação', () => {
    const ev = claimEvidenceFromSnapshot(
      snap({ entries: [entry({ issuedOn: '2026-07-01' })] }),
    );
    expect(ev.previousPeriod).toBe(true);
  });

  it('dado operacional do segmento exige nicho E números do mês', () => {
    expect(claimEvidenceFromSnapshot(snap({ monthlyOps: [{ month: '2026-08', field: 'x', value: 1 }] })).segmentOps).toBe(false); // sem niche
    expect(
      claimEvidenceFromSnapshot(
        snap({ niche: 'clinica', monthlyOps: [{ month: '2026-08', field: 'x', value: 1 }] }),
      ).segmentOps,
    ).toBe(true);
  });
});
