/**
 * Escolha de plano. Vive num componente porque aparece em DOIS lugares: como
 * passo 7 do onboarding (depois da demonstração — a pessoa já viu o valor) e na
 * tela /assinar, que é a porta de quem voltou com a assinatura pendente.
 *
 * O app NÃO cobra: cada plano abre o checkout no site (fora das lojas). Em modo
 * teste, tocar num plano ativa na hora, sem cobrança. As duas portas nunca ficam
 * acessíveis ao mesmo tempo.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { activateTestSubscription, fetchPlans, type PlanJson } from '@/lib/api';
import { brl } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

// checkout no site (sem comissão de loja). Configurável por env.
const CHECKOUT_BASE =
  process.env.EXPO_PUBLIC_CHECKOUT_URL ?? 'https://seuivo.com.br/checkout.html';

export interface PlanosProps {
  /** Chamado quando a assinatura passa a valer (ativação em teste ou "já paguei"). */
  aoAtivar: () => void;
}

/** Tarja de modo teste — fica fora do scroll na tela que usa. */
export function TarjaModoTeste() {
  return (
    <View style={styles.tarjaTeste}>
      <Ionicons name="flask" size={15} color="#FFFFFF" />
      <Text style={styles.tarjaTesteTexto}>Modo teste, nenhuma cobrança</Text>
    </View>
  );
}

/** true quando o servidor está com o modo teste de assinatura ligado. */
export function useModoTeste(): boolean {
  const [teste, setTeste] = useState(false);
  useEffect(() => {
    fetchPlans()
      .then(({ testMode }) => setTeste(testMode))
      .catch(() => setTeste(false));
  }, []);
  return teste;
}

export function Planos({ aoAtivar }: PlanosProps) {
  const { companyId, token, assinatura, atualizarAssinatura } = usePulso();
  const [planos, setPlanos] = useState<PlanJson[] | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const jaAtivo = assinatura?.active ?? false;

  useEffect(() => {
    fetchPlans()
      .then(({ plans, testMode: t }) => { setPlanos(plans); setTestMode(t); })
      .catch(() => setPlanos([]));
  }, []);

  async function escolherPlano(plano: PlanJson) {
    if (testMode) {
      if (!token || ocupado) return;
      setOcupado(true);
      setMsg(null);
      try {
        await activateTestSubscription(token, plano.id);
        await atualizarAssinatura();
        aoAtivar();
      } catch {
        setMsg('Não consegui ativar agora. Tente de novo.');
      } finally {
        setOcupado(false);
      }
    } else {
      const url = `${CHECKOUT_BASE}?plano=${plano.id}&empresa=${companyId ?? ''}&from=app`;
      void Linking.openURL(url);
      setMsg('Abrimos o checkout no navegador. Depois de pagar, volte e toque em "Já paguei".');
    }
  }

  async function jaPaguei() {
    setVerificando(true);
    setMsg(null);
    const s = await atualizarAssinatura();
    setVerificando(false);
    if (s?.active) {
      aoAtivar();
    } else {
      setMsg('Ainda não consta como paga. Se acabou de pagar, aguarde um instante e tente de novo.');
    }
  }

  return (
    <View style={styles.lista}>
      {msg && (
        <View style={styles.aviso}>
          <Text style={styles.avisoTexto}>{msg}</Text>
        </View>
      )}

      {planos === null ? (
        <ActivityIndicator color={colors.mata} style={{ marginTop: space.section }} />
      ) : (
        planos.map((p) => {
          const atual = jaAtivo && assinatura?.planId === p.id;
          return (
            <View key={p.id} style={[styles.plano, atual && styles.planoAtual]}>
              <View style={styles.planoTopo}>
                <Text style={styles.planoNome}>{p.name}</Text>
                {atual && <Text style={styles.selo}>SEU PLANO</Text>}
              </View>
              <Text style={styles.planoPreco}>
                {brl(p.priceCents)}
                <Text style={styles.planoMes}> /mês</Text>
              </Text>
              <View style={styles.beneficios}>
                <Beneficio texto="Monitor de caixa e alertas antes do aperto" />
                <Beneficio texto={`${p.chatLimitMonthly} conversas com a IA por mês`} />
                <Beneficio texto="Contas a pagar e a receber, e o simulador" />
              </View>
              <Pressable
                onPress={() => escolherPlano(p)}
                disabled={atual || ocupado}
                style={({ pressed }) => [styles.botao, atual && styles.botaoOff, pressed && styles.pressionado]}
              >
                <Text style={styles.botaoTexto}>
                  {atual ? 'Plano atual' : testMode ? `Ativar ${p.name}` : `Assinar ${p.name}`}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      {!jaAtivo && !testMode && (
        <Pressable
          onPress={jaPaguei}
          disabled={verificando}
          style={({ pressed }) => [styles.jaPaguei, pressed && styles.pressionado]}
        >
          {verificando ? (
            <ActivityIndicator color={colors.mata} size="small" />
          ) : (
            <Text style={styles.jaPagueiTexto}>Já paguei, atualizar</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function Beneficio({ texto }: { texto: string }) {
  return (
    <View style={styles.beneficio}>
      <Ionicons name="checkmark" size={16} color={colors.okEscuro} />
      <Text style={styles.beneficioTexto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { gap: space.item },
  tarjaTeste: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.alerta,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  tarjaTesteTexto: { fontFamily: fonts.corpoForte, fontSize: 13.5, color: '#FFFFFF', letterSpacing: 0.2 },

  aviso: { backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 12, padding: 12 },
  avisoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.okEscuro, lineHeight: 19 },

  plano: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 16, padding: 18, gap: 6 },
  planoAtual: { borderColor: colors.vivo, borderWidth: 1.5 },
  planoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planoNome: { fontFamily: fonts.display, fontSize: 18, color: colors.tinta },
  selo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.okEscuro, backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  planoPreco: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  planoMes: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza, letterSpacing: 0 },
  beneficios: { gap: 6, marginTop: 6, marginBottom: 4 },
  beneficio: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  beneficioTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 19, color: colors.tinta },

  botao: { backgroundColor: colors.vivo, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  botaoOff: { backgroundColor: colors.papel, borderWidth: 1, borderColor: colors.linha },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#FFFFFF' },

  jaPaguei: { borderWidth: 1.5, borderColor: colors.mata, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  jaPagueiTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
  pressionado: { opacity: 0.8 },
});
