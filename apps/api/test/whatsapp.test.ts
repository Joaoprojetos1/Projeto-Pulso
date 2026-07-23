import { describe, expect, it, vi } from 'vitest';

import {
  handleWhatsAppWebhook,
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
