/**
 * Conta — padrão de mercado: cabeçalho com avatar + grupos de lista (ícone,
 * rótulo, chevron). Refinamento UX A8. Sem checkout DENTRO do app: a assinatura
 * acontece no site (é o que mantém a comissão da loja fora do ticket).
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMySubscription, type MySubscription } from '@/lib/api';
import { dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

const VERSAO_APP = Constants.expoConfig?.version ?? '—';
const FEEDBACK_URL =
  'https://wa.me/553194287877?text=' +
  encodeURIComponent('Olá! Tenho um feedback sobre o app do Pulso: ');
const PRIVACIDADE_URL = 'https://pulso-site.onrender.com/privacidade.html';

/** Iniciais do negócio (até 2 letras) para o avatar. */
function iniciais(nome: string): string {
  const limpo = nome.replace(/^Cl[ií]nica\s+/i, '').trim();
  const partes = limpo.split(/\s+/).filter(Boolean);
  const letras = (partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1]![0] : '');
  return letras.toUpperCase() || '·';
}

export default function Conta() {
  const { dashboard, fonte, token, sair } = usePulso();
  const [assinatura, setAssinatura] = useState<MySubscription | null>(null);
  const demo = fonte === 'demo';
  const nome = dashboard?.company.name ?? '·';

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchMySubscription(token)
      .then((s) => { if (vivo) setAssinatura(s); })
      .catch(() => { /* silencioso: cai no texto padrão do piloto */ });
    return () => { vivo = false; };
  }, [token]);

  const planoSub = demo
    ? 'Demonstração · dados fictícios'
    : assinatura?.active
      ? `Plano ${assinatura.planName ?? '—'} · ativo${assinatura.until ? ` até ${dataBR(assinatura.until)}` : ''}`
      : assinatura?.status === 'pendente'
        ? 'Assinatura pendente'
        : assinatura?.planName
          ? `Plano ${assinatura.planName} · ${assinatura.status}`
          : 'Sem plano ativo';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titulo}>Conta</Text>

        {/* cabeçalho: avatar + negócio + plano */}
        <View style={styles.cabecalho}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexto}>{iniciais(nome)}</Text>
          </View>
          <View style={styles.cabecalhoMiolo}>
            <Text style={styles.cabecalhoNome} numberOfLines={1}>{nome}</Text>
            <Text style={styles.cabecalhoSub}>{planoSub}</Text>
          </View>
        </View>

        {/* grupo: dados e assinatura */}
        <View style={styles.grupo}>
          {!demo && (
            <Linha
              icon="cash-outline"
              label="Meus números"
              sub="Atualize seu caixa e custo fixo"
              onPress={() => router.push('/configurar' as Href)}
            />
          )}
          <Linha
            icon="card-outline"
            label="Plano e assinatura"
            sub={demo ? 'Entre com sua conta para assinar' : planoSub}
            badge={assinatura?.active ? 'ATIVO' : undefined}
            onPress={!demo ? () => router.push('/assinar' as Href) : undefined}
            ultimo
          />
        </View>

        {!demo && (
          <Pressable
            style={({ pressed }) => [styles.assinarBtn, pressed && styles.pressionado]}
            onPress={() => router.push('/assinar' as Href)}
          >
            <Text style={styles.assinarBtnTexto}>
              {assinatura?.active ? 'Trocar de plano' : 'Assine ou faça upgrade'}
            </Text>
          </Pressable>
        )}

        {/* grupo: avisos, segurança, privacidade */}
        <View style={styles.grupo}>
          <Linha icon="notifications-outline" label="Avisos no WhatsApp" sub="Em breve" />
          <Linha icon="lock-closed-outline" label="Segurança (biometria)" sub="Em breve" />
          <Linha
            icon="shield-checkmark-outline"
            label="Dados e privacidade"
            sub="Seus números são só seus"
            onPress={() => Linking.openURL(PRIVACIDADE_URL)}
            ultimo
          />
        </View>

        {/* grupo: ajuda */}
        <View style={styles.grupo}>
          <Linha
            icon="chatbubble-ellipses-outline"
            label="Ajuda e feedback"
            sub="Fale com a gente no WhatsApp"
            onPress={() => Linking.openURL(FEEDBACK_URL)}
            ultimo
          />
        </View>

        <Pressable
          style={({ pressed }) => [styles.sair, pressed && styles.pressionado]}
          onPress={() => {
            sair();
            router.replace('/');
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.critico} />
          <Text style={styles.sairTexto}>Sair</Text>
        </Pressable>

        <Text style={styles.versao}>Pulso · versão {VERSAO_APP}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Linha({
  icon,
  label,
  sub,
  badge,
  onPress,
  ultimo,
}: {
  icon: IonName;
  label: string;
  sub?: string;
  badge?: string;
  onPress?: () => void;
  ultimo?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.linha, !ultimo && styles.linhaBorda, pressed && onPress && styles.pressionado]}
    >
      <View style={styles.linhaIcone}>
        <Ionicons name={icon} size={18} color={colors.mata} />
      </View>
      <View style={styles.linhaMiolo}>
        <Text style={styles.linhaLabel}>{label}</Text>
        {sub ? <Text style={styles.linhaSub}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.selo}>
          <Text style={styles.seloTexto}>{badge}</Text>
        </View>
      ) : null}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.cinza} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 18, gap: 14 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
    marginBottom: 2,
  },

  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mata,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { fontFamily: fonts.display, fontSize: 20, color: colors.papel },
  cabecalhoMiolo: { flex: 1, gap: 2 },
  cabecalhoNome: { fontFamily: fonts.display, fontSize: 19, color: colors.tinta, letterSpacing: -0.3 },
  cabecalhoSub: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },

  grupo: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    overflow: 'hidden',
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  linhaBorda: { borderBottomWidth: 1, borderBottomColor: colors.linha },
  linhaIcone: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.papel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linhaMiolo: { flex: 1, gap: 1 },
  linhaLabel: { fontFamily: fonts.corpoForte, fontSize: 15, color: colors.tinta },
  linhaSub: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },

  selo: {
    backgroundColor: '#F0FBF6',
    borderWidth: 1,
    borderColor: colors.vivo,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  seloTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.okEscuro },

  assinarBtn: { backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  assinarBtnTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#06231A' },
  sair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(216,80,63,0.4)', // vermelho discreto do "Sair"
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  pressionado: { opacity: 0.6 },
  sairTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.critico },
  versao: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.cinza,
    textAlign: 'center',
    marginTop: 4,
  },
});
