/**
 * Preços dos modelos em REAIS (centavos por 1 milhão de tokens), input e output.
 *
 * ESTIMATIVA: preço da Anthropic (USD) × câmbio aproximado. Ajuste aqui quando o
 * câmbio ou a tabela mudar. Usado SÓ para a "economia por plano" da operação
 * (visão gerencial) — nunca cobra nada de ninguém.
 */

export interface ModelPrice {
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
}

// USD/1M (in/out) × ~5,5 BRL: opus 15/75, sonnet 3/15, haiku 1/5
export const MODEL_PRICES_BRL: Record<string, ModelPrice> = {
  'claude-opus-4-8': { inputCentsPerMillion: 8250, outputCentsPerMillion: 41250 },
  'claude-sonnet-4-6': { inputCentsPerMillion: 1650, outputCentsPerMillion: 8250 },
  'claude-haiku-4-5': { inputCentsPerMillion: 550, outputCentsPerMillion: 2750 },
};

const FALLBACK: ModelPrice = { inputCentsPerMillion: 1650, outputCentsPerMillion: 8250 };

/** Casa por prefixo (ex.: 'claude-sonnet-4-6-2025...' → sonnet). */
export function priceFor(model: string): ModelPrice {
  for (const key of Object.keys(MODEL_PRICES_BRL)) {
    if (model.startsWith(key)) return MODEL_PRICES_BRL[key]!;
  }
  return FALLBACK;
}

/** Custo em centavos (R$) de uma chamada, pelos tokens de entrada/saída. */
export function callCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (
    (inputTokens * p.inputCentsPerMillion + outputTokens * p.outputCentsPerMillion) / 1_000_000
  );
}
