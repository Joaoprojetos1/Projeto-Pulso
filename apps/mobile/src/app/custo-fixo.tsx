/**
 * Custo fixo por CONFIRMAÇÃO (itens 2.7 e 2.8) — fim da digitação.
 *
 * O motor (core) identifica os débitos recorrentes dos arquivos enviados e
 * apresenta cada um para o dono confirmar, corrigir ou acrescentar — em vez de
 * perguntar o custo fixo em branco. A soma vira o custo fixo que o motor usa.
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

import { MoneyInput } from '@/components/money-input';
import { fetchMyFixedCost, saveMyFixedCost, type FixedCostJson } from '@/lib/api';
import { brl } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

interface Item {
  key: string;
  label: string;
  amountCents: number;
  category: string | null;
  source: 'inferred' | 'manual';
  occurrences?: number;
}

const COMUNS = ['Aluguel', 'Funcionários', 'Água', 'Luz', 'IPTU', 'Condomínio', 'Software', 'Limpeza', 'Seguro'];

let seq = 0;
const novaKey = () => `i${seq++}`;

export default function CustoFixo() {
  const { token, carregar } = usePulso();
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [inferidos, setInferidos] = useState(0);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchMyFixedCost(token)
      .then((d: FixedCostJson) => {
        if (!vivo) return;
        // se já confirmou antes, edita o que salvou; senão parte das sugestões do motor
        if (d.items.length > 0) {
          setItens(d.items.map((i) => ({ key: novaKey(), label: i.label, amountCents: i.amountCents, category: i.category, source: i.source })));
        } else {
          setItens(
            d.suggestions.map((s) => ({
              key: novaKey(),
              label: s.label,
              amountCents: s.monthlyCents,
              category: s.category,
              source: 'inferred' as const,
              occurrences: s.occurrences,
            })),
          );
          setInferidos(d.suggestions.length);
        }
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [token]);

  function atualizar(key: string, patch: Partial<Item>) {
    setItens((its) => its.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function remover(key: string) {
    setItens((its) => its.filter((i) => i.key !== key));
  }
  function adicionar(label = '') {
    setItens((its) => [...its, { key: novaKey(), label, amountCents: 0, category: null, source: 'manual' }]);
  }

  const total = itens.reduce((s, i) => s + (i.amountCents || 0), 0);

  async function confirmar() {
    if (!token || salvando) return;
    setSalvando(true);
    try {
      await saveMyFixedCost(
        token,
        itens
          .filter((i) => i.label.trim().length > 0)
          .map((i) => ({ label: i.label.trim(), amountCents: i.amountCents || 0, category: i.category, source: i.source })),
      );
      await carregar();
      router.replace('/(tabs)');
    } catch {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topo}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.tinta} />
          </Pressable>
          <Text style={styles.tituloTopo}>Seus custos fixos</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {carregando ? (
            <ActivityIndicator color={colors.vivo} style={{ marginTop: 30 }} />
          ) : (
            <>
              <Text style={styles.intro}>
                {inferidos > 0
                  ? 'Identifiquei estes gastos que se repetem todo mês nos seus arquivos. Confira o valor, corrija o que estiver diferente e acrescente o que faltou.'
                  : 'Liste os gastos que se repetem todo mês (aluguel, funcionários, água, luz…). Assim que você enviar extratos, eu passo a identificá-los sozinho.'}
              </Text>

              {itens.map((it) => (
                <View key={it.key} style={styles.item}>
                  <View style={styles.itemTopo}>
                    <TextInput
                      style={styles.labelInput}
                      value={it.label}
                      onChangeText={(t) => atualizar(it.key, { label: t })}
                      placeholder="Nome do gasto"
                      placeholderTextColor={colors.cinza}
                    />
                    <Pressable onPress={() => remover(it.key)} hitSlop={8} accessibilityLabel="Remover">
                      <Ionicons name="close-circle" size={22} color={colors.cinza} />
                    </Pressable>
                  </View>
                  <MoneyInput
                    valueCents={it.amountCents}
                    onChangeCents={(c) => atualizar(it.key, { amountCents: c ?? 0 })}
                    style={styles.money}
                  />
                  {it.source === 'inferred' && it.occurrences ? (
                    <Text style={styles.tag}>Identificado · apareceu em {it.occurrences} meses</Text>
                  ) : null}
                </View>
              ))}

              <Text style={styles.rotulo}>Acrescentar</Text>
              <View style={styles.chips}>
                {COMUNS.filter((c) => !itens.some((i) => i.label.toLowerCase() === c.toLowerCase())).map((c) => (
                  <Pressable key={c} style={styles.chip} onPress={() => adicionar(c)}>
                    <Text style={styles.chipTexto}>+ {c}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.chip} onPress={() => adicionar()}>
                  <Text style={styles.chipTexto}>+ Outro</Text>
                </Pressable>
              </View>

              <View style={styles.totalLinha}>
                <Text style={styles.totalRotulo}>Custo fixo por mês</Text>
                <Text style={styles.totalValor}>{brl(total)}</Text>
              </View>

              <Pressable
                style={({ pressed }) => [styles.botao, salvando && styles.botaoOff, pressed && styles.pressionado]}
                onPress={confirmar}
                disabled={salvando}
              >
                <Text style={styles.botaoTexto}>{salvando ? 'Salvando…' : 'Confirmar custo fixo'}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 17, color: colors.tinta },
  scroll: { padding: 20, paddingBottom: 40, gap: 14 },
  intro: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: colors.cinza },

  item: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, padding: 12, gap: 8 },
  itemTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  labelInput: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta, paddingVertical: 2 },
  money: {},
  tag: { fontFamily: fonts.corpo, fontSize: 12, color: colors.mata },

  rotulo: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.branco },
  chipTexto: { fontFamily: fonts.corpo, fontSize: 13, color: colors.mata },

  totalLinha: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.linha, paddingTop: 14, marginTop: 4 },
  totalRotulo: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  totalValor: { fontFamily: fonts.display, fontSize: 22, color: colors.tinta, fontVariant: ['tabular-nums'] },

  botao: { backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  botaoOff: { opacity: 0.6 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: '#06231A' },
  pressionado: { opacity: 0.85 },
});
