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

/** Um indicador do SEGMENTO da empresa, já rotulado pelo servidor. */
export interface SegmentIndicatorJson {
  key: string;
  label: string;
  hint: string;
  value: number | null;
  unit: string | null;
  available: boolean;
  /** true = não calculável porque o dono DECLAROU não ter o dado (não é "esperando"). */
  declaredUnavailable?: boolean;
  reason: string | null;
  /** Comparativo de mercado (item 3.6): só vem quando há benchmark validado. */
  market?: {
    typicalValue: number;
    source: string;
    asOfMonth: string | null;
    position: 'acima' | 'abaixo' | 'na_media';
    favorable: boolean;
  } | null;
}

/** Contexto do cadastro que o motor leva em conta (transparência). */
export interface CadastroContext {
  systems: Array<{ purpose: string; exportFormat: string | null }>;
  semControleEstoque: boolean;
}

export interface DashboardJson {
  company: { id: string; name: string; niche: string };
  /** Segmento da empresa (null = só núcleo universal). */
  segment?: { id: string; label: string } | null;
  /** Indicadores do segmento, rotulados (a home mostra estes). */
  segmentIndicators?: SegmentIndicatorJson[];
  /** Contexto do cadastro que o motor considera (sistemas declarados etc.). */
  cadastro?: CadastroContext;
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
 * ninguém usa; a primeira visita pode levar ~30-50s pra acordar. Enquanto acorda,
 * ele NÃO só demora: às vezes devolve um 502/503/504 na cara (o "erro na primeira
 * vez", que aparece no upload por ser o 1º POST pesado da sessão). Então:
 *  - retenta em timeout/rede E em 502/503/504 transitório;
 *  - GET sempre retenta 5xx (idempotente); escrita só quando o chamador permite
 *    (`retryOn5xx`), para não reenviar por engano algo não-idempotente;
 *  - quando há arquivo no corpo, o 1º toque tem folga maior (não abortar à toa
 *    um envio lento).
 */
async function fetchWithWake(
  url: string,
  init?: RequestInit,
  opts?: { retryOn5xx?: boolean },
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const temCorpo = init?.body != null;
  const retry5xx = opts?.retryOn5xx ?? method === 'GET';
  const timeouts = temCorpo ? [20000, 60000, 90000] : [8000, 45000, 60000];
  let lastErr: unknown;
  for (let i = 0; i < timeouts.length; i++) {
    const ultima = i === timeouts.length - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeouts[i]!);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      // servidor acordando devolve 5xx transitório: trata como "ainda não pronto"
      if (retry5xx && res.status >= 502 && res.status <= 504 && !ultima) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * Registra o "endereço" (push token) deste celular. Escopado pelo token de
 * sessão do dono (a empresa vem do login, não de um id na URL).
 */
export async function registerMyDevice(
  authToken: string,
  pushToken: string,
  platform: string,
): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/me/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ token: pushToken, platform }),
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
    throw new AuthError('rede', 'Sem conexão agora. Verifique sua internet e tente de novo.');
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
  phone: string,
): Promise<AuthResult> {
  return postAuth('/auth/signup', { businessName, email, password, phone });
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
    throw new AuthError('rede', 'Sem conexão agora. Verifique sua internet e tente de novo.');
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
    throw new AuthError('rede', 'Sem conexão agora. Verifique sua internet e tente de novo.');
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
  /**
   * Cadastro da empresa concluído? (tem CNPJ). Vem sempre, mesmo com painel
   * vazio, porque o servidor sempre conhece a empresa. É a trava do onboarding
   * obrigatório: sem isso, o app não deixa passar para as abas.
   */
  onboarded: boolean;
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
    company: { id: string; name: string; niche: string; cnpj?: string | null };
    segment?: { id: string; label: string } | null;
    segmentIndicators?: SegmentIndicatorJson[];
    cadastro?: CadastroContext;
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
        segment: body.segment ?? null,
        segmentIndicators: body.segmentIndicators ?? [],
        cadastro: body.cadastro,
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
    onboarded: Boolean(body.company.cnpj),
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

/* --------------- Relatórios: série no tempo + histórico de recomendações --------------- */

export interface HistoryPointJson {
  asOf: string;
  value: number;
}
export interface HistoryIndicatorJson {
  key: string;
  label: string;
  unit: string | null;
  points: HistoryPointJson[];
}
export interface HistoryJson {
  snapshots: number;
  indicators: HistoryIndicatorJson[];
  stages: { asOf: string; stage: string }[];
}

/** Série de cada indicador ao longo do tempo (para os gráficos da aba Relatórios). */
export async function fetchMyHistory(token: string): Promise<HistoryJson> {
  const res = await fetchWithWake(`${apiBase()}/me/history`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} no histórico`);
  return (await res.json()) as HistoryJson;
}

export interface RecommendationJson {
  claimType: string;
  priority: 'alta' | 'media' | 'baixa';
  title: string;
  why: string;
  action: string;
  firstRecommendedOn: string;
  lastSeenOn: string;
  resolvedOn: string | null;
  status: 'aberta' | 'resolvida';
}

/** Histórico das recomendações de melhoria (com data e situação). */
export async function fetchMyRecommendations(token: string): Promise<RecommendationJson[]> {
  const res = await fetchWithWake(`${apiBase()}/me/recommendations`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} nas recomendações`);
  return ((await res.json()) as { recommendations: RecommendationJson[] }).recommendations;
}

