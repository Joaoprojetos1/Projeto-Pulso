/**
 * Parser do "Relatório de Giro Médio" do Microvix.
 *
 * Uma linha por PRODUTO, com estoque inicial/final, preço de custo, quantidade
 * vendida e giro. Serve para dois insumos do segmento VAREJO:
 *   - CMV do período   = Σ (quantidade vendida × preço de custo)
 *   - Estoque a custo   = Σ (estoque final × preço de custo)
 * O período vem do cabeçalho de filtros ("Período: dd/mm/aaaa a dd/mm/aaaa").
 *
 * Atenção de janela: este relatório é do PERÍODO inteiro (ex.: jan–jul), não de
 * um mês. Quem anualiza com a janela real é o core (ver segments/varejo.ts).
 */

import { brDateToIso, brDecimal, brMoneyToCents } from './br';
import { columnIndex, microvixCellIsEmpty, readHtmlRows } from './microvix';
import { ParseError, type IsoDate, type ParseWarning } from './types';

export interface MicrovixGiroResult {
  periodo?: { from: IsoDate; to: IsoDate };
  cmvPeriodCents: number;
  estoqueFinalCustoCents: number;
  produtos: number;
  warnings: ParseWarning[];
  meta: { source: 'microvix_giro' };
}

export function parseMicrovixGiro(html: string): MicrovixGiroResult {
  const rows = readHtmlRows(html);
  const warnings: ParseWarning[] = [];
  const periodo = extractPeriodo(rows);

  const headerIdx = rows.findIndex(
    (r) => columnIndex(r, ['produto']) >= 0 && columnIndex(r, ['qtde vendida']) >= 0,
  );
  if (headerIdx < 0) throw new ParseError('cabeçalho do Giro Médio não encontrado');
  const header = rows[headerIdx]!;
  const cPreco = columnIndex(header, ['preco custo', 'preço custo']);
  const cEstoque = columnIndex(header, ['estoque final']);
  const cVend = columnIndex(header, ['qtde vendida']);
  if (cPreco < 0 || cVend < 0) throw new ParseError('colunas de custo/quantidade não encontradas no Giro');

  let cmvPeriodCents = 0;
  let estoqueFinalCustoCents = 0;
  let produtos = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length < header.length) continue; // linha de grupo/rodapé
    const precoCell = row[cPreco];
    if (microvixCellIsEmpty(precoCell)) continue;
    const precoCusto = brMoneyToCents(precoCell!, { line: i + 1, column: 'Preço Custo' });
    const vendida = brDecimal(row[cVend] ?? '', { line: i + 1, column: 'Qtde vendida' });
    cmvPeriodCents += Math.round(vendida * precoCusto);
    if (cEstoque >= 0 && !microvixCellIsEmpty(row[cEstoque])) {
      estoqueFinalCustoCents += Math.round(brDecimal(row[cEstoque]!) * precoCusto);
    }
    produtos++;
  }

  if (produtos === 0) throw new ParseError('nenhum produto reconhecido no Giro Médio');
  return {
    periodo,
    cmvPeriodCents,
    estoqueFinalCustoCents,
    produtos,
    warnings,
    meta: { source: 'microvix_giro' },
  };
}

export function extractPeriodo(rows: string[][]): { from: IsoDate; to: IsoDate } | undefined {
  const flat = rows.flat().join(' ');
  const m = flat.match(/per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!m) return undefined;
  return { from: brDateToIso(m[1]!), to: brDateToIso(m[2]!) };
}
