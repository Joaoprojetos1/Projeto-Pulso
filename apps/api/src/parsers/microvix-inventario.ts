/**
 * Parser da "Exportação Registro de Inventário" do Microvix (Relatório Sintético).
 *
 * Estoque ATUAL agrupado por LINHA de produto, com saldo, subtotal de custo e de
 * venda por linha, e uma linha final "Total Geral". Insumo do segmento VAREJO: o
 * `estoque_final` a preço de custo (o "dinheiro parado").
 *
 * Armadilha real: as linhas têm um número de células VARIÁVEL (11 ou 12) e um
 * deslocamento de coluna à esquerda, então indexar pelo cabeçalho erra. As
 * colunas são estáveis PELA DIREITA: margem = última, subtotal de venda = −2,
 * subtotal de custo = −4. Somamos as linhas e conferimos contra o "Total Geral".
 */

import { brDateToIso, brMoneyToCents } from './br';
import { microvixCellIsEmpty, norm, readHtmlRows } from './microvix';
import { ParseError, type IsoDate, type ParseWarning } from './types';

const LINHA = /^\d+-/; // "18-Bermuda Fem", "10-Boné"...

export interface MicrovixInventarioResult {
  dataBase?: IsoDate;
  estoqueCustoCents: number;
  estoqueVendaCents: number;
  linhas: number;
  warnings: ParseWarning[];
  meta: { source: 'microvix_inventario' };
}

export function parseMicrovixInventario(html: string): MicrovixInventarioResult {
  const rows = readHtmlRows(html);
  const warnings: ParseWarning[] = [];

  let estoqueCustoCents = 0;
  let estoqueVendaCents = 0;
  let linhas = 0;
  let totalCustoDeclared: number | null = null;
  let totalVendaDeclared: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length < 5) continue;
    const custoCell = row[row.length - 4];
    const vendaCell = row[row.length - 2];

    if (norm(row[0] ?? '').startsWith('total geral')) {
      if (!microvixCellIsEmpty(custoCell)) totalCustoDeclared = brMoneyToCents(custoCell!, { line: i + 1, column: 'Total Geral custo' });
      if (!microvixCellIsEmpty(vendaCell)) totalVendaDeclared = brMoneyToCents(vendaCell!, { line: i + 1, column: 'Total Geral venda' });
      continue;
    }
    // linha de produto: a Descrição ("18-Bermuda Fem") está na 2ª célula
    if (!LINHA.test(row[1] ?? '')) continue;
    if (!microvixCellIsEmpty(custoCell)) estoqueCustoCents += brMoneyToCents(custoCell!, { line: i + 1, column: 'Subtotal Custo' });
    if (!microvixCellIsEmpty(vendaCell)) estoqueVendaCents += brMoneyToCents(vendaCell!, { line: i + 1, column: 'Subtotal Venda' });
    linhas++;
  }

  if (linhas === 0) throw new ParseError('nenhuma linha de produto reconhecida no Inventário');
  if (totalCustoDeclared != null && Math.abs(totalCustoDeclared - estoqueCustoCents) > 0) {
    warnings.push({
      line: 0,
      message: `soma das linhas (${estoqueCustoCents}) não bate com Total Geral (${totalCustoDeclared})`,
    });
  }

  const flat = rows.flat().join(' ');
  const md = flat.match(/saldos?\s+baseados?\s+na\s+data\s+(\d{2}\/\d{2}\/\d{4})/i);
  const dataBase = md ? brDateToIso(md[1]!) : undefined;

  return {
    dataBase,
    // preferimos o total declarado quando presente (fonte de verdade do relatório)
    estoqueCustoCents: totalCustoDeclared ?? estoqueCustoCents,
    estoqueVendaCents: totalVendaDeclared ?? estoqueVendaCents,
    linhas,
    warnings,
    meta: { source: 'microvix_inventario' },
  };
}
