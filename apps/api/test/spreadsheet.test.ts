import { describe, expect, it } from 'vitest';

import { readCsvRows, detectDelimiter, parseCsv } from '../src/parsers/csv';
import { findColumn } from '../src/parsers/table';
import { readSpreadsheet, readSpreadsheetRows } from '../src/parsers/spreadsheet';

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('CSV — transporte', () => {
  it('detecta separador ; (padrão BR, vírgula é decimal)', () => {
    expect(detectDelimiter('Data;Valor\n05/08/2026;1.200,00')).toBe(';');
  });

  it('respeita aspas com separador e aspas escapadas', () => {
    const rows = parseCsv('a,"b, c","d""e"\n1,2,3', ',');
    expect(rows[0]).toEqual(['a', 'b, c', 'd"e']);
    expect(rows[1]).toEqual(['1', '2', '3']);
  });

  it('lê CSV BR com ; e devolve células aparadas', () => {
    const rows = readCsvRows(buf('Data;Histórico;Valor\r\n05/08/2026;Aluguel;1.200,00\r\n'));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['05/08/2026', 'Aluguel', '1.200,00']);
  });
});

describe('table — acha colunas e extrai', () => {
  it('mapeia data/descrição/valor e soma em centavos', () => {
    const csv = 'Data;Histórico;Valor\n05/08/2026;Aluguel;1.200,00\n10/08/2026;Folha;18.500,50\n';
    const t = readSpreadsheet(buf(csv));
    expect(t.format).toBe('csv');
    expect(t.shape.columns).toEqual({ value: 2, date: 0, description: 1 });
    expect(t.extract.records).toHaveLength(2);
    expect(t.extract.records[0]).toMatchObject({
      date: '2026-08-05',
      description: 'Aluguel',
      valueCents: 120000,
      line: 2,
    });
    expect(t.extract.totalCents).toBe(120000 + 1850050);
  });

  it('acha o cabeçalho mesmo com título e linha em branco acima', () => {
    const csv = 'Relatório de Despesas - Agosto\n\nData;Categoria;Valor\n01/08/2026;Aluguel;1.200,00\n';
    const t = readSpreadsheet(buf(csv));
    // a linha em branco é descartada no parse, então o cabeçalho fica no índice 1
    expect(t.shape.headerRow).toBe(1);
    expect(t.extract.records).toHaveLength(1);
    expect(t.extract.records[0]!.valueCents).toBe(120000);
  });

  it('casa cabeçalho por "contém" (Valor (R$)) e sem coluna de data', () => {
    const csv = 'Descrição;Valor (R$)\nSalários;18.000,00\nEncargos;5.400,00\n';
    const t = readSpreadsheet(buf(csv));
    expect(t.shape.columns.value).toBe(1);
    expect(t.shape.columns.date).toBeUndefined();
    expect(t.extract.totalCents).toBe(1800000 + 540000);
    expect(t.extract.records[0]!.date).toBeUndefined();
  });

  it('valor ilegível vira aviso não-fatal (linha pulada), não derruba o arquivo', () => {
    const csv = 'Data;Descricao;Valor\n05/08/2026;Aluguel;1.200,00\n06/08/2026;Rasura;abc\n07/08/2026;Luz;350,00\n';
    const t = readSpreadsheet(buf(csv));
    expect(t.extract.records).toHaveLength(2);
    expect(t.extract.warnings).toEqual([{ line: 3, message: 'valor ilegível, linha ignorada' }]);
    expect(t.extract.totalCents).toBe(120000 + 35000);
  });

  it('vírgula como separador com valor monetário entre aspas', () => {
    const csv = 'Data,Descricao,Valor\n05/08/2026,"Salário, líquido","2.000,00"\n';
    const t = readSpreadsheet(buf(csv));
    expect(t.extract.records[0]).toMatchObject({ description: 'Salário, líquido', valueCents: 200000 });
  });

  it('findColumn não confunde papéis', () => {
    const header = ['Cliente', 'Vencimento', 'Valor a Pagar'];
    expect(findColumn(header, 'description')).toBe(0);
    expect(findColumn(header, 'date')).toBe(1);
    expect(findColumn(header, 'value')).toBe(2);
  });
});

describe('spreadsheet — formatos e rejeições honestas', () => {
  it('lê tabela HTML (padrão de export de ERP)', () => {
    const html = '<table><tr><td>Data</td><td>Valor</td></tr><tr><td>01/08/2026</td><td>100,00</td></tr></table>';
    const t = readSpreadsheet(buf(html));
    expect(t.format).toBe('html');
    expect(t.extract.records[0]).toMatchObject({ date: '2026-08-01', valueCents: 10000 });
  });

  it('rejeita PDF com mensagem clara', () => {
    expect(() => readSpreadsheetRows(Buffer.from('%PDF-1.7\n', 'latin1'))).toThrow(/PDF/);
  });

  it('rejeita .xlsx (ZIP) com orientação de salvar como CSV', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(() => readSpreadsheetRows(zip)).toThrow(/xlsx|CSV/i);
  });

  it('sem coluna de valor: não chuta, avisa', () => {
    expect(() => readSpreadsheet(buf('Nome;Cidade\nAna;SP\n'))).toThrow(/colunas/i);
  });
});
