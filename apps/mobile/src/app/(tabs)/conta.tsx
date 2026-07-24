/**
 * Conta — padrão de mercado: cabeçalho com avatar + grupos de lista (ícone,
 * rótulo, chevron). Refinamento UX A8. Sem checkout DENTRO do app: a assinatura
 * acontece no site (é o que mantém a comissão da loja fora do ticket).
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EnviarContadorCard, type EnviarContadorHandle } from '@/components/enviar-contador';
import { fetchMyAvatar, fetchMySubscription, removeMyAvatar, saveMyAvatar, type CashProjectionPoint, type MySubscription } from '@/lib/api';
import { autenticar, biometriaDisponivel, biometriaLigada, definirBiometria } from '@/lib/biometria';
import { escolherDaGaleria, tirarFoto, type FotoComprimida } from '@/lib/foto-avatar';
import { dataBR } from '@/lib/format';
import { toqueLeve, toqueSucesso } from '@/lib/haptic';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, type Severity } from '@/theme';

type IonName = React.ComponentProps<typeof Ionicons>['name'];

// estágio → rótulo e severidade (só apresentação; o servidor manda o estágio pronto)
const STAGE_LABEL: Record<string, string> = {
  saudavel: 'Saudável', atencao: 'Atenção', pressao: 'Pressão', critico: 'Crítico', uti: 'UTI',
};
const STAGE_SEV: Record<string, Severity> = {
  saudavel: 'ok', atencao: 'warn', pressao: 'warn', critico: 'critical', uti: 'critical',
};

const VERSAO_APP = Constants.expoConfig?.version ?? '';
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
  const [bioDisponivel, setBioDisponivel] = useState(false);
  const [bioLigada, setBioLigada] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [subindoFoto, setSubindoFoto] = useState(false);
  const contadorRef = useRef<EnviarContadorHandle>(null);
  const demo = fonte === 'demo';
  const nome = dashboard?.company.name ?? '·';
  const podeEditarFoto = !demo && Platform.OS !== 'web';

  // retrato para o "Resumo para o contador" (só apresentação; nada é calculado aqui)
  const ind = dashboard?.snapshot.indicators;
  const proj = (ind?.cash_projection?.value ?? null) as CashProjectionPoint[] | null;
  const p30 = proj?.find((p) => p.horizonDays === 30) ?? null;
  const zeroOn = proj?.find((p) => p.zeroOn)?.zeroOn ?? null;
  const diag = dashboard?.diagnosis ?? null;
  const resumoContador = dashboard
    ? {
        nome: dashboard.company.name,
        data: dashboard.snapshot.asOf,
        saldoHoje: (ind?.cash_balance?.value ?? null) as number | null,
        caixa30: p30?.projectedCents ?? null,
        zeroOn,
        saudavel: !zeroOn,
        ciclo: (ind?.cash_cycle?.value ?? null) as number | null,
        margem: (ind?.contribution_margin?.value ?? null) as number | null,
        receita: (ind?.revenue_current?.value ?? null) as number | null,
        estagio: diag ? (STAGE_LABEL[diag.stage] ?? diag.stage) : null,
        estagioCor: diag ? severityColor[STAGE_SEV[diag.stage] ?? 'ok'] : colors.vivo,
        alertas: dashboard.alerts.map((a) => ({ titulo: a.textTitle ?? a.ruleKey, facts: a.facts })),
        demo,
      }
    : null;

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchMySubscription(token)
      .then((s) => { if (vivo) setAssinatura(s); })
      .catch(() => { /* silencioso: cai no texto padrão do piloto */ });
    return () => { vivo = false; };
  }, [token]);

  // estado atual da trava por biometria (só faz sentido logado no servidor)
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [disp, lig] = await Promise.all([biometriaDisponivel(), biometriaLigada()]);
      if (vivo) {
        setBioDisponivel(disp);
        setBioLigada(lig);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // foto atual do negócio (só logado no servidor)
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchMyAvatar(token)
      .then((uri) => { if (vivo) setAvatarUri(uri); })
      .catch(() => { /* silencioso: cai nas iniciais */ });
    return () => { vivo = false; };
  }, [token]);

  // aplica a foto escolhida: envia ao servidor e mostra na hora
  async function aplicarFoto(foto: FotoComprimida | null) {
    if (!foto || !token) return;
    setSubindoFoto(true);
    try {
      await saveMyAvatar(token, foto.base64, foto.mime);
      setAvatarUri(`data:${foto.mime};base64,${foto.base64}`);
      toqueSucesso();
    } catch {
      Alert.alert('Não consegui salvar a foto', 'Tente de novo em instantes.');
    } finally {
      setSubindoFoto(false);
    }
  }

  async function removerFoto() {
    if (!token) return;
    setSubindoFoto(true);
    try {
      await removeMyAvatar(token);
      setAvatarUri(null);
    } catch {
      /* silencioso */
    } finally {
      setSubindoFoto(false);
    }
  }

  // menu simples: galeria, câmera e (se houver foto) remover
  function mudarFoto() {
    if (!podeEditarFoto || subindoFoto) return;
    toqueLeve();
    const opcoes: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: 'Escolher da galeria', onPress: async () => aplicarFoto(await escolherDaGaleria()) },
      { text: 'Tirar foto', onPress: async () => aplicarFoto(await tirarFoto()) },
    ];
    if (avatarUri) opcoes.push({ text: 'Remover foto', style: 'destructive', onPress: removerFoto });
    opcoes.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert('Foto do negócio', undefined, opcoes);
  }

  // liga/desliga a trava; pede a biometria uma vez ao LIGAR (confirma que funciona)
  async function alternarBiometria(ligar: boolean) {
    toqueLeve();
    if (ligar) {
      const ok = await autenticar();
      if (!ok) return; // não conseguiu confirmar: mantém desligada
    }
    await definirBiometria(ligar);
    setBioLigada(ligar);
  }

  const planoSub = demo
    ? 'Demonstração · dados fictícios'
    : assinatura?.active
      ? `Plano ${assinatura.planName ?? 'ativo'} · ativo${assinatura.until ? ` até ${dataBR(assinatura.until)}` : ''}`
      : assinatura?.status === 'pendente'
        ? 'Assinatura pendente'
        : assinatura?.planName
          ? `Plano ${assinatura.planName} · ${assinatura.status}`
          : 'Sem plano ativo';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titulo}>Conta</Text>

        {/* cabeçalho: avatar (tocável para trocar a foto) + negócio + plano */}
        <View style={styles.cabecalho}>
          <Pressable
            onPress={mudarFoto}
            disabled={!podeEditarFoto}
            style={({ pressed }) => [styles.avatar, pressed && podeEditarFoto && styles.pressionado]}
            accessibilityLabel="Trocar a foto do negócio"
          >
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarFoto} />
            ) : (
              <Text style={styles.avatarTexto}>{iniciais(nome)}</Text>
            )}
            {podeEditarFoto && (
              <View style={styles.avatarCamera}>
                <Ionicons name="camera" size={12} color={colors.papel} />
              </View>
            )}
          </Pressable>
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
          <Linha
            icon="finger-print-outline"
            label="Proteger com biometria"
            sub={
              demo
                ? 'Entre com sua conta para usar'
                : !bioDisponivel
                  ? 'Cadastre uma digital ou rosto no aparelho'
                  : bioLigada
                    ? 'Pede digital ou rosto ao abrir'
                    : 'Desligado'
            }
            toggleValue={bioLigada}
            onToggle={!demo && bioDisponivel ? alternarBiometria : undefined}
          />
          <Linha
            icon="shield-checkmark-outline"
            label="Dados e privacidade"
            sub="Seus números são só seus"
            onPress={() => Linking.openURL(PRIVACIDADE_URL)}
            ultimo
          />
        </View>

        {/* grupo: contador + ajuda */}
        <View style={styles.grupo}>
          {resumoContador && (
            <Linha
              icon="document-text-outline"
              label="Resumo para o contador"
              sub="Gera uma imagem limpa do seu caixa para enviar ou salvar"
              onPress={() => contadorRef.current?.gerar()}
            />
          )}
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
          onPress={sair}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.critico} />
          <Text style={styles.sairTexto}>Sair</Text>
        </Pressable>

        <Text style={styles.versao}>Pulso · versão {VERSAO_APP}</Text>

        {/* cartão do resumo (fora da tela) — capturado ao tocar em "Resumo para o contador" */}
        {resumoContador && <EnviarContadorCard ref={contadorRef} resumo={resumoContador} />}
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
  toggleValue,
  onToggle,
  ultimo,
}: {
  icon: IonName;
  label: string;
  sub?: string;
  badge?: string;
  onPress?: () => void;
  /** Se presente, a linha mostra um interruptor no lugar da seta. */
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  ultimo?: boolean;
}) {
  const temToggle = onToggle !== undefined || toggleValue !== undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || temToggle}
      style={({ pressed }) => [styles.linha, !ultimo && styles.linhaBorda, pressed && onPress && !temToggle && styles.pressionado]}
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
      {temToggle ? (
        <Switch
          value={!!toggleValue}
          onValueChange={onToggle}
          disabled={!onToggle}
          trackColor={{ false: colors.linha, true: colors.vivo }}
          thumbColor={colors.branco}
        />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.cinza} />
      ) : null}
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
  avatarFoto: { width: 56, height: 56, borderRadius: 28 },
  avatarTexto: { fontFamily: fonts.display, fontSize: 20, color: colors.papel },
  avatarCamera: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.vivo,
    borderWidth: 2,
    borderColor: colors.papel,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
