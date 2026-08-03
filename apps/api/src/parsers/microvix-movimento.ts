/**
 * Parser do "Movimento Diário" do Microvix.
 *
 * Uma linha por DOCUMENTO (venda), com cliente (quase sempre "CONSUMIDOR FINAL"),
 * valor e forma de pagamento. É o detalhe do faturamento — venda a venda. Daqui
 * saem dois insumos por MÊS: o número de vendas (atendimentos) e o faturamento
 * (conferível contra o Faturamento Diário). A coluna "Troca" é somada como PROXY
 * de devoluções (ambíguo: troca não é exatamente devolução — marcado como tal).
 */

import { brMoneyToCents } from './br';
import { columnIndex, microvixCellIsEmpty, readHtmlRows } from './microvix';
import { ParseError, type ParseWarning } from './types';

const DATE_CELL = /^(\d{2})\/(\d{2})\/(\d{2})$/;

export interface MicrovixMovimentoResult {
  months: Array<{ month: string; atendimentos: number; revenueCents: number; trocaCents: number }>;
  totalDocs: number;
  warnings: ParseWarning[];
  meta: { source: 'microvix_movimento' };
}

export function parseMicrovixMovimento(html: string): MicrovixMovimentoResult {
  const rows = readHtmlRows(html);
  const warnings: ParseWarning[] = [];

  const headerIdx = rows.findIndex(
    (r) => columnIndex(r, ['data']) >= 0 && columnIndex(r, ['valor do documento']) >= 0,
  );
  if (headerIdx < 0) throw new ParseError('cabeçalho do Movimento Diário não encontrado');
  const header = rows[headerIdx]!;
  const cData = columnIndex(header, ['data']);
  const cValor = columnIndex(header, ['valor do documento']);
  const cTroca = columnIndex(header, ['troca']);

  const byMonth = new Map<string, { atendimentos: number; revenueCents: number; trocaCents: number }>();
  let totalDocs = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const dcell = row[cData] ?? '';
    const dm = dcell.match(DATE_CELL);
    if (!dm) continue; // subtítulo "Vendedor: ..." ou rodapé
    if (microvixCellIsEmpty(row[cValor])) continue;

    const month = `20${dm[3]}-${dm[2]}`;
    const bucket = byMonth.get(month) ?? { atendimentos: 0, revenueCents: 0, trocaCents: 0 };
    bucket.atendimentos += 1;
    bucket.revenueCents += brMoneyToCents(row[cValor]!, { line: i + 1, column: 'Valor do Documento' });
    if (cTroca >= 0 && !microvixCellIsEmpty(row[cTroca])) {
      bucket.trocaCents += brMoneyToCents(row[cTroca]!, { line: i + 1, column: 'Troca' });
    }
    byMonth.set(month, bucket);
    totalDocs += 1;
  }

  if (totalDocs === 0) throw new ParseError('nenhum documento reconhecido no Movimento Diário');

  const months = [...byMonth.entries()]
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  return { months, totalDocs, warnings, meta: { source: 'microvix_movimento' } };
}
