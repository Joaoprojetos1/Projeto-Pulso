import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  extractionModelFromProvider,
  validateExtraction,
  type ExtractionModel,
} from '../src/ai/extract';
import type { TextProvider } from '../src/ai/provider';
import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

// -----------------------------------------------------------------
// Unidade: o fiscal do CÓDIGO sobre a transcrição da IA (puro, rápido)
// -----------------------------------------------------------------

describe('validateExtraction (folha)', () => {
  it('converte valores BR para centavos e mantém os válidos', () => {
    const { items, issues } = validateExtraction('payroll', [
      { label: 'Salários', valueText: '3.500,00' },
      { label: 'Pró-labore', valueText: 'R$ 1.200,00' },
    ]);
    expect(items).toEqual([
      { label: 'Salários', amountCents: 350000 },
      { label: 'Pró-labore', amountCents: 120000 },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('descarta valor ilegível, zero, negativo e fora da faixa — com aviso', () => {
    const { items, issues } = validateExtraction('payroll', [
      { label: 'Salários', valueText: '3.000,00' },
      { label: 'Lixo', valueText: 'abc' },
      { label: 'Zerado', valueText: '0,00' },
      { label: 'Estorno', valueText: '-100,00' },
      { label: 'Absurdo', valueText: '9.999.999,00' }, // > R$ 500 mil
    ]);
    expect(items).toEqual([{ label: 'Salários', amountCents: 300000 }]);
    expect(issues).toHaveLength(4);
  });

  it('ignora item sem rótulo', () => {
    const { items, issues } = validateExtraction('payroll', [{ label: '   ', valueText: '10,00' }]);
    expect(items).toHaveLength(0);
    expect(issues).toHaveLength(1);
  });
});

describe('extractionModelFromProvider', () => {
  it('transcreve via structured output e o código valida', async () => {
    const fakeProvider: TextProvider = {
      name: 'fake',
      async generate() {
        return {
          text: JSON.stringify({ items: [{ label: 'Salários', valueText: '2.000,00' }] }),
          modelVersion: 'fake-1',
        };
      },
    };
    const model = extractionModelFromProvider(fakeProvider);
    const out = await model.extract('payroll', 'texto do arquivo');
    expect(out.items).toEqual([{ label: 'Salários', valueText: '2.000,00' }]);
    expect(out.modelVersion).toBe('fake-1');
  });
});

// -----------------------------------------------------------------
// Ponta a ponta: upload folha → proposta → confirmação → motor
// -----------------------------------------------------------------

const PORT = 5498;
// Fora do diretório do projeto (o caminho do repo tem acento, e o initdb em UTF8
// não aceita bytes WIN1252 no caminho). O temp do Windows usa nome curto sem acento.
const DATA_DIR = path.join(tmpdir(), 'pulso-pgdata-extract-test');

// modelo de extração DUBLÊ: devolve a transcrição fixa (o teste não chama IA real)
const fakeExtraction: ExtractionModel = {
  async extract() {
    return {
      items: [
        { label: 'Salários', valueText: '3.500,00' },
        { label: 'Pró-labore', valueText: '2.000,00' },
      ],
      modelVersion: 'fake-extract-1',
    };
  },
};

// uma "folha" qualquer que o código consiga ler como planilha (CSV)
const folhaCsv = Buffer.from('Descricao;Valor\nSalarios;3.500,00\nPro-labore;2.000,00\n', 'utf8').toString('base64');

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
  app = buildApp(sql, { extractionModel: fakeExtraction });
  await app.ready();
  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Clínica Teste', email: 'dono@clinica.com', password: 'senha-boa-123', phone: '11987654321' },
  });
  token = signup.json().token as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('POST /me/import (folha extraível)', () => {
  let importId: string;

  it('extrai a folha e devolve a PROPOSTA, sem tocar no motor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'folha-julho.csv', contentBase64: folhaCsv, docType: 'payroll' },
    });
    expect(res.statusCode).toBe(201);
    const imp = res.json().import;
    expect(imp.status).toBe('extracted');
    expect(imp.proposal.items).toEqual([
      { label: 'Salários', amountCents: 350000 },
      { label: 'Pró-labore', amountCents: 200000 },
    ]);
    importId = imp.id;

    // nada entrou no motor ainda: sem custo fixo declarado
    const [c] = await sql`SELECT declared_fixed_cost_cents FROM companies WHERE id = (SELECT company_id FROM users WHERE email = 'dono@clinica.com')`;
    expect(c!.declared_fixed_cost_cents).toBeNull();
  });

  it('a lista de arquivos expõe a proposta pendente para o dono confirmar', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/imports', headers: auth() });
    const item = res.json().imports.find((i: { id: string }) => i.id === importId);
    expect(item.status).toBe('extracted');
    expect(item.proposal.items).toHaveLength(2);
  });

  it('só na CONFIRMAÇÃO o valor entra no motor (folha → custo fixo)', async () => {
    // o dono confirma, editando o pró-labore para R$ 2.500
    const res = await app.inject({
      method: 'POST',
      url: `/me/imports/${importId}/confirm`,
      headers: auth(),
      payload: {
        items: [
          { label: 'Salários', amountCents: 350000 },
          { label: 'Pró-labore', amountCents: 250000 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().confirmed.itemsApplied).toBe(2);

    // custo fixo declarado = soma confirmada (feita pelo código)
    const [c] = await sql`SELECT declared_fixed_cost_cents FROM companies WHERE id = (SELECT company_id FROM users WHERE email = 'dono@clinica.com')`;
    expect(Number(c!.declared_fixed_cost_cents)).toBe(600000);

    // os itens ficaram guardados com origem 'payroll' (o "de onde vem esse número")
    const itens = await sql`SELECT label, amount_cents, source FROM fixed_cost_items ORDER BY amount_cents DESC`;
    expect(itens.map((i) => i.source)).toEqual(['payroll', 'payroll']);

    // o import virou 'confirmed'
    const [imp] = await sql`SELECT status FROM imports WHERE id = ${importId}`;
    expect(imp!.status).toBe('confirmed');
  });

  it('reenviar uma nova folha SUBSTITUI a anterior (não acumula)', async () => {
    const nova = Buffer.from('Descricao;Valor\nSalarios;4.000,00\n', 'utf8').toString('base64');
    const up = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'folha-agosto.csv', contentBase64: nova, docType: 'payroll' },
    });
    const novoId = up.json().import.id as string;
    await app.inject({
      method: 'POST',
      url: `/me/imports/${novoId}/confirm`,
      headers: auth(),
      payload: { items: [{ label: 'Salários', amountCents: 400000 }] },
    });
    // só a folha nova vale: 1 item, R$ 4.000 (não somou com a de julho)
    const itens = await sql`SELECT amount_cents FROM fixed_cost_items WHERE source = 'payroll'`;
    expect(itens).toHaveLength(1);
    const [c] = await sql`SELECT declared_fixed_cost_cents FROM companies WHERE id = (SELECT company_id FROM users WHERE email = 'dono@clinica.com')`;
    expect(Number(c!.declared_fixed_cost_cents)).toBe(400000);
  });
});

describe('POST /me/import sem modelo de IA', () => {
  it('cai no "recebido" honesto quando a extração está indisponível', async () => {
    const semIa = buildApp(sql); // sem extractionModel
    await semIa.ready();
    const res = await semIa.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'folha-sem-ia.csv', contentBase64: Buffer.from('X;Y\n1;2\n').toString('base64'), docType: 'payroll' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().import.status).toBe('received');
    await semIa.close();
  });
});
