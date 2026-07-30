/**
 * Dashboard — o painel do dono.
 * O app não calcula NADA: busca o JSON do servidor e desenha.
 */

import { router, type Href } from 'expo-router';
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
import { WeeklyCard } from '@/components/weekly-card';
import type { CashProjectionPoint } from '@/lib/api';
import { toqueLeve } from '@/lib/haptic';
import { brl, dataBR, dias, pct } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, space, type Severity } from '@/theme';

interface Tend {
  seta: string;
  pct: number;
  bom: boolean;
}

// Diagnóstico: rótulo e severidade por estágio. Cor: saudável=vivo,
// atenção/pressão=alerta, crítico/uti=crítico (severityColor do tema).
const STAGE_LABEL: Record<string, string> = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  pressao: 'Pressão',
  critico: 'Crítico',
  uti: 'UTI',
};
const STAGE_SEV: Record<string, Severity> = {
  saudavel: 'ok',
  atencao: 'warn',
  pressao: 'warn',
  critico: 'critical',
  uti: 'critical',
};

/** Tendência atual × anterior. `menorEhMelhor` inverte o julgamento (ex.: ciclo). */
function tendencia(
  atual: number | null | undefined,
  anterior: number | null | undefined,
  menorEhMelhor: boolean,
): Tend | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  const dif = atual - anterior;
  if (dif === 0) return { seta: '→', pct: 0, bom: true };
  const pct = Math.round((Math.abs(dif) / Math.abs(anterior)) * 100);
  const subiu = dif > 0;
  return { seta: subiu ? '↑' : '↓', pct, bom: menorEhMelhor ? !subiu : subiu };
}

/** Estado de expansão do card "Primeiros passos" — persiste na sessão (não no disco). */
let primeirosPassosAbertoSessao = false;

