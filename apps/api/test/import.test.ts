import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

const PORT = 5497;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-import-test');
const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../fixtures/parsers');
const b64 = (f: string) => readFileSync(path.join(FIX, f)).toString('base64');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let token: string;

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
    payload: { businessName: 'Loja Teste', email: 'dono@loja.com', password: 'senha-boa-123', phone: '11987654321' },
  });
  token = signup.json().token as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('POST /me/import', () => {
  it('exige login', async () => {
    const res = await app.inject({ method: 'POST', url: '/me/import', payload: { filename: 'x.ofx', contentBase64: 'AAAA' } });
    expect(res.statusCode).toBe(401);
  });

  it('importa um OFX, persiste e recalcula o painel', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'extrato.ofx', contentBase64: b64('extrato.ofx') },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.import.source).toBe('ofx');
    expect(body.import.rowsImported).toBe(3);
    // o motor rodou: o saldo do extrato virou o indicador de caixa
    expect(body.snapshot.indicators.cash_balance.value).toBe(114740);
  });

  it('é idempotente: o mesmo arquivo não entra duas vezes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'extrato.ofx', contentBase64: b64('extrato.ofx') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().import.alreadyImported).toBe(true);
    // não duplicou: ainda 3 lançamentos
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM entries`;
    expect(count).toBe(3);
  });

  it('recusa relatório de sistema (HTML) com mensagem clara', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'FaturamentoDiario.xls', contentBase64: b64('microvix-faturamento.xls') },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/relatório do sistema/i);
  });
});
