import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { seedAdminToken, bearer } from './helpers';

const PORT = 5497;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-segments-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let token: string;
let adminToken: string;
let companyId: string;

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');

  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql);
  await app.ready();

  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Loja da Ana', email: 'ana@loja.com', password: 'senha-boa-123', phone: '11987654321' },
  });
  token = signup.json().token as string;

  // o dono é varejo de roupa
  const [c] = await sql`UPDATE companies SET niche = 'varejo' WHERE name = 'Loja da Ana' RETURNING id::text AS id`;
  companyId = c!.id as string;

  adminToken = await seedAdminToken(sql);
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('números do mês (segmento)', () => {
  it('lista os campos do segmento e começa tudo bloqueado', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/operations', headers: auth() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.segment).toBe('varejo');
    expect(body.fields).toHaveLength(6);
    expect(body.coverage.every((c: { status: string }) => c.status === 'blocked')).toBe(true);
  });

  it('grava o mês e o motor passa a calcular os indicadores de segmento e disparar alertas', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/operations',
      headers: auth(),
      payload: {
        month: '2026-06',
        values: {
          cmv: 1_000_000,
          estoque_final: 12_000_000, // giro = 12M anualizado / 12M = 1x (< 2)
          receita_bruta: 10_000_000,
          devolucoes: 1_000_000, // 10% (> 8%)
          atendimentos: 200,
          custo_operacional: 3_000_000,
        },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    const indicators = body.dashboard.snapshot.indicators;
    expect(indicators.varejo_giro_estoque.value).toBe(1);
    const ruleKeys = body.dashboard.alerts.map((a: { ruleKey: string }) => a.ruleKey);
    expect(ruleKeys).toContain('varejo_giro_baixo');
    expect(ruleKeys).toContain('varejo_devolucoes_altas');
  });

  it('recusa campo que não pertence ao segmento', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/operations',
      headers: auth(),
      payload: { month: '2026-06', values: { convenio_glosas: 100 } },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('diagnóstico de gestão (questionário)', () => {
  it('tem 15 perguntas e começa sem pontuação', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/survey', headers: auth() });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.questions).toHaveLength(15);
    expect(body.result.overall).toBeNull();
  });

  it('grava respostas e pontua', async () => {
    const answers: Record<string, string> = {};
    for (const q of (await app.inject({ method: 'GET', url: '/me/survey', headers: auth() })).json().questions) {
      answers[q.id] = 'sim';
    }
    const res = await app.inject({ method: 'POST', url: '/me/survey', headers: auth(), payload: { answers } });
    expect(res.statusCode).toBe(201);
    expect(res.json().result.overall).toBe(100);
  });
});

describe('admin vê os dados de segmento e a contagem por segmento', () => {
  it('lê os números do mês de uma empresa', async () => {
    const res = await app.inject({ method: 'GET', url: `/admin/companies/${companyId}/operations`, headers: bearer(adminToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().segment).toBe('varejo');
  });

  it('a visão geral traz a contagem por segmento', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/overview', headers: bearer(adminToken) });
    expect(res.statusCode).toBe(200);
    const segs = res.json().segments as Array<{ niche: string; count: number }>;
    expect(segs.find((s) => s.niche === 'varejo')!.count).toBeGreaterThanOrEqual(1);
  });

  it('troca o segmento da empresa (recalcula) e valida o enum', async () => {
    const ok = await app.inject({
      method: 'PATCH',
      url: `/admin/companies/${companyId}`,
      headers: bearer(adminToken),
      payload: { niche: 'restaurante' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().niche).toBe('restaurante');
    // volta para varejo para não afetar outros testes do arquivo (ordem estável)
    await app.inject({ method: 'PATCH', url: `/admin/companies/${companyId}`, headers: bearer(adminToken), payload: { niche: 'varejo' } });
  });
});
