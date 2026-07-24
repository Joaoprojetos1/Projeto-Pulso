import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { clinicaTesoura } from '@pulso/fixtures';
import type { CompanySnapshot } from '@pulso/core';
import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import type { EmailMessage, Mailer } from '../src/mailer';
import { migrate } from '../src/migrate';

const PORT = 5507;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-admin-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;

const sent: EmailMessage[] = [];
const mailer: Mailer = { send: async (m) => void sent.push(m) };

// tokens de sessão preparados uma vez
let adminAuth: string;
let ownerAuth: string;

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

  adminAuth = await signupAndLogin('admin@pulso.com', 'admin');
  ownerAuth = await signupAndLogin('owner@pulso.com', 'owner');
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

// cadastra um dono; se papel='admin', promove; devolve o token de sessão
async function signupAndLogin(email: string, role: 'owner' | 'admin'): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: `Empresa de ${email}`, email, password: 'senha-forte-123' },
  });
  if (role === 'admin') await sql`UPDATE users SET role = 'admin' WHERE email = ${email}`;
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'senha-forte-123' } });
  return login.json().token as string;
}

const authH = (token: string) => ({ authorization: `Bearer ${token}` });

// cria uma empresa cliente com dados e um snapshot calculado
async function companyWithData(name: string, snap: CompanySnapshot): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/companies', payload: { name } });
  const id = created.json().id as string;
  await app.inject({
    method: 'POST',
    url: `/companies/${id}/imports`,
    headers: authH(adminAuth),
    payload: {
      source: 'fixture_json',
      periodStart: '2026-01-01',
      periodEnd: snap.asOf,
      entries: snap.entries.map((e) => ({
        kind: e.kind, amountCents: e.amountCents, issuedOn: e.issuedOn, dueOn: e.dueOn,
        settledOn: e.settledOn, counterparty: e.counterparty, category: e.category,
        costType: e.costType, externalId: e.id,
      })),
    },
  });
  for (const b of snap.balances) {
    await app.inject({ method: 'POST', url: `/companies/${id}/balances`, headers: authH(adminAuth), payload: { observedOn: b.observedOn, balanceCents: b.balanceCents } });
  }
  await app.inject({ method: 'POST', url: `/companies/${id}/snapshots`, headers: authH(adminAuth), payload: { asOf: snap.asOf } });
  return id;
}

