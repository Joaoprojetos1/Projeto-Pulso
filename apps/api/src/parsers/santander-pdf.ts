/**
 * Parser do extrato do Santander (PDF de conta PJ — Internet Banking Empresarial).
 *
 * Este é o formato SUJO. Ao virar texto, um mesmo lançamento se espalha por até
 * 4 linhas: a data numa linha, a descrição quebrada em 1–3 linhas, e por fim uma
 * linha "documento + valor (+ saldo)" grudados. Ex.:
 *
 *   01/06/2026                          ← data isolada (inicia o lançamento)
 *   PAGAMENTO CARTAO DE DEBITO G        ← descrição, parte 1
 *   ETNET-MAESTRO                       ← descrição, parte 2 (quebrou "GETNET")
 *   9103321.042,08                      ← documento(910332) + valor(1.042,08)
 *
 * DUAS ARMADILHAS reais, descobertas nos arquivos:
 *
 * 1) AMBIGUIDADE documento×valor. Quando o valor tem separador de milhar e vem
 *    colado no documento (`...38092.155,95`), o texto não deixa saber onde o
 *    documento acaba: `092.155,95` (R$ 92 mil) e `2.155,95` são igualmente
 *    plausíveis só olhando os caracteres. Isso é IRREDUTÍVEL no PDF.
 *
 * 2) DOIS layouts. Num deles ("Pix Recebido") o SALDO corrido vem em TODA linha;
 *    no outro ("PIX RECEBIDO") só no último lançamento do dia.
 *
 * ESTRATÉGIA: quando o saldo corrido está em cada linha, o valor é a DIFERENÇA de
 * saldos (exato — dribla a ambiguidade do documento). Quando o saldo só aparece
 * no fim do dia, caímos no token de valor (melhor-esforço) e emitimos um aviso
 * para as linhas com separador de milhar, que podem estar contaminadas pelo
 * documento. Para esse layout, o OFX é a fonte recomendada (ver CLAUDE.md).
 */

import { brDateToIso, brMoneyToCents, findMoneyTokens } from './br';
import { categorize, type CanonicalCategory } from './categorize';
import {
  ParseError,
  type BankStatementResult,
  type CashBalance,
  type Entry,
  type EntryKind,
  type ParseWarning,
} from './types';

const DATE_LEAD = /^(\d{2}\/\d{2}\/\d{4})(.*)$/;
const VALUE_ONLY = /^[\d.,\- ]+$/;
const SALDO_A = /^A - Saldo de Conta Corrente\s*(-?[\d.]+,\d{2})/i;
const PERIODO = /Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i;
const CONTA = /Conta:\s*(\d+)/i;

const OUTFLOW: ReadonlySet<CanonicalCategory> = new Set([
  'fornecedor',
  'tarifa_bancaria',
  'folha_salario',
  'imposto',
  'conta_consumo',
]);
const INFLOW: ReadonlySet<CanonicalCategory> = new Set(['venda_pix', 'repasse_adquirente']);

interface RawRecord {
  date: string;
  desc: string;
  valueLine: string;
  line: number;
}

