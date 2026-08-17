import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { findCompany } from '../src/http';
import { migrate } from '../src/migrate';
import { loadCompanySnapshot } from '../src/routes/snapshots';
import {
  counterpartyMatchesName,
  matchPartner,
  normalizePartnerName,
  significantTokens,
} from '../src/services/partners';

// -----------------------------------------------------------------
// Unidade: o casador nome ↔ contraparte (puro, rápido)
// -----------------------------------------------------------------

describe('casador de sócio', () => {
  it('normaliza tirando acento, pontuação e caixa', () => {
    expect(normalizePartnerName('João M. Castro')).toBe('JOAO M CASTRO');
    expect(normalizePartnerName('  maria  souza  ')).toBe('MARIA SOUZA');
  });

  it('ignora stopwords e partes curtas ao pegar tokens', () => {
    expect(significantTokens('JOAO DE SOUZA E SILVA')).toEqual(['JOAO', 'SOUZA', 'SILVA']);
  });

  it('casa exigindo primeiro E último nome como palavra inteira', () => {
    const alvo = normalizePartnerName('João Marcelo Castro');
    expect(counterpartyMatchesName('PIX ENVIADO JOAO M CASTRO', alvo)).toBe(true);
    expect(counterpartyMatchesName('TED JOAO CASTRO', alvo)).toBe(true);
    // só o primeiro nome não basta (evita casar homônimo)
    expect(counterpartyMatchesName('PAGAMENTO JOAO DA SILVA', alvo)).toBe(false);
    // contraparte de cliente não casa
    expect(counterpartyMatchesName('CLINICA BOA SAUDE LTDA', alvo)).toBe(false);
  });

  it('matchPartner devolve o primeiro sócio que casa (ou null)', () => {
    const partners = [
      { id: '1', name: 'João Castro', normalizedName: normalizePartnerName('João Castro') },
      { id: '2', name: 'Maria Souza', normalizedName: normalizePartnerName('Maria Souza') },
    ];
    expect(matchPartner('PIX MARIA SOUZA', partners)?.id).toBe('2');
    expect(matchPartner('FORNECEDOR ACME', partners)).toBeNull();
    expect(matchPartner(null, partners)).toBeNull();
  });
});

// -----------------------------------------------------------------
// Ponta a ponta: lista, candidatos, classificação e exclusão do motor
// -----------------------------------------------------------------

const PORT = 5499;
const DATA_DIR = path.join(tmpdir(), 'pulso-pgdata-partners-test');

// fetcher dublê do CNPJ: devolve um quadro societário para testar a semeadura
const fakeCnpjFetcher = (async () =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      razao_social: 'CLINICA TESTE LTDA',
      nome_fantasia: 'Clínica Teste',
      cnae_fiscal: '8630501',
      qsa: [{ nome_socio: 'JOAO CASTRO', qualificacao_socio: 'Sócio-Administrador' }],
    }),
  }) as unknown as Response) as unknown as typeof fetch;

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let token: string;
let companyId: string;

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');
  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql, { cnpjLookup: { fetcher: fakeCnpjFetcher } });
  await app.ready();
  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Clínica Teste', email: 'dono@clinica.com', password: 'senha-boa-123', phone: '11987654321' },
  });
  token = signup.json().token as string;
  const [u] = await sql`SELECT company_id::text AS id FROM users WHERE email = 'dono@clinica.com'`;
  companyId = u!.id as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

const auth = () => ({ authorization: `Bearer ${token}` });

