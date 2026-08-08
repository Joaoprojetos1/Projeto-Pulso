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
import { registerCompany } from './routes/company';
import { registerData } from './routes/data';
import { registerDevices } from './routes/devices';
import { registerImport } from './routes/import';
import { registerInterest } from './routes/interest';
import { registerPlanned } from './routes/planned';
import { registerSegments } from './routes/segments';
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
  /** Consulta de CNPJ: injeta um fetcher nos testes; produção usa o fetch global. */
  cnpjLookup?: import('./services/cnpj').LookupDeps;
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

  // CORS restrito às origens reais (o site e a demo web). O app NATIVO não manda
  // Origin (CORS é coisa de navegador), então requisições sem Origin passam. Auth
  // é por Bearer, não cookie. Origens extras via PULSO_CORS_ORIGINS (vírgula).
  const origensPadrao = ['https://pulso-site.onrender.com', 'https://joaoprojetos1.github.io'];
  const extras = (process.env.PULSO_CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const permitidas = new Set([...origensPadrao, ...extras]);
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // app nativo / server-to-server / curl
      const ok = permitidas.has(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
      cb(null, ok); // origem desconhecida: não reflete (navegador bloqueia)
    },
  });

  // headers de segurança em toda resposta (API JSON; nunca é enquadrada nem sniffed)
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    if (process.env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return payload;
  });

  // healthcheck DE VERDADE: confirma que o banco responde (não é 200 fixo).
  // Serve de readiness e de alvo do keepalive.
  app.get('/health', async (_req, reply) => {
    try {
      await sql`SELECT 1`;
      return { ok: true };
    } catch (err) {
      app.log.error({ err }, 'healthcheck: banco indisponível');
      return reply.code(503).send({ ok: false });
    }
  });

  registerAuth(app, sql, opts.chatModel ?? null, opts.mailer);
  registerAdmin(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerInterest(app, sql);
  registerPlanned(app, sql);
  registerCompanies(app, sql);
  registerCompany(app, sql, opts.cnpjLookup);
  registerData(app, sql);
  registerSnapshots(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerImport(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerSegments(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerSubscription(app, sql);
  registerSimulate(app, sql);
  registerDevices(app, sql, opts.pushSender ?? null);
  registerChat(app, sql, opts.chatModel ?? null);
  registerAvatar(app, sql);

  return app;
}
