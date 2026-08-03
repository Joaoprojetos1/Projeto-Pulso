import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parseInterStatement } from '../src/parsers/inter-pdf';
import { parseSantanderStatement } from '../src/parsers/santander-pdf';
import { parseOfx } from '../src/parsers/ofx';
import { parseMicrovixFaturamento } from '../src/parsers/microvix-faturamento';
import { parseMicrovixGiro } from '../src/parsers/microvix-giro';
import { parseMicrovixInventario } from '../src/parsers/microvix-inventario';
import { parseMicrovixMovimento } from '../src/parsers/microvix-movimento';
import { ParseError } from '../src/parsers/types';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/parsers');
const read = (f: string) => readFileSync(join(FIX, f), 'utf8');

const interTxt = read('inter-extrato.txt');
const santanderTxt = read('santander-extrato.txt');
const ofxTxt = read('extrato.ofx');
const fatXls = read('microvix-faturamento.xls');
const giroXls = read('microvix-giro.xls');
const invXls = read('microvix-inventario.xls');
const movXls = read('microvix-movimento.xls');

describe('extrato Inter (PDF)', () => {
  it('caso feliz: lança, calcula saldos e reconcilia pelo saldo do dia', () => {
    const r = parseInterStatement(interTxt);
    expect(r.meta.source).toBe('inter_pdf');
    expect(r.meta.account).toBe('12345678-9');
    expect(r.meta.period).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(r.entries).toHaveLength(4);
    expect(r.balances).toHaveLength(2);
    const receb = r.entries.filter((e) => e.kind === 'receivable').reduce((s, e) => s + e.amountCents, 0);
    const pag = r.entries.filter((e) => e.kind === 'payable').reduce((s, e) => s + e.amountCents, 0);
    expect(receb).toBe(50000); // 300 + 200
    expect(pag).toBe(55000); // 500 + 50
    // reconciliação do dia 03: saldo variou +150; entradas do dia = +200 −50
    const dia3 = r.entries
      .filter((e) => e.settledOn === '2026-03-03')
      .reduce((s, e) => s + (e.kind === 'receivable' ? e.amountCents : -e.amountCents), 0);
    expect(dia3).toBe(15000);
  });

  it('arquivo sujo: linha estranha e linha sem valor viram aviso, não quebram', () => {
    const sujo = interTxt.replace(
      '3 de Março de 2026',
      'LINHA TOTALMENTE ESTRANHA AQUI\nPix recebido: "Cp :9-SEM VALOR"\n3 de Março de 2026',
    );
    const r = parseInterStatement(sujo);
    expect(r.entries.length).toBeGreaterThanOrEqual(4);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('formato errado: OFX no parser do Inter falha com ParseError', () => {
    expect(() => parseInterStatement(ofxTxt)).toThrow(ParseError);
  });
});

describe('extrato Santander (PDF)', () => {
  it('caso feliz: usa diferença de saldos (exato) no layout com saldo por linha', () => {
    const r = parseSantanderStatement(santanderTxt);
    expect(r.meta.source).toBe('santander_pdf');
    expect(r.meta.account).toBe('987654321');
    expect(r.meta.period).toEqual({ from: '2026-06-01', to: '2026-06-30' });
    expect(r.entries).toHaveLength(3);
    const [pix, cartao, tarifa] = r.entries;
    expect(pix!.kind).toBe('receivable');
    expect(pix!.amountCents).toBe(10000);
    expect(cartao!.category).toBe('repasse_adquirente');
    expect(cartao!.amountCents).toBe(20000); // 1300 − 1100
    expect(tarifa!.category).toBe('tarifa_bancaria');
    expect(tarifa!.kind).toBe('payable');
    expect(tarifa!.amountCents).toBe(500); // 1295 − 1300
    expect(tarifa!.costType).toBe('fixed');
  });

  it('formato errado: HTML do Microvix no parser do Santander falha', () => {
    expect(() => parseSantanderStatement(fatXls)).toThrow(ParseError);
  });
});

describe('extrato OFX', () => {
  it('caso feliz: 3 transações + saldo, valor decimal com ponto', () => {
    const r = parseOfx(ofxTxt);
    expect(r.meta.source).toBe('ofx');
    expect(r.meta.account).toBe('12345-6');
    expect(r.entries).toHaveLength(3);
    expect(r.balances).toEqual([{ observedOn: '2026-06-03', balanceCents: 114740 }]);
    expect(r.entries[0]).toMatchObject({ kind: 'receivable', amountCents: 30000, category: 'venda_pix' });
    expect(r.entries[1]).toMatchObject({ kind: 'payable', amountCents: 15050, category: 'fornecedor' });
    expect(r.entries[2]).toMatchObject({ kind: 'payable', amountCents: 210, category: 'tarifa_bancaria' });
  });

  it('formato errado: texto do Inter no parser OFX falha', () => {
    expect(() => parseOfx(interTxt)).toThrow(ParseError);
  });
});

describe('Microvix — Faturamento Diário', () => {
  it('caso feliz: receita por dia, à vista vs a prazo, confere com Totais', () => {
    const r = parseMicrovixFaturamento(fatXls);
    expect(r.entries).toHaveLength(2);
    expect(r.totalDeclaredCents).toBe(150000);
    expect(r.warnings).toHaveLength(0);
    expect(r.entries[0]).toMatchObject({ issuedOn: '2026-01-02', amountCents: 100000, settledOn: null }); // tem cartão
    expect(r.entries[1]).toMatchObject({ issuedOn: '2026-01-03', amountCents: 50000, settledOn: '2026-01-03' }); // 100% dinheiro
  });

  it('arquivo sujo: linha espúria e célula vazia ("-") são toleradas', () => {
    const sujo = fatXls.replace(
      '<tr><td>03/01/26</td>',
      '<tr><td>Subtotal parcial</td><td>500,00</td></tr>\n<tr><td>03/01/26</td>',
    );
    const r = parseMicrovixFaturamento(sujo);
    expect(r.entries).toHaveLength(2); // a linha espúria não vira lançamento
  });

  it('valor corrompido: falha com mensagem clara (linha e coluna)', () => {
    const corrompido = fatXls.replace('<td>1.000,00</td>', '<td>1.000,0X</td>');
    expect(() => parseMicrovixFaturamento(corrompido)).toThrow(/Valor dos Documentos/);
  });

  it('formato errado: texto do Inter no parser de Faturamento falha', () => {
    expect(() => parseMicrovixFaturamento(interTxt)).toThrow(ParseError);
  });
});

describe('Microvix — Giro, Inventário e Movimento', () => {
  it('giro: CMV do período e estoque a custo', () => {
    const r = parseMicrovixGiro(giroXls);
    expect(r.produtos).toBe(2);
    expect(r.periodo).toEqual({ from: '2026-01-01', to: '2026-07-31' });
    expect(r.cmvPeriodCents).toBe(7000); // 2×10 + 1×50
    expect(r.estoqueFinalCustoCents).toBe(8000); // 3×10 + 1×50
  });

  it('inventário: estoque a custo, confere com Total Geral', () => {
    const r = parseMicrovixInventario(invXls);
    expect(r.linhas).toBe(2);
    expect(r.dataBase).toBe('2026-07-31');
    expect(r.estoqueCustoCents).toBe(150000);
    expect(r.estoqueVendaCents).toBe(280000);
    expect(r.warnings).toHaveLength(0);
  });

  it('movimento: nº de vendas e faturamento por mês', () => {
    const r = parseMicrovixMovimento(movXls);
    expect(r.totalDocs).toBe(3);
    expect(r.months).toHaveLength(2);
    const jan = r.months.find((m) => m.month === '2026-01')!;
    expect(jan.atendimentos).toBe(2);
    expect(jan.revenueCents).toBe(35000); // 100 + 250
    expect(jan.trocaCents).toBe(3000); // 30,00
  });

  it('formato errado: OFX no parser de Inventário falha', () => {
    expect(() => parseMicrovixInventario(ofxTxt)).toThrow(ParseError);
  });
});
