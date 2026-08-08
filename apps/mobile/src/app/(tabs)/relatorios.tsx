/**
 * Aba Relatórios (item 2.9) — o histórico e a leitura de fundo do negócio.
 *
 * - Gráfico de cada indicador ao longo do tempo (universais e do segmento),
 *   com filtro por período e por indicador.
 * - Histórico do diagnóstico de gestão (resultado + respostas).
 * - Histórico das recomendações de melhoria, com data e situação.
 * - Documento para baixar/projetar numa reunião (marca + período + leitura da IA).
 *
 * O app não calcula NADA: busca as séries prontas do servidor e desenha.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line as SvgLine, Polyline } from 'react-native-svg';

import { RelatorioMensalCard, type RelatorioMensalHandle } from '@/components/relatorio-mensal';
import {
  fetchMyHistory,
  fetchMyOperations,
  fetchMyRecommendations,
  fetchMySurvey,
  type HistoryIndicatorJson,
  type HistoryJson,
  type OperationsJson,
  type RecommendationJson,
  type SurveyJson,
} from '@/lib/api';
import { brl, dataBR, dias, pct } from '@/lib/format';
import { relatorioFromDashboard } from '@/lib/relatorio';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

const PERIODOS: Array<{ id: number; label: string }> = [
  { id: 3, label: '3 meses' },
  { id: 6, label: '6 meses' },
  { id: 12, label: '12 meses' },
  { id: 0, label: 'Tudo' },
];

function valorPorUnidade(v: number, unit: string | null): string {
  switch (unit) {
    case 'ratio':
      return pct(v);
    case 'cents':
      return brl(v);
    case 'days':
      return dias(v);
    case 'times':
      return `${(Math.round(v * 10) / 10).toString().replace('.', ',')}x`;
    case 'count':
      return String(Math.round(v));
    default:
      return String(v);
  }
}

/** Corta a série para os últimos N meses (0 = tudo). */
function filtrarPeriodo(points: { asOf: string; value: number }[], meses: number) {
  if (meses <= 0 || points.length === 0) return points;
  const ultimo = points[points.length - 1]!.asOf;
  const [y, m, d] = ultimo.split('-').map(Number) as [number, number, number];
  const corte = new Date(Date.UTC(y, m - 1 - meses, d)).toISOString().slice(0, 10);
  return points.filter((p) => p.asOf >= corte);
}

