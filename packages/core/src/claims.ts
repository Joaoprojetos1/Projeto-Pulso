/**
 * Pulso core — REQUISITOS DE JUÍZO.
 *
 * O problema que este arquivo resolve (apontado pelo especialista): o fiscal de
 * números (`grounding`) confere se os NÚMEROS citados são verdadeiros, mas não se
 * a CONCLUSÃO é sustentável. Dizer que o caixa "está bom" tendo recebido só o
 * saldo — sem as contas a pagar e a receber — é um número verdadeiro sustentando
 * um juízo que os dados não autorizam. São coisas diferentes.
 *
 * Aqui declaramos, de forma DETERMINÍSTICA e auditável, um catálogo de TIPOS DE
 * AFIRMAÇÃO que o produto pode fazer, cada um com os dados mínimos que o
 * autorizam. `allowedClaims(evidence)` devolve, para uma empresa, o que pode e o
 * que NÃO pode ser afirmado — cada negativa com o motivo em linguagem de dono.
 *
 * PURO: sem I/O, sem IA. A IA nunca decide o que pode afirmar; ela recebe esta
 * lista pronta. Este é o ativo auditável do produto, ao lado das fórmulas.
 *
 * Decisão de modelagem (registrada de propósito): os requisitos NÃO são só
 * "campos canônicos presentes" (como em `coverage.ts`), mas EVIDÊNCIAS
 * semânticas — porque a presença de um campo não distingue "tenho contas a pagar
 * mas não a receber". O caso real que motivou tudo ("está bom" só com o saldo)
 * exige exatamente essa granularidade: saldo ≠ saldo + saídas futuras ≠ saldo +
 * saídas + entradas futuras.
 */

import type { CompanySnapshot } from './types';

// ---------------------------------------------------------------
// Evidências: os "insumos de juízo" que uma empresa tem (ou não).
// ---------------------------------------------------------------

/**
 * Cada evidência é um fato binário sobre os dados da empresa — derivado do
 * snapshot de forma determinística (ver `claimEvidenceFromSnapshot`). São os
 * tijolos com que cada afirmação é (ou não) autorizada.
 */
export type EvidenceToken =
  | 'balance' // o saldo atual em conta foi informado
  | 'futurePayables' // há contas a pagar conhecidas (saídas futuras)
  | 'futureReceivables' // há contas a receber conhecidas (entradas futuras)
  | 'settledReceivables' // há recebimentos JÁ liquidados em número suficiente (para prazo)
  | 'revenue' // há vendas registradas no período (faturamento)
  | 'periodCosts' // há custos do período, com natureza (para margem)
  | 'previousPeriod' // há um período anterior com dado (para comparar)
  | 'segmentOps'; // há números operacionais do segmento (glosa, estoque, CMV...)

export type ClaimEvidence = Record<EvidenceToken, boolean>;

/**
 * PREMISSA_V1 (calibrar com o Marco): quantos recebimentos liquidados bastam
 * para o prazo médio de recebimento não ser um chute de uma amostra minúscula.
 */
export const MIN_SETTLED_RECEIVABLES = 5;

/** Motivo, em linguagem de dono, de cada evidência estar FALTANDO. */
export const EVIDENCE_MISSING_REASON: Record<EvidenceToken, string> = {
  balance: 'o saldo em conta ainda não foi informado',
  futurePayables: 'as contas a pagar ainda não foram enviadas',
  futureReceivables: 'as contas a receber ainda não foram enviadas',
  settledReceivables: 'ainda não há recebimentos registrados em número suficiente',
  revenue: 'as vendas do período ainda não foram informadas',
  periodCosts: 'os custos do período ainda não foram informados (ou classificados)',
  previousPeriod: 'ainda não existe um período anterior para comparar',
  segmentOps: 'os números do mês do seu segmento ainda não foram informados',
};

// ---------------------------------------------------------------
// Catálogo de afirmações.
// ---------------------------------------------------------------

export type ClaimType =
  | 'cash_health' // avaliar a saúde do caixa (bom, apertado, saudável, preocupante)
  | 'cash_zero_date' // afirmar data de risco / de zeragem do caixa
  | 'margin' // avaliar a margem
  | 'receivable_term' // avaliar o prazo de recebimento (PMR)
  | 'period_comparison' // comparar com o período anterior
  | 'segment_operational'; // avaliar estoque, glosa, CMV (dado operacional do segmento)

