/**
 * Pulso core — fontes de dado e a cobertura DECLARADA de cada uma.
 *
 * Metadados, não caminho de execução. O core continua sem saber de onde o dado
 * veio; esta camada só descreve QUAIS campos canônicos cada fonte consegue
 * popular e com que confiabilidade. Nenhum parser é implementado aqui.
 *
 * Serve para responder, no papel e no painel: "para destravar este indicador,
 * qual fonte precisamos ligar?".
 */

import { CANONICAL_FIELDS, effectiveRequirement, type CanonicalField } from './requirements';

/** Quão bem uma fonte entrega um campo. */
export type Reliability =
  | 'direct' // vem pronto e confiável
  | 'inferred' // dá para deduzir, com ressalva
  | 'unavailable'; // a fonte não tem esse dado

/**
 * Alcance da fonte — decide o que é "automatizável de forma reaproveitável".
 *  - owner: depende do dono informar (não é automático).
 *  - broad: uma integração serve muitos clientes (banco, maquininha, NF-e...).
 *  - per_client: exige integrar o sistema específico de cada cliente (ERP).
 */
export type SourceReach = 'owner' | 'broad' | 'per_client';

export type SourceId =
  | 'manual'
  | 'bank_statement'
  | 'erp_export'
  | 'nfe'
  | 'card_acquirer'
  | 'open_finance';

export interface DataSource {
  id: SourceId;
  label: string;
  description: string;
  reach: SourceReach;
  /** Já existe no produto? (declaração de estado, não de capacidade). */
  implemented: boolean;
  /** Campos que a fonte consegue popular, com a confiabilidade de cada um. */
  coverage: Partial<Record<CanonicalField, Reliability>>;
}

export const SOURCES: DataSource[] = [
  {
    id: 'manual',
    label: 'Declaração do próprio dono',
    description: 'O dono informa o saldo, o custo fixo e cadastra as contas a pagar e a receber.',
    reach: 'owner',
    implemented: true,
    coverage: {
      'balance.observed': 'direct',
      'declared.fixedCost': 'direct',
      'entry.kind': 'direct',
      'entry.amount': 'direct',
      'entry.dueOn': 'direct',
      'entry.settledOn': 'inferred',
      'entry.issuedOn': 'inferred',
      'entry.counterparty': 'inferred',
      'entry.costType': 'inferred',
    },
  },
  {
    id: 'bank_statement',
    // Provado com arquivos reais: parsers de OFX e de PDF (Inter, Santander).
    label: 'Extrato bancário (arquivo OFX, CSV ou PDF)',
    description:
      'O que entrou e saiu da conta, com a data em que o dinheiro se moveu e o saldo. ' +
      'OFX é a porta robusta; o PDF funciona, mas é frágil (ver docs/COBERTURA-REAL.md). ' +
      'NÃO traz a data da venda/compra (competência) nem o vencimento: só a liquidação.',
    reach: 'broad',
    implemented: true,
    coverage: {
      'balance.observed': 'direct', // saldo corrido, alta confiança
      'entry.amount': 'direct',
      'entry.settledOn': 'direct', // a data do movimento é o que o banco sabe
      'entry.kind': 'inferred', // do sinal + descrição
      'entry.counterparty': 'inferred', // Inter nomeia; varejo de balcão (Santander) não
      'entry.category': 'inferred', // regras determinísticas sobre a descrição
    },
  },
  {
    id: 'erp_export',
    // Provado com arquivos reais: relatórios do Linx Microvix (faturamento, movimento,
    // giro, inventário) exportados como HTML.
    label: 'Relatório do sistema de gestão / ERP / PDV (ex.: Linx Microvix)',
    description:
      'O sistema onde o negócio registra vendas, estoque e (em geral) contas — a fonte ' +
      'mais completa. O DIFERENCIAL sobre o extrato é a data de EMISSÃO (competência) e o ' +
      'estoque/CMV. Ressalva do que foi exportado na prática: os relatórios de VENDA não ' +
      'nomeiam o cliente (varejo de balcão = "consumidor final") e não trazem as CONTAS A ' +
      'PAGAR — estas viriam de outro relatório do mesmo sistema.',
    reach: 'per_client',
    implemented: true,
    coverage: {
      'entry.kind': 'direct',
      'entry.amount': 'direct',
      'entry.issuedOn': 'direct', // competência — o que o extrato não tem
      'entry.dueOn': 'direct',
      'entry.settledOn': 'inferred', // a venda dá a forma de pagamento, não a data exata do recebimento
      'entry.counterparty': 'inferred', // varejo de balcão não identifica o cliente
      'entry.category': 'direct',
      'entry.costType': 'inferred',
    },
  },
  {
    id: 'nfe',
    label: 'Nota fiscal eletrônica',
    description: 'Documentos de venda e compra: valor, data de emissão e a contraparte.',
    reach: 'broad',
    implemented: false,
    coverage: {
      'entry.amount': 'direct',
      'entry.issuedOn': 'direct',
      'entry.counterparty': 'direct',
      'entry.kind': 'inferred',
      'entry.category': 'inferred',
    },
  },
  {
    id: 'card_acquirer',
    label: 'Maquininha de cartão (adquirente)',
    description: 'As vendas no cartão e a agenda de recebíveis: o que já vendeu e ainda vai cair.',
    reach: 'broad',
    implemented: false,
    coverage: {
      'entry.kind': 'direct',
      'entry.amount': 'direct',
      'entry.issuedOn': 'direct',
      'entry.dueOn': 'direct',
      'entry.settledOn': 'direct',
      'entry.category': 'inferred',
    },
  },
  {
    id: 'open_finance',
    label: 'Open Finance (via agregador autorizado)',
    description: 'Conexão automática com o banco: saldo e movimentações, sem arquivo.',
    reach: 'broad',
    implemented: false,
    coverage: {
      'balance.observed': 'direct',
      'entry.amount': 'direct',
      'entry.settledOn': 'direct',
      'entry.kind': 'inferred',
      'entry.counterparty': 'inferred',
      'entry.category': 'inferred',
    },
  },
];

