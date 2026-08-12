/**
 * Pulso — o "cérebro" genérico do leitor de planilha.
 *
 * Recebe uma matriz de células de texto (`string[][]` — venha de CSV, do HTML do
 * Microvix ou, no futuro, de um .xlsx) e:
 *   1. acha a LINHA DE CABEÇALHO;
 *   2. mapeia as colunas para papéis (data, descrição, valor);
 *   3. extrai registros normalizados (data ISO, descrição, valor em centavos),
 *      reusando o parsing brasileiro à prova de sujeira (`br.ts`).
 *
 * NÃO decide o que o registro significa (custo fixo? receita? recebível?) — isso
 * é papel de cada leitor específico por tipo de documento, calibrado com uma
 * amostra real. Aqui é só a base reutilizável. A IA nunca lê isto (CLAUDE.md).
 */

import { brDateToIso, brMoneyToCents } from './br';
import { columnIndex, norm } from './microvix';
import { ParseError, type ParseWarning } from './types';

export type ColumnRole = 'date' | 'description' | 'value';

/** Sinônimos de cabeçalho por papel (normalizados: minúsculo, sem acento). */
const SYNONYMS: Record<ColumnRole, string[]> = {
  date: [
    'data', 'dt', 'data lancamento', 'data de lancamento', 'data pagamento',
    'data de pagamento', 'pagamento', 'vencimento', 'data vencimento', 'emissao',
    'data emissao', 'competencia', 'periodo', 'mes', 'data movimento', 'movimento',
    'data credito', 'data referencia', 'referencia',
  ],
  value: [
    'valor', 'valor r$', 'r$', 'total', 'vlr', 'valor total', 'montante',
    'credito', 'debito', 'valor liquido', 'liquido', 'valor bruto', 'bruto',
    'valor pago', 'valor a pagar', 'valor a receber', 'saldo', 'proventos',
    'vencimentos', 'salario', 'salario liquido', 'liquido a receber',
  ],
  description: [
    'descricao', 'historico', 'lancamento', 'cliente', 'fornecedor', 'nome',
    'produto', 'item', 'categoria', 'conta', 'memo', 'observacao', 'obs',
    'funcionario', 'colaborador', 'participante', 'favorecido', 'razao social',
  ],
};

/**
 * Índice da coluna para um papel: casa EXATO primeiro (mais seguro), depois
 * "contém" (para "Valor (R$)", "Data de Pagamento" etc.). -1 se não achar.
 */
export function findColumn(header: string[], role: ColumnRole): number {
  const syns = SYNONYMS[role];
  const exato = columnIndex(header, syns);
  if (exato !== -1) return exato;
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i] ?? '');
    if (h && syns.some((s) => h.includes(s))) return i;
  }
  return -1;
}

export interface TableShape {
  /** Índice (0-based) da linha de cabeçalho. */
  headerRow: number;
  /** Coluna de cada papel (ausente quando não reconhecida). */
  columns: Partial<Record<ColumnRole, number>>;
}

/**
 * Acha o cabeçalho e mapeia as colunas. Procura nas primeiras linhas a que tem
 * uma coluna de VALOR reconhecível (o mínimo para o registro valer algo) e ao
 * menos duas células preenchidas. Devolve null se nenhuma servir (o chamador
 * então avisa "não reconheci as colunas", nunca chuta).
 */
export function detectColumns(rows: string[][]): TableShape | null {
  const limite = Math.min(rows.length, 20);
  for (let r = 0; r < limite; r++) {
    const header = rows[r] ?? [];
    if (header.filter((c) => c.trim() !== '').length < 2) continue;
    const value = findColumn(header, 'value');
    if (value === -1) continue;
    const date = findColumn(header, 'date');
    const description = findColumn(header, 'description');
    const columns: Partial<Record<ColumnRole, number>> = { value };
    if (date !== -1) columns.date = date;
    if (description !== -1) columns.description = description;
    return { headerRow: r, columns };
  }
  return null;
}

/** Um registro já normalizado (o schema comum antes do mapeamento por tipo). */
export interface TableRecord {
  /** Data do negócio em ISO (YYYY-MM-DD), quando a planilha traz e é legível. */
  date?: string;
  description?: string;
  /** Valor em CENTAVOS inteiros (nunca float). */
  valueCents: number;
  /** Linha crua (1-based, como o dono vê) para auditoria. */
  line: number;
}

export interface TableExtract {
  records: TableRecord[];
  warnings: ParseWarning[];
  /** Soma dos valores (centavos) — atalho útil (ex.: total da folha). */
  totalCents: number;
}

/**
 * Extrai os registros das linhas ABAIXO do cabeçalho. Cada linha vira um registro
 * quando o VALOR é legível; célula de valor vazia/"-" é linha em branco (pulada em
 * silêncio); valor ilegível vira aviso NÃO-fatal (não derruba o arquivo inteiro).
 * Data é best-effort (indefinida quando não parseia — ex.: linha de total).
 */
export function extractRecords(rows: string[][], shape: TableShape): TableExtract {
  const records: TableRecord[] = [];
  const warnings: ParseWarning[] = [];
  const cValue = shape.columns.value;
  if (cValue == null) throw new ParseError('planilha sem coluna de valor reconhecida');
  const cDate = shape.columns.date;
  const cDesc = shape.columns.description;

  let totalCents = 0;
  for (let r = shape.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const bruto = (row[cValue] ?? '').trim();
    if (bruto === '' || bruto === '-') continue; // linha em branco
    let valueCents: number;
    try {
      valueCents = brMoneyToCents(bruto, { line: r + 1 });
    } catch {
      warnings.push({ line: r + 1, message: 'valor ilegível, linha ignorada' });
      continue;
    }
    const rec: TableRecord = { valueCents, line: r + 1 };
    if (cDate != null) {
      const dcell = (row[cDate] ?? '').trim();
      if (dcell) {
        try {
          rec.date = brDateToIso(dcell, { line: r + 1 });
        } catch {
          /* data não-parseável (ex.: linha de total): fica sem data */
        }
      }
    }
    if (cDesc != null) {
      const d = (row[cDesc] ?? '').trim();
      if (d) rec.description = d;
    }
    records.push(rec);
    totalCents += valueCents;
  }
  return { records, warnings, totalCents };
}
