import { allowedClaims, type ClaimEvidence } from '@pulso/core';
import { describe, expect, it } from 'vitest';

import { checkJudgment, renderClaimGuidance } from '../src/ai/judgment';

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

describe('fiscal de juízo', () => {
  it('reprova adjetivo de saúde do caixa quando NÃO autorizado (o bug real)', () => {
    const perms = allowedClaims({ ...NADA, balance: true }); // só o saldo
    const r = checkJudgment('Seu caixa está saudável e sob controle.', perms);
    expect(r.ok).toBe(false);
    expect(r.offending.some((o) => o.claim === 'cash_health')).toBe(true);
  });

  it('aceita o texto que reporta o dado e DECLARA a limitação (sem adjetivar)', () => {
    const perms = allowedClaims({ ...NADA, balance: true });
    const r = checkJudgment(
      'Você tem R$ 15.000 em conta. Ainda não dá para avaliar o caixa: faltam as contas a pagar e a receber.',
      perms,
    );
    expect(r.ok).toBe(true);
  });

  it('com o juízo AUTORIZADO, o mesmo adjetivo passa', () => {
    const perms = allowedClaims({
      ...NADA,
      balance: true,
      futurePayables: true,
      futureReceivables: true,
    });
    expect(checkJudgment('Seu caixa está saudável.', perms).ok).toBe(true);
  });

  it('normaliza acento: "saudável" é pego mesmo declarado como "saudavel"', () => {
    const perms = allowedClaims({ ...NADA, balance: true });
    expect(checkJudgment('Está tudo SAUDÁVEL por aqui.', perms).ok).toBe(false);
  });

  it('sem permissões: sem restrição (retrocompatível)', () => {
    expect(checkJudgment('Seu caixa está saudável.', []).ok).toBe(true);
  });

  it('o guia do prompt lista o que pode e o que não pode ser afirmado', () => {
    const g = renderClaimGuidance(allowedClaims({ ...NADA, balance: true }));
    expect(g).toMatch(/NÃO PODE afirmar/);
    expect(g).toMatch(/saúde do caixa/);
  });
});
