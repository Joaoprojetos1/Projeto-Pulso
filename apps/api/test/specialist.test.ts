import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AlertFact } from '@pulso/core';
import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SAFE_REPLY, type ChatModel } from '../src/ai/chat';
import { buildDiagnosisPrompt } from '../src/ai/diagnosis-writer';
import { buildPrompt } from '../src/ai/writer';
import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import { keywords, renderSpecialistForWriter, type SpecialistContext } from '../src/services/specialist';
import { bearer, seedAdminToken } from './helpers';

const PORT = 5531;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-specialist-test');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let ADMIN: string;
let OWNER: string;

// modelo dublê: captura o prompt e responde o que o teste mandar
const captured: Array<{ system: string; turns: Array<{ role: string; content: string }> }> = [];
let respostaDoModelo = 'Vale acompanhar o painel de perto.';
const chatModel: ChatModel = {
  reply: async (prompt) => {
    captured.push({ system: prompt.system, turns: prompt.turns.map((t) => ({ ...t })) });
    return { text: respostaDoModelo, modelVersion: 'mock-especialista' };
  },
};

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');

  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql, { chatModel });
  await app.ready();
  ADMIN = await seedAdminToken(sql);

  // um dono comum, para provar que a bancada não existe para ele
  await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Loja do Dono', email: 'dono@bancada.teste', password: 'senha-forte-123', phone: '11987654321' },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'dono@bancada.teste', password: 'senha-forte-123' },
  });
  OWNER = login.json().token as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

beforeEach(async () => {
  captured.length = 0;
  respostaDoModelo = 'Vale acompanhar o painel de perto.';
  // cada teste começa com a bancada vazia
  await sql`DELETE FROM specialist_guidance`;
  await sql`DELETE FROM specialist_examples`;
});

/** Empresa com retrato calculado num estágio, e um aviso de caixa ativo. */
async function seedCompany(stage: string, niche = 'geral'): Promise<string> {
  const [c] = await sql`INSERT INTO companies (name, niche) VALUES (${`Empresa ${stage} ${niche}`}, ${niche}) RETURNING id`;
  const [s] = await sql`
    INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload, diagnosis)
    VALUES (${c.id}, '2026-07-15', 'test',
            ${sql.json({ cash_balance: { key: 'cash_balance', value: 1_500_000, unit: 'cents', inputs: {} } })},
            ${sql.json({ stage, drivers: [], transitions: {}, facts: {}, text: { title: 'Momento', body: 'Texto.' } })})
    RETURNING id`;
  await sql`
    INSERT INTO alerts (company_id, snapshot_id, rule_key, severity, facts, text_title, text_body)
    VALUES (${c.id}, ${s.id}, 'cash_runway', 'critical', ${sql.json({ zeroOn: '2026-07-29' })},
            'Seu caixa pode zerar em 29 de julho', null)`;
  return c.id as string;
}

const admin = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, headers: bearer(ADMIN), ...(payload === undefined ? {} : { payload: payload as never }) });

/** A conversa DO DONO (o caminho de produção), pela superfície de operador. */
const perguntarComoDono = (companyId: string, content: string) =>
  app.inject({
    method: 'POST',
    url: `/companies/${companyId}/chat`,
    headers: bearer(ADMIN),
    payload: { messages: [{ role: 'user', content }] },
  });

