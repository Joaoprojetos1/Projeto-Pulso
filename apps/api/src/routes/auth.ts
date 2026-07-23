import type { FastifyInstance } from 'fastify';

import type { ChatModel, ChatTurn } from '../ai/chat';
import {
  companyFromRequest,
  hashPassword,
  hashToken,
  newToken,
  normalizeEmail,
  verifyPassword,
} from '../auth';
import type { Sql } from '../db';
import { toCompanyJson, type CompanyRow } from '../http';
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

export function registerAuth(app: FastifyInstance, sql: Sql, chatModel: ChatModel | null = null) {
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
        return reply.code(201).send({ token, email, company: toCompanyJson(company) });
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
        SELECT u.id, u.password_hash,
               c.id AS c_id, c.name, c.cnpj, c.niche, c.declared_fixed_cost_cents, c.created_at
        FROM users u JOIN companies c ON c.id = u.company_id
        WHERE u.email = ${email}`;

      // mensagem genérica de propósito: não revela se o e-mail existe
      if (!user || !verifyPassword(req.body.password, user.password_hash as string)) {
        return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
      }

      const token = newToken();
      await sql`INSERT INTO auth_tokens (token_hash, user_id) VALUES (${hashToken(token)}, ${user.id})`;

      const company: CompanyRow = {
        id: user.c_id as string,
        name: user.name as string,
        cnpj: (user.cnpj as string | null) ?? null,
        niche: user.niche as string,
        declared_fixed_cost_cents: (user.declared_fixed_cost_cents as number | null) ?? null,
        created_at: user.created_at as Date,
      };
      return reply.send({ token, email, company: toCompanyJson(company) });
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

  // painel do dono logado (só a própria empresa)
  app.get('/me/dashboard', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login para ver seu painel.' });

    const dash = await buildDashboard(sql, company);
    if (!dash) {
      // conta nova, ainda sem dados: 200 com o retrato "vazio" (não é erro)
      return reply.send({ company: toCompanyJson(company), snapshot: null, alerts: [] });
    }
    return dash;
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
}
