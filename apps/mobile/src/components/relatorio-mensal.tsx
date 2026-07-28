/**
 * Relatório mensal — um documento por segmento para o dono baixar e apresentar
 * numa reunião com a equipe. Capa com marca e mês, estágio + fôlego, os
 * indicadores universais e os do segmento, um gráfico de barras da série mensal,
 * os alertas do período, a leitura da IA e a pontuação do diagnóstico de gestão.
 *
 * O app é burro: TODOS os números já vieram prontos do servidor. Aqui só
 * desenhamos e capturamos como imagem (react-native-view-shot) para compartilhar
 * ou salvar — o mesmo caminho do "Resumo para o contador".
 *
 * NOTA: geramos uma IMAGEM (PNG), não um .pdf de verdade — um PDF exigiria o
 * módulo nativo expo-print (novo APK). A imagem já serve para salvar e projetar.
 */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { Heartbeat } from '@/components/heartbeat';
import { brl, brlInteiro, dataBR } from '@/lib/format';
import { toqueLeve } from '@/lib/haptic';
import type { SegmentIndicatorView } from '@/lib/segmentos';
import { colors, fonts } from '@/theme';

export interface RelatorioSerie {
  titulo: string;
  barras: { mes: string; valor: number }[];
}

export interface RelatorioMensalData {
  nome: string;
  mesRef: string; // já formatado: "julho 2026" ou uma data
  demo?: boolean;
  estagio: string | null;
  estagioCor: string;
  saldoHoje: number | null;
  caixa30: number | null;
  /** dias até o caixa apertar (null = não zera no horizonte → fôlego saudável). */
  folegoDias: number | null;
  universais: { rotulo: string; valor: string; tendencia: 'up' | 'down' | null }[];
  segmentoLabel: string | null;
  segmentoIndicadores: SegmentIndicatorView[];
  serie: RelatorioSerie | null;
  alertas: { titulo: string; severidade: 'ok' | 'warn' | 'critical' }[];
  leituraIA: string | null;
  gestao: { nota: number; frageis: string[] } | null;
}

export interface RelatorioMensalHandle {
  gerar: () => Promise<void>;
}

const HORIZONTE = 90; // a barra de fôlego vai de 0 a 90 dias
const SEV_COR: Record<'ok' | 'warn' | 'critical', string> = {
  ok: colors.vivo,
  warn: colors.alerta,
  critical: colors.critico,
};

/** '2026-07' (mês curto) para os rótulos do gráfico. */
function mesCurto(m: string): string {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mm = Number(m.split('-')[1]);
  return nomes[mm - 1] ?? m;
}