/* --------------- Custo fixo por confirmação (inferido do histórico) --------------- */

export interface FixedCostSuggestionJson {
  label: string;
  monthlyCents: number;
  occurrences: number;
  category: string | null;
  months: string[];
}
export interface FixedCostItemJson {
  id: string;
  label: string;
  amountCents: number;
  category: string | null;
  source: 'inferred' | 'manual';
}
export interface FixedCostJson {
  suggestions: FixedCostSuggestionJson[];
  items: FixedCostItemJson[];
  declaredFixedCostCents: number | null;
}

/** O que o motor identificou como custo fixo recorrente + o que já foi confirmado. */
export async function fetchMyFixedCost(token: string): Promise<FixedCostJson> {
  const res = await fetchWithWake(`${apiBase()}/me/fixed-cost`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} no custo fixo`);
  return (await res.json()) as FixedCostJson;
}

/** Confirma a lista final de custos fixos. O servidor soma e recalcula o painel. */
export async function saveMyFixedCost(
  token: string,
  items: Array<{ label: string; amountCents: number; category?: string | null; source?: 'inferred' | 'manual' }>,
): Promise<{ items: FixedCostItemJson[]; declaredFixedCostCents: number }> {
  const res = await fetchWithWake(`${apiBase()}/me/fixed-cost`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ items }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar o custo fixo`);
  return (await res.json()) as { items: FixedCostItemJson[]; declaredFixedCostCents: number };
}

/* --------------- Cadastro da empresa: CNPJ, segmento, sistemas --------------- */

export interface CnpjSocio {
  nome: string;
  qualificacao: string | null;
}
export interface CnpjEndereco {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
}

/** Cadastro completo da empresa (o que o CNPJ trouxe + o que o dono confirmou). */
export interface CompanyJson {
  id: string;
  name: string;
  cnpj: string | null;
  niche: string;
  declaredFixedCostCents: number | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  cnaePrincipal: string | null;
  cnaeDescricao: string | null;
  endereco: CnpjEndereco | null;
  quadroSocietario: CnpjSocio[] | null;
  cnpjConsultadoEm: string | null;
}

export interface CnpjLookupResult {
  company: CompanyJson;
  suggestedNiche: string | null;
  source: 'brasilapi' | 'receitaws' | 'cache';
}

/** Mensagem de erro do servidor no CAMPO certo (CNPJ inválido / não encontrado). */
export class CampoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'CampoError';
  }
}