/** Prioridade da recomendação quando o juízo está bloqueado (item 4). */
export type ClaimPriority = 'alta' | 'media' | 'baixa';

export interface ClaimSpec {
  type: ClaimType;
  /** O verbo do juízo, para compor frases ("não é possível <label>"). */
  label: string;
  /** Evidências mínimas que autorizam a afirmação. Faltando uma, é proibido. */
  requires: EvidenceToken[];
  /**
   * Termos avaliativos (adjetivos/comparativos) que EXPRESSAM este juízo. O
   * verificador (apps/api) usa esta lista para detectar quando um texto está
   * adjetivando algo que não foi autorizado. Minúsculas, sem acento sensível
   * (o verificador normaliza). É catálogo determinístico, não "gosto".
   */
  evaluativeTerms: string[];
  /** Por que este juízo importa (para o alerta de informação faltante). */
  whyItMatters: string;
  /** O que o dono precisa fazer para destravar o juízo. */
  action: string;
  /** Peso da falta, quando bloqueada. */
  priority: ClaimPriority;
}

/**
 * O catálogo. Começa pelo mínimo pedido na revisão do especialista; é ADITIVO —
 * novo tipo de afirmação entra aqui, declarando suas evidências.
 */
export const CLAIMS: ClaimSpec[] = [
  {
    type: 'cash_health',
    label: 'avaliar a saúde do caixa',
    requires: ['balance', 'futurePayables', 'futureReceivables'],
    evaluativeTerms: [
      'saudavel',
      'esta bom',
      'esta boa',
      'esta bem',
      'vai bem',
      'tranquil',
      'sob controle',
      'confortavel',
      'folga',
      'apertado',
      'apertada',
      'preocupante',
      'delicad',
      'sob pressao',
      'no vermelho',
      'no azul',
      'estavel',
      'equilibrad',
      'solid',
      'no positivo',
      'no negativo',
    ],
    whyItMatters:
      'Dizer que o caixa "está bom" olhando só o saldo esconde as contas que ainda vão vencer. ' +
      'É a diferença entre ter dinheiro hoje e ter dinheiro depois de pagar todo mundo.',
    action:
      'Cadastre ou importe as contas a pagar e a receber. Com o saldo e as duas listas, o Pulso ' +
      'passa a dizer, com segurança, se o seu caixa está tranquilo ou apertado.',
    priority: 'alta',
  },
  {
    type: 'cash_zero_date',
    label: 'dizer quando o caixa pode zerar',
    requires: ['balance', 'futurePayables'],
    evaluativeTerms: [
      'vai zerar',
      'pode zerar',
      'zera em',
      'zerar em',
      'caixa acaba',
      'dinheiro acaba',
      'fica negativo',
      'fica no vermelho',
    ],
    whyItMatters: 'Sem as saídas futuras, qualquer data de "quando o dinheiro acaba" seria um chute.',
    action:
      'Envie as contas a pagar dos próximos dias. Com o saldo e as saídas, o Pulso projeta e avisa ' +
      'antes de o caixa apertar.',
    priority: 'alta',
  },
  {
    type: 'margin',
    label: 'avaliar a margem',
    requires: ['revenue', 'periodCosts'],
    evaluativeTerms: [
      'margem boa',
      'boa margem',
      'margem saudavel',
      'margem apertada',
      'margem confortavel',
      'margem baixa',
      'margem alta',
      'margem ruim',
      'margem folgada',
    ],
    whyItMatters:
      'Sem separar o que entra do que custa, não dá para saber se cada venda dá lucro ou prejuízo.',
    action:
      'Informe as vendas e os custos do período (com a natureza fixo/variável). Com os dois, o Pulso ' +
      'diz quanto sobra de cada real vendido.',
    priority: 'media',
  },
  {
    type: 'receivable_term',
    label: 'avaliar o prazo de recebimento',
    requires: ['settledReceivables'],
    evaluativeTerms: [
      'recebe rapido',
      'recebe devagar',
      'recebe bem',
      'prazo bom',
      'prazo ruim',
      'demora a receber',
      'demora demais',
    ],
    whyItMatters: 'Saber em quantos dias você recebe é o que mostra se o dinheiro demora a entrar.',
    action:
      'Registre (ou importe) os recebimentos: o que já foi pago e quando. Com histórico suficiente, ' +
      'o Pulso mede em quantos dias você recebe.',
    priority: 'baixa',
  },
  {
    type: 'period_comparison',
    label: 'comparar com o período anterior',
    requires: ['previousPeriod'],
    evaluativeTerms: [
      'melhorou',
      'piorou',
      'cresceu',
      'caiu',
      'aumentou',
      'diminuiu',
      'melhor que o mes',
      'pior que o mes',
      'desde o mes passado',
      'em relacao ao periodo anterior',
      'na comparacao',
    ],
    whyItMatters: 'Comparar com o período anterior é o que revela a tendência: melhorando ou piorando.',
    action:
      'Assim que houver um segundo período com dados, o Pulso compara os dois e mostra o que melhorou ' +
      'ou piorou.',
    priority: 'baixa',
  },
  {
    type: 'segment_operational',
    label: 'avaliar a operação do seu segmento (estoque, glosa, custo da mercadoria)',
    requires: ['segmentOps'],
    evaluativeTerms: [
      'estoque parado',
      'giro bom',
      'giro baixo',
      'giro alto',
      'glosa alta',
      'glosa baixa',
      'cmv alto',
      'cmv baixo',
      'custo da comida alto',
      'ocupacao baixa',
    ],
    whyItMatters:
      'Os números do seu segmento mostram problemas que o extrato não vê: estoque parado, glosa dos ' +
      'convênios, custo da mercadoria.',
    action:
      'Informe os números do mês do seu segmento (ex.: estoque, glosa, CMV) para o Pulso avaliar a ' +
      'operação, não só o caixa.',
    priority: 'media',
  },
];

