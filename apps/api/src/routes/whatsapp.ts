import type { FastifyInstance } from 'fastify';

import type { ChatModel } from '../ai/chat';
import { companyFromRequest } from '../auth';
import {
  handleWhatsAppWebhook,
  incomingMessageId,
  normalizePhone,
  parseIncomingMessage,
  toMetaReply,
  verifyMetaSignature,
  type MetaWebhookPayload,
  type WhatsAppSender,
} from '../channels/whatsapp';
import type { Sql } from '../db';
import { constantTimeEqual } from '../http';
import { QuotaExceededError } from '../quota';
import { CompanyNotFoundError, converse } from '../services/conversation';

/**
 * Canal WHATSAPP — o TRANSPORTE que faltava para ligar o canal.
 *
 * O adaptador puro (channels/whatsapp.ts) já traduz Meta ⇄ cérebro; aqui só
 * ligamos os fios: verificação do webhook, receber a mensagem real, resolver o
 * telefone → empresa (opt-in), chamar o MESMO `converse` e ENVIAR a resposta pela
 * Graph API. NUNCA uma segunda IA. Fica ativo só quando há credenciais (o `sender`
 * vem da fábrica por ambiente); sem elas, as rotas existem mas o canal não entrega.
 */

/** Mensagem quando a cota de conversa do plano estourou. */
const MSG_LIMITE =
  'Você chegou ao limite de conversas do seu plano neste mês. Seus alertas e números seguem no ' +
  'aplicativo — e no próximo ciclo a conversa por aqui volta.';

const linkBodySchema = {
  type: 'object',
  required: ['phone'],
  additionalProperties: false,
  properties: { phone: { type: 'string', minLength: 8, maxLength: 20 } },
} as const;

