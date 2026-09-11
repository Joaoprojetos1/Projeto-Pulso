/**
 * Avisos no WhatsApp (item 2.11) — o OPT-IN do dono.
 *
 * O transporte já existe no servidor (canal Meta + o mesmo cérebro do chat do
 * app). O que faltava era o dono poder dizer "pode falar comigo neste número".
 *
 * HONESTIDADE: a tela só oferece o campo quando o SERVIDOR diz que o canal está
 * de pé (`available`). Enquanto o número oficial não estiver configurado, ela
 * explica que ainda não dá — em vez de ligar o dono a lugar nenhum. No dia em que
 * as credenciais entrarem no servidor, esta tela abre sozinha, sem app novo.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMyWhatsApp, linkMyWhatsApp, unlinkMyWhatsApp, type WhatsAppStatusJson } from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

/** (DD) 9XXXX-XXXX enquanto digita. Guardamos só dígitos. */
function mascara(digitos: string): string {
  const d = digitos.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const corte = d.length > 10 ? 7 : 6;
  const meio = d.slice(2, corte);
  const fim = d.slice(corte);
  return fim ? `(${d.slice(0, 2)}) ${meio}-${fim}` : `(${d.slice(0, 2)}) ${meio}`;
}

/** Mostra o número que veio do servidor (55 + DDD + número) em formato de gente. */
function exibirSalvo(phone: string): string {
  const sem55 = phone.startsWith('55') ? phone.slice(2) : phone;
  return mascara(sem55);
}

export default function WhatsApp() {
  const { token } = usePulso();
  const [estado, setEstado] = useState<WhatsAppStatusJson | null>(null);
  const [digitos, setDigitos] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchMyWhatsApp(token)
      .then((s) => {
        if (!vivo) return;
        setEstado(s);
        if (s.phone) setDigitos(s.phone.startsWith('55') ? s.phone.slice(2) : s.phone);
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [token]);

  const completo = digitos.length === 10 || digitos.length === 11;

  async function ligar() {
    if (!token || salvando || !completo) return;
    setSalvando(true);
    setErro(null);
    try {
      await linkMyWhatsApp(token, `55${digitos}`);
      const s = await fetchMyWhatsApp(token);
      setEstado(s);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ligar agora.');
    } finally {
      setSalvando(false);
    }
  }

  async function desligar() {
    if (!token || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await unlinkMyWhatsApp(token);
      const s = await fetchMyWhatsApp(token);
      setEstado(s);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui desligar agora.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topo}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Voltar">
            <Ionicons name="chevron-back" size={24} color={colors.tinta} />
          </Pressable>
          <Text style={styles.tituloTopo}>Avisos no WhatsApp</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {carregando ? (
            <ActivityIndicator color={colors.vivo} style={{ marginTop: 30 }} />
          ) : !estado?.available ? (
            <View style={styles.cartao}>
              <Ionicons name="time-outline" size={22} color={colors.cinza} />
              <Text style={styles.cartaoTitulo}>Ainda não está no ar</Text>
              <Text style={styles.cartaoTexto}>
                O número oficial do Ivo no WhatsApp está em preparação. Assim que estiver pronto, esta
                tela abre para você ligar o seu número. Até lá, seus alertas continuam aqui no
                aplicativo.
              </Text>
            </View>
          ) : estado.linked ? (
            <View style={styles.cartao}>
              <Ionicons name="checkmark-circle" size={22} color={colors.vivo} />
              <Text style={styles.cartaoTitulo}>Ligado em {exibirSalvo(estado.phone ?? '')}</Text>
              <Text style={styles.cartaoTexto}>
                Você recebe os avisos por aqui e pode perguntar ao Ivo pelo WhatsApp, com os mesmos
                números do aplicativo.
              </Text>
              <Pressable onPress={desligar} disabled={salvando} style={styles.desligar} hitSlop={8}>
                <Text style={styles.desligarTexto}>
                  {salvando ? 'Desligando…' : 'Desligar os avisos neste número'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.intro}>
                Informe o seu WhatsApp para receber os avisos por lá e poder perguntar ao Ivo por
                mensagem. Só você recebe; é o mesmo Ivo do aplicativo, com os mesmos números.
              </Text>

              <Text style={styles.rotulo}>Seu WhatsApp</Text>
              <TextInput
                style={styles.input}
                value={mascara(digitos)}
                onChangeText={(t) => setDigitos(t.replace(/\D/g, '').slice(0, 11))}
                placeholder="(31) 99999-9999"
                placeholderTextColor={colors.cinza}
                keyboardType="phone-pad"
                accessibilityLabel="Número do WhatsApp com DDD"
              />
              {digitos.length > 0 && !completo ? (
                <Text style={styles.erro}>Faltam dígitos: informe DDD e número.</Text>
              ) : null}
              {erro ? <Text style={styles.erro}>{erro}</Text> : null}

              <Pressable
                style={({ pressed }) => [
                  styles.botao,
                  (!completo || salvando) && styles.botaoOff,
                  pressed && styles.pressionado,
                ]}
                onPress={ligar}
                disabled={!completo || salvando}
              >
                {salvando ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.botaoTexto}>Ligar os avisos</Text>
                )}
              </Pressable>

              <Text style={styles.nota}>
                Você pode desligar quando quiser, nesta mesma tela. Não mandamos propaganda.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 16, color: colors.tinta },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  intro: { fontFamily: fonts.corpo, fontSize: 14.5, lineHeight: 21, color: colors.tinta, marginBottom: 22 },
  rotulo: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza, marginBottom: 6 },
  input: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.corpoMedio,
    fontSize: 17,
    color: colors.tinta,
  },
  erro: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.critico, marginTop: 8 },
  botao: {
    marginTop: 22,
    backgroundColor: colors.vivo,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  botaoOff: { opacity: 0.5 },
  pressionado: { opacity: 0.85 },
  botaoTexto: { fontFamily: fonts.corpoMedio, fontSize: 15, color: '#FFFFFF' },
  nota: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, marginTop: 14, lineHeight: 18 },
  cartao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 18,
    gap: 8,
  },
  cartaoTitulo: { fontFamily: fonts.displayMedio, fontSize: 15.5, color: colors.tinta },
  cartaoTexto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.cinza },
  desligar: { marginTop: 10 },
  desligarTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.critico },
});
