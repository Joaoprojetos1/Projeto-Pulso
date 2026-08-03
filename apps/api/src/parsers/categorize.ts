/**
 * Pulso — categorização determinística de lançamentos de extrato.
 *
 * REGRA DE OURO: a IA NUNCA categoriza. Aqui é só código: casa a descrição do
 * banco contra um dicionário de padrões e devolve uma categoria canônica. Cada
 * regra cita um exemplo REAL, mas ANONIMIZADO (nomes e documentos trocados por
 * rótulos genéricos). Onde o padrão é ambíguo, a regra marca `ambiguous: true`
 * em vez de chutar — o dono confirma depois.
 *
 * As regras vieram da leitura dos extratos reais (Inter de um restaurante e
 * Santander de um varejo de roupa). As contagens em cada comentário são a
 * frequência observada, para justificar por que a regra existe.
 */

export type CanonicalCategory =
  | 'venda_pix' //          entrada: PIX de cliente (à vista)
  | 'repasse_adquirente' // entrada: repasse da maquininha (venda no cartão)
  | 'transferencia' //      entrada/saída: transferência (pode ser entre contas próprias)
  | 'fornecedor' //         saída: pagamento a fornecedor (boleto/PIX/título)
  | 'folha_salario' //      saída: salário / folha
  | 'imposto' //            saída: tributo (DAS, tributos federais)
  | 'tarifa_bancaria' //    saída: tarifa do banco
  | 'estorno' //            estorno/devolução (inverte um lançamento anterior)
  | 'conta_consumo' //      saída: conta via convênio (concessionária, boleto de consumo)
  | 'nao_classificado'; //  não bateu nenhuma regra — fica cru para o dono ver

import type { CostType, EntryKind } from '@pulso/core';

export interface CategoryResult {
  category: CanonicalCategory;
  /** Sobrescreve o tipo inferido pelo sinal (ex.: estorno). Em geral vem do sinal. */
  kindOverride?: EntryKind;
  /** Natureza do custo quando a categoria a determina com segurança. */
  costType?: CostType;
  /** Regra reconheceu o padrão, mas o significado de negócio é ambíguo. */
  ambiguous?: boolean;
}

interface Rule {
  category: CanonicalCategory;
  test: RegExp;
  costType?: CostType;
  ambiguous?: boolean;
  /** Exemplo real ANONIMIZADO que sustenta a regra. */
  example: string;
}

/**
 * Inter — restaurante. Movimento dominado por PIX de cliente e repasse de cartão.
 * Frequências observadas no período jan–jun/2026.
 */
const INTER_RULES: Rule[] = [
  {
    category: 'venda_pix',
    // 1077 ocorrências. Ex.: `Pix recebido: "Cp :99999999-CLIENTE EXEMPLO"`
    test: /^pix\s+recebido/i,
    example: 'Pix recebido: "Cp :99999999-CLIENTE EXEMPLO"',
  },
  {
    category: 'repasse_adquirente',
    // 490. Repasse da maquininha do próprio banco. Ex.: "CARTAO DE DEBITO - INTER PAG",
    // "ANTECIPACAO - INTER PAG". A venda ocorreu ANTES: é dinheiro de cartão caindo.
    test: /credito\s+domicilio\s+cartao|inter\s*pag|antecipacao/i,
    example: 'Credito domicilio cartao: "CARTAO DE DEBITO - INTER PAG"',
  },
  {
    category: 'estorno',
    test: /estorno|devolu[cç][aã]o/i,
    example: 'Estorno de Pix',
  },
  {
    category: 'conta_consumo',
    // 23. "Pagamento de Convenio" costuma ser concessionária/boleto de consumo,
    // mas o texto não diz qual — ambíguo.
    test: /pagamento\s+de\s+convenio/i,
    ambiguous: true,
    example: 'Pagamento de Convenio',
  },
  {
    category: 'fornecedor',
    // 429. "Pagamento efetuado" = boleto/título a um fornecedor nomeado.
    test: /^pagamento\s+efetuado/i,
    example: 'Pagamento efetuado: "FORNECEDOR EXEMPLO LTDA"',
  },
  {
    category: 'fornecedor',
    // 369. "Pix enviado" — quase sempre fornecedor, mas pode ser retirada/pessoal.
    test: /^pix\s+enviado/i,
    ambiguous: true,
    example: 'Pix enviado: "Cp :99999999-FORNECEDOR EXEMPLO"',
  },
  {
    category: 'transferencia',
    // 6. Pode ser aporte do dono ou conta própria — não é receita de venda.
    test: /transferencia\s+recebida/i,
    ambiguous: true,
    example: 'Transferencia recebida',
  },
];

