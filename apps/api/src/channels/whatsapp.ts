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
          id?: string; // id da mensagem no provedor (idempotência)
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

/** Id da 1ª mensagem de texto do payload (para idempotência). null se não houver. */
export function incomingMessageId(payload: MetaWebhookPayload): string | null {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (msg.type === 'text' && typeof msg.id === 'string') return msg.id;
      }
    }
  }
  return null;
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

// ---------------------------------------------------------------
// TRANSPORTE — envio pela Graph API (Meta) + fábrica por ambiente
//
// O que faltava para "ligar o canal": ENVIAR a resposta e RECEBER de verdade.
// Espelha os padrões do projeto: `PushSender` (quem sabe entregar, real + dublê)
// e `makeAiModels` (fábrica por ambiente). Sem credenciais, o sender é null e o
// canal fica desligado — nada mais do produto muda.
// ---------------------------------------------------------------

/** Resultado do envio (espelha o "id da mensagem" do provedor). */
export interface WhatsAppSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Quem sabe ENTREGAR no WhatsApp. Meta (real) e o dublê de teste implementam isto. */
export interface WhatsAppSender {
  /** Nome curto do provedor (log/métrica): 'meta', ... */
  readonly name: string;
  send(msg: MetaOutbound): Promise<WhatsAppSendResult>;
}

/**
 * Normaliza um telefone para "só dígitos com país". Se vier sem código do país e
 * parecer brasileiro (10-11 dígitos = DDD + número), prefixa 55. O `from` que a
 * Meta manda já vem com país (ex.: 553199990000), então passa direto.
 */
export function normalizePhone(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  return d;
}

const META_GRAPH_VERSION = 'v20.0';

/**
 * Envia texto pela WhatsApp Cloud API da Meta. HTTP puro via fetch, sem SDK.
 * Precisa do id do número (phoneNumberId) e de um token de acesso.
 */
export class MetaWhatsAppSender implements WhatsAppSender {
  readonly name = 'meta';
  private readonly url: string;

  constructor(
    phoneNumberId: string,
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
  }

  async send(msg: MetaOutbound): Promise<WhatsAppSendResult> {
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(msg),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!res.ok) return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
      return { ok: true, id: json.messages?.[0]?.id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }
}

export interface WhatsAppConfig {
  sender: WhatsAppSender | null;
  provider: string;
  /** token do handshake de verificação do webhook (GET). */
  verifyToken: string | null;
}

/**
 * Escolhe o provedor de WhatsApp pelo ambiente. Sem as credenciais, `sender` é
 * null (canal desligado). Espelha `makeAiModels`.
 *
 * Variáveis:
 *   PULSO_WHATSAPP_PROVIDER      'meta' (padrão) | 'none'
 *   PULSO_WHATSAPP_PHONE_ID      id do número (Meta)
 *   PULSO_WHATSAPP_TOKEN         token de acesso (Meta)
 *   PULSO_WHATSAPP_VERIFY_TOKEN  segredo do handshake do webhook (GET)
 */
export function makeWhatsAppSender(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  const provider = (env.PULSO_WHATSAPP_PROVIDER ?? 'meta').toLowerCase();
  const verifyToken = env.PULSO_WHATSAPP_VERIFY_TOKEN ?? null;
  if (provider === 'meta') {
    const phoneId = env.PULSO_WHATSAPP_PHONE_ID;
    const token = env.PULSO_WHATSAPP_TOKEN;
    if (phoneId && token) {
      return { sender: new MetaWhatsAppSender(phoneId, token), provider, verifyToken };
    }
  }
  return { sender: null, provider, verifyToken };
}