async function criarOrientacao(body: Record<string, unknown>): Promise<string> {
  const res = await admin('POST', '/admin/specialist/guidance', body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json().id as string;
}

describe('bancada do especialista: acesso', () => {
  it('quem não é admin recebe 404 em toda a bancada (nem revela que existe)', async () => {
    const rotas: Array<['GET' | 'POST', string, unknown?]> = [
      ['GET', '/admin/specialist'],
      ['POST', '/admin/specialist/guidance', { scope: 'geral', title: 't', body: 'b' }],
      ['POST', '/admin/specialist/try', { companyId: '00000000-0000-4000-8000-000000000000', question: 'oi' }],
      ['POST', '/admin/specialist/examples', { question: 'q', answer: 'a' }],
    ];
    for (const [method, url, payload] of rotas) {
      const semLogin = await app.inject({ method, url, ...(payload ? { payload: payload as never } : {}) });
      expect(semLogin.statusCode, `${method} ${url} sem login`).toBe(404);
      const dono = await app.inject({ method, url, headers: bearer(OWNER), ...(payload ? { payload: payload as never } : {}) });
      expect(dono.statusCode, `${method} ${url} dono`).toBe(404);
    }
  });
});

describe('orientações: rascunho, publicação e escopo', () => {
  it('rascunho NÃO chega ao dono; publicada passa a valer na conversa seguinte', async () => {
    const empresa = await seedCompany('pressao');
    const id = await criarOrientacao({
      scope: 'estagio',
      scopeKey: 'pressao',
      title: 'Primeiro passo em pressão',
      body: 'Recomende renegociar o prazo com o maior fornecedor antes de cortar custo.',
    });

    await perguntarComoDono(empresa, 'O que eu faço agora?');
    expect(captured[0]!.system).not.toMatch(/renegociar o prazo com o maior fornecedor/);

    const pub = await admin('POST', `/admin/specialist/guidance/${id}/publish`);
    expect(pub.json().status).toBe('publicada');
    // a data vai em ISO: o texto cru do banco ("... +00") o navegador não lê
    expect(pub.json().publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    await perguntarComoDono(empresa, 'O que eu faço agora?');
    expect(captured[1]!.system).toMatch(/ORIENTAÇÕES DO ESPECIALISTA/);
    expect(captured[1]!.system).toMatch(/renegociar o prazo com o maior fornecedor/);
    // a autorização de juízo e as regras inegociáveis continuam no prompt
    expect(captured[1]!.system).toMatch(/REGRAS INEGOCIÁVEIS/);
  });

  it('orientação de estágio só entra para empresa naquele estágio; a geral entra para todas', async () => {
    const emPressao = await seedCompany('pressao');
    const saudavel = await seedCompany('saudavel');
    const doEstagio = await criarOrientacao({ scope: 'estagio', scopeKey: 'pressao', title: 'Pressão', body: 'Fale de renegociar fornecedor.' });
    const geral = await criarOrientacao({ scope: 'geral', title: 'Tom', body: 'Feche sempre com um próximo passo concreto.' });
    await admin('POST', `/admin/specialist/guidance/${doEstagio}/publish`);
    await admin('POST', `/admin/specialist/guidance/${geral}/publish`);

    await perguntarComoDono(emPressao, 'E agora?');
    await perguntarComoDono(saudavel, 'E agora?');

    expect(captured[0]!.system).toMatch(/renegociar fornecedor/);
    expect(captured[0]!.system).toMatch(/próximo passo concreto/);
    expect(captured[1]!.system).not.toMatch(/renegociar fornecedor/);
    expect(captured[1]!.system).toMatch(/próximo passo concreto/);
  });

  it('orientação de aviso entra quando o aviso está ativo, e respeita o segmento', async () => {
    const clinica = await seedCompany('critico', 'clinica');
    const varejo = await seedCompany('critico', 'varejo');
    const id = await criarOrientacao({
      scope: 'aviso',
      scopeKey: 'cash_runway',
      niche: 'clinica',
      title: 'Caixa zerando na clínica',
      body: 'Comece pela agenda de convênios a receber.',
    });
    await admin('POST', `/admin/specialist/guidance/${id}/publish`);

    await perguntarComoDono(clinica, 'Como evito o caixa zerar?');
    await perguntarComoDono(varejo, 'Como evito o caixa zerar?');

    expect(captured[0]!.system).toMatch(/agenda de convênios a receber/);
    expect(captured[1]!.system).not.toMatch(/agenda de convênios a receber/);
  });

  it('editar depois de publicar não muda o que está no ar; desligar tira na hora', async () => {
    const empresa = await seedCompany('atencao');
    const id = await criarOrientacao({ scope: 'geral', title: 'Tom', body: 'Texto original aprovado.' });
    await admin('POST', `/admin/specialist/guidance/${id}/publish`);

    const edit = await admin('PATCH', `/admin/specialist/guidance/${id}`, { body: 'Texto novo ainda em rascunho.' });
    expect(edit.json().status).toBe('alterada');

    await perguntarComoDono(empresa, 'Como estou?');
    expect(captured[0]!.system).toMatch(/Texto original aprovado/);
    expect(captured[0]!.system).not.toMatch(/Texto novo ainda em rascunho/);

    const off = await admin('POST', `/admin/specialist/guidance/${id}/unpublish`);
    expect(off.json().status).toBe('rascunho');
    await perguntarComoDono(empresa, 'Como estou?');
    expect(captured[1]!.system).not.toMatch(/ORIENTAÇÕES DO ESPECIALISTA/);
  });

  it('histórico: cada publicação vira versão, e voltar traz o texto para o rascunho', async () => {
    const id = await criarOrientacao({ scope: 'geral', title: 'Tom', body: 'Versão um.' });
    await admin('POST', `/admin/specialist/guidance/${id}/publish`);
    await admin('PATCH', `/admin/specialist/guidance/${id}`, { body: 'Versão dois.' });
    await admin('POST', `/admin/specialist/guidance/${id}/publish`);
    // publicar de novo o mesmo texto não duplica a versão
    await admin('POST', `/admin/specialist/guidance/${id}/publish`);

    const versoes = (await admin('GET', `/admin/specialist/guidance/${id}/versions`)).json().versions as Array<{ id: string; body: string }>;
    expect(versoes.map((v) => v.body)).toEqual(['Versão dois.', 'Versão um.']);

    const volta = await admin('POST', `/admin/specialist/guidance/${id}/restore`, { versionId: versoes[1]!.id });
    // voltou para o RASCUNHO: no ar segue a versão dois até publicar
    expect(volta.json().body).toBe('Versão um.');
    expect(volta.json().publishedBody).toBe('Versão dois.');
    expect(volta.json().status).toBe('alterada');
  });

  it('valida escopo, texto vazio e segmento', async () => {
    const semChave = await admin('POST', '/admin/specialist/guidance', { scope: 'estagio', title: 't', body: 'b' });
    expect(semChave.statusCode).toBe(422);
    const chaveErrada = await admin('POST', '/admin/specialist/guidance', { scope: 'aviso', scopeKey: 'regra_que_nao_existe', title: 't', body: 'b' });
    expect(chaveErrada.statusCode).toBe(422);
    const vazio = await admin('POST', '/admin/specialist/guidance', { scope: 'geral', title: 't', body: '   ' });
    expect(vazio.statusCode).toBe(422);
    const segmento = await admin('POST', '/admin/specialist/guidance', { scope: 'geral', niche: 'padaria', title: 't', body: 'b' });
    expect(segmento.statusCode).toBe(422);
  });

  it('toda escrita fica na auditoria, sem o texto da orientação', async () => {
    const antes = Number((await sql`SELECT count(*)::int AS n FROM admin_audit WHERE action LIKE 'specialist.%'`)[0]!.n);
    const id = await criarOrientacao({ scope: 'geral', title: 'Tom', body: 'Um texto que não deve ir para a auditoria.' });
    await admin('POST', `/admin/specialist/guidance/${id}/publish`);
    await admin('DELETE', `/admin/specialist/guidance/${id}`);

    const linhas = await sql`SELECT action, payload FROM admin_audit WHERE action LIKE 'specialist.%' ORDER BY created_at`;
    expect(linhas.length - antes).toBe(3);
    expect(JSON.stringify(linhas.map((l) => l.payload))).not.toMatch(/não deve ir para a auditoria/);
  });
});

describe('ensaio: perguntar ao Ivo como se fosse o dono', () => {
  it('com rascunhos ligados, o ensaio usa o texto que ainda não foi publicado', async () => {
    const empresa = await seedCompany('pressao');
    await criarOrientacao({ scope: 'estagio', scopeKey: 'pressao', title: 'Rascunho', body: 'Sugira antecipar recebíveis com cautela.' });

    const semRascunho = await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'O que faço?' });
    expect(semRascunho.json().applied.guidance).toHaveLength(0);

    const comRascunho = await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'O que faço?', includeDrafts: true });
    expect(comRascunho.statusCode).toBe(200);
    expect(comRascunho.json().applied.guidance.map((g: { title: string }) => g.title)).toEqual(['Rascunho']);
    expect(comRascunho.json().stage).toBe('pressao');
    expect(captured[1]!.system).toMatch(/antecipar recebíveis com cautela/);
  });

  it('não deixa rastro na empresa: nada na memória da conversa nem na medição de consumo', async () => {
    const empresa = await seedCompany('pressao');
    await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'Quando meu caixa zera?' });

    const [mem] = await sql`SELECT count(*)::int AS n FROM chat_messages WHERE company_id = ${empresa}`;
    const [uso] = await sql`SELECT count(*)::int AS n FROM ai_usage WHERE company_id = ${empresa}`;
    expect(mem!.n).toBe(0);
    expect(uso!.n).toBe(0);
  });

  it('o fiscal de números continua valendo, e o ensaio mostra o que foi barrado', async () => {
    const empresa = await seedCompany('pressao');
    respostaDoModelo = 'Você tem R$ 87.000 em caixa.'; // número que não está no retrato

    const res = await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'Quanto tenho?' });
    expect(res.json().reply).toBe(SAFE_REPLY);
    expect(res.json().blocked.numbers).toContain(87000);
  });

  it('número escrito pelo especialista numa orientação pode ser citado; sem a orientação, é barrado', async () => {
    const empresa = await seedCompany('pressao');
    respostaDoModelo = 'A referência do especialista é manter reserva para 90 dias.';

    const antes = await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'Quanto de reserva?' });
    expect(antes.json().reply).toBe(SAFE_REPLY);

    const id = await criarOrientacao({ scope: 'geral', title: 'Reserva', body: 'A referência é manter reserva para 90 dias de custo fixo.' });
    await admin('POST', `/admin/specialist/guidance/${id}/publish`);

    const depois = await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'Quanto de reserva?' });
    expect(depois.json().reply).toBe(respostaDoModelo);
    expect(depois.json().blocked).toBeNull();
  });

  it('empresa sem retrato: avisa que não há dados, sem chamar a IA', async () => {
    const [c] = await sql`INSERT INTO companies (name) VALUES ('Sem Dados') RETURNING id`;
    const res = await admin('POST', '/admin/specialist/try', { companyId: c!.id, question: 'Oi' });
    expect(res.json().hasData).toBe(false);
    expect(captured).toHaveLength(0);
  });
});

