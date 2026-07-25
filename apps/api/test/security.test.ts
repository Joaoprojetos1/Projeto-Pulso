import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import type { Sql } from '../src/db';

// /health e o CORS/headers não tocam o banco: um sql stub basta (registro de
// rotas não consulta nada). Teste rápido, sem Postgres.
const app = buildApp({} as unknown as Sql);

beforeAll(async () => {
  await app.ready();
});
afterAll(async () => {
  await app.close();
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
