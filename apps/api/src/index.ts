import { existsSync, readFileSync } from 'node:fs';

import { buildApp } from './app';
import { createSql } from './db';
import { migrate } from './migrate';

// conveniência de dev: carrega .env local se existir (sem sobrescrever o ambiente)
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL (veja .env.example). Para subir um banco local: pnpm db');
  process.exit(1);
}

const sql = createSql(url);
const applied = await migrate(sql);
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);

const app = buildApp(sql, { logger: true });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '127.0.0.1' });
