import type { AlertFact } from '@pulso/core';
import { describe, expect, it, vi } from 'vitest';

import { formatCentsBRL, formatDateBR, formatPercent } from '../src/ai/format';
import { checkGrounding } from '../src/ai/grounding';
import { TEMPLATE_VERSION, templateFor } from '../src/ai/templates';
import { buildPrompt, writeAlert, type AlertWriterModel } from '../src/ai/writer';

const PERFIL = { name: 'Clínica Horizonte', niche: 'clinica' };

const RUNWAY: AlertFact = {
  ruleKey: 'cash_runway',
  severity: 'critical',
  facts: {
    zeroOn: '2026-07-29',
    openingBalanceCents: 1_500_000,
    avgLatenessDays: 12,
    pmrDays: 46,
    pmpDays: 0,
    monthlyFixedCostCents: 3_420_000,
  },
};

const SCISSOR: AlertFact = {
  ruleKey: 'scissor',
  severity: 'warn',
  facts: {
    revenueGrowthRatio: 0.136,
    revenueCurrentCents: 6_680_000,
    revenuePreviousCents: 5_880_000,
    ncgCents: 5_280_000,
    ncgOverRevenue: 0.79,
    pmrDays: 46,
    pmpDays: 0,
  },
};

function mockModel(title: string, body: string): AlertWriterModel & { write: ReturnType<typeof vi.fn> } {
  return {
    write: vi.fn(async () => ({ title, body, modelVersion: 'mock-model-1' })),
  };
}

// ---------------------------------------------------------------
// O fiscal de números
// ---------------------------------------------------------------
describe('checkGrounding', () => {
  it('aceita números de facts em todas as formas usuais', () => {
    const texto =
      'Seu caixa de R$ 15.000 zera em 29 de julho. Você recebe 46 dias depois de atender.';
    expect(checkGrounding(texto, RUNWAY.facts).ok).toBe(true);
  });

  it('aceita percentual arredondado e com vírgula vindos de um ratio', () => {
    expect(checkGrounding('Sua receita cresceu 14%.', SCISSOR.facts).ok).toBe(true);
    expect(checkGrounding('Sua receita cresceu 13,6%.', SCISSOR.facts).ok).toBe(true);
  });

  it('aceita reais em milhar formatado e em "mil"', () => {
    expect(checkGrounding('Há R$ 52.800 presos a receber.', SCISSOR.facts).ok).toBe(true);
    expect(checkGrounding('Há R$ 52,8 mil presos a receber.', SCISSOR.facts).ok).toBe(true);
  });

  it('REJEITA número que não está em facts — a regra que define o produto', () => {
    const r = checkGrounding('Seu caixa de R$ 99.000 zera em 29 de julho.', RUNWAY.facts);
    expect(r.ok).toBe(false);
    expect(r.offending).toContain(99_000);
  });

  it('rejeita data trocada', () => {
    expect(checkGrounding('Seu caixa zera em 30 de julho.', RUNWAY.facts).ok).toBe(false);
  });

  it('rejeita percentual inventado', () => {
    expect(checkGrounding('Sua receita cresceu 25%.', SCISSOR.facts).ok).toBe(false);
  });
});

// ---------------------------------------------------------------
// O prompt: só facts + perfil entram. Nada mais.
// ---------------------------------------------------------------
describe('buildPrompt', () => {
  it('o conteúdo do usuário é EXATAMENTE facts + perfil — sem dado bruto', () => {
    const prompt = buildPrompt(RUNWAY, PERFIL);
    expect(JSON.parse(prompt.user)).toEqual({
      ruleKey: 'cash_runway',
      severity: 'critical',
      facts: RUNWAY.facts,
      empresa: { nome: 'Clínica Horizonte', nicho: 'clinica' },
    });
  });

  it('as regras duras estão no system prompt', () => {
    const prompt = buildPrompt(RUNWAY, PERFIL);
    expect(prompt.system).toMatch(/APENAS números presentes em "facts"/);
    expect(prompt.system).toMatch(/NÃO calcule/);
    expect(prompt.system).toMatch(/NO MÁXIMO 2 frases/);
  });
});

// ---------------------------------------------------------------
// writeAlert: o fluxo com modelo mockado
// ---------------------------------------------------------------
describe('writeAlert', () => {
  it('texto bom do modelo passa direto', async () => {
    const model = mockModel(
      'Seu caixa pode zerar em 29 de julho',
      'No ritmo de hoje, o dinheiro acaba em 29 de julho. Ainda dá tempo de agir.',
    );
    const out = await writeAlert(model, RUNWAY, PERFIL);
    expect(out.modelVersion).toBe('mock-model-1');
    expect(out.title).toMatch(/29 de julho/);
    expect(model.write).toHaveBeenCalledTimes(1);
  });

  it('modelo que INVENTA número: retry e depois cai no template', async () => {
    const model = mockModel(
      'Seu caixa pode zerar em 29 de julho',
      'Você vai precisar de R$ 99.000 até lá.', // 99.000 não está em facts
    );
    const out = await writeAlert(model, RUNWAY, PERFIL);
    expect(model.write).toHaveBeenCalledTimes(2); // uma segunda chance
    expect(out.modelVersion).toBe(TEMPLATE_VERSION); // e o template assume
    expect(checkGrounding(`${out.title}\n${out.body}`, RUNWAY.facts).ok).toBe(true);
  });

  it('body com mais de 2 frases é rejeitado', async () => {
    const model = mockModel(
      'Seu caixa pode zerar em 29 de julho',
      'O caixa zera em 29 de julho. Isso é grave. Fale com seu contador.',
    );
    const out = await writeAlert(model, RUNWAY, PERFIL);
    expect(out.modelVersion).toBe(TEMPLATE_VERSION);
  });

  it('modelo que dá erro: cai no template sem quebrar', async () => {
    const model: AlertWriterModel = {
      write: async () => {
        throw new Error('API fora do ar');
      },
    };
    const out = await writeAlert(model, RUNWAY, PERFIL);
    expect(out.modelVersion).toBe(TEMPLATE_VERSION);
    expect(out.title).toBeTruthy();
  });

  it('sem modelo (sem chave de API): usa o template', async () => {
    const out = await writeAlert(null, RUNWAY, PERFIL);
    expect(out.modelVersion).toBe(TEMPLATE_VERSION);
    expect(out.title).toMatch(/29 de julho/);
  });
});

