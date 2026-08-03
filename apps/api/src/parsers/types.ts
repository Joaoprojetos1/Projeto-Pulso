/**
 * Pulso — contrato dos parsers de arquivo.
 *
 * Todo parser converte um formato de origem (extrato de banco, export de ERP)
 * para o MESMO schema canônico do core (`Entry` / `CashBalance`). O core nunca
 * sabe de onde o dado veio (ver CLAUDE.md, "Consequência de arquitetura").
 *
 * REGRA DE OURO: quem lê o arquivo é o CÓDIGO, nunca a IA. Dado bruto jamais
 * entra em prompt. Dinheiro sempre em centavos inteiros (nunca float).
 */

import type { CashBalance, Entry, IsoDate } from '@pulso/core';

/**
 * Falha de parsing com localização. NUNCA falhar em silêncio nem produzir valor
 * inválido: se uma célula não converte, o parser levanta isto apontando ONDE.
 * A mensagem não carrega PII (sem nome/contraparte): só a posição e o formato.
 */
export class ParseError extends Error {
  constructor(
    message: string,
    readonly at: { line?: number; column?: string; hint?: string } = {},
  ) {
    const loc = [
      at.line != null ? `linha ${at.line}` : null,
      at.column ? `coluna "${at.column}"` : null,
    ]
      .filter(Boolean)
      .join(', ');
    super(loc ? `${message} (${loc})` : message);
    this.name = 'ParseError';
  }
}

/**
 * Aviso NÃO-fatal: uma linha que o parser conseguiu pular com segurança (rodapé
 * inesperado, linha de legenda). Some no resultado para auditoria, sem derrubar
 * a importação inteira. Também sem PII.
 */
export interface ParseWarning {
  line: number;
  message: string;
}

/** De onde o resultado veio — rótulo estável para log e para a camada de fontes. */
export type ParserSource =
  | 'inter_pdf'
  | 'santander_pdf'
  | 'ofx'
  | 'microvix_faturamento'
  | 'microvix_movimento'
  | 'microvix_giro'
  | 'microvix_inventario';

/** Resultado de um parser de EXTRATO BANCÁRIO → schema canônico. */
export interface BankStatementResult {
  /** Lançamentos (base caixa: ver nota abaixo). */
  entries: Entry[];
  /** Saldos observados (o extrato traz o saldo corrido — dado de alta confiança). */
  balances: CashBalance[];
  warnings: ParseWarning[];
  meta: {
    source: ParserSource;
    /** Conta de origem (ofuscada; só para conferência, não é PII sensível). */
    account?: string;
    period?: { from: IsoDate; to: IsoDate };
    rowsParsed: number;
  };
}

/**
 * NOTA DE HONESTIDADE (base caixa vs. competência):
 * o extrato bancário só conhece a data em que o dinheiro MOVEU. Ao virar `Entry`,
 * usamos essa data para `settledOn` E, por falta de melhor, também para `issuedOn`
 * e `dueOn` (proxy base-caixa). Isso é fiel para venda à vista (PIX na hora), mas
 * NÃO para cartão (a venda foi antes do repasse). Por isso a camada de cobertura
 * declara que o extrato NÃO fornece `entry.issuedOn`/`entry.dueOn` de verdade —
 * PMR/PMP só saem do ERP. Ver `packages/core/src/sources.ts` e docs/COBERTURA-REAL.md.
 */
export const BANK_ENTRY_DATES_ARE_CASH_BASIS = true;

export type { CashBalance, Entry, EntryKind, CostType, IsoDate } from '@pulso/core';
