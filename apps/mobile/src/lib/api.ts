/**
 * Cliente da API do Pulso. O app busca JSON e desenha — nada mais.
 *
 * Por padrão fala com o servidor na nuvem (Render), então o app funciona sem
 * depender de nenhum computador ligado. Para desenvolver contra um servidor
 * local, defina EXPO_PUBLIC_API_URL=http://localhost:3000 (ou o IP da máquina).
 */

/** Servidor de produção do Pulso (Render + banco Neon). */
const CLOUD_API_URL = 'https://pulso-api-9byl.onrender.com';

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
  return CLOUD_API_URL;
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

/** Registra o "endereço" (push token) deste celular para a empresa. */
export async function registerDevice(
  companyId: string,
  token: string,
  platform: string,
): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/companies/${companyId}/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao registrar aparelho`);
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
