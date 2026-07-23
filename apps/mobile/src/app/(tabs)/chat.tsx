/**
 * Conversa. Com o servidor no ar, as respostas vêm da IA do Pulso —
 * que só usa números já calculados e passa pelo fiscal contra número
 * inventado. Em modo demonstração, o app avisa com todas as letras.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MarkdownLite } from '@/components/markdown-lite';
import { QuotaError, sendMyChat, type ChatTurnJson } from '@/lib/api';
import { responderDeterministico } from '@/lib/perguntas';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

interface Mensagem {
  id: string;
  de: 'voce' | 'pulso';
  texto: string;
  /** true quando o envio falhou: a bolha vira "tocar para reenviar". */
  falhou?: boolean;
}

// sugestões de partida — perguntas que o Pulso sabe responder bem
const SUGESTOES = ['Quando meu caixa zera?', 'Quem me deve?', 'Dá pra pagar as contas do mês?'];

/** Um pontinho que pulsa, com atraso próprio (bolha "digitando…"). */
function Ponto({ atraso }: { atraso: number }) {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withDelay(
      atraso,
      withRepeat(withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [o, atraso]);
  const estilo = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.ponto, estilo]} />;
}

/** A bolha "digitando…" do Pulso, com três pontinhos pulsando em sequência. */
function Digitando() {
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      style={[styles.msg, styles.msgPulso, styles.digitandoBolha]}
    >
      <Ponto atraso={0} />
      <Ponto atraso={150} />
      <Ponto atraso={300} />
    </Animated.View>
  );
}

const RESPOSTA_DEMO =
  'Na demonstração eu respondo as perguntas de caixa com os números do exemplo. ' +
  'Tente: "Quando meu caixa zera?", "Quem me deve?" ou "Dá pra pagar as contas do mês?". ' +
  'Com sua conta ligada, eu converso sobre os seus próprios números.';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** 'YYYY-MM-DD' → '1º de agosto' (a cota renova sempre no dia 1º). */
function dataPorExtenso(iso: string): string {
  const [, mes, dia] = iso.split('-').map(Number);
  const nome = MESES[(mes ?? 1) - 1] ?? '';
  return `${dia ?? 1}º de ${nome}`;
}

/** Aviso de cota estourada, em linguagem de dono e sem tom punitivo. */
function mensagemDeCota(e: QuotaError): string {
  const quando = e.resetsOn ? dataPorExtenso(e.resetsOn) : 'no início do próximo mês';
  return (
    `Você usou as ${e.quota} perguntas deste mês. Elas renovam em ${quando}. ` +
    'Seus alertas e o painel continuam funcionando normalmente.'
  );
}

