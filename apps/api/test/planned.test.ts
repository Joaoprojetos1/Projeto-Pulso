import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

const PORT = 5496;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-planned-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let token: string;

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

  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Clínica Planejo', email: 'dono@planejo.com', password: 'senha-boa-123' },
  });
  token = signup.json().token as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

const auth = { authorization: () => ({ authorization: `Bearer ${token}` }) };

describe('contas previstas (a pagar e a receber)', () => {
  it('exige login', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/contas' });
    expect(res.statusCode).toBe(401);
  });

  it('cadastra um recebimento e ele nasce como PREVISÃO', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/contas',
      headers: auth.authorization(),
      payload: {
        kind: 'receivable',
        amountCents: 500_000,
        dueOn: '2999-01-10',
        counterparty: 'Unimed',
        category: 'convênio',
      },
    });
    expect(res.statusCode).toBe(201);
    const c = res.json();
    expect(c.previsao).toBe(true);
    expect(c.status).toBe('prevista');
    expect(c.natureza).toBe('avulsa');
  });

  it('conta com data no passado aparece como VENCIDA (aguardando confirmação)', async () => {
    await app.inject({
      method: 'POST',
      url: '/me/contas',
      headers: auth.authorization(),
      payload: { kind: 'receivable', amountCents: 100_000, dueOn: '2020-01-01', counterparty: 'Atrasado' },
    });
    const lista = await app.inject({
      method: 'GET',
      url: '/me/contas?kind=receivable',
      headers: auth.authorization(),
    });
    const vencida = lista.json().contas.find((c: { counterparty: string }) => c.counterparty === 'Atrasado');
    expect(vencida.status).toBe('vencida');
  });

  it('filtra por visão: a pagar não mistura com a receber', async () => {
    await app.inject({
      method: 'POST',
      url: '/me/contas',
      headers: auth.authorization(),
      payload: { kind: 'payable', amountCents: 400_000, dueOn: '2999-01-05', category: 'aluguel', recurrence: 'monthly' },
    });
    const pagar = await app.inject({
      method: 'GET',
      url: '/me/contas?kind=payable',
      headers: auth.authorization(),
    });
    const contas = pagar.json().contas;
    expect(contas.every((c: { kind: string }) => c.kind === 'payable')).toBe(true);
    const aluguel = contas.find((c: { category: string }) => c.category === 'aluguel');
    expect(aluguel.natureza).toBe('recorrente');
  });

  it('graduar: confirma que aconteceu e guarda a data real (previsto × real)', async () => {
    const criada = await app.inject({
      method: 'POST',
      url: '/me/contas',
      headers: auth.authorization(),
      payload: { kind: 'receivable', amountCents: 200_000, dueOn: '2026-07-10', counterparty: 'Cliente X' },
    });
    const id = criada.json().id as string;

    const conf = await app.inject({
      method: 'POST',
      url: `/me/contas/${id}/confirmar`,
      headers: auth.authorization(),
      payload: { confirmedOn: '2026-07-22' },
    });
    expect(conf.statusCode).toBe(200);
    const c = conf.json();
    expect(c.status).toBe('realizada');
    expect(c.previsao).toBe(false);
    expect(c.confirmedOn).toBe('2026-07-22'); // dez dias de atraso ficam registrados
  });

  it('não deixa cadastrar dinheiro quebrado (float)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/contas',
      headers: auth.authorization(),
      payload: { kind: 'payable', amountCents: 10.5, dueOn: '2999-01-01' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('edita uma conta prevista (valor, data, contraparte, recorrência)', async () => {
    const criada = await app.inject({
      method: 'POST',
      url: '/me/contas',
      headers: auth.authorization(),
      payload: { kind: 'payable', amountCents: 100_000, dueOn: '2999-02-01', counterparty: 'Antigo' },
    });
    const id = criada.json().id as string;

    const editada = await app.inject({
      method: 'PATCH',
      url: `/me/contas/${id}`,
      headers: auth.authorization(),
      payload: { amountCents: 250_000, dueOn: '2999-03-15', counterparty: 'Novo Fornecedor', recurrence: 'monthly' },
    });
    expect(editada.statusCode).toBe(200);
    const c = editada.json();
    expect(c.amountCents).toBe(250_000);
    expect(c.dueOn).toBe('2999-03-15');
    expect(c.counterparty).toBe('Novo Fornecedor');
    expect(c.natureza).toBe('recorrente');
    expect(c.status).toBe('prevista'); // continua previsão
  });

  it('não edita conta já confirmada (graduada)', async () => {
    const criada = await app.inject({
      method: 'POST',
      url: '/me/contas',
      headers: auth.authorization(),
      payload: { kind: 'receivable', amountCents: 300_000, dueOn: '2026-07-10' },
    });
    const id = criada.json().id as string;
    await app.inject({ method: 'POST', url: `/me/contas/${id}/confirmar`, headers: auth.authorization(), payload: {} });

    const editar = await app.inject({
      method: 'PATCH',
      url: `/me/contas/${id}`,
      headers: auth.authorization(),
      payload: { amountCents: 999_000, dueOn: '2999-01-01' },
    });
    expect(editar.statusCode).toBe(404);
  });
});
