/**
 * Conversa. A interface está pronta; o cérebro (respostas de verdade,
 * ligadas ao servidor) entra numa próxima etapa — e o app diz isso com
 * todas as letras, em vez de fingir.
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

import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

interface Mensagem {
  id: string;
  de: 'voce' | 'pulso';
  texto: string;
}

const RESPOSTA_PADRAO =
  'Boa pergunta! Esta conversa ainda está em construção — em breve eu respondo de verdade, ' +
  'usando os números da sua clínica. Enquanto isso, os alertas do painel já saem na hora certa.';

export default function Chat() {
  const { dashboard } = usePulso();
  const [texto, setTexto] = useState('');
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

  function enviar() {
    const limpo = texto.trim();
    if (!limpo) return;
    setMensagens((atual) => [
      ...atual,
      { id: `v-${Date.now()}`, de: 'voce', texto: limpo },
      { id: `p-${Date.now()}`, de: 'pulso', texto: RESPOSTA_PADRAO },
    ]);
    setTexto('');
    setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 60);
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