export function getClaim(type: ClaimType): ClaimSpec {
  const c = CLAIMS.find((c) => c.type === type);
  if (!c) throw new Error(`Afirmação desconhecida: ${type}`);
  return c;
}

// ---------------------------------------------------------------
// A resposta principal: o que pode e o que NÃO pode ser afirmado.
// ---------------------------------------------------------------

export interface ClaimPermission {
  type: ClaimType;
  label: string;
  allowed: boolean;
  /** Evidências que faltaram (vazio quando `allowed`). */
  missing: EvidenceToken[];
  /**
   * Motivo em linguagem de dono, presente só quando NÃO autorizado. Ex.:
   * "não é possível avaliar a saúde do caixa porque as contas a pagar ainda não
   * foram enviadas".
   */
  reason: string | null;
}

/** Junta os motivos de cada evidência faltante numa frase de dono. */
function reasonFor(spec: ClaimSpec, missing: EvidenceToken[]): string {
  const partes = missing.map((t) => EVIDENCE_MISSING_REASON[t]);
  const motivo =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  return `Não é possível ${spec.label} porque ${motivo}.`;
}

/**
 * Função PURA. A partir das evidências de uma empresa (a "cobertura de juízo"),
 * devolve o que pode e o que não pode ser afirmado. Cada negativa traz o motivo.
 *
 * `evidence` é a cobertura: quais insumos de juízo a empresa tem. Derivável do
 * snapshot com `claimEvidenceFromSnapshot`, ou montada à mão nos testes.
 */
export function allowedClaims(evidence: ClaimEvidence): ClaimPermission[] {
  return CLAIMS.map((spec) => {
    const missing = spec.requires.filter((t) => !evidence[t]);
    const allowed = missing.length === 0;
    return {
      type: spec.type,
      label: spec.label,
      allowed,
      missing,
      reason: allowed ? null : reasonFor(spec, missing),
    };
  });
}

/** Conveniência: só os tipos autorizados. */
export function allowedClaimTypes(evidence: ClaimEvidence): ClaimType[] {
  return allowedClaims(evidence)
    .filter((p) => p.allowed)
    .map((p) => p.type);
}

// ---------------------------------------------------------------
// Alerta de informação faltante (item 4): recomendação de gestão.
// ---------------------------------------------------------------

/**
 * Uma recomendação determinística: o que falta, por que importa e o que fazer.
 * Não basta apontar a falta — orienta a ação. Vira histórico consultável
 * (a API grava com data em tabela própria).
 */
