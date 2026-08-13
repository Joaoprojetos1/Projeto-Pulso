import { existsSync, readFileSync } from 'node:fs';

import { makeAiModels } from './ai/providers';
import { buildApp } from './app';
import { createSql } from './db';
import { migrate } from './migrate';
import { ExpoPushSender } from './push';
import { makeWhatsAppSender } from './channels/whatsapp';

// conveniência de dev: carrega .env local se existir (sem sobrescrever o ambiente)
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL (veja .env.example). Para subir um banco local: pnpm db');
  process.exit(1);
}

const sql = createSql(url);

// Escolhe o provedor de IA (padrão Claude; PULSO_AI_PROVIDER=openai troca).
// Com a chave do provedor a IA redige alertas e responde a conversa; sem ela,
// entram o texto padrão e o aviso honesto no chat. Os fiscais valem igual.
const { alertWriter, chatModel, provider: aiProvider } = makeAiModels();
const temIA = Boolean(alertWriter);

// entrega de push pelo serviço do Expo (não precisa de chave)
const pushSender = new ExpoPushSender();

// canal WhatsApp: liga só com as credenciais do provedor (Meta por padrão).
// Sem elas, o sender é null e o canal fica desligado — o resto não muda.
const {
  sender: whatsappSender,
  provider: waProvider,
  verifyToken: whatsappVerifyToken,
  appSecret: whatsappAppSecret,
} = makeWhatsAppSender();

const app = buildApp(sql, {
  logger: true,
  alertWriter,
  chatModel,
  pushSender,
  whatsappSender,
  whatsappVerifyToken,
  whatsappAppSecret,
});

// migrações no boot (idempotentes) — registradas pelo logger estruturado
const applied = await migrate(sql);
if (applied.length) app.log.info({ applied }, 'migrações aplicadas');
if (temIA) app.log.info({ aiProvider }, 'IA ligada');
else app.log.warn({ aiProvider }, 'chave do provedor de IA ausente: alertas com texto padrão e conversa desligada');
if (whatsappSender) app.log.info({ waProvider }, 'canal WhatsApp ligado');
else app.log.info({ waProvider }, 'canal WhatsApp desligado (sem credenciais do provedor)');

const port = Number(process.env.PORT ?? 3000);
// HOST=0.0.0.0 deixa o celular (Expo Go) acessar a API pela rede local
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
app.log.info({ port, host }, 'API no ar');

// keepalive: pinga o PRÓPRIO /health para o Render free não hibernar entre
// visitas (~15 min sem tráfego = dorme, e a 1ª visita seguinte demora). É
// PALIATIVO — a solução definitiva é plano pago (ver README). Liga em produção.
const keepaliveOn = process.env.NODE_ENV === 'production' || process.env.PULSO_KEEPALIVE === '1';
if (keepaliveOn) {
  const intervalo = Number(process.env.PULSO_KEEPALIVE_MS ?? 10 * 60_000);
  setInterval(() => {
    fetch(`http://127.0.0.1:${port}/health`).catch(() => {
      /* best-effort: manter vivo, nunca derrubar */
    });
  }, intervalo).unref();
}

// desligar com elegância: fecha o servidor e o pool antes de sair
async function shutdown(sinal: string) {
  app.log.info({ sinal }, 'encerrando com elegância');
  try {
    await app.close();
    await sql.end({ timeout: 5 });
  } catch (err) {
    app.log.error({ err }, 'erro ao encerrar');
  }
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// erros de processo NUNCA são engolidos: registra com stack.
process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, 'unhandledRejection');
});
process.on('uncaughtException', (err) => {
  app.log.error({ err }, 'uncaughtException — encerrando para reiniciar limpo');
  process.exit(1);
});
