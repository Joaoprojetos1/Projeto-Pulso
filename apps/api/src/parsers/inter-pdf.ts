/**
 * Parser do extrato do Banco Inter (PDF de conta PJ).
 *
 * O PDF vira TEXTO (via `extractPdfText`); este módulo lê o texto. O layout do
 * Inter agrupa os lançamentos por dia, com um cabeçalho "N de Mês de AAAA Saldo
 * do dia: R$ X" e, em cada linha, cola a descrição, a contraparte entre aspas,
 * o VALOR e o SALDO corrido — todos sem separador. Ex.:
 *
 *   2 de Janeiro de 2026 Saldo do dia: R$ 482,34
 *   Pix recebido: "Cp :99999999-CLIENTE EXEMPLO"R$ 133,34R$ 6.355,92
 *   Pix enviado: "Cp :99999999-FORNECEDOR"-R$ 2.000,00R$ 4.607,84
 *
 * Estratégia: percorre linha a linha, mantém o dia corrente do cabeçalho, e de
 * cada linha de lançamento extrai os DOIS últimos tokens de dinheiro (valor e
 * saldo). O "Saldo do dia" vira um `CashBalance` observado (dado de alta
 * confiança). Tolerante a rodapés ("Fale com a gente", SAC) — pula com aviso.
 */

import { brMoneyToCents, findMoneyTokens, ptLongDateToIso } from './br';
import { categorize } from './categorize';
import { ParseError, type BankStatementResult, type CashBalance, type Entry, type ParseWarning } from './types';

const DAY_HEADER = /^(\d{1,2} de [A-Za-zçÇãéêáí]+ de \d{4})\s+Saldo do dia:\s*(-?R\$[\s\d.,]+?)\s*$/i;
const TXN = /^(.+?):\s*"([^"]*)"(.*)$/;
const PERIODO = /Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i;
const CONTA = /Conta:\s*([\d-]+)/i;

/** Linhas de ruído conhecidas (rodapé/cabeçalho institucional). Puladas em silêncio. */
const KNOWN_NOISE = [
  /^Fale com a gente/i,
  /^SAC:/i,
  /^Ouvidoria/i,
  /^Solicitado em:/i,
  /CPF\/CNPJ:/i,
  /^Saldo (total|dispon|bloqueado)/i,
  /^\(bloqueado/i,
  /^R\$\s*[\d.,]+$/, // linha isolada só com o valor do "Saldo total"
  /^ValorSaldo/i,
  /Institui[cç][aã]o:/i,
  /Ltda\.?$/i, // nome da empresa isolado no topo
];

function cleanCounterparty(raw: string): string | undefined {
  const cp = raw
    .replace(/^Cp\s*:\s*\d+\s*-\s*/i, '') // "Cp :99999999-NOME" → "NOME"
    .replace(/^\d{3,}\s+\d{3,}\s+/, '') // "00019 162234805 NOME" → "NOME"
    .trim();
  return cp === '' ? undefined : cp;
}

export function parseInterStatement(text: string): BankStatementResult {
  const rawLines = text.split(/\r?\n/);
  const entries: Entry[] = [];
  const balances: CashBalance[] = [];
  const warnings: ParseWarning[] = [];

  let period: BankStatementResult['meta']['period'];
  let account: string | undefined;
  let currentDate: string | null = null;

  for (let i = 0; i < rawLines.length; i++) {
    const lineNo = i + 1;
    const line = rawLines[i]!.replace(/ /g, ' ').trim();
    if (line === '' || line.startsWith('#')) continue;

    if (!period) {
      const mp = line.match(PERIODO);
      if (mp) {
        period = { from: isoFromBr(mp[1]!), to: isoFromBr(mp[2]!) };
      }
    }
    if (!account) {
      const mc = line.match(CONTA);
      if (mc) account = mc[1];
    }

    const dh = line.match(DAY_HEADER);
    if (dh) {
      currentDate = ptLongDateToIso(dh[1]!, { line: lineNo });
      balances.push({ observedOn: currentDate, balanceCents: brMoneyToCents(dh[2]!, { line: lineNo }) });
      continue;
    }

    const tx = line.match(TXN);
    if (tx) {
      const tipo = tx[1]!.trim();
      const counterpartyRaw = tx[2]!;
      const tail = tx[3]!;
      const money = findMoneyTokens(tail);
      if (money.length < 2) {
        // linha com aspas mas sem valor+saldo: não é lançamento — registra e segue
        warnings.push({ line: lineNo, message: 'linha com aspas sem valor/saldo — ignorada' });
        continue;
      }
      if (!currentDate) {
        throw new ParseError('lançamento antes de qualquer cabeçalho de dia', { line: lineNo });
      }
      const valorToken = money[money.length - 2]!;
      const signedCents = brMoneyToCents(valorToken, { line: lineNo, column: 'valor' });
      const cat = categorize('inter', tipo, signedCents);
      const kind = cat.kindOverride ?? (signedCents >= 0 ? 'receivable' : 'payable');
      entries.push({
        id: `inter:${lineNo}`,
        kind,
        amountCents: Math.abs(signedCents),
        // base caixa: só a data do movimento é conhecida (ver types.ts).
        issuedOn: currentDate,
        dueOn: currentDate,
        settledOn: currentDate,
        counterparty: cleanCounterparty(counterpartyRaw),
        category: cat.category,
        ...(cat.costType ? { costType: cat.costType } : {}),
      });
      continue;
    }

    if (!KNOWN_NOISE.some((re) => re.test(line))) {
      warnings.push({ line: lineNo, message: 'linha não reconhecida — ignorada' });
    }
  }

  if (entries.length === 0 && balances.length === 0) {
    throw new ParseError('nenhum lançamento reconhecido — arquivo do Inter esperado');
  }

  return {
    entries,
    balances,
    warnings,
    meta: { source: 'inter_pdf', account, period, rowsParsed: entries.length },
  };
}

function isoFromBr(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/');
  return `${y}-${m}-${d}`;
}
