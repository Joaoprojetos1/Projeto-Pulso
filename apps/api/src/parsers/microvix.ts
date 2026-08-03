/**
 * Pulso — leitor das tabelas do Linx Microvix.
 *
 * O Microvix exporta relatórios como HTML salvo com extensão `.xls` (o cabeçalho
 * do arquivo é `<html xmlns:o=...>`, não um XLS binário). Aqui só o transporte:
 * transforma o HTML numa matriz de células de texto, tolerante a tags internas,
 * entidades e células vazias (que o Microvix imprime como "-"). Cada relatório
 * específico (faturamento, giro, inventário, movimento) interpreta as colunas.
 *
 * Encoding: o arquivo declara UTF-8; ainda assim, se vier o padrão de mojibake
 * `Ã` (latin-1 lido como UTF-8), `decodeMicrovixBuffer` corrige. Aqui recebemos
 * já a string decodificada.
 */

import { ParseError } from './types';

/** Remove acento e caixa para casar nomes de coluna de forma robusta. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Todas as linhas (<tr>) do HTML como vetores de células de texto. */
export function readHtmlRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html))) {
    const cells: string[] = [];
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellRe.exec(tr[1]!))) {
      const text = decodeEntities(cell[1]!.replace(/<[^>]+>/g, ' '))
        .replace(/ /g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) throw new ParseError('nenhuma tabela encontrada — arquivo Microvix (HTML) esperado');
  return rows;
}

/** Corrige o buffer do Microvix para string (UTF-8, com fallback de latin-1). */
export function decodeMicrovixBuffer(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  // Heurística: se aparecer o padrão típico de latin-1 lido como UTF-8, redecode.
  if (/Ã[\x80-\xbf©¡ª§]/.test(utf8) && !/charset=utf-8/i.test(utf8)) {
    return buf.toString('latin1');
  }
  return utf8;
}

/** Índice de cada coluna a partir da linha de cabeçalho (por nome normalizado). */
export function columnIndex(header: string[], names: string[]): number {
  const wanted = names.map(norm);
  for (let i = 0; i < header.length; i++) {
    if (wanted.includes(norm(header[i]!))) return i;
  }
  return -1;
}

/** Célula de dinheiro do Microvix: "-" e vazio significam zero. */
export function microvixCellIsEmpty(cell: string | undefined): boolean {
  return cell == null || cell === '' || cell === '-';
}