/** Consulta o CNPJ na base pública e grava no cadastro. Devolve o segmento sugerido. */
export async function lookupMyCnpj(token: string, cnpj: string): Promise<CnpjLookupResult> {
  const res = await fetchWithWake(`${apiBase()}/me/company/cnpj`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ cnpj }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (res.status === 422 || res.status === 404) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new CampoError(body.error ?? 'Não consegui consultar esse CNPJ.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar CNPJ`);
  return (await res.json()) as CnpjLookupResult;
}

/**
 * Confirma/corrige o segmento (e opcionalmente o nome de exibição). O `cnpj` é o
 * fallback do onboarding: se a consulta pública falhou, ainda gravamos o CNPJ que
 * o dono digitou para o cadastro contar como completo.
 */
export async function patchMyCompany(
  token: string,
  patch: { niche?: string; name?: string; cnpj?: string },
): Promise<{ company: CompanyJson }> {
  const res = await fetchWithWake(`${apiBase()}/me/company`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(patch),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (res.status === 422) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new CampoError(body.error ?? 'Segmento não suportado.');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar o segmento`);
  return (await res.json()) as { company: CompanyJson };
}

export type SystemPurpose = 'payables_receivables' | 'inventory' | 'services' | 'bank';
export type ExportFormat = 'pdf' | 'excel_csv' | 'photo' | 'none';
export interface CompanySystem {
  purpose: SystemPurpose;
  systemName: string | null;
  exportFormat: ExportFormat | null;
}

export async function fetchMyCompanySystems(token: string): Promise<CompanySystem[]> {
  const res = await fetchWithWake(`${apiBase()}/me/company/systems`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} nos sistemas`);
  return ((await res.json()) as { systems: CompanySystem[] }).systems;
}

export async function saveMyCompanySystems(
  token: string,
  systems: CompanySystem[],
): Promise<CompanySystem[]> {
  const res = await fetchWithWake(`${apiBase()}/me/company/systems`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ systems }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar os sistemas`);
  return ((await res.json()) as { systems: CompanySystem[] }).systems;
}

/* --------------- Import de arquivo: extrato → motor --------------- */

/** Tipos de documento que a aba Dados aceita (classificação do dono). */
export type DocType =
  | 'bank_statement'
  | 'inventory'
  | 'management'
  | 'services'
  | 'card_acquirer'
  | 'accounting'
  | 'payroll'
  | 'other';

export type ImportStatus = 'processed' | 'received' | 'error';

export interface ImportResult {
  /** o mesmo arquivo já tinha sido importado antes. */
  alreadyImported?: boolean;
  /** tipo classificado pelo dono. */
  docType?: DocType;
  /** situação do processamento. */
  status?: ImportStatus;
  /** de onde veio (inter_pdf / santander_pdf / ofx). */
  source?: string;
  rowsImported?: number;
  balancesImported?: number;
  warnings?: number;
}

/** Um arquivo já enviado, para a lista de transparência da aba Dados. */
export interface ImportItem {
  id: string;
  docType: string;
  filename: string | null;
  status: ImportStatus;
  periodStart: string | null;
  periodEnd: string | null;
  rowCount: number;
  importedAt: string;
}

/**
 * Manda o arquivo (base64) para o servidor LER e converter. O app não interpreta
 * nada do conteúdo; o servidor detecta o formato, roda o parser e recalcula o
 * painel. `docType` classifica o arquivo (o extrato bancário é lido; os demais
 * ficam "recebidos" até o leitor existir). Mensagem clara quando não dá pra ler.
 */
export async function importFile(
  token: string,
  filename: string,
  contentBase64: string,
  docType: DocType = 'bank_statement',
): Promise<ImportResult> {
  // idempotente por file_hash no servidor: seguro retentar em 502/503/504 (Render acordando)
  const res = await fetchWithWake(
    `${apiBase()}/me/import`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ filename, contentBase64, docType }),
    },
    { retryOn5xx: true },
  );
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (res.status === 422 || res.status === 413) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Não consegui ler esse arquivo.');
  }
  if (res.status >= 500) throw new Error('O servidor demorou para responder. Tente enviar de novo.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao importar o arquivo`);
  const body = (await res.json()) as { import?: ImportResult };
  return body.import ?? {};
}

