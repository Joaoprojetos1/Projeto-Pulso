import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { NO_DATA_REPLY } from '../src/ai/chat';
import { buildApp } from '../src/app';
import {
  NOT_LINKED_REPLY,
  type MetaOutbound,
  type MetaWebhookPayload,
  type WhatsAppSender,
} from '../src/channels/whatsapp';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { bearer, seedAdminToken } from './helpers';

/**
 * Integração do canal WhatsApp: verificação do webhook, opt-in do dono, e o fluxo
 * de entrada (telefone → empresa → MESMO cérebro → envio da resposta). O provedor
 * é um dublê (fakeSender) que só guarda o que seria enviado — nada fala com a Meta.
 */

const PORT = 5512;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-whatsapp');
const VERIFY = 'verify-seg';
const P1 = '5531999990000'; // '(31) 99999-0000' normalizado

const sent: MetaOutbound[] = [];
const fakeSender: WhatsAppSender = {
  name: 'fake',
  async send(msg) {
    sent.push(msg);
    return { ok: true, id: 'fake-id' };
  },
};

/** Payload da Meta com uma mensagem de texto (id opcional para idempotência). */
function inbound(from: string, text: string, id?: string): MetaWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from, id, type: 'text', text: { body: text } }] } }] }],
  };
}

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let TOKEN: string;

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');

  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql, { whatsappSender: fakeSender, whatsappVerifyToken: VERIFY, chatModel: null });
  await app.ready();
  TOKEN = await seedAdminToken(sql);
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  sent.length = 0;
});

describe('verificação do webhook (Meta handshake)', () => {
  it('devolve o challenge quando o verify_token confere', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=42`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('42');
  });

  it('recusa (403) quando o token não confere', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('opt-in do dono (/me/whatsapp)', () => {
  it('liga o WhatsApp à conta, normalizando o número', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/whatsapp',
      headers: bearer(TOKEN),
      payload: { phone: '(31) 99999-0000' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ linked: true, phone: P1 });
  });

  it('mostra o vínculo atual', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/whatsapp', headers: bearer(TOKEN) });
    expect(res.json()).toMatchObject({ linked: true, phone: P1 });
  });

  it('recusa número curto demais (422)', async () => {
    // passa no schema (>= 8 chars) mas normaliza para menos de 12 dígitos
    const res = await app.inject({
      method: 'POST',
      url: '/me/whatsapp',
      headers: bearer(TOKEN),
      payload: { phone: '12345678' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('exige login', async () => {
    const res = await app.inject({ method: 'POST', url: '/me/whatsapp', payload: { phone: '(31) 99999-0000' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('mensagem recebida (fluxo de entrada)', () => {
  it('número vinculado: resolve a empresa, conversa e ENVIA a resposta', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload: inbound(P1, 'Como está meu caixa?') });
    expect(res.statusCode).toBe(200);
    // sem snapshot ainda, o cérebro responde o aviso honesto — mas o TRANSPORTE entregou
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: P1, text: { body: NO_DATA_REPLY } });
  });

  it('número NÃO vinculado: responde o aviso de vínculo, sem tocar no cérebro', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload: inbound('5511888887777', 'oi') });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text.body).toBe(NOT_LINKED_REPLY);
  });

  it('evento sem texto (status de entrega): 200 e nada enviado', async () => {
    const payload: MetaWebhookPayload = {
      entry: [{ changes: [{ value: { messages: [{ from: P1, type: 'image' }] } }] }],
    };
    const res = await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it('idempotência: a mesma mensagem (mesmo id) não é respondida duas vezes', async () => {
    const p = inbound(P1, 'e agora?', 'wamid.DEDUP');
    const r1 = await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload: p });
    expect(r1.statusCode).toBe(200);
    expect(sent).toHaveLength(1);

    const r2 = await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload: p });
    expect(r2.statusCode).toBe(200);
    expect(r2.json()).toMatchObject({ duplicate: true });
    expect(sent).toHaveLength(1); // não enviou de novo
  });
});

describe('opt-out do dono (/me/whatsapp DELETE)', () => {
  it('desliga o vínculo — e aí a mensagem cai no aviso de não-vinculado', async () => {
    const del = await app.inject({ method: 'DELETE', url: '/me/whatsapp', headers: bearer(TOKEN) });
    expect(del.json()).toEqual({ linked: false });

    const res = await app.inject({ method: 'POST', url: '/webhooks/whatsapp', payload: inbound(P1, 'oi de novo') });
    expect(res.statusCode).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text.body).toBe(NOT_LINKED_REPLY);
  });
});
