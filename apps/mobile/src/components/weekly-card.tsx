/**
 * Card "Sua semana" no topo do dashboard: o resumo do que mudou desde a semana
 * passada (texto vindo do servidor) + as variações numéricas com setas. O estado
 * lido/não-lido é local (AsyncStorage), por resumo. O app não calcula nada:
 * o texto e os números vêm prontos; aqui só desenhamos a direção da seta.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { WeeklySummaryJson } from '@/lib/api';
import { brl, dias } from '@/lib/format';
import { colors, fonts } from '@/theme';

function Variacao({
  rotulo,
  agora,
  antes,
  formato,
  menorEhMelhor = false,
}: {
  rotulo: string;
  agora: number | null;
  antes: number | null;
  formato: (v: number) => string;
  menorEhMelhor?: boolean;
}) {
  if (agora === null) return null;
  let seta = '→';
  let cor: string = colors.cinza;
  if (antes !== null && agora !== antes) {
    const subiu = agora > antes;
    const bom = menorEhMelhor ? !subiu : subiu;
    seta = subiu ? '↑' : '↓';
    cor = bom ? colors.okEscuro : colors.alerta;
  }
  return (
    <View style={styles.varLinha}>
      <Text style={styles.varRotulo}>{rotulo}</Text>
      <Text style={styles.varValor}>{formato(agora)}</Text>
      <Text style={[styles.varSeta, { color: cor }]}>{seta}</Text>
    </View>
  );
}

export function WeeklyCard({ summary }: { summary: WeeklySummaryJson }) {
  const chave = `pulso.semana.${summary.comparedTo}`;
  const [aberto, setAberto] = useState(false);
  const [lido, setLido] = useState(true); // assume lido até o storage dizer o contrário

  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(chave)
      .then((v) => vivo && setLido(v === '1'))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [chave]);

  function abrir() {
    setAberto((v) => !v);
    if (!lido) {
      setLido(true);
      void AsyncStorage.setItem(chave, '1');
    }
  }

  const f = summary.facts;

  return (
    <Pressable onPress={abrir} style={({ pressed }) => [styles.card, pressed && styles.pressionado]}>
      <View style={styles.topo}>
        <Text style={styles.rotulo}>SUA SEMANA</Text>
        {!lido && <View style={styles.novo} />}
      </View>
      <Text style={styles.titulo}>{summary.text.title}</Text>
      <Text style={styles.corpo} numberOfLines={aberto ? undefined : 2}>
        {summary.text.body}
      </Text>

      {aberto && (
        <Animated.View entering={FadeIn.duration(160)} style={styles.variacoes}>
          <Variacao rotulo="Caixa" agora={f.cashNowCents} antes={f.cashPrevCents} formato={brl} />
          <Variacao rotulo="Dinheiro preso" agora={f.cashCycleNow} antes={f.cashCyclePrev} formato={dias} menorEhMelhor />
          <Variacao rotulo="Receita" agora={f.revenueNowCents} antes={f.revenuePrevCents} formato={brl} />
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  pressionado: { opacity: 0.9 },
  topo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  novo: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.vivo },
  titulo: { fontFamily: fonts.display, fontSize: 17, color: colors.tinta, letterSpacing: -0.2, marginTop: 2 },
  corpo: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza },

  variacoes: { marginTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.linha, paddingTop: 10 },
  varLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  varRotulo: { flex: 1, fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  varValor: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.tinta, fontVariant: ['tabular-nums'] },
  varSeta: { fontFamily: fonts.corpoForte, fontSize: 15, width: 16, textAlign: 'center' },
});
