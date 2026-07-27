/**
 * Pulso core — cobertura de dados.
 *
 * Função PURA: recebe o conjunto de campos canônicos presentes nos dados de uma
 * empresa e devolve, para cada indicador e cada regra, se está completo, parcial
 * (calculável com precisão reduzida) ou bloqueado — e, quando bloqueado, qual
 * campo falta e quais fontes o forneceriam.
 *
 * Não calcula indicador nenhum e não altera critério de suficiência. É a leitura
 * declarativa de "o que conseguimos calcular com o que temos".
 */

import {
  CANONICAL_FIELDS,
  effectiveRequirement,
  getRequirement,
  indicatorRequirements,
  REQUIREMENTS,
  ruleRequirements,
  type CanonicalField,
  type Gap,
} from './requirements';
import { fieldHasBroadSource, sourcesForField, type SourceId } from './sources';
import type { CompanySnapshot } from './types';

export type CoverageStatus =
  | 'complete' // todos os campos presentes
  | 'partial' // calculável, mas faltam opcionais (precisão reduzida)
  | 'blocked'; // falta campo obrigatório: não dá para calcular

export interface Remedy {
  field: CanonicalField;
  /** Nome do campo em linguagem de negócio. */
  label: string;
  sources: SourceId[];
}

export interface ItemCoverage {
  key: string;
  kind: 'indicator' | 'rule';
  question: string;
  status: CoverageStatus;
  /** Campos obrigatórios ausentes (motivo do bloqueio). */
  missingRequired: CanonicalField[];
  /** Campos opcionais ausentes (motivo da precisão reduzida). */
  missingOptional: CanonicalField[];
  /** Para cada campo faltante, onde conseguir. */
  remedies: Remedy[];
  /** Lacunas de schema (campos que nem existem no modelo canônico). */
  gaps: Gap[];
}

function remediesFor(fields: CanonicalField[]): Remedy[] {
  return fields.map((field) => ({
    field,
    label: CANONICAL_FIELDS[field].label,
    sources: sourcesForField(field),
  }));
}

/** Cobertura de um indicador (não resolve dependência de regra). */
function coverIndicator(key: string, present: ReadonlySet<CanonicalField>): ItemCoverage {
  const req = getRequirement(key)!;
  const eff = effectiveRequirement(key);

  const missingRequired = eff.required.filter((f) => !present.has(f));

  // anyOf: basta um grupo inteiro presente. Se nenhum grupo fecha, o grupo com
  // menos faltas vira o "caminho mais curto" e suas faltas contam como bloqueio.
  const anyOfMissing: CanonicalField[] = [];
  if (eff.anyOf.length > 0) {
    const satisfied = eff.anyOf.some((group) => group.every((f) => present.has(f)));
    if (!satisfied) {
      const cheapest = eff.anyOf
        .map((group) => group.filter((f) => !present.has(f)))
        .sort((a, b) => a.length - b.length)[0]!;
      anyOfMissing.push(...cheapest);
    }
  }

  const allMissingRequired = [...new Set([...missingRequired, ...anyOfMissing])];
  const missingOptional = eff.optional.filter((f) => !present.has(f));

  let status: CoverageStatus;
  if (allMissingRequired.length > 0) status = 'blocked';
  else if (missingOptional.length > 0) status = 'partial';
  else status = 'complete';

  return {
    key,
    kind: req.kind,
    question: req.question,
    status,
    missingRequired: allMissingRequired,
    missingOptional,
    remedies: remediesFor([...allMissingRequired, ...missingOptional]),
    gaps: eff.gaps,
  };
}

const STATUS_RANK: Record<CoverageStatus, number> = { complete: 0, partial: 1, blocked: 2 };

/** Cobertura de uma regra = a pior entre os indicadores de que depende. */
function coverRule(key: string, byIndicator: Map<string, ItemCoverage>): ItemCoverage {
  const req = getRequirement(key)!;
  const deps = req.dependsOnIndicators ?? [];

  let worst: CoverageStatus = 'complete';
  const missingRequired = new Set<CanonicalField>();
  const missingOptional = new Set<CanonicalField>();
  const gaps: Gap[] = [];

  for (const depKey of deps) {
    const dep = byIndicator.get(depKey);
    if (!dep) continue;
    if (STATUS_RANK[dep.status] > STATUS_RANK[worst]) worst = dep.status;
    for (const f of dep.missingRequired) missingRequired.add(f);
    for (const f of dep.missingOptional) missingOptional.add(f);
    for (const g of dep.gaps) gaps.push(g);
  }

  const mReq = [...missingRequired];
  const mOpt = [...missingOptional].filter((f) => !missingRequired.has(f));

  return {
    key,
    kind: 'rule',
    question: req.question,
    status: worst,
    missingRequired: mReq,
    missingOptional: mOpt,
    remedies: remediesFor([...mReq, ...mOpt]),
    gaps,
  };
}