// ---------------------------------------------------------------
// Medição: onUsage registra CADA chamada, inclusive a reprovada
// ---------------------------------------------------------------
describe('writeAlert — medição de consumo (onUsage)', () => {
  function modelComUsage(
    title: string,
    body: string,
    usage = { model: 'claude-opus-4-8', inputTokens: 120, outputTokens: 30 },
  ): AlertWriterModel {
    return { write: vi.fn(async () => ({ title, body, modelVersion: usage.model, usage })) };
  }

  it('texto bom: uma chamada, um registro de consumo', async () => {
    const usos: unknown[] = [];
    const model = modelComUsage(
      'Seu caixa pode zerar em 29 de julho',
      'No ritmo de hoje, o dinheiro acaba em 29 de julho. Ainda dá tempo de agir.',
    );
    await writeAlert(model, RUNWAY, PERFIL, (u) => usos.push(u));
    expect(usos).toEqual([{ model: 'claude-opus-4-8', inputTokens: 120, outputTokens: 30 }]);
  });

  it('modelo que INVENTA número: as DUAS chamadas contam, mesmo caindo no template', async () => {
    const usos: unknown[] = [];
    const model = modelComUsage(
      'Seu caixa pode zerar em 29 de julho',
      'Você vai precisar de R$ 99.000 até lá.', // reprovado pelo fiscal
    );
    const out = await writeAlert(model, RUNWAY, PERFIL, (u) => usos.push(u));
    expect(out.modelVersion).toBe(TEMPLATE_VERSION); // o texto foi descartado
    expect(usos).toHaveLength(2); // mas o token das duas tentativas foi gasto e medido
  });

  it('template (sem modelo) não gera consumo', async () => {
    const usos: unknown[] = [];
    await writeAlert(null, RUNWAY, PERFIL, (u) => usos.push(u));
    expect(usos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------
// Os templates são corretos por construção
// ---------------------------------------------------------------
describe('templates', () => {
  const CASOS: AlertFact[] = [
    RUNWAY,
    SCISSOR,
    {
      ruleKey: 'revenue_drop_fixed_cost',
      severity: 'warn',
      facts: {
        revenueDropRatio: 0.12,
        revenueCurrentCents: 5_000_000,
        revenuePreviousCents: 5_700_000,
        monthlyFixedCostCents: 2_590_000,
        fixedCostOverRevenue: 0.518,
      },
    },
    {
      ruleKey: 'concentration',
      severity: 'warn',
      facts: { topCustomerShare: 0.486, topCustomer: 'Unimed Regional', customerCount: 6 },
    },
    {
      ruleKey: 'all_clear',
      severity: 'ok',
      facts: { cashBalanceCents: 8_000_000, cashCycleDays: 16, revenueCurrentCents: 6_000_000 },
    },
  ];

  it.each(CASOS.map((c) => [c.ruleKey, c] as const))(
    '%s: template passa no fiscal de números e tem no máximo 2 frases',
    (_key, alert) => {
      const t = templateFor(alert);
      expect(checkGrounding(`${t.title}\n${t.body}`, alert.facts).ok).toBe(true);
      const frases = t.body.split(/[.!?]+(?=\s|$)/).filter((s) => s.trim().length > 0);
      expect(frases.length).toBeLessThanOrEqual(2);
    },
  );

  it('regra desconhecida ganha um texto genérico sem números', () => {
    const t = templateFor({ ruleKey: 'regra_nova', severity: 'warn', facts: {} });
    expect(checkGrounding(`${t.title}\n${t.body}`, {}).ok).toBe(true);
  });
});

// ---------------------------------------------------------------
// Formatação de apresentação
// ---------------------------------------------------------------
describe('format', () => {
  it('centavos para reais pt-BR', () => {
    expect(formatCentsBRL(1_500_000).replace(/ /g, ' ')).toBe('R$ 15.000');
    expect(formatCentsBRL(123_456).replace(/ /g, ' ')).toBe('R$ 1.234,56');
  });

  it('data ISO para dia por extenso', () => {
    expect(formatDateBR('2026-07-29')).toBe('29 de julho');
    expect(formatDateBR('2026-01-05')).toBe('5 de janeiro');
  });

  it('ratio para percentual', () => {
    expect(formatPercent(0.136)).toBe('14%');
    expect(formatPercent(0.5)).toBe('50%');
  });
});
