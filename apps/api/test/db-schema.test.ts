import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

const PORT = 5525;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-dbschema-test');

let pg: EmbeddedPostgres;
let sql: Sql;

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');
  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
});

afterAll(async () => {
  await sql?.end();
  await pg?.stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

describe('índices das consultas reais', () => {
  const esperados = [
    'chat_messages_company_created',
    'ai_usage_company_created',
    'planned_entries_company_due',
    'imports_company_imported',
  ];

  it('todos os índices esperados existem', async () => {
    const rows = await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const nomes = new Set(rows.map((r) => r.indexname as string));
    for (const idx of esperados) {
      expect(nomes.has(idx), `índice ausente: ${idx}`).toBe(true);
    }
  });
});

describe('dinheiro é sempre bigint (nunca ponto flutuante em coluna)', () => {
  const colunasDeDinheiro: Array<[string, string]> = [
    ['companies', 'declared_fixed_cost_cents'],
    ['entries', 'amount_cents'],
    ['cash_balances', 'balance_cents'],
    ['planned_entries', 'amount_cents'],
    ['plans', 'price_cents'],
  ];

  // a regra é INTEIRO em centavos (nunca ponto flutuante). bigint ou integer
  // servem; o proibido é numeric/decimal/real/double precision/money.
  const tiposInteiros = new Set(['bigint', 'integer', 'smallint']);

  it('todas as colunas de centavos são de tipo inteiro (nunca flutuante)', async () => {
    for (const [tabela, coluna] of colunasDeDinheiro) {
      const [row] = await sql`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = ${tabela} AND column_name = ${coluna}`;
      expect(tiposInteiros.has(row?.data_type as string), `${tabela}.${coluna} = ${row?.data_type}`).toBe(true);
    }
  });
});
