import cors from '@fastify/cors';
import fastify from 'fastify';

import type { ChatModel } from './ai/chat';
import type { AlertWriterModel } from './ai/writer';
import type { Sql } from './db';
import type { Mailer } from './mailer';
import type { PushSender } from './push';
import { registerAdmin } from './routes/admin';
import { registerAuth } from './routes/auth';
import { registerAvatar } from './routes/avatar';
import { registerChat } from './routes/chat';
import { registerCompanies } from './routes/companies';
import { registerData } from './routes/data';
import { registerDevices } from './routes/devices';
import { registerInterest } from './routes/interest';
import { registerPlanned } from './routes/planned';
import { registerSimulate } from './routes/simulate';
import { registerSnapshots } from './routes/snapshots';
import { registerSubscription } from './routes/subscription';

export interface AppOptions {
  logger?: boolean;
  /** Sem writer (null), os alertas usam o texto padrão determinístico. */
  alertWriter?: AlertWriterModel | null;
  /** Sem modelo (null), a conversa responde com o aviso honesto. */
  chatModel?: ChatModel | null;
  /** Sem enviador (null), nada é entregue no celular (o cálculo segue igual). */
  pushSender?: PushSender | null;
  /** Envio de e-mail (recuperação de senha). Sem opção, resolve pelo ambiente (log em dev). */
  mailer?: Mailer;
}

export function buildApp(sql: Sql, opts: AppOptions = {}) {
  const app = fastify({ logger: opts.logger ?? false });

  // o site (outra origem) chama a API do navegador; auth é por Bearer, não cookie
  app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));

  registerAuth(app, sql, opts.chatModel ?? null, opts.mailer);
  registerAdmin(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerInterest(app, sql);
  registerPlanned(app, sql);
  registerCompanies(app, sql);
  registerData(app, sql);
  registerSnapshots(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerSubscription(app, sql);
  registerSimulate(app, sql);
  registerDevices(app, sql, opts.pushSender ?? null);
  registerChat(app, sql, opts.chatModel ?? null);
  registerAvatar(app, sql);

  return app;
}