describe('exemplos: "eu diria assim"', () => {
  it('a correção vira referência nas perguntas parecidas, e só nelas', async () => {
    const empresa = await seedCompany('pressao');
    const criar = await admin('POST', '/admin/specialist/examples', {
      question: 'Vale a pena antecipar recebíveis da maquininha?',
      originalAnswer: 'Depende.',
      answer: 'Só antecipe o que cobre um buraco com data marcada; antecipar todo mês vira custo fixo escondido.',
      stage: 'pressao',
    });
    expect(criar.statusCode).toBe(201);

    await perguntarComoDono(empresa, 'Devo antecipar os recebíveis?');
    expect(captured[0]!.system).toMatch(/EXEMPLOS APROVADOS PELO ESPECIALISTA/);
    expect(captured[0]!.system).toMatch(/custo fixo escondido/);

    await perguntarComoDono(empresa, 'Quem é meu maior cliente?');
    expect(captured[1]!.system).not.toMatch(/custo fixo escondido/);
  });

  it('exemplo desligado sai da conversa; e número de exemplo NÃO libera o fiscal', async () => {
    const empresa = await seedCompany('pressao');
    const criar = await admin('POST', '/admin/specialist/examples', {
      question: 'Quando meu caixa zera?',
      answer: 'Pelos seus números o caixa aguenta até 14 de março, com R$ 42.000 a receber.',
    });
    const id = criar.json().id as string;

    // o modelo copia o número do exemplo (que é de OUTRA empresa): tem que ser barrado
    respostaDoModelo = 'Você tem R$ 42.000 a receber.';
    const res = await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'Quando meu caixa zera?' });
    expect(res.json().applied.examples).toHaveLength(1);
    expect(res.json().reply).toBe(SAFE_REPLY);
    expect(res.json().blocked.numbers).toContain(42000);

    await admin('PATCH', `/admin/specialist/examples/${id}`, { active: false });
    const desligado = await admin('POST', '/admin/specialist/try', { companyId: empresa, question: 'Quando meu caixa zera?' });
    expect(desligado.json().applied.examples).toHaveLength(0);
  });

  it('a leitura da bancada devolve orientações, exemplos, empresas e as opções das telas', async () => {
    await seedCompany('uti', 'restaurante');
    await criarOrientacao({ scope: 'geral', title: 'Tom', body: 'Seja direto.' });
    await admin('POST', '/admin/specialist/examples', { question: 'Pergunta?', answer: 'Resposta.' });

    const res = await admin('GET', '/admin/specialist');
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.guidance).toHaveLength(1);
    expect(b.guidance[0].status).toBe('rascunho');
    expect(b.examples).toHaveLength(1);
    expect(b.companies.some((c: { stageLabel: string | null }) => c.stageLabel === 'UTI')).toBe(true);
    expect(b.options.stages.map((s: { key: string }) => s.key)).toEqual(['saudavel', 'atencao', 'pressao', 'critico', 'uti']);
    expect(b.options.rules.some((r: { key: string }) => r.key === 'cash_runway')).toBe(true);
    expect(b.options.aiAvailable).toBe(true);
  });
});

