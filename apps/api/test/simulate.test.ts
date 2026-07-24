import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { bearer, seedAdminToken } from './helpers';

const PORT = 5494;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-simulate-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;

let token: string;
let companyId: string;
let ADMIN: string;

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'pulso',
    password: 'pulso',
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');

  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql);
  await app.ready();
  ADMIN = await seedAdminToken(sql);

  // dono se cadastra (empresa vazia) e pega o token
  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Clínica Simulação', email: 'sim@teste.com', password: 'segredo123' },
  });
  expect(signup.statusCode).toBe(201);
  token = signup.json().token as string;
  companyId = signup.json().company.id as string;

  // R$ 5.000 em caixa e um pagamento de R$ 8.000 que vence em 20/jun (zera nesse dia)
  await app.inject({
    method: 'POST',
    url: `/companies/${companyId}/imports`,
    headers: bearer(ADMIN),
    payload: {
      source: 'fixture_json',
      periodStart: '2026-05-01',
      periodEnd: '2026-06-01',
      entries: [
        {
          kind: 'payable',
          amountCents: 800_000,
          issuedOn: '2026-05-15',
          dueOn: '2026-06-20',
          settledOn: null,
        },
      ],
    },
  });
  await app.inject({
    method: 'POST',
    url: `/companies/${companyId}/balances`,
    headers: bearer(ADMIN),
    payload: { observedOn: '2026-06-01', balanceCents: 500_000 },
  });
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('POST /me/simulate', () => {
  it('exige login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/simulate',
      payload: { deltas: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('sem deltas: devolve a curva real e a zeragem de hoje', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/simulate',
      headers: auth(),
      payload: { deltas: [], asOf: '2026-06-01' },
    });
    expect(res.statusCode).toBe(200);
    const sim = res.json().simulation;
    expect(sim.original.zeroOn).toBe('2026-06-20');
    expect(sim.original.curve[0]).toEqual({ day: '2026-06-01', cents: 500_000 });
    // sem ajustes, a simulada é igual à real
    expect(sim.simulated.zeroOn).toBe('2026-06-20');
  });

  it('adiar o pagamento empurra a zeragem para frente (ponta a ponta)', async () => {
    const [row] = await sql`SELECT id::text AS id FROM entries WHERE company_id = ${companyId} AND kind = 'payable'`;
    const entryId = row.id as string;

    const res = await app.inject({
      method: 'POST',
      url: '/me/simulate',
      headers: auth(),
      payload: {
        asOf: '2026-06-01',
        deltas: [{ type: 'delayPayable', entryId, days: 30 }],
      },
    });
    expect(res.statusCode).toBe(200);
    const sim = res.json().simulation;
    expect(sim.applied).toHaveLength(1);
    expect(sim.original.zeroOn).toBe('2026-06-20');
    expect(sim.simulated.zeroOn).toBe('2026-07-20'); // 30 dias depois
  });
});
