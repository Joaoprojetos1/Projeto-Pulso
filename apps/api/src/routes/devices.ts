import type { FastifyInstance } from 'fastify';

import type { Sql } from '../db';
import { companyParamsSchema, findCompany } from '../http';
import { isExpoPushToken, type PushMessage, type PushSender } from '../push';

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
  // O app registra (ou reconfirma) o endereço deste celular.
  app.post<{ Params: { id: string }; Body: { token: string; platform?: string } }>(
    '/companies/:id/devices',
    {
      schema: {
        params: companyParamsSchema,
        body: {
          type: 'object',
          required: ['token'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', minLength: 1 },
            platform: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa não encontrada.' });

      const { token, platform } = req.body;
      if (!isExpoPushToken(token)) {
        return reply.code(400).send({ error: 'Endereço de push inválido.' });
      }

      // o mesmo aparelho nunca duplica; se mudar de empresa, passa a valer a nova
      await sql`
        INSERT INTO device_tokens (company_id, token, platform)
        VALUES (${company.id}, ${token}, ${platform ?? null})
        ON CONFLICT (token)
        DO UPDATE SET company_id = EXCLUDED.company_id,
                      platform = EXCLUDED.platform,
                      last_seen_at = now()`;

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
