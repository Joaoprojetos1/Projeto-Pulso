/**
 * O fiscal de números: nenhum número aparece no texto do alerta
 * se não estiver em `facts`.
 *
 * A IA recebe números prontos e só redige. Este módulo é a garantia
 * DETERMINÍSTICA disso: extrai todo número do texto gerado e confere
 * contra o conjunto de valores permitidos derivado de `facts`
 * (centavos -> reais, ratio -> percentual arredondado, data -> dia/mês/ano).
 * Número alucinado em alerta financeiro destrói a confiança — aqui ele
 * simplesmente não passa.
 */

import type { AlertFact } from '@pulso/core';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EPS = 1e-6;

function addNumberVariants(allowed: Set<number>, n: number) {
  allowed.add(n);
  allowed.add(Math.abs(n));

  if (Number.isInteger(n)) {
    const abs = Math.abs(n);
    // valores grandes podem ser centavos: permite as formas em reais
    if (abs >= 1000) {
      allowed.add(abs / 100); // 1_500_000 -> 15000  ("R$ 15.000")
      allowed.add(Math.round(abs / 100));
      allowed.add(abs / 100_000); // -> 15  ("R$ 15 mil")
      allowed.add(Math.round(abs / 100_000));
      allowed.add(Math.round(abs / 10_000) / 10); // -> 52.8  ("R$ 52,8 mil")
    }
  } else {
    // não inteiro: pode ser ratio -> formas percentuais
    const p = n * 100;
    allowed.add(p);
    allowed.add(Math.round(p));
    allowed.add(Math.floor(p));
    allowed.add(Math.ceil(p));
    allowed.add(Math.round(p * 10) / 10); // 1 casa decimal
  }
}

/** Conjunto de números que PODEM aparecer no texto, derivado de facts. */
export function allowedNumbersFrom(facts: AlertFact['facts']): Set<number> {
  const allowed = new Set<number>();
  for (const value of Object.values(facts)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      addNumberVariants(allowed, value);
    } else if (typeof value === 'string' && ISO_DATE.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      allowed.add(y!);
      allowed.add(m!);
      allowed.add(d!);
    }
  }
  return allowed;
}

/** Extrai números do texto, entendendo formato pt-BR (1.500,25). */
export function extractNumbers(text: string): number[] {
  const tokens = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return tokens.map((raw) => {
    let t = raw;
    // pontos como separador de milhar: 1.500 / 12.345.678
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(t)) t = t.replace(/\./g, '');
    return Number(t.replace(',', '.'));
  });
}

export interface GroundingResult {
  ok: boolean;
  /** Números do texto que NÃO vieram de facts. */
  offending: number[];
}

export function checkGrounding(text: string, facts: AlertFact['facts']): GroundingResult {
  const allowed = allowedNumbersFrom(facts);
  const offending = extractNumbers(text).filter((n) => {
    for (const a of allowed) if (Math.abs(a - n) < EPS) return false;
    return true;
  });
  return { ok: offending.length === 0, offending };
}
