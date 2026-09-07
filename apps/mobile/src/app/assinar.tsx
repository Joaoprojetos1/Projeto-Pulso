/**
 * "Assine o Ivo" — a tela de planos fora do onboarding. É a porta de quem volta
 * com a assinatura pendente (as abas ficam bloqueadas até virar ativa) e também
 * a tela de troca de plano para quem já assina.
 *
 * A lista de planos em si é o componente components/planos.tsx, o mesmo usado no
 * passo 7 do onboarding — para as duas portas nunca divergirem.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Heartbeat } from '@/components/heartbeat';
import { Planos, TarjaModoTeste, useModoTeste } from '@/components/planos';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

export default function Assinar() {
  const { assinatura, sair } = usePulso();
  const testMode = useModoTeste();
  const jaAtivo = assinatura?.active ?? false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* tarja permanente e impossível de ignorar — fica fora do scroll */}
      {testMode && <TarjaModoTeste />}
      <ScrollView contentContainerStyle={styles.conteudo}>
        {jaAtivo && router.canGoBack() && (
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.voltar}>
            <Ionicons name="chevron-back" size={22} color={colors.tinta} />
            <Text style={styles.voltarTexto}>Voltar</Text>
          </Pressable>
        )}

        <Animated.View entering={FadeInDown.duration(220)} style={styles.cabecalho}>
          <Heartbeat color={colors.vivo} width={72} height={24} />
          <Text style={styles.titulo}>{jaAtivo ? 'Seu plano' : 'Assine o Ivo'}</Text>
          <Text style={styles.subtitulo}>
            {jaAtivo
              ? 'Você pode trocar de plano quando quiser. A cobrança acontece no site.'
              : 'Escolha um plano para liberar o app. A cobrança acontece no site, sem comissão de loja.'}
          </Text>
        </Animated.View>

        <Planos aoAtivar={() => router.replace('/(tabs)')} />

        <Pressable onPress={sair} hitSlop={8} style={styles.sair}>
          <Text style={styles.sairTexto}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  conteudo: { padding: 20, gap: space.item, paddingBottom: space.block },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  voltarTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.tinta },

  cabecalho: { gap: space.tight, marginTop: space.tight, marginBottom: 4 },
  titulo: { fontFamily: fonts.display, fontSize: 26, color: colors.tinta, letterSpacing: -0.5 },
  subtitulo: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza },

  sair: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
  sairTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
});
