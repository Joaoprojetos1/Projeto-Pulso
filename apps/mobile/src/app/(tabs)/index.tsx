/**
 * Dashboard — o painel do dono.
 * O app não calcula NADA: busca o JSON do servidor e desenha.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CountUpMoney } from '@/components/count-up-money';
import { PulsoLogo } from '@/components/logo';
import { PulseLine } from '@/components/pulse-line';
import type { CashProjectionPoint } from '@/lib/api';
import { brl, dataBR, dias, pct } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, type Severity } from '@/theme';

export default function Dashboard() {
  const { dashboard, fonte, carregando, carregar } = usePulso();
  // qual mini-card está aberto mostrando "de onde vem esse número" (null = nenhum)
  const [abertoChip, setAbertoChip] = useState<string | null>(null);

  if (!dashboard) {
    // enquanto busca sem dados ainda, mostra o "esqueleto" (não uma tela branca)
    if (carregando) return <SkeletonDashboard />;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.vazio}>
          <PulsoLogo size={30} />
          <Text style={styles.vazioTexto}>
            Assim que seus lançamentos chegarem, o monitor liga aqui.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.tentar, pressed && styles.pressionado]}
            onPress={carregar}
          >
            <Text style={styles.tentarTexto}>Tentar de novo</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const ind = dashboard.snapshot.indicators;
  const projecao = (ind.cash_projection?.value ?? null) as CashProjectionPoint[] | null;
  const p30 = projecao?.find((p) => p.horizonDays === 30) ?? null;
  const saldoHoje = (ind.cash_balance?.value ?? null) as number | null;
  const zeroOn = projecao?.find((p) => p.zeroOn)?.zeroOn ?? null;

  const ciclo = (ind.cash_cycle?.value ?? null) as number | null;
  const margem = (ind.contribution_margin?.value ?? null) as number | null;
  const receita = (ind.revenue_current?.value ?? null) as number | null;
  const receitaAnterior = (ind.revenue_previous?.value ?? null) as number | null;

  const curva = [saldoHoje, ...(projecao ?? []).map((p) => p.projectedCents)].filter(
    (v): v is number => typeof v === 'number',
  );

  const saudavel = !zeroOn;

  // mini-cards: o VALOR vem pronto do servidor; a frase é um texto-modelo que só
  // encaixa o número (o app não calcula nada — regra do CLAUDE.md).
  const miniCards = [
    {
      id: 'ciclo',
      rotulo: 'CICLO DE CAIXA',
      valor: ciclo !== null ? dias(ciclo) : '—',
      explica:
        ciclo !== null
          ? `Você leva em média ${dias(ciclo)} entre atender e o dinheiro cair na conta. Quanto menor, mais folga no caixa.`
          : 'Assim que houver movimento, mostro aqui quantos dias o dinheiro fica preso entre atender e receber.',
    },
    {
      id: 'margem',
      rotulo: 'MARGEM',
      valor: margem !== null ? pct(margem) : '—',
      positivo: true,
      explica:
        margem !== null
          ? `De cada R$ 100 que entram, sobram cerca de R$ ${Math.round(margem * 100)} depois dos custos que variam com a venda — é o que ajuda a pagar as contas fixas.`
          : 'A margem mostra quanto sobra de cada venda depois dos custos variáveis.',
    },
    {
      id: 'receita',
      rotulo: 'RECEITA / MÊS',
      valor: receita !== null ? brl(receita) : '—',
      explica:
        receita !== null
          ? `Foi quanto seu negócio faturou no mês (${brl(receita)}). Compare com o mês anterior ao lado.`
          : 'Quanto seu negócio faturou no mês.',
    },
    {
      id: 'mesAnterior',
      rotulo: 'MÊS ANTERIOR',
      valor: receitaAnterior !== null ? brl(receitaAnterior) : '—',
      explica:
        receitaAnterior !== null
          ? `Seu faturamento no mês passado foi ${brl(receitaAnterior)} — serve de referência pra ver se você cresceu.`
          : 'O faturamento do mês passado, pra comparar com o atual.',
    },
  ];
  const chipAberto = miniCards.find((c) => c.id === abertoChip) ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      >
        <View style={styles.topo}>
          <PulsoLogo size={26} />
          <Pressable
            onPress={() => router.push('/(tabs)/conta')}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressionado]}
            hitSlop={8}
            accessibilityLabel="Abrir minha conta"
          >
            <Text style={styles.avatarTexto}>
              {dashboard.company.name.replace(/^Clínica\s+/i, '').charAt(0)}
            </Text>
          </Pressable>
        </View>

        {fonte === 'demo' && (
          <View style={styles.selo}>
            <Text style={styles.seloTexto}>DEMONSTRAÇÃO · DADOS FICTÍCIOS</Text>
          </View>
        )}

        {/* cartão de caixa */}
        <View style={styles.cash}>
          <Text style={styles.cashRotulo}>CAIXA PROJETADO · 30 DIAS</Text>
          {p30 ? (
            <CountUpMoney cents={p30.projectedCents} style={styles.cashValor} />
          ) : (
            <Text style={styles.cashValor}>—</Text>
          )}
          <Text style={styles.cashDetalhe}>
            {saudavel ? (
              <>
                Pulso <Text style={styles.cashOk}>saudável</Text> · hoje em caixa:{' '}
                {saldoHoje !== null ? brl(saldoHoje) : '—'}
              </>
            ) : (
              <>
                Risco de zerar em <Text style={styles.cashRuim}>{dataBR(zeroOn!)}</Text> · hoje:{' '}
                {saldoHoje !== null ? brl(saldoHoje) : '—'}
              </>
            )}
          </Text>
          <PulseLine points={curva} color={saudavel ? colors.vivo : colors.critico} />
          {/* legenda do tempo sob o gráfico: horizontes que o servidor mandou */}
          {curva.length >= 2 && (
            <View style={styles.legenda}>
              {['hoje', ...(projecao ?? []).map((p) => `+${p.horizonDays}d`)]
                .slice(0, curva.length)
                .map((r) => (
                  <Text key={r} style={styles.legendaTexto}>
                    {r}
                  </Text>
                ))}
            </View>
          )}
          {!saudavel && zeroOn && (
            <View style={styles.pontoRisco}>
              <View style={styles.pontoRiscoBolha} />
              <Text style={styles.pontoRiscoTexto}>
                ponto de risco: {dataBR(zeroOn)}
              </Text>
            </View>
          )}
        </View>

        {/* chips de indicadores — tocáveis, abrem "de onde vem esse número" */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {miniCards.map((c) => (
            <Chip
              key={c.id}
              rotulo={c.rotulo}
              valor={c.valor}
              positivo={c.positivo}
              ativo={abertoChip === c.id}
              onPress={() => setAbertoChip((atual) => (atual === c.id ? null : c.id))}
            />
          ))}
        </ScrollView>

        {chipAberto && (
          <Animated.View entering={FadeIn.duration(180)} style={styles.explica}>
            <Text style={styles.explicaRotulo}>DE ONDE VEM ESSE NÚMERO</Text>
            <Text style={styles.explicaTexto}>{chipAberto.explica}</Text>
          </Animated.View>
        )}

        {/* alertas */}
        <Text style={styles.secao}>O que pede sua atenção</Text>
        <View style={styles.alertas}>
          {dashboard.alerts.map((a, i) => (
            <Pressable
              key={`${a.ruleKey}-${i}`}
              style={({ pressed }) => [styles.alerta, pressed && styles.pressionado]}
              onPress={() => router.push(`/alerta/${i}`)}
            >
              <View
                style={[styles.barra, { backgroundColor: severityColor[a.severity as Severity] }]}
              />
              <View style={styles.alertaMiolo}>
                <Text style={styles.alertaTitulo}>{a.textTitle ?? a.ruleKey}</Text>
                {a.textBody ? (
                  <Text style={styles.alertaCorpo} numberOfLines={2}>
                    {a.textBody}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={styles.rodape}>
          Atualizado em {dataBR(dashboard.snapshot.asOf)} · motor v{dashboard.snapshot.coreVersion}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  rotulo,
  valor,
  positivo,
  ativo,
  onPress,
}: {
  rotulo: string;
  valor: string;
  positivo?: boolean;
  ativo?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        ativo && styles.chipAtivo,
        pressed && styles.pressionado,
      ]}
    >
      <Text style={styles.chipRotulo}>{rotulo}</Text>
      <Text style={[styles.chipValor, positivo && { color: colors.okEscuro }]}>{valor}</Text>
    </Pressable>
  );
}

/** Formas cinza com brilho passando, enquanto os dados não chegam. */
function SkeletonDashboard() {
  const brilho = useSharedValue(0.4);
  useEffect(() => {
    brilho.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [brilho]);
  const estilo = useAnimatedStyle(() => ({ opacity: brilho.value }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.scroll}>
        <View style={styles.topo}>
          <PulsoLogo size={26} />
          <Animated.View style={[styles.skAvatar, estilo]} />
        </View>
        <Animated.View style={[styles.skCash, estilo]} />
        <View style={styles.skChips}>
          <Animated.View style={[styles.skChip, estilo]} />
          <Animated.View style={[styles.skChip, estilo]} />
          <Animated.View style={[styles.skChip, estilo]} />
        </View>
        <Animated.View style={[styles.skLinhaTitulo, estilo]} />
        <Animated.View style={[styles.skAlerta, estilo]} />
        <Animated.View style={[styles.skAlerta, estilo]} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { paddingBottom: 28 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  vazioTexto: {
    fontFamily: fonts.corpo,
    fontSize: 14,
    color: colors.cinza,
    textAlign: 'center',
    lineHeight: 21,
  },
  tentar: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 26,
    alignItems: 'center',
    marginTop: 2,
  },
  tentarTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.papel },

  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.mata,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { fontFamily: fonts.display, fontSize: 14, color: colors.vivo },

  selo: {
    alignSelf: 'flex-start',
    marginHorizontal: 18,
    marginBottom: 8,
    backgroundColor: '#FDF3E3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seloTexto: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.alerta },

  cash: {
    marginHorizontal: 16,
    backgroundColor: colors.mata,
    borderRadius: 20,
    padding: 18,
    gap: 4,
  },
  cashRotulo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.rotuloSobreMata,
  },
  cashValor: {
    fontFamily: fonts.displayBlack,
    fontSize: 32,
    color: colors.papel,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  cashDetalhe: { fontFamily: fonts.corpo, fontSize: 13, color: colors.papelSobreMata },
  cashOk: { fontFamily: fonts.corpoForte, color: colors.vivo },
  cashRuim: { fontFamily: fonts.corpoForte, color: '#F0A196' },

  legenda: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  legendaTexto: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.rotuloSobreMata,
  },
  pontoRisco: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pontoRiscoBolha: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F0A196' },
  pontoRiscoTexto: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    color: '#F0A196',
  },

  chips: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 0 },
  chip: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 8,
    minWidth: 104,
  },
  chipAtivo: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipRotulo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8, color: colors.cinza },
  chipValor: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.tinta,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  explica: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  explicaRotulo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.cinza },
  explicaTexto: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.tinta },

  secao: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.tinta,
    paddingHorizontal: 18,
    marginTop: 6,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  alertas: { paddingHorizontal: 16, gap: 8 },
  alerta: {
    flexDirection: 'row',
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  pressionado: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  barra: { width: 7, borderRadius: 4 },
  alertaMiolo: { flex: 1, gap: 2 },
  alertaTitulo: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.tinta },
  alertaCorpo: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza },

  rodape: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.cinza,
    textAlign: 'center',
    marginTop: 20,
  },

  // esqueleto (carregando)
  skAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.linha },
  skCash: { marginHorizontal: 16, height: 150, borderRadius: 20, backgroundColor: colors.linha },
  skChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  skChip: { width: 104, height: 46, borderRadius: 12, backgroundColor: colors.linha },
  skLinhaTitulo: {
    width: 180,
    height: 18,
    borderRadius: 6,
    backgroundColor: colors.linha,
    marginHorizontal: 18,
    marginTop: 6,
    marginBottom: 12,
  },
  skAlerta: { marginHorizontal: 16, height: 64, borderRadius: 14, backgroundColor: colors.linha, marginBottom: 8 },
});
