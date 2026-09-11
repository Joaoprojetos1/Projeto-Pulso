import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  extractionModelFromProvider,
  textoParaData,
  textoParaMes,
  validateExtraction,
  type ExtractionContext,
  type ExtractionModel,
} from '../src/ai/extract';
import { segmentFields } from '@pulso/core';
import type { TextProvider } from '../src/ai/provider';
import { buildApp } from '../src/app';
import { createSql, type Sql } from '../src/db';
import { migrate } from '../src/migrate';

// -----------------------------------------------------------------
// Unidade: o fiscal do CÓDIGO sobre a transcrição da IA (puro, rápido)
// -----------------------------------------------------------------

describe('validateExtraction (folha)', () => {
  it('converte valores BR para centavos e mantém os válidos', () => {
    const { items, issues } = validateExtraction('payroll', [
      { label: 'Salários', valueText: '3.500,00' },
      { label: 'Pró-labore', valueText: 'R$ 1.200,00' },
    ]);
    expect(items).toEqual([
      { label: 'Salários', amountCents: 350000 },
      { label: 'Pró-labore', amountCents: 120000 },
    ]);
    expect(issues).toHaveLength(0);
  });

  it('descarta valor ilegível, zero, negativo e fora da faixa — com aviso', () => {
    const { items, issues } = validateExtraction('payroll', [
      { label: 'Salários', valueText: '3.000,00' },
      { label: 'Lixo', valueText: 'abc' },
      { label: 'Zerado', valueText: '0,00' },
      { label: 'Estorno', valueText: '-100,00' },
      { label: 'Absurdo', valueText: '9.999.999,00' }, // > R$ 500 mil
    ]);
    expect(items).toEqual([{ label: 'Salários', amountCents: 300000 }]);
    expect(issues).toHaveLength(4);
  });

  it('ignora item sem rótulo', () => {
    const { items, issues } = validateExtraction('payroll', [{ label: '   ', valueText: '10,00' }]);
    expect(items).toHaveLength(0);
    expect(issues).toHaveLength(1);
  });
});

// -----------------------------------------------------------------
// O código entendendo data e mês escritos "como vier" (BR, ISO, por extenso)
// -----------------------------------------------------------------

describe('textoParaData / textoParaMes', () => {
  it('lê data em formato brasileiro, ISO e com ano de 2 dígitos', () => {
    expect(textoParaData('12/09/2026')).toBe('2026-09-12');
    expect(textoParaData('2026-09-12')).toBe('2026-09-12');
    expect(textoParaData('1.9.26')).toBe('2026-09-01');
    expect(textoParaData('31/02/2026')).toBeNull(); // não existe
    expect(textoParaData('ontem')).toBeNull();
  });

  it('lê mês numérico, ISO e por extenso', () => {
    expect(textoParaMes('08/2026')).toBe('2026-08');
    expect(textoParaMes('2026-8')).toBe('2026-08');
    expect(textoParaMes('agosto/2026')).toBe('2026-08');
    expect(textoParaMes('AGO-26')).toBe('2026-08');
    expect(textoParaMes('período')).toBeNull();
  });
});

// -----------------------------------------------------------------
// O fiscal do código nas formas novas: maquininha (data) e números do mês (campo)
// -----------------------------------------------------------------

const CTX_VAREJO: ExtractionContext = { fields: segmentFields('varejo'), today: '2026-09-11' };

describe('validateExtraction (maquininha: a receber previsto)', () => {
  it('aceita o crédito com data e valor, devolvendo a data em ISO', () => {
    const { items, issues } = validateExtraction(
      'card_acquirer',
      [{ label: 'Crédito à vista', valueText: '1.250,00', dateText: '20/09/2026' }],
      { today: '2026-09-11' },
    );
    expect(items).toEqual([{ label: 'Crédito à vista', amountCents: 125000, dueOn: '2026-09-20' }]);
    expect(issues).toHaveLength(0);
  });

  it('descarta item sem data, com data ilegível e com data fora da faixa', () => {
    const { items, issues } = validateExtraction(
      'card_acquirer',
      [
        { label: 'Sem data', valueText: '100,00' },
        { label: 'Data torta', valueText: '100,00', dateText: 'semana que vem' },
        { label: 'Longe demais', valueText: '100,00', dateText: '01/01/2030' },
        { label: 'Antigo demais', valueText: '100,00', dateText: '01/01/2020' },
      ],
      { today: '2026-09-11' },
    );
    expect(items).toHaveLength(0);
    expect(issues).toHaveLength(4);
  });
});

