import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { makeRateLimiter } from '../src/ratelimit';

function fakeReq(ip = '1.2.3.4'): FastifyRequest {
  return { ip, headers: {}, log: { warn: () => {} } } as unknown as FastifyRequest;
}
function fakeReply() {
  const state = { status: 0 };
  const r = {
    code(c: number) {
      state.status = c;
      return r;
    },
    send() {
      return r;
    },
    statusOf: () => state.status,
  };
  return r as unknown as FastifyReply & { statusOf: () => number };
}

describe('makeRateLimiter', () => {
  it('deixa passar até o limite e bloqueia depois (429)', () => {
    const rl = makeRateLimiter({ windowMs: 60_000, max: 2, name: 't' });
    const req = fakeReq();
    expect(rl.check(req, fakeReply())).toBe(false); // 1
    expect(rl.check(req, fakeReply())).toBe(false); // 2
    const reply = fakeReply();
    expect(rl.check(req, reply)).toBe(true); // 3 -> bloqueado
    expect(reply.statusOf()).toBe(429);
  });

  it('separa por chave (IP diferente não compartilha limite)', () => {
    const rl = makeRateLimiter({ windowMs: 60_000, max: 1, name: 't' });
    expect(rl.check(fakeReq('a'), fakeReply())).toBe(false);
    expect(rl.check(fakeReq('a'), fakeReply())).toBe(true);
    expect(rl.check(fakeReq('b'), fakeReply())).toBe(false); // outra chave, ok
  });

  it('reset limpa a contagem', () => {
    const rl = makeRateLimiter({ windowMs: 60_000, max: 1, name: 't' });
    expect(rl.check(fakeReq(), fakeReply())).toBe(false);
    expect(rl.check(fakeReq(), fakeReply())).toBe(true);
    rl.reset();
    expect(rl.check(fakeReq(), fakeReply())).toBe(false);
  });
});
