/**
 * Envio de e-mail — provedor simples via ambiente, com fallback de log em dev.
 *
 * Sem variáveis de provedor (dev/teste), o e-mail é só impresso no log — o fluxo
 * funciona ponta a ponta sem depender de nada externo. Com PULSO_RESEND_API_KEY
 * + PULSO_EMAIL_FROM, entrega de verdade pela Resend (só um POST, sem SDK).
 *
 * Nenhuma credencial vive aqui: tudo vem do ambiente.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(msg: EmailMessage): Promise<void>;
}

/** Fallback de desenvolvimento: não envia, só registra (o token aparece no log). */
export class LogMailer implements Mailer {
  async send(msg: EmailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[email:dev] para=${msg.to} assunto="${msg.subject}"\n${msg.text}`);
  }
}

/** Provedor real (Resend) — usado só quando as variáveis de ambiente existem. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) throw new Error(`Resend respondeu ${res.status}`);
  }
}

/** Escolhe o provedor pelo ambiente; sem config, cai no log (dev). */
export function resolveMailer(): Mailer {
  const apiKey = process.env.PULSO_RESEND_API_KEY;
  const from = process.env.PULSO_EMAIL_FROM;
  if (apiKey && from) return new ResendMailer(apiKey, from);
  return new LogMailer();
}