export default function Dashboard() {
  const { dashboard, fonte, carregando, carregar, mostrandoCache, logado, erro } = usePulso();
  // qual mini-card está aberto mostrando "de onde vem esse número" (null = nenhum)
  const [abertoChip, setAbertoChip] = useState<string | null>(null);

  if (!dashboard) {
    // enquanto busca sem dados ainda, mostra o "esqueleto" (não uma tela branca)
    if (carregando) return <SkeletonDashboard />;
    // saindo da conta: não pisca a tela de configuração — o AuthGate já redireciona
    if (!logado && fonte !== 'demo') return <SafeAreaView style={styles.safe} edges={['top']} />;
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.vazioScroll}>
          <View style={styles.topo}>
            <PulsoLogo size={26} />
          </View>
          {erro ? (
            // ESTADO DE ERRO de carregamento: título e texto que dizem isso
            <>
              <Text style={styles.vazioTitulo}>Não consegui carregar seus números</Text>
              <Text style={styles.vazioSub}>Verifique sua conexão e tente de novo.</Text>
              <Pressable
                style={({ pressed }) => [styles.tentar, pressed && styles.pressionado]}
                onPress={carregar}
              >
                <Text style={styles.tentarTexto}>Tentar de novo</Text>
              </Pressable>
            </>
          ) : (
            // CONTA NOVA sem dados: boas-vindas + primeiros passos (a ação principal)
            <>
              <Text style={styles.vazioBoas}>Bem-vindo ao Pulso</Text>
              <PrimeirosPassos passos={montarPassos(null, 0)} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const ind = dashboard.snapshot.indicators;
  const projecao = (ind.cash_projection?.value ?? null) as CashProjectionPoint[] | null;
  const p30 = projecao?.find((p) => p.horizonDays === 30) ?? null;
  const saldoHoje = (ind.cash_balance?.value ?? null) as number | null;
  const zeroOn = projecao?.find((p) => p.zeroOn)?.zeroOn ?? null;

  // Fase 2: quantas contas previstas o servidor considerou na projeção (o app
  // só mostra o número que vem pronto — "de onde vem esse número").
  const projInputs = (ind.cash_projection?.inputs ?? {}) as Record<string, number | string | null>;
  const plannedCount = typeof projInputs.plannedCount === 'number' ? projInputs.plannedCount : 0;
  const plannedTotal = typeof projInputs.plannedTotalCents === 'number' ? projInputs.plannedTotalCents : 0;
  // dias de autonomia até o risco: CALCULADO PELO CORE (daysBetween no snapshot),
  // não nasce aqui. null = não zera no horizonte.
  const zeroInDays = typeof projInputs.zeroInDays === 'number' ? projInputs.zeroInDays : null;

  // primeiros passos: só para conta de verdade e enquanto faltar algo
  const passos = montarPassos(ind, plannedCount);
  const mostrarPassos = fonte === 'servidor' && passos.some((p) => !p.feito);

  const ciclo = (ind.cash_cycle?.value ?? null) as number | null;
  const margem = (ind.contribution_margin?.value ?? null) as number | null;
  const receita = (ind.revenue_current?.value ?? null) as number | null;
  const receitaAnterior = (ind.revenue_previous?.value ?? null) as number | null;

  // curva diária (item 14) quando o servidor manda; senão, os poucos pontos de sempre
  const curvaDiaria = dashboard.projectionCurve ?? [];
  const usaDiaria = curvaDiaria.length >= 2;
  const curva = usaDiaria
    ? curvaDiaria.map((p) => p.cents)
    : [saldoHoje, ...(projecao ?? []).map((p) => p.projectedCents)].filter(
        (v): v is number => typeof v === 'number',
      );

  const saudavel = !zeroOn;

  // tendência (atual × anterior) — vem pronta do servidor; o app só desenha a seta
  const comp = dashboard.comparativos;
  const tendCiclo = tendencia(comp?.cash_cycle.atual, comp?.cash_cycle.anterior, true);
  const tendMargem = tendencia(comp?.contribution_margin.atual, comp?.contribution_margin.anterior, false);
  const tendReceita = tendencia(comp?.revenue_current.atual, comp?.revenue_current.anterior, false);

  // mini-cards: o VALOR vem pronto do servidor; a frase é um texto-modelo que só
  // encaixa o número (o app não calcula nada — regra do CLAUDE.md).
  const miniCards: Array<{
    id: string;
    rotulo: string;
    tecnico?: string;
    valor: string;
    semDado?: boolean;
    positivo?: boolean;
    tend?: Tend | null;
    explica: string;
  }> = [
    {
      id: 'ciclo',
      rotulo: 'DINHEIRO PRESO',
      tecnico: 'ciclo de caixa',
      valor: ciclo !== null ? dias(ciclo) : '',
      semDado: ciclo === null,
      tend: tendCiclo,
      explica:
        ciclo !== null
          ? `Você leva em média ${dias(ciclo)} entre atender e o dinheiro cair na conta. Quanto menor, mais folga no caixa.`
          : 'Assim que houver movimento, mostro aqui quantos dias o dinheiro fica preso entre atender e receber.',
    },
    {
      id: 'margem',
      rotulo: 'O QUE SOBRA',
      tecnico: 'margem',
      valor: margem !== null ? pct(margem) : '',
      semDado: margem === null,
      tend: tendMargem,
      explica:
        margem !== null
          ? `De cada R$ 100 que entram, sobram cerca de R$ ${Math.round(margem * 100)} depois dos custos que variam com a venda. É o que ajuda a pagar as contas fixas.`
          : 'A margem mostra quanto sobra de cada venda depois dos custos variáveis.',
    },
    {
      id: 'receita',
      rotulo: 'FATUROU NO MÊS',
      tecnico: 'receita',
      valor: receita !== null ? brl(receita) : '',
      semDado: receita === null,
      tend: tendReceita,
      explica:
        receita !== null
          ? `Foi quanto seu negócio faturou no mês (${brl(receita)}). Compare com o mês anterior ao lado.`
          : 'Quanto seu negócio faturou no mês.',
    },
    {
      id: 'mesAnterior',
      rotulo: 'MÊS ANTERIOR',
      valor: receitaAnterior !== null ? brl(receitaAnterior) : '',
      semDado: receitaAnterior === null,
      explica:
        receitaAnterior !== null
          ? `Seu faturamento no mês passado foi ${brl(receitaAnterior)}. Serve de referência pra ver se você cresceu.`
          : 'O faturamento do mês passado, pra comparar com o atual.',
    },
  ];
  const chipAberto = miniCards.find((c) => c.id === abertoChip) ?? null;

  // diagnóstico do momento (o servidor manda pronto; o app só desenha)
  const diag = dashboard.diagnosis ?? null;
  const diagCor = diag ? severityColor[STAGE_SEV[diag.stage] ?? 'ok'] : colors.vivo;

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

        {mostrandoCache && (
          <View style={styles.offline}>
            <Text style={styles.offlineTexto}>
              Offline · mostrando o último dado de {dataBR(dashboard.snapshot.asOf)}
            </Text>
          </View>
        )}

        {mostrarPassos && <PrimeirosPassos passos={passos} />}

        {/* ===== PRIMEIRA DOBRA: até quando o dinheiro dura ===== */}

        {/* cartão de caixa — herói, com a BARRA DE FÔLEGO no lugar do gráfico */}
        <View style={styles.cash}>
          {diag && (
            <View style={styles.cashTopo}>
              <View style={[styles.diagBadge, { backgroundColor: diagCor }]}>
                <Text style={styles.diagBadgeTexto}>{STAGE_LABEL[diag.stage] ?? diag.stage}</Text>
              </View>
              {diag.transitions.direction === 'piorou' && (
                <Text style={[styles.cashTend, { color: '#F0A196' }]}>↑ piorou</Text>
              )}
              {diag.transitions.direction === 'melhorou' && (
                <Text style={[styles.cashTend, { color: '#7FE7B8' }]}>↓ melhorou</Text>
              )}
            </View>
          )}
          <Text style={styles.cashRotulo}>CAIXA PROJETADO · 30 DIAS</Text>
          {p30 ? (
            <CountUpMoney cents={p30.projectedCents} style={styles.cashValor} inteiro />
          ) : (
            <Text style={styles.cashValor}>-</Text>
          )}
          <Text style={styles.cashDetalhe}>
            Hoje em caixa: {saldoHoje !== null ? brl(saldoHoje) : '·'}
          </Text>

          <BarraFolego zeroInDays={zeroInDays} zeroOn={zeroOn} saudavel={saudavel} cor={diagCor} />

          {plannedCount > 0 && (
            <Text style={styles.cashPrevistas}>
              Considera {plannedCount}{' '}
              {plannedCount === 1 ? 'lançamento previsto seu' : 'lançamentos previstos seus'} ·{' '}
              {brl(plannedTotal)}
            </Text>
          )}
          {curva.length >= 2 && (
            <Pressable
              onPress={() => router.push('/projecao' as Href)}
              style={({ pressed }) => [styles.verDetalhe, pressed && styles.pressionado]}
            >
              <Text style={styles.verDetalheTexto}>Ver o detalhe da projeção →</Text>
            </Pressable>
          )}
        </View>

        {/* faixa de atenção — de uma linha, tocável */}
        <View style={styles.alertas}>
          {dashboard.alerts.map((a, i) => (
            <Pressable
              key={`${a.ruleKey}-${i}`}
              style={({ pressed }) => [styles.faixa, pressed && styles.pressionado]}
              onPress={() => {
                toqueLeve();
                router.push(`/alerta/${i}`);
              }}
            >
              <View style={[styles.barra, { backgroundColor: severityColor[a.severity as Severity] }]} />
              {fonte !== 'demo' && !a.openedAt && (
                <View
                  style={[styles.naoLidoPonto, { backgroundColor: severityColor[a.severity as Severity] }]}
                />
              )}
              <Text style={styles.faixaTitulo} numberOfLines={1}>
                {a.textTitle ?? a.ruleKey}
              </Text>
              <Text style={styles.faixaChevron}>›</Text>
            </Pressable>
          ))}
        </View>

        {fonte !== 'demo' && (
          <Pressable
            onPress={() => router.push('/simular' as Href)}
            style={({ pressed }) => [styles.simular, pressed && styles.pressionado]}
          >
            <Text style={styles.simularTexto}>Testar uma decisão →</Text>
          </Pressable>
        )}

        {/* ===== SEGUNDA DOBRA: indicadores, resumo, histórico ===== */}

        {/* chips de indicadores — tocáveis, abrem "de onde vem esse número" */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {miniCards.map((c) => (
            <Chip
              key={c.id}
              rotulo={c.rotulo}
              tecnico={c.tecnico}
              valor={c.valor}
              semDado={c.semDado}
              tend={c.tend}
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

        {/* resumo da semana — cartão discreto */}
        {dashboard.weeklySummary && <WeeklyCard summary={dashboard.weeklySummary} />}

        {fonte !== 'demo' && (
          <Pressable
            onPress={() => router.push('/historico' as Href)}
            style={({ pressed }) => [styles.verHistorico, pressed && styles.pressionado]}
          >
            <Text style={styles.verHistoricoTexto}>Ver histórico de alertas →</Text>
          </Pressable>
        )}

        <Text style={styles.rodape}>
          Atualizado em {dataBR(dashboard.snapshot.asOf)} · motor v{dashboard.snapshot.coreVersion}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

interface Passo {
  chave: string;
  label: string;
  feito: boolean;
  rota: Href;
}

/** O que falta o dono fazer para o motor girar. Vazio quando tudo pronto. */
function montarPassos(
  ind: Record<string, { value?: unknown } | undefined> | null,
  plannedCount: number,
): Passo[] {
  const caixaInformado = (ind?.cash_balance?.value ?? null) !== null;
  return [
    {
      chave: 'caixa',
      label: 'Alimente o Pulso com seus dados (extrato, maquininha, DRE ou à mão)',
      feito: caixaInformado,
      rota: '/alimentar' as Href,
    },
    {
      chave: 'contas',
      label: 'Cadastre suas contas a receber e a pagar',
      feito: plannedCount > 0,
      rota: '/(tabs)/contas' as Href,
    },
  ];
}

/**
 * Card de primeiros passos, RECOLHÍVEL. Nasce fechado (uma linha: título +
 * progresso + chevron) para o cartão de caixa dominar a tela desde a abertura;
 * expande no toque e o estado persiste na sessão. Some inteiro quando tudo pronto
 * (o chamador só o renderiza enquanto há passo pendente).
 */
function PrimeirosPassos({ passos }: { passos: Passo[] }) {
  const [aberto, setAberto] = useState(primeirosPassosAbertoSessao);
  const feitos = passos.filter((p) => p.feito).length;

  function alternar() {
    const novo = !aberto;
    setAberto(novo);
    primeirosPassosAbertoSessao = novo; // persiste enquanto o app estiver aberto
  }

  return (
    <View style={styles.passos}>
      <Pressable onPress={alternar} style={({ pressed }) => [styles.passosCab, pressed && styles.pressionado]}>
        <View style={styles.passosCabTexto}>
          <Text style={styles.passosTitulo}>Primeiros passos</Text>
          <Text style={styles.passosProgresso}>
            {feitos} de {passos.length} concluídos
          </Text>
        </View>
        <Text style={[styles.passosChevron, aberto && styles.passosChevronAberto]}>›</Text>
      </Pressable>

      {aberto && (
        <View style={styles.passosLista}>
          {passos.map((p) => (
            <Pressable
              key={p.chave}
              disabled={p.feito}
              onPress={() => router.push(p.rota)}
              style={({ pressed }) => [styles.passoItem, pressed && !p.feito && styles.pressionado]}
            >
              {/* concluído: check verde + texto esmaecido, SEM risco (não é cancelado) */}
              <View style={[styles.passoBolinha, p.feito && styles.passoBolinhaFeita]}>
                {p.feito ? <Text style={styles.passoCheck}>✓</Text> : null}
              </View>
              <Text style={[styles.passoLabel, p.feito && styles.passoLabelFeito]}>{p.label}</Text>
              {!p.feito && <Text style={styles.passoSeta}>›</Text>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Barra de fôlego (autonomia do caixa). É o herói de leitura do painel: numa
 * ponta "hoje", na outra a data de risco, preenchida na cor de severidade, com a
 * frase por cima em linguagem de dono. Não cria número: os dias de autonomia
 * (zeroInDays) e a data (zeroOn) vêm calculados do core no snapshot.
 */
function BarraFolego({
  zeroInDays,
  zeroOn,
  saudavel,
  cor,
}: {
  zeroInDays: number | null;
  zeroOn: string | null;
  saudavel: boolean;
  cor: string;
}) {
  const HORIZONTE = 90; // janela da projeção; só define a escala visual da barra
  const prop = saudavel || zeroInDays === null ? 1 : Math.max(0.06, Math.min(zeroInDays / HORIZONTE, 1));
  const frase =
    saudavel || zeroOn === null
      ? 'Seu caixa está saudável. Sem risco à vista nos próximos 90 dias.'
      : `Seu caixa aguenta até ${dataBR(zeroOn)}${zeroInDays !== null ? `, ${dias(zeroInDays)}` : ''}.`;
  const fim = saudavel || zeroOn === null ? '+90 dias' : dataBR(zeroOn);
  return (
    <View style={styles.folego}>
      <Text style={styles.folegoFrase}>{frase}</Text>
      <View style={styles.folegoTrilha}>
        <View style={[styles.folegoCheia, { width: `${prop * 100}%`, backgroundColor: cor }]} />
      </View>
      <View style={styles.folegoPontas}>
        <Text style={styles.folegoPonta}>hoje</Text>
        <Text style={styles.folegoPonta}>{fim}</Text>
      </View>
    </View>
  );
}

function Chip({
  rotulo,
  tecnico,
  valor,
  semDado,
  tend,
  ativo,
  onPress,
}: {
  rotulo: string;
  tecnico?: string;
  valor: string;
  semDado?: boolean;
  tend?: Tend | null;
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
      {/* sem dado ainda: rótulo esmaecido e um traço, nunca um "·" solto */}
      <Text style={[styles.chipRotulo, semDado && styles.chipTextoVazio]}>{rotulo}</Text>
      {tecnico ? <Text style={styles.chipTecnico}>{tecnico}</Text> : null}
      {semDado ? (
        <Text style={[styles.chipValor, styles.chipTextoVazio]}>-</Text>
      ) : (
        <Text style={styles.chipValor}>{valor}</Text>
      )}
      {!semDado && tend && (
        <Text style={[styles.chipTend, { color: tend.bom ? colors.okEscuro : colors.alerta }]}>
          {tend.seta} {tend.pct}% vs mês passado
        </Text>
      )}
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
  // secundário: contornado, largura normal (dentro do gutter), mesma altura dos demais botões
  tentar: {
    borderWidth: 1.5,
    borderColor: colors.linha,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: space.group,
    marginTop: space.group,
  },
  tentarTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
  configurar: {
    backgroundColor: colors.vivo,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginTop: 4,
  },
  configurarTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#06231A' },

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
  avatarTexto: { fontFamily: fonts.display, fontSize: 14, color: colors.papel },

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

  offline: {
    alignSelf: 'flex-start',
    marginHorizontal: 18,
    marginBottom: 8,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  offlineTexto: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.4, color: colors.cinza },

  diag: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  diagTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  diagBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' },
  diagBadgeTexto: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.papel,
    textTransform: 'uppercase',
  },
  diagTend: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.3 },
  diagTitulo: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.tinta,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  diagCorpo: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.cinza },
  diagPorque: {
    fontFamily: fonts.corpoMedio,
    fontSize: 12,
    color: colors.mata,
    marginTop: 2,
    textDecorationLine: 'underline',
  },
  diagDrivers: { marginTop: 6, gap: 4 },
  diagDriverItem: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.tinta },

  cash: {
    marginHorizontal: 16,
    backgroundColor: colors.mata,
    borderRadius: 20,
    padding: space.group,
    gap: space.tight,
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
  cashPrevistas: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.3,
    color: colors.rotuloSobreMata,
  },
  cashOk: { fontFamily: fonts.corpoForte, color: colors.vivo },
  cashRuim: { fontFamily: fonts.corpoForte, color: '#F0A196' },
  cashTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cashTend: { fontFamily: fonts.corpoMedio, fontSize: 11 },

  // barra de fôlego (autonomia): meio grupo de respiro acima do texto do caixa
  folego: { marginTop: space.tight, gap: space.tight },
  folegoFrase: { fontFamily: fonts.corpoForte, fontSize: 14, lineHeight: 20, color: colors.papel },
  folegoTrilha: { height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  folegoCheia: { height: '100%', borderRadius: 6 },
  folegoPontas: { flexDirection: 'row', justifyContent: 'space-between' },
  folegoPonta: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.4, color: colors.rotuloSobreMata },
  verDetalhe: { marginTop: space.tight, alignSelf: 'flex-start' },
  verDetalheTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.papelSobreMata },
  momentoLinha: {
    marginHorizontal: 16,
    marginTop: space.item,
    fontFamily: fonts.corpoForte,
    fontSize: 15,
    lineHeight: 21,
    color: colors.tinta,
  },
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  faixaTitulo: { flex: 1, fontFamily: fonts.corpoForte, fontSize: 14, color: colors.tinta },
  faixaChevron: { fontFamily: fonts.display, fontSize: 18, color: colors.cinza },

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
  pontoRisco: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.tight },
  pontoRiscoBolha: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F0A196' },
  pontoRiscoTexto: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    color: '#F0A196',
  },

  // chips de indicadores: nova SEÇÃO depois do grupo do caixa (space.section acima)
  chips: { paddingHorizontal: 16, marginTop: space.section, flexGrow: 0 },
  chip: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: space.tight,
    // largura folgada: o rótulo cabe inteiro e o próximo card assoma como fatia parcial
    minWidth: 150,
  },
  chipAtivo: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipRotulo: { fontFamily: fonts.corpoForte, fontSize: 10.5, letterSpacing: 0.2, color: colors.tinta },
  chipTecnico: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.6, color: colors.cinza, marginTop: 1 },
  chipValor: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.tinta,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  chipTend: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.2, marginTop: 3 },
  chipTextoVazio: { color: colors.cinza, opacity: 0.55 },

  explica: {
    marginHorizontal: 16,
    marginTop: space.item,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  explicaRotulo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.cinza },
  explicaTexto: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.tinta },

  // ---- primeiros passos (recolhível) ----
  // bloco herói: separa do cartão de caixa por space.block
  passos: {
    marginHorizontal: space.group,
    marginBottom: space.block,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.vivo,
    borderRadius: 16,
    padding: space.group,
    gap: space.group,
  },
  passosCab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.tight },
  passosCabTexto: { flex: 1, gap: 2 },
  passosProgresso: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  passosChevron: { fontFamily: fonts.display, fontSize: 20, color: colors.cinza },
  passosChevronAberto: { transform: [{ rotate: '90deg' }] },
  passosLista: { gap: space.tight },
  passosTitulo: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta, letterSpacing: -0.2 },
  passosSub: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza, marginBottom: 2 },
  passoItem: { flexDirection: 'row', alignItems: 'center', gap: space.tight, paddingVertical: space.tight },
  passoBolinha: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.cinza,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passoBolinhaFeita: { backgroundColor: colors.vivo, borderColor: colors.vivo },
  passoCheck: { fontFamily: fonts.corpoForte, fontSize: 11, color: '#06231A' },
  passoLabel: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.tinta },
  // concluído: apenas esmaecido (o check verde já sinaliza), sem risco de "cancelado"
  passoLabelFeito: { color: colors.cinza },
  passoSeta: { fontFamily: fonts.display, fontSize: 18, color: colors.cinza },

  vazioScroll: { paddingBottom: 28 },
  vazioBoas: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.tinta,
    letterSpacing: -0.4,
    paddingHorizontal: 18,
    marginBottom: space.item,
  },
  vazioTitulo: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.tinta,
    letterSpacing: -0.4,
    paddingHorizontal: space.group,
    marginBottom: space.tight,
  },
  vazioSub: {
    fontFamily: fonts.corpo,
    fontSize: 14,
    lineHeight: 20,
    color: colors.cinza,
    paddingHorizontal: space.group,
  },

  secao: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.tinta,
    paddingHorizontal: 18,
    marginTop: space.tight,
    marginBottom: space.tight,
    letterSpacing: -0.3,
  },
  // faixa de atenção: mesmo grupo do cartão de caixa (space.group acima);
  // faixas irmãs entre si por space.item.
  alertas: { paddingHorizontal: 16, gap: space.item, marginTop: space.group },
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
  barra: { width: 5, height: 24, borderRadius: 3 },
  alertaMiolo: { flex: 1, gap: 2 },
  alertaTituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  naoLidoPonto: { width: 8, height: 8, borderRadius: 4 },
  alertaTitulo: { flex: 1, fontFamily: fonts.displayMedio, fontSize: 14, color: colors.tinta },
  alertaCorpo: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza },

  // histórico: seção própria (space.section acima)
  verHistorico: { alignSelf: 'center', paddingVertical: space.item, marginTop: space.section },
  verHistoricoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.mata },
  // botão de testar decisão: fecha o grupo do cartão de caixa (space.group acima)
  simular: {
    marginHorizontal: 16,
    marginTop: space.group,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.vivo,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  simularTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.mata },

  rodape: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.cinza,
    textAlign: 'center',
    marginTop: space.section,
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
