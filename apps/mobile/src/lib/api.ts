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

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${apiBase()}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCompanies(): Promise<Array<{ id: string; name: string }>> {
  const body = await getJson<{ companies: Array<{ id: string; name: string }> }>('/companies');
  return body.companies;
}

export async function fetchDashboard(companyId: string): Promise<DashboardJson> {
  return getJson<DashboardJson>(`/companies/${companyId}/dashboard`);
}
