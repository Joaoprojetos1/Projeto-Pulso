import type { AlertFact } from '@pulso/core';
import { describe, expect, it } from 'vitest';

import type { TextProvider } from '../src/ai/provider';
import {
  OpenAiTextProvider,
  alertWriterFromProvider,
  chatModelFromProvider,
  makeAiModels,
} from '../src/ai/providers';
import { TEMPLATE_VERSION } from '../src/ai/templates';
import { writeAlert } from '../src/ai/writer';

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

/** Provedor de mentira: devolve um texto fixo (não chama rede). */
const fakeProvider = (text: string): TextProvider => ({
  name: 'fake',
  async generate() {
    return { text, modelVersion: 'fake-1' };
  },
});

// ---------------------------------------------------------------
// O PONTO CENTRAL: trocar de IA NÃO afrouxa os fiscais.
// ---------------------------------------------------------------
describe('fiscais valem para QUALQUER provedor (não só Claude)', () => {
  it('texto bom de um provedor não-Anthropic passa', async () => {
    const p = fakeProvider(
      JSON.stringify({
        title: 'Seu caixa pode zerar em 29 de julho',
        body: 'No ritmo de hoje, o dinheiro acaba em 29 de julho. Ainda dá tempo de agir.',
      }),
    );
    const out = await writeAlert(alertWriterFromProvider(p), RUNWAY, PERFIL);
    expect(out.modelVersion).toBe('fake-1');
    expect(out.title).toMatch(/29 de julho/);
  });

  it('provedor que INVENTA número cai no template — o grounding derruba igual', async () => {
    const p = fakeProvider(
      JSON.stringify({
        title: 'Seu caixa pode zerar em 29 de julho',
        body: 'Você vai precisar de R$ 99.000 até lá.', // 99.000 não está em facts
      }),
    );
    const out = await writeAlert(alertWriterFromProvider(p), RUNWAY, PERFIL);
    expect(out.modelVersion).toBe(TEMPLATE_VERSION);
  });

  it('resposta fora do formato { title, body } cai no template', async () => {
    const p = fakeProvider('isto não é JSON');
    const out = await writeAlert(alertWriterFromProvider(p), RUNWAY, PERFIL);
    expect(out.modelVersion).toBe(TEMPLATE_VERSION);
  });
});

// ---------------------------------------------------------------
// Adaptador de chat: achata os turnos, exige resposta não-vazia
// ---------------------------------------------------------------
describe('chatModelFromProvider', () => {
  it('devolve a resposta do provedor', async () => {
    const cm = chatModelFromProvider(fakeProvider('Seus números estão no painel.'));
    const r = await cm.reply({ system: 'S', turns: [{ role: 'user', content: 'e aí?' }] });
    expect(r.text).toBe('Seus números estão no painel.');
    expect(r.modelVersion).toBe('fake-1');
  });

  it('resposta vazia vira erro (askPulso então usa a resposta segura)', async () => {
    const cm = chatModelFromProvider(fakeProvider('   '));
    await expect(cm.reply({ system: 'S', turns: [{ role: 'user', content: 'x' }] })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------
// Provedor OpenAI: monta a requisição certa (fetch injetado)
// ---------------------------------------------------------------
describe('OpenAiTextProvider', () => {
  it('envia system+user, response_format json_schema e lê texto + uso', async () => {
    let capturado: { url: string; body: Record<string, unknown>; auth: unknown } | null = null;
    const fetchMock = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
      capturado = { url, body: JSON.parse(init.body), auth: init.headers.authorization };
      return {
        ok: true,
        json: async () => ({
          model: 'gpt-4o-mini',
          choices: [{ message: { content: '{"title":"t","body":"b"}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 5 },
        }),
      };
    }) as unknown as typeof fetch;

    const p = new OpenAiTextProvider({ apiKey: 'sk-test', fetchFn: fetchMock });
    const r = await p.generate({ system: 'S', user: 'U', jsonSchema: { type: 'object' }, maxTokens: 100 });

    expect(r.text).toBe('{"title":"t","body":"b"}');
    expect(r.usage).toEqual({ model: 'gpt-4o-mini', inputTokens: 12, outputTokens: 5 });
    expect(capturado!.url).toContain('/chat/completions');
    expect(capturado!.auth).toBe('Bearer sk-test');
    expect(capturado!.body.messages).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: 'U' },
    ]);
    expect((capturado!.body.response_format as { type: string }).type).toBe('json_schema');
  });

  it('erro HTTP vira exceção (writeAlert/askPulso então caem no seguro)', async () => {
    const fetchMock = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const p = new OpenAiTextProvider({ apiKey: 'sk-test', fetchFn: fetchMock });
    await expect(p.generate({ system: 'S', user: 'U' })).rejects.toThrow(/500/);
  });
});

// ---------------------------------------------------------------
// Fábrica: escolhe o provedor por ambiente (padrão Claude)
// ---------------------------------------------------------------
describe('makeAiModels', () => {
  it('padrão é anthropic; sem chave, modelos nulos (texto padrão)', () => {
    const m = makeAiModels({});
    expect(m.provider).toBe('anthropic');
    expect(m.alertWriter).toBeNull();
    expect(m.chatModel).toBeNull();
  });

  it('anthropic com chave liga os modelos', () => {
    const m = makeAiModels({ ANTHROPIC_API_KEY: 'sk-ant-teste' });
    expect(m.alertWriter).not.toBeNull();
    expect(m.chatModel).not.toBeNull();
  });

  it('openai sem chave = nulo; com chave, liga via adaptador', () => {
    expect(makeAiModels({ PULSO_AI_PROVIDER: 'openai' }).chatModel).toBeNull();
    const m = makeAiModels({ PULSO_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-openai-teste' });
    expect(m.provider).toBe('openai');
    expect(m.alertWriter).not.toBeNull();
    expect(m.chatModel).not.toBeNull();
  });
});
