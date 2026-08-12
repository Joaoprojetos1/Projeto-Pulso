/**
 * Pulso — leitor de CSV, à prova de sujeira brasileira.
 *
 * Só o TRANSPORTE: transforma o arquivo numa matriz de células de texto
 * (`string[][]`). Quem interpreta as colunas é `table.ts`; quem calcula é o core.
 * O app é burro, a IA nunca lê isto (CLAUDE.md).
 *
 * Cuidados do mundo real BR:
 *  - separador costuma ser `;` (a vírgula já é o decimal de "1.234,56");
 *    também aceita `,` e tabulação, escolhendo pelo que mais aparece.
 *  - aspas com separador/quebra-de-linha dentro, e aspas escapadas ("").
 *  - BOM de UTF-8 e o mojibake `Ã` (latin-1 lido como UTF-8).
 */

import { ParseError } from './types';

/** Decodifica o buffer para texto: tira BOM; corrige latin-1 disfarçado de UTF-8. */
export function decodeCsvBuffer(buf: Buffer): string {
  let text = buf.toString('utf8');
  // heurística de mojibake: latin-1 lido como UTF-8 gera "Ã" seguido de byte alto
  if (/Ã[\x80-\xbf©¡ª§º]/.test(text)) text = buf.toString('latin1');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM
  return text;
}

/** Escolhe o separador olhando as primeiras linhas com conteúdo. */
export function detectDelimiter(text: string): string {
  const linhas = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 5);
  const candidatos = [';', ',', '\t'];
  let melhor = ';';
  let maior = -1;
  for (const d of candidatos) {
    // conta ocorrências FORA de aspas, somando as linhas de amostra
    let total = 0;
    for (const l of linhas) total += contarFora(l, d);
    if (total > maior) {
      maior = total;
      melhor = d;
    }
  }
  return maior > 0 ? melhor : ';';
}

function contarFora(linha: string, delim: string): number {
  let n = 0;
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') aspas = !aspas;
    else if (!aspas && c === delim) n++;
  }
  return n;
}

/** Lê o CSV do buffer em linhas de células (detecta o separador sozinho). */
export function readCsvRows(buf: Buffer): string[][] {
  const text = decodeCsvBuffer(buf);
  return parseCsv(text, detectDelimiter(text));
}

/** Parser CSV (RFC-4180 tolerante): aspas, aspas escapadas, quebra dentro de célula. */
export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  let i = 0;

  const fecharCampo = () => {
    linha.push(campo);
    campo = '';
  };
  const fecharLinha = () => {
    fecharCampo();
    // ignora linha totalmente vazia (ex.: última quebra do arquivo)
    if (!(linha.length === 1 && linha[0] === '')) rows.push(linha);
    linha = [];
  };

  while (i < text.length) {
    const c = text[i]!;
    if (aspas) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        aspas = false;
        i++;
        continue;
      }
      campo += c;
      i++;
      continue;
    }
    if (c === '"') {
      aspas = true;
      i++;
      continue;
    }
    if (c === delim) {
      fecharCampo();
      i++;
      continue;
    }
    if (c === '\n') {
      fecharLinha();
      i++;
      continue;
    }
    if (c === '\r') {
      // \r\n ou \r sozinho
      fecharLinha();
      if (text[i + 1] === '\n') i++;
      i++;
      continue;
    }
    campo += c;
    i++;
  }
  // resto do último campo/linha (arquivo sem quebra final)
  if (campo !== '' || linha.length > 0) fecharLinha();

  if (rows.length === 0) throw new ParseError('CSV vazio ou ilegível');
  return rows.map((r) => r.map((c) => c.trim()));
}
