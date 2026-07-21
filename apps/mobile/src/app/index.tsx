/**
 * Entrada do app: login de verdade (cadastro + entrar) com e-mail e senha.
 * Alterna entre "entrar" e "criar conta". Em caso de erro, oferece uma
 * demonstração enquanto isso.
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
const MENSAGENS_CARREGANDO = [
  'Ligando o monitor…',
  'Acordando o servidor — o primeiro acesso demora um pouco…',
  'Quase lá, buscando seus números…',
];

type Modo = 'entrar' | 'cadastrar';

export default function Login() {
  const { entrar, cadastrar, entrarDemo, carregando, erro, restaurando, logado } = usePulso();
  const [modo, setModo] = useState<Modo>('entrar');
  const [negocio, setNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState(0);

  // Abertura do app: se já havia sessão salva, entra direto no painel.
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

  if (restaurando) {
    return (
      <SafeAreaView style={[styles.safe, styles.centro]}>
        <PulsoLogo size={40} color={colors.papel} />
        <ActivityIndicator color={colors.papel} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  const podeEnviar =
    email.trim().length > 0 &&
    senha.length > 0 &&
    (modo === 'entrar' || negocio.trim().length > 0);

  async function enviar() {
    if (!podeEnviar) return;
    const ok =
      modo === 'entrar'
        ? await entrar(email.trim(), senha)
        : await cadastrar(negocio.trim(), email.trim(), senha);
    if (ok) router.replace('/onboarding');
  }

  function verDemonstracao() {
    entrarDemo();
    router.replace('/onboarding');
  }

  const cadastrando = modo === 'cadastrar';

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
          {cadastrando && (
            <>
              <Text style={styles.label}>NOME DO SEU NEGÓCIO</Text>
              <TextInput
                style={styles.input}
                value={negocio}
                onChangeText={setNegocio}
                placeholder="Ex.: Clínica Sorriso"
                placeholderTextColor={colors.cinza}
              />
            </>
          )}

          <Text style={styles.label}>E-MAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="voce@suaempresa.com.br"
            placeholderTextColor={colors.cinza}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={styles.label}>SENHA</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={setSenha}
            placeholder={cadastrando ? 'Crie uma senha (mín. 8 caracteres)' : '••••••••'}
            placeholderTextColor={colors.cinza}
            secureTextEntry
          />

          <Pressable
            style={({ pressed }) => [
              styles.botao,
              (pressed || !podeEnviar) && styles.pressionado,
            ]}
            onPress={enviar}
            disabled={carregando || !podeEnviar}
          >
            {carregando ? (
              <View style={styles.carregandoLinha}>
                <ActivityIndicator color={colors.papel} />
                <Text style={styles.botaoTexto}>{cadastrando ? 'Criando…' : 'Entrando…'}</Text>
              </View>
            ) : (
              <Text style={styles.botaoTexto}>{cadastrando ? 'Criar conta' : 'Entrar'}</Text>
            )}
          </Pressable>

          {carregando ? (
            <Text style={styles.carregandoMsg}>{MENSAGENS_CARREGANDO[msg]}</Text>
          ) : erro ? (
            <View style={styles.erroBloco}>
              <Text style={styles.erroTexto}>{erro}</Text>
              <Pressable onPress={verDemonstracao} hitSlop={8}>
                <Text style={styles.erroLink}>Ver uma demonstração enquanto isso →</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setModo(cadastrando ? 'entrar' : 'cadastrar')}
              hitSlop={8}
              style={styles.trocaModo}
            >
              <Text style={styles.trocaModoTexto}>
                {cadastrando ? 'Já tenho conta — entrar' : 'Ainda não tem conta? Criar agora'}
              </Text>
            </Pressable>
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
  trocaModo: { marginTop: 16, alignItems: 'center' },
  trocaModoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.mata },
  erroBloco: { marginTop: 14, gap: 10, alignItems: 'center' },
  erroTexto: {
    fontFamily: fonts.corpo,
    fontSize: 13,
    lineHeight: 19,
    color: colors.critico,
    textAlign: 'center',
  },
  erroLink: {
    fontFamily: fonts.corpoMedio,
    fontSize: 13,
    color: colors.mata,
    textAlign: 'center',
  },
});
