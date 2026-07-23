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

export const ALERT_MODEL = process.env.PULSO_ALERT_MODEL ?? 'claude-opus-4-8';
export const CHAT_MODEL = process.env.PULSO_CHAT_MODEL ?? 'claude-sonnet-4-6';
