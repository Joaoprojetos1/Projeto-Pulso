import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import fastify, { type FastifyError } from 'fastify';

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
  const app = fastify({
    logger: (opts.logger ?? false)
      ? {
          level: process.env.LOG_LEVEL ?? 'info',
          // LGPD/segurança: credenciais NUNCA vão para o log de requisição.
          // (O Fastify já não registra corpo nem headers gerais; isto blinda os
          // sensíveis caso um serializer futuro os inclua.)
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-webhook-secret"]',
              'req.headers["x-admin-token"]',
            ],
            remove: true,
          },
        }
      : false,
    // correlaciona toda a cadeia de uma requisição: usa o id do proxy se vier,
    // senão gera um. O Fastify inclui esse reqId em cada linha de req.log.
    genReqId: (req) => {
      const h = req.headers['x-request-id'];
      return (typeof h === 'string' && h.length > 0 ? h : randomUUID());
    },
  });

  // Erros: registra com stack (nunca engole em silêncio) e não vaza detalhe
  // interno ao cliente em 5xx. 4xx (validação etc.) preservam a mensagem.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, 'erro não tratado');
      return reply.code(500).send({ error: 'Erro interno. Tente de novo em instantes.' });
    }
    req.log.info({ statusCode: status }, 'requisição rejeitada');
    return reply.code(status).send({ error: err.message });
  });

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
