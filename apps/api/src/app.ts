import fastify from 'fastify';

import type { ChatModel } from './ai/chat';
import type { AlertWriterModel } from './ai/writer';
import type { Sql } from './db';
import type { PushSender } from './push';
import { registerAuth } from './routes/auth';
import { registerChat } from './routes/chat';
import { registerCompanies } from './routes/companies';
import { registerData } from './routes/data';
import { registerDevices } from './routes/devices';
import { registerPlanned } from './routes/planned';
import { registerSnapshots } from './routes/snapshots';

export interface AppOptions {
  logger?: boolean;
  /** Sem writer (null), os alertas usam o texto padrão determinístico. */
  alertWriter?: AlertWriterModel | null;
  /** Sem modelo (null), a conversa responde com o aviso honesto. */
  chatModel?: ChatModel | null;
  /** Sem enviador (null), nada é entregue no celular (o cálculo segue igual). */
  pushSender?: PushSender | null;
}

export function buildApp(sql: Sql, opts: AppOptions = {}) {
  const app = fastify({ logger: opts.logger ?? false });

  app.get('/health', async () => ({ ok: true }));

  registerAuth(app, sql, opts.chatModel ?? null);
  registerPlanned(app, sql);
  registerCompanies(app, sql);
  registerData(app, sql);
  registerSnapshots(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerDevices(app, sql, opts.pushSender ?? null);
  registerChat(app, sql, opts.chatModel ?? null);

  return app;
}
