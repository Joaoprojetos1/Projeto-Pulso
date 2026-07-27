import { describe, expect, it } from 'vitest';

import {
  coverageFor,
  coverageSummary,
  indicatorsNeedingClientSystem,
  presentFieldsFromSnapshot,
} from './coverage';
import { effectiveRequirement, indicatorRequirements, type CanonicalField } from './requirements';
import type { CompanySnapshot } from './types';

const ALL_FIELDS: CanonicalField[] = [
  'entry.kind',
  'entry.amount',
  'entry.issuedOn',
  'entry.dueOn',
  'entry.settledOn',
  'entry.counterparty',
  'entry.category',
  'entry.costType',
  'balance.observed',
  'declared.fixedCost',
];

const status = (items: ReturnType<typeof coverageFor>, key: string) =>
  items.find((i) => i.key === key)!.status;

describe('cobertura de dados', () => {
  it('dados completos: nenhum indicador bloqueado', () => {
    const cov = coverageFor(new Set(ALL_FIELDS));
    for (const item of cov.filter((i) => i.kind === 'indicator')) {
      expect(item.status, item.key).not.toBe('blocked');
    }
    const sum = coverageSummary(new Set(ALL_FIELDS));
    expect(sum.indicators.blocked).toBe(0);
  });

  it('apenas saldo informado: caixa completo, projeção parcial, o resto bloqueado', () => {
    const cov = coverageFor(new Set<CanonicalField>(['balance.observed']));
    expect(status(cov, 'cash_balance')).toBe('complete');
    // projeção calcula só com o saldo, mas perde precisão sem lançamentos
    expect(status(cov, 'cash_projection')).toBe('partial');
    expect(status(cov, 'pmr')).toBe('blocked');
    expect(status(cov, 'ncg')).toBe('blocked');
    expect(status(cov, 'contribution_margin')).toBe('blocked');

    // o bloqueio aponta o campo que falta e onde consegui-lo
    const pmr = cov.find((i) => i.key === 'pmr')!;
    expect(pmr.missingRequired).toContain('entry.issuedOn');
    expect(pmr.remedies.find((r) => r.field === 'entry.issuedOn')!.sources.length).toBeGreaterThan(0);
  });

  it('só extrato, sem prazos: bloqueia prazos e margem, mantém o lado do caixa', () => {
    // extrato entrega saldo, valor, tipo e a data de PAGAMENTO — nunca competência/vencimento/natureza
    const extrato = new Set<CanonicalField>([
      'balance.observed',
      'entry.kind',
      'entry.amount',
      'entry.settledOn',
    ]);
    const cov = coverageFor(extrato);

    expect(status(cov, 'cash_balance')).toBe('complete');
    expect(status(cov, 'ncg')).toBe('complete'); // aberto/pago + valor + tipo: dá para o giro
    expect(status(cov, 'pmr')).toBe('blocked'); // falta a competência
    expect(status(cov, 'pmp')).toBe('blocked');
    expect(status(cov, 'contribution_margin')).toBe('blocked'); // falta fixo/variável
    expect(status(cov, 'delinquency_rate')).toBe('blocked'); // falta o vencimento

    const margin = cov.find((i) => i.key === 'contribution_margin')!;
    expect(margin.missingRequired).toContain('entry.costType');
  });

  it('campo opcional ausente deixa o indicador parcial, não bloqueado', () => {
    // projeção tem o obrigatório (saldo) mas falta um opcional (vencimentos)
    const semVencimento = new Set<CanonicalField>([
      'balance.observed',
      'entry.kind',
      'entry.amount',
      'entry.settledOn',
      'entry.issuedOn',
      'entry.costType',
    ]);
    const cov = coverageFor(semVencimento);
    const proj = cov.find((i) => i.key === 'cash_projection')!;
    expect(proj.status).toBe('partial');
    expect(proj.missingRequired).toHaveLength(0);
    expect(proj.missingOptional).toContain('entry.dueOn');
  });

  it('custo fixo aceita o caminho declarado OU o derivado (anyOf)', () => {
    const soDeclarado = coverageFor(new Set<CanonicalField>(['declared.fixedCost']));
    expect(status(soDeclarado, 'fixed_cost_monthly')).toBe('complete');

    const soClassificado = coverageFor(
      new Set<CanonicalField>(['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.costType']),
    );
    expect(status(soClassificado, 'fixed_cost_monthly')).toBe('complete');

    const nenhum = coverageFor(new Set<CanonicalField>(['entry.kind', 'entry.amount']));
    expect(status(nenhum, 'fixed_cost_monthly')).toBe('blocked');
  });

  it('presentFieldsFromSnapshot reflete o que os dados realmente têm', () => {
    const snap: CompanySnapshot = {
      asOf: '2026-07-01',
      balances: [{ observedOn: '2026-07-01', balanceCents: 1000 }],
      entries: [
        {
          id: '1',
          kind: 'receivable',
          amountCents: 5000,
          issuedOn: '2026-06-01',
          dueOn: '2026-07-01',
          settledOn: null, // em aberto → settledOn NÃO presente
          counterparty: 'Cliente A',
        },
      ],
    };
    const present = presentFieldsFromSnapshot(snap);
    expect(present.has('balance.observed')).toBe(true);
    expect(present.has('entry.counterparty')).toBe(true);
    expect(present.has('entry.settledOn')).toBe(false);
    expect(present.has('entry.costType')).toBe(false);
    expect(present.has('declared.fixedCost')).toBe(false);
  });

  it('todo indicador do motor tem requisito declarado', () => {
    // integridade: as declarações não podem sair de sincronia com os keys
    const keys = indicatorRequirements().map((r) => r.key);
    for (const k of keys) expect(effectiveRequirement(k).required).toBeDefined();
    expect(keys).toContain('cash_projection');
    expect(keys).toContain('delinquency_rate');
  });

  it('reporta os indicadores que dependem de dado sem fonte ampla', () => {
    const report = indicatorsNeedingClientSystem();
    // a classificação fixo/variável só vem do ERP do cliente → margem, ponto de
    // equilíbrio e custo fixo caem aqui
    const keys = report.indicators.map((i) => i.key);
    expect(keys).toContain('contribution_margin');
    expect(keys).toContain('break_even_revenue');
    expect(report.count).toBeGreaterThan(0);
  });
});
