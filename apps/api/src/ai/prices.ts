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

/**
 * Tabela oficial da Anthropic (USD por 1M de tokens, entrada/saída) × ~R$ 5,50:
 *   Fable 5    10 / 50   ·  Opus 5 e Opus 4.8   5 / 25
 *   Sonnet 5    2 / 10   ·  Sonnet 4.6          3 / 15
 *   Haiku 4.5   1 /  5
 *
 * CORREÇÃO (11/09/2026): a linha do Opus dizia 15/75 USD — o TRIPLO do preço
 * real. A tela de economia por plano estava superestimando o custo da IA em 3×,
 * o que empurra o preço do produto para cima sem motivo. Conferido contra a
 * tabela de preços da Anthropic nesta data.
 */
export const MODEL_PRICES_BRL: Record<string, ModelPrice> = {
  'claude-fable-5': { inputCentsPerMillion: 5500, outputCentsPerMillion: 27500 },
  'claude-opus-5': { inputCentsPerMillion: 2750, outputCentsPerMillion: 13750 },
  'claude-opus-4-8': { inputCentsPerMillion: 2750, outputCentsPerMillion: 13750 },
  'claude-sonnet-5': { inputCentsPerMillion: 1100, outputCentsPerMillion: 5500 },
  'claude-sonnet-4-6': { inputCentsPerMillion: 1650, outputCentsPerMillion: 8250 },
  'claude-haiku-4-5': { inputCentsPerMillion: 550, outputCentsPerMillion: 2750 },
};

/** Modelo desconhecido: assume o mais caro que usamos, para nunca subestimar. */
const FALLBACK: ModelPrice = { inputCentsPerMillion: 2750, outputCentsPerMillion: 13750 };

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
