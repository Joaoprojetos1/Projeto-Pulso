import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ChatModel } from '../src/ai/chat';
import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { saoPauloMonthWindow } from '../src/quota';

const PORT = 5499;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-quota-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;

// modelo dublê: responde SEM números (passa no fiscal) e reporta consumo, para
// que uma pergunta bem-sucedida grave uma linha kind='chat' em ai_usage.
const chatModel: ChatModel = {
  reply: async () => ({
    text: 'Vale acompanhar o painel e negociar prazos com seus fornecedores.',
    modelVersion: 'mock-quota-1',
    usage: { model: 'mock-quota-1', inputTokens: 10, outputTokens: 20 },
  }),
};

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
  app = buildApp(sql, { chatModel });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

/** Cria uma empresa (com cota opcional) já com um snapshot, para o chat responder. */
async function novaEmpresa(quota?: number): Promise<string> {
  const [c] =
    quota === undefined
      ? await sql`INSERT INTO companies (name) VALUES ('Clínica Teste') RETURNING id`
      : await sql`INSERT INTO companies (name, chat_quota_monthly) VALUES ('Clínica Teste', ${quota}) RETURNING id`;
  await sql`
    INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload)
    VALUES (${c.id}, '2026-07-15', 'test',
            ${sql.json({ cash_balance: { key: 'cash_balance', value: 1_500_000, unit: 'cents', inputs: {} } })})`;
  return c.id as string;
}

/** Semeia N chamadas de IA já registradas, num instante dado. */
async function semear(
  companyId: string,
  kind: 'chat' | 'alert_writer',
  n: number,
  when: Date,
): Promise<void> {
  for (let i = 0; i < n; i++) {
    await sql`
      INSERT INTO ai_usage (company_id, kind, model, input_tokens, output_tokens, created_at)
      VALUES (${companyId}, ${kind}, 'seed', 0, 0, ${when})`;
  }
}

function perguntar(companyId: string) {
  return app.inject({
    method: 'POST',
    url: `/companies/${companyId}/chat`,
    payload: { messages: [{ role: 'user', content: 'Como está meu caixa?' }] },
  });
}

async function contarChat(companyId: string): Promise<number> {
  const j = saoPauloMonthWindow();
  const [row] = await sql`
    SELECT count(*)::int AS n FROM ai_usage
    WHERE company_id = ${companyId} AND kind = 'chat'
      AND created_at >= ${j.start} AND created_at < ${j.nextStart}`;
  return row.n as number;
}

const esteMes = () => saoPauloMonthWindow().start;
const mesPassado = () => new Date(saoPauloMonthWindow().start.getTime() - 24 * 60 * 60 * 1000);

describe('cota mensal do chat', () => {
  it('DENTRO da cota: responde e conta mais uma pergunta', async () => {
    const id = await novaEmpresa(3);
    await semear(id, 'chat', 1, esteMes()); // usou 1 de 3

    const res = await perguntar(id);
    expect(res.statusCode).toBe(200);
    expect(res.json().reply).toContain('painel');
    // a pergunta bem-sucedida foi registrada: 1 semeada + 1 agora = 2
    expect(await contarChat(id)).toBe(2);
  });

  it('EXATAMENTE na cota: 402 sem chamar a IA, com corpo estruturado', async () => {
    const id = await novaEmpresa(3);
    await semear(id, 'chat', 3, esteMes()); // atingiu 3 de 3
    await semear(id, 'alert_writer', 4, esteMes()); // alerta NUNCA conta

    const res = await perguntar(id);
    expect(res.statusCode).toBe(402);
    expect(res.json()).toEqual({
      error: 'quota_exceeded',
      used: 3,
      quota: 3,
      resetsOn: saoPauloMonthWindow().resetsOn,
    });
    // barrado antes da IA: nenhuma pergunta nova registrada
    expect(await contarChat(id)).toBe(3);
  });

  it('ACIMA da cota: 402 com o total usado', async () => {
    const id = await novaEmpresa(2);
    await semear(id, 'chat', 5, esteMes());

    const res = await perguntar(id);
    expect(res.statusCode).toBe(402);
    expect(res.json().used).toBe(5);
    expect(res.json().quota).toBe(2);
  });

  it('VIRADA DE MÊS: uso do mês passado não conta, a conversa volta a responder', async () => {
    const id = await novaEmpresa(1);
    await semear(id, 'chat', 3, mesPassado()); // 3 no mês passado, 0 neste mês

    const res = await perguntar(id);
    expect(res.statusCode).toBe(200);
    // só a pergunta de agora conta no mês corrente
    expect(await contarChat(id)).toBe(1);
  });

  it('cota é configurável por empresa; o padrão é 50', async () => {
    const id = await novaEmpresa(); // sem definir
    const [row] = await sql`SELECT chat_quota_monthly FROM companies WHERE id = ${id}`;
    expect(row.chat_quota_monthly).toBe(50);
  });
});

describe('janela do mês (fuso de São Paulo)', () => {
  it('mês no meio do ano: renova no 1º do mês seguinte', () => {
    const j = saoPauloMonthWindow(new Date('2026-07-15T12:00:00Z'));
    expect(j.resetsOn).toBe('2026-08-01');
  });

  it('dezembro: renova no 1º de janeiro do ano seguinte', () => {
    const j = saoPauloMonthWindow(new Date('2026-12-20T12:00:00Z'));
    expect(j.resetsOn).toBe('2027-01-01');
  });

  it('usa o calendário de SP, não o UTC (virada de dia à meia-noite)', () => {
    // 2026-08-01T02:00Z ainda é 31/07 23:00 em São Paulo → mês de julho
    const instante = new Date('2026-08-01T02:00:00Z');
    const j = saoPauloMonthWindow(instante);
    expect(j.resetsOn).toBe('2026-08-01');
    expect(instante.getTime()).toBeGreaterThanOrEqual(j.start.getTime());
    expect(instante.getTime()).toBeLessThan(j.nextStart.getTime());
  });
});
