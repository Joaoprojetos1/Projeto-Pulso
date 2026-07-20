/**
 * Login. Por enquanto é visual: a autenticação de verdade chega junto
 * com o piloto. "Entrar" carrega os dados (servidor ou demonstração)
 * e segue para o onboarding.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulsoLogo } from '@/components/logo';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

// O servidor no plano grátis "dorme"; a 1ª visita leva ~30-50s pra acordar.
// Em vez de uma bolinha girando (parece travado), a mensagem evolui.
const MENSAGENS_CARREGANDO = [
  'Ligando o monitor…',
  'Acordando o servidor — o primeiro acesso demora um pouco…',
  'Quase lá, buscando seus números…',
];

export default function Login() {
  const { carregar, carregando, restaurando, logado } = usePulso();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState(0);

  // Abertura do app: se já havia sessão salva, entra direto no painel.
  // Depende só de `restaurando` para não competir com o login manual (que
  // segue para o onboarding).
  useEffect(() => {
    if (!restaurando && logado) router.replace('/(tabs)');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurando]);

  useEffect(() => {
    if (!carregando) {
      setMsg(0);
      return;
    }
    const t = setInterval(() => {
      setMsg((i) => Math.min(i + 1, MENSAGENS_CARREGANDO.length - 1));
    }, 4500);
    return () => clearInterval(t);
  }, [carregando]);

  // Enquanto verifica a sessão salva, evita piscar a tela de login.
  if (restaurando) {
    return (
      <SafeAreaView style={[styles.safe, styles.centro]}>
        <PulsoLogo size={40} color={colors.papel} />
        <ActivityIndicator color={colors.papel} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  async function entrar() {
    await carregar();
    router.replace('/onboarding');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <PulsoLogo size={44} color={colors.papel} />
          <Text style={styles.claim}>
            O sinal vital do seu negócio. O Pulso avisa <Text style={styles.claimForte}>antes</Text>{' '}
            do caixa acabar.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>E-MAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="voce@suaempresa.com.br"
            placeholderTextColor={colors.cinza}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>SENHA</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={setSenha}
            placeholder="••••••••"
            placeholderTextColor={colors.cinza}
            secureTextEntry
          />

          <Pressable
            style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            onPress={entrar}
            disabled={carregando}
          >
            {carregando ? (
              <View style={styles.carregandoLinha}>
                <ActivityIndicator color={colors.papel} />
                <Text style={styles.botaoTexto}>Entrando…</Text>
              </View>
            ) : (
              <Text style={styles.botaoTexto}>Entrar</Text>
            )}
          </Pressable>

          {carregando ? (
            <Text style={styles.carregandoMsg}>{MENSAGENS_CARREGANDO[msg]}</Text>
          ) : (
            <Text style={styles.nota}>
              Piloto do Pulso — o acesso é liberado pela nossa equipe.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mata },
  centro: { justifyContent: 'center', alignItems: 'center' },
  wrap: { flex: 1 },
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 18,
  },
  claim: {
    fontFamily: fonts.corpo,
    fontSize: 17,
    lineHeight: 25,
    color: colors.papelSobreMata,
    maxWidth: 300,
  },
  claimForte: { fontFamily: fonts.corpoForte, color: colors.papel },
  form: {
    backgroundColor: colors.papel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 40,
    gap: 8,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.cinza,
    marginTop: 10,
  },
  input: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: colors.tinta,
  },
  botao: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  pressionado: { opacity: 0.85 },
  botaoTexto: {
    fontFamily: fonts.displayMedio,
    fontSize: 16,
    color: colors.papel,
  },
  carregandoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  carregandoMsg: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.okEscuro,
    textAlign: 'center',
    marginTop: 14,
  },
  nota: {
    fontFamily: fonts.corpo,
    fontSize: 13,
    color: colors.cinza,
    textAlign: 'center',
    marginTop: 14,
  },
});