/**
 * A resposta principal: dada a lista de campos presentes, o que está completo,
 * parcial e bloqueado — por indicador e por regra.
 */
export function coverageFor(present: ReadonlySet<CanonicalField>): ItemCoverage[] {
  const byIndicator = new Map<string, ItemCoverage>();
  for (const req of indicatorRequirements()) {
    byIndicator.set(req.key, coverIndicator(req.key, present));
  }
  const rules = ruleRequirements().map((req) => coverRule(req.key, byIndicator));
  return [...byIndicator.values(), ...rules];
}

export interface CoverageSummary {
  complete: number;
  partial: number;
  blocked: number;
  total: number;
  /** Só os indicadores (sem as regras) — é o número que o painel mostra. */
  indicators: { complete: number; partial: number; blocked: number; total: number };
}

export function coverageSummary(present: ReadonlySet<CanonicalField>): CoverageSummary {
  const all = coverageFor(present);
  const count = (items: ItemCoverage[]) => ({
    complete: items.filter((i) => i.status === 'complete').length,
    partial: items.filter((i) => i.status === 'partial').length,
    blocked: items.filter((i) => i.status === 'blocked').length,
    total: items.length,
  });
  const indicators = count(all.filter((i) => i.kind === 'indicator'));
  const total = count(all);
  return { ...total, indicators };
}

/**
 * Deriva os campos presentes a partir dos dados reais de uma empresa. Conveniência
 * para o painel e para testes; a função pura acima é o contrato de verdade.
 */
export function presentFieldsFromSnapshot(snap: CompanySnapshot): Set<CanonicalField> {
  const present = new Set<CanonicalField>();
  if (snap.balances.length > 0) present.add('balance.observed');
  if (snap.declaredFixedCostCents != null) present.add('declared.fixedCost');
  if (snap.entries.length > 0) {
    // colunas obrigatórias do schema: existem sempre que há lançamento
    present.add('entry.kind');
    present.add('entry.amount');
    present.add('entry.issuedOn');
    present.add('entry.dueOn');
    if (snap.entries.some((e) => e.settledOn != null)) present.add('entry.settledOn');
    if (snap.entries.some((e) => e.counterparty)) present.add('entry.counterparty');
    if (snap.entries.some((e) => e.category)) present.add('entry.category');
    if (snap.entries.some((e) => e.costType)) present.add('entry.costType');
  }
  return present;
}

/**
 * Quantos (e quais) indicadores dependem de um campo que NENHUMA fonte ampla
 * cobre hoje — ou seja, que só viriam do sistema do próprio cliente (ERP) ou da
 * mão do dono. É o número que responde "o que vai exigir integração dedicada".
 */
export interface ClientDependencyReport {
  count: number;
  indicators: Array<{ key: string; question: string; fields: CanonicalField[] }>;
}

export function indicatorsNeedingClientSystem(): ClientDependencyReport {
  const indicators: ClientDependencyReport['indicators'] = [];
  for (const req of indicatorRequirements()) {
    const eff = effectiveRequirement(req.key);
    // campos "necessários" incluindo o caminho mais curto de cada anyOf
    const needed = new Set<CanonicalField>(eff.required);
    if (eff.anyOf.length > 0) {
      // se TODOS os grupos alternativos dependem de campo sem fonte ampla, o
      // indicador precisa de integração dedicada por esse lado também
      const everyGroupNeedsClient = eff.anyOf.every((g) => g.some((f) => !fieldHasBroadSource(f)));
      if (everyGroupNeedsClient) {
        for (const f of eff.anyOf[0]!) if (!fieldHasBroadSource(f)) needed.add(f);
      }
    }
    const offenders = [...needed].filter((f) => !fieldHasBroadSource(f));
    if (offenders.length > 0) {
      indicators.push({ key: req.key, question: req.question, fields: offenders });
    }
  }
  return { count: indicators.length, indicators };
}

/** Só para asserções de integridade (testes): todo key do motor tem requisito. */
export function declaredKeys(): string[] {
  return REQUIREMENTS.map((r) => r.key);
}
