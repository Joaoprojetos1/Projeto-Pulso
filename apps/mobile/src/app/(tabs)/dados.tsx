/**
 * Aba Dados (itens 2.5 e 2.6): o dono envia quantos arquivos quiser, de quantos
 * meses quiser, cada um classificado por tipo, e vê a lista do que já enviou.
 * A UI de envio é o componente EnvioArquivos (reusado também no onboarding).
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EnvioArquivos } from '@/components/envio-arquivos';
import { colors, fonts } from '@/theme';

export default function Dados() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Seus dados</Text>
        <Text style={styles.sub}>
          Envie quantos arquivos quiser, de quantos meses precisar. Diga o tipo de cada um — assim o
          Pulso sabe o que fazer com ele.
        </Text>

        {/* fim da digitação: o custo fixo vem por confirmação do que o motor
            identificou nos arquivos, não digitado em branco */}
        <Pressable
          style={({ pressed }) => [styles.custoFixo, pressed && styles.pressionado]}
          onPress={() => router.push('/custo-fixo' as Href)}
        >
          <Ionicons name="repeat-outline" size={20} color={colors.mata} />
          <View style={{ flex: 1 }}>
            <Text style={styles.custoFixoTitulo}>Custos fixos</Text>
            <Text style={styles.custoFixoDesc}>Revise os gastos que se repetem todo mês (o Pulso identifica dos seus arquivos).</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.cinza} />
        </Pressable>

        <EnvioArquivos />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 20, paddingBottom: 40 },
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.corpo, fontSize: 14.5, lineHeight: 21, color: colors.cinza, marginBottom: 6 },
  custoFixo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderLeftWidth: 4,
    borderLeftColor: colors.vivo,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  custoFixoTitulo: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  custoFixoDesc: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, lineHeight: 18 },
  pressionado: { opacity: 0.85 },
});