describe('validateExtraction (relatórios: números do mês)', () => {
  it('só aceita campo que existe no segmento, e converte pela unidade do campo', () => {
    const { items, issues } = validateExtraction(
      'management',
      [
        { label: 'Faturamento', valueText: '85.000,00', field: 'receita_bruta', monthText: '08/2026' },
        { label: 'Vendas no mês', valueText: '320', field: 'atendimentos', monthText: 'agosto/2026' },
        { label: 'Lucro do sócio', valueText: '10.000,00', field: 'inventado_qualquer', monthText: '08/2026' },
      ],
      CTX_VAREJO,
    );
    // dinheiro vira centavos; contagem vira número inteiro (nunca centavos)
    expect(items).toEqual([
      { label: 'Faturamento', amountCents: 8500000, field: 'receita_bruta', unit: 'cents', month: '2026-08' },
      { label: 'Vendas no mês', quantity: 320, field: 'atendimentos', unit: 'count', month: '2026-08' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Lucro do sócio');
  });

  it('descarta mês no futuro e campo repetido no mesmo mês', () => {
    const { items, issues } = validateExtraction(
      'accounting',
      [
        { label: 'Receita', valueText: '10.000,00', field: 'receita_bruta', monthText: '08/2026' },
        { label: 'Receita (de novo)', valueText: '11.000,00', field: 'receita_bruta', monthText: '08/2026' },
        { label: 'Receita do mês que vem', valueText: '12.000,00', field: 'receita_bruta', monthText: '12/2026' },
      ],
      CTX_VAREJO,
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.amountCents).toBe(1000000); // valeu o primeiro
    expect(issues).toHaveLength(2);
  });

  it('sem segmento definido, não transcreve nada e diz por quê', () => {
    const { items, issues } = validateExtraction(
      'management',
      [{ label: 'Faturamento', valueText: '1.000,00', field: 'receita_bruta', monthText: '08/2026' }],
      { fields: [], today: '2026-09-11' },
    );
    expect(items).toHaveLength(0);
    expect(issues[0]).toContain('segmento');
  });
});

describe('extractionModelFromProvider', () => {
  it('transcreve via structured output e o código valida', async () => {
    const fakeProvider: TextProvider = {
      name: 'fake',
      async generate() {
        return {
          text: JSON.stringify({ items: [{ label: 'Salários', valueText: '2.000,00' }] }),
          modelVersion: 'fake-1',
        };
      },
    };
    const model = extractionModelFromProvider(fakeProvider);
    const out = await model.extract('payroll', 'texto do arquivo');
    expect(out.items).toEqual([{ label: 'Salários', valueText: '2.000,00' }]);
    expect(out.modelVersion).toBe('fake-1');
  });
});

// -----------------------------------------------------------------
// Ponta a ponta: upload folha → proposta → confirmação → motor
// -----------------------------------------------------------------

const PORT = 5498;
// Fora do diretório do projeto (o caminho do repo tem acento, e o initdb em UTF8
// não aceita bytes WIN1252 no caminho). O temp do Windows usa nome curto sem acento.
const DATA_DIR = path.join(tmpdir(), 'pulso-pgdata-extract-test');

// modelo de extração DUBLÊ: devolve a transcrição fixa por tipo (não chama IA real)
const fakeExtraction: ExtractionModel = {
  async extract(docType) {
    if (docType === 'card_acquirer') {
      return {
        items: [
          { label: 'Crédito à vista', valueText: '1.500,00', dateText: '20/09/2026' },
          { label: 'Parcela 2/3', valueText: '800,00', dateText: '05/10/2026' },
          { label: 'Já creditado', valueText: '300,00', dateText: '01/01/2019' }, // fora da faixa
        ],
        modelVersion: 'fake-extract-1',
      };
    }
    if (docType === 'management') {
      return {
        items: [
          { label: 'Faturamento bruto', valueText: '85.000,00', field: 'receita_bruta', monthText: '08/2026' },
          { label: 'Nº de vendas', valueText: '320', field: 'atendimentos', monthText: '08/2026' },
          { label: 'Meta do gerente', valueText: '90.000,00', field: 'meta_inventada', monthText: '08/2026' },
        ],
        modelVersion: 'fake-extract-1',
      };
    }
    return {
      items: [
        { label: 'Salários', valueText: '3.500,00' },
        { label: 'Pró-labore', valueText: '2.000,00' },
      ],
      modelVersion: 'fake-extract-1',
    };
  },
};

// uma "folha" qualquer que o código consiga ler como planilha (CSV)
const folhaCsv = Buffer.from('Descricao;Valor\nSalarios;3.500,00\nPro-labore;2.000,00\n', 'utf8').toString('base64');

let pg: EmbeddedPostgres;
let sql: Sql;
let app: ReturnType<typeof buildApp>;
let token: string;

beforeAll(async () => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  pg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'pulso', password: 'pulso', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('pulso_test');
  sql = createSql(`postgres://pulso:pulso@localhost:${PORT}/pulso_test`);
  await migrate(sql);
  app = buildApp(sql, { extractionModel: fakeExtraction });
  await app.ready();
  const signup = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { businessName: 'Clínica Teste', email: 'dono@clinica.com', password: 'senha-boa-123', phone: '11987654321' },
  });
  token = signup.json().token as string;
});

