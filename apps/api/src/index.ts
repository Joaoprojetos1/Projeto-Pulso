import { existsSync, readFileSync } from 'node:fs';

import { AnthropicChatModel } from './ai/chat';
import { AnthropicAlertWriter } from './ai/writer';
import { buildApp } from './app';
import { createSql } from './db';
import { migrate } from './migrate';
import { ExpoPushSender } from './push';

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

// com ANTHROPIC_API_KEY a IA redige alertas e responde a conversa;
// sem ela, entram o texto padrão e o aviso honesto no chat
const temIA = Boolean(process.env.ANTHROPIC_API_KEY);
const alertWriter = temIA ? new AnthropicAlertWriter() : null;
const chatModel = temIA ? new AnthropicChatModel() : null;

// entrega de push pelo serviço do Expo (não precisa de chave)
const pushSender = new ExpoPushSender();

const app = buildApp(sql, { logger: true, alertWriter, chatModel, pushSender });

// migrações no boot (idempotentes) — registradas pelo logger estruturado
const applied = await migrate(sql);
if (applied.length) app.log.info({ applied }, 'migrações aplicadas');
if (!temIA) app.log.warn('ANTHROPIC_API_KEY ausente: alertas com texto padrão e conversa desligada');

const port = Number(process.env.PORT ?? 3000);
// HOST=0.0.0.0 deixa o celular (Expo Go) acessar a API pela rede local
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
app.log.info({ port, host }, 'API no ar');
