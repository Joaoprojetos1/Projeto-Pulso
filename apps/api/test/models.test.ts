import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * models.ts lê as variáveis de ambiente no momento em que é importado, então
 * cada caso reseta os módulos e reimporta com o ambiente que quer testar.
 */
describe('modelo de IA por superfície', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('padrões: alerta no Opus, conversa no Sonnet', async () => {
    vi.stubEnv('PULSO_ALERT_MODEL', undefined);
    vi.stubEnv('PULSO_CHAT_MODEL', undefined);
    vi.resetModules();
    const { ALERT_MODEL, CHAT_MODEL } = await import('../src/ai/models');
    expect(ALERT_MODEL).toBe('claude-opus-4-8');
    expect(CHAT_MODEL).toBe('claude-sonnet-4-6');
  });

  it('cada superfície troca de modelo pela sua própria variável', async () => {
    vi.stubEnv('PULSO_ALERT_MODEL', 'claude-opus-4-7');
    vi.stubEnv('PULSO_CHAT_MODEL', 'claude-haiku-4-5');
    vi.resetModules();
    const { ALERT_MODEL, CHAT_MODEL } = await import('../src/ai/models');
    expect(ALERT_MODEL).toBe('claude-opus-4-7');
    expect(CHAT_MODEL).toBe('claude-haiku-4-5');
  });
});
