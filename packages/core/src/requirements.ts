/**
 * Pulso core — requisitos de dado de cada indicador e de cada regra.
 *
 * ENGENHARIA DE COLETA (declarativa e aditiva). Este arquivo NÃO calcula nada e
 * NÃO altera fórmula, limiar ou critério de suficiência. Ele apenas DECLARA, ao
 * lado do motor, quais campos canônicos cada número precisa — para nunca sair de
 * sincronia com `indicators.ts` / `rules.ts`.
 *
 * Campo canônico = coluna do schema de lançamentos (`entries`), do saldo
 * (`cash_balances`) ou o custo fixo declarado (`companies.declared_fixed_cost_cents`).
 * Nada aqui inventa dado novo; se um indicador precisa de algo que NÃO existe no
 * schema canônico, isso é registrado explicitamente como `gaps` (lacuna).
 */

/** Os campos que o motor sabe consumir. Espelham o schema canônico. */
export type CanonicalField =
  | 'entry.kind' // tipo do lançamento (a receber / a pagar)
  | 'entry.amount' // valor
  | 'entry.issuedOn' // data de emissão / competência (quando a venda/compra aconteceu)
  | 'entry.dueOn' // data de vencimento
  | 'entry.settledOn' // data de liquidação (ou em aberto)
  | 'entry.counterparty' // contraparte (cliente / fornecedor)
  | 'entry.category' // categoria crua do lançamento
  | 'entry.costType' // natureza do custo (fixo / variável)
  | 'balance.observed' // saldo bancário observado (com a data da leitura)
  | 'declared.fixedCost'; // custo fixo mensal declarado no onboarding

export interface CanonicalFieldMeta {
  /** Nome em linguagem de negócio (para o documento do especialista). */
  label: string;
  /** Explicação curta, sem jargão de código. */
  description: string;
}

export const CANONICAL_FIELDS: Record<CanonicalField, CanonicalFieldMeta> = {
  'entry.kind': {
    label: 'Tipo do lançamento (a receber ou a pagar)',
    description: 'Se aquele valor é dinheiro que entra (venda) ou que sai (conta a pagar).',
  },
  'entry.amount': {
    label: 'Valor do lançamento',
    description: 'Quanto é, em reais, cada venda ou conta.',
  },
  'entry.issuedOn': {
    label: 'Data da venda ou da compra (competência)',
    description: 'O dia em que o negócio aconteceu — não o dia em que o dinheiro entrou ou saiu.',
  },
  'entry.dueOn': {
    label: 'Data de vencimento',
    description: 'O dia combinado para receber ou pagar.',
  },
  'entry.settledOn': {
    label: 'Data em que foi pago ou recebido',
    description: 'O dia em que o dinheiro efetivamente entrou ou saiu (em branco = ainda em aberto).',
  },
  'entry.counterparty': {
    label: 'Cliente ou fornecedor do lançamento',
    description: 'Quem pagou ou vai pagar — necessário para saber se um cliente concentra as vendas.',
  },
  'entry.category': {
    label: 'Categoria do lançamento',
    description: 'A classificação que veio do sistema de origem (ex.: aluguel, material, serviço).',
  },
  'entry.costType': {
    label: 'Natureza do custo: fixo ou variável',
    description: 'Se aquela conta é um custo fixo (que existe todo mês) ou variável (que acompanha a venda).',
  },
  'balance.observed': {
    label: 'Saldo em conta, com a data da leitura',
    description: 'Quanto o negócio tem no banco hoje. Não dá para deduzir com segurança das vendas.',
  },
  'declared.fixedCost': {
    label: 'Custo fixo mensal informado pelo dono',
    description: 'Quanto sai de custo fixo por mês, quando o dono declara em vez de deixar o sistema deduzir.',
  },
};

export type Necessity = 'required' | 'optional';

/** Uma lacuna: campo que o indicador precisaria e que NÃO existe no schema canônico. */
export interface Gap {
  /** O que falta, em linguagem de negócio. */
  note: string;
  /** Quando a lacuna só aparece em um contexto (ex.: comércio com estoque). */
  context?: string;
}

export interface Requirement {
  /** Bate com o `key` do indicador ou o `ruleKey` da regra no código. */
  key: string;
  kind: 'indicator' | 'rule';
  /** A pergunta que ele responde ao dono, em linguagem de negócio. */
  question: string;
  /** Campos obrigatórios: sem qualquer um deles, o número não existe (ou não tem sentido). */
  required: CanonicalField[];
  /** Campos opcionais: melhoram a precisão, não impedem o cálculo. */
  optional: CanonicalField[];
  /**
   * Grupos alternativos: basta UM grupo estar inteiro presente.
   * Ex.: custo fixo pode vir DERIVADO dos lançamentos OU DECLARADO pelo dono.
   */
  anyOf?: CanonicalField[][];
  /** Regras: indicadores dos quais dependem (os campos são herdados deles). */
  dependsOnIndicators?: string[];
  /** O que acontece com o número quando cada campo falta (negócio). */
  whenMissing?: Partial<Record<CanonicalField, string>>;
  /** Campos necessários que NÃO existem no schema canônico (lacunas declaradas). */
  gaps?: Gap[];
}