afterAll(async () => {
  await app?.close();
  await sql?.end();
  await pg?.stop();
});

const auth = () => ({ authorization: `Bearer ${token}` });

describe('POST /me/import (folha extraível)', () => {
  let importId: string;

  it('extrai a folha e devolve a PROPOSTA, sem tocar no motor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'folha-julho.csv', contentBase64: folhaCsv, docType: 'payroll' },
    });
    expect(res.statusCode).toBe(201);
    const imp = res.json().import;
    expect(imp.status).toBe('extracted');
    expect(imp.proposal.items).toEqual([
      { label: 'Salários', amountCents: 350000 },
      { label: 'Pró-labore', amountCents: 200000 },
    ]);
    importId = imp.id;

    // nada entrou no motor ainda: sem custo fixo declarado
    const [c] = await sql`SELECT declared_fixed_cost_cents FROM companies WHERE id = (SELECT company_id FROM users WHERE email = 'dono@clinica.com')`;
    expect(c!.declared_fixed_cost_cents).toBeNull();
  });

  it('a lista de arquivos expõe a proposta pendente para o dono confirmar', async () => {
    const res = await app.inject({ method: 'GET', url: '/me/imports', headers: auth() });
    const item = res.json().imports.find((i: { id: string }) => i.id === importId);
    expect(item.status).toBe('extracted');
    expect(item.proposal.items).toHaveLength(2);
  });

  it('só na CONFIRMAÇÃO o valor entra no motor (folha → custo fixo)', async () => {
    // o dono confirma, editando o pró-labore para R$ 2.500
    const res = await app.inject({
      method: 'POST',
      url: `/me/imports/${importId}/confirm`,
      headers: auth(),
      payload: {
        items: [
          { label: 'Salários', amountCents: 350000 },
          { label: 'Pró-labore', amountCents: 250000 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().confirmed.itemsApplied).toBe(2);

    // custo fixo declarado = soma confirmada (feita pelo código)
    const [c] = await sql`SELECT declared_fixed_cost_cents FROM companies WHERE id = (SELECT company_id FROM users WHERE email = 'dono@clinica.com')`;
    expect(Number(c!.declared_fixed_cost_cents)).toBe(600000);

    // os itens ficaram guardados com origem 'payroll' (o "de onde vem esse número")
    const itens = await sql`SELECT label, amount_cents, source FROM fixed_cost_items ORDER BY amount_cents DESC`;
    expect(itens.map((i) => i.source)).toEqual(['payroll', 'payroll']);

    // o import virou 'confirmed'
    const [imp] = await sql`SELECT status FROM imports WHERE id = ${importId}`;
    expect(imp!.status).toBe('confirmed');
  });

  it('reenviar uma nova folha SUBSTITUI a anterior (não acumula)', async () => {
    const nova = Buffer.from('Descricao;Valor\nSalarios;4.000,00\n', 'utf8').toString('base64');
    const up = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'folha-agosto.csv', contentBase64: nova, docType: 'payroll' },
    });
    const novoId = up.json().import.id as string;
    await app.inject({
      method: 'POST',
      url: `/me/imports/${novoId}/confirm`,
      headers: auth(),
      payload: { items: [{ label: 'Salários', amountCents: 400000 }] },
    });
    // só a folha nova vale: 1 item, R$ 4.000 (não somou com a de julho)
    const itens = await sql`SELECT amount_cents FROM fixed_cost_items WHERE source = 'payroll'`;
    expect(itens).toHaveLength(1);
    const [c] = await sql`SELECT declared_fixed_cost_cents FROM companies WHERE id = (SELECT company_id FROM users WHERE email = 'dono@clinica.com')`;
    expect(Number(c!.declared_fixed_cost_cents)).toBe(400000);
  });
});

