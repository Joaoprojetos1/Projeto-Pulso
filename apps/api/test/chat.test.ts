import { describe, expect, it, vi } from 'vitest';

import {
  askPulso,
  buildChatPrompt,
  CHAT_FALLBACK_VERSION,
  NO_MODEL_REPLY,
  SAFE_REPLY,
  type ChatContext,
  type ChatModel,
} from '../src/ai/chat';
import { checkGroundingDeep } from '../src/ai/grounding';

const CTX: ChatContext = {
  profile: { name: 'Clínica Horizonte', niche: 'clinica' },
  asOf: '2026-07-15',
  indicators: {
    cash_balance: { key: 'cash_balance', value: 1_500_000, unit: 'cents', inputs: {} },
    pmr: { key: 'pmr', value: 36, unit: 'days', inputs: { settledCount: 22 } },
    cash_projection: {
      key: 'cash_projection',
      value: [{ horizonDays: 30, projectedCents: 3_360_000, zeroOn: '2026-07-29' }],
      unit: 'cents',
      inputs: { monthlyFixedCostCents: 3_420_000 },
    },
  },
  alerts: [
    {
      ruleKey: 'cash_runway',
      severity: 'critical',
      facts: { zeroOn: '2026-07-29', openingBalanceCents: 1_500_000 },
      title: 'Seu caixa pode zerar em 29 de julho',
      body: null,
    },
  ],
};

function mockModel(text: string): ChatModel & { reply: ReturnType<typeof vi.fn> } {
  return { reply: vi.fn(async () => ({ text, modelVersion: 'mock-chat-1' })) };
}

describe('fiscal profundo (checkGroundingDeep)', () => {
  it('aceita números vindos de qualquer canto do retrato', () => {
    const ok = checkGroundingDeep(
      'Seu caixa de R$ 15.000 zera em 29 de julho; você recebe em 36 dias e o custo fixo é R$ 34.200.',
      CTX,
    );
    expect(ok.ok).toBe(true);
  });

  it('libera inteiros pequenos de enumeração ("3 caminhos")', () => {
    expect(checkGroundingDeep('Há 3 caminhos e 2 prioridades.', CTX).ok).toBe(true);
  });

  it('REJEITA valor financeiro inventado', () => {
    const r = checkGroundingDeep('Você precisa de R$ 80.000 emprestados.', CTX);
    expect(r.ok).toBe(false);
    expect(r.offending).toContain(80_000);
  });
});

describe('buildChatPrompt', () => {
  it('o retrato entra no system e contém SÓ indicadores + alertas + perfil', () => {
    const p = buildChatPrompt(CTX, [{ role: 'user', content: 'Como está meu caixa?' }]);
    expect(p.system).toMatch(/RETRATO DO NEGÓCIO/);
    expect(p.system).toMatch(/Clínica Horizonte/);
    expect(p.system).toMatch(/cash_balance/);
    // nenhum vestígio de lançamento bruto
    expect(p.system).not.toMatch(/entries|lançamento|settledOn|issuedOn/);
  });

  it('conversa começa sempre num turno do usuário', () => {
    const p = buildChatPrompt(CTX, [
      { role: 'assistant', content: 'Olá!' },
      { role: 'user', content: 'Oi' },
    ]);
    expect(p.turns[0]!.role).toBe('user');
  });
});

