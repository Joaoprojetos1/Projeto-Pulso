import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

const PORT = 5505;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-mealerts-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let token: string;
let companyId: string;
let alertaAntigo: string;
let alertaNovo: string;

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

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
    payload: { businessName: 'Clínica Alertas', email: 'dona@alertas.com', password: 'senha-forte-123' },
  });
  token = signup.json().token as string;
  companyId = signup.json().company.id as string;

  const [s] = await sql`
    INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload)
    VALUES (${companyId}, '2026-07-15', 'test', ${sql.json({})}) RETURNING id`;
  const [a1] = await sql`
    INSERT INTO alerts (company_id, snapshot_id, rule_key, severity, facts, text_title, created_at)
    VALUES (${companyId}, ${s.id}, 'scissor', 'warn', ${sql.json({})}, 'Efeito tesoura', now() - interval '2 days')
    RETURNING id`;
  const [a2] = await sql`
    INSERT INTO alerts (company_id, snapshot_id, rule_key, severity, facts, text_title, created_at)
    VALUES (${companyId}, ${s.id}, 'cash_runway', 'critical', ${sql.json({})}, 'Caixa pode zerar', now())
    RETURNING id`;
  alertaAntigo = a1.id as string;
  alertaNovo = a2.id as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

describe('GET /me/alerts', () => {
  it('exige login', async () => {
    expect((await app.inject({ method: 'GET', url: '/me/alerts' })).statusCode).toBe(401);
  });

  it('lista o histórico, mais recente primeiro, com estado não-lido', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/alerts', headers: auth(token) });
    expect(res.statusCode).toBe(200);
    const alerts = res.json().alerts as Array<{ id: string; openedAt: string | null; actedAt: string | null }>;
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.id).toBe(alertaNovo); // mais recente primeiro
    expect(alerts[0]!.openedAt).toBeNull();
    expect(alerts[0]!.actedAt).toBeNull();
  });
});

describe('POST /me/alerts/:id/opened e /acted', () => {
  it('marca visto e é idempotente (não muda o horário na 2ª vez)', async () => {
    expect((await app.inject({ method: 'POST', url: `/me/alerts/${alertaNovo}/opened`, headers: auth(token) })).statusCode).toBe(200);

    const primeiro = (await app.inject({ method: 'GET', url: '/me/alerts', headers: auth(token) }))
      .json().alerts.find((a: { id: string }) => a.id === alertaNovo).openedAt;
    expect(primeiro).toBeTruthy();

    // segunda vez: idempotente — o horário permanece o mesmo
    await app.inject({ method: 'POST', url: `/me/alerts/${alertaNovo}/opened`, headers: auth(token) });
    const segundo = (await app.inject({ method: 'GET', url: '/me/alerts', headers: auth(token) }))
      .json().alerts.find((a: { id: string }) => a.id === alertaNovo).openedAt;
    expect(segundo).toBe(primeiro);
  });

  it('marca agido', async () => {
    expect((await app.inject({ method: 'POST', url: `/me/alerts/${alertaAntigo}/acted`, headers: auth(token) })).statusCode).toBe(200);
    const alerta = (await app.inject({ method: 'GET', url: '/me/alerts', headers: auth(token) }))
      .json().alerts.find((a: { id: string }) => a.id === alertaAntigo);
    expect(alerta.actedAt).toBeTruthy();
  });

  it('alerta inexistente: 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/alerts/00000000-0000-0000-0000-000000000000/opened',
      headers: auth(token),
    });
    expect(res.statusCode).toBe(404);
  });
});
