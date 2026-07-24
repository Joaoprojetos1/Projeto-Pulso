import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { bearer, seedAdminToken } from './helpers';

const PORT = 5519;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-avatar-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let TOKEN: string;

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
  TOKEN = await seedAdminToken(sql);
});

afterAll(async () => {
  await app.close();
  await sql.end();
  await pg.stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

describe('foto do avatar', () => {
  const png = Buffer.from('conteudo-de-imagem-falso').toString('base64');

  it('sem foto ainda: devolve dataUri null', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/avatar', headers: bearer(TOKEN) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ dataUri: null });
  });

  it('exige login para enviar', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/avatar',
      payload: { dataBase64: png, mime: 'image/png' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('recusa tipo de imagem fora da lista', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/avatar',
      headers: bearer(TOKEN),
      payload: { dataBase64: png, mime: 'image/gif' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('salva e depois devolve como data URI', async () => {
    const salvar = await app.inject({
      method: 'POST',
      url: '/me/avatar',
      headers: bearer(TOKEN),
      payload: { dataBase64: png, mime: 'image/png' },
    });
    expect(salvar.statusCode).toBe(200);
    expect(salvar.json()).toEqual({ saved: true });

    const ler = await app.inject({ method: 'GET', url: '/me/avatar', headers: bearer(TOKEN) });
    expect(ler.statusCode).toBe(200);
    expect(ler.json().dataUri).toBe(`data:image/png;base64,${png}`);
  });

  it('recusa imagem grande demais', async () => {
    const grande = Buffer.alloc(500 * 1024, 1).toString('base64'); // ~500 KB > limite
    const res = await app.inject({
      method: 'POST',
      url: '/me/avatar',
      headers: bearer(TOKEN),
      payload: { dataBase64: grande, mime: 'image/jpeg' },
    });
    expect(res.statusCode).toBe(413);
  });

  it('remove a foto e volta a null', async () => {
    const del = await app.inject({ method: 'DELETE', url: '/me/avatar', headers: bearer(TOKEN) });
    expect(del.statusCode).toBe(200);
    const ler = await app.inject({ method: 'GET', url: '/me/avatar', headers: bearer(TOKEN) });
    expect(ler.json()).toEqual({ dataUri: null });
  });
});
