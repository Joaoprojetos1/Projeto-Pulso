import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ChatModel } from '../src/ai/chat';
import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { bearer, seedAdminToken } from './helpers';

const PORT = 5501;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-chatmem-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let ADMIN: string;

// modelo dublê que CAPTURA o prompt recebido (para inspecionar a memória)
const captured: Array<{ system: string; turns: Array<{ role: string; content: string }> }> = [];
const chatModel: ChatModel = {
  reply: async (prompt) => {
    captured.push({ system: prompt.system, turns: prompt.turns.map((t) => ({ ...t })) });
    return { text: 'Vale acompanhar o painel de perto.', modelVersion: 'mock-mem' }; // sem números → passa no fiscal
  },
};

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');

  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql, { chatModel });
  await app.ready();
  ADMIN = await seedAdminToken(sql);
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

/** Empresa com um snapshot (diagnóstico) e um alerta enviado. */
async function seedCompany(): Promise<string> {
  const [c] = await sql`INSERT INTO companies (name) VALUES ('Clínica Memória') RETURNING id`;
  const [s] = await sql`
    INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload, diagnosis)
    VALUES (${c.id}, '2026-07-15', 'test',
            ${sql.json({ cash_balance: { key: 'cash_balance', value: 1_500_000, unit: 'cents', inputs: {} } })},
            ${sql.json({ stage: 'pressao', drivers: [], transitions: { previousStage: 'atencao', direction: 'piorou' }, facts: {}, text: { title: 'Sob pressão', body: 'Alguns sinais apertam o caixa.' } })})
    RETURNING id`;
  await sql`
    INSERT INTO alerts (company_id, snapshot_id, rule_key, severity, facts, text_title, text_body)
    VALUES (${c.id}, ${s.id}, 'cash_runway', 'critical', ${sql.json({ zeroOn: '2026-07-29' })},
            'Seu caixa pode zerar em 29 de julho', null)`;
  return c.id as string;
}

const chat = (id: string, content: string) =>
  app.inject({
    method: 'POST',
    url: `/companies/${id}/chat`,
    headers: bearer(ADMIN),
    payload: { messages: [{ role: 'user', content }] },
  });

describe('memória do chat (ponta a ponta)', () => {
  it('continuidade: a 2ª pergunta enxerga a 1ª pergunta e a resposta anterior', async () => {
    captured.length = 0;
    const id = await seedCompany();

    expect((await chat(id, 'Quando meu caixa zera?')).statusCode).toBe(200);
    expect((await chat(id, 'e isso é ruim?')).statusCode).toBe(200);

    // o prompt da 2ª chamada traz o histórico do servidor (memória)
    const turns2 = captured[1]!.turns.map((t) => t.content);
    expect(turns2).toContain('Quando meu caixa zera?');
    expect(turns2).toContain('Vale acompanhar o painel de perto.');
    expect(turns2[turns2.length - 1]).toBe('e isso é ruim?');
  });

  it('referência a alerta passado: o alerta enviado entra no contexto', async () => {
    captured.length = 0;
    const id = await seedCompany();

    await chat(id, 'O que está acontecendo com meu caixa?');
    expect(captured[0]!.system).toMatch(/cash_runway/);
    expect(captured[0]!.system).toMatch(/29 de julho/);
    // e o diagnóstico atual/anterior também viajam na memória
    expect(captured[0]!.system).toMatch(/diagnosticoAtual/);
  });

  it('grava pergunta e resposta no histórico', async () => {
    const id = await seedCompany();
    await chat(id, 'primeira');
    await chat(id, 'segunda');

    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM chat_messages WHERE company_id = ${id}`;
    expect(count).toBe(4); // 2 perguntas + 2 respostas
  });
});
