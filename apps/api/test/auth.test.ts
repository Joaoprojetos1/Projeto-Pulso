import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

const PORT = 5497;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-auth-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;

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
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

describe('login de verdade', () => {
  const email = 'dona@clinicanova.com.br';
  const senha = 'segredo-forte-123';

  it('cadastro cria a conta e devolve token + empresa', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { businessName: 'Clínica Nova', email, password: senha },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.company.name).toBe('Clínica Nova');
    expect(body.email).toBe(email);
  });

  it('não deixa cadastrar o mesmo e-mail duas vezes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { businessName: 'Outra', email, password: senha },
    });
    expect(res.statusCode).toBe(409);
  });

  it('a senha nunca é guardada em texto', async () => {
    const [row] = await sql`SELECT password_hash FROM users WHERE email = ${email}`;
    expect(row.password_hash).not.toContain(senha);
    expect(String(row.password_hash)).toContain(':'); // formato salt:derivado
  });

  it('login com senha certa devolve token; com senha errada dá 401', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: senha },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toBeTruthy();

    const errada = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'chute-errado' },
    });
    expect(errada.statusCode).toBe(401);
  });

  it('/me/dashboard sem token dá 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/dashboard' });
    expect(res.statusCode).toBe(401);
  });

  it('/me/dashboard com token: conta nova vem vazia (snapshot null), sem chutar número', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: senha },
    });
    const token = login.json().token as string;

    const res = await app.inject({
      method: 'GET',
      url: '/me/dashboard',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.company.name).toBe('Clínica Nova');
    expect(body.snapshot).toBeNull();
    expect(body.alerts).toEqual([]);
  });

  it('logout invalida o token', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: senha },
    });
    const token = login.json().token as string;

    await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });

    const depois = await app.inject({
      method: 'GET',
      url: '/me/dashboard',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(depois.statusCode).toBe(401);
  });
});
