/**
 * Extrato bancário em PLANILHA (CSV ou .xlsx) → schema canônico.
 *
 * Muitos bancos (e o próprio dono, exportando do internet banking) entregam o
 * extrato como planilha, não como OFX/PDF. Aqui lemos as linhas (via
 * readSpreadsheetRows: CSV, .xlsx binário) e reconhecemos as colunas de um
 * EXTRATO: data, histórico, valor (ou débito/crédito) e saldo. Cada linha de
 * movimento vira um `Entry` (base caixa, como o OFX); o saldo por dia vira
 * `CashBalance`. A IA nunca lê isto (CLAUDE.md) — quem lê é o código.
 *
 * Calibrado para o padrão BR (vírgula decimal). Tolera valor com ponto decimal
 * (alguns bancos) decidindo o separador pelo que aparece. Coluna não reconhecida
 * = erro claro, nunca chute.
 */

import { brDateToIso, brMoneyToCents } from './br';
import { categorize } from './categorize';
import { ofxAmountToCents } from './ofx';
import { columnIndex, norm } from './microvix';
import { readSpreadsheetRows } from './spreadsheet';
import {
  ParseError,
  type BankStatementResult,
  type CashBalance,
  type Entry,
  type EntryKind,
  type ParseWarning,
} from './types';

// Sinônimos de cabeçalho (normalizados). Extrato tem papéis próprios: o SALDO é
// coluna à parte (não é "valor"), e débito/crédito podem vir separados.
const DATE = [
  'data', 'dt', 'data lancamento', 'data de lancamento', 'data movimento',
  'data mov', 'data da movimentacao', 'movimento', 'data credito', 'competencia',
];
const DESC = [
  'historico', 'descricao', 'lancamento', 'memo', 'detalhe', 'descricao lancamento',
  'historico da transacao', 'transacao', 'observacao',
];
const VALUE = [
  'valor', 'valor r$', 'valor (r$)', 'vlr', 'valor lancamento', 'valor movimentacao',
  'movimentacao', 'valor do lancamento',
];
const CREDIT = ['credito', 'entrada', 'entradas', 'valor credito', 'credito r$'];
const DEBIT = ['debito', 'saida', 'saidas', 'valor debito', 'debito r$'];
const BALANCE = ['saldo', 'saldo r$', 'saldo do dia', 'saldo atual', 'saldo (r$)', 'saldo (r $)'];
const TYPE = ['tipo', 'd/c', 'c/d', 'tipo lancamento', 'natureza', 'tipo de movimentacao', 'debito/credito'];

/** Índice da coluna para uma lista de sinônimos: exato primeiro, depois "contém". */
function findCol(header: string[], syns: string[]): number {
  const exato = columnIndex(header, syns);
  if (exato !== -1) return exato;
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i] ?? '');
    if (h && syns.some((s) => h.includes(s))) return i;
  }
  return -1;
}

interface StatementShape {
  headerRow: number;
  date: number;
  desc: number;
  value: number; // -1 quando usa o par débito/crédito
  credit: number;
  debit: number;
  balance: number;
  type: number;
}

/** Acha o cabeçalho do extrato: precisa de DATA e de um jeito de saber o VALOR. */
function detectStatement(rows: string[][]): StatementShape | null {
  const limite = Math.min(rows.length, 25);
  for (let r = 0; r < limite; r++) {
    const header = rows[r] ?? [];
    if (header.filter((c) => c.trim() !== '').length < 2) continue;
    const date = findCol(header, DATE);
    if (date === -1) continue;
    const credit = findCol(header, CREDIT);
    const debit = findCol(header, DEBIT);
    const value = findCol(header, VALUE);
    const temMovimento = value !== -1 || (credit !== -1 && debit !== -1);
    if (!temMovimento) continue;
    return {
      headerRow: r,
      date,
      desc: findCol(header, DESC),
      value,
      credit,
      debit,
      balance: findCol(header, BALANCE),
      type: findCol(header, TYPE),
    };
  }
  return null;
}

