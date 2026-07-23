/**
 * Conta. Sem checkout dentro do app — nem botão, nem link clicável de
 * pagamento (regra do KICKOFF: a assinatura acontece no site; é isso que
 * mantém a comissão da loja fora do ticket).
 */

import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMySubscription, type MySubscription } from '@/lib/api';
import { dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

// versão do app (de app.json). Um piloto sem canal de reclamação perde o melhor dado.
const VERSAO_APP = Constants.expoConfig?.version ?? '—';
const FEEDBACK_URL =
  'https://wa.me/553194287877?text=' +
  encodeURIComponent('Olá! Tenho um feedback sobre o app do Pulso: ');
// checkout no site (sem comissão de loja). from=app avisa a página que veio do app.
const CHECKOUT_URL = 'https://pulso-site.onrender.com/checkout.html?from=app';

const NOME_PLANO: Record<string, string> = {
  piloto: 'Piloto',
  essencial: 'Essencial',
  crescimento: 'Crescimento',
  pro: 'Pro',
};

export default function Conta() {
  const { dashboard, fonte, token, sair } = usePulso();
  const [assinatura, setAssinatura] = useState<MySubscription | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchMySubscription(token)
      .then((s) => { if (vivo) setAssinatura(s); })
      .catch(() => { /* silencioso: o cartão cai no texto padrão do piloto */ });
    return () => { vivo = false; };
  }, [token]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titulo}>Conta</Text>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>NEGÓCIO</Text>
          <Text style={styles.nome}>{dashboard?.company.name ?? '·'}</Text>
          <Text style={styles.detalhe}>
            {fonte === 'demo' ? 'Modo demonstração · dados fictícios' : 'Conectada ao servidor do Pulso'}
          </Text>
        </View>

        {fonte !== 'demo' && (
          <View style={styles.cartao}>
            <Text style={styles.rotulo}>MEUS NÚMEROS</Text>
            <Text style={styles.detalhe}>
              Mudou o caixa ou o custo fixo do mês? Atualize aqui e o Pulso refaz a projeção na hora.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.feedback, pressed && styles.pressionado]}
              onPress={() => router.push('/configurar' as Href)}
            >
              <Text style={styles.feedbackTexto}>Atualizar caixa e custo fixo</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>PLANO</Text>
          {assinatura?.active ? (
            <>
              <View style={styles.linhaAviso}>
                <Text style={styles.nome}>{NOME_PLANO[assinatura.plan] ?? assinatura.plan}</Text>
                <View style={styles.selo}>
                  <Text style={styles.seloTexto}>ATIVO</Text>
                </View>
              </View>
              <Text style={styles.detalhe}>
                Sua assinatura está ativa
                {assinatura.until ? ` até ${dataBR(assinatura.until)}` : ''}. Obrigado por fazer parte
                do Pulso.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.nome}>{NOME_PLANO[assinatura?.plan ?? 'piloto'] ?? 'Piloto'}</Text>
              <Text style={styles.detalhe}>
                Você está no piloto. Quando quiser assinar, a cobrança acontece no site do Pulso — sem
                comissão de loja e sem pagamento dentro do app.
              </Text>
              {fonte !== 'demo' && (
                <Pressable
                  style={({ pressed }) => [styles.assinar, pressed && styles.pressionado]}
                  onPress={() => Linking.openURL(CHECKOUT_URL)}
                >
                  <Text style={styles.assinarTexto}>Assinar o Pulso</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>AVISOS NO WHATSAPP</Text>
          <View style={styles.linhaAviso}>
            <Text style={styles.nome}>Alertas de caixa</Text>
            <View style={styles.selo}>
              <Text style={styles.seloTexto}>EM BREVE</Text>
            </View>
          </View>
          <Text style={styles.detalhe}>
            Quando o aviso pelo WhatsApp estiver ligado, os alertas sérios (como o caixa perto de
            zerar) chegam direto no seu número, uma vez por dia. Por enquanto você acompanha tudo aqui
            no app e no painel.
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>SEUS DADOS</Text>
          <Text style={styles.detalhe}>
            Os lançamentos do seu negócio ficam guardados no servidor do Pulso, protegidos e usados só
            para calcular seus indicadores. Nenhum dado seu treina IA nem é compartilhado.
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>AJUDA E FEEDBACK</Text>
          <Text style={styles.detalhe}>
            Encontrou um problema ou tem uma ideia? Sua opinião é o que mais ajuda a construir o Pulso.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.feedback, pressed && styles.pressionado]}
            onPress={() => Linking.openURL(FEEDBACK_URL)}
          >
            <Text style={styles.feedbackTexto}>Enviar feedback</Text>
          </Pressable>
          <Text style={styles.versao}>Pulso · versão {VERSAO_APP}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.sair, pressed && styles.pressionado]}
          onPress={() => {
            sair();
            router.replace('/');
          }}
        >
          <Text style={styles.sairTexto}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 18, gap: 12 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  cartao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    gap: 5,
  },
  rotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  nome: { fontFamily: fonts.display, fontSize: 17, color: colors.tinta, letterSpacing: -0.2 },
  detalhe: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza },
  linhaAviso: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selo: {
    backgroundColor: '#F0FBF6',
    borderWidth: 1,
    borderColor: colors.vivo,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  seloTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.okEscuro },

  feedback: {
    backgroundColor: colors.mata,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  feedbackTexto: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.papel },
  assinar: {
    backgroundColor: colors.vivo,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  assinarTexto: { fontFamily: fonts.displayMedio, fontSize: 14, color: '#06231A' },
  versao: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, color: colors.cinza, marginTop: 6 },

  sair: {
    borderWidth: 1.5,
    borderColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  pressionado: { opacity: 0.7 },
  sairTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
});
