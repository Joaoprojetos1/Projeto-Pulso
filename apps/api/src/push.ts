/**
 * Entrega do aviso no celular (push).
 *
 * O cálculo e a decisão de alertar são do core; aqui só ENTREGAMOS um texto
 * já pronto. Usa o serviço de push do Expo (https://exp.host) — nada de SDK,
 * só uma chamada HTTP. Nenhum número é inventado aqui.
 */

/** Uma notificação a enviar para um aparelho. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Dados extras (ex.: para abrir a tela do alerta ao tocar). */
  data?: Record<string, unknown>;
}

/** Resultado por mensagem, espelhando o "ticket" do Expo. */
export interface PushResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Quem sabe entregar. A API real e a de teste implementam isto. */
export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/**
 * O token do Expo tem forma fixa: ExponentPushToken[...] ou ExpoPushToken[...].
 * Rejeitar cedo o que não parece token evita bater no serviço à toa.
 */
export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) &&
    token.endsWith(']')
  );
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Enviador de verdade: chama o serviço do Expo. Lotes de 100 (limite do Expo). */
export class ExpoPushSender implements PushSender {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const valid = messages.filter((m) => isExpoPushToken(m.to));
    if (valid.length === 0) return [];

    const results: PushResult[] = [];
    for (let i = 0; i < valid.length; i += 100) {
      const lote = valid.slice(i, i + 100).map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        sound: 'default',
        channelId: 'alertas',
        priority: 'high',
        data: m.data ?? {},
      }));

      try {
        const res = await this.fetchImpl(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(lote),
        });
        const json = (await res.json()) as { data?: Array<{ status: string; id?: string; message?: string }> };
        for (const t of json.data ?? []) {
          results.push(
            t.status === 'ok'
              ? { ok: true, id: t.id }
              : { ok: false, error: t.message ?? 'falha desconhecida' },
          );
        }
      } catch (err) {
        for (let j = 0; j < lote.length; j += 1) {
          results.push({ ok: false, error: (err as Error).message });
        }
      }
    }
    return results;
  }
}