export function registerWhatsApp(
  app: FastifyInstance,
  sql: Sql,
  chatModel: ChatModel | null = null,
  sender: WhatsAppSender | null = null,
  verifyToken: string | null = null,
  appSecret: string | null = null,
) {
  // fecha o cérebro sobre (sql, chatModel): o WhatsApp é só mais um canal dele.
  const converseWhatsApp = (input: { companyId: string; userMessage: string; channel: 'whatsapp' }) =>
    converse({ sql, chatModel }, input);

  // resolve o telefone do remetente → empresa, pelo opt-in em whatsapp_contacts.
  const resolveCompanyByPhone = async (phone: string): Promise<string | null> => {
    const [row] = await sql`SELECT company_id FROM whatsapp_contacts WHERE phone = ${phone}`;
    return (row?.company_id as string | undefined) ?? null;
  };

  // Handshake de verificação (Meta): GET com hub.mode/hub.verify_token/hub.challenge.
  // Comparação do token em tempo constante.
  app.get<{ Querystring: Record<string, string> }>('/webhooks/whatsapp', async (req, reply) => {
    const q = req.query;
    if (q['hub.mode'] === 'subscribe' && verifyToken && constantTimeEqual(q['hub.verify_token'] ?? '', verifyToken)) {
      return reply.type('text/plain').send(q['hub.challenge'] ?? '');
    }
    req.log.warn({ temToken: Boolean(verifyToken) }, 'verificação do webhook do whatsapp recusada');
    return reply.code(403).send({ error: 'verificação falhou' });
  });

  // Entrada: mensagens recebidas. Registrada num ESCOPO isolado com parser que
  // guarda o corpo CRU (rawBody) — necessário para conferir a assinatura HMAC da
  // Meta sem alterar o parser JSON global das outras rotas.
  app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      const buf = body as Buffer;
      (_req as unknown as { rawBody?: Buffer }).rawBody = buf;
      if (buf.length === 0) return done(null, undefined);
      try {
        done(null, JSON.parse(buf.toString('utf8')));
      } catch (e) {
        (e as { statusCode?: number }).statusCode = 400;
        done(e as Error, undefined);
      }
    });

    // Processa e SEMPRE devolve 200 (a Meta reentrega em não-200; a idempotência
    // protege contra reprocessar). A resposta é da conversa (o mesmo cérebro do
    // app), nunca uma segunda IA.
    scope.post<{ Body: MetaWebhookPayload }>('/webhooks/whatsapp', async (req, reply) => {
    // assinatura da Meta: com o App Secret configurado, corpo forjado é recusado.
    if (appSecret) {
      const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
      const sig = req.headers['x-hub-signature-256'];
      if (!verifyMetaSignature(raw, typeof sig === 'string' ? sig : undefined, appSecret)) {
        req.log.warn('whatsapp: assinatura do webhook inválida');
        return reply.code(401).send({ error: 'assinatura inválida' });
      }
    }
    const body = req.body;
    const msg = parseIncomingMessage(body);
    if (!msg) return reply.code(200).send({ ok: true }); // status/tipo não-texto: só 200

    // idempotência: a Meta reentrega; não responder/gravar a mesma mensagem 2x.
    const id = incomingMessageId(body);
    if (id) {
      const inserted = await sql`
        INSERT INTO whatsapp_inbound (message_id) VALUES (${id})
        ON CONFLICT (message_id) DO NOTHING RETURNING message_id`;
      if (inserted.length === 0) return reply.code(200).send({ ok: true, duplicate: true });
    }

    try {
      const out = await handleWhatsAppWebhook(
        { resolveCompanyByPhone, converse: converseWhatsApp },
        body,
      );
      if (out && sender) {
        const r = await sender.send(out);
        if (!r.ok) req.log.warn({ err: r.error }, 'whatsapp: falha ao enviar resposta');
      }
    } catch (e) {
      // erra sem derrubar o webhook: a Meta não deve reentregar por erro nosso.
      if (e instanceof QuotaExceededError) {
        if (sender) await sender.send(toMetaReply(msg.from, MSG_LIMITE));
      } else if (e instanceof CompanyNotFoundError) {
        req.log.warn('whatsapp: empresa some do contato');
      } else {
        req.log.error({ err: e }, 'whatsapp: falha ao processar mensagem recebida');
      }
    }
    return reply.code(200).send({ ok: true });
    });
  });

  // Opt-in do dono logado: liga este WhatsApp à empresa dele (um telefone → uma empresa).
  app.post<{ Body: { phone: string } }>(
    '/me/whatsapp',
    { schema: { body: linkBodySchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'Faça login.' });
      const phone = normalizePhone(req.body.phone);
      // BR: 55 + DDD(2) + número(8-9) = 12 ou 13 dígitos
      if (phone.length < 12 || phone.length > 13) {
        return reply.code(422).send({ error: 'Informe um número de WhatsApp válido com DDD.' });
      }
      await sql`
        INSERT INTO whatsapp_contacts (company_id, phone) VALUES (${company.id}, ${phone})
        ON CONFLICT (phone) DO UPDATE SET company_id = ${company.id}, opted_in_at = now()`;
      req.log.info({ companyId: company.id }, 'whatsapp ligado à conta');
      return { linked: true, phone };
    },
  );

  // Estado do vínculo do dono logado.
  app.get('/me/whatsapp', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    const [row] = await sql`
      SELECT phone, opted_in_at::text AS opted_in_at
      FROM whatsapp_contacts WHERE company_id = ${company.id}
      ORDER BY opted_in_at DESC LIMIT 1`;
    return {
      linked: Boolean(row),
      phone: (row?.phone as string | undefined) ?? null,
      optedInAt: (row?.opted_in_at as string | undefined) ?? null,
    };
  });

  // Desliga o WhatsApp da conta (opt-out).
  app.delete('/me/whatsapp', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'Faça login.' });
    await sql`DELETE FROM whatsapp_contacts WHERE company_id = ${company.id}`;
    req.log.info({ companyId: company.id }, 'whatsapp desligado da conta');
    return { linked: false };
  });
}
