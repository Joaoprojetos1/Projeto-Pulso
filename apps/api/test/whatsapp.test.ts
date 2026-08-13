import { describe, expect, it, vi } from 'vitest';

import {
  handleWhatsAppWebhook,
  incomingMessageId,
  makeWhatsAppSender,
  MetaWhatsAppSender,
  normalizePhone,
  NOT_LINKED_REPLY,
  parseIncomingMessage,
  toMetaReply,
  type MetaWebhookPayload,
} from '../src/channels/whatsapp';

// payload de exemplo no formato da Meta Cloud API (mensagem de texto)
const textPayload: MetaWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            messages: [{ from: '553199990000', type: 'text', text: { body: 'Quando meu caixa zera?' } }],
          },
        },
      ],
    },
  ],
};

// payload que NÃO é mensagem de texto (ex.: status de entrega) — deve ser ignorado
const statusPayload: MetaWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from: '553199990000', type: 'image' }] } }] }],
};

describe('parseIncomingMessage', () => {
  it('extrai remetente e texto de um payload da Meta', () => {
    expect(parseIncomingMessage(textPayload)).toEqual({ from: '553199990000', text: 'Quando meu caixa zera?' });
  });

  it('ignora eventos que não são mensagem de texto', () => {
    expect(parseIncomingMessage(statusPayload)).toBeNull();
    expect(parseIncomingMessage({})).toBeNull();
  });
});

describe('handleWhatsAppWebhook (stub, cérebro compartilhado)', () => {
  it('resolve a empresa pelo telefone, chama o MESMO converse e responde no formato da Meta', async () => {
    const converse = vi.fn(async () => ({ reply: 'Seu caixa pode zerar em 29 de julho.' }));
    const resolveCompanyByPhone = vi.fn(async () => 'company-123');

    const out = await handleWhatsAppWebhook({ resolveCompanyByPhone, converse }, textPayload);

    expect(resolveCompanyByPhone).toHaveBeenCalledWith('553199990000');
    expect(converse).toHaveBeenCalledWith({
      companyId: 'company-123',
      userMessage: 'Quando meu caixa zera?',
      channel: 'whatsapp',
    });
    expect(out).toEqual(toMetaReply('553199990000', 'Seu caixa pode zerar em 29 de julho.'));
    expect(out?.messaging_product).toBe('whatsapp');
  });

  it('número não vinculado: responde o aviso e NÃO chama o cérebro', async () => {
    const converse = vi.fn(async () => ({ reply: 'não deveria' }));
    const out = await handleWhatsAppWebhook(
      { resolveCompanyByPhone: async () => null, converse },
      textPayload,
    );
    expect(converse).not.toHaveBeenCalled();
    expect(out?.text.body).toBe(NOT_LINKED_REPLY);
  });

  it('evento sem mensagem de texto: não responde nada (webhook só confirma 200)', async () => {
    const converse = vi.fn(async () => ({ reply: 'x' }));
    const out = await handleWhatsAppWebhook(
      { resolveCompanyByPhone: async () => 'company-123', converse },
      statusPayload,
    );
    expect(out).toBeNull();
    expect(converse).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------
// TRANSPORTE — envio pela Graph API, normalização, idempotência, fábrica
// ---------------------------------------------------------------

const idPayload: MetaWebhookPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            messages: [{ from: '553199990000', id: 'wamid.ABC', type: 'text', text: { body: 'oi' } }],
          },
        },
      ],
    },
  ],
};

describe('normalizePhone', () => {
  it('prefixa 55 num número BR sem país; mantém quando já tem país', () => {
    expect(normalizePhone('(31) 99999-0000')).toBe('5531999990000');
    expect(normalizePhone('31 3333-0000')).toBe('553133330000');
    expect(normalizePhone('553199990000')).toBe('553199990000');
  });
});

describe('incomingMessageId', () => {
  it('extrai o id da mensagem de texto; null quando não há', () => {
    expect(incomingMessageId(idPayload)).toBe('wamid.ABC');
    expect(incomingMessageId(textPayload)).toBeNull();
    expect(incomingMessageId(statusPayload)).toBeNull();
  });
});

describe('MetaWhatsAppSender', () => {
  it('POSTa na Graph API com Bearer e devolve o id da mensagem', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ messages: [{ id: 'wamid.OUT' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const sender = new MetaWhatsAppSender('PHONE_ID', 'TOKEN', fetchImpl as unknown as typeof fetch);
    const r = await sender.send(toMetaReply('553199990000', 'olá'));
    expect(r).toEqual({ ok: true, id: 'wamid.OUT' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('/PHONE_ID/messages');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer TOKEN');
    expect(JSON.parse(init.body as string)).toMatchObject({ to: '553199990000', text: { body: 'olá' } });
  });

  it('erro do provedor: ok=false com a mensagem', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'número inválido' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const sender = new MetaWhatsAppSender('P', 'T', fetchImpl as unknown as typeof fetch);
    expect(await sender.send(toMetaReply('x', 'y'))).toEqual({ ok: false, error: 'número inválido' });
  });

  it('falha de rede: ok=false, não estoura', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('sem rede');
    });
    const sender = new MetaWhatsAppSender('P', 'T', fetchImpl as unknown as typeof fetch);
    expect(await sender.send(toMetaReply('x', 'y'))).toEqual({ ok: false, error: 'sem rede' });
  });
});

describe('makeWhatsAppSender', () => {
  it('com credenciais da Meta: liga o sender', () => {
    const cfg = makeWhatsAppSender({
      PULSO_WHATSAPP_PROVIDER: 'meta',
      PULSO_WHATSAPP_PHONE_ID: '123',
      PULSO_WHATSAPP_TOKEN: 'tok',
      PULSO_WHATSAPP_VERIFY_TOKEN: 'v',
    } as NodeJS.ProcessEnv);
    expect(cfg.sender).toBeInstanceOf(MetaWhatsAppSender);
    expect(cfg.provider).toBe('meta');
    expect(cfg.verifyToken).toBe('v');
  });

  it('sem credenciais: canal desligado (sender null)', () => {
    expect(makeWhatsAppSender({} as NodeJS.ProcessEnv).sender).toBeNull();
    expect(makeWhatsAppSender({ PULSO_WHATSAPP_PROVIDER: 'none' } as NodeJS.ProcessEnv).sender).toBeNull();
  });
});
