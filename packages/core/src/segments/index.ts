/**
 * Pulso core — segmentos: registro e composição.
 *
 * O `niche` da empresa seleciona o pacote. Empresa sem segmento conhecido roda
 * só o núcleo universal (estas funções devolvem vazio). `computeAll` compõe
 * núcleo + segmento; `evaluate` inclui as regras do segmento.
 */

import type { CompanySnapshot, Indicator, IndicatorSet } from '../types';
import { clinica } from './clinica';
import { restaurante } from './restaurante';
import { varejo } from './varejo';
import type { SegmentField, SegmentId, SegmentPackage, SegmentRule } from './types';

export * from './types';
export { clinica, CLINICA_THRESHOLDS } from './clinica';
export { varejo, VAREJO_THRESHOLDS } from './varejo';
export { restaurante, RESTAURANTE_THRESHOLDS } from './restaurante';

/** Registro dos pacotes implementados. */
export const SEGMENTS: Record<SegmentId, SegmentPackage> = { clinica, varejo, restaurante };

export function isSegmentId(niche: string | undefined | null): niche is SegmentId {
  return niche === 'clinica' || niche === 'varejo' || niche === 'restaurante';
}

/** O pacote do segmento da empresa, ou null (só núcleo). */
export function getSegment(niche: string | undefined | null): SegmentPackage | null {
  return isSegmentId(niche) ? SEGMENTS[niche] : null;
}

/** Lista os segmentos disponíveis (para o seletor do admin e o formulário). */
export function listSegments(): Array<{ id: SegmentId; label: string; fieldCount: number }> {
  return (Object.keys(SEGMENTS) as SegmentId[]).map((id) => ({ id, label: SEGMENTS[id].label, fieldCount: SEGMENTS[id].fields.length }));
}

/** Campos do formulário "Números do mês" do segmento (vazio se não houver). */
export function segmentFields(niche: string | undefined | null): SegmentField[] {
  return getSegment(niche)?.fields ?? [];
}

/**
 * Indicadores do SEGMENTO da empresa. Cada um roda puro sobre os números do mês.
 * Devolve `{}` quando a empresa não tem segmento conhecido.
 */
export function computeSegmentIndicators(snap: CompanySnapshot): IndicatorSet {
  const pkg = getSegment(snap.niche);
  if (!pkg) return {};
  const ctx = { asOf: snap.asOf, ops: snap.monthlyOps ?? [] };
  const set: IndicatorSet = {};
  for (const fn of pkg.indicators) {
    const ind: Indicator<number> = fn(ctx);
    set[ind.key] = ind;
  }
  return set;
}

/** Regras de alerta do segmento da empresa (vazio se não houver). */
export function segmentRules(niche: string | undefined | null): SegmentRule[] {
  return getSegment(niche)?.rules ?? [];
}

// ---------------------------------------------------------------
// Cobertura de dados do segmento — quais indicadores estão completos/bloqueados
// dado o conjunto de campos operacionais já preenchidos. Mesmo espírito do
// `coverage.ts` universal, sobre os campos do segmento.
// ---------------------------------------------------------------
export interface SegmentItemCoverage {
  key: string;
  question: string;
  status: 'complete' | 'blocked';
  missing: string[]; // slugs de campo faltando
}

export function segmentCoverage(
  niche: string | undefined | null,
  presentFields: ReadonlySet<string>,
): SegmentItemCoverage[] {
  const pkg = getSegment(niche);
  if (!pkg) return [];
  return pkg.requirements.map((req) => {
    const missing = req.required.filter((f) => !presentFields.has(f));
    return { key: req.key, question: req.question, status: missing.length ? 'blocked' : 'complete', missing };
  });
}

/** Campos presentes a partir dos números do mês (para a cobertura). */
export function presentSegmentFields(snap: CompanySnapshot): Set<string> {
  const present = new Set<string>();
  for (const o of snap.monthlyOps ?? []) present.add(o.field);
  return present;
}
