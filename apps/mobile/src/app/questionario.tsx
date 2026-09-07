/**
 * Diagnóstico de gestão — tela avulsa (aberta pela aba Relatórios).
 *
 * O fluxo em si vive em components/diagnostico-gestao.tsx, porque o mesmo
 * diagnóstico é o passo 5 do onboarding. Aqui é só a moldura: cabeçalho, voltar
 * e a conclusão que devolve o dono de onde ele veio.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiagnosticoGestao } from '@/components/diagnostico-gestao';
import { colors, fonts } from '@/theme';

export default function Questionario() {
  function sair() {
    if (router.canGoBack()) router.back();
    else router.replace('/relatorios' as Href);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cabecalho}>
        <Pressable onPress={sair} hitSlop={10} style={styles.voltar}>
          <Ionicons name="chevron-back" size={22} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Diagnóstico de gestão</Text>
        <View style={styles.voltar} />
      </View>

      <DiagnosticoGestao aoConcluir={sair} rotuloConcluir="Concluir" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.tinta },
});
