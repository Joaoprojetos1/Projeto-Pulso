import fastify from 'fastify';

import type { Sql } from './db';
import { registerCompanies } from './routes/companies';
import { registerData } from './routes/data';
import { registerSnapshots } from './routes/snapshots';

export function buildApp(sql: Sql, opts: { logger?: boolean } = {}) {
  const app = fastify({ logger: opts.logger ?? false });

  app.get('/health', async () => ({ ok: true }));

  registerCompanies(app, sql);
  registerData(app, sql);
  registerSnapshots(app, sql);

  return app;
}
