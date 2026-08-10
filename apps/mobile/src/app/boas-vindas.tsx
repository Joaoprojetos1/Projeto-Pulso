/**
 * Entrada do app: login de verdade (cadastro + entrar) com e-mail e senha.
 * Alterna entre "entrar" e "criar conta". Em caso de erro, oferece uma
 * demonstração enquanto isso.
 */

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Heartbeat } from '@/components/heartbeat';
import { PulsoLogo } from '@/components/logo';
import { authForgotPassword, authResetPassword, AuthError } from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

const VERSAO_APP = Constants.expoConfig?.version ?? '';
const TERMOS_URL = 'https://pulso-site.onrender.com/termos.html';
const PRIVACIDADE_URL = 'https://pulso-site.onrender.com/privacidade.html';

// espera longa na 1ª abertura do dia: mensagens centradas no cliente, nunca em infra.
const MENSAGENS_CARREGANDO = [
  'Ligando o monitor…',
  'Preparando seus números. A primeira abertura do dia demora um pouco.',
  'Quase lá, buscando seus números…',
];

type Modo = 'boas-vindas' | 'entrar' | 'cadastrar' | 'esqueci' | 'redefinir';

/** Máscara de telefone BR ao digitar: "(DD) 9XXXX-XXXX" (aceita fixo e celular). */
function mascaraTelefone(txt: string): string {
  const d = txt.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function telefoneValido(txt: string): boolean {
  const d = txt.replace(/\D/g, '');
  return d.length >= 10 && d.length <= 11;
}
function emailValido(txt: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(txt.trim());
}

/** Erros de preenchimento por campo (aparecem no blur e no submit). */
type ErrosCampo = { negocio?: string; telefone?: string; email?: string; senha?: string };

export default function Login() {
  const { entrar, cadastrar, entrarDemo, carregando, erro, restaurando } = usePulso();
  const [modo, setModo] = useState<Modo>('boas-vindas');
  const [negocio, setNegocio] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [errosCampo, setErrosCampo] = useState<ErrosCampo>({});
  const [msg, setMsg] = useState(0);
  // fluxo de recuperação de senha (estado local — não é sessão)
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // teclado não cobre o campo focado: rola até o fim (onde ficam senha + botão),
  // com folga acima do teclado. Vale para os campos mais baixos de qualquer form.
  function rolarAteCampo() {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }

  async function enviarCodigo() {
    if (email.trim().length === 0 || ocupado) return;
    setOcupado(true);
    setErroLocal(null);
    setAviso(null);
    try {
      await authForgotPassword(email.trim());
      setAviso('Se houver conta com esse e-mail, enviamos um código. Confira sua caixa de entrada.');
      setModo('redefinir');
    } catch (e) {
      setErroLocal(e instanceof AuthError ? e.message : 'Não consegui enviar agora.');
    } finally {
      setOcupado(false);
    }
  }

  async function redefinir() {
    if (codigo.trim().length === 0 || senha.length < 8 || ocupado) return;
    setOcupado(true);
    setErroLocal(null);
    setAviso(null);
    try {
      await authResetPassword(codigo.trim(), senha);
      setSenha('');
      setCodigo('');
      setModo('entrar');
      setAviso('Senha alterada! Agora entre com a nova senha.');
    } catch (e) {
      setErroLocal(e instanceof AuthError ? e.message : 'Não consegui redefinir agora.');
    } finally {
      setOcupado(false);
    }
  }

  function irPara(m: Modo) {
    setModo(m);
    setErroLocal(null);
    setAviso(null);
  }

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
    (modo === 'entrar' || (negocio.trim().length > 0 && telefoneValido(telefone)));

  /** Valida um campo NO BLUR e mostra/limpa o erro dele (nunca em silêncio). */
  function validarCampo(campo: keyof ErrosCampo) {
    const cad = modo === 'cadastrar';
    setErrosCampo((e) => {
      const n = { ...e };
      if (campo === 'negocio') n.negocio = cad && negocio.trim().length === 0 ? 'Informe o nome do seu negócio.' : undefined;
      if (campo === 'telefone') n.telefone = cad && telefone.length > 0 && !telefoneValido(telefone) ? 'WhatsApp incompleto — use DDD e número.' : undefined;
      if (campo === 'email') n.email = email.length > 0 && !emailValido(email) ? 'E-mail inválido. Confira o endereço.' : undefined;
      if (campo === 'senha') n.senha = cad && senha.length > 0 && senha.length < 8 ? 'A senha precisa ter ao menos 8 caracteres.' : undefined;
      return n;
    });
  }

  async function enviar() {
    if (carregando) return;
    const cad = modo === 'cadastrar';
    // valida TUDO e aponta o erro NO CAMPO culpado (nunca botão sem efeito em silêncio)
    const errs: ErrosCampo = {};
    if (cad) {
      if (negocio.trim().length === 0) errs.negocio = 'Informe o nome do seu negócio.';
      if (!telefoneValido(telefone)) errs.telefone = 'WhatsApp incompleto — use DDD e número.';
    }
    if (!emailValido(email)) errs.email = 'E-mail inválido. Confira o endereço.';
    if (cad && senha.length < 8) errs.senha = 'A senha precisa ter ao menos 8 caracteres.';
    else if (senha.length === 0) errs.senha = 'Digite sua senha.';
    if (errs.negocio || errs.telefone || errs.email || errs.senha) {
      setErrosCampo(errs);
      return;
    }
    setErrosCampo({});

    if (modo === 'entrar') {
      // login de conta existente cai DIRETO no painel
      const ok = await entrar(email.trim(), senha);
      if (ok) router.replace('/(tabs)');
    } else {
      // só o cadastro passa pela tela "vamos ligar o monitor" (uma única vez)
      const ok = await cadastrar(negocio.trim(), email.trim(), senha, telefone);
      if (ok) router.replace('/onboarding');
    }
  }

  function verDemonstracao() {
    entrarDemo();
    router.replace('/(tabs)'); // demonstração vai direto ao painel
  }

  const cadastrando = modo === 'cadastrar';
  const autenticando = modo === 'entrar' || modo === 'cadastrar';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollConteudo}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
        {modo === 'boas-vindas' ? (
          <Animated.View
            key="bv"
            entering={SlideInLeft.duration(260)}
            exiting={SlideOutLeft.duration(200)}
            style={styles.boasVindas}
          >
            <View style={styles.bvHero}>
              <PulsoLogo size={54} color={colors.papel} />
              <Heartbeat color={colors.vivo} width={96} height={30} />
              <Text style={styles.bvClaim}>Saiba antes do caixa apertar.</Text>
              <Text style={styles.bvSub}>
                O Pulso acompanha o dinheiro do seu negócio e te avisa, em português claro, quando o
                caixa vai apertar.
              </Text>
            </View>
            <View style={styles.bvBotoes}>
              <Pressable
                style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
                onPress={() => irPara('cadastrar')}
              >
                <Text style={styles.botaoTexto}>Criar conta</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.botaoLinha, pressed && styles.pressionado]}
                onPress={() => irPara('entrar')}
              >
                <Text style={styles.botaoLinhaTexto}>Já tenho conta</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.demoDestaque, pressed && styles.pressionado]}
                onPress={verDemonstracao}
              >
                <Heartbeat color={colors.vivo} width={22} height={12} />
                <Text style={styles.demoDestaqueTexto}>Ver o Pulso funcionando</Text>
              </Pressable>
            </View>
            <View style={styles.bvRodape}>
              <Pressable onPress={() => Linking.openURL(TERMOS_URL)} hitSlop={8}>
                <Text style={styles.bvLink}>Termos</Text>
              </Pressable>
              <Text style={styles.bvLinkSep}>·</Text>
              <Pressable onPress={() => Linking.openURL(PRIVACIDADE_URL)} hitSlop={8}>
                <Text style={styles.bvLink}>Privacidade</Text>
              </Pressable>
              {VERSAO_APP ? <Text style={styles.bvVersao}>v{VERSAO_APP}</Text> : null}
            </View>
          </Animated.View>
        ) : (
        <Animated.View
          key="auth"
          entering={SlideInRight.duration(260)}
          exiting={SlideOutRight.duration(200)}
          style={styles.authWrap}
        >
        <View style={styles.hero}>
          <Pressable onPress={() => irPara('boas-vindas')} hitSlop={8} style={styles.voltarInicio}>
            <Ionicons name="chevron-back" size={20} color={colors.papelSobreMata} />
            <Text style={styles.voltarInicioTexto}>Início</Text>
          </Pressable>
          <PulsoLogo size={44} color={colors.papel} />
          <Text style={styles.claim}>
            O sinal vital do seu negócio. O Pulso avisa <Text style={styles.claimForte}>antes</Text>{' '}
            do caixa acabar.
          </Text>
        </View>

        <View style={styles.form}>
          {aviso && <Text style={styles.avisoTexto}>{aviso}</Text>}

          {autenticando && (
            <>
              {cadastrando && (
                <>
                  <Text style={styles.label}>NOME DO SEU NEGÓCIO</Text>
                  <TextInput
                    style={[styles.input, errosCampo.negocio ? styles.inputErro : null]}
                    value={negocio}
                    onChangeText={(v) => { setNegocio(v); if (errosCampo.negocio) setErrosCampo((e) => ({ ...e, negocio: undefined })); }}
                    onBlur={() => validarCampo('negocio')}
                    placeholder="Ex.: Loja Aurora"
                    placeholderTextColor={colors.cinza}
                  />
                  {errosCampo.negocio ? <Text style={styles.erroCampo}>{errosCampo.negocio}</Text> : null}

                  <Text style={styles.label}>WHATSAPP</Text>
                  <TextInput
                    style={[styles.input, errosCampo.telefone ? styles.inputErro : null]}
                    value={telefone}
                    onChangeText={(t) => { setTelefone(mascaraTelefone(t)); if (errosCampo.telefone) setErrosCampo((e) => ({ ...e, telefone: undefined })); }}
                    onFocus={rolarAteCampo}
                    onBlur={() => validarCampo('telefone')}
                    placeholder="(11) 91234-5678"
                    placeholderTextColor={colors.cinza}
                    keyboardType="phone-pad"
                    maxLength={16}
                    textContentType="telephoneNumber"
                  />
                  {errosCampo.telefone ? <Text style={styles.erroCampo}>{errosCampo.telefone}</Text> : null}
                </>
              )}

              <Text style={styles.label}>E-MAIL</Text>
              <TextInput
                style={[styles.input, errosCampo.email ? styles.inputErro : null]}
                value={email}
                onChangeText={(v) => { setEmail(v); if (errosCampo.email) setErrosCampo((e) => ({ ...e, email: undefined })); }}
                onBlur={() => validarCampo('email')}
                placeholder="voce@suaempresa.com.br"
                placeholderTextColor={colors.cinza}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
              />
              {errosCampo.email ? <Text style={styles.erroCampo}>{errosCampo.email}</Text> : null}

              <Text style={styles.label}>SENHA</Text>
              <View style={[styles.senhaLinha, errosCampo.senha ? styles.inputErro : null]}>
                <TextInput
                  style={styles.senhaInput}
                  value={senha}
                  onChangeText={(v) => { setSenha(v); if (errosCampo.senha) setErrosCampo((e) => ({ ...e, senha: undefined })); }}
                  onFocus={rolarAteCampo}
                  onBlur={() => validarCampo('senha')}
                  placeholder={cadastrando ? 'Crie uma senha (mín. 8 caracteres)' : '••••••••'}
                  placeholderTextColor={colors.cinza}
                  secureTextEntry={!mostrarSenha}
                  autoCapitalize="none"
                  autoComplete={cadastrando ? 'new-password' : 'current-password'}
                  textContentType={cadastrando ? 'newPassword' : 'password'}
                />
                <Pressable
                  onPress={() => setMostrarSenha((v) => !v)}
                  hitSlop={8}
                  style={styles.olho}
                  accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <Ionicons
                    name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={colors.cinza}
                  />
                </Pressable>
              </View>
              {errosCampo.senha ? <Text style={styles.erroCampo}>{errosCampo.senha}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.botao, (pressed || !podeEnviar) && styles.pressionado]}
                onPress={enviar}
                disabled={carregando}
              >
                {carregando ? (
                  <View style={styles.carregandoLinha}>
                    <ActivityIndicator color={colors.mata} />
                    <Text style={styles.botaoTexto}>{cadastrando ? 'Criando…' : 'Entrando…'}</Text>
                  </View>
                ) : (
                  <Text style={styles.botaoTexto}>{cadastrando ? 'Criar conta' : 'Entrar'}</Text>
                )}
              </Pressable>

              {/* demonstração sempre à mão, abaixo do login, pra testar sem criar conta */}
              {!carregando && (
                <Pressable
                  onPress={verDemonstracao}
                  style={({ pressed }) => [styles.demoBtn, pressed && styles.pressionado]}
                >
                  <Text style={styles.demoBtnTexto}>Ver demonstração (sem conta)</Text>
                </Pressable>
              )}

              {carregando ? (
                <Text style={styles.carregandoMsg}>{MENSAGENS_CARREGANDO[msg]}</Text>
              ) : erro ? (
                <Text style={styles.erroTexto}>{erro}</Text>
              ) : (
                <>
                  <Pressable onPress={() => irPara(cadastrando ? 'entrar' : 'cadastrar')} hitSlop={8} style={styles.trocaModo}>
                    <Text style={styles.trocaModoTexto}>
                      {cadastrando ? 'Já tenho conta. Entrar' : 'Ainda não tem conta? Criar agora'}
                    </Text>
                  </Pressable>
                  {modo === 'entrar' && (
                    <Pressable onPress={() => irPara('esqueci')} hitSlop={8} style={styles.trocaModo}>
                      <Text style={styles.linkSecundario}>Esqueci minha senha</Text>
                    </Pressable>
                  )}
                </>
              )}
            </>
          )}

          {modo === 'esqueci' && (
            <>
              <Text style={styles.instrucao}>
                Digite seu e-mail e enviaremos um código para você criar uma senha nova.
              </Text>
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
              <Pressable
                style={({ pressed }) => [styles.botao, (pressed || ocupado) && styles.pressionado]}
                onPress={enviarCodigo}
                disabled={ocupado || email.trim().length === 0}
              >
                <Text style={styles.botaoTexto}>{ocupado ? 'Enviando…' : 'Enviar código'}</Text>
              </Pressable>
              {erroLocal && <Text style={styles.erroTexto}>{erroLocal}</Text>}
              <Pressable onPress={() => irPara('entrar')} hitSlop={8} style={styles.trocaModo}>
                <Text style={styles.trocaModoTexto}>Voltar para entrar</Text>
              </Pressable>
            </>
          )}

          {modo === 'redefinir' && (
            <>
              <Text style={styles.instrucao}>
                Cole o código que enviamos no seu e-mail e escolha a nova senha.
              </Text>
              <Text style={styles.label}>CÓDIGO DO E-MAIL</Text>
              <TextInput
                style={styles.input}
                value={codigo}
                onChangeText={setCodigo}
                placeholder="cole o código aqui"
                placeholderTextColor={colors.cinza}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.label}>NOVA SENHA</Text>
              <TextInput
                style={styles.input}
                value={senha}
                onChangeText={setSenha}
                placeholder="mín. 8 caracteres"
                placeholderTextColor={colors.cinza}
                secureTextEntry
              />
              <Pressable
                style={({ pressed }) => [styles.botao, (pressed || ocupado) && styles.pressionado]}
                onPress={redefinir}
                disabled={ocupado || codigo.trim().length === 0 || senha.length < 8}
              >
                <Text style={styles.botaoTexto}>{ocupado ? 'Salvando…' : 'Redefinir senha'}</Text>
              </Pressable>
              {erroLocal && <Text style={styles.erroTexto}>{erroLocal}</Text>}
              <Pressable onPress={() => irPara('entrar')} hitSlop={8} style={styles.trocaModo}>
                <Text style={styles.trocaModoTexto}>Voltar para entrar</Text>
              </Pressable>
            </>
          )}
        </View>
        </Animated.View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mata },
  centro: { justifyContent: 'center', alignItems: 'center' },
  wrap: { flex: 1 },
  // flexGrow:1 deixa o herói ocupar o espaço quando sobra, mas permite ROLAR
  // até os campos quando o teclado sobe (A1 — teclado não cobre a digitação).
  scrollConteudo: { flexGrow: 1, paddingBottom: 24 },
  authWrap: { flexGrow: 1 },
  // ---- tela de boas-vindas (porta de entrada, 3 caminhos) ----
  boasVindas: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 44, paddingBottom: 24, gap: 24, minHeight: 560 },
  bvHero: { flex: 1, justifyContent: 'center', alignItems: 'flex-start', gap: 16 },
  bvClaim: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.papel, letterSpacing: -0.6 },
  bvSub: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: colors.papelSobreMata, maxWidth: '94%' },
  bvBotoes: { gap: 10 },
  botaoLinha: { borderWidth: 1.5, borderColor: 'rgba(245,244,242,0.35)', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  botaoLinhaTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.papel },
  demoDestaque: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  demoDestaqueTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.vivo },
  bvRodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  bvLink: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.papelSobreMata },
  bvLinkSep: { color: colors.rotuloSobreMata, fontSize: 12.5 },
  bvVersao: { fontFamily: fonts.mono, fontSize: 11, color: colors.rotuloSobreMata, marginLeft: 6 },
  voltarInicio: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: 6 },
  voltarInicioTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.papelSobreMata },

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
  // folha clara: space.block a separa do texto do cabeçalho escuro (não encosta)
  form: {
    backgroundColor: colors.papel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: space.section,
    paddingBottom: space.block,
    marginTop: space.block,
    // gap 0: o ritmo é explícito (tight rótulo->campo, group entre campos)
    gap: 0,
  },
  // rótulo: space.group acima separa um campo do anterior; o campo cola nele (tight)
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.cinza,
    marginTop: space.group,
  },
  input: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: space.tight,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: colors.tinta,
  },
  inputErro: { borderColor: colors.critico },
  erroCampo: {
    fontFamily: fonts.corpo,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.critico,
    marginTop: 5,
  },
  // senha com botão de mostrar/ocultar: a "caixa" fica na linha; o input é só texto
  senhaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: space.tight,
  },
  senhaInput: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: colors.tinta,
  },
  olho: { paddingLeft: 8, paddingVertical: 6 },
  // botão principal: space.section o separa dos campos acima
  botao: {
    backgroundColor: colors.vivo,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: space.section,
  },
  pressionado: { opacity: 0.85 },
  botaoTexto: {
    fontFamily: fonts.displayMedio,
    fontSize: 16,
    color: '#06231A',
  },
  carregandoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  carregandoMsg: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.okEscuro,
    textAlign: 'center',
    marginTop: space.group,
  },
  // botões/links secundários abaixo do principal: space.item entre eles
  trocaModo: { marginTop: space.item, alignItems: 'center' },
  trocaModoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.mata },
  demoBtn: {
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: space.item,
  },
  demoBtnTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
  erroTexto: {
    fontFamily: fonts.corpo,
    fontSize: 13,
    lineHeight: 19,
    color: colors.critico,
    textAlign: 'center',
    marginTop: space.group,
  },
  avisoTexto: {
    fontFamily: fonts.corpo,
    fontSize: 13,
    lineHeight: 19,
    color: colors.okEscuro,
    textAlign: 'center',
    marginBottom: space.tight,
  },
  instrucao: {
    fontFamily: fonts.corpo,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.cinza,
    marginBottom: 4,
  },
  linkSecundario: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.cinza },
});
