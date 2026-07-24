import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { weeklyTemplate } from '../src/ai/weekly-writer';
import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { bearer, seedAdminToken } from './helpers';

const PORT = 5507;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-weekly-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let ADMIN: string;

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
  ADMIN = await seedAdminToken(sql);
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

describe('weeklyTemplate (fallback determinístico)', () => {
  it('resume em texto quando há os dois períodos', () => {
    const t = weeklyTemplate({
      cashNowCents: 1_500_000,
      cashPrevCents: 2_000_000,
      cashCycleNow: 50,
      cashCyclePrev: 40,
      revenueNowCents: 800_000,
      revenuePrevCents: 700_000,
      daysBetween: 7,
    });
    expect(t.title).toBe('Sua semana');
    expect(t.body).toMatch(/caixa/i);
    expect(t.modelVersion).toBe('weekly-template-v1');
  });

  it('sem variação relevante, dá uma frase estável', () => {
    const t = weeklyTemplate({
      cashNowCents: null,
      cashPrevCents: null,
      cashCycleNow: null,
      cashCyclePrev: null,
      revenueNowCents: null,
      revenuePrevCents: null,
      daysBetween: 7,
    });
    expect(t.body).toMatch(/estáveis/i);
  });
});

describe('resumo da semana (ponta a ponta)', () => {
  it('o 2º snapshot (>= 5 dias depois) gera weeklySummary no dashboard', async () => {
    const created = await app.inject({ method: 'POST', url: '/companies', payload: { name: 'Clínica Semana' } });
    const id = created.json().id as string;

    await app.inject({
      method: 'POST',
      url: `/companies/${id}/balances`,
      headers: bearer(ADMIN),
      payload: { observedOn: '2026-06-28', balanceCents: 2_000_000 },
    });

    // 1º snapshot: ainda não há anterior → sem resumo
    const s1 = await app.inject({ method: 'POST', url: `/companies/${id}/snapshots`, headers: bearer(ADMIN), payload: { asOf: '2026-07-01' } });
    expect(s1.statusCode).toBe(201);

    // 2º snapshot 9 dias depois → há um anterior de >= 5 dias → resumo gerado
    const s2 = await app.inject({ method: 'POST', url: `/companies/${id}/snapshots`, headers: bearer(ADMIN), payload: { asOf: '2026-07-10' } });
    expect(s2.statusCode).toBe(201);

    const dash = await app.inject({ method: 'GET', url: `/companies/${id}/dashboard`, headers: bearer(ADMIN) });
    const body = dash.json();
    expect(body.weeklySummary).toBeTruthy();
    expect(body.weeklySummary.text.body).toBeTruthy();
    expect(body.weeklySummary.facts.cashNowCents).toBe(2_000_000);
    expect(body.weeklySummary.comparedTo).toBe('2026-07-01');
  });
});
