import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { companyParamsSchema, findCompany } from '../http';
import { isExpoPushToken, type PushMessage, type PushSender } from '../push';

const deviceBodySchema = {
  type: 'object',
  required: ['token'],
  additionalProperties: false,
  properties: {
    token: { type: 'string', minLength: 1 },
    platform: { type: 'string' },
  },
} as const;

async function upsertDevice(
  sql: Sql,
  companyId: string,
  token: string,
  platform: string | undefined,
): Promise<void> {
  // o mesmo aparelho nunca duplica; se mudar de empresa, passa a valer a nova
  await sql`
    INSERT INTO device_tokens (company_id, token, platform)
    VALUES (${companyId}, ${token}, ${platform ?? null})
    ON CONFLICT (token)
    DO UPDATE SET company_id = EXCLUDED.company_id,
                  platform = EXCLUDED.platform,
                  last_seen_at = now()`;
}

/**
 * Aparelhos que recebem o aviso.
 *
 * O app manda o "endereço" (push token do Expo) do celular do dono; guardamos
 * ligado à empresa. Quando um alerta dispara (na rota de snapshots), o Pulso
 * entrega a notificação para todos os aparelhos daquela empresa.
 */
export function registerDevices(
  app: FastifyInstance,
  sql: Sql,
  pushSender: PushSender | null = null,
) {
  // O app registra o endereço deste celular — ESCOPADO pelo token do dono logado
  // (a empresa vem da sessão, nunca de um id na URL: sem acesso cruzado).
  app.post<{ Body: { token: string; platform?: string } }>(
    '/me/devices',
    { schema: { body: deviceBodySchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login para receber avisos.' });
      if (!isExpoPushToken(req.body.token)) {
        return reply.code(400).send({ error: 'Endereço de push inválido.' });
      }
      await upsertDevice(sql, company.id, req.body.token, req.body.platform);
      return reply.code(201).send({ registered: true });
    },
  );

  // Rota legada (por id): mantida só para o seed/testes internos. O app usa /me/devices.
  app.post<{ Params: { id: string }; Body: { token: string; platform?: string } }>(
    '/companies/:id/devices',
    { schema: { params: companyParamsSchema, body: deviceBodySchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
      if (!isExpoPushToken(req.body.token)) {
        return reply.code(400).send({ error: 'Endereço de push inválido.' });
      }
      await upsertDevice(sql, company.id, req.body.token, req.body.platform);
      return reply.code(201).send({ registered: true });
    },
  );

  // Envio de teste: confirma na prática que a notificação chega no celular.
  app.post<{ Params: { id: string } }>(
    '/companies/:id/push-test',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });
      if (!pushSender) {
        return reply.code(503).send({ error: 'Envio de push não configurado no servidor.' });
      }

      const tokens = await sql`
        SELECT token FROM device_tokens WHERE company_id = ${company.id}`;
      if (tokens.length === 0) {
        return reply.code(200).send({ sent: 0, message: 'Nenhum aparelho registrado ainda.' });
      }

      const messages: PushMessage[] = tokens.map((t) => ({
        to: t.token as string,
        title: 'Pulso — teste',
        body: 'Se você recebeu isto, os avisos do Pulso estão chegando. 💚',
        data: { kind: 'test' },
      }));
      const results = await pushSender.send(messages);
      const ok = results.filter((r) => r.ok).length;

      return reply.code(200).send({ sent: ok, total: messages.length });
    },
  );
}