/** Lista os arquivos já enviados (transparência do insumo). */
export async function fetchMyImports(token: string): Promise<ImportItem[]> {
  const res = await fetchWithWake(`${apiBase()}/me/imports`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} nos arquivos`);
  return ((await res.json()) as { imports: ImportItem[] }).imports;
}

/** Remove um arquivo enviado por engano. O servidor apaga e recalcula o painel. */
export async function deleteMyImport(token: string, id: string): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/me/imports/${id}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (res.status === 404) throw new Error('Arquivo não encontrado.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao remover o arquivo`);
}

/* --------------- Números do mês (indicadores de segmento) --------------- */

export type OpsUnit = 'cents' | 'count' | 'hours';

export interface SegmentFieldJson {
  slug: string;
  label: string;
  description: string;
  unit: OpsUnit;
  pointInTime?: boolean;
}

export interface SegmentCoverageJson {
  key: string;
  question: string;
  status: 'complete' | 'blocked';
  missing: string[];
}

export interface OperationsJson {
  /** Segmento da empresa (null = ainda sem segmento definido). */
  segment: string | null;
  segmentLabel: string | null;
  /** Definição do formulário: os campos que este segmento pede. */
  fields: SegmentFieldJson[];
  /** Meses já preenchidos, do mais recente ao mais antigo. */
  months: { month: string; values: Record<string, number> }[];
  coverage: SegmentCoverageJson[];
}

/** Lê os números do mês do dono logado + a definição dos campos do segmento. */
export async function fetchMyOperations(token: string): Promise<OperationsJson> {
  const res = await fetchWithWake(`${apiBase()}/me/operations`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} nos números do mês`);
  return (await res.json()) as OperationsJson;
}

/**
 * Grava os números de um mês e manda o motor recalcular. O app só envia os
 * valores (centavos para dinheiro, contagem/horas inteiras conforme o campo);
 * o servidor roda o core e devolve o painel já atualizado.
 */
export async function saveMyOperations(
  token: string,
  month: string,
  values: Record<string, number>,
): Promise<OperationsJson & { dashboard: DashboardJson | null }> {
  const res = await fetchWithWake(`${apiBase()}/me/operations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ month, values }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar os números do mês`);
  return (await res.json()) as OperationsJson & { dashboard: DashboardJson | null };
}

/* --------------- Diagnóstico de gestão (questionário) --------------- */

export type SurveyAnswerValue = 'sim' | 'parcial' | 'nao';

export interface SurveyQuestionJson {
  id: string;
  block: string;
  text: string;
}

export interface SurveyBlockScoreJson {
  block: string;
  label: string;
  score: number | null; // 0-100
  answered: number;
  total: number;
}

export interface SurveyResultJson {
  overall: number | null; // 0-100
  answeredCount: number;
  totalQuestions: number;
  blocks: SurveyBlockScoreJson[];
  weakest: { block: string; label: string; score: number; focus: string }[];
  weakestGaps: { block: string; questionId: string; text: string }[];
  answeredOn: string | null;
}

export interface SurveyJson {
  questions: SurveyQuestionJson[];
  blocks: { block: string; label: string; focus: string }[];
  answers: Record<string, SurveyAnswerValue>;
  result: SurveyResultJson;
  devolutiva: string;
}

export async function fetchMySurvey(token: string): Promise<SurveyJson> {
  const res = await fetchWithWake(`${apiBase()}/me/survey`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} no questionário`);
  return (await res.json()) as SurveyJson;
}

