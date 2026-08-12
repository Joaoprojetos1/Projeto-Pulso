/**
 * Pulso — leitor de Excel .xlsx (o binário de verdade), SEM dependência nova.
 *
 * Um .xlsx é um ZIP com XMLs dentro. Aqui só o TRANSPORTE: abre o ZIP (com o
 * `zlib` nativo do Node), lê a primeira planilha + a tabela de textos e devolve
 * uma matriz de células (`string[][]`). Quem interpreta colunas é `table.ts`;
 * quem calcula é o core. A IA nunca lê isto (CLAUDE.md).
 *
 * Leitura pelo DIRETÓRIO CENTRAL do ZIP (fim do arquivo) — robusto mesmo quando o
 * cabeçalho local não traz os tamanhos (data descriptor). Suporta os dois métodos
 * usados no .xlsx: 0 (stored) e 8 (deflate).
 */

import { inflateRawSync } from 'node:zlib';

import { ParseError } from './types';

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

/** Lê o diretório central do ZIP → lista de entradas (nome + onde achar os bytes). */
function readCentralDirectory(buf: Buffer): ZipEntry[] {
  // EOCD (End Of Central Directory): assinatura 0x06054b50, perto do fim.
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new ParseError('Excel (.xlsx) inválido: fim do arquivo ZIP não encontrado.');

  const total = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16); // offset do diretório central
  const entries: ZipEntry[] = [];
  const CEN = 0x02014b50;
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(ptr) !== CEN) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    // normaliza a barra: alguns geradores (ex.: .NET no Windows) gravam "xl\..."
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen).replace(/\\/g, '/');
    entries.push({ name, method, compressedSize, localHeaderOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Extrai (descomprime) o conteúdo de uma entrada do ZIP como texto UTF-8. */
function readEntry(buf: Buffer, entry: ZipEntry): string {
  // cabeçalho local: os tamanhos de nome/extra podem diferir do central
  const off = entry.localHeaderOffset;
  if (buf.readUInt32LE(off) !== 0x04034b50) throw new ParseError('Excel (.xlsx) inválido: cabeçalho ZIP.');
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const dataStart = off + 30 + nameLen + extraLen;
  const comp = buf.subarray(dataStart, dataStart + entry.compressedSize);
  const bytes = entry.method === 0 ? comp : inflateRawSync(comp);
  return bytes.toString('utf8');
}

/** Concatena o texto de cada `<si>` da sharedStrings (junta os runs `<t>`). */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let texto = '';
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(m[1]!))) texto += decodeXml(t[1]!);
    out.push(texto);
  }
  return out;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/** "A"→0, "B"→1, "Z"→25, "AA"→26… (letras da referência da célula). */
function colToIndex(ref: string): number {
  const letras = ref.replace(/[0-9]/g, '');
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Converte o XML da planilha em linhas de células (usando a tabela de textos). */
function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/gi;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]!))) {
      const attrs = cm[1] ?? cm[3] ?? '';
      const inner = cm[2] ?? '';
      const refM = /r="([A-Z]+)\d+"/.exec(attrs);
      const idx = refM ? colToIndex(refM[1]!) : cells.length;
      const typeM = /t="([^"]+)"/.exec(attrs);
      const type = typeM ? typeM[1] : null;
      let value = '';
      if (type === 'inlineStr') {
        const tM = /<t\b[^>]*>([\s\S]*?)<\/t>/i.exec(inner);
        value = tM ? decodeXml(tM[1]!) : '';
      } else {
        const vM = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(inner);
        const raw = vM ? vM[1]! : '';
        if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'str') value = decodeXml(raw); // resultado de fórmula (texto)
        // número "de máquina" (1200.5): o .xlsx nunca usa separador de milhar, então
        // trocar o ponto decimal por vírgula deixa no padrão BR que o table.ts lê.
        else value = raw.replace('.', ',');
      }
      while (cells.length < idx) cells.push(''); // preenche colunas puladas
      cells[idx] = value.trim();
    }
    rows.push(cells);
  }
  return rows;
}

/** Lê a PRIMEIRA planilha de um .xlsx e devolve as linhas de células. */
export function readXlsxRows(buf: Buffer): string[][] {
  const entries = readCentralDirectory(buf);
  const sheetEntries = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const first = sheetEntries[0];
  if (!first) throw new ParseError('Excel (.xlsx) sem planilha legível.');

  const sharedEntry = entries.find((e) => /^xl\/sharedStrings\.xml$/i.test(e.name));
  const shared = sharedEntry ? parseSharedStrings(readEntry(buf, sharedEntry)) : [];
  const rows = parseSheet(readEntry(buf, first), shared);
  if (rows.length === 0) throw new ParseError('Excel (.xlsx) sem linhas legíveis.');
  return rows;
}
