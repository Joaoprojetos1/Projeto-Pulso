/**
 * Conversa. Com o servidor no ar, as respostas vêm da IA do Pulso —
 * que só usa números já calculados e passa pelo fiscal contra número
 * inventado. Em modo demonstração, o app avisa com todas as letras.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { sendChat, type ChatTurnJson } from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

interface Mensagem {
  id: string;
  de: 'voce' | 'pulso';
  texto: string;
}

const RESPOSTA_DEMO =
  'No modo demonstração eu ainda não converso de verdade — isso acontece com o servidor ligado. ' +
  'Explore o painel: o alerta vermelho mostra exatamente de onde vem cada número.';

const RESPOSTA_ERRO =
  'Não consegui falar com o servidor agora. Tente de novo em instantes — seus alertas continuam no painel.';

export default function Chat() {
  const { dashboard, fonte } = usePulso();
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

  async function enviar() {
    const limpo = texto.trim();
    if (!limpo || pensando) return;
    setTexto('');

    const minhas: Mensagem[] = [...mensagens, { id: `v-${Date.now()}`, de: 'voce', texto: limpo }];
    setMensagens(minhas);
    rolar();

    // modo demonstração: resposta local honesta, sem fingir IA
    if (fonte !== 'servidor' || !dashboard) {
      setMensagens([...minhas, { id: `p-${Date.now()}`, de: 'pulso', texto: RESPOSTA_DEMO }]);
      rolar();
      return;
    }

    setPensando(true);
    try {
      // histórico no formato do servidor (sem a mensagem de boas-vindas)
      const turns: ChatTurnJson[] = minhas
        .filter((m) => m.id !== 'boas-vindas')
        .map((m) => ({ role: m.de === 'voce' ? 'user' : 'assistant', content: m.texto }));
      const resposta = await sendChat(dashboard.company.id, turns);
      setMensagens([...minhas, { id: `p-${Date.now()}`, de: 'pulso', texto: resposta }]);
    } catch {
      setMensagens([...minhas, { id: `p-${Date.now()}`, de: 'pulso', texto: RESPOSTA_ERRO }]);
    } finally {
      setPensando(false);
      rolar();
    }
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
            <View style={[styles.msg, item.de === 'voce' ? styles.msgVoce : styles.msgPulso]}>
              <Text style={item.de === 'voce' ? styles.msgTextoVoce : styles.msgTextoPulso}>
                {item.texto}
              </Text>
            </View>
          )}
        />

        {pensando && <Text style={styles.digitando}>O Pulso está pensando…</Text>}

        <View style={styles.entrada}>
          <TextInput
            style={styles.campo}
            value={texto}
            onChangeText={setTexto}
            placeholder="Pergunte sobre seu negócio…"
            placeholderTextColor={colors.cinza}
            onSubmitEditing={enviar}
            returnKeyType="send"
          />
          <Pressable
            style={({ pressed }) => [styles.enviar, pressed && styles.pressionado]}
            onPress={enviar}
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
  msg: { maxWidth: '86%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
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
  digitando: {
    fontFamily: fonts.corpo,
    fontSize: 12,
    color: colors.cinza,
    paddingHorizontal: 18,
    paddingBottom: 4,
  },

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