describe('textos curtos (aviso e momento): a orientação entra sem afrouxar o fiscal', () => {
  const ctx: SpecialistContext = {
    guidance: [
      { id: '1', scope: 'geral', scopeKey: '', title: 'Tom', body: 'Geral não entra em texto curto.' },
      { id: '2', scope: 'aviso', scopeKey: 'cash_runway', title: 'Caixa', body: 'Peça para ligar hoje para o banco.' },
      { id: '3', scope: 'estagio', scopeKey: 'uti', title: 'UTI', body: 'Fale em cortar o que não é essencial.' },
    ],
    examples: [],
  };
  const alerta = { ruleKey: 'cash_runway', severity: 'critical', facts: { zeroOn: '2026-07-29' } } as unknown as AlertFact;
  const perfil = { name: 'Empresa', niche: 'geral' };

  it('o aviso recebe só a orientação da própria regra, no system, com a trava de não citar número', () => {
    const bloco = renderSpecialistForWriter(ctx, 'aviso', 'cash_runway');
    expect(bloco).toMatch(/ligar hoje para o banco/);
    expect(bloco).toMatch(/NÃO é fonte de números/);
    expect(bloco).not.toMatch(/Geral não entra/);
    expect(renderSpecialistForWriter(ctx, 'aviso', 'scissor')).toBe('');

    const prompt = buildPrompt(alerta, perfil, [], bloco);
    expect(prompt.system).toMatch(/ligar hoje para o banco/);
    // o conteúdo do usuário segue sendo SÓ o alerta + perfil
    expect(prompt.user).not.toMatch(/banco/);
    // sem orientação, o prompt é idêntico ao de antes
    expect(buildPrompt(alerta, perfil, [], '').system).toBe(buildPrompt(alerta, perfil).system);
  });

  it('o momento recebe a orientação do estágio', () => {
    const bloco = renderSpecialistForWriter(ctx, 'estagio', 'uti');
    const diag = { stage: 'uti', drivers: [], transitions: {}, facts: {} } as never;
    expect(buildDiagnosisPrompt(diag, perfil, [], bloco).system).toMatch(/cortar o que não é essencial/);
  });

  it('as palavras-chave ignoram acento e palavras vazias', () => {
    expect([...keywords('Devo antecipar os recebíveis da maquininha?')].sort()).toEqual(['antecipar', 'maquininha', 'recebiveis']);
  });
});
