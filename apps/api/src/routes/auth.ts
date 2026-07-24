import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ChatModel, ChatTurn } from '../ai/chat';
import {
  companyFromRequest,
  hashPassword,
  hashToken,
  newToken,
  normalizeEmail,
  userFromRequest,
  verifyPassword,
} from '../auth';
import type { Sql } from '../db';
import { toCompanyJson, UUID_PATTERN, type CompanyRow } from '../http';
import { resolveMailer, type Mailer } from '../mailer';
import { QuotaExceededError, quotaExceededPayload } from '../quota';
import { converse } from '../services/conversation';
import { currentUserMessage } from './chat';
import { buildDashboard } from './snapshots';

/**
 * Login de verdade — o dono se cadastra e entra com e-mail e senha.
 *
 * Cada conta é ligada à sua empresa. As rotas /me/* usam o token para achar a
 * empresa do dono logado (isolamento: um dono só vê a própria empresa).
 */

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

/**
 * Bootstrap de operadores: e-mails listados em PULSO_ADMIN_EMAILS (separados por
 * vírgula) viram admin automaticamente ao entrar/cadastrar — sem mexer no banco.
 * Não é segredo: é a lista de quem opera (CEO, especialista). O papel continua
 * vindo SEMPRE do banco (isto só o define uma vez, na entrada).
 */
function ehAdminBootstrap(email: string): boolean {
  const lista = (process.env.PULSO_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return lista.includes(email.toLowerCase());
}

interface SignupBody {
  businessName: string;
  email: string;
  password: string;
}
interface LoginBody {
  email: string;
  password: string;
}
interface ChatBody {
  messages: ChatTurn[];
}

const signupSchema = {
  type: 'object',
  required: ['businessName', 'email', 'password'],
  additionalProperties: false,
  properties: {
    businessName: { type: 'string', minLength: 1, maxLength: 120 },
    email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
    password: { type: 'string', minLength: 8, maxLength: 200 },
  },
} as const;

const loginSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 200 },
    password: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const forgotSchema = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: { email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 } },
} as const;

const resetSchema = {
  type: 'object',
  required: ['token', 'password'],
  additionalProperties: false,
  properties: {
    token: { type: 'string', minLength: 16, maxLength: 200 },
    password: { type: 'string', minLength: 8, maxLength: 200 },
  },
} as const;

const chatBodySchema = {
  type: 'object',
  required: ['messages'],
  additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        required: ['role', 'content'],
        additionalProperties: false,
        properties: {
          role: { enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
    },
  },
} as const;

