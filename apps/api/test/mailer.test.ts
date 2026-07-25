import { afterEach, describe, expect, it } from 'vitest';

import { LogMailer, maskEmail } from '../src/mailer';

const TOKEN = 'segredo-de-redefinicao-123456';
const MSG = {
  to: 'dona@empresa.com.br',
  subject: 'Redefinir sua senha do Pulso',
  text: `Use este código no app: ${TOKEN}`,
};

describe('LogMailer (LGPD: não vaza token no log)', () => {
  afterEach(() => {
    delete process.env.PULSO_LOG_EMAILS;
  });

  it('por padrão NÃO registra o corpo (token) nem o e-mail completo', async () => {
    const linhas: string[] = [];
    await new LogMailer((l) => linhas.push(l)).send(MSG);

    const saida = linhas.join('\n');
    expect(saida).not.toContain(TOKEN);
    expect(saida).not.toContain('dona@empresa.com.br');
    expect(saida).toContain('corpo omitido');
  });

  it('com PULSO_LOG_EMAILS=1 imprime tudo (depuração local explícita)', async () => {
    process.env.PULSO_LOG_EMAILS = '1';
    const linhas: string[] = [];
    await new LogMailer((l) => linhas.push(l)).send(MSG);
    expect(linhas.join('\n')).toContain(TOKEN);
  });
});

describe('maskEmail', () => {
  it('mantém a primeira letra e o domínio, oculta o resto', () => {
    expect(maskEmail('dona@empresa.com.br')).toBe('d***@empresa.com.br');
    expect(maskEmail('x')).toBe('***');
  });
});
