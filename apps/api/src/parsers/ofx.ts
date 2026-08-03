/**
 * Parser de extrato OFX (Open Financial Exchange).
 *
 * É a porta PRINCIPAL do CLAUDE.md: formato padrão, gratuito, que Inter e
 * Santander (e a maioria dos bancos) exportam. Ao contrário do PDF, o OFX é
 * estruturado — sem ambiguidade de documento×valor, sem layout que quebra. Um
 * mesmo parser serve todos os bancos; o banco de origem vem no próprio arquivo.
 *
 * OFX 1.x é SGML (tags muitas vezes SEM fechamento): `<TRNAMT>-2000.00` seguido
 * de nova linha. Lemos o valor entre a tag e o próximo `<`. OFX 2.x é XML puro
 * (tags fechadas) — o mesmo leitor cobre os dois. Valor em OFX é decimal com
 * ponto (`-2000.00`); toleramos também bancos BR que emitem vírgula.
 */

import { categorize } from './categorize';
import {
  ParseError,
  type BankStatementResult,
  type CashBalance,
  type Entry,
  type EntryKind,
  type ParseWarning,
} from './types';

/** Valor OFX → centavos. Padrão é ponto decimal; tolera vírgula (bancos BR). */
export function ofxAmountToCents(input: string, at: { line?: number } = {}): number {
  let s = input.trim().replace(/\s/g, '');
  if (s === '') throw new ParseError('valor OFX vazio', at);
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  // decide o separador decimal: o ÚLTIMO '.' ou ',' que aparece
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const decSep = lastDot > lastComma ? '.' : lastComma > -1 ? ',' : '';
  let intPart: string;
  let decPart: string;
  if (decSep === '') {
    intPart = s.replace(/[.,]/g, '');
    decPart = '00';
  } else {
    const idx = s.lastIndexOf(decSep);
    intPart = s.slice(0, idx).replace(/[.,]/g, '');
    decPart = s.slice(idx + 1);
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d+$/.test(decPart)) throw new ParseError(`valor OFX inválido: "${input}"`, at);
  const cents = Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));
  return negative ? -cents : cents;
}

/** Data OFX (YYYYMMDD, com hora/fuso opcionais) → 'YYYY-MM-DD'. */
export function ofxDateToIso(input: string, at: { line?: number } = {}): string {
  const m = input.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) throw new ParseError(`data OFX fora do formato AAAAMMDD: "${input}"`, at);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function tag(block: string, name: string): string | undefined {
  // valor entre <NAME> e o próximo '<' (SGML) ou </NAME> (XML) — o primeiro '<' já serve
  const m = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i'));
  const v = m?.[1]?.trim();
  return v ? v : undefined;
}

export function parseOfx(text: string): BankStatementResult {
  const entries: Entry[] = [];
  const balances: CashBalance[] = [];
  const warnings: ParseWarning[] = [];

  const account = tag(text, 'ACCTID');
  const bankId = tag(text, 'BANKID') ?? tag(text, 'ORG');

  const txBlocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  if (txBlocks.length === 0) throw new ParseError('nenhuma transação <STMTTRN> — arquivo OFX esperado');

  txBlocks.forEach((block, i) => {
    const amt = tag(block, 'TRNAMT');
    const dt = tag(block, 'DTPOSTED');
    if (!amt || !dt) {
      warnings.push({ line: i + 1, message: 'transação OFX sem valor ou data — ignorada' });
      return;
    }
    const signed = ofxAmountToCents(amt, { line: i + 1 });
    const when = ofxDateToIso(dt, { line: i + 1 });
    const memo = tag(block, 'NAME') ?? tag(block, 'MEMO') ?? tag(block, 'TRNTYPE') ?? '';
    const cat = categorize('generic', memo, signed);
    const kind: EntryKind = cat.kindOverride ?? (signed >= 0 ? 'receivable' : 'payable');
    entries.push({
      id: `ofx:${tag(block, 'FITID') ?? i}`,
      kind,
      amountCents: Math.abs(signed),
      issuedOn: when,
      dueOn: when,
      settledOn: when,
      counterparty: cleanMemo(tag(block, 'NAME')),
      category: cat.category,
      ...(cat.costType ? { costType: cat.costType } : {}),
    });
  });

  const balBlock = text.match(/<LEDGERBAL>[\s\S]*?<\/LEDGERBAL>/i)?.[0] ?? text;
  const balAmt = tag(balBlock, 'BALAMT');
  const balDt = tag(balBlock, 'DTASOF');
  if (balAmt && balDt) {
    balances.push({ observedOn: ofxDateToIso(balDt), balanceCents: ofxAmountToCents(balAmt) });
  }

  return {
    entries,
    balances,
    warnings,
    meta: { source: 'ofx', account: account ?? bankId, rowsParsed: entries.length },
  };
}

function cleanMemo(name: string | undefined): string | undefined {
  const n = name?.replace(/\s+/g, ' ').trim();
  return n ? n : undefined;
}