// -----------------------------------------------------------------
// Maquininha: a agenda de recebíveis vira conta PREVISTA a receber
// -----------------------------------------------------------------

describe('POST /me/import (maquininha)', () => {
  const agendaCsv = Buffer.from(
    'Data prevista;Descricao;Valor liquido\n20/09/2026;Credito a vista;1.500,00\n',
    'utf8',
  ).toString('base64');

  it('lê a agenda, descarta o que está fora da faixa e só entra na confirmação', async () => {
    const up = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'agenda-cielo.csv', contentBase64: agendaCsv, docType: 'card_acquirer' },
    });
    expect(up.statusCode).toBe(201);
    const imp = up.json().import;
    expect(imp.status).toBe('extracted');
    expect(imp.proposal.shape).toBe('receivables');
    // o crédito de 2019 foi descartado pelo código, com aviso
    expect(imp.proposal.items).toEqual([
      { label: 'Crédito à vista', amountCents: 150000, dueOn: '2026-09-20' },
      { label: 'Parcela 2/3', amountCents: 80000, dueOn: '2026-10-05' },
    ]);
    expect(imp.proposal.issues.length).toBe(1);

    // nada entrou no motor ainda
    const antes = await sql`SELECT count(*)::int AS n FROM planned_entries`;
    expect(antes[0]!.n).toBe(0);

    const conf = await app.inject({
      method: 'POST',
      url: `/me/imports/${imp.id}/confirm`,
      headers: auth(),
      payload: {
        items: [
          { label: 'Crédito à vista', amountCents: 150000, dueOn: '2026-09-20' },
          { label: 'Parcela 2/3', amountCents: 80000, dueOn: '2026-10-05' },
        ],
      },
    });
    expect(conf.statusCode).toBe(200);

    const previstas = await sql`
      SELECT amount_cents, due_on::text AS due_on, kind, counterparty, status
      FROM planned_entries ORDER BY due_on`;
    expect(previstas).toHaveLength(2);
    expect(previstas[0]!.kind).toBe('receivable');
    expect(previstas[0]!.counterparty).toBe('Maquininha');
    expect(previstas[0]!.status).toBe('prevista');
    expect(Number(previstas[0]!.amount_cents)).toBe(150000);
  });

  it('confirmar de novo o mesmo arquivo é recusado (não duplica a agenda)', async () => {
    const [imp] = await sql`SELECT id FROM imports WHERE doc_type = 'card_acquirer' ORDER BY imported_at DESC LIMIT 1`;
    const res = await app.inject({
      method: 'POST',
      url: `/me/imports/${imp!.id}/confirm`,
      headers: auth(),
      payload: { items: [{ label: 'Crédito à vista', amountCents: 150000, dueOn: '2026-09-20' }] },
    });
    expect(res.statusCode).toBe(409);
    const previstas = await sql`SELECT count(*)::int AS n FROM planned_entries`;
    expect(previstas[0]!.n).toBe(2);
  });
});