/**
 * Santander — varejo de roupa. Movimento dominado por repasse de cartão (GETNET)
 * e pagamento de títulos a fornecedores. Descrições costumam vir em CAIXA ALTA
 * e às vezes quebradas em linhas (o parser junta antes de chamar aqui).
 */
const SANTANDER_RULES: Rule[] = [
  {
    category: 'repasse_adquirente',
    // Centenas. "PAGAMENTO CARTAO DE CREDITO/DEBITO GETNET-VISA/MASTER/ELO/AMEX/MAESTRO".
    test: /pagamento\s+cartao\s+de\s+(credito|debito)|getnet/i,
    example: 'PAGAMENTO CARTAO DE DEBITO GETNET-MAESTRO',
  },
  {
    category: 'tarifa_bancaria',
    // 84 "TARIFA PIX RECEBIDO QR CHECKOUT" + "TAR PIX PGTO FORNEC" etc. Custo fixo
    // operacional do banco.
    test: /^tarifa|^tar\s|tarifa\s+pix|tar\s+pix/i,
    costType: 'fixed',
    example: 'TARIFA PIX RECEBIDO QR CHECKOUT',
  },
  {
    category: 'folha_salario',
    // "DEBITO PAGAMENTO DE SALARIO" + "AGSAL:". Custo fixo.
    test: /pagamento\s+de\s+salario|^agsal|debito\s+pagamento\s+de\s+salario/i,
    costType: 'fixed',
    example: 'DEBITO PAGAMENTO DE SALARIO',
  },
  {
    category: 'imposto',
    // "DAS" (Simples Nacional) e "PGTO FORNECEDORES - TRIB FEDERAIS".
    test: /\bdas\b|trib\.?\s*fede|tributos?\s+federa/i,
    costType: 'fixed',
    example: 'DAS - Simples Nacional',
  },
  {
    category: 'estorno',
    // 51 "DEVOLUCAO DE PIX NAO EFETUADO" — inverte um PIX que não se concretizou.
    test: /devolu[cç][aã]o\s+de\s+pix|estorno/i,
    example: 'DEVOLUCAO DE PIX NAO EFETUADO',
  },
  {
    category: 'venda_pix',
    test: /pix\s+recebido/i,
    example: 'PIX RECEBIDO 00000000000000000',
  },
  {
    category: 'fornecedor',
    // "PAGAMENTO DE TITULO", "TIT", "PAGFOR PIX ... FORNEC", "PGTO FORNEC TIT".
    test: /pagamento\s+de\s+titulo|pgto\s+fornec|pagfor\s+pix|\btit\b|fornecedores/i,
    example: 'PAGAMENTO DE TITULO',
  },
];

const RULES_BY_BANK = { inter: INTER_RULES, santander: SANTANDER_RULES } as const;
export type BankKey = keyof typeof RULES_BY_BANK;

/**
 * Categoriza uma descrição de extrato. `signedCents` (o valor com sinal) só é
 * usado para desempate de sentido; a categoria em si vem do texto. Determinístico
 * e sem estado: a mesma entrada dá sempre a mesma saída.
 */
export function categorize(bank: BankKey, description: string, signedCents: number): CategoryResult {
  const desc = description.normalize('NFC');
  for (const rule of RULES_BY_BANK[bank]) {
    if (rule.test.test(desc)) {
      const result: CategoryResult = { category: rule.category };
      if (rule.costType) result.costType = rule.costType;
      if (rule.ambiguous) result.ambiguous = true;
      // Estorno inverte o sentido natural do sinal.
      if (rule.category === 'estorno') {
        result.kindOverride = signedCents >= 0 ? 'receivable' : 'payable';
      }
      return result;
    }
  }
  return { category: 'nao_classificado', ambiguous: true };
}

/** Categorias que representam ENTRADA de dinheiro de venda (receita de caixa). */
export function isRevenueCategory(c: CanonicalCategory): boolean {
  return c === 'venda_pix' || c === 'repasse_adquirente';
}