export interface MissingInfoRecommendation {
  claimType: ClaimType;
  priority: ClaimPriority;
  /** O que falta, em uma linha. */
  title: string;
  /** Por que isso importa. */
  why: string;
  /** O que o dono precisa fazer. */
  action: string;
  /** As evidências que faltam (para a API/telas, se quiserem detalhar). */
  missing: EvidenceToken[];
}

const PRIORITY_RANK: Record<ClaimPriority, number> = { alta: 0, media: 1, baixa: 2 };

/**
 * A partir das evidências, gera as recomendações para os juízos que ficaram
 * BLOQUEADOS. Ordenadas por prioridade (o caixa antes do resto). Determinístico.
 */
export function missingInfoRecommendations(evidence: ClaimEvidence): MissingInfoRecommendation[] {
  return allowedClaims(evidence)
    .filter((p) => !p.allowed)
    .map((p) => {
      const spec = getClaim(p.type);
      return {
        claimType: p.type,
        priority: spec.priority,
        title: capitalize(`${spec.label} ainda não é possível`),
        why: spec.whyItMatters,
        action: spec.action,
        missing: p.missing,
      };
    })
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------
// Derivação a partir dos dados reais (determinística).
// ---------------------------------------------------------------

/**
 * Deriva as evidências de juízo a partir do snapshot da empresa. Determinístico
 * e puro: mesma entrada, mesma saída. Conveniência para a API e os testes; a
 * função pura `allowedClaims` é o contrato de verdade.
 *
 * Regras de derivação (auditáveis):
 *  - saldo: existe alguma leitura de saldo.
 *  - saídas futuras conhecidas (`futurePayables`): há CONHECIMENTO das saídas —
 *    conta a pagar em aberto ou prevista, custo fixo declarado, OU histórico de
 *    pagáveis (o padrão de gasto que a projeção usa). O caso do BUG é o oposto:
 *    NENHUM sinal de saída, só o saldo. Idem para as entradas (`futureReceivables`).
 *    Não basta ter só um lado: sem entradas E saídas não se avalia a saúde.
 *  - recebimentos liquidados suficientes: pelo menos MIN_SETTLED_RECEIVABLES
 *    recebíveis já liquidados (senão o prazo médio é ruído).
 *  - receita: existe alguma venda registrada.
 *  - custos do período: existe algum lançamento com a natureza do custo.
 *  - período anterior: existe lançamento datado em um mês anterior ao do asOf.
 *  - dado operacional do segmento: a empresa tem segmento E números do mês.
 *
 * PREMISSA_V1 (calibrar com o Marco): "conhecer as saídas" aceita o HISTÓRICO de
 * pagáveis como padrão de gasto, não só contas em aberto. Uma empresa com meses
 * de pagamentos registrados não está cega ao futuro; a "só saldo" está.
 */
export function claimEvidenceFromSnapshot(snap: CompanySnapshot): ClaimEvidence {
  const entries = snap.entries;
  const planned = snap.planned ?? [];

  const anyPayable = entries.some((e) => e.kind === 'payable');
  const anyReceivable = entries.some((e) => e.kind === 'receivable');
  const plannedPayable = planned.some((p) => p.kind === 'payable');
  const plannedReceivable = planned.some((p) => p.kind === 'receivable');
  const declaredFixedCost = snap.declaredFixedCostCents != null;

  const settledReceivablesCount = entries.filter(
    (e) => e.kind === 'receivable' && e.settledOn != null,
  ).length;

  const currentMonth = snap.asOf.slice(0, 7); // 'YYYY-MM'

  return {
    balance: snap.balances.length > 0,
    futurePayables: anyPayable || plannedPayable || declaredFixedCost,
    futureReceivables: anyReceivable || plannedReceivable,
    settledReceivables: settledReceivablesCount >= MIN_SETTLED_RECEIVABLES,
    revenue: anyReceivable,
    periodCosts: entries.some((e) => e.costType != null),
    previousPeriod: entries.some((e) => e.issuedOn.slice(0, 7) < currentMonth),
    segmentOps: Boolean(snap.niche) && (snap.monthlyOps?.length ?? 0) > 0,
  };
}