/** Valor de dinheiro do extrato → centavos. BR (vírgula) por padrão; ponto decimal
 *  quando não há vírgula (alguns bancos). Vazio/"-" → null (linha sem movimento). */
function amountToCents(raw: string, line: number): number | null {
  const s = (raw ?? '').trim();
  if (s === '' || s === '-') return null;
  return s.includes(',') ? brMoneyToCents(s, { line }) : ofxAmountToCents(s, { line });
}

/**
 * Converte as linhas de um extrato em planilha no resultado canônico. Puro
 * (recebe a matriz de células) — testável sem binário.
 */
export function parseStatementRows(rows: string[][]): BankStatementResult {
  const shape = detectStatement(rows);
  if (!shape) {
    throw new ParseError(
      'Não reconheci as colunas deste extrato. Esperava ao menos uma coluna de DATA e ' +
        'uma de VALOR (ou Débito/Crédito). Confira se o arquivo tem cabeçalho.',
    );
  }

  const entries: Entry[] = [];
  const balances: CashBalance[] = [];
  const warnings: ParseWarning[] = [];
  const datas: string[] = [];

  for (let r = shape.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const line = r + 1;

    // data: linha sem data legível é total/rodapé → ignorada em silêncio
    const dcell = (row[shape.date] ?? '').trim();
    if (!dcell) continue;
    let when: string;
    try {
      when = brDateToIso(dcell, { line });
    } catch {
      continue;
    }

    // valor do movimento: par débito/crédito, ou coluna única (com sinal/tipo)
    let signed: number | null = null;
    try {
      if (shape.value === -1) {
        const c = amountToCents(row[shape.credit] ?? '', line);
        const d = amountToCents(row[shape.debit] ?? '', line);
        if (c != null) signed = Math.abs(c);
        else if (d != null) signed = -Math.abs(d);
      } else {
        signed = amountToCents(row[shape.value] ?? '', line);
        // coluna de tipo (D/C) decide o sinal quando o valor vem sem sinal
        if (signed != null && shape.type !== -1) {
          const t = norm(row[shape.type] ?? '');
          if (t.startsWith('d') && signed > 0) signed = -signed;
          else if (t.startsWith('c') && signed < 0) signed = Math.abs(signed);
        }
      }
    } catch {
      warnings.push({ line, message: 'valor ilegível, linha ignorada' });
      continue;
    }

    // saldo do dia (quando a coluna existe) — dado de alta confiança
    if (shape.balance !== -1) {
      try {
        const bal = amountToCents(row[shape.balance] ?? '', line);
        if (bal != null) balances.push({ observedOn: when, balanceCents: bal });
      } catch {
        /* saldo ilegível: ignora só o saldo desta linha */
      }
    }

    if (signed == null || signed === 0) continue; // linha só de saldo (abertura) etc.

    const memo = shape.desc !== -1 ? (row[shape.desc] ?? '').replace(/\s+/g, ' ').trim() : '';
    const cat = categorize('generic', memo, signed);
    const kind: EntryKind = cat.kindOverride ?? (signed >= 0 ? 'receivable' : 'payable');
    entries.push({
      id: `stmt:${line}`,
      kind,
      amountCents: Math.abs(signed),
      issuedOn: when,
      dueOn: when,
      settledOn: when,
      counterparty: memo || undefined,
      category: cat.category,
      ...(cat.costType ? { costType: cat.costType } : {}),
    });
    datas.push(when);
  }

  if (entries.length === 0 && balances.length === 0) {
    throw new ParseError('Reconheci o cabeçalho, mas não achei nenhum lançamento com data e valor.');
  }

  datas.sort();
  return {
    entries,
    balances,
    warnings,
    meta: {
      source: 'bank_spreadsheet',
      period: datas.length ? { from: datas[0]!, to: datas[datas.length - 1]! } : undefined,
      rowsParsed: entries.length,
    },
  };
}

/** Lê o arquivo (CSV/.xlsx) e devolve o extrato canônico. */
export function parseBankSpreadsheet(buf: Buffer): BankStatementResult {
  const { rows } = readSpreadsheetRows(buf);
  return parseStatementRows(rows);
}