// ---------------------------------------------------------------
// Indicadores — os requisitos vivem ao lado da fórmula (mesmo `key`).
// Nada abaixo altera cálculo: é só a declaração do que cada um consome.
// ---------------------------------------------------------------

const INDICATOR_REQUIREMENTS: Requirement[] = [
  {
    key: 'cash_balance',
    kind: 'indicator',
    question: 'Quanto você tem em caixa agora?',
    required: ['balance.observed'],
    optional: [],
    whenMissing: {
      'balance.observed': 'Sem o saldo em conta, não há como dizer quanto há em caixa.',
    },
  },
  {
    key: 'cash_projection',
    kind: 'indicator',
    question: 'Como seu caixa vai evoluir nos próximos 30, 60 e 90 dias?',
    // O cálculo só bloqueia sem o saldo. Todo o resto refina a projeção.
    required: ['balance.observed'],
    optional: [
      'entry.kind',
      'entry.amount',
      'entry.dueOn',
      'entry.settledOn',
      'entry.issuedOn',
      'entry.costType',
      'declared.fixedCost',
    ],
    whenMissing: {
      'balance.observed': 'Sem o saldo atual, não há de onde projetar: a projeção fica indisponível.',
      'entry.dueOn': 'Sem os vencimentos, a projeção usa só o saldo e o custo fixo (menos precisa).',
      'entry.settledOn': 'Sem o histórico de pagamentos, não dá para prever o atraso real dos clientes.',
    },
  },
  {
    key: 'pmr',
    kind: 'indicator',
    question: 'Em quantos dias, em média, você recebe depois de vender?',
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.settledOn'],
    optional: [],
    whenMissing: {
      'entry.issuedOn': 'Sem a data da venda, não dá para medir quanto tempo levou até receber.',
      'entry.settledOn': 'Sem a data do recebimento, não dá para medir o prazo real.',
    },
  },
  {
    key: 'pmp',
    kind: 'indicator',
    question: 'Em quantos dias, em média, você paga seus fornecedores?',
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.settledOn'],
    optional: [],
    whenMissing: {
      'entry.issuedOn': 'Sem a data da compra, não dá para medir quanto tempo levou até pagar.',
      'entry.settledOn': 'Sem a data do pagamento, não dá para medir o prazo real.',
    },
  },
  {
    key: 'cash_cycle',
    kind: 'indicator',
    question: 'Quanto tempo seu dinheiro fica preso na operação?',
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.settledOn'],
    optional: [],
    gaps: [
      {
        note: 'O prazo médio de estocagem e o custo da mercadoria não existem no cadastro de lançamentos.',
        context: 'Comércio com estoque (loja, restaurante). Na clínica, sem estoque, não é necessário.',
      },
    ],
  },
  {
    key: 'ncg',
    kind: 'indicator',
    question: 'Quanto de dinheiro a operação precisa para funcionar (capital de giro)?',
    required: ['entry.kind', 'entry.amount', 'entry.settledOn'],
    optional: [],
    whenMissing: {
      'entry.settledOn': 'Sem saber o que já foi pago, não dá para separar o que ainda está em aberto.',
    },
  },
  {
    key: 'revenue_current',
    kind: 'indicator',
    question: 'Quanto você faturou no período mais recente?',
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn'],
    optional: [],
    whenMissing: {
      'entry.issuedOn': 'Sem a data da venda, não dá para somar o faturamento do período certo.',
    },
  },
  {
    key: 'revenue_previous',
    kind: 'indicator',
    question: 'Quanto você faturou no período anterior (para comparar)?',
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn'],
    optional: [],
    whenMissing: {
      'entry.issuedOn': 'Sem a data da venda, não dá para somar o faturamento do período anterior.',
    },
  },
  {
    key: 'contribution_margin',
    kind: 'indicator',
    question: 'Quanto sobra de cada real vendido, depois dos custos que variam com a venda?',
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.costType'],
    optional: [],
    whenMissing: {
      'entry.costType':
        'Sem separar custo fixo de variável, a margem sai superestimada (trata todo custo como fixo).',
    },
  },
  {
    key: 'fixed_cost_monthly',
    kind: 'indicator',
    question: 'Quanto sai de custo fixo todo mês?',
    required: [],
    optional: [],
    // Dois caminhos: derivar dos lançamentos classificados OU usar o valor declarado.
    anyOf: [
      ['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.costType'],
      ['declared.fixedCost'],
    ],
    whenMissing: {
      'entry.costType': 'Sem a classificação fixo/variável, o custo fixo só existe se o dono declarar.',
      'declared.fixedCost': 'Sem declaração, o custo fixo só existe se os lançamentos vierem classificados.',
    },
  },
  {
    key: 'customer_concentration',
    kind: 'indicator',
    question: 'O quanto do seu faturamento depende de um único cliente?',
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.counterparty'],
    optional: [],
    whenMissing: {
      'entry.counterparty':
        'Sem identificar o cliente de cada venda, não dá para medir concentração (típico do varejo de balcão).',
    },
  },
  {
    key: 'break_even_revenue',
    kind: 'indicator',
    question: 'Quanto você precisa faturar por mês só para empatar?',
    // Derivado de custo fixo + margem; a classificação fixo/variável cobre os dois.
    required: ['entry.kind', 'entry.amount', 'entry.issuedOn', 'entry.costType'],
    optional: [],
    whenMissing: {
      'entry.costType':
        'Sem separar custo fixo de variável, não dá para calcular custo fixo nem margem — e o ponto de equilíbrio depende dos dois.',
    },
  },
  {
    key: 'delinquency_rate',
    kind: 'indicator',
    question: 'Quanto da sua carteira a receber está atrasada e pode não entrar?',
    required: ['entry.kind', 'entry.amount', 'entry.settledOn', 'entry.dueOn'],
    optional: [],
    whenMissing: {
      'entry.dueOn': 'Sem a data de vencimento, não dá para saber o que está atrasado.',
      'entry.settledOn': 'Sem saber o que já foi recebido, não dá para isolar a carteira em aberto.',
    },
  },
];

