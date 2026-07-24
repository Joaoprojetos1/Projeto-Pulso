/**
 * Primeira vez, logo após o cadastro: "Vamos ligar o monitor no seu caixa".
 * Aparece UMA única vez (só o cadastro chega aqui; login vai direto ao painel).
 * Duas saídas: ver o painel agora ou já enviar seus dados para o motor girar.
 */

import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulsoLogo } from '@/components/logo';
import { colors, fonts } from '@/theme';

export default function Onboarding() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <PulsoLogo size={30} />

        <View style={styles.miolo}>
          <Text style={styles.titulo}>Vamos ligar o monitor no seu caixa</Text>
          <Text style={styles.corpo}>
            O Pulso acompanha o dinheiro do seu negócio todos os dias e te avisa, em português claro,
            antes de o caixa apertar. Para o motor girar, ele precisa dos seus números.
          </Text>

          <View style={styles.cartao}>
            <Text style={styles.cartaoRotulo}>PARA COMEÇAR, ESCOLHA UM CAMINHO</Text>
            <Text style={styles.cartaoTexto}>
              Você pode enviar seus dados agora e já ver seu caixa projetado, ou dar uma olhada no
              painel primeiro e configurar quando quiser.
            </Text>
          </View>
        </View>

        <View style={styles.botoes}>
          <Pressable
            style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            onPress={() => router.replace('/configurar' as Href)}
          >
            <Text style={styles.botaoTexto}>Enviar meus dados</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.botaoLinha, pressed && styles.pressionado]}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.botaoLinhaTexto}>Ver meu painel</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  wrap: { flex: 1, padding: 24, paddingTop: 16 },
  miolo: { flex: 1, justifyContent: 'center', gap: 16 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 33,
    color: colors.tinta,
    letterSpacing: -0.5,
  },
  corpo: {
    fontFamily: fonts.corpo,
    fontSize: 16,
    lineHeight: 24,
    color: colors.cinza,
  },
  cartao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderLeftWidth: 4,
    borderLeftColor: colors.vivo,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cartaoRotulo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.cinza,
  },
  cartaoTexto: {
    fontFamily: fonts.corpo,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.tinta,
  },
  botoes: { gap: 10 },
  botao: {
    backgroundColor: colors.vivo,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: '#06231A' },
  botaoLinha: {
    borderWidth: 1.5,
    borderColor: colors.linha,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  botaoLinhaTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
  pressionado: { opacity: 0.85 },
});