export default function Chat() {
  const { dashboard, token } = usePulso();
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: 'boas-vindas',
      de: 'pulso',
      texto: dashboard
        ? `Olá! Eu sou o Pulso, o monitor do caixa de ${dashboard.company.name}. Pergunte qualquer coisa sobre seus números.`
        : 'Olá! Eu sou o Pulso. Pergunte qualquer coisa sobre seus números.',
    },
  ]);
  const lista = useRef<FlatList<Mensagem>>(null);

  function rolar() {
    setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 60);
  }

  /** Envia o histórico ao servidor. Em falha, marca a última pergunta como
   *  "não enviada" (reenvio inline) em vez de uma bolha de erro. */
  async function despachar(historico: Mensagem[]) {
    if (!token) return;
    setPensando(true);
    rolar();
    try {
      const turns: ChatTurnJson[] = historico
        .filter((m) => m.id !== 'boas-vindas' && !m.falhou)
        .map((m) => ({ role: m.de === 'voce' ? 'user' : 'assistant', content: m.texto }));
      const resposta = await sendMyChat(token, turns);
      setMensagens([...historico, { id: `p-${Date.now()}`, de: 'pulso', texto: resposta }]);
    } catch (e) {
      if (e instanceof QuotaError) {
        setMensagens([...historico, { id: `p-${Date.now()}`, de: 'pulso', texto: mensagemDeCota(e) }]);
      } else {
        // sem bolha de erro nem alert(): a própria pergunta vira "tocar para reenviar"
        setMensagens(
          historico.map((m, i) =>
            i === historico.length - 1 && m.de === 'voce' ? { ...m, falhou: true } : m,
          ),
        );
      }
    } finally {
      setPensando(false);
      rolar();
    }
  }

  async function enviar(valorDireto?: string) {
    const limpo = (valorDireto ?? texto).trim();
    if (!limpo || pensando) return;
    setTexto('');

    const minhas: Mensagem[] = [...mensagens, { id: `v-${Date.now()}`, de: 'voce', texto: limpo }];
    setMensagens(minhas);
    rolar();

    // modo demonstração (sem login): responde as perguntas determinísticas com os
    // números prontos do exemplo; se não for uma delas, orienta. Nunca finge IA.
    if (!token) {
      const det = dashboard ? responderDeterministico(dashboard, limpo) : null;
      setMensagens([...minhas, { id: `p-${Date.now()}`, de: 'pulso', texto: det ?? RESPOSTA_DEMO }]);
      rolar();
      return;
    }

    await despachar(minhas);
  }

  /** Toca na pergunta não enviada para reenviar, sem redigitar. */
  function reenviar(m: Mensagem) {
    if (pensando) return;
    const historico = mensagens.map((x) => (x.id === m.id ? { ...x, falhou: false } : x));
    setMensagens(historico);
    void despachar(historico);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <Text style={styles.titulo}>Conversa</Text>

        <FlatList
          ref={lista}
          data={mensagens}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <Animated.View entering={FadeInDown.duration(220)} style={styles.msgWrap}>
              <View
                style={[
                  styles.msg,
                  item.de === 'voce' ? styles.msgVoce : styles.msgPulso,
                  item.falhou && styles.msgFalhou,
                ]}
              >
                {item.de === 'voce' ? (
                  <Text style={styles.msgTextoVoce}>{item.texto}</Text>
                ) : (
                  <MarkdownLite texto={item.texto} style={styles.msgTextoPulso} />
                )}
              </View>
              {item.falhou && (
                <Pressable onPress={() => reenviar(item)} hitSlop={6}>
                  <Text style={styles.reenviar}>não enviada · tocar para reenviar</Text>
                </Pressable>
              )}
            </Animated.View>
          )}
          ListFooterComponent={pensando ? <Digitando /> : null}
        />

        {/* sugestões de partida — só enquanto a conversa mal começou */}
        {mensagens.length <= 1 && !pensando && (
          <View style={styles.sugestoes}>
            {SUGESTOES.map((s) => (
              <Pressable
                key={s}
                style={({ pressed }) => [styles.sugestao, pressed && styles.pressionado]}
                onPress={() => enviar(s)}
              >
                <Text style={styles.sugestaoTexto}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.entrada}>
          <TextInput
            style={styles.campo}
            value={texto}
            onChangeText={setTexto}
            placeholder="Pergunte sobre seu negócio…"
            placeholderTextColor={colors.cinza}
            onSubmitEditing={() => enviar()}
            returnKeyType="send"
          />
          <Pressable
            style={({ pressed }) => [styles.enviar, pressed && styles.pressionado]}
            onPress={() => enviar()}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.mata} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  wrap: { flex: 1 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    paddingHorizontal: 18,
    paddingVertical: 12,
    letterSpacing: -0.3,
  },
  lista: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  msgWrap: { width: '100%' },
  msg: { maxWidth: '86%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  msgFalhou: { opacity: 0.6 },
  reenviar: {
    alignSelf: 'flex-end',
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.2,
    color: colors.critico,
    marginTop: 3,
  },
  msgVoce: {
    alignSelf: 'flex-end',
    backgroundColor: colors.mata,
    borderBottomRightRadius: 4,
  },
  msgPulso: {
    alignSelf: 'flex-start',
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderBottomLeftRadius: 4,
  },
  msgTextoVoce: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.papel },
  msgTextoPulso: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.tinta },
  digitandoBolha: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14 },
  ponto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cinza },

  sugestoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  sugestao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sugestaoTexto: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.mata },

  entrada: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 6,
  },
  campo: {
    flex: 1,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.corpo,
    fontSize: 14,
    color: colors.tinta,
  },
  enviar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.vivo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressionado: { opacity: 0.8 },
});