export function registerAuth(
  app: FastifyInstance,
  sql: Sql,
  chatModel: ChatModel | null = null,
  mailer: Mailer = resolveMailer(),
) {
  // cadastro: cria a empresa (vazia) + o usuário + um token de sessão
  app.post<{ Body: SignupBody }>(
    '/auth/signup',
    { schema: { body: signupSchema } },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);

      const [existing] = await sql`SELECT 1 FROM users WHERE email = ${email}`;
      if (existing) {
        return reply.code(409).send({ error: 'Já existe uma conta com esse e-mail.' });
      }

      const token = newToken();
      const passwordHash = hashPassword(req.body.password);

      try {
        const company = await sql.begin(async (tx) => {
          const [c] = await tx`
            INSERT INTO companies (name) VALUES (${req.body.businessName})
            RETURNING id, name, cnpj, niche, declared_fixed_cost_cents, created_at`;
          const [u] = await tx`
            INSERT INTO users (email, password_hash, company_id)
            VALUES (${email}, ${passwordHash}, ${c.id})
            RETURNING id`;
          await tx`INSERT INTO auth_tokens (token_hash, user_id) VALUES (${hashToken(token)}, ${u.id})`;
          return c as CompanyRow;
        });
        let role = 'owner';
        if (ehAdminBootstrap(email)) {
          await sql`UPDATE users SET role = 'admin' WHERE email = ${email}`;
          role = 'admin';
        }
        return reply.code(201).send({ token, email, role, company: toCompanyJson(company) });
      } catch (err) {
        // corrida entre dois cadastros com o mesmo e-mail: o UNIQUE segura
        if ((err as { code?: string }).code === '23505') {
          return reply.code(409).send({ error: 'Já existe uma conta com esse e-mail.' });
        }
        throw err;
      }
    },
  );

  // entrada: confere e-mail + senha e devolve um token novo
  app.post<{ Body: LoginBody }>(
    '/auth/login',
    { schema: { body: loginSchema } },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);
      const [user] = await sql`
        SELECT u.id, u.password_hash, u.role,
               c.id AS c_id, c.name, c.cnpj, c.niche, c.declared_fixed_cost_cents, c.created_at
        FROM users u JOIN companies c ON c.id = u.company_id
        WHERE u.email = ${email}`;

      // mensagem genérica de propósito: não revela se o e-mail existe
      if (!user || !verifyPassword(req.body.password, user.password_hash as string)) {
        return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
      }

      const token = newToken();
      await sql`INSERT INTO auth_tokens (token_hash, user_id) VALUES (${hashToken(token)}, ${user.id})`;

      // bootstrap de operador: e-mail listado em PULSO_ADMIN_EMAILS vira admin
      let role = (user.role as string) ?? 'owner';
      if (role !== 'admin' && ehAdminBootstrap(email)) {
        await sql`UPDATE users SET role = 'admin' WHERE id = ${user.id}`;
        role = 'admin';
      }

      const company: CompanyRow = {
        id: user.c_id as string,
        name: user.name as string,
        cnpj: (user.cnpj as string | null) ?? null,
        niche: user.niche as string,
        declared_fixed_cost_cents: (user.declared_fixed_cost_cents as number | null) ?? null,
        created_at: user.created_at as Date,
      };
      return reply.send({
        token,
        email,
        role,
        company: toCompanyJson(company),
      });
    },
  );

  // sair: apaga o token deste aparelho (os outros seguem válidos)
  app.post('/auth/logout', async (req, reply) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length).trim();
      if (token) await sql`DELETE FROM auth_tokens WHERE token_hash = ${hashToken(token)}`;
    }
    return reply.send({ ok: true });
  });

  // esqueci a senha: gera um token de uso único (1h) e envia por e-mail.
  // Responde 200 sempre — não revela se o e-mail existe (mesma prudência do login).
  app.post<{ Body: { email: string } }>(
    '/auth/forgot-password',
    { schema: { body: forgotSchema } },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);
      const [user] = await sql`SELECT id FROM users WHERE email = ${email}`;

      if (user) {
        const token = newToken();
        await sql`
          INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
          VALUES (${user.id}, ${hashToken(token)}, now() + interval '1 hour')`;
        try {
          await mailer.send({
            to: email,
            subject: 'Redefinir sua senha do Pulso',
            text:
              `Você pediu para redefinir sua senha do Pulso.\n\n` +
              `Use este código no app (válido por 1 hora):\n\n${token}\n\n` +
              `Se não foi você, pode ignorar este e-mail.`,
          });
        } catch (err) {
          req.log.error({ err }, 'falha ao enviar e-mail de recuperação');
        }
      }

      return reply.send({ ok: true });
    },
  );

  // redefinir a senha com o token recebido por e-mail (uso único, com expiração)
  app.post<{ Body: { token: string; password: string } }>(
    '/auth/reset-password',
    { schema: { body: resetSchema } },
    async (req, reply) => {
      const [row] = await sql`
        SELECT id, user_id
        FROM password_reset_tokens
        WHERE token_hash = ${hashToken(req.body.token)}
          AND used_at IS NULL
          AND expires_at > now()`;
      if (!row) {
        return reply.code(400).send({ error: 'Código inválido ou expirado. Peça um novo.' });
      }

      await sql.begin(async (tx) => {
        await tx`UPDATE users SET password_hash = ${hashPassword(req.body.password)} WHERE id = ${row.user_id}`;
        await tx`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${row.id}`;
        // por segurança, encerra as sessões abertas: quem trocou a senha entra de novo
        await tx`DELETE FROM auth_tokens WHERE user_id = ${row.user_id}`;
      });

      return reply.send({ ok: true });
    },
  );

  // painel do dono logado (só a própria empresa).
  // Devolve também o PAPEL (owner/admin) para o app decidir se mostra a área de
  // operação — importante na sessão restaurada, quando não há login fresco.
  app.get('/me/dashboard', async (req, reply) => {
    const user = await userFromRequest(sql, req);
    if (!user) return reply.code(401).send({ error: 'Faça login para ver seu painel.' });

    const dash = await buildDashboard(sql, user.company);
    if (!dash) {
      // conta nova, ainda sem dados: 200 com o retrato "vazio" (não é erro)
      return reply.send({ role: user.role, company: toCompanyJson(user.company), snapshot: null, alerts: [] });
    }
    return { role: user.role, ...dash };
  });

  // conversa do dono logado
  app.post<{ Body: ChatBody }>(
    '/me/chat',
    { schema: { body: chatBodySchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login para conversar.' });
      try {
        return await converse(
          { sql, chatModel },
          { companyId: company.id, userMessage: currentUserMessage(req.body.messages), channel: 'app' },
        );
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          return reply.code(402).send(quotaExceededPayload(e));
        }
        throw e;
      }
    },
  );

  // histórico de alertas do dono (todos os snapshots, mais recente primeiro).
  // É o que responde a pergunta central do piloto: o dono vê e age no alerta?
  app.get<{ Querystring: { limit?: number } }>(
    '/me/alerts',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { limit: { type: 'integer', minimum: 1, maximum: 200 } },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login para ver seus alertas.' });

      const limit = req.query.limit ?? 50;
      const rows = await sql`
        SELECT id, rule_key, severity::text AS severity, facts, text_title, text_body,
               created_at, opened_at, acted_at
        FROM alerts
        WHERE company_id = ${company.id}
        ORDER BY created_at DESC
        LIMIT ${limit}`;

      return {
        alerts: rows.map((a) => ({
          id: a.id,
          ruleKey: a.rule_key,
          severity: a.severity,
          facts: a.facts,
          textTitle: a.text_title,
          textBody: a.text_body,
          createdAt: a.created_at,
          openedAt: a.opened_at,
          actedAt: a.acted_at,
        })),
      };
    },
  );

  // marca visto/agido — idempotente (o COALESCE preserva o primeiro registro).
  // São as métricas 2 e 3 do piloto (o dono ABRIU / o dono AGIU).
  const marcar = (coluna: 'opened_at' | 'acted_at') =>
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });
      const [row] =
        coluna === 'opened_at'
          ? await sql`UPDATE alerts SET opened_at = COALESCE(opened_at, now())
                      WHERE id = ${req.params.id} AND company_id = ${company.id} RETURNING id`
          : await sql`UPDATE alerts SET acted_at = COALESCE(acted_at, now())
                      WHERE id = ${req.params.id} AND company_id = ${company.id} RETURNING id`;
      if (!row) return reply.code(404).send({ error: 'Alerta não encontrado.' });
      return reply.send({ ok: true });
    };

  const alertaIdParams = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', pattern: UUID_PATTERN } },
  } as const;

  app.post<{ Params: { id: string } }>('/me/alerts/:id/opened', { schema: { params: alertaIdParams } }, marcar('opened_at'));
  app.post<{ Params: { id: string } }>('/me/alerts/:id/acted', { schema: { params: alertaIdParams } }, marcar('acted_at'));
}
