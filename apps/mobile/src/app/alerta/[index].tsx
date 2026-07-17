/**
 * Detalhe do alerta. A alma do produto está aqui: TODO alerta mostra
 * "de onde vem esse número" — os facts abertos, como vieram do servidor.
 * É a auditabilidade do motor virando confiança na tela.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { rotuloFact, valorFact } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, severityLabel, type Severity } from '@/theme';

export default function DetalheAlerta() {
  const { index } = useLocalSearchParams<{ index: string }>();
  const { dashboard } = usePulso();

  const alerta = dashboard?.alerts[Number(index)] ?? null;

  if (!alerta) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.vazio}>Alerta não encontrado.</Text>
      </SafeAreaView>
    );
  }

  const sev = alerta.severity as Severity;
  const cor = severityColor[sev];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable style={styles.fechar} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.cinza} />
        </Pressable>

        <View style={[styles.badge, { backgroundColor: `${cor}1A` }]}>
          <Text style={[styles.badgeTexto, { color: cor }]}>
            {severityLabel[sev].toUpperCase()}
          </Text>
        </View>

        <Text style={styles.titulo}>{alerta.textTitle ?? alerta.ruleKey}</Text>
        {alerta.textBody ? <Text style={styles.corpo}>{alerta.textBody}</Text> : null}

        <View style={styles.porque}>
          <Text style={styles.porqueRotulo}>DE ONDE VEM ESSE NÚMERO</Text>
          {Object.entries(alerta.facts).map(([chave, valor]) => (
            <View key={chave} style={styles.linha}>
              <Text style={styles.linhaChave}>{rotuloFact(chave)}</Text>
              <Text style={styles.linhaValor}>{valorFact(chave, valor)}</Text>
            </View>
          ))}
          <Text style={styles.porqueNota}>
            Estes são os números exatos que o motor do Pulso usou. Nada é estimado por IA.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.pressionado]}
          onPress={() => {
            router.back();
            router.push('/(tabs)/chat');
          }}
        >
          <Text style={styles.ctaTexto}>O que eu faço?</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 22, paddingBottom: 34 },
  vazio: { fontFamily: fonts.corpo, color: colors.cinza, textAlign: 'center', marginTop: 60 },

  fechar: { alignSelf: 'flex-end', marginBottom: 4 },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  badgeTexto: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2 },

  titulo: {
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 30,
    color: colors.tinta,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  corpo: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: colors.cinza },

  porque: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },
  porqueRotulo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.cinza,
    marginBottom: 6,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.linha,
  },
  linhaChave: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza, flexShrink: 1 },
  linhaValor: {
    fontFamily: fonts.displayMedio,
    fontSize: 14,
    color: colors.tinta,
    fontVariant: ['tabular-nums'],
  },
  porqueNota: {
    fontFamily: fonts.corpo,
    fontSize: 12,
    lineHeight: 17,
    color: colors.cinza,
    marginTop: 10,
  },

  cta: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  pressionado: { opacity: 0.85 },
  ctaTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.papel },
});
