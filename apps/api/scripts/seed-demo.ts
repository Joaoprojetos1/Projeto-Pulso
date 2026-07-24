/**
 * Semeia o banco com as duas clínicas fictícias (fixtures) e calcula o
 * snapshot de cada uma — deixa o servidor pronto para o app mostrar.
 *
 * Insere direto pelo banco e chama o motor (computeAndStore), sem passar pelas
 * rotas HTTP: a superfície /companies/:id/* é de operador (exige admin) e o
 * seed não deve criar um usuário admin fantasma no banco de produção.
 *
 * Uso:  DATABASE_URL=... pnpm seed   (ou com o banco local: pnpm db + pnpm seed)
 */

import { clinicaSaudavel, clinicaTesoura } from '@pulso/fixtures';
import type { CompanySnapshot } from '@pulso/core';

import { createSql } from '../src/db';
import type { CompanyRow } from '../src/http';
import { migrate } from '../src/migrate';
import { computeAndStore } from '../src/routes/snapshots';

const url = process.env.DATABASE_URL ?? 'postgres://pulso:pulso@localhost:5433/pulso';
const sql = createSql(url);
await migrate(sql);

async function seed(nome: string, snap: CompanySnapshot): Promise<string> {
  const [company] = await sql`
    INSERT INTO companies (name) VALUES (${nome})
    RETURNING id, name, cnpj, niche, declared_fixed_cost_cents, created_at`;

  const [imp] = await sql`
    INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count)
    VALUES (${company.id}, 'fixture_json', '2026-01-01', ${snap.asOf},
            ${`seed-${company.id}`}, ${snap.entries.length})
    RETURNING id`;

  const rows = snap.entries.map((e) => ({
    company_id: company.id,
    import_id: imp.id,
    kind: e.kind,
    amount_cents: e.amountCents,
    issued_on: e.issuedOn,
    due_on: e.dueOn,
    settled_on: e.settledOn ?? null,
    counterparty: e.counterparty ?? null,
    category: e.category ?? null,
    cost_type: e.costType ?? null,
    external_id: e.id,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await sql`INSERT INTO entries ${sql(rows.slice(i, i + 500))}`;
  }

  for (const b of snap.balances) {
    await sql`
      INSERT INTO cash_balances (company_id, observed_on, balance_cents)
      VALUES (${company.id}, ${b.observedOn}, ${b.balanceCents})
      ON CONFLICT (company_id, observed_on)
      DO UPDATE SET balance_cents = EXCLUDED.balance_cents`;
  }

  await computeAndStore(sql, company as CompanyRow, snap.asOf, null, null);
  return company.id as string;
}

const tesouraId = await seed('Clínica Horizonte', clinicaTesoura);
const saudavelId = await seed('Clínica Vida Plena', clinicaSaudavel);

// marca como demonstração: a área de operação (admin) nunca deve tratar dado
// de teste como cliente real.
await sql`UPDATE companies SET is_demo = true WHERE id IN (${tesouraId}, ${saudavelId})`;

console.log('Clínicas de demonstração prontas:');
console.log(`  Clínica Horizonte (tesoura):    ${tesouraId}`);
console.log(`  Clínica Vida Plena (saudável):  ${saudavelId}`);

await sql.end();
