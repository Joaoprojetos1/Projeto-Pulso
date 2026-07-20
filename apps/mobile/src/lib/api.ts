/**
 * Cliente da API do Pulso. O app busca JSON e desenha — nada mais.
 *
 * A URL do servidor sai do próprio Expo (o computador que roda o Metro
 * também roda a API), ou de EXPO_PUBLIC_API_URL.
 */

import Constants from 'expo-constants';

export interface AlertJson {
  ruleKey: string;
  severity: 'ok' | 'warn' | 'critical';
  facts: Record<string, number | string | null>;
  textTitle: string | null;
  textBody: string | null;
}

export interface IndicatorJson {
  key: string;
  value: unknown;
  unit: string;
  inputs: Record<string, number | string | null>;
  insufficientReason?: string;
}

export interface CashProjectionPoint {
  horizonDays: number;
  projectedCents: number;
  zeroOn: string | null;
}

export interface DashboardJson {
  company: { id: string; name: string; niche: string };
  snapshot: {
    asOf: string;
    coreVersion: string;
    computedAt: string;
    indicators: Record<string, IndicatorJson>;
  };
  alerts: AlertJson[];
}

function apiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri ? hostUri.split(':')[0] : 'localhost';
  return `http://${host}:3000`;
}

/**
 * Busca com um toque de paciência. Servidor gratuito (Render) hiberna quando
 * ninguém usa; a primeira visita pode levar ~30-50s pra acordar. Então tenta
 * rápido (8s, caso comum já acordado) e, se falhar, tenta de novo dando 60s.
 */
async function fetchWithWake(url: string, init?: RequestInit): Promise<Response> {
  const timeouts = [8000, 60000];
  let lastErr: unknown;
  for (const ms of timeouts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetchWithWake(`${apiBase()}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return (await res.json()) as T;
}

export async function fetchCompanies(): Promise<Array<{ id: string; name: string }>> {
  const body = await getJson<{ companies: Array<{ id: string; name: string }> }>('/companies');
  return body.companies;
}

export async function fetchDashboard(companyId: string): Promise<DashboardJson> {
  return getJson<DashboardJson>(`/companies/${companyId}/dashboard`);
}

export interface ChatTurnJson {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChat(companyId: string, messages: ChatTurnJson[]): Promise<string> {
  const res = await fetchWithWake(`${apiBase()}/companies/${companyId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} no chat`);
  const body = (await res.json()) as { reply: string };
  return body.reply;
}
