import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clinicaSaudavel, clinicaTesoura } from '@pulso/fixtures';
import type { CompanySnapshot } from '@pulso/core';
import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

const PORT = 5499;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-test');

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
  app = buildApp(sql);
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

/** Converte um snapshot de fixture no payload de importação da API. */
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
  expect(created.statusCode).toBe(201);
  const companyId = created.json().id as string;

  const imported = await app.inject({
    method: 'POST',
    url: `/companies/${companyId}/imports`,
    payload: toImportPayload(snap),
  });
  expect(imported.statusCode).toBe(201);

  for (const b of snap.balances) {
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/balances`,
      payload: { observedOn: b.observedOn, balanceCents: b.balanceCents },
    });
    expect(res.statusCode).toBe(201);
  }
  return companyId;
}

describe('fluxo completo: clínica da tesoura', () => {
  let companyId: string;

  it('importa os lançamentos e é idempotente (o mesmo arquivo não duplica)', async () => {
    companyId = await setupCompany('Clínica Horizonte', clinicaTesoura);

    const again = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/imports`,
      payload: toImportPayload(clinicaTesoura),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().imported).toBe(false);

    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM entries WHERE company_id = ${companyId}`;
    expect(count).toBe(clinicaTesoura.entries.length);
  });

  it('snapshot: o core roda no servidor e o alerta crítico sai igual ao da fixture', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/snapshots`,
      payload: { asOf: clinicaTesoura.asOf },
    });
    expect(res.statusCode).toBe(201);

    const body = res.json();
    expect(body.coreVersion).toBeDefined();
    const runway = body.alerts.find((a: { ruleKey: string }) => a.ruleKey === 'cash_runway');
    expect(runway).toBeDefined();
    expect(runway.severity).toBe('critical');
    expect(runway.facts.zeroOn).toBe('2026-07-29');
    // sem chave de IA nos testes, o texto padrão assume — o alerta nunca fica mudo
    expect(runway.textTitle).toMatch(/29 de julho/);
    expect(runway.modelVersion).toBe('template-v1');
  });

  it('dashboard: devolve o último snapshot com o pior alerta primeiro', async () => {
    const res = await app.inject({ method: 'GET', url: `/companies/${companyId}/dashboard` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.snapshot.indicators.cash_projection).toBeDefined();
    expect(body.alerts[0].ruleKey).toBe('cash_runway');
    expect(body.alerts[0].severity).toBe('critical');
    // a auditoria viaja junto: os inputs do indicador estão no payload
    expect(body.snapshot.indicators.cash_projection.inputs.openingBalanceCents).toBe(1_500_000);
  });

  it('recalcular o mesmo dia substitui os alertas em vez de duplicar', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/snapshots`,
      payload: { asOf: clinicaTesoura.asOf },
    });
    expect(res.statusCode).toBe(201);

    const [{ count }] = await sql`
      SELECT count(*)::int AS count FROM alerts WHERE company_id = ${companyId}`;
    expect(count).toBe(res.json().alerts.length);
  });
});

describe('fluxo completo: clínica saudável', () => {
  it('nenhum alarme falso: o dashboard mostra all_clear', async () => {
    const companyId = await setupCompany('Clínica Vida Plena', clinicaSaudavel);

    const snap = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/snapshots`,
      payload: { asOf: clinicaSaudavel.asOf },
    });
    expect(snap.statusCode).toBe(201);

    const dash = await app.inject({ method: 'GET', url: `/companies/${companyId}/dashboard` });
    const body = dash.json();
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0].ruleKey).toBe('all_clear');
    expect(body.alerts[0].severity).toBe('ok');
  });
});

describe('bordas', () => {
  it('lista de empresas: o app usa isto para encontrar a clínica', async () => {
    const res = await app.inject({ method: 'GET', url: '/companies' });
    expect(res.statusCode).toBe(200);
    const nomes = res.json().companies.map((c: { name: string }) => c.name);
    expect(nomes).toContain('Clínica Horizonte');
  });

  it('empresa inexistente: 404 com mensagem clara', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/companies/00000000-0000-0000-0000-000000000000/dashboard',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/não encontrada/);
  });

  it('empresa sem dados: snapshot funciona e diz all_clear (sem chutar número)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { name: 'Clínica Recém-Cadastrada' },
    });
    const companyId = created.json().id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/snapshots`,
      payload: { asOf: '2026-07-15' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().alerts[0].ruleKey).toBe('all_clear');
  });

  it('lançamento com dinheiro quebrado (float) é rejeitado na porta', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { name: 'Clínica Teste Validação' },
    });
    const companyId = created.json().id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/imports`,
      payload: {
        periodStart: '2026-07-01',
        periodEnd: '2026-07-15',
        entries: [{ kind: 'receivable', amountCents: 100.5, issuedOn: '2026-07-10' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