export function getSource(id: SourceId): DataSource | undefined {
  return SOURCES.find((s) => s.id === id);
}

/** Fontes que conseguem popular um campo (direct ou inferred), do melhor ao pior. */
export function sourcesForField(field: CanonicalField): SourceId[] {
  const order: Record<Reliability, number> = { direct: 0, inferred: 1, unavailable: 2 };
  return SOURCES.filter((s) => {
    const r = s.coverage[field];
    return r === 'direct' || r === 'inferred';
  })
    .sort((a, b) => order[a.coverage[field]!] - order[b.coverage[field]!])
    .map((s) => s.id);
}

/**
 * Um campo é "coberto por fonte ampla" quando alguma fonte de alcance `broad`
 * (integração reaproveitável entre clientes) consegue populá-lo. Campos fora
 * disso só vêm do sistema do cliente (ERP) ou da mão do dono — ou seja, exigem
 * integração dedicada.
 */
export function fieldHasBroadSource(field: CanonicalField): boolean {
  return SOURCES.some(
    (s) => s.reach === 'broad' && (s.coverage[field] === 'direct' || s.coverage[field] === 'inferred'),
  );
}

/**
 * Campos que nenhuma fonte AMPLA cobre hoje: só o sistema do próprio cliente
 * (ERP) ou a declaração do dono. São os que vão exigir integração dedicada.
 */
export function fieldsRequiringClientSystem(): CanonicalField[] {
  return (Object.keys(CANONICAL_FIELDS) as CanonicalField[]).filter((f) => !fieldHasBroadSource(f));
}

/**
 * Enriquecimento declarativo para a degradação elegante dos indicadores
 * (reaproveita as declarações de `requirements.ts`). Dado o `key` de um
 * indicador/regra, devolve os campos que ele precisa e as fontes que os
 * forneceriam. NÃO decide nada sobre o cálculo.
 */
export interface NeedHint {
  fields: CanonicalField[];
  sources: SourceId[];
}

export function explainNeed(key: string): NeedHint {
  const eff = effectiveRequirement(key);
  // campos que precisam existir (obrigatórios + o "mais fácil" de cada anyOf)
  const fields = new Set<CanonicalField>(eff.required);
  for (const group of eff.anyOf) for (const f of group) fields.add(f);

  const sources = new Set<SourceId>();
  for (const f of fields) for (const s of sourcesForField(f)) sources.add(s);

  return { fields: [...fields], sources: [...sources] };
}