export async function saveMySurvey(
  token: string,
  answers: Record<string, SurveyAnswerValue>,
): Promise<SurveyJson> {
  const res = await fetchWithWake(`${apiBase()}/me/survey`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify({ answers }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar o questionário`);
  return (await res.json()) as SurveyJson;
}

/* --------------- Foto do avatar --------------- */

/** Foto atual do negócio como data URI, ou null (usa as iniciais). */
export async function fetchMyAvatar(token: string): Promise<string | null> {
  const res = await fetchWithWake(`${apiBase()}/me/avatar`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} na foto`);
  const { dataUri } = (await res.json()) as { dataUri: string | null };
  return dataUri;
}

/** Envia a foto já reduzida (base64) + tipo. O app manda pronto; servidor guarda. */
export async function saveMyAvatar(
  token: string,
  dataBase64: string,
  mime: string,
): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/me/avatar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ dataBase64, mime }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao salvar a foto`);
}

/** Remove a foto (volta para as iniciais). */
export async function removeMyAvatar(token: string): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/me/avatar`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} ao remover a foto`);
}

/* --------------- Assinatura (entitlement) --------------- */

export type SubscriptionStatus = 'pendente' | 'ativa' | 'cancelada';

export interface MySubscription {
  planId: string | null;
  planName: string | null;
  priceCents: number | null;
  chatLimit: number | null;
  status: SubscriptionStatus;
  /** validade da assinatura ('YYYY-MM-DD') ou null (ativa até cancelar). */
  until: string | null;
  /** true = pode usar os benefícios do plano. */
  active: boolean;
  /** Modo teste de assinatura ligado no servidor (ativa sem cobrar). */
  testMode: boolean;
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

export interface PlanJson {
  id: string;
  name: string;
  priceCents: number;
  chatLimitMonthly: number;
}

/** Planos ativos + modo teste, para a tela "Assine" (não exige login). */
export async function fetchPlans(): Promise<{ plans: PlanJson[]; testMode: boolean }> {
  const res = await fetchWithWake(`${apiBase()}/plans`);
  if (!res.ok) throw new Error(`HTTP ${res.status} nos planos`);
  const body = (await res.json()) as { plans: PlanJson[]; testMode?: boolean };
  return { plans: body.plans, testMode: body.testMode ?? false };
}

/** Ativa o plano NA HORA (modo teste, sem cobrança). Só funciona com o modo teste ligado. */
export async function activateTestSubscription(token: string, planId: string): Promise<MySubscription> {
  const res = await fetchWithWake(`${apiBase()}/me/subscription/activate-test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ planId }),
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessão expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} na ativação de teste`);
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
  method: 'POST' | 'PATCH' | 'DELETE',
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
  phone: string | null;
  plan: string | null;
  subscriptionStatus: SubscriptionStatus;
  chatQuota: number;
  isDemo: boolean;
  stage: DiagnosisStage | null;
  lastImportAt: string | null;
  daysSinceImport: number | null;
  daysSinceData: number | null;
  unopenedAlerts: number;
  chatQuestionsMonth: number;
  /** Cobertura de dados: indicadores calculados por completo / total. */
  coverageComplete: number;
  coverageTotal: number;
}

export interface AdminSummary {
  activeSubscribers: number;
  pendingPayment: number;
  monthlyRevenueCents: number;
  aiInteractionsMonth: number;
  subscriptionTestMode: boolean;
}

/** Liga/desliga o modo teste de assinatura (auditado no servidor). */
export function setAdminTestMode(token: string, enabled: boolean): Promise<{ subscriptionTestMode: boolean }> {
  return adminWrite(token, 'POST', '/admin/settings/test-mode', { enabled });
}

export interface AdminOverview {
  companies: AdminOverviewRow[];
  summary: AdminSummary;
  /** Contagem de empresas por segmento (item 7). */
  segments?: { niche: string; count: number }[];
}

export function fetchAdminOverview(token: string): Promise<AdminOverview> {
  return adminGet<AdminOverview>(token, '/admin/overview');
}

export interface AdminDossier {
  company: {
    id: string;
    name: string;
    cnpj: string | null;
    niche: string;
    phone: string | null;
    planId: string | null;
    plan: string | null;
    subscriptionStatus: SubscriptionStatus;
    isDemo: boolean;
    chatQuota: number;
    createdAt: string;
  };
  /** Números do negócio (em centavos) — o app só formata em R$. */
  businessNumbers: {
    cashCents: number | null;
    fixedCostCents: number | null;
    revenueCents: number | null;
    revenuePreviousCents: number | null;
  };
  /** O que conseguimos calcular com o que a empresa enviou. */
  coverage: {
    complete: number;
    partial: number;
    blocked: number;
    total: number;
    /** O que falta, em linguagem clara e sem repetir campo. */
    missing: string[];
    /** Detalhe por indicador que ainda não fecha. */
    items: Array<{ question: string; status: 'partial' | 'blocked'; missing: string[] }>;
  };
  chatUsedMonth: number;
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
    textTitle: string | null;
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
  cashInputs: Array<{ observedOn: string; balanceCents: number }>;
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
  phone?: string;
  chatQuota?: number;
  planId?: string;
  subscriptionStatus?: SubscriptionStatus;
  /** Trocar o segmento muda os indicadores calculados (o servidor recalcula). */
  niche?: string;
}

export function patchAdminCompany(
  token: string,
  id: string,
  patch: PatchEmpresa,
): Promise<{ id: string; name: string; phone: string | null; planId: string | null; subscriptionStatus: SubscriptionStatus; chatQuota: number; niche: string }> {
  return adminWrite(token, 'PATCH', `/admin/companies/${id}`, patch);
}

/** Números do mês (segmento) de uma empresa — para o admin ver. */
export function fetchAdminCompanyOperations(token: string, id: string): Promise<OperationsJson> {
  return adminGet<OperationsJson>(token, `/admin/companies/${id}/operations`);
}

/** Diagnóstico de gestão de uma empresa — para o admin ver. */
export function fetchAdminCompanySurvey(token: string, id: string): Promise<SurveyJson> {
  return adminGet<SurveyJson>(token, `/admin/companies/${id}/survey`);
}

/** Excluir cadastro: exige o nome exato como confirmação. Remove tudo (auditado). */
export function deleteAdminCompany(token: string, id: string, confirmName: string): Promise<{ ok: boolean }> {
  return adminWrite(token, 'DELETE', `/admin/companies/${id}`, { confirmName });
}

/* --------------- Planos (gestão no admin) --------------- */

export interface AdminPlan {
  id: string;
  name: string;
  priceCents: number;
  chatLimitMonthly: number;
  active: boolean;
  sort: number;
}

export function fetchAdminPlans(token: string): Promise<AdminPlan[]> {
  return adminGet<{ plans: AdminPlan[] }>(token, '/admin/plans').then((b) => b.plans);
}

export function createAdminPlan(
  token: string,
  plan: { id: string; name: string; priceCents: number; chatLimitMonthly: number; sort?: number },
): Promise<{ ok: boolean }> {
  return adminWrite(token, 'POST', '/admin/plans', plan);
}

export function patchAdminPlan(
  token: string,
  id: string,
  patch: { name?: string; priceCents?: number; chatLimitMonthly?: number; active?: boolean; sort?: number },
): Promise<{ ok: boolean }> {
  return adminWrite(token, 'PATCH', `/admin/plans/${id}`, patch);
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
  costCents: number;
}

export function fetchAdminAiUsage(token: string): Promise<AdminAiUsageRow[]> {
  return adminGet<{ usage: AdminAiUsageRow[] }>(token, '/admin/ai-usage').then((b) => b.usage);
}

export interface AdminEconomy {
  /** custo médio por interação (R$ centavos); null = sem conversa suficiente. */
  avgCostCents: number | null;
  byModel: Array<{ model: string; calls: number; avgCostCents: number }>;
  plans: Array<{
    id: string;
    name: string;
    priceCents: number;
    chatLimit: number;
    costAtFullCents: number | null;
    sobraCents: number | null;
  }>;
}

export function fetchAdminEconomy(token: string): Promise<AdminEconomy> {
  return adminGet<AdminEconomy>(token, '/admin/economy');
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
