import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { ParseError } from '../src/parsers/types';
import { parseStatementRows } from '../src/parsers/statement-table';

// -----------------------------------------------------------------
// Unidade: linhas de extrato → schema canônico (puro, rápido)
// -----------------------------------------------------------------

describe('parseStatementRows', () => {
  it('coluna de valor única (com sinal) + saldo', () => {
    const res = parseStatementRows([
      ['Data', 'Historico', 'Valor', 'Saldo'],
      ['01/07/2026', 'PIX CLIENTE A', '1.500,00', '1.500,00'],
      ['03/07/2026', 'FORNECEDOR B', '-800,00', '700,00'],
      ['', 'TOTAL DO PERIODO', '', ''], // rodapé sem data: ignorado
    ]);
    expect(res.entries).toHaveLength(2);
    expect(res.entries[0]).toMatchObject({ kind: 'receivable', amountCents: 150000, settledOn: '2026-07-01' });
    expect(res.entries[1]).toMatchObject({ kind: 'payable', amountCents: 80000, settledOn: '2026-07-03' });
    expect(res.balances).toEqual([
      { observedOn: '2026-07-01', balanceCents: 150000 },
      { observedOn: '2026-07-03', balanceCents: 70000 },
    ]);
    expect(res.meta.source).toBe('bank_spreadsheet');
  });

  it('colunas de débito e crédito separadas', () => {
    const res = parseStatementRows([
      ['Data', 'Descricao', 'Credito', 'Debito', 'Saldo'],
      ['10/07/2026', 'VENDA', '2.000,00', '', '2.000,00'],
      ['11/07/2026', 'ALUGUEL', '', '1.000,00', '1.000,00'],
    ]);
    expect(res.entries[0]).toMatchObject({ kind: 'receivable', amountCents: 200000 });
    expect(res.entries[1]).toMatchObject({ kind: 'payable', amountCents: 100000 });
  });

  it('valor sem sinal + coluna de tipo (D/C) decide o sinal', () => {
    const res = parseStatementRows([
      ['Data', 'Historico', 'Valor', 'Tipo'],
      ['01/08/2026', 'DEPOSITO', '500,00', 'C'],
      ['02/08/2026', 'SAQUE', '300,00', 'D'],
    ]);
    expect(res.entries[0]).toMatchObject({ kind: 'receivable', amountCents: 50000 });
    expect(res.entries[1]).toMatchObject({ kind: 'payable', amountCents: 30000 });
  });

  it('tolera valor com ponto decimal (sem vírgula)', () => {
    const res = parseStatementRows([
      ['Data', 'Valor'],
      ['01/09/2026', '1500.50'],
    ]);
    expect(res.entries[0]).toMatchObject({ amountCents: 150050 });
  });

  it('recusa quando não reconhece as colunas', () => {
    expect(() => parseStatementRows([['Coluna A', 'Coluna B'], ['x', 'y']])).toThrow(ParseError);
  });

  it('cabeçalho reconhecido mas sem lançamentos → erro claro', () => {
    expect(() => parseStatementRows([['Data', 'Valor', 'Saldo']])).toThrow(/nenhum lançamento/i);
  });
});

// -----------------------------------------------------------------
// Ponta a ponta: importar um extrato CSV pela rota /me/import
// -----------------------------------------------------------------

const PORT = 5500;
const DATA_DIR = path.join(tmpdir(), 'pulso-pgdata-statement-test');

const extratoCsv = [
  'Data;Historico;Valor;Saldo',
  '01/07/2026;PIX RECEBIDO CLIENTE A;1.500,00;1.500,00',
  '03/07/2026;PAGAMENTO FORNECEDOR B;-800,00;700,00',
  '05/07/2026;TARIFA BANCARIA;-20,00;680,00',
  '',
].join('\n');

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
    payload: { businessName: 'Loja CSV', email: 'dono@csv.com', password: 'senha-boa-123', phone: '11987654321' },
  });
  token = signup.json().token as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

describe('POST /me/import (extrato CSV)', () => {
  it('lê o extrato em CSV, persiste e recalcula o caixa', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        filename: 'extrato.csv',
        contentBase64: Buffer.from(extratoCsv, 'utf8').toString('base64'),
        docType: 'bank_statement',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.import.source).toBe('bank_spreadsheet');
    expect(body.import.rowsImported).toBe(3);
    // o caixa vira o último saldo do extrato (R$ 680,00)
    expect(body.snapshot.indicators.cash_balance.value).toBe(68000);
  });
});