// ---------------------------------------------------------------
// Regras de alerta — herdam os campos dos indicadores que consomem.
// ---------------------------------------------------------------

const RULE_REQUIREMENTS: Requirement[] = [
  {
    key: 'cash_runway',
    kind: 'rule',
    question: 'Aviso: seu caixa tende a zerar antes de você ter tempo de reagir.',
    required: [],
    optional: [],
    dependsOnIndicators: ['cash_projection'],
  },
  {
    key: 'scissor',
    kind: 'rule',
    question: 'Aviso: você está vendendo mais, mas o caixa está apertando (efeito tesoura).',
    required: [],
    optional: [],
    dependsOnIndicators: ['revenue_current', 'revenue_previous', 'ncg'],
  },
  {
    key: 'revenue_drop_fixed_cost',
    kind: 'rule',
    question: 'Aviso: sua receita caiu e o custo fixo continuou.',
    required: [],
    optional: [],
    dependsOnIndicators: ['revenue_current', 'revenue_previous', 'fixed_cost_monthly'],
  },
  {
    key: 'concentration',
    kind: 'rule',
    question: 'Aviso: um único cliente concentra boa parte do seu faturamento.',
    required: [],
    optional: [],
    dependsOnIndicators: ['customer_concentration'],
  },
  {
    key: 'all_clear',
    kind: 'rule',
    question: 'Tudo sob controle: nenhum sinal de risco no caixa.',
    required: [],
    optional: [],
    // Só dispara quando nenhuma outra regra disparou; não exige campo próprio.
    dependsOnIndicators: [],
  },
];

export const REQUIREMENTS: Requirement[] = [...INDICATOR_REQUIREMENTS, ...RULE_REQUIREMENTS];

export function getRequirement(key: string): Requirement | undefined {
  return REQUIREMENTS.find((r) => r.key === key);
}

export function indicatorRequirements(): Requirement[] {
  return INDICATOR_REQUIREMENTS;
}

export function ruleRequirements(): Requirement[] {
  return RULE_REQUIREMENTS;
}

/**
 * Expande os requisitos EFETIVOS de uma requirement (resolvendo regras que
 * herdam de indicadores) numa forma simples de checar cobertura.
 */
export interface EffectiveRequirement {
  required: CanonicalField[];
  optional: CanonicalField[];
  anyOf: CanonicalField[][];
  gaps: Gap[];
}

export function effectiveRequirement(key: string): EffectiveRequirement {
  const req = getRequirement(key);
  if (!req) return { required: [], optional: [], anyOf: [], gaps: [] };

  const requiredSet = new Set<CanonicalField>(req.required);
  const optionalSet = new Set<CanonicalField>(req.optional);
  const anyOf: CanonicalField[][] = req.anyOf ? req.anyOf.map((g) => [...g]) : [];
  const gaps: Gap[] = req.gaps ? [...req.gaps] : [];

  for (const depKey of req.dependsOnIndicators ?? []) {
    const dep = getRequirement(depKey);
    if (!dep) continue;
    for (const f of dep.required) requiredSet.add(f);
    for (const f of dep.optional) optionalSet.add(f);
    if (dep.anyOf) for (const g of dep.anyOf) anyOf.push([...g]);
    if (dep.gaps) for (const g of dep.gaps) gaps.push(g);
  }

  // um campo obrigatório nunca conta também como opcional
  for (const f of requiredSet) optionalSet.delete(f);

  return {
    required: [...requiredSet],
    optional: [...optionalSet],
    anyOf,
    gaps,
  };
}
