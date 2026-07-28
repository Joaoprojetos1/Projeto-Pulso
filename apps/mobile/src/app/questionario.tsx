/**
 * Diagnóstico de gestão — o checklist do especialista, como onboarding.
 *
 * 15 perguntas rápidas (sim / em parte / não), uma por tela, com barra de
 * progresso. No fim, uma devolutiva: a pontuação por bloco, os dois pontos mais
 * frágeis e o que atacar primeiro. Entrega valor a um cliente novo SEM nenhum
 * arquivo. A pontuação é 100% do servidor (core); o app só desenha.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMySurvey, saveMySurvey, type SurveyAnswerValue, type SurveyJson } from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

type Modo = 'intro' | 'perguntas' | 'resultado';

const OPCOES: { valor: SurveyAnswerValue; rotulo: string; cor: string }[] = [
  { valor: 'sim', rotulo: 'Sim', cor: colors.okEscuro },
  { valor: 'parcial', rotulo: 'Em parte', cor: colors.alerta },
  { valor: 'nao', rotulo: 'Não', cor: colors.critico },
];

/** Cor da barra pela pontuação (verde bom, laranja médio, vermelho baixo). */
function corPontuacao(score: number): string {
  if (score >= 70) return colors.okEscuro;
  if (score >= 40) return colors.alerta;
  return colors.critico;
}

export default function Questionario() {
  const { token } = usePulso();
  const [survey, setSurvey] = useState<SurveyJson | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<Modo>('intro');
  const [i, setI] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, SurveyAnswerValue>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setCarregando(false);
      return;
    }
    try {
      const s = await fetchMySurvey(token);
      setSurvey(s);
      setRespostas(s.answers);
      if (s.result.overall != null) setModo('resultado');
    } catch {
      setErro('Não consegui carregar agora. Tente de novo em instantes.');
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function responder(valor: SurveyAnswerValue) {
    if (!survey) return;
    const q = survey.questions[i]!;
    setRespostas((r) => ({ ...r, [q.id]: valor }));
    if (i < survey.questions.length - 1) setI(i + 1);
  }

  async function finalizar() {
    if (!token || !survey) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await saveMySurvey(token, respostas);
      setSurvey(atualizado);
      setModo('resultado');
    } catch {
      setErro('Não consegui salvar agora. Tente de novo em instantes.');
    } finally {
      setSalvando(false);
    }
  }

  const total = survey?.questions.length ?? 0;
  const respondidas = survey ? survey.questions.filter((q) => respostas[q.id]).length : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={() => (modo === 'perguntas' && i > 0 ? setI(i - 1) : router.back())}
          hitSlop={10}
          style={styles.voltar}
        >
          <Ionicons name="chevron-back" size={22} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Diagnóstico de gestão</Text>
        <View style={styles.voltar} />
      </View>

      {carregando ? (
        <ActivityIndicator color={colors.mata} style={{ marginTop: space.section }} />
      ) : !token ? (
        <View style={styles.corpo}>
          <Aviso texto="Crie uma conta para responder o diagnóstico de gestão. Na demonstração ele não é salvo." />
        </View>
      ) : !survey ? (
        <View style={styles.corpo}>
          <Aviso texto={erro ?? 'Não foi possível carregar o questionário.'} />
        </View>
      ) : modo === 'intro' ? (
        <Intro total={total} onComecar={() => { setI(0); setModo('perguntas'); }} />
      ) : modo === 'perguntas' ? (
        <Perguntas
          survey={survey}
          i={i}
          respostas={respostas}
          respondidas={respondidas}
          salvando={salvando}
          erro={erro}
          onResponder={responder}
          onFinalizar={finalizar}
        />
      ) : (
        <Resultado survey={survey} onRevisar={() => { setI(0); setModo('perguntas'); }} />
      )}
    </SafeAreaView>
  );
}

function Intro({ total, onComecar }: { total: number; onComecar: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.corpo}>
      <Animated.View entering={FadeInDown.duration(240)}>
        <Text style={styles.titulo}>Responda {total} perguntas rápidas sobre a sua gestão.</Text>
        <Text style={styles.subtitulo}>
          Leva uns 3 minutos. No fim, o Pulso mostra onde você está mais forte, onde está mais frágil e o que atacar primeiro — sem precisar enviar nenhum arquivo.
        </Text>
      </Animated.View>
      <Pressable onPress={onComecar} style={({ pressed }) => [styles.botao, pressed && styles.botaoOff]}>
        <Text style={styles.botaoTexto}>Começar</Text>
      </Pressable>
    </ScrollView>
  );
}

