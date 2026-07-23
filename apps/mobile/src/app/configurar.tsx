/**
 * Configurar meu caixa — o "insumo" mínimo pro motor girar.
 *
 * O dono informa dois números: quanto tem em caixa HOJE e quanto sai de custo
 * fixo por MÊS. Junto com as Contas (a receber/pagar), isto basta pro servidor
 * projetar o caixa e disparar os alertas. O app NÃO calcula nada: manda os dois
 * números pro /me/setup e recarrega o painel já calculado pelo motor.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMySetup, saveMySetup } from '@/lib/api';
import { brl } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

/** "1.234,50" ou "-80" → centavos inteiros. null se não for número. */
function paraCents(txt: string): number | null {
  const limpo = txt.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (limpo === '' || limpo === '-') return null;
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
function centsParaCampo(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export default function Configurar() {
  const { token, carregar } = usePulso();
  const [caixa, setCaixa] = useState('');
  const [custo, setCusto] = useState('');
  const [plannedCount, setPlannedCount] = useState(0);
  const [carregandoSetup, setCarregandoSetup] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const prefill = useCallback(async () => {
    if (!token) {
      setCarregandoSetup(false);
      return;
    }
    try {
      const s = await fetchMySetup(token);
      if (s.cashBalanceCents != null) setCaixa(centsParaCampo(s.cashBalanceCents));
      if (s.fixedCostCents != null) setCusto(centsParaCampo(s.fixedCostCents));
      setPlannedCount(s.plannedCount);
    } catch {
      // sem prefill: o dono digita do zero (não é erro que trave a tela)
    } finally {
      setCarregandoSetup(false);
    }
  }, [token]);

  useEffect(() => {
    void prefill();
  }, [prefill]);

  const cxCents = paraCents(caixa); // pode ser negativo (cheque especial)
  const custoCents = paraCents(custo);
  const custoValido = custoCents != null && custoCents >= 0;
  const pode = token != null && cxCents != null && custoValido && !salvando;

  async function calcular() {
    if (!token || cxCents == null || !custoValido) {
      setErro('Preencha os dois valores para o Pulso calcular.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await saveMySetup(token, cxCents, custoCents);
      await carregar(); // traz o painel já recalculado pelo motor
      router.replace('/(tabs)');
    } catch {
      setErro('Não consegui salvar agora. Tente de novo em instantes.');
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.voltar}>
          <Ionicons name="chevron-back" size={22} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Configurar meu caixa</Text>
        <View style={styles.voltar} />
      </View>

      <ScrollView contentContainerStyle={styles.corpo} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(220)}>
          <Text style={styles.titulo}>Dois números e o Pulso já projeta o seu caixa.</Text>
          <Text style={styles.subtitulo}>
            Não precisa de planilha nem de sistema. Com isto, mais as suas Contas a receber e a
            pagar, o monitor liga na hora.
          </Text>
        </Animated.View>

        {carregandoSetup ? (
          <ActivityIndicator color={colors.mata} style={{ marginTop: 30 }} />
        ) : (
          <Animated.View entering={FadeInDown.duration(240).delay(60)}>
            <Text style={styles.label}>QUANTO VOCÊ TEM EM CAIXA HOJE (R$)</Text>
            <TextInput
              style={styles.input}
              value={caixa}
              onChangeText={setCaixa}
              placeholder="Ex.: 21.300,00"
              placeholderTextColor={colors.cinza}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.ajuda}>O que está em conta agora, somando tudo.</Text>

            <Text style={[styles.label, { marginTop: 20 }]}>CUSTO FIXO POR MÊS (R$)</Text>
            <TextInput
              style={styles.input}
              value={custo}
              onChangeText={setCusto}
              placeholder="Ex.: 34.200,00"
              placeholderTextColor={colors.cinza}
              keyboardType="decimal-pad"
            />
            <Text style={styles.ajuda}>Aluguel, equipe, impostos — o que sai todo mês.</Text>

            <View style={styles.contasNota}>
              <Ionicons name="receipt-outline" size={18} color={colors.okEscuro} />
              <Text style={styles.contasNotaTexto}>
                {plannedCount > 0
                  ? `${plannedCount} conta(s) a receber/pagar já entram na projeção.`
                  : 'Cadastre suas contas a receber e a pagar na aba Contas para a projeção ficar mais precisa.'}
              </Text>
            </View>

            {erro && <Text style={styles.erro}>{erro}</Text>}

            <Pressable
              onPress={calcular}
              disabled={!pode}
              style={({ pressed }) => [styles.botao, (pressed || !pode) && styles.botaoOff]}
            >
              {salvando ? (
                <ActivityIndicator color="#06231A" size="small" />
              ) : (
                <Text style={styles.botaoTexto}>Calcular meu caixa</Text>
              )}
            </Pressable>

            {cxCents != null && custoValido && !salvando && (
              <Text style={styles.previa}>
                Caixa hoje: {brl(cxCents)} · custo fixo: {brl(custoCents)}/mês
              </Text>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.tinta },
  corpo: { paddingHorizontal: 20, paddingBottom: 40 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: colors.tinta,
    letterSpacing: -0.4,
    marginTop: 8,
  },
  subtitulo: {
    fontFamily: fonts.corpo,
    fontSize: 14,
    lineHeight: 21,
    color: colors.cinza,
    marginTop: 10,
  },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.cinza, marginTop: 22 },
  input: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.tinta,
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  ajuda: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, marginTop: 6 },
  contasNota: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F0FBF6',
    borderRadius: 12,
    padding: 12,
    marginTop: 24,
  },
  contasNotaTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.tinta },
  erro: { fontFamily: fonts.corpo, fontSize: 13, color: colors.critico, textAlign: 'center', marginTop: 16 },
  botao: {
    backgroundColor: colors.vivo,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 24,
  },
  botaoOff: { opacity: 0.5 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: '#06231A' },
  previa: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.cinza,
    textAlign: 'center',
    marginTop: 14,
    fontVariant: ['tabular-nums'],
  },
});
