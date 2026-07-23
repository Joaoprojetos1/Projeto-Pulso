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
  /** Presentes quando o alerta vem do servidor (não na demonstração). */
  id?: string;
  createdAt?: string;
  openedAt?: string | null;
  actedAt?: string | null;
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

export interface Comparativo {
  atual: number | null;
  anterior: number | null;
}
export interface Comparativos {
  cash_cycle: Comparativo;
  contribution_margin: Comparativo;
  revenue_current: Comparativo;
}

export type DiagnosisStage = 'saudavel' | 'atencao' | 'pressao' | 'critico' | 'uti';

export interface DiagnosisDriver {
  premissa: string;
  stage: DiagnosisStage;
  facts: Record<string, number | string | boolean | null>;
}

/** O "momento" da empresa, calculado no servidor. */
export interface DiagnosisJson {
  stage: DiagnosisStage;
  drivers: DiagnosisDriver[];
  transitions: {
    previousStage: DiagnosisStage | null;
    direction: 'melhorou' | 'piorou' | 'igual' | null;
  };
  facts: { unavailable: Record<string, string>; [k: string]: unknown };
  /** Texto redigido (voz do Pulso). */
  text: { title: string; body: string; modelVersion: string };
}

export interface WeeklySummaryJson {
  text: { title: string; body: string; modelVersion: string };
  facts: {
    cashNowCents: number | null;
    cashPrevCents: number | null;
    cashCycleNow: number | null;
    cashCyclePrev: number | null;
    revenueNowCents: number | null;
    revenuePrevCents: number | null;
    daysBetween: number;
  };
  comparedTo: string;
}