export const RelatorioMensalCard = forwardRef<RelatorioMensalHandle, { data: RelatorioMensalData }>(
  function RelatorioMensalCard({ data }, ref) {
    const cartaoRef = useRef<View>(null);
    const [ocupado, setOcupado] = useState(false);

    useImperativeHandle(ref, () => ({
      async gerar() {
        if (ocupado) return;
        toqueLeve();
        setOcupado(true);
        try {
          const uri = await captureRef(cartaoRef, { format: 'png', quality: 1 });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Relatório do mês · ${data.nome}` });
          }
        } catch {
          // compartilhar cancelado/indisponível: sem alarde
        } finally {
          setOcupado(false);
        }
      },
    }));

    const saudavel = data.folegoDias === null;
    const folegoFrac = saudavel ? 1 : Math.max(0.04, Math.min(1, data.folegoDias! / HORIZONTE));
    const serieMax = data.serie && data.serie.barras.length ? Math.max(...data.serie.barras.map((b) => b.valor), 1) : 1;

    return (
      <View style={styles.foraDaTela} pointerEvents="none">
        <View ref={cartaoRef} collapsable={false} style={styles.folha}>
          {/* capa */}
          <View style={styles.topo}>
            <Text style={styles.marca}>Pulso</Text>
            <Heartbeat width={48} height={16} />
          </View>
          <Text style={styles.nome} numberOfLines={1}>{data.nome}</Text>
          <Text style={styles.subcapa}>
            Relatório do mês · {data.mesRef}
            {data.segmentoLabel ? ` · ${data.segmentoLabel}` : ''}
          </Text>
          {data.demo && <Text style={styles.demo}>DEMONSTRAÇÃO · DADOS FICTÍCIOS</Text>}

          {/* estágio + fôlego */}
          {data.estagio && (
            <View style={styles.estagioLinha}>
              <View style={[styles.estagioTag, { backgroundColor: data.estagioCor }]}>
                <Text style={styles.estagioTexto}>{data.estagio}</Text>
              </View>
              <Text style={styles.folegoRotulo}>
                {saudavel ? 'Fôlego saudável' : `Fôlego: ${data.folegoDias} dias`}
              </Text>
            </View>
          )}
          <View style={styles.folegoFundo}>
            <View style={[styles.folegoCheio, { width: `${Math.round(folegoFrac * 100)}%`, backgroundColor: saudavel ? colors.vivo : colors.critico }]} />
          </View>

          {/* caixa projetado 30d */}
          <View style={styles.destaque}>
            <Text style={styles.destaqueRotulo}>CAIXA PROJETADO · 30 DIAS</Text>
            <Text style={styles.destaqueValor}>{data.caixa30 !== null ? brlInteiro(data.caixa30) : '·'}</Text>
            <Text style={styles.destaqueSub}>Hoje em caixa: {data.saldoHoje !== null ? brl(data.saldoHoje) : '·'}</Text>
          </View>

          {/* indicadores universais com tendência */}
          {data.universais.length > 0 && (
            <>
              <Text style={styles.secao}>INDICADORES DO CAIXA</Text>
              <View style={styles.grade}>
                {data.universais.map((u) => (
                  <View key={u.rotulo} style={styles.celula}>
                    <Text style={styles.celulaRotulo}>{u.rotulo}</Text>
                    <View style={styles.celulaValorLinha}>
                      <Text style={styles.celulaValor}>{u.valor}</Text>
                      {u.tendencia && <Text style={styles.tend}>{u.tendencia === 'up' ? '▲' : '▼'}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* indicadores do segmento */}
          {data.segmentoIndicadores.length > 0 && (
            <>
              <Text style={styles.secao}>INDICADORES DO {(data.segmentoLabel ?? 'SEGMENTO').toUpperCase()}</Text>
              <View style={styles.listaSeg}>
                {data.segmentoIndicadores.map((s) => (
                  <View key={s.key} style={styles.segLinha}>
                    <Text style={styles.segRotulo}>{s.label}</Text>
                    <Text style={styles.segValor}>{s.valor}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* gráfico de barras da série mensal */}
          {data.serie && data.serie.barras.length > 1 && (
            <>
              <Text style={styles.secao}>{data.serie.titulo.toUpperCase()}</Text>
              <View style={styles.grafico}>
                {data.serie.barras.map((b) => (
                  <View key={b.mes} style={styles.barraCol}>
                    <Text style={styles.barraValor}>{brlInteiro(b.valor).replace('R$ ', '')}</Text>
                    <View style={[styles.barra, { height: Math.max(4, Math.round((b.valor / serieMax) * 90)) }]} />
                    <Text style={styles.barraMes}>{mesCurto(b.mes)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* leitura da IA */}
          {data.leituraIA && (
            <View style={styles.leitura}>
              <Text style={styles.leituraRotulo}>A LEITURA DO PULSO</Text>
              <Text style={styles.leituraTexto}>{data.leituraIA}</Text>
            </View>
          )}

          {/* alertas do período */}
          {data.alertas.length > 0 && (
            <>
              <Text style={styles.secao}>AVISOS DO PERÍODO</Text>
              {data.alertas.map((a, i) => (
                <View key={i} style={styles.alerta}>
                  <View style={[styles.alertaPonto, { backgroundColor: SEV_COR[a.severidade] }]} />
                  <Text style={styles.alertaTitulo}>{a.titulo}</Text>
                </View>
              ))}
            </>
          )}

          {/* diagnóstico de gestão */}
          {data.gestao && (
            <View style={styles.gestao}>
              <Text style={styles.gestaoRotulo}>DIAGNÓSTICO DE GESTÃO</Text>
              <Text style={styles.gestaoNota}>{data.gestao.nota}<Text style={styles.gestaoDe}> / 100</Text></Text>
              {data.gestao.frageis.length > 0 && (
                <Text style={styles.gestaoFraco}>Mais frágil: {data.gestao.frageis.join(' · ')}</Text>
              )}
            </View>
          )}

          <Text style={styles.rodape}>Números calculados pelo Pulso, nunca estimados. pulso-site.onrender.com</Text>
        </View>
      </View>
    );
  },
);

const LARGURA = 380;

const styles = StyleSheet.create({
  foraDaTela: { position: 'absolute', left: -9999, top: 0 },
  folha: { width: LARGURA, backgroundColor: colors.papel, padding: 26, gap: 6 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  marca: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.5 },
  nome: { fontFamily: fonts.display, fontSize: 20, color: colors.tinta, marginTop: 10, letterSpacing: -0.3 },
  subcapa: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  demo: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.alerta, marginTop: 4 },

  estagioLinha: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  estagioTag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  estagioTexto: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.papel },
  folegoRotulo: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.tinta },
  folegoFundo: { height: 8, borderRadius: 4, backgroundColor: colors.linha, marginTop: 6, overflow: 'hidden' },
  folegoCheio: { height: 8, borderRadius: 4 },

  destaque: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, marginTop: 14 },
  destaqueRotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  destaqueValor: { fontFamily: fonts.display, fontSize: 32, color: colors.tinta, letterSpacing: -0.7, fontVariant: ['tabular-nums'], marginTop: 4 },
  destaqueSub: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza, marginTop: 4 },

  secao: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza, marginTop: 18 },
  grade: { flexDirection: 'row', gap: 8, marginTop: 8 },
  celula: { flex: 1, backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, padding: 12, gap: 4 },
  celulaRotulo: { fontFamily: fonts.corpo, fontSize: 11, color: colors.cinza },
  celulaValorLinha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  celulaValor: { fontFamily: fonts.displayMedio, fontSize: 16, color: colors.tinta, fontVariant: ['tabular-nums'] },
  tend: { fontFamily: fonts.corpo, fontSize: 11, color: colors.cinza },

  listaSeg: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  segLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.linha },
  segRotulo: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.tinta },
  segValor: { fontFamily: fonts.displayMedio, fontSize: 14.5, color: colors.tinta, fontVariant: ['tabular-nums'] },

  grafico: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, marginTop: 10, height: 120, paddingTop: 14 },
  barraCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barraValor: { fontFamily: fonts.mono, fontSize: 8.5, color: colors.cinza },
  barra: { width: '70%', backgroundColor: colors.vivo, borderRadius: 4 },
  barraMes: { fontFamily: fonts.corpo, fontSize: 10, color: colors.cinza },

  leitura: { backgroundColor: colors.mata, borderRadius: 14, padding: 16, marginTop: 16 },
  leituraRotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.rotuloSobreMata },
  leituraTexto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.papelSobreMata, marginTop: 6 },

  alerta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  alertaPonto: { width: 8, height: 8, borderRadius: 4 },
  alertaTitulo: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },

  gestao: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, marginTop: 16 },
  gestaoRotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  gestaoNota: { fontFamily: fonts.display, fontSize: 30, color: colors.tinta, fontVariant: ['tabular-nums'], marginTop: 2 },
  gestaoDe: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.cinza },
  gestaoFraco: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta, marginTop: 2 },

  rodape: { fontFamily: fonts.corpo, fontSize: 11, color: colors.cinza, marginTop: 18, lineHeight: 15 },
});
