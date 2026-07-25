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

/** Mascara o e-mail para log (LGPD): mantém a 1ª letra e o domínio. */
export function maskEmail(email: string): string {
  const [local, dominio] = email.split('@');
  if (!local || !dominio) return '***';
  const inicio = local.slice(0, 1);
  return `${inicio}***@${dominio}`;
}

/**
 * Fallback de desenvolvimento: não envia de verdade, só registra a INTENÇÃO.
 *
 * LGPD/segurança: por padrão NÃO registra o corpo (contém o token de redefinição)
 * nem o e-mail completo. Para depurar o fluxo localmente, PULSO_LOG_EMAILS=1
 * imprime tudo. O `sink` é injetável para teste.
 */
export class LogMailer implements Mailer {
  constructor(
    private readonly sink: (line: string) => void = (l) => {
      // eslint-disable-next-line no-console
      console.log(l);
    },
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    if (process.env.PULSO_LOG_EMAILS === '1') {
      this.sink(`[email:dev] para=${msg.to} assunto="${msg.subject}"\n${msg.text}`);
      return;
    }
    this.sink(`[email:dev] preparado para <${maskEmail(msg.to)}> · assunto="${msg.subject}" (corpo omitido)`);
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
