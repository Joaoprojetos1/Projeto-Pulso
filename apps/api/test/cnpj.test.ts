import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import {
  isValidCnpj,
  lookupCnpj,
  normalizeCnpj,
  suggestNicheFromCnae,
} from '../src/services/cnpj';

// CNPJs de teste com dígito verificador VÁLIDO (11.444.777/0001-61 é o clássico).
const CNPJ_OK = '11.444.777/0001-61';
const CNPJ_OK2 = '11222333000181';

const brasilApiBody = (cnae: string) => ({
  razao_social: 'Clínica Exemplo LTDA',
  nome_fantasia: 'Clínica Exemplo',
  descricao_situacao_cadastral: 'ATIVA',
  cnae_fiscal: cnae,
  cnae_fiscal_descricao: 'Atividade médica ambulatorial',
  logradouro: 'Rua das Flores',
  numero: '100',
  bairro: 'Centro',
  municipio: 'São Paulo',
  uf: 'SP',
  cep: '01000-000',
  qsa: [{ nome_socio: 'Fulano de Tal', qualificacao_socio: 'Sócio-Administrador' }],
});

const receitaWsBody = () => ({
  status: 'OK',
  nome: 'Restaurante Exemplo LTDA',
  fantasia: 'Restaurante Exemplo',
  situacao: 'ATIVA',
  atividade_principal: [{ code: '56.11-2-01', text: 'Restaurantes' }],
  logradouro: 'Av. Central',
  numero: '50',
  municipio: 'Rio de Janeiro',
  uf: 'RJ',
  qsa: [{ nome: 'Beltrano', qual: 'Sócio' }],
});

describe('CNPJ — validação e sugestão de segmento (puro)', () => {
  it('valida dígito verificador', () => {
    expect(isValidCnpj(CNPJ_OK)).toBe(true);
    expect(isValidCnpj(CNPJ_OK2)).toBe(true);
    expect(isValidCnpj('11.444.777/0001-60')).toBe(false); // dígito trocado
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false); // todos iguais
  });

  it('normaliza para 14 dígitos', () => {
    expect(normalizeCnpj(CNPJ_OK)).toBe('11444777000161');
  });

  it('sugere o segmento pelo CNAE', () => {
    expect(suggestNicheFromCnae('8630501')).toBe('clinica');
    expect(suggestNicheFromCnae('4781400')).toBe('varejo');
    expect(suggestNicheFromCnae('5611201')).toBe('restaurante');
    expect(suggestNicheFromCnae('9999999')).toBeNull();
  });
});

