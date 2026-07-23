import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clinicaTesoura } from '@pulso/fixtures';
import type { CompanySnapshot } from '@pulso/core';
import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { ChatModel } from '../src/ai/chat';
import type { AlertWriterModel } from '../src/ai/writer';
import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

const PORT = 5495;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-ai-usage-test');

/**
 * Escritor de teste: NÃO bate na Anthropic. Devolve um texto sem números
 * (passa no fiscal para qualquer alerta) e o `usage` que a API real traria —
 * é isso que estamos medindo.
 */
const WRITER_USAGE = { model: 'claude-opus-4-8', inputTokens: 210, outputTokens: 45 };
class FakeAlertWriter implements AlertWriterModel {
  async write() {
    return {
      title: 'Atenção ao seu caixa',
      body: 'Vale conferir o painel agora.',
      modelVersion: WRITER_USAGE.model,
      usage: WRITER_USAGE,
    };
  }
}

const CHAT_USAGE = { model: 'claude-opus-4-8', inputTokens: 512, outputTokens: 120 };
class FakeChatModel implements ChatModel {
  async reply() {
    return {
      text: 'Dá uma olhada no seu painel; os números estão todos lá, calculados.',
      modelVersion: CHAT_USAGE.model,
      usage: CHAT_USAGE,
    };
  }
}

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
  app = buildApp(sql, { alertWriter: new FakeAlertWriter(), chatModel: new FakeChatModel() });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

afterEach(() => {
  delete process.env.PULSO_ADMIN_TOKEN;
});

function toImportPayload(snap: CompanySnapshot) {
  return {
    source: 'fixture_json',
    periodStart: '2026-01-01',
    periodEnd: snap.asOf,
    entries: snap.entries.map((e) => ({
      kind: e.kind,
      amountCents: e.amountCents,
      issuedOn: e.issuedOn,
      dueOn: e.dueOn,
      settledOn: e.settledOn,
      counterparty: e.counterparty,
      category: e.category,
      costType: e.costType,
      externalId: e.id,
    })),
  };
}

async function setupCompany(name: string, snap: CompanySnapshot): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/companies', payload: { name } });
  const companyId = created.json().id as string;
  await app.inject({
    method: 'POST',
    url: `/companies/${companyId}/imports`,
    payload: toImportPayload(snap),
  });
  for (const b of snap.balances) {
    await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/balances`,
      payload: { observedOn: b.observedOn, balanceCents: b.balanceCents },
    });
  }
  return companyId;
}

describe('medição do consumo da IA', () => {
  let companyId: string;
  let numAlertas: number;

  it('o snapshot registra uma linha de consumo por alerta redigido (kind=alert_writer)', async () => {
    companyId = await setupCompany('Clínica Horizonte', clinicaTesoura);

    const snap = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/snapshots`,
      payload: { asOf: clinicaTesoura.asOf },
    });
    expect(snap.statusCode).toBe(201);
    numAlertas = snap.json().alerts.length;
    expect(numAlertas).toBeGreaterThan(0);

    const rows = await sql`
      SELECT kind::text AS kind, model, input_tokens, output_tokens
      FROM ai_usage WHERE company_id = ${companyId} AND kind = 'alert_writer'`;
    expect(rows).toHaveLength(numAlertas);
    for (const r of rows) {
      expect(r.kind).toBe('alert_writer');
      expect(r.model).toBe(WRITER_USAGE.model);
      expect(r.input_tokens).toBe(WRITER_USAGE.inputTokens);
      expect(r.output_tokens).toBe(WRITER_USAGE.outputTokens);
    }
  });

  it('a conversa registra uma linha de consumo (kind=chat)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/chat`,
      payload: { messages: [{ role: 'user', content: 'Como está meu caixa?' }] },
    });
    expect(res.statusCode).toBe(200);

    const [row] = await sql`
      SELECT kind::text AS kind, model, input_tokens, output_tokens
      FROM ai_usage WHERE company_id = ${companyId} AND kind = 'chat'`;
    expect(row.kind).toBe('chat');
    expect(row.model).toBe(CHAT_USAGE.model);
    expect(row.input_tokens).toBe(CHAT_USAGE.inputTokens);
    expect(row.output_tokens).toBe(CHAT_USAGE.outputTokens);
  });

  it('GET /admin/ai-usage agrega por empresa, tipo, modelo e mês', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/ai-usage' });
    expect(res.statusCode).toBe(200);

    const usage = res.json().usage as Array<{
      companyId: string;
      companyName: string | null;
      kind: string;
      model: string;
      month: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;

    const writer = usage.find((u) => u.companyId === companyId && u.kind === 'alert_writer');
    expect(writer).toBeDefined();
    expect(writer!.companyName).toBe('Clínica Horizonte');
    expect(writer!.model).toBe(WRITER_USAGE.model);
    expect(writer!.month).toMatch(/^\d{4}-\d{2}$/);
    expect(writer!.calls).toBe(numAlertas);
    expect(writer!.inputTokens).toBe(WRITER_USAGE.inputTokens * numAlertas);
    expect(writer!.outputTokens).toBe(WRITER_USAGE.outputTokens * numAlertas);
    expect(writer!.totalTokens).toBe(
      (WRITER_USAGE.inputTokens + WRITER_USAGE.outputTokens) * numAlertas,
    );

    const chat = usage.find((u) => u.companyId === companyId && u.kind === 'chat');
    expect(chat).toBeDefined();
    expect(chat!.calls).toBe(1);
    expect(chat!.totalTokens).toBe(CHAT_USAGE.inputTokens + CHAT_USAGE.outputTokens);
  });

  it('a guarda do endpoint: com PULSO_ADMIN_TOKEN setado, exige o header', async () => {
    process.env.PULSO_ADMIN_TOKEN = 'segredo-interno';

    const semHeader = await app.inject({ method: 'GET', url: '/admin/ai-usage' });
    expect(semHeader.statusCode).toBe(401);

    const comHeader = await app.inject({
      method: 'GET',
      url: '/admin/ai-usage',
      headers: { 'x-admin-token': 'segredo-interno' },
    });
    expect(comHeader.statusCode).toBe(200);
  });
});
