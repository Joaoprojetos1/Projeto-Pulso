/**
 * Modelo de IA por superfície.
 *
 * O alerta e a conversa têm exigências diferentes:
 * - ALERT_MODEL redige o alerta — curto, crítico, raro. Vale o modelo mais forte.
 * - CHAT_MODEL responde a conversa — mais leve e mais frequente. Um modelo mais
 *   barato dá conta, e é o que faz sentido no volume do dia a dia.
 *
 * A princípio a conversa fica no Sonnet. Trocar o modelo é só mexer na variável
 * de ambiente (PULSO_ALERT_MODEL / PULSO_CHAT_MODEL) — sem tocar no código.
 * O modelo que de fato respondeu é gravado em ai_usage a cada chamada.
 */

// 11/09/2026: subimos para a geração 5. O alerta troca Opus 4.8 → Opus 5 pelo
// MESMO preço (US$ 5/25 por 1M), e a conversa troca Sonnet 4.6 → Sonnet 5, que é
// mais novo e 33% MAIS BARATO (US$ 2/10 contra 3/15). Nenhuma mudança de código:
// não usamos parâmetro que a geração 5 tenha removido (nada de budget_tokens,
// temperature ou prefill). Para voltar atrás basta a variável de ambiente.
export const ALERT_MODEL = process.env.PULSO_ALERT_MODEL ?? 'claude-opus-5';
export const CHAT_MODEL = process.env.PULSO_CHAT_MODEL ?? 'claude-sonnet-5';
// Extração por tipo (transcrição de valores de um arquivo). Não é cálculo nem
// juízo — o modelo só LÊ e transcreve; o código valida. Um modelo mais leve dá
// conta e é o que faz sentido no custo. Troca por env, sem tocar no código.
export const EXTRACT_MODEL = process.env.PULSO_EXTRACT_MODEL ?? 'claude-sonnet-5';
