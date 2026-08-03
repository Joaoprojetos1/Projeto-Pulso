/**
 * Parser do "Faturamento Diário" do Microvix.
 *
 * Uma linha por DIA, com o valor faturado e a divisão por forma de pagamento
 * (Dinheiro, Ch.Vista, Ch.Prazo, Crediário, Cartão, Convênio, Pix, QR Linx).
 * Fecha com uma linha "Totais:" — usada como CONFERÊNCIA (a soma dos dias tem de
 * bater com o total).
 *
 * Valor deste relatório para o Pulso: dá a RECEITA por COMPETÊNCIA (data de
 * emissão) — o que o extrato bancário NUNCA separa (o banco só vê o dinheiro
 * cair). A divisão à vista × a prazo é o que, no futuro, refina o prazo médio de
 * recebimento. Cada dia vira UM lançamento de receita (não sabemos a data exata
 * de liquidação, só a forma; então `settledOn` só é a própria data quando o dia
 * foi 100% à vista — senão fica em aberto).
 */

import { brDateToIso, brMoneyToCents } from './br';
import { columnIndex, microvixCellIsEmpty, norm, readHtmlRows } from './microvix';
import { ParseError, type Entry, type IsoDate, type ParseWarning } from './types';

const DATE_CELL = /^\d{2}\/\d{2}\/\d{2}$/;

/** Formas de pagamento à vista (liquidam no mesmo dia) vs. a prazo (em aberto). */
const AVISTA = ['dinheiro', 'ch.vista', 'pix', 'qr linx'];
const APRAZO = ['ch.prazo', 'crediario', 'cartao', 'convenio'];

export interface MicrovixSalesResult {
  entries: Entry[];
  dailyMix: Array<{ date: IsoDate; grossCents: number; byMethod: Record<string, number> }>;
  totalDeclaredCents: number | null;
  warnings: ParseWarning[];
  meta: { source: 'microvix_faturamento'; rowsParsed: number };
}

export function parseMicrovixFaturamento(html: string): MicrovixSalesResult {
  const rows = readHtmlRows(html);
  const warnings: ParseWarning[] = [];

  const headerIdx = rows.findIndex(
    (r) => columnIndex(r, ['emissao']) >= 0 && columnIndex(r, ['valor dos documentos']) >= 0,
  );
  if (headerIdx < 0) throw new ParseError('cabeçalho de Faturamento Diário não encontrado');
  const header = rows[headerIdx]!;

  const col = {
    emissao: columnIndex(header, ['emissao']),
    valor: columnIndex(header, ['valor dos documentos']),
  };
  const methods = [...AVISTA, ...APRAZO];
  const methodCol: Record<string, number> = {};
  for (const m of methods) methodCol[m] = columnIndex(header, [m]);

  const entries: Entry[] = [];
  const dailyMix: MicrovixSalesResult['dailyMix'] = [];
  let totalDeclaredCents: number | null = null;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const first = row[col.emissao] ?? row[0] ?? '';
    if (norm(first).startsWith('totais')) {
      const t = row[col.valor];
      if (t && !microvixCellIsEmpty(t)) totalDeclaredCents = brMoneyToCents(t, { line: i + 1, column: 'Totais' });
      break;
    }
    if (!DATE_CELL.test(first)) continue; // linhas de subtítulo/rodapé

    const date = brDateToIso(first, { line: i + 1, column: 'Emissão' });
    const grossCents = brMoneyToCents(row[col.valor] ?? '', { line: i + 1, column: 'Valor dos Documentos' });

    const byMethod: Record<string, number> = {};
    let aprazoCents = 0;
    for (const m of methods) {
      const idx = methodCol[m]!;
      const cell = idx >= 0 ? row[idx] : undefined;
      const cents = microvixCellIsEmpty(cell) ? 0 : brMoneyToCents(cell!, { line: i + 1, column: m });
      byMethod[m] = cents;
      if (APRAZO.includes(m)) aprazoCents += cents;
    }

    entries.push({
      id: `microvix-fat:${date}`,
      kind: 'receivable',
      amountCents: grossCents,
      issuedOn: date, // COMPETÊNCIA — o diferencial do ERP sobre o extrato
      dueOn: date,
      settledOn: aprazoCents === 0 ? date : null, // à vista liquida no dia; a prazo fica em aberto
      category: 'venda_varejo',
    });
    dailyMix.push({ date, grossCents, byMethod });
  }

  if (entries.length === 0) throw new ParseError('nenhum dia de faturamento reconhecido');

  const somaDias = entries.reduce((s, e) => s + e.amountCents, 0);
  if (totalDeclaredCents != null && Math.abs(somaDias - totalDeclaredCents) > 0) {
    warnings.push({
      line: 0,
      message: `soma dos dias (${somaDias}) não bate com o total declarado (${totalDeclaredCents})`,
    });
  }

  return {
    entries,
    dailyMix,
    totalDeclaredCents,
    warnings,
    meta: { source: 'microvix_faturamento', rowsParsed: entries.length },
  };
}
