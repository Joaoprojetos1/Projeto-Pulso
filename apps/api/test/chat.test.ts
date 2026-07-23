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
    const usage = { model: 'claude-opus-4-8', inputTokens: 340, outputTokens: 88 };
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
    const usage = { model: 'claude-opus-4-8', inputTokens: 340, outputTokens: 90 };
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
