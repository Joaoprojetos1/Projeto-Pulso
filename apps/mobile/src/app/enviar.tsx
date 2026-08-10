/**
 * Enviar arquivos — tela do ONBOARDING (fora das abas, sem gate de assinatura).
 *
 * Mesma experiência da aba Dados: seleção MÚLTIPLA, envio em lote com progresso
 * por arquivo e classificação por tipo. É por aqui que o onboarding abastece o
 * motor (vários documentos, de meses diferentes, de uma vez).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EnvioArquivos } from '@/components/envio-arquivos';
import { colors, fonts } from '@/theme';

export default function Enviar() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Enviar seus dados</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Tem vários documentos, de meses diferentes? Envie todos de uma vez. Diga o tipo de cada um —
          o Pulso lê o que sabe ler e guarda o resto.
        </Text>

        <EnvioArquivos />

        <Pressable
          style={({ pressed }) => [styles.continuar, pressed && styles.pressionado]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.continuarTexto}>Ir para o meu painel</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 17, color: colors.tinta },
  scroll: { padding: 20, paddingBottom: 40 },
  intro: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: colors.cinza },
  continuar: { borderWidth: 1.5, borderColor: colors.linha, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  continuarTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
  pressionado: { opacity: 0.85 },
});
