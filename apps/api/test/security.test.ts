import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { verifyMetaSignature } from '../src/channels/whatsapp';
import { buildApp } from '../src/app';
import type { Sql } from '../src/db';
import { constantTimeEqual } from '../src/http';

// CORS/headers não tocam o banco; o /health faz um SELECT 1. Um sql stub que
// resolve qualquer query basta — teste rápido, sem Postgres de verdade.
const sqlStub = (() => Promise.resolve([{ ok: 1 }])) as unknown as Sql;
const app = buildApp(sqlStub);

beforeAll(async () => {
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

describe('healthcheck de verdade (checa o banco)', () => {
  it('ok quando o banco responde', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('503 quando o banco não responde', async () => {
    const appRuim = buildApp((() => Promise.reject(new Error('db down'))) as unknown as Sql);
    await appRuim.ready();
    const res = await appRuim.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ ok: false });
    await appRuim.close();
  });
});

describe('headers de segurança', () => {
  it('/health traz nosniff, DENY e no-referrer', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });
});

describe('CORS restrito às origens reais', () => {
  it('reflete uma origem conhecida (o site)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://pulso-site.onrender.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://pulso-site.onrender.com');
  });

  it('NÃO reflete uma origem desconhecida', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('permite requisição sem Origin (app nativo)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('comparação de segredo em tempo constante', () => {
  it('true só para strings iguais', () => {
    expect(constantTimeEqual('segredo-forte', 'segredo-forte')).toBe(true);
    expect(constantTimeEqual('segredo-forte', 'segredo-errado')).toBe(false);
    expect(constantTimeEqual('a', 'ab')).toBe(false); // tamanhos diferentes
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

describe('assinatura do webhook do WhatsApp (Meta HMAC)', () => {
  const secret = 'app-secret-de-teste';
  const corpo = Buffer.from(JSON.stringify({ entry: [{ changes: [] }] }), 'utf8');
  const assinatura = 'sha256=' + createHmac('sha256', secret).update(corpo).digest('hex');

  it('aceita a assinatura correta', () => {
    expect(verifyMetaSignature(corpo, assinatura, secret)).toBe(true);
  });

  it('recusa assinatura errada, ausente ou de outro segredo', () => {
    expect(verifyMetaSignature(corpo, 'sha256=deadbeef', secret)).toBe(false);
    expect(verifyMetaSignature(corpo, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(corpo, assinatura, 'outro-segredo')).toBe(false);
    expect(verifyMetaSignature(Buffer.from('corpo adulterado'), assinatura, secret)).toBe(false);
  });
});
