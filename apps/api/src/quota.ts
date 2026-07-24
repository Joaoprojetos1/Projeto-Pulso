/**
 * Cota mensal de perguntas do chat, por empresa.
 *
 * A IA custa por chamada. A cota protege o custo por empresa sem punir o dono:
 * ao estourar, a conversa avisa com clareza e diz QUANDO renova — e os alertas
 * e o painel seguem funcionando (não dependem da cota).
 *
 * A contagem reaproveita a tabela `ai_usage` (metering, migração 0006): contamos
 * as linhas com kind = 'chat' do mês corrente. O alerta semanal é gravado lá como
 * kind = 'alert_writer', então NUNCA entra na cota.
 *
 * O mês é o do fuso de São Paulo (America/Sao_Paulo, UTC-3, sem horário de verão
 * desde 2019): "renova em 1º de agosto" tem que bater com o calendário do dono.
 */

import type { Sql } from './db';

/** Cota padrão por empresa. O valor por plano será definido depois. */
export const DEFAULT_CHAT_QUOTA = 50;

/** Cota estourada. A rota transforma em HTTP 402 com corpo estruturado. */
export class QuotaExceededError extends Error {
  readonly used: number;
  readonly quota: number;
  readonly resetsOn: string;
  constructor(used: number, quota: number, resetsOn: string) {
    super('quota_exceeded');
    this.name = 'QuotaExceededError';
    this.used = used;
    this.quota = quota;
    this.resetsOn = resetsOn;
  }
}

/** Corpo da resposta 402 — mesmo formato nas rotas pública e logada. */
export function quotaExceededPayload(e: QuotaExceededError) {
  return {
    error: 'quota_exceeded' as const,
    used: e.used,
    quota: e.quota,
    resetsOn: e.resetsOn,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export interface MonthWindow {
  /** Início do mês corrente (instante UTC). */
  start: Date;
  /** Início do mês seguinte (instante UTC) — fim EXCLUSIVO da janela. */
  nextStart: Date;
  /** Dia em que a cota renova, 'YYYY-MM-DD' (1º do mês seguinte, fuso de SP). */
  resetsOn: string;
}

/** Janela do mês corrente no fuso de São Paulo. */
export function saoPauloMonthWindow(now: Date = new Date()): MonthWindow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value); // 1-12

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    start: new Date(`${year}-${pad(month)}-01T00:00:00.000-03:00`),
    nextStart: new Date(`${nextYear}-${pad(nextMonth)}-01T00:00:00.000-03:00`),
    resetsOn: `${nextYear}-${pad(nextMonth)}-01`,
  };
}

/**
 * Cota da empresa. Ordem: override por empresa (chat_quota_monthly, quando
 * preenchido) → limite do plano (plans.chat_limit_monthly) → padrão de segurança.
 */
export async function chatQuota(sql: Sql, companyId: string): Promise<number> {
  const [row] = await sql`
    SELECT c.chat_quota_monthly AS override, p.chat_limit_monthly AS plan_limit
    FROM companies c LEFT JOIN plans p ON p.id = c.plan_id
    WHERE c.id = ${companyId}`;
  const override = row?.override as number | null | undefined;
  if (typeof override === 'number') return override;
  const planLimit = row?.plan_limit as number | null | undefined;
  if (typeof planLimit === 'number') return planLimit;
  return DEFAULT_CHAT_QUOTA;
}

/** Quantas perguntas de chat esta empresa já fez no mês corrente (SP). */
export async function chatUsageThisMonth(
  sql: Sql,
  companyId: string,
  janela: MonthWindow = saoPauloMonthWindow(),
): Promise<number> {
  const [row] = await sql`
    SELECT count(*)::int AS n
    FROM ai_usage
    WHERE company_id = ${companyId}
      AND kind = 'chat'
      AND created_at >= ${janela.start}
      AND created_at < ${janela.nextStart}`;
  return (row?.n as number | undefined) ?? 0;
}

/**
 * Barra a conversa se a empresa já atingiu a cota do mês. Chamada ANTES de tocar
 * na IA — estourou, lança QuotaExceededError e a Anthropic nunca é chamada.
 */
export async function assertWithinChatQuota(sql: Sql, companyId: string): Promise<void> {
  const janela = saoPauloMonthWindow();
  const [quota, used] = await Promise.all([
    chatQuota(sql, companyId),
    chatUsageThisMonth(sql, companyId, janela),
  ]);
  if (used >= quota) {
    throw new QuotaExceededError(used, quota, janela.resetsOn);
  }
}
