/**
 * Adaptador: PDF (bytes) → texto. Isola a única dependência externa dos parsers.
 *
 * Importamos `pdf-parse/lib/pdf-parse.js` DIRETO (não o index), porque o index da
 * v1 tem um bloco de "modo debug" que tenta ler um PDF de teste do disco quando
 * `module.parent` é indefinido — o que acontece sob ESM e quebraria o import.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// pdf-parse não traz tipos; a forma usada aqui é estável (buffer → { text }).
type PdfParse = (data: Buffer) => Promise<{ text: string; numpages: number }>;

export async function extractPdfText(buf: Buffer): Promise<string> {
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as PdfParse;
  const data = await pdfParse(buf);
  return data.text;
}