describe('CNPJ — consulta com fallback + cache + rota', () => {
  const PORT = 5501;
  const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-cnpj');
  let pg: EmbeddedPostgres;
  let sql: Sql;

  let calls: string[] = [];
  // Fetcher falso: despacha por URL. brasilapi 500 força o fallback quando pedido.
  const makeFetcher =
    (brasilApiOk: boolean): typeof fetch =>
    async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('brasilapi.com.br')) {
        if (!brasilApiOk) return new Response('erro', { status: 500 });
        return new Response(JSON.stringify(brasilApiBody('8630501')), { status: 200 });
      }
      if (u.includes('receitaws.com.br')) {
        return new Response(JSON.stringify(receitaWsBody()), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };

  beforeAll(async () => {
    rmSync(DATA_DIR, { recursive: true, force: true });
    pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('pulso_test');
    sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
    await migrate(sql);
  });

  afterAll(async () => {
    await sql?.end();
    await pg?.stop();
  });

  it('BrasilAPI responde e o resultado é cacheado (2ª consulta não bate na rede)', async () => {
    calls = [];
    const r1 = await lookupCnpj(sql, CNPJ_OK, { fetcher: makeFetcher(true) });
    expect(r1.source).toBe('brasilapi');
    expect(r1.data.razaoSocial).toBe('Clínica Exemplo LTDA');
    expect(r1.data.suggestedNiche).toBe('clinica');
    expect(calls.length).toBe(1);

    const r2 = await lookupCnpj(sql, CNPJ_OK, { fetcher: makeFetcher(true) });
    expect(r2.source).toBe('cache');
    expect(calls.length).toBe(1); // não chamou de novo
  });

  it('BrasilAPI falha → cai no fallback ReceitaWS', async () => {
    calls = [];
    const r = await lookupCnpj(sql, CNPJ_OK2, { fetcher: makeFetcher(false) });
    expect(r.source).toBe('receitaws');
    expect(r.data.razaoSocial).toBe('Restaurante Exemplo LTDA');
    expect(r.data.suggestedNiche).toBe('restaurante');
    expect(calls.some((u) => u.includes('brasilapi'))).toBe(true);
    expect(calls.some((u) => u.includes('receitaws'))).toBe(true);
  });

  it('CNPJ inválido é rejeitado sem tocar a rede', async () => {
    calls = [];
    await expect(lookupCnpj(sql, '123', { fetcher: makeFetcher(true) })).rejects.toThrow(/inválido/i);
    expect(calls.length).toBe(0);
  });

  it('rota POST /me/company/cnpj consulta, grava e sugere o segmento', async () => {
    const app = buildApp(sql, { cnpjLookup: { fetcher: makeFetcher(true) } });
    await app.ready();

    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'dono@cnpj.teste',
        password: 'senha-forte-123',
        businessName: 'Sem Nome',
        phone: '(11) 99999-8888',
      },
    });
    expect(signup.statusCode).toBe(201);
    const token = signup.json().token as string;

    const res = await app.inject({
      method: 'POST',
      url: '/me/company/cnpj',
      headers: { authorization: `Bearer ${token}` },
      payload: { cnpj: '11.444.777/0001-61' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.company.razaoSocial).toBe('Clínica Exemplo LTDA');
    expect(body.company.cnpj).toBe('11444777000161');
    expect(body.suggestedNiche).toBe('clinica');
    expect(body.company.niche).toBe('clinica');

    // CNPJ inválido: erro no campo, não silêncio
    const bad = await app.inject({
      method: 'POST',
      url: '/me/company/cnpj',
      headers: { authorization: `Bearer ${token}` },
      payload: { cnpj: '11.444.777/0001-60' },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error).toMatch(/inválido/i);

    await app.close();
  });

  it('trava do onboarding: conta nova sem CNPJ, PATCH grava o CNPJ do fallback', async () => {
    const app = buildApp(sql, { cnpjLookup: { fetcher: makeFetcher(true) } });
    await app.ready();

    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'fallback@cnpj.teste',
        password: 'senha-forte-123',
        businessName: 'Sem CNPJ',
        phone: '(11) 99999-7777',
      },
    });
    expect(signup.statusCode).toBe(201);
    const token = signup.json().token as string;
    const auth = { authorization: `Bearer ${token}` };

    // conta nova: o painel já traz a empresa, mas SEM CNPJ (cadastro incompleto)
    const d0 = await app.inject({ method: 'GET', url: '/me/dashboard', headers: auth });
    expect(d0.statusCode).toBe(200);
    expect(d0.json().company.cnpj).toBeNull();

    // fallback: grava o CNPJ digitado direto no PATCH (sem consultar a base pública)
    const patch = await app.inject({
      method: 'PATCH',
      url: '/me/company',
      headers: auth,
      payload: { niche: 'varejo', cnpj: '11.444.777/0001-61' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().company.cnpj).toBe('11444777000161');
    expect(patch.json().company.niche).toBe('varejo');

    // agora o painel reflete o cadastro completo (CNPJ presente → onboarded)
    const d1 = await app.inject({ method: 'GET', url: '/me/dashboard', headers: auth });
    expect(d1.json().company.cnpj).toBe('11444777000161');

    // CNPJ inválido no PATCH: 422 no campo, não grava
    const badPatch = await app.inject({
      method: 'PATCH',
      url: '/me/company',
      headers: auth,
      payload: { cnpj: '11.444.777/0001-60' },
    });
    expect(badPatch.statusCode).toBe(422);

    await app.close();
  });
});
