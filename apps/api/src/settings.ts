import type { Sql } from './db';

/**
 * Configurações globais operacionais (tabela app_settings). Controladas pelo
 * operador (admin), nunca pelo build do app. Primeiro uso: o modo teste de
 * assinatura, que ativa sem cobrar durante testes.
 */

const TEST_MODE_KEY = 'subscription_test_mode';

/** Modo teste de assinatura ligado? Padrão desligado (nada nasce em teste). */
export async function getSubscriptionTestMode(sql: Sql): Promise<boolean> {
  const [row] = await sql`SELECT value FROM app_settings WHERE key = ${TEST_MODE_KEY}`;
  return row?.value === true;
}

/** Liga/desliga o modo teste de assinatura. */
export async function setSubscriptionTestMode(sql: Sql, enabled: boolean): Promise<void> {
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${TEST_MODE_KEY}, ${sql.json(enabled)}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${sql.json(enabled)}, updated_at = now()`;
}
