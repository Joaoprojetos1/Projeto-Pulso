/**
 * Pulso — conversões do português-Brasil, à prova de sujeira.
 *
 * Dinheiro: SEMPRE por manipulação de string para centavos inteiros. Nunca
 * `parseFloat` (0.1 + 0.2 já erra). Datas: sem ambiguidade de fuso — trabalhamos
 * só com a data de negócio (YYYY-MM-DD), sem hora, então não há conversão de UTC
 * que possa "pular" um dia.
 */

import { ParseError } from './types';

const NBSP = / /g;

/**
 * "1.234,56", "-R$ 1.234,56", "R$ 200,00", "12,5", "1234", "(15,95)" → centavos.
 * Aceita sinal por prefixo `-`, sufixo `-` (padrão de alguns bancos) ou parênteses.
 * O separador de milhar (`.`) é removido; a vírgula é o decimal. Til/rótulo `R$`,
 * espaços e NBSP são tolerados. Qualquer outro lixo levanta ParseError com posição.
 */
export function brMoneyToCents(input: string, at: { line?: number; column?: string } = {}): number {
  if (input == null) throw new ParseError('valor ausente', at);
  let s = String(input).replace(NBSP, ' ').trim();
  s = s.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (s === '' || s === '-') throw new ParseError(`valor vazio: "${input}"`, at);

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }

  // A esta altura só pode restar dígitos, ponto (milhar) e vírgula (decimal).
  if (!/^[0-9.,]+$/.test(s)) {
    throw new ParseError(`valor com caractere inesperado: "${input}"`, at);
  }

  const comma = s.lastIndexOf(',');
  let intPart: string;
  let decPart: string;
  if (comma === -1) {
    intPart = s.replace(/\./g, '');
    decPart = '00';
  } else {
    intPart = s.slice(0, comma).replace(/\./g, '');
    decPart = s.slice(comma + 1);
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d+$/.test(decPart)) {
    throw new ParseError(`valor mal formado: "${input}"`, at);
  }
  // normaliza os centavos para exatamente 2 casas (trunca acima de 2, sem float)
  decPart = (decPart + '00').slice(0, 2);

  const cents = Number(intPart) * 100 + Number(decPart);
  if (!Number.isSafeInteger(cents)) throw new ParseError(`valor grande demais: "${input}"`, at);
  return negative ? -cents : cents;
}

/**
 * Token de dinheiro BR dentro de um texto grudado (ex.: extrato sem colunas).
 * Tolera as duas convenções observadas: sinal antes do "R$" (Inter: `-R$ 2.000,00`)
 * e sinal colado no número (Santander: `-13.954,81`). O `R$` e o espaço são
 * opcionais; o que importa é a parte numérica com vírgula decimal.
 */
const MONEY_TOKEN = /-?\s*(?:R\$)?\s*\d{1,3}(?:\.\d{3})*,\d{2}/g;

/**
 * Encontra TODOS os tokens de dinheiro num texto (na ordem em que aparecem).
 * Usado quando o PDF cola "valor" e "saldo" na mesma linha, sem separador.
 */
export function findMoneyTokens(text: string): string[] {
  return text.match(MONEY_TOKEN) ?? [];
}

/** Remove os N últimos tokens de dinheiro do fim do texto; devolve o que sobra. */
export function stripTrailingMoney(text: string, n: number): string {
  let out = text;
  for (let i = 0; i < n; i++) {
    const m = out.match(new RegExp(`(${MONEY_TOKEN.source})\\s*$`));
    if (!m) break;
    out = out.slice(0, out.length - m[0].length);
  }
  return out.trim();
}

/**
 * Número decimal BR (quantidade, não dinheiro): "3,00", "-1,00", "1.234,5" → number.
 * Para CONTAGENS e quantidades onde o resultado não é centavos. Sem float traiçoeiro
 * no dinheiro: aqui é grandeza física (unidades), a precisão de ponto flutuante basta.
 */
export function brDecimal(input: string, at: { line?: number; column?: string } = {}): number {
  const s = String(input).replace(NBSP, ' ').trim();
  if (s === '' || s === '-') return 0;
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new ParseError(`número inválido: "${input}"`, at);
  return n;
}

/** "DD/MM/YYYY" ou "DD/MM/YY" → "YYYY-MM-DD". YY assume século 2000. */
export function brDateToIso(input: string, at: { line?: number; column?: string } = {}): string {
  const m = String(input)
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) throw new ParseError(`data fora do formato DD/MM/AAAA: "${input}"`, at);
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[3]!.length === 2) y += 2000;
  assertValidDate(d, mo, y, input, at);
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const MESES_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/** "2 de Janeiro de 2026" → "2026-01-02" (cabeçalho de dia do extrato Inter). */
export function ptLongDateToIso(input: string, at: { line?: number; column?: string } = {}): string {
  const m = String(input)
    .trim()
    .match(/^(\d{1,2})\s+de\s+([A-Za-zçÇãéêáí]+)\s+de\s+(\d{4})$/i);
  if (!m) throw new ParseError(`data por extenso não reconhecida: "${input}"`, at);
  const mes = MESES_PT[m[2]!.toLowerCase()];
  if (!mes) throw new ParseError(`mês desconhecido: "${m[2]}"`, at);
  const d = Number(m[1]);
  const y = Number(m[3]);
  assertValidDate(d, mes, y, input, at);
  return `${y}-${pad(mes)}-${pad(d)}`;
}

function assertValidDate(
  d: number,
  mo: number,
  y: number,
  input: string,
  at: { line?: number; column?: string },
) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) {
    throw new ParseError(`data inválida: "${input}"`, at);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