export function parseSantanderStatement(text: string): BankStatementResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, ' ').trim());
  const records: RawRecord[] = [];
  const warnings: ParseWarning[] = [];
  const balancesByDate = new Map<string, number>();

  let period: BankStatementResult['meta']['period'];
  let account: string | undefined;
  let currentDate: string | null = null;
  let descParts: string[] = [];
  let inRecord = false;
  let recordStartLine = 0;

  const push = (valueLine: string, lineNo: number) => {
    if (!currentDate) throw new ParseError('lançamento sem data', { line: lineNo });
    records.push({
      date: currentDate,
      desc: descParts.join(' ').replace(/\s+/g, ' ').trim(),
      valueLine,
      line: recordStartLine || lineNo,
    });
    descParts = [];
    inRecord = false;
  };

  // ---- Passo 1: reconstruir os registros crus (data + descrição + linha de valor) ----
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i]!;
    if (line === '' || line.startsWith('#')) continue;

    if (!period) {
      const mp = line.match(PERIODO);
      if (mp) period = { from: brDateToIso(mp[1]!), to: brDateToIso(mp[2]!) };
    }
    if (!account) {
      const mc = line.match(CONTA);
      if (mc) account = mc[1];
    }
    const sa = line.match(SALDO_A);
    if (sa && period) {
      balancesByDate.set(period.to, brMoneyToCents(sa[1]!, { line: lineNo, column: 'saldo' }));
      continue;
    }

    const dl = line.match(DATE_LEAD);
    if (dl) {
      if (inRecord) warnings.push({ line: recordStartLine, message: 'lançamento sem linha de valor — descartado' });
      currentDate = brDateToIso(dl[1]!, { line: lineNo });
      const rest = dl[2]!.trim();
      recordStartLine = lineNo;
      if (rest !== '' && findMoneyTokens(rest).length > 0) {
        descParts = [stripDocAndMoney(rest)];
        inRecord = true;
        push(rest, lineNo);
      } else {
        descParts = rest !== '' ? [rest] : [];
        inRecord = true;
      }
      continue;
    }

    if (VALUE_ONLY.test(line) && findMoneyTokens(line).length > 0) {
      if (!inRecord) {
        warnings.push({ line: lineNo, message: 'linha de valor sem lançamento aberto — ignorada' });
        continue;
      }
      push(line, lineNo);
      continue;
    }

    if (inRecord) descParts.push(line);
  }

  if (records.length === 0) {
    throw new ParseError('nenhum lançamento reconhecido — arquivo do Santander esperado');
  }

  // ---- Passo 2: decidir o modo e converter para o schema canônico ----
  const withSaldo = records.filter((r) => findMoneyTokens(r.valueLine).length >= 2).length;
  const perLineSaldo = withSaldo / records.length > 0.7;

  const entries: Entry[] = [];
  let prevSaldo: number | null = null;

  for (const rec of records) {
    const tokens = findMoneyTokens(rec.valueLine);
    if (tokens.length === 0) throw new ParseError('linha de valor sem número', { line: rec.line });
    const saldoToken = tokens.length >= 2 ? tokens[tokens.length - 1]! : null;
    const saldoCents = saldoToken != null ? brMoneyToCents(saldoToken, { line: rec.line, column: 'saldo' }) : null;

    let amountSigned: number;
    if (perLineSaldo && saldoCents != null && prevSaldo != null) {
      // Fonte de verdade: a diferença de saldos. Dribla a ambiguidade do documento.
      amountSigned = saldoCents - prevSaldo;
    } else {
      amountSigned = brMoneyToCents(tokens[0]!, { line: rec.line, column: 'valor' });
      if (!perLineSaldo && /\./.test(tokens[0]!)) {
        warnings.push({
          line: rec.line,
          message: 'valor com separador de milhar sem saldo por linha para conferir — possível ambiguidade documento×valor',
        });
      }
    }
    if (saldoCents != null) {
      prevSaldo = saldoCents;
      balancesByDate.set(rec.date, saldoCents);
    }

    const cat = categorize('santander', rec.desc, amountSigned);
    entries.push({
      id: `santander:${rec.line}`,
      kind: kindFor(cat.kindOverride, cat.category, amountSigned, perLineSaldo && saldoCents != null),
      amountCents: Math.abs(amountSigned),
      issuedOn: rec.date,
      dueOn: rec.date,
      settledOn: rec.date,
      // Varejo de balcão: o extrato não nomeia o cliente/fornecedor (só documento).
      category: cat.category,
      ...(cat.costType ? { costType: cat.costType } : {}),
    });
  }

  const balances: CashBalance[] = [...balancesByDate.entries()]
    .map(([observedOn, balanceCents]) => ({ observedOn, balanceCents }))
    .sort((a, b) => (a.observedOn < b.observedOn ? -1 : 1));

  return {
    entries,
    balances,
    warnings,
    meta: { source: 'santander_pdf', account, period, rowsParsed: entries.length },
  };
}

function kindFor(
  override: EntryKind | undefined,
  category: CanonicalCategory,
  signedCents: number,
  saldoAuthoritative: boolean,
): EntryKind {
  if (override) return override;
  // Quando o valor veio da diferença de saldos, o sinal é a verdade do movimento.
  if (saldoAuthoritative) return signedCents >= 0 ? 'receivable' : 'payable';
  if (INFLOW.has(category)) return 'receivable';
  if (OUTFLOW.has(category)) return 'payable';
  return signedCents >= 0 ? 'receivable' : 'payable';
}

/** Para registros inline: tira o documento (dígitos) e a moeda do fim, sobra a descrição. */
function stripDocAndMoney(rest: string): string {
  let s = rest;
  for (const tok of findMoneyTokens(rest)) s = s.replace(tok, '');
  return s.replace(/\d[\d.\s-]*$/, '').replace(/\s+/g, ' ').trim();
}