export interface DashboardJson {
  company: { id: string; name: string; niche: string };
  snapshot: {
    asOf: string;
    coreVersion: string;
    computedAt: string;
    indicators: Record<string, IndicatorJson>;
  };
  /** Tendência atual × anterior dos indicadores de topo (quando há histórico). */
  comparativos?: Comparativos;
  /** Diagnóstico do momento (null em snapshots antigos ou conta nova). */
  diagnosis?: DiagnosisJson | null;
  /** Resumo da semana (null quando não há snapshot anterior de >= 5 dias). */
  weeklySummary?: WeeklySummaryJson | null;
  /** Curva diária da projeção (um ponto por dia) para o gráfico interativo. */
  projectionCurve?: { day: string; cents: number }[];
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

/**
 * Cota de perguntas do mês estourada (HTTP 402). Guarda o quanto foi usado, o
 * limite e a data em que renova ('YYYY-MM-DD'), para a tela avisar com clareza.
 */
export class QuotaError extends Error {
  used: number;
  quota: number;
  resetsOn: string;
  constructor(used: number, quota: number, resetsOn: string) {
    super('quota_exceeded');
    this.name = 'QuotaError';
    this.used = used;
    this.quota = quota;
    this.resetsOn = resetsOn;
  }
}

/** Se a resposta for 402, lança QuotaError com os dados do corpo estruturado. */
async function lancarSeCota(res: Response): Promise<void> {
  if (res.status !== 402) return;
  const b = (await res.json().catch(() => ({}))) as {
    used?: number;
    quota?: number;
    resetsOn?: string;
  };
  throw new QuotaError(b.used ?? 0, b.quota ?? 0, b.resetsOn ?? '');
}

export async function sendChat(companyId: string, messages: ChatTurnJson[]): Promise<string> {
  const res = await fetchWithWake(`${apiBase()}/companies/${companyId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  await lancarSeCota(res);
  if (!res.ok) throw new Error(`HTTP ${res.status} no chat`);
  const body = (await res.json()) as { reply: string };
  return body.reply;
}

/* ----------------------- Login de verdade ----------------------- */

/** Motivo do erro de autenticação, para a tela mostrar a mensagem certa. */
export type AuthErroTipo = 'credenciais' | 'conflito' | 'rede' | 'desconhecido';
export class AuthError extends Error {
  tipo: AuthErroTipo;
  constructor(tipo: AuthErroTipo, mensagem: string) {
    super(mensagem);
    this.tipo = tipo;
  }
}

export type UserRole = 'owner' | 'admin';

export interface AuthResult {
  token: string;
  email: string;
  role?: UserRole;
  company: { id: string; name: string; niche?: string };
}

async function postAuth(path: string, body: unknown): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetchWithWake(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('rede', 'Não consegui falar com o servidor.');
  }
  if (res.ok) return (await res.json()) as AuthResult;
  if (res.status === 401) throw new AuthError('credenciais', 'E-mail ou senha incorretos.');
  if (res.status === 409) throw new AuthError('conflito', 'Já existe uma conta com esse e-mail.');
  throw new AuthError('desconhecido', `Não deu certo agora (${res.status}).`);
}

export function authSignup(
  businessName: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  return postAuth('/auth/signup', { businessName, email, password });
}

export function authLogin(email: string, password: string): Promise<AuthResult> {
  return postAuth('/auth/login', { email, password });
}

/** Pede o código de recuperação por e-mail. Sempre "dá certo" (não revela se o e-mail existe). */
export async function authForgotPassword(email: string): Promise<void> {
  try {
    await fetchWithWake(`${apiBase()}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw new AuthError('rede', 'Não consegui falar com o servidor.');
  }
}

/** Redefine a senha com o código recebido por e-mail. */
export async function authResetPassword(token: string, password: string): Promise<void> {
  let res: Response;
  try {
    res = await fetchWithWake(`${apiBase()}/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
  } catch {
    throw new AuthError('rede', 'Não consegui falar com o servidor.');
  }
  if (res.status === 400) throw new AuthError('credenciais', 'Código inválido ou expirado. Peça um novo.');
  if (!res.ok) throw new AuthError('desconhecido', `Não deu certo agora (${res.status}).`);
}

export async function authLogout(token: string): Promise<void> {
  try {
    await fetchWithWake(`${apiBase()}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    // sair é local de qualquer jeito; se o servidor não responder, tudo bem
  }
}

export interface MyDashboard {
  companyId: string;
  companyName: string;
  /** Papel do dono logado (owner por padrão; admin vê a área de operação). */
  role: UserRole;
  /** null = conta nova, ainda sem dados (mostra o estado de "vazio"). */
  dashboard: DashboardJson | null;
}

/** Painel do dono logado (usa o token; só vê a própria empresa). */
export async function fetchMyDashboard(token: string): Promise<MyDashboard> {
  const res = await fetchWithWake(`${apiBase()}/me/dashboard`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} no painel`);
  const body = (await res.json()) as {
    role?: UserRole;
    company: { id: string; name: string; niche: string };
    snapshot: DashboardJson['snapshot'] | null;
    comparativos?: Comparativos;
    diagnosis?: DiagnosisJson | null;
    weeklySummary?: WeeklySummaryJson | null;
    projectionCurve?: { day: string; cents: number }[];
    alerts: AlertJson[];
  };
  const dashboard: DashboardJson | null = body.snapshot
    ? {
        company: body.company,
        snapshot: body.snapshot,
        comparativos: body.comparativos,
        diagnosis: body.diagnosis ?? null,
        weeklySummary: body.weeklySummary ?? null,
        projectionCurve: body.projectionCurve,
        alerts: body.alerts,
      }
    : null;
  return {
    companyId: body.company.id,
    companyName: body.company.name,
    role: body.role ?? 'owner',
    dashboard,
  };
}

/* --------------- Insumo do motor: caixa hoje + custo fixo --------------- */

export interface MySetup {
  name: string;
  /** null = ainda não informado. */
  cashBalanceCents: number | null;
  cashBalanceOn: string | null;
  fixedCostCents: number | null;
  /** quantas contas (a receber/pagar) já foram cadastradas. */
  plannedCount: number;
  /** o motor já rodou alguma vez para esta empresa. */
  hasSnapshot: boolean;
}

/** Lê o que o dono já informou (para pré-preencher a tela de configuração). */
export async function fetchMySetup(token: string): Promise<MySetup> {
  const res = await fetchWithWake(`${apiBase()}/me/setup`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} no setup`);
  return (await res.json()) as MySetup;
}

/**
 * Grava caixa hoje + custo fixo do mês e manda o motor recalcular. O app não
 * calcula nada: manda os dois números; o servidor roda o core e devolve o painel.
 */
export async function saveMySetup(
  token: string,
  cashBalanceCents: number,
  fixedCostCents: number,
): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/me/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ cashBalanceCents, fixedCostCents }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar seus números`);
}

/* --------------- Assinatura (entitlement) --------------- */

export interface MySubscription {
  plan: string;
  status: 'none' | 'active' | 'canceled' | 'past_due';
  /** validade da assinatura ('YYYY-MM-DD') ou null (ativa até cancelar). */
  until: string | null;
  /** true = pode usar os benefícios do plano. */
  active: boolean;
}

/** Lê o plano/estado da assinatura do dono logado (o app destrava a partir disto). */
export async function fetchMySubscription(token: string): Promise<MySubscription> {
  const res = await fetchWithWake(`${apiBase()}/me/subscription`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} na assinatura`);
  return (await res.json()) as MySubscription;
}

