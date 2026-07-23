import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import type { EmailMessage, Mailer } from '../src/mailer';
import { migrate } from '../src/migrate';

const PORT = 5503;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-pilot-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;

// mailer dublê: captura o e-mail para o teste ler o código de recuperação
const sent: EmailMessage[] = [];
const mailer: Mailer = { send: async (m) => void sent.push(m) };

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');

  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql, { mailer });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

describe('recuperação de senha', () => {
  const email = 'dona@clinica-reset.com.br';
  const senhaAntiga = 'senha-antiga-123';
  const senhaNova = 'senha-nova-456';

  it('fluxo completo: pede código, redefine e entra com a senha nova', async () => {
    // cria a conta
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { businessName: 'Clínica Reset', email, password: senhaAntiga },
    });
    expect(signup.statusCode).toBe(201);

    // pede o código
    sent.length = 0;
    const forgot = await app.inject({ method: 'POST', url: '/auth/forgot-password', payload: { email } });
    expect(forgot.statusCode).toBe(200);
    expect(sent).toHaveLength(1);

    // extrai o token (64 hex) do e-mail capturado
    const token = sent[0]!.text.match(/[a-f0-9]{64}/)?.[0];
    expect(token).toBeTruthy();

    // redefine
    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token, password: senhaNova },
    });
    expect(reset.statusCode).toBe(200);

    // a senha nova entra; a antiga não
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: senhaNova } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: senhaAntiga } })).statusCode).toBe(401);

    // o mesmo token não vale de novo (uso único)
    const reuse = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token, password: 'outra-senha-789' },
    });
    expect(reuse.statusCode).toBe(400);
  });

  it('token inválido: 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: { token: 'a'.repeat(64), password: 'qualquer-senha-1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('e-mail desconhecido: 200 sem revelar, e nenhum e-mail enviado', async () => {
    sent.length = 0;
    const res = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: { email: 'ninguem@lugar-nenhum.com' },
    });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(0);
  });
});

// cria um dono, promove a admin e devolve o token de sessão (para as rotas /admin)
async function adminToken(email: string): Promise<string> {
  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Operação', email, password: 'senha-admin-123' },
  });
  await sql`UPDATE users SET role = 'admin' WHERE email = ${email}`;
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'senha-admin-123' },
  });
  void signup;
  return login.json().token as string;
}

describe('GET /admin/pilot-metrics', () => {
  it('conta, por empresa, os sinais do piloto nos últimos 30 dias', async () => {
    const token = await adminToken('op-pilot@pulso.com');
    const [c] = await sql`INSERT INTO companies (name) VALUES ('Clínica Piloto') RETURNING id`;
    const id = c.id as string;

    await sql`
      INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count)
      VALUES (${id}, 'test', '2026-07-01', '2026-07-15', 'hash-1', 3)`;

    const [s] = await sql`
      INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload)
      VALUES (${id}, '2026-07-15', 'test', ${sql.json({})}) RETURNING id`;
    await sql`
      INSERT INTO alerts (company_id, snapshot_id, rule_key, severity, facts, pushed_at, opened_at)
      VALUES (${id}, ${s.id}, 'cash_runway', 'critical', ${sql.json({})}, now(), now())`;

    await sql`INSERT INTO chat_messages (company_id, role, content) VALUES (${id}, 'user', 'quando zera?')`;
    await sql`INSERT INTO chat_messages (company_id, role, content) VALUES (${id}, 'assistant', 'em 29 de julho')`;
    await sql`INSERT INTO chat_messages (company_id, role, content) VALUES (${id}, 'user', 'e agora?')`;

    await sql`INSERT INTO planned_entries (company_id, kind, amount_cents, due_on) VALUES (${id}, 'payable', 1000, '2026-08-01')`;
    await sql`
      INSERT INTO planned_entries (company_id, kind, amount_cents, due_on, status, confirmed_on)
      VALUES (${id}, 'receivable', 2000, '2026-07-10', 'realizada', current_date)`;

    const res = await app.inject({
      method: 'GET',
      url: '/admin/pilot-metrics',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const mine = res.json().metrics.find((m: { companyId: string }) => m.companyId === id);
    expect(mine.last30Days).toEqual({
      importsReceived: 1,
      alertsSent: 1,
      alertsOpened: 1,
      chatQuestions: 2, // só as mensagens do dono (role='user')
      plannedCreated: 2,
      plannedConfirmed: 1,
    });
  });
});
