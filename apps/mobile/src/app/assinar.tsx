/**
 * "Assine o Pulso" — a tela de planos. É a porta de entrada de quem ainda está
 * com a assinatura pendente (as abas ficam bloqueadas até virar ativa) e também
 * a tela de upgrade para quem já assina. O app NÃO cobra: cada plano abre o
 * checkout no site (fora das lojas). O "Já paguei" reconsulta a assinatura.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Heartbeat } from '@/components/heartbeat';
import { fetchPlans, type PlanJson } from '@/lib/api';
import { brl } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

// checkout no site (sem comissão de loja). Configurável por env.
const CHECKOUT_BASE =
  process.env.EXPO_PUBLIC_CHECKOUT_URL ?? 'https://pulso-site.onrender.com/checkout.html';

export default function Assinar() {
  const { companyId, assinatura, atualizarAssinatura, sair } = usePulso();
  const [planos, setPlanos] = useState<PlanJson[] | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const jaAtivo = assinatura?.active ?? false;

  useEffect(() => {
    fetchPlans().then(setPlanos).catch(() => setPlanos([]));
  }, []);

  function abrirCheckout(plano: PlanJson) {
    const url = `${CHECKOUT_BASE}?plano=${plano.id}&empresa=${companyId ?? ''}&from=app`;
    void Linking.openURL(url);
    setMsg('Abrimos o checkout no navegador. Depois de pagar, volte e toque em "Já paguei".');
  }

  async function jaPaguei() {
    setVerificando(true);
    setMsg(null);
    const s = await atualizarAssinatura();
    setVerificando(false);
    if (s?.active) {
      router.replace('/(tabs)');
    } else {
      setMsg('Ainda não consta como paga. Se acabou de pagar, aguarde um instante e tente de novo.');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.conteudo}>
        {jaAtivo && router.canGoBack() && (
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.voltar}>
            <Ionicons name="chevron-back" size={22} color={colors.tinta} />
            <Text style={styles.voltarTexto}>Voltar</Text>
          </Pressable>
        )}

        <Animated.View entering={FadeInDown.duration(220)} style={styles.cabecalho}>
          <Heartbeat color={colors.vivo} width={72} height={24} />
          <Text style={styles.titulo}>{jaAtivo ? 'Seu plano' : 'Assine o Pulso'}</Text>
          <Text style={styles.subtitulo}>
            {jaAtivo
              ? 'Você pode trocar de plano quando quiser. A cobrança acontece no site.'
              : 'Escolha um plano para liberar o app. A cobrança acontece no site, sem comissão de loja.'}
          </Text>
        </Animated.View>

        {msg && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>{msg}</Text>
          </View>
        )}

        {planos === null ? (
          <ActivityIndicator color={colors.mata} style={{ marginTop: 30 }} />
        ) : (
          planos.map((p) => {
            const atual = jaAtivo && assinatura?.planId === p.id;
            return (
              <View key={p.id} style={[styles.plano, atual && styles.planoAtual]}>
                <View style={styles.planoTopo}>
                  <Text style={styles.planoNome}>{p.name}</Text>
                  {atual && <Text style={styles.selo}>SEU PLANO</Text>}
                </View>
                <Text style={styles.planoPreco}>
                  {brl(p.priceCents)}
                  <Text style={styles.planoMes}> /mês</Text>
                </Text>
                <View style={styles.beneficios}>
                  <Beneficio texto="Monitor de caixa e alertas antes do aperto" />
                  <Beneficio texto={`${p.chatLimitMonthly} conversas com a IA por mês`} />
                  <Beneficio texto="Contas a pagar e a receber, e o simulador" />
                </View>
                <Pressable
                  onPress={() => abrirCheckout(p)}
                  disabled={atual}
                  style={({ pressed }) => [styles.botao, atual && styles.botaoOff, pressed && styles.pressionado]}
                >
                  <Text style={styles.botaoTexto}>{atual ? 'Plano atual' : `Assinar ${p.name}`}</Text>
                </Pressable>
              </View>
            );
          })
        )}

        {!jaAtivo && (
          <Pressable
            onPress={jaPaguei}
            disabled={verificando}
            style={({ pressed }) => [styles.jaPaguei, pressed && styles.pressionado]}
          >
            {verificando ? (
              <ActivityIndicator color={colors.mata} size="small" />
            ) : (
              <Text style={styles.jaPagueiTexto}>Já paguei, atualizar</Text>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={sair}
          hitSlop={8}
          style={styles.sair}
        >
          <Text style={styles.sairTexto}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Beneficio({ texto }: { texto: string }) {
  return (
    <View style={styles.beneficio}>
      <Ionicons name="checkmark" size={16} color={colors.okEscuro} />
      <Text style={styles.beneficioTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  conteudo: { padding: 20, gap: 12, paddingBottom: 40 },
  voltar: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  voltarTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.tinta },

  cabecalho: { gap: 8, marginTop: 8, marginBottom: 4 },
  titulo: { fontFamily: fonts.display, fontSize: 26, color: colors.tinta, letterSpacing: -0.5 },
  subtitulo: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza },

  aviso: { backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 12, padding: 12 },
  avisoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.okEscuro, lineHeight: 19 },

  plano: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 16, padding: 18, gap: 6 },
  planoAtual: { borderColor: colors.vivo, borderWidth: 1.5 },
  planoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planoNome: { fontFamily: fonts.display, fontSize: 18, color: colors.tinta },
  selo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.okEscuro, backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  planoPreco: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  planoMes: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza, letterSpacing: 0 },
  beneficios: { gap: 6, marginTop: 6, marginBottom: 4 },
  beneficio: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  beneficioTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 19, color: colors.tinta },

  botao: { backgroundColor: colors.vivo, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  botaoOff: { backgroundColor: colors.papel, borderWidth: 1, borderColor: colors.linha },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#06231A' },

  jaPaguei: { borderWidth: 1.5, borderColor: colors.mata, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  jaPagueiTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },

  sair: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
  sairTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
  pressionado: { opacity: 0.8 },
});
