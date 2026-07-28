/**
 * Monta os dados do RELATÓRIO MENSAL a partir do que o servidor já mandou.
 *
 * O app é burro: NÃO calcula nada aqui. Só organiza números prontos (dashboard
 * do dono, ou dossiê do admin) + os números do mês + o diagnóstico de gestão no
 * formato que o cartão do relatório (components/relatorio-mensal.tsx) desenha.
 */

import type { AdminDossier, Comparativos, DashboardJson, IndicatorJson, OperationsJson, SurveyJson } from './api';
import { brl, dias, pct } from './format';
import type { RelatorioMensalData, RelatorioSerie } from '@/components/relatorio-mensal';
import { SEGMENT_LABEL, segmentIndicatorsFromPayload } from './segmentos';
import { colors, severityColor, type Severity } from '@/theme';

const STAGE_LABEL: Record<string, string> = { saudavel: 'Saudável', atencao: 'Atenção', pressao: 'Pressão', critico: 'Crítico', uti: 'UTI' };
const STAGE_SEV: Record<string, Severity> = { saudavel: 'ok', atencao: 'warn', pressao: 'warn', critico: 'critical', uti: 'critical' };

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** 'YYYY-MM-DD' → "julho de 2026". Vazio se não houver data. */
function mesExtenso(iso: string): string {
  if (!iso || iso.length < 7) return '';
  const [y, m] = iso.split('-');
  return `${MESES[Number(m) - 1]} de ${y}`;
}

/** Série mensal para o gráfico de barras: o 1º campo em R$ do segmento (fluxo). */
function serieDeOps(ops: OperationsJson | null): RelatorioSerie | null {
  if (!ops) return null;
  const campo = ops.fields.find((f) => f.unit === 'cents' && !f.pointInTime);
  if (!campo) return null;
  const ascendente = [...ops.months].reverse().slice(-6); // months vem DESC → ASC, últimos 6
  const barras = ascendente
    .filter((m) => typeof m.values[campo.slug] === 'number')
    .map((m) => ({ mes: m.month, valor: m.values[campo.slug]! }));
  if (barras.length < 2) return null;
  return { titulo: campo.label, barras };
}

function tendencia(c: { atual: number | null; anterior: number | null } | undefined): 'up' | 'down' | null {
  if (!c || c.atual === null || c.anterior === null) return null;
  return c.atual > c.anterior ? 'up' : c.atual < c.anterior ? 'down' : null;
}

/** Indicadores universais de topo (ciclo, margem, receita) com tendência. */
function universais(ind: Record<string, IndicatorJson> | undefined, comp?: Comparativos): RelatorioMensalData['universais'] {
  if (!ind) return [];
  const out: RelatorioMensalData['universais'] = [];
  const ciclo = num(ind.cash_cycle?.value);
  if (ciclo !== null) out.push({ rotulo: 'Ciclo de caixa', valor: dias(ciclo), tendencia: tendencia(comp?.cash_cycle) });
  const margem = num(ind.contribution_margin?.value);
  if (margem !== null) out.push({ rotulo: 'Margem', valor: pct(margem), tendencia: tendencia(comp?.contribution_margin) });
  const receita = num(ind.revenue_current?.value);
  if (receita !== null) out.push({ rotulo: 'Faturou no mês', valor: brl(receita), tendencia: tendencia(comp?.revenue_current) });
  return out;
}

function gestaoDoSurvey(survey: SurveyJson | null): RelatorioMensalData['gestao'] {
  if (!survey || survey.result.overall === null) return null;
  return { nota: survey.result.overall, frageis: survey.result.weakest.map((w) => w.label) };
}

/** Caixa projetado em 30 dias, a partir do payload de indicadores. */
function caixa30(ind: Record<string, IndicatorJson> | undefined): number | null {
  const proj = ind?.cash_projection?.value as Array<{ horizonDays: number; projectedCents: number }> | null | undefined;
  return proj?.find((p) => p.horizonDays === 30)?.projectedCents ?? null;
}

/** Relatório do DONO logado (dashboard + números do mês + questionário). */
export function relatorioFromDashboard(dash: DashboardJson, ops: OperationsJson | null, survey: SurveyJson | null, demo: boolean): RelatorioMensalData {
  const ind = dash.snapshot.indicators;
  const diag = dash.diagnosis ?? null;
  return {
    nome: dash.company.name,
    mesRef: mesExtenso(dash.snapshot.asOf),
    demo,
    estagio: diag ? STAGE_LABEL[diag.stage] ?? diag.stage : null,
    estagioCor: diag ? severityColor[STAGE_SEV[diag.stage] ?? 'ok'] : colors.vivo,
    saldoHoje: num(ind.cash_balance?.value),
    caixa30: caixa30(ind),
    folegoDias: num(ind.cash_projection?.inputs?.zeroInDays),
    universais: universais(ind, dash.comparativos),
    segmentoLabel: SEGMENT_LABEL[dash.company.niche] ?? null,
    segmentoIndicadores: segmentIndicatorsFromPayload(ind),
    serie: serieDeOps(ops),
    alertas: dash.alerts.map((a) => ({ titulo: a.textTitle ?? a.ruleKey, severidade: a.severity })),
    leituraIA: diag?.text?.body ?? null,
    gestao: gestaoDoSurvey(survey),
  };
}

/** Relatório de UMA empresa a partir do dossiê do admin. */
export function relatorioFromDossier(d: AdminDossier, ops: OperationsJson | null, survey: SurveyJson | null): RelatorioMensalData {
  const ind = d.snapshot?.indicators;
  const diag = d.snapshot?.diagnosis ?? null;
  return {
    nome: d.company.name,
    mesRef: mesExtenso(d.snapshot?.asOf ?? ''),
    demo: d.company.isDemo,
    estagio: diag ? STAGE_LABEL[diag.stage] ?? diag.stage : null,
    estagioCor: diag ? severityColor[STAGE_SEV[diag.stage] ?? 'ok'] : colors.vivo,
    saldoHoje: d.businessNumbers.cashCents,
    caixa30: caixa30(ind),
    folegoDias: num(ind?.cash_projection?.inputs?.zeroInDays),
    universais: universais(ind), // dossiê não traz comparativos
    segmentoLabel: SEGMENT_LABEL[d.company.niche] ?? null,
    segmentoIndicadores: segmentIndicatorsFromPayload(ind),
    serie: serieDeOps(ops),
    alertas: d.alerts.map((a) => ({ titulo: a.textTitle ?? a.ruleKey, severidade: a.severity })),
    leituraIA: diag?.text?.body ?? null,
    gestao: gestaoDoSurvey(survey),
  };
}
