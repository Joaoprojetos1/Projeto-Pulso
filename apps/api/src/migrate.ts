import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSql, type Sql } from './db';

/**
 * Aplica o schema.sql uma única vez, registrado em `schema_migrations`.
 * Migração é append-only: mudança de schema vira um arquivo novo, nunca
 * edição do já aplicado.
 */
const MIGRATIONS: Array<[name: string, file: string]> = [
  ['0001_schema', 'schema.sql'],
  ['0002_devices', '0002_devices.sql'],
  ['0003_auth', '0003_auth.sql'],
  ['0004_planned_entries', '0004_planned_entries.sql'],
  ['0005_interest', '0005_interest.sql'],
  ['0006_ai_usage', '0006_ai_usage.sql'],
  ['0007_chat_quota', '0007_chat_quota.sql'],
  ['0008_diagnosis', '0008_diagnosis.sql'],
  ['0009_chat_history', '0009_chat_history.sql'],
  ['0010_password_reset', '0010_password_reset.sql'],
];

export async function migrate(sql: Sql): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const applied: string[] = [];

  for (const [name, file] of MIGRATIONS) {
    const [exists] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name}`;
    if (exists) continue;

    const ddl = readFileSync(path.join(here, '..', file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    applied.push(name);
  }

  return applied;
}

// execução direta: `pnpm migrate`
const runDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('src/migrate.ts');
if (runDirectly) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Defina DATABASE_URL antes de migrar (veja .env.example).');
    process.exit(1);
  }
  const sql = createSql(url);
  const applied = await migrate(sql);
  console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Nada a migrar.');
  await sql.end();
}