// -----------------------------------------------------------------
// Relatório gerencial: os números do MÊS do segmento, sem digitação
// -----------------------------------------------------------------

describe('POST /me/import (relatório gerencial → números do mês)', () => {
  const gerencialCsv = Buffer.from('Indicador;Valor\nFaturamento;85.000,00\nVendas;320\n', 'utf8').toString('base64');

  it('no segmento genérico (sem campos próprios), o arquivo fica "recebido"', async () => {
    await sql`UPDATE companies SET niche = 'geral'`;
    const res = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'gerencial-sem-segmento.csv', contentBase64: gerencialCsv, docType: 'management' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().import.status).toBe('received');
  });

  it('com segmento, transcreve só os campos do segmento e grava na confirmação', async () => {
    await sql`UPDATE companies SET niche = 'varejo'`;
    const outro = Buffer.from('Indicador;Valor\nFaturamento;85.000,00\nVendas;320\nMeta;90.000,00\n', 'utf8').toString('base64');
    const up = await app.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'gerencial-agosto.csv', contentBase64: outro, docType: 'management' },
    });
    expect(up.statusCode).toBe(201);
    const imp = up.json().import;
    expect(imp.proposal.shape).toBe('ops');
    // "Meta do gerente" não é campo do varejo: descartada com aviso
    expect(imp.proposal.items).toEqual([
      { label: 'Faturamento bruto', amountCents: 8500000, field: 'receita_bruta', unit: 'cents', month: '2026-08' },
      { label: 'Nº de vendas', quantity: 320, field: 'atendimentos', unit: 'count', month: '2026-08' },
    ]);
    expect(imp.proposal.issues.length).toBe(1);

    const conf = await app.inject({
      method: 'POST',
      url: `/me/imports/${imp.id}/confirm`,
      headers: auth(),
      payload: {
        items: [
          { label: 'Faturamento bruto', amountCents: 8500000, field: 'receita_bruta', month: '2026-08' },
          { label: 'Nº de vendas', quantity: 320, field: 'atendimentos', month: '2026-08' },
          { label: 'Campo forjado pelo cliente', amountCents: 999, field: 'nao_existe', month: '2026-08' },
        ],
      },
    });
    expect(conf.statusCode).toBe(200);

    // gravou nos números do mês, pela unidade certa, e ignorou o campo forjado
    const ops = await sql`
      SELECT field, value_num, to_char(ref_month, 'YYYY-MM') AS mes
      FROM monthly_operations ORDER BY field`;
    expect(ops.map((o) => [o.field, Number(o.value_num), o.mes])).toEqual([
      ['atendimentos', 320, '2026-08'],
      ['receita_bruta', 8500000, '2026-08'],
    ]);
  });
});

describe('POST /me/import sem modelo de IA', () => {
  it('cai no "recebido" honesto quando a extração está indisponível', async () => {
    const semIa = buildApp(sql); // sem extractionModel
    await semIa.ready();
    const res = await semIa.inject({
      method: 'POST',
      url: '/me/import',
      headers: auth(),
      payload: { filename: 'folha-sem-ia.csv', contentBase64: Buffer.from('X;Y\n1;2\n').toString('base64'), docType: 'payroll' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().import.status).toBe('received');
    await semIa.close();
  });
});