/** Conversa do dono logado. */
export async function sendMyChat(token: string, messages: ChatTurnJson[]): Promise<string> {
  const res = await fetchWithWake(`${apiBase()}/me/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages }),
  });
  await lancarSeCota(res);
  if (!res.ok) throw new Error(`HTTP ${res.status} no chat`);
  const body = (await res.json()) as { reply: string };
  return body.reply;
}

/* --------------- Histórico de alertas (lido / agido) --------------- */

export interface AlertHistoryJson extends AlertJson {
  id: string;
  createdAt: string;
  openedAt: string | null;
  actedAt: string | null;
}

/** Histórico de alertas do dono (todos os snapshots, mais recente primeiro). */
export async function fetchMyAlerts(token: string, limit = 50): Promise<AlertHistoryJson[]> {
  const res = await fetchWithWake(`${apiBase()}/me/alerts?limit=${limit}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} nos alertas`);
  return ((await res.json()) as { alerts: AlertHistoryJson[] }).alerts;
}

/** Marca visto/agido. Best-effort: é métrica do piloto, nunca atrapalha o uso. */
async function marcarAlerta(token: string, id: string, acao: 'opened' | 'acted'): Promise<void> {
  try {
    await fetchWithWake(`${apiBase()}/me/alerts/${id}/${acao}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    // silencioso de propósito
  }
}
export const markAlertOpened = (token: string, id: string) => marcarAlerta(token, id, 'opened');
export const markAlertActed = (token: string, id: string) => marcarAlerta(token, id, 'acted');

/* --------------- Simulação "e se" (determinística, sem IA) --------------- */

export type SimulationDelta =
  | { type: 'delayLargestPayable'; days: number }
  | { type: 'anticipateLargestReceivable'; days: number }
  | { type: 'adjustFixedCost'; deltaCents: number }
  | { type: 'addPlanned'; kind: ContaKind; amountCents: number; dueOn: string };

export interface SimulationPoint {
  day: string;
  cents: number;
}
export interface SimulationCurve {
  curve: SimulationPoint[];
  zeroOn: string | null;
}
export interface SimulationResult {
  asOf: string;
  horizonDays: number;
  original: SimulationCurve;
  simulated: SimulationCurve;
  applied: SimulationDelta[];
  ignored: SimulationDelta[];
}

/** Roda a simulação no servidor (o core calcula; nada é alterado de verdade). */
export async function sendSimulate(
  token: string,
  deltas: SimulationDelta[],
  horizonDays = 90,
): Promise<SimulationResult> {
  const res = await fetchWithWake(`${apiBase()}/me/simulate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ deltas, horizonDays }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} na simulação`);
  return ((await res.json()) as { simulation: SimulationResult }).simulation;
}

/* --------------- Contas previstas (a pagar / a receber) --------------- */

export type ContaKind = 'receivable' | 'payable';
export type ContaStatus = 'prevista' | 'vencida' | 'realizada';
export type ContaRecorrencia = 'none' | 'monthly';

export interface ContaJson {
  id: string;
  kind: ContaKind;
  amountCents: number;
  dueOn: string;
  counterparty: string | null;
  category: string | null;
  recurrence: ContaRecorrencia;
  natureza: 'avulsa' | 'recorrente';
  status: ContaStatus;
  confirmedOn: string | null;
  /** true enquanto não graduada — na tela é sempre marcada "Previsão". */
  previsao: boolean;
  createdAt: string;
}

export interface NovaConta {
  kind: ContaKind;
  amountCents: number;
  dueOn: string;
  counterparty?: string;
  category?: string;
  recurrence?: ContaRecorrencia;
}

const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

