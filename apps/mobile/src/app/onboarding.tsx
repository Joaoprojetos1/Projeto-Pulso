/**
 * Onboarding: conectar os dados do negócio.
 * O envio do arquivo real depende do modelo de exportação do sistema da
 * clínica (a caminho). Até lá, a demonstração mostra o produto vivo.
 */

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulsoLogo } from '@/components/logo';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function Onboarding() {
  const { fonte, dashboard } = usePulso();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <PulsoLogo size={30} />

        <View style={styles.miolo}>
          <Text style={styles.titulo}>Vamos ligar o monitor no seu caixa</Text>
          <Text style={styles.corpo}>
            O Pulso lê os lançamentos do sistema do seu negócio (contas a receber, a pagar e o
            saldo) e passa a vigiar seu caixa todos os dias.
          </Text>

          <View style={styles.cartao}>
            <Text style={styles.cartaoRotulo}>COMO SEUS DADOS ENTRAM</Text>
            <Text style={styles.cartaoTexto}>
              1. Você exporta o arquivo do seu sistema (uma vez por semana).{'\n'}
              2. Envia aqui pelo app.{'\n'}
              3. O Pulso calcula tudo e avisa o que importa.
            </Text>
          </View>

          <View style={[styles.cartao, styles.cartaoAviso]}>
            <Text style={styles.cartaoRotulo}>NESTE PILOTO</Text>
            <Text style={styles.cartaoTexto}>
              O envio de arquivo abre em breve.{' '}
              {fonte === 'servidor'
                ? `Por ora, você está vendo os dados de ${dashboard?.company.name ?? 'seu negócio'} direto do servidor.`
                : 'Por ora, explore com a empresa de demonstração. Dados 100% fictícios.'}
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.botaoTexto}>
            {fonte === 'servidor' ? 'Ver meu painel' : 'Explorar a demonstração'}
          </Text>
        </Pressable>
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
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cartaoAviso: { borderLeftWidth: 4, borderLeftColor: colors.vivo },
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
  botao: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  pressionado: { opacity: 0.85 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: colors.papel },
});