describe('guard do admin (404 para não-admin)', () => {
  const rotas: Array<[string, string]> = [
    ['GET', '/admin/overview'],
    ['GET', '/admin/leads'],
    ['GET', '/admin/ai-usage'],
    ['GET', '/admin/pilot-metrics'],
    ['GET', '/admin/health'],
  ];

  it('sem login: todas as rotas /admin respondem 404', async () => {
    for (const [method, url] of rotas) {
      const res = await app.inject({ method: method as 'GET', url });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it('dono comum (owner): todas respondem 404', async () => {
    for (const [method, url] of rotas) {
      const res = await app.inject({ method: method as 'GET', url, headers: authH(ownerAuth) });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
  });

  it('admin: as rotas respondem 200', async () => {
    for (const [method, url] of rotas) {
      const res = await app.inject({ method: method as 'GET', url, headers: authH(adminAuth) });
      expect(res.statusCode, `${method} ${url}`).toBe(200);
    }
  });
});

describe('GET /admin/overview', () => {
  it('lista as empresas, ordenadas por mais tempo sem dado', async () => {
    await companyWithData('Clínica Com Dados', clinicaTesoura);
    // uma empresa sem nenhum import: deve vir antes (nunca importou = mais urgente)
    await sql`INSERT INTO companies (name) VALUES ('Clínica Sem Dados')`;

    const res = await app.inject({ method: 'GET', url: '/admin/overview', headers: authH(adminAuth) });
    expect(res.statusCode).toBe(200);
    const companies = res.json().companies as Array<{ name: string; daysSinceImport: number | null; stage: string | null }>;

    const semDados = companies.find((c) => c.name === 'Clínica Sem Dados');
    const comDados = companies.find((c) => c.name === 'Clínica Com Dados');
    expect(semDados!.daysSinceImport).toBeNull();
    expect(comDados!.daysSinceImport).not.toBeNull();
    // a que nunca importou aparece antes da que tem dado recente
    expect(companies.indexOf(semDados!)).toBeLessThan(companies.indexOf(comDados!));
    // a com dados tem um estágio de diagnóstico calculado
    expect(comDados!.stage).toBeTruthy();
  });
});

describe('GET /admin/companies/:id (dossiê)', () => {
  it('traz snapshot, alertas, imports e consumo; id desconhecido = 404', async () => {
    const id = await companyWithData('Clínica Dossiê', clinicaTesoura);
    const res = await app.inject({ method: 'GET', url: `/admin/companies/${id}`, headers: authH(adminAuth) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.company.id).toBe(id);
    expect(body.snapshot).not.toBeNull();
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.imports.length).toBeGreaterThan(0);

    const desconhecida = await app.inject({
      method: 'GET',
      url: '/admin/companies/00000000-0000-0000-0000-000000000000',
      headers: authH(adminAuth),
    });
    expect(desconhecida.statusCode).toBe(404);
  });
});

describe('escritas do admin geram auditoria', () => {
  it('PATCH /admin/companies/:id edita e audita', async () => {
    const id = await companyWithData('Clínica Editável', clinicaTesoura);
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/companies/${id}`,
      headers: authH(adminAuth),
      payload: { chatQuota: 200, planId: 'pro', subscriptionStatus: 'ativa' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().chatQuota).toBe(200);
    expect(res.json().planId).toBe('pro');
    expect(res.json().subscriptionStatus).toBe('ativa');

    const [company] = await sql`
      SELECT chat_quota_monthly, plan_id, subscription_status FROM companies WHERE id = ${id}`;
    expect(company.chat_quota_monthly).toBe(200);
    expect(company.plan_id).toBe('pro');
    expect(company.subscription_status).toBe('ativa');

    const [audit] = await sql`
      SELECT action, target_type, target_id FROM admin_audit
      WHERE action = 'company.update' AND target_id = ${id}`;
    expect(audit).toBeTruthy();
    expect(audit.target_type).toBe('company');
  });

  it('POST /admin/companies/:id/reprocess recalcula e audita', async () => {
    const id = await companyWithData('Clínica Reprocessa', clinicaTesoura);
    const res = await app.inject({
      method: 'POST',
      url: `/admin/companies/${id}/reprocess`,
      headers: authH(adminAuth),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().snapshotId).toBeTruthy();

    const [audit] = await sql`
      SELECT 1 FROM admin_audit WHERE action = 'company.reprocess' AND target_id = ${id}`;
    expect(audit).toBeTruthy();
  });

  it('POST /admin/users/:id/reset-password dispara o fluxo e audita', async () => {
    const [user] = await sql`SELECT id FROM users WHERE email = 'owner@pulso.com'`;
    sent.length = 0;
    const res = await app.inject({
      method: 'POST',
      url: `/admin/users/${user.id}/reset-password`,
      headers: authH(adminAuth),
    });
    expect(res.statusCode).toBe(200);
    // o e-mail de recuperação saiu (fluxo reusado)
    expect(sent).toHaveLength(1);

    const [audit] = await sql`
      SELECT 1 FROM admin_audit WHERE action = 'user.reset_password' AND target_id = ${user.id}`;
    expect(audit).toBeTruthy();
  });

  it('GET/PATCH /admin/leads lista e muda status, com auditoria', async () => {
    await app.inject({
      method: 'POST',
      url: '/interesse',
      payload: { email: 'lead@empresa.com', name: 'Fulano', phone: '31999998888' },
    });
    const list = await app.inject({ method: 'GET', url: '/admin/leads', headers: authH(adminAuth) });
    expect(list.statusCode).toBe(200);
    const lead = (list.json().leads as Array<{ id: string; email: string; status: string }>).find(
      (l) => l.email === 'lead@empresa.com',
    );
    expect(lead).toBeTruthy();
    expect(lead!.status).toBe('novo');

    const patch = await app.inject({
      method: 'PATCH',
      url: `/admin/leads/${lead!.id}`,
      headers: authH(adminAuth),
      payload: { status: 'contatado' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe('contatado');

    const [audit] = await sql`
      SELECT 1 FROM admin_audit WHERE action = 'lead.update' AND target_id = ${lead!.id}`;
    expect(audit).toBeTruthy();
  });
});

describe('GET /admin/health', () => {
  it('devolve versão do core e um último snapshot', async () => {
    await companyWithData('Clínica Saúde', clinicaTesoura);
    const res = await app.inject({ method: 'GET', url: '/admin/health', headers: authH(adminAuth) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.coreVersion).toBeTruthy();
    expect(body.lastSnapshotAt).not.toBeNull();
  });
});
