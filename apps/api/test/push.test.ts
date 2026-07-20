import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clinicaTesoura } from '@pulso/fixtures';
import type { CompanySnapshot } from '@pulso/core';
import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { isExpoPushToken, type PushMessage, type PushResult, type PushSender } from '../src/push';

const PORT = 5497;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-push-test');
const TOKEN = 'ExponentPushToken[abcDEF123ghiJKL456]';

/** Enviador de teste: não bate na rede, só guarda o que seria enviado. */
class FakePushSender implements PushSender {
  public enviadas: PushMessage[] = [];
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    this.enviadas.push(...messages);
    return messages.map(() => ({ ok: true, id: 'fake' }));
  }
}

let pg: EmbeddedPostgres;
let sql: Sql;
let push: FakePushSender;
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
  push = new FakePushSender();
  app = buildApp(sql, { pushSender: push });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
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

describe('formato do endereço de push', () => {
  it('aceita ExponentPushToken e ExpoPushToken', () => {
    expect(isExpoPushToken('ExponentPushToken[xxx]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[xxx]')).toBe(true);
  });
  it('rejeita qualquer outra coisa', () => {
    expect(isExpoPushToken('sei-la-o-que')).toBe(false);
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(123)).toBe(false);
  });
});

describe('entrega do aviso no celular', () => {
  let companyId: string;

  it('registra o aparelho (endereço válido) e rejeita endereço inválido', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { name: 'Clínica Horizonte' },
    });
    companyId = created.json().id as string;

    const ruim = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/devices`,
      payload: { token: 'nao-eh-token', platform: 'android' },
    });
    expect(ruim.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/devices`,
      payload: { token: TOKEN, platform: 'android' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().registered).toBe(true);

    // registrar de novo não duplica (o aparelho é o mesmo)
    await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/devices`,
      payload: { token: TOKEN, platform: 'android' },
    });
    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM device_tokens WHERE company_id = ${companyId}`;
    expect(count).toBe(1);
  });

  it('o snapshot da tesoura entrega o alerta crítico no aparelho e marca pushed_at', async () => {
    await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/imports`,
      payload: toImportPayload(clinicaTesoura),
    });
    for (const b of clinicaTesoura.balances) {
      await app.inject({
        method: 'POST',
        url: `/companies/${companyId}/balances`,
        payload: { observedOn: b.observedOn, balanceCents: b.balanceCents },
      });
    }

    push.enviadas = [];
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/snapshots`,
      payload: { asOf: clinicaTesoura.asOf },
    });
    expect(res.statusCode).toBe(201);

    // chegou push do alerta crítico, endereçado ao aparelho registrado
    expect(push.enviadas.length).toBeGreaterThan(0);
    expect(push.enviadas.every((m) => m.to === TOKEN)).toBe(true);
    const critico = push.enviadas.find((m) => (m.data as { ruleKey?: string })?.ruleKey === 'cash_runway');
    expect(critico).toBeDefined();
    expect(critico!.body).toMatch(/29 de julho/);

    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM alerts
      WHERE company_id = ${companyId} AND rule_key = 'cash_runway' AND pushed_at IS NOT NULL`;
    expect(count).toBe(1);
  });

  it('recalcular o mesmo tipo de alerta em 12h NÃO reenvia (anti-spam)', async () => {
    push.enviadas = [];
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/snapshots`,
      payload: { asOf: clinicaTesoura.asOf },
    });
    expect(res.statusCode).toBe(201);
    // cash_runway já foi avisado há instantes → não repete
    const repetido = push.enviadas.find((m) => (m.data as { ruleKey?: string })?.ruleKey === 'cash_runway');
    expect(repetido).toBeUndefined();
  });

  it('empresa saudável (sem alerta sério) não dispara push', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { name: 'Clínica Sem Aparelho' },
    });
    const id = created.json().id as string;
    await app.inject({ method: 'POST', url: `/companies/${id}/devices`, payload: { token: 'ExponentPushToken[outro]' } });

    push.enviadas = [];
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${id}/snapshots`,
      payload: { asOf: '2026-07-15' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().alerts[0].ruleKey).toBe('all_clear');
    expect(push.enviadas).toHaveLength(0);
  });

  it('push-test envia para o aparelho registrado', async () => {
    push.enviadas = [];
    const res = await app.inject({ method: 'POST', url: `/companies/${companyId}/push-test` });
    expect(res.statusCode).toBe(200);
    expect(res.json().sent).toBe(1);
    expect(push.enviadas[0]!.title).toMatch(/teste/i);
  });
});