describe('askPulso', () => {
  const pergunta = [{ role: 'user' as const, content: 'O que eu faço para não zerar o caixa?' }];

  it('resposta com números do retrato passa', async () => {
    const model = mockModel(
      'Seu caixa zera em 29 de julho. Vale negociar prazo com fornecedores e rever os 36 dias de recebimento.',
    );
    const out = await askPulso(model, CTX, pergunta);
    expect(out.modelVersion).toBe('mock-chat-1');
    expect(model.reply).toHaveBeenCalledTimes(1);
  });

  it('resposta com número inventado: retry e resposta segura', async () => {
    const model = mockModel('Pegue um empréstimo de R$ 80.000 e resolva.');
    const out = await askPulso(model, CTX, pergunta);
    expect(model.reply).toHaveBeenCalledTimes(2);
    expect(out.text).toBe(SAFE_REPLY);
    expect(out.modelVersion).toBe(CHAT_FALLBACK_VERSION);
  });

  it('modelo com erro: resposta segura, sem quebrar', async () => {
    const model: ChatModel = {
      reply: async () => {
        throw new Error('API fora do ar');
      },
    };
    const out = await askPulso(model, CTX, pergunta);
    expect(out.text).toBe(SAFE_REPLY);
  });

  it('sem modelo (sem chave): aviso honesto', async () => {
    const out = await askPulso(null, CTX, pergunta);
    expect(out.text).toBe(NO_MODEL_REPLY);
  });

  it('medição: resposta boa registra uma chamada de consumo', async () => {
    const usos: unknown[] = [];
    const usage = { model: 'claude-sonnet-4-6', inputTokens: 340, outputTokens: 88 };
    const model: ChatModel = {
      reply: vi.fn(async () => ({
        text: 'Seu caixa zera em 29 de julho. Vale rever os 36 dias de recebimento.',
        modelVersion: usage.model,
        usage,
      })),
    };
    await askPulso(model, CTX, pergunta, (u) => usos.push(u));
    expect(usos).toEqual([usage]);
  });

  it('medição: número inventado descarta a resposta mas conta as DUAS chamadas', async () => {
    const usos: unknown[] = [];
    const usage = { model: 'claude-sonnet-4-6', inputTokens: 340, outputTokens: 90 };
    const model: ChatModel = {
      reply: vi.fn(async () => ({
        text: 'Pegue um empréstimo de R$ 80.000 e resolva.',
        modelVersion: usage.model,
        usage,
      })),
    };
    const out = await askPulso(model, CTX, pergunta, (u) => usos.push(u));
    expect(out.text).toBe(SAFE_REPLY);
    expect(usos).toHaveLength(2);
  });
});

describe('memória: teto de tokens', () => {
  it('corta o histórico mais antigo, preserva o retrato e a pergunta atual', () => {
    const turns = Array.from({ length: 18 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: 'x'.repeat(400) + ` #${i}`,
    }));
    turns.push({ role: 'user', content: 'pergunta atual' });

    const p = buildChatPrompt(CTX, turns, { tokenBudget: 500, historyN: 30 });
    // o retrato (indicadores) nunca é cortado
    expect(p.system).toMatch(/RETRATO DO NEGÓCIO/);
    expect(p.system).toMatch(/cash_balance/);
    // sobrou pouco histórico e a pergunta ATUAL foi preservada
    expect(p.turns.length).toBeLessThan(turns.length);
    expect(p.turns[p.turns.length - 1]!.content).toBe('pergunta atual');
    // as mais antigas saíram
    expect(p.turns.some((t) => t.content.includes('#0'))).toBe(false);
  });
});

describe('memória: contexto e grounding', () => {
  it('o retrato inclui alertas recentes e o diagnóstico atual/anterior', () => {
    const p = buildChatPrompt(
      {
        ...CTX,
        recentAlerts: [
          { ruleKey: 'scissor', severity: 'warn', facts: { ncgCents: 5_280_000 }, title: 'Efeito tesoura', body: null },
        ],
        diagnosisCurrent: { asOf: '2026-07-15', stage: 'pressao', facts: {}, text: { title: 'Sob pressão' } },
        diagnosisPrevious: { asOf: '2026-06-15', stage: 'atencao', facts: {}, text: { title: 'Atenção' } },
      },
      [{ role: 'user', content: 'e comparado ao mês passado?' }],
    );
    expect(p.system).toMatch(/alertasRecentes/);
    expect(p.system).toMatch(/diagnosticoAtual/);
    expect(p.system).toMatch(/diagnosticoAnterior/);
    expect(p.system).toMatch(/pressao/);
  });

  it('o fiscal libera um número que só existe num alerta enviado antes', async () => {
    const ctx: ChatContext = {
      profile: { name: 'Clínica X', niche: 'clinica' },
      asOf: '2026-07-15',
      indicators: {},
      alerts: [],
      recentAlerts: [
        { ruleKey: 'cash_runway', severity: 'critical', facts: { openingBalanceCents: 1_500_000 }, title: null, body: null },
      ],
    };
    const model: ChatModel = {
      reply: async () => ({ text: 'No último alerta, seu caixa era de R$ 15.000.', modelVersion: 'm' }),
    };
    const out = await askPulso(model, ctx, [{ role: 'user', content: 'quanto era?' }]);
    expect(out.modelVersion).toBe('m'); // 15.000 (de 1.500.000 centavos) veio do alerta recente
  });
});