/** Insere um import + lançamentos de teste; devolve os ids dos lançamentos. */
async function seedEntries() {
  const [imp] = await sql`
    INSERT INTO imports (company_id, source, file_hash, row_count, doc_type, status)
    VALUES (${companyId}, 'bank_statement', 'hash-partners-test', 3, 'bank_statement', 'processed')
    RETURNING id`;
  const rows = [
    { kind: 'receivable', amount: 1_000_000, cp: 'PIX RECEBIDO JOAO CASTRO' }, // aporte
    { kind: 'receivable', amount: 500_000, cp: 'CLIENTE X LTDA' }, // receita real
    { kind: 'payable', amount: 300_000, cp: 'TED JOAO CASTRO' }, // saída p/ sócio
  ];
  const ids: Record<string, string> = {};
  for (const r of rows) {
    const [e] = await sql`
      INSERT INTO entries (company_id, import_id, kind, amount_cents, issued_on, due_on, settled_on, counterparty)
      VALUES (${companyId}, ${imp!.id}, ${r.kind}::entry_kind, ${r.amount}, current_date, current_date, current_date, ${r.cp})
      RETURNING id::text AS id`;
    ids[r.cp] = e!.id as string;
  }
  return ids;
}

describe('sócios: lista e semeadura pelo CNPJ', () => {
  it('semeia o quadro societário ao consultar o CNPJ', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/company/cnpj',
      headers: auth(),
      payload: { cnpj: '11222333000181' }, // CNPJ com dígito verificador válido
    });
    expect(res.statusCode).toBe(200);
    const lista = await app.inject({ method: 'GET', url: '/me/partners', headers: auth() });
    const nomes = (lista.json().partners as Array<{ name: string; source: string }>);
    expect(nomes.some((p) => p.name === 'JOAO CASTRO' && p.source === 'cnpj')).toBe(true);
  });

  it('o dono acrescenta uma conta manualmente (e não duplica)', async () => {
    await app.inject({ method: 'POST', url: '/me/partners', headers: auth(), payload: { name: 'Maria Souza' } });
    const dup = await app.inject({ method: 'POST', url: '/me/partners', headers: auth(), payload: { name: 'maria souza' } });
    const partners = dup.json().partners as Array<{ name: string }>;
    expect(partners.filter((p) => p.name.toLowerCase().includes('maria')).length).toBe(1);
  });
});

describe('sócios: candidatos, classificação e exclusão do motor', () => {
  it('propõe só os lançamentos que casam com um sócio', async () => {
    const ids = await seedEntries();
    const res = await app.inject({ method: 'GET', url: '/me/partners/candidates', headers: auth() });
    const cands = res.json().candidates as Array<{ entryId: string; suggestedClass: string; kind: string }>;
    // casam os dois "JOAO CASTRO"; o "CLIENTE X" não
    expect(cands).toHaveLength(2);
    const porId = new Map(cands.map((c) => [c.entryId, c]));
    expect(porId.get(ids['PIX RECEBIDO JOAO CASTRO']!)?.suggestedClass).toBe('aporte');
    expect(porId.get(ids['TED JOAO CASTRO']!)?.suggestedClass).toBe('retirada');
    expect(porId.has(ids['CLIENTE X LTDA']!)).toBe(false);
  });

  it('classificar tira aporte/retirada do motor e mantém pró-labore', async () => {
    const [e] = await sql`SELECT id::text AS id FROM entries WHERE counterparty = 'PIX RECEBIDO JOAO CASTRO'`;
    const [p] = await sql`SELECT id::text AS id FROM entries WHERE counterparty = 'TED JOAO CASTRO'`;

    const company = await findCompany(sql, companyId);
    const antes = await loadCompanySnapshot(sql, company!, '2999-01-01');
    expect(antes.entries).toHaveLength(3); // nada excluído ainda

    // aporte (sai do motor) + pró-labore (o dono diz que a saída é remuneração → fica)
    const res = await app.inject({
      method: 'POST',
      url: '/me/partners/classify',
      headers: auth(),
      payload: {
        items: [
          { entryId: e!.id, class: 'aporte' },
          { entryId: p!.id, class: 'pro_labore' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().classified).toBe(2);

    const depois = await loadCompanySnapshot(sql, company!, '2999-01-01');
    const cps = depois.entries.map((x) => x.counterparty).sort();
    // o aporte saiu; o pró-labore e o cliente real ficaram
    expect(depois.entries).toHaveLength(2);
    expect(cps).toEqual(['CLIENTE X LTDA', 'TED JOAO CASTRO']);
  });
});
