/**
 * Semeia o banco com as duas clínicas fictícias (fixtures) e calcula o
 * snapshot de cada uma — deixa o servidor pronto para o app mostrar.
 *
 * Uso:  DATABASE_URL=... pnpm seed   (ou com o banco local: pnpm db + pnpm seed)
 */

import { clinicaSaudavel, clinicaTesoura } from '@pulso/fixtures';
import type { CompanySnapshot } from '@pulso/core';

import { buildApp } from '../src/app';
import { createSql } from '../src/db';
import { migrate } from '../src/migrate';

const url = process.env.DATABASE_URL ?? 'postgres://pulso:pulso@localhost:5433/pulso';
const sql = createSql(url);
await migrate(sql);
const app = buildApp(sql);
await app.ready();

async function seed(nome: string, snap: CompanySnapshot): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/companies', payload: { name: nome } });
  const companyId = created.json().id as string;

  await app.inject({
    method: 'POST',
    url: `/companies/${companyId}/imports`,
    payload: {
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
    },
  });

  for (const b of snap.balances) {
    await app.inject({
      method: 'POST',
      url: `/companies/${companyId}/balances`,
      payload: { observedOn: b.observedOn, balanceCents: b.balanceCents },
    });
  }

  await app.inject({
    method: 'POST',
    url: `/companies/${companyId}/snapshots`,
    payload: { asOf: snap.asOf },
  });

  return companyId;
}

const tesouraId = await seed('Clínica Horizonte', clinicaTesoura);
const saudavelId = await seed('Clínica Vida Plena', clinicaSaudavel);

// marca como demonstração: a área de operação (admin) nunca deve tratar dado
// de teste como cliente real.
await sql`UPDATE companies SET is_demo = true WHERE id IN (${tesouraId}, ${saudavelId})`;

console.log('Clínicas de demonstração prontas:');
console.log(`  Clínica Horizonte (tesoura):    ${tesouraId}`);
console.log(`  Clínica Vida Plena (saudável):  ${saudavelId}`);

await app.close();
await sql.end();