function Perguntas({
  survey,
  i,
  respostas,
  respondidas,
  salvando,
  erro,
  onResponder,
  onFinalizar,
}: {
  survey: SurveyJson;
  i: number;
  respostas: Record<string, SurveyAnswerValue>;
  respondidas: number;
  salvando: boolean;
  erro: string | null;
  onResponder: (v: SurveyAnswerValue) => void;
  onFinalizar: () => void;
}) {
  const q = survey.questions[i]!;
  const bloco = survey.blocks.find((b) => b.block === q.block)?.label ?? '';
  const total = survey.questions.length;
  const escolhida = respostas[q.id];
  const progresso = (i + 1) / total;
  const tudoRespondido = respondidas === total;

  return (
    <View style={styles.flex}>
      {/* barra de progresso */}
      <View style={styles.barraFundo}>
        <View style={[styles.barraCheia, { width: `${Math.round(progresso * 100)}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.corpo}>
        <Text style={styles.contador}>Pergunta {i + 1} de {total}</Text>
        <Text style={styles.blocoTag}>{bloco.toUpperCase()}</Text>

        <Animated.Text key={q.id} entering={FadeIn.duration(200)} style={styles.pergunta}>
          {q.text}
        </Animated.Text>

        <View style={styles.opcoes}>
          {OPCOES.map((o) => {
            const sel = escolhida === o.valor;
            return (
              <Pressable
                key={o.valor}
                onPress={() => onResponder(o.valor)}
                style={[styles.opcao, sel && { borderColor: o.cor, backgroundColor: o.cor + '18' }]}
              >
                <View style={[styles.bolinha, { borderColor: o.cor }, sel && { backgroundColor: o.cor }]} />
                <Text style={[styles.opcaoTexto, sel && { color: colors.tinta }]}>{o.rotulo}</Text>
              </Pressable>
            );
          })}
        </View>

        {erro && <Text style={styles.erro}>{erro}</Text>}

        {tudoRespondido && (
          <Pressable onPress={onFinalizar} disabled={salvando} style={({ pressed }) => [styles.botao, (pressed || salvando) && styles.botaoOff]}>
            {salvando ? <ActivityIndicator color="#06231A" size="small" /> : <Text style={styles.botaoTexto}>Ver meu resultado</Text>}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Resultado({ survey, onRevisar }: { survey: SurveyJson; onRevisar: () => void }) {
  const r = survey.result;
  return (
    <ScrollView contentContainerStyle={styles.corpo}>
      <Animated.View entering={FadeInDown.duration(240)} style={styles.scoreCard}>
        <Text style={styles.scoreLabel}>SUA GESTÃO HOJE</Text>
        <Text style={styles.scoreNum}>{r.overall ?? '·'}<Text style={styles.scoreDe}> / 100</Text></Text>
        <Text style={styles.devolutiva}>{survey.devolutiva}</Text>
      </Animated.View>

      {/* pontuação por bloco */}
      <Text style={styles.secao}>Por área</Text>
      {r.blocks.map((b) => (
        <View key={b.block} style={styles.blocoLinha}>
          <View style={styles.blocoTopo}>
            <Text style={styles.blocoNome}>{b.label}</Text>
            <Text style={styles.blocoScore}>{b.score != null ? b.score : '·'}</Text>
          </View>
          <View style={styles.barraFundoFina}>
            <View style={[styles.barraCheiaFina, { width: `${b.score ?? 0}%`, backgroundColor: b.score != null ? corPontuacao(b.score) : colors.linha }]} />
          </View>
        </View>
      ))}

      {/* o que fazer primeiro */}
      {r.weakest.length > 0 && (
        <>
          <Text style={styles.secao}>Comece por aqui</Text>
          {r.weakest.map((w, idx) => (
            <View key={w.block} style={styles.focoBox}>
              <View style={[styles.focoNum, { backgroundColor: corPontuacao(w.score) }]}>
                <Text style={styles.focoNumTexto}>{idx + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.focoTitulo}>{w.label}</Text>
                <Text style={styles.focoTexto}>Foque em {w.focus}.</Text>
              </View>
            </View>
          ))}
        </>
      )}

      <Pressable onPress={onRevisar} style={({ pressed }) => [styles.botaoSec, pressed && styles.botaoOff]}>
        <Text style={styles.botaoSecTexto}>Revisar minhas respostas</Text>
      </Pressable>
      {r.answeredOn && <Text style={styles.previa}>Respondido em {r.answeredOn.split('-').reverse().join('/')}</Text>}
    </ScrollView>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <View style={styles.avisoBox}>
      <Ionicons name="information-circle-outline" size={20} color={colors.cinza} />
      <Text style={styles.avisoTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  flex: { flex: 1 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.tinta },
  corpo: { paddingHorizontal: 20, paddingBottom: space.block },
  titulo: { fontFamily: fonts.display, fontSize: 23, lineHeight: 29, color: colors.tinta, letterSpacing: -0.4, marginTop: space.group },
  subtitulo: { fontFamily: fonts.corpo, fontSize: 14.5, lineHeight: 22, color: colors.cinza, marginTop: space.item },
  // progresso
  barraFundo: { height: 4, backgroundColor: colors.linha, marginHorizontal: 20, borderRadius: 2, marginTop: 4 },
  barraCheia: { height: 4, backgroundColor: colors.vivo, borderRadius: 2 },
  contador: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 0.5, color: colors.cinza, marginTop: space.section },
  blocoTag: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.vivo, marginTop: 6 },
  pergunta: { fontFamily: fonts.display, fontSize: 22, lineHeight: 30, color: colors.tinta, letterSpacing: -0.3, marginTop: space.item },
  opcoes: { gap: space.item, marginTop: space.section },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.branco, borderWidth: 1.5, borderColor: colors.linha, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16 },
  bolinha: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  opcaoTexto: { fontFamily: fonts.corpoForte, fontSize: 16, color: colors.tinta },
  erro: { fontFamily: fonts.corpo, fontSize: 13, color: colors.critico, textAlign: 'center', marginTop: space.group },
  botao: { backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: space.section },
  botaoOff: { opacity: 0.5 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: '#06231A' },
  botaoSec: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: space.section, borderWidth: 1, borderColor: colors.linha, backgroundColor: colors.branco },
  botaoSecTexto: { fontFamily: fonts.corpoForte, fontSize: 15, color: colors.tinta },
  // resultado
  scoreCard: { backgroundColor: colors.mata, borderRadius: 18, padding: 22, marginTop: space.group },
  scoreLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.rotuloSobreMata },
  scoreNum: { fontFamily: fonts.displayBlack, fontSize: 52, color: colors.branco, letterSpacing: -1.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  scoreDe: { fontFamily: fonts.displayMedio, fontSize: 20, color: colors.papelSobreMata },
  devolutiva: { fontFamily: fonts.corpo, fontSize: 14.5, lineHeight: 22, color: colors.papelSobreMata, marginTop: space.item },
  secao: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza, marginTop: space.section, marginBottom: space.tight },
  blocoLinha: { marginTop: space.item },
  blocoTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  blocoNome: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.tinta },
  blocoScore: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.tinta, fontVariant: ['tabular-nums'] },
  barraFundoFina: { height: 6, backgroundColor: colors.linha, borderRadius: 3 },
  barraCheiaFina: { height: 6, borderRadius: 3 },
  focoBox: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.branco, borderRadius: 14, borderWidth: 1, borderColor: colors.linha, padding: 14, marginTop: space.item },
  focoNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  focoNumTexto: { fontFamily: fonts.display, fontSize: 14, color: colors.branco },
  focoTitulo: { fontFamily: fonts.corpoForte, fontSize: 15, color: colors.tinta },
  focoTexto: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza, marginTop: 2 },
  previa: { fontFamily: fonts.mono, fontSize: 11, color: colors.cinza, textAlign: 'center', marginTop: space.group },
  avisoBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.branco, borderRadius: 12, borderWidth: 1, borderColor: colors.linha, padding: 16, marginTop: space.section },
  avisoTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.tinta },
});