export async function fetchContas(token: string, kind?: ContaKind): Promise<ContaJson[]> {
  const q = kind ? `?kind=${kind}` : '';
  const res = await fetchWithWake(`${apiBase()}/me/contas${q}`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} nas contas`);
  const body = (await res.json()) as { contas: ContaJson[] };
  return body.contas;
}

export async function criarConta(token: string, conta: NovaConta): Promise<ContaJson> {
  const res = await fetchWithWake(`${apiBase()}/me/contas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(conta),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao cadastrar conta`);
  return (await res.json()) as ContaJson;
}

export interface EditarConta {
  amountCents: number;
  dueOn: string;
  counterparty?: string;
  category?: string;
  recurrence?: ContaRecorrencia;
}

/** Edita uma conta ainda prevista (não graduada). */
export async function editarConta(token: string, id: string, conta: EditarConta): Promise<ContaJson> {
  const res = await fetchWithWake(`${apiBase()}/me/contas/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(conta),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao editar conta`);
  return (await res.json()) as ContaJson;
}

/** Graduação: o dono confirma que a conta aconteceu (previsto → realizado). */
export async function confirmarConta(
  token: string,
  id: string,
  confirmedOn?: string,
): Promise<ContaJson> {
  const res = await fetchWithWake(`${apiBase()}/me/contas/${id}/confirmar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(confirmedOn ? { confirmedOn } : {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao confirmar conta`);
  return (await res.json()) as ContaJson;
}

export async function excluirConta(token: string, id: string): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/me/contas/${id}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao excluir conta`);
}

/* ============================ Área de operação (admin) ============================
 * Só para operadores (papel admin). O app segue burro: busca JSON e desenha —
 * nenhuma conta financeira aqui. Todas as rotas exigem o token; o servidor
 * responde 404 se o token não for de um admin (a área nem se revela).
 */

/** 404 vindo de uma rota /admin = "você não é admin" (ou não existe). */
export class NaoAutorizadoError extends Error {
  constructor() {
    super('Área restrita à operação.');
    this.name = 'NaoAutorizadoError';
  }
}

async function adminGet<T>(token: string, path: string): Promise<T> {
  const res = await fetchWithWake(`${apiBase()}${path}`, { headers: authHeader(token) });
  if (res.status === 404) throw new NaoAutorizadoError();
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return (await res.json()) as T;
}

async function adminWrite<T>(
  token: string,
  method: 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetchWithWake(`${apiBase()}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(body ?? {}),
  });
  if (res.status === 404) throw new NaoAutorizadoError();
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return (await res.json()) as T;
}

export interface AdminOverviewRow {
  companyId: string;
  name: string;
  plan: string;
  chatQuota: number;
  isDemo: boolean;
  stage: DiagnosisStage | null;
  lastImportAt: string | null;
  daysSinceImport: number | null;
  unopenedAlerts: number;
  chatQuestionsMonth: number;
}

export function fetchAdminOverview(token: string): Promise<AdminOverviewRow[]> {
  return adminGet<{ companies: AdminOverviewRow[] }>(token, '/admin/overview').then((b) => b.companies);
}

export interface AdminDossier {
  company: {
    id: string;
    name: string;
    cnpj: string | null;
    niche: string;
    plan: string;
    isDemo: boolean;
    chatQuota: number;
    createdAt: string;
  };
  snapshot: {
    asOf: string;
    coreVersion: string;
    computedAt: string;
    indicators: Record<string, IndicatorJson>;
    diagnosis: DiagnosisJson | null;
  } | null;
  users: Array<{ id: string; email: string; role: string }>;
  alerts: Array<{
    id: string;
    ruleKey: string;
    severity: 'ok' | 'warn' | 'critical';
    createdAt: string;
    openedAt: string | null;
    actedAt: string | null;
  }>;
  imports: Array<{
    source: string;
    periodStart: string;
    periodEnd: string;
    rowCount: number;
    importedAt: string;
  }>;
  planned: Array<{ kind: ContaKind; status: string; count: number; totalCents: number }>;
  aiUsageMonth: Array<{
    kind: string;
    model: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}

export function fetchAdminCompany(token: string, id: string): Promise<AdminDossier> {
  return adminGet<AdminDossier>(token, `/admin/companies/${id}`);
}

export interface PatchEmpresa {
  name?: string;
  chatQuota?: number;
  plan?: string;
}

export function patchAdminCompany(
  token: string,
  id: string,
  patch: PatchEmpresa,
): Promise<{ id: string; name: string; plan: string; chatQuota: number }> {
  return adminWrite(token, 'PATCH', `/admin/companies/${id}`, patch);
}

export function reprocessAdminCompany(token: string, id: string): Promise<{ snapshotId: string }> {
  return adminWrite(token, 'POST', `/admin/companies/${id}/reprocess`);
}

export function resetSenhaUsuario(token: string, userId: string): Promise<{ ok: boolean }> {
  return adminWrite(token, 'POST', `/admin/users/${userId}/reset-password`);
}

export type LeadStatus = 'novo' | 'contatado' | 'convertido' | 'descartado';
export interface AdminLead {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  createdAt: string;
}

export function fetchAdminLeads(token: string, q?: string): Promise<AdminLead[]> {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return adminGet<{ leads: AdminLead[] }>(token, `/admin/leads${query}`).then((b) => b.leads);
}

export function patchLeadStatus(
  token: string,
  id: string,
  status: LeadStatus,
): Promise<{ id: string; status: LeadStatus }> {
  return adminWrite(token, 'PATCH', `/admin/leads/${id}`, { status });
}

export interface AdminAiUsageRow {
  companyId: string;
  companyName: string | null;
  kind: string;
  model: string;
  month: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function fetchAdminAiUsage(token: string): Promise<AdminAiUsageRow[]> {
  return adminGet<{ usage: AdminAiUsageRow[] }>(token, '/admin/ai-usage').then((b) => b.usage);
}

export interface AdminHealth {
  lastSnapshotAt: string | null;
  importsLast7Days: number;
  activeCompaniesLast30Days: number;
  realCompanies: number;
  coreVersion: string;
}

export function fetchAdminHealth(token: string): Promise<AdminHealth> {
  return adminGet<AdminHealth>(token, '/admin/health');
}
