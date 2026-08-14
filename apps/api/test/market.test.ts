import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareToMarket } from '@pulso/core';
import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';
import {
  loadMarketReference,
  refreshBenchmarks,
  type BenchmarkResearcher,
} from '../src/services/market';
import { bearer, seedAdminToken } from './helpers';

/**
 * Referência de mercado (item 3.6): a IA pesquisa (aqui um dublê), o CÓDIGO valida
 * (faixa + fonte) e grava; o dashboard passa a comparar. O dublê devolve de tudo —
 * número são, número absurdo (descartado) e sem fonte (descartado).
 */

const PORT = 5521;
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.pgdata-market');

// dublê do pesquisador: prova a peneira do código sem tocar em IA nem na web.
const fakeResearcher: BenchmarkResearcher = {
  async research(t) {
    if (t.indicatorKey === 'clinica_taxa_glosa') return { typicalValue: 0.1, source: 'Pesquisa Setorial X (http://x)', asOfMonth: '2026-06' };
    if (t.indicatorKey === 'varejo_margem_bruta') return { typicalValue: 2.0, source: 'fonte' }; // ratio > 1 → descartado
    if (t.indicatorKey === 'varejo_giro_estoque') return { typicalValue: 6, source: '   ' }; // sem fonte → descartado
    return { typicalValue: 0.5, source: 'Fonte Y' }; // demais válidos
  },
};

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let appSemIA: ReturnType<typeof buildApp>;
let TOKEN: string;

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');
  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql, { marketResearcher: fakeResearcher });
  appSemIA = buildApp(sql); // sem pesquisador
  await app.ready();
  await appSemIA.ready();
  TOKEN = await seedAdminToken(sql);
});

afterAll(async () => {
  await app?.close();
  await appSemIA?.close();
  await sql?.end();
  await pg?.stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

describe('loadMarketReference (banco vazio)', () => {
  it('sem benchmark: não compara (benchmarkFor null)', async () => {
    const ref = await loadMarketReference(sql);
    expect(ref.benchmarkFor('clinica', 'clinica_taxa_glosa')).toBeNull();
  });
});

describe('refreshBenchmarks (a peneira do código)', () => {
  it('grava os válidos e descarta valor absurdo e sem fonte', async () => {
    const res = await refreshBenchmarks(sql, fakeResearcher);
    // 7 alvos: 5 válidos, 2 descartados (varejo_margem_bruta fora da faixa, varejo_giro sem fonte)
    expect(res.updated).toBe(5);
    expect(res.skipped.map((s) => s.indicatorKey).sort()).toEqual(['varejo_giro_estoque', 'varejo_margem_bruta']);
  });

  it('depois de gravar, a referência compara e traz a fonte', async () => {
    const ref = await loadMarketReference(sql);
    const b = ref.benchmarkFor('clinica', 'clinica_taxa_glosa');
    expect(b?.typicalValue).toBe(0.1);
    expect(b?.source).toContain('Pesquisa Setorial X');
    expect(b?.direction).toBe('lower_is_better');
    // empresa com glosa 0.2 (acima do típico 0.1) → posição acima, DESFAVORÁVEL (menor é melhor)
    const cmp = compareToMarket(0.2, b!);
    expect(cmp.position).toBe('acima');
    expect(cmp.favorable).toBe(false);
  });
});

describe('/admin/market (operador)', () => {
  it('lista os benchmarks gravados', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/market', headers: bearer(TOKEN) });
    expect(res.statusCode).toBe(200);
    const b = res.json().benchmarks as Array<{ indicatorKey: string; source: string }>;
    expect(b.length).toBe(5);
    expect(b.find((x) => x.indicatorKey === 'clinica_taxa_glosa')?.source).toContain('Pesquisa Setorial X');
  });

  it('exige admin', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/market' });
    expect(res.statusCode).not.toBe(200);
  });

  it('refresh sem IA configurada: 503', async () => {
    const res = await appSemIA.inject({ method: 'POST', url: '/admin/market/refresh', headers: bearer(TOKEN), payload: {} });
    expect(res.statusCode).toBe(503);
  });

  it('refresh com IA (dublê) e admin: 200 e atualiza', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/market/refresh', headers: bearer(TOKEN), payload: { segment: 'clinica' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBeGreaterThan(0);
  });
});
