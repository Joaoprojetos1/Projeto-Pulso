/**
 * Canal WhatsApp — ADAPTADOR (stub). Preparação, não integração.
 *
 * O bot do WhatsApp é um CANAL novo do MESMO cérebro (services/conversation.ts),
 * nunca uma segunda IA. Este arquivo só traduz entre o formato da Meta Cloud API
 * e o `converse` — quando a conta Business estiver verificada, ligar o WhatsApp
 * será escrever só o TRANSPORTE (receber o webhook de verdade e enviar a resposta
 * pela Graph API). Aqui não há nenhuma credencial e nada fala com a Meta.
 *
 * Dependências injetadas (para o stub ser testável sem banco nem rede):
 *  - resolveCompanyByPhone: mapeia o telefone do remetente → companyId. O
 *    vínculo telefone↔empresa (tabela/onboarding) fica para quando o canal ligar.
 *  - converse: o cérebro. Em produção, um closure sobre services/conversation.ts.
 */

/** Formato (simplificado) do webhook de mensagens da Meta Cloud API. */
export interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messaging_product?: string;
        messages?: Array<{
          from?: string; // telefone do remetente (E.164 sem '+')
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/** Mensagem de saída no formato que a Graph API espera (quando o transporte ligar). */
export interface MetaOutbound {
  messaging_product: 'whatsapp';
  to: string;
  type: 'text';
  text: { body: string };
}

export interface IncomingMessage {
  from: string;
  text: string;
}

export interface WhatsAppConverse {
  (input: { companyId: string; userMessage: string; channel: 'whatsapp' }): Promise<{ reply: string }>;
}

export interface WhatsAppAdapterDeps {
  resolveCompanyByPhone: (phone: string) => Promise<string | null>;
  converse: WhatsAppConverse;
}

/** Mensagem para quem escreve de um número ainda não vinculado a uma conta. */
export const NOT_LINKED_REPLY =
  'Seu número ainda não está ligado a uma conta do Pulso. Fale com quem cuida da sua conta para vincular.';

/**
 * Extrai a primeira mensagem de TEXTO do payload da Meta. Ignora eventos que não
 * são mensagem de texto (status de entrega, reações, etc.) devolvendo null.
 */
export function parseIncomingMessage(payload: MetaWebhookPayload): IncomingMessage | null {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const body = msg.text?.body;
        if (msg.type === 'text' && typeof msg.from === 'string' && typeof body === 'string' && body.trim()) {
          return { from: msg.from, text: body };
        }
      }
    }
  }
  return null;
}

export function toMetaReply(to: string, body: string): MetaOutbound {
  return { messaging_product: 'whatsapp', to, type: 'text', text: { body } };
}

/**
 * Recebe um payload da Meta, resolve a empresa pelo telefone, chama o cérebro e
 * devolve a resposta no formato da Meta. Retorna null quando não há mensagem de
 * texto a responder (o webhook deve só confirmar 200 nesses casos).
 */
export async function handleWhatsAppWebhook(
  deps: WhatsAppAdapterDeps,
  payload: MetaWebhookPayload,
): Promise<MetaOutbound | null> {
  const msg = parseIncomingMessage(payload);
  if (!msg) return null;

  const companyId = await deps.resolveCompanyByPhone(msg.from);
  if (!companyId) return toMetaReply(msg.from, NOT_LINKED_REPLY);

  const { reply } = await deps.converse({ companyId, userMessage: msg.text, channel: 'whatsapp' });
  return toMetaReply(msg.from, reply);
}
