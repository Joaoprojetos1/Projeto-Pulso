/**
 * Pulso — porta de entrada do leitor de planilha genérico.
 *
 * Junta o TRANSPORTE (CSV ou HTML do Microvix) com o CÉREBRO (`table.ts`) e
 * devolve os registros normalizados. Detecta o formato pelo CONTEÚDO (a extensão
 * mente). Excel binário (.xlsx) ainda não é lido aqui — mensagem honesta, nunca
 * chuta. Quem decide o SIGNIFICADO (custo fixo? receita?) é o leitor por tipo.
 */

import { readCsvRows } from './csv';
import { decodeMicrovixBuffer, readHtmlRows } from './microvix';
import { detectColumns, extractRecords, type TableExtract, type TableShape } from './table';
import { ParseError } from './types';

export type SpreadsheetFormat = 'csv' | 'html';

export interface SpreadsheetTable {
  format: SpreadsheetFormat;
  rows: string[][];
  shape: TableShape;
  extract: TableExtract;
}

/** Só as linhas de células, sem exigir colunas reconhecidas (uso avançado/teste). */
export function readSpreadsheetRows(buf: Buffer): { format: SpreadsheetFormat; rows: string[][] } {
  if (buf[0] === 0x25 && buf[1] === 0x50) {
    // "%P" de %PDF
    throw new ParseError('Isto é um PDF, não uma planilha. Envie a planilha em CSV.');
  }
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    // "PK": ZIP — Excel .xlsx moderno
    throw new ParseError(
      'Excel (.xlsx) ainda não é lido aqui. Por ora, salve como CSV (no Excel: ' +
        'Arquivo → Salvar como → CSV) e envie de novo. Em breve leremos o .xlsx direto.',
    );
  }
  const texto = decodeMicrovixBuffer(buf);
  if (/<table[\s>]/i.test(texto) || /^\s*<(?:!doctype\s+html|html)[\s>]/i.test(texto)) {
    return { format: 'html', rows: readHtmlRows(texto) };
  }
  return { format: 'csv', rows: readCsvRows(buf) };
}

/** Lê a planilha inteira: transporte → colunas → registros normalizados. */
export function readSpreadsheet(buf: Buffer): SpreadsheetTable {
  const { format, rows } = readSpreadsheetRows(buf);
  const shape = detectColumns(rows);
  if (!shape) {
    throw new ParseError(
      'Não reconheci as colunas da planilha (esperava ao menos uma coluna de valor, ' +
        'tipo "Valor" ou "Total"). Confira se o arquivo tem cabeçalho.',
    );
  }
  const extract = extractRecords(rows, shape);
  return { format, rows, shape, extract };
}

export type { TableExtract, TableShape };
