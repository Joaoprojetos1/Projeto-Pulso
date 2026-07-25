import { describe, expect, it } from 'vitest';

import { sanitizeUserMessage } from '../src/services/conversation';

const NUL = String.fromCharCode(0); // byte nulo
const BEL = String.fromCharCode(7); // caractere de controle

describe('sanitizeUserMessage (higiene contra prompt injection)', () => {
  it('remove bytes nulos e caracteres de controle, mantém quebra de linha e tab', () => {
    const entrada = `ola${NUL} mundo${BEL}!\ncom\ttab`;
    const saida = sanitizeUserMessage(entrada);
    expect(saida.includes(NUL)).toBe(false);
    expect(saida.includes(BEL)).toBe(false);
    expect(saida.includes('\n')).toBe(true);
    expect(saida.includes('\t')).toBe(true);
  });

  it('impõe teto de 2000 caracteres', () => {
    expect(sanitizeUserMessage('a'.repeat(5000)).length).toBe(2000);
  });

  it('faz trim das pontas', () => {
    expect(sanitizeUserMessage('   oi   ')).toBe('oi');
  });
});
