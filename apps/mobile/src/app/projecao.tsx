/**
 * Detalhe da projeção de caixa: o gráfico completo (com scrubbing — arrastar o
 * dedo mostra data e valor de cada dia) e a leitura de risco. É o "ver o detalhe"
 * que saiu do painel: lá o herói virou a barra de fôlego; aqui fica o instrumento.
 *
 * App burro: só desenha a curva que o servidor já calculou. Nenhum número nasce
 * aqui — a curva, os horizontes e a data de risco vêm do snapshot.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulseLine } from '@/components/pulse-line';
import type { CashProjectionPoint } from '@/lib/api';
import { brl, brlInteiro, dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

export default function Projecao() {
  const { dashboard } = usePulso();

  const ind = dashboard?.snapshot.indicators;
  const projecao = (ind?.cash_projection?.value ?? null) as CashProjectionPoint[] | null;
  const saldoHoje = (ind?.cash_balance?.value ?? null) as number | null;
  const zeroOn = projecao?.find((p) => p.zeroOn)?.zeroOn ?? null;
  const saudavel = !zeroOn;
  const p30 = projecao?.find((p) => p.horizonDays === 30) ?? null;

  const curvaDiaria = dashboard?.projectionCurve ?? [];
  const usaDiaria = curvaDiaria.length >= 2;
  const curva = usaDiaria
    ? curvaDiaria.map((p) => p.cents)
    : [saldoHoje, ...(projecao ?? []).map((p) => p.projectedCents)].filter(
        (v): v is number => typeof v === 'number',
      );
  const curvaDatas = usaDiaria ? curvaDiaria.map((p) => p.day) : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Projeção do caixa</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        <View style={styles.cartao}>
          <Text style={styles.rotulo}>CAIXA PROJETADO · 30 DIAS</Text>
          <Text style={styles.valor}>{p30 ? brlInteiro(p30.projectedCents) : '·'}</Text>
          <Text style={styles.detalhe}>Hoje em caixa: {saldoHoje !== null ? brl(saldoHoje) : '·'}</Text>

          {curva.length >= 2 ? (
            <>
              <PulseLine
                points={curva}
                dates={curvaDatas}
                height={130}
                color={saudavel ? colors.vivo : colors.critico}
              />
              <View style={styles.legenda}>
                {['hoje', ...(projecao ?? []).map((p) => `+${p.horizonDays}d`)]
                  .slice(0, curva.length)
                  .map((r) => (
                    <Text key={r} style={styles.legendaTexto}>
                      {r}
                    </Text>
                  ))}
              </View>
            </>
          ) : (
            <Text style={styles.semDados}>Ainda não há projeção para desenhar.</Text>
          )}

          {!saudavel && zeroOn && (
            <View style={styles.pontoRisco}>
              <View style={styles.pontoRiscoBolha} />
              <Text style={styles.pontoRiscoTexto}>ponto de risco: {dataBR(zeroOn)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.dica}>Arraste o dedo pela linha para ver a data e o valor de cada dia.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  conteudo: { padding: 16, gap: space.item, paddingBottom: space.block },
  cartao: { backgroundColor: colors.mata, borderRadius: 20, padding: 18, gap: 4 },
  rotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.rotuloSobreMata },
  valor: {
    fontFamily: fonts.displayBlack,
    fontSize: 32,
    color: colors.papel,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  detalhe: { fontFamily: fonts.corpo, fontSize: 13, color: colors.papelSobreMata, marginBottom: 4 },
  legenda: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: 2 },
  legendaTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5, color: colors.rotuloSobreMata },
  semDados: { fontFamily: fonts.corpo, fontSize: 13, color: colors.papelSobreMata, marginTop: space.tight },
  pontoRisco: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.tight },
  pontoRiscoBolha: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F0A196' },
  pontoRiscoTexto: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4, color: '#F0A196' },
  dica: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.cinza, textAlign: 'center' },
});