export default function Relatorios() {
  const { token, dashboard, fonte } = usePulso();
  const demo = fonte === 'demo';
  const [history, setHistory] = useState<HistoryJson | null>(null);
  const [recs, setRecs] = useState<RecommendationJson[]>([]);
  const [survey, setSurvey] = useState<SurveyJson | null>(null);
  const [ops, setOps] = useState<OperationsJson | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState(6);
  const [indicadorSel, setIndicadorSel] = useState<string | null>(null);
  const relatorioRef = useRef<RelatorioMensalHandle>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    const [h, r, s, o] = await Promise.allSettled([
      fetchMyHistory(token),
      fetchMyRecommendations(token),
      fetchMySurvey(token),
      fetchMyOperations(token),
    ]);
    if (h.status === 'fulfilled') {
      setHistory(h.value);
      if (h.value.indicators.length > 0) setIndicadorSel((sel) => sel ?? h.value.indicators[0]!.key);
    }
    if (r.status === 'fulfilled') setRecs(r.value);
    if (s.status === 'fulfilled') setSurvey(s.value);
    if (o.status === 'fulfilled') setOps(o.value);
    setCarregando(false);
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const indicador: HistoryIndicatorJson | null = useMemo(
    () => history?.indicators.find((i) => i.key === indicadorSel) ?? history?.indicators[0] ?? null,
    [history, indicadorSel],
  );
  const pontos = useMemo(
    () => (indicador ? filtrarPeriodo(indicador.points, periodo) : []),
    [indicador, periodo],
  );

  const relatorioData = dashboard ? relatorioFromDashboard(dashboard, ops, survey, demo) : null;
  const result = survey?.result;
  const abertas = recs.filter((r) => r.status === 'aberta');
  const resolvidas = recs.filter((r) => r.status === 'resolvida');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Relatórios</Text>
        <Text style={styles.sub}>O histórico e a leitura de fundo do seu negócio.</Text>

        {/* ===== Indicadores ao longo do tempo ===== */}
        <Text style={styles.secao}>Indicadores ao longo do tempo</Text>
        {carregando ? (
          <ActivityIndicator color={colors.vivo} style={{ marginTop: 12 }} />
        ) : !history || history.indicators.length === 0 ? (
          <View style={styles.cartao}>
            <Text style={styles.vazio}>
              Ainda não há histórico suficiente. A cada recálculo, seus indicadores viram uma linha
              aqui.
            </Text>
          </View>
        ) : (
          <View style={styles.cartao}>
            {/* seletor de indicador */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selLinha}>
              {history.indicators.map((i) => {
                const on = (indicador?.key ?? '') === i.key;
                return (
                  <Pressable key={i.key} style={[styles.selChip, on && styles.selChipOn]} onPress={() => setIndicadorSel(i.key)}>
                    <Text style={[styles.selChipTexto, on && styles.selChipTextoOn]}>{i.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* filtro de período */}
            <View style={styles.periodos}>
              {PERIODOS.map((p) => {
                const on = periodo === p.id;
                return (
                  <Pressable key={p.id} style={[styles.periodoChip, on && styles.periodoChipOn]} onPress={() => setPeriodo(p.id)}>
                    <Text style={[styles.periodoTexto, on && styles.periodoTextoOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {indicador && (
              <>
                <View style={styles.graficoTopo}>
                  <Text style={styles.graficoLabel}>{indicador.label}</Text>
                  {pontos.length > 0 && (
                    <Text style={styles.graficoAtual}>
                      {valorPorUnidade(pontos[pontos.length - 1]!.value, indicador.unit)}
                    </Text>
                  )}
                </View>
                <Grafico pontos={pontos} unit={indicador.unit} />
                {pontos.length < 2 && (
                  <Text style={styles.graficoNota}>
                    Um ponto só por enquanto. Com mais recálculos a linha se forma.
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {/* ===== Documento para reunião ===== */}
        {relatorioData && !demo && (
          <>
            <Text style={styles.secao}>Documento do mês</Text>
            <Pressable
              style={({ pressed }) => [styles.docBtn, pressed && styles.pressionado]}
              onPress={() => relatorioRef.current?.gerar()}
            >
              <Ionicons name="download-outline" size={20} color="#06231A" />
              <Text style={styles.docBtnTexto}>Baixar relatório do mês</Text>
            </Pressable>
            <Text style={styles.docNota}>
              Documento com a marca, o período e a leitura do Pulso — para salvar ou projetar numa
              reunião com a equipe.
            </Text>
          </>
        )}

        {/* ===== Diagnóstico de gestão ===== */}
        <Text style={styles.secao}>Diagnóstico de gestão</Text>
        {result && result.answeredCount > 0 ? (
          <View style={styles.cartao}>
            {result.overall != null && (
              <View style={styles.notaLinha}>
                <Text style={styles.nota}>{result.overall}</Text>
                <Text style={styles.notaDe}>de 100 na gestão</Text>
              </View>
            )}
            {survey?.devolutiva ? <Text style={styles.devolutiva}>{survey.devolutiva}</Text> : null}
            <Pressable onPress={() => router.push('/questionario' as Href)}>
              <Text style={styles.link}>Revisar respostas →</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cartao}>
            <Text style={styles.vazio}>Você ainda não respondeu o diagnóstico de gestão.</Text>
            <Pressable style={({ pressed }) => [styles.botao, pressed && styles.pressionado]} onPress={() => router.push('/questionario' as Href)}>
              <Text style={styles.botaoTexto}>Responder agora</Text>
            </Pressable>
          </View>
        )}

        {/* ===== Histórico de recomendações ===== */}
        <Text style={styles.secao}>Recomendações de melhoria</Text>
        {recs.length === 0 ? (
          <View style={styles.cartao}>
            <Text style={styles.vazio}>Nenhuma recomendação por enquanto. Bom sinal.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {[...abertas, ...resolvidas].map((r) => (
              <View key={r.claimType} style={styles.rec}>
                <View style={styles.recTopo}>
                  <Text style={styles.recTitulo}>{r.title}</Text>
                  <View style={[styles.recBadge, { borderColor: r.status === 'aberta' ? colors.alerta : colors.vivo }]}>
                    <Text style={[styles.recBadgeTexto, { color: r.status === 'aberta' ? colors.alerta : colors.mata }]}>
                      {r.status === 'aberta' ? 'Aberta' : 'Resolvida'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.recAcao}>{r.action}</Text>
                <Text style={styles.recData}>
                  Desde {dataBR(r.firstRecommendedOn)}
                  {r.resolvedOn ? ` · resolvida em ${dataBR(r.resolvedOn)}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ===== Histórico de alertas ===== */}
        <Text style={styles.secao}>Histórico</Text>
        <Pressable style={({ pressed }) => [styles.cartaoLink, pressed && styles.pressionado]} onPress={() => router.push('/historico' as Href)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cartaoLinkTitulo}>Alertas e avisos</Text>
            <Text style={styles.cartaoLinkDesc}>Tudo que o Pulso já sinalizou, com data.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.cinza} />
        </Pressable>

        {/* documento renderizado fora da tela, capturado ao tocar em "Baixar" */}
        {relatorioData && <RelatorioMensalCard ref={relatorioRef} data={relatorioData} />}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Gráfico de linha simples (SVG). Normaliza min-max; o valor exato vem no topo. */
function Grafico({ pontos, unit }: { pontos: { asOf: string; value: number }[]; unit: string | null }) {
  const W = 320;
  const H = 120;
  const pad = 10;
  if (pontos.length === 0) {
    return <View style={styles.graficoVazio}><Text style={styles.graficoVazioTexto}>Sem dados no período.</Text></View>;
  }
  const valores = pontos.map((p) => p.value);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, pontos.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const coords = pontos.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <SvgLine x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke={colors.linha} strokeWidth={1} />
      {pontos.length >= 2 && <Polyline points={coords} fill="none" stroke={colors.vivo} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {pontos.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.value)} r={i === pontos.length - 1 ? 4 : 2.5} fill={colors.vivo} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 20, paddingBottom: 40 },
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.corpo, fontSize: 14.5, color: colors.cinza, marginTop: 2 },
  secao: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta, marginTop: 24, marginBottom: 8 },
  cartao: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, gap: 10 },
  vazio: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza },

  selLinha: { flexGrow: 0 },
  selChip: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, marginRight: 7, backgroundColor: colors.papel },
  selChipOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  selChipTexto: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  selChipTextoOn: { color: colors.mata, fontFamily: fonts.corpoMedio },

  periodos: { flexDirection: 'row', gap: 7 },
  periodoChip: { borderWidth: 1, borderColor: colors.linha, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  periodoChipOn: { borderColor: colors.mata, backgroundColor: colors.mata },
  periodoTexto: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza },
  periodoTextoOn: { color: colors.papel, fontFamily: fonts.corpoMedio },

  graficoTopo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  graficoLabel: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.tinta },
  graficoAtual: { fontFamily: fonts.display, fontSize: 20, color: colors.mata, fontVariant: ['tabular-nums'] },
  graficoNota: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza, fontStyle: 'italic' },
  graficoVazio: { height: 120, alignItems: 'center', justifyContent: 'center' },
  graficoVazioTexto: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },

  docBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 15 },
  docBtnTexto: { fontFamily: fonts.displayMedio, fontSize: 15.5, color: '#06231A' },
  docNota: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 19, color: colors.cinza, marginTop: 8 },

  notaLinha: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  nota: { fontFamily: fonts.display, fontSize: 34, color: colors.mata },
  notaDe: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  devolutiva: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.tinta },
  link: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.mata },
  botao: { backgroundColor: colors.vivo, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#06231A' },

  rec: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, padding: 14, gap: 6 },
  recTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recTitulo: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 14.5, color: colors.tinta },
  recBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  recBadgeTexto: { fontFamily: fonts.corpoMedio, fontSize: 11 },
  recAcao: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.cinza },
  recData: { fontFamily: fonts.mono, fontSize: 10.5, letterSpacing: 0.3, color: colors.cinza },

  cartaoLink: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16 },
  cartaoLinkTitulo: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  cartaoLinkDesc: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  pressionado: { opacity: 0.85 },
});
