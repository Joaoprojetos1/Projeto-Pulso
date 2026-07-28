/**
 * Números do mês — o insumo dos indicadores de SEGMENTO.
 *
 * Os indicadores de segmento (glosa, CMV, giro, ocupação…) dependem de dados que
 * não são lançamentos. Aqui o dono informa os números do mês do SEU segmento,
 * com máscara de reais onde é dinheiro. O app não calcula nada: manda os valores
 * para /me/operations e recarrega o painel já recalculado pelo motor.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Heartbeat } from '@/components/heartbeat';
import { MoneyInput } from '@/components/money-input';
import { fetchMyOperations, saveMyOperations, type OperationsJson, type SegmentFieldJson } from '@/lib/api';
import { hojeISO } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** '2026-07' → "julho 2026" */
function mesLabel(m: string): string {
  const [y, mm] = m.split('-');
  return `${MESES[Number(mm) - 1]} ${y}`;
}
/** '2026-07' → "jul" (chip curto) */
function mesCurto(m: string): string {
  const [, mm] = m.split('-');
  return MESES[Number(mm) - 1]!.slice(0, 3);
}

/** Últimos N meses (YYYY-MM), do mais recente ao mais antigo. */
function ultimosMeses(n: number): string[] {
  const hoje = hojeISO();
  const [y, m] = hoje.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(y!, m! - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export default function NumerosDoMes() {
  const { token, carregar } = usePulso();
  const [ops, setOps] = useState<OperationsJson | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const [mes, setMes] = useState(() => hojeISO().slice(0, 7));
  const [valores, setValores] = useState<Record<string, number | null>>({});

  const meses = useMemo(() => ultimosMeses(6), []);

  const prefill = useCallback(
    (dados: OperationsJson, mesAlvo: string) => {
      const doMes = dados.months.find((x) => x.month === mesAlvo)?.values ?? {};
      const next: Record<string, number | null> = {};
      for (const f of dados.fields) next[f.slug] = doMes[f.slug] ?? null;
      setValores(next);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!token) {
      setCarregando(false);
      return;
    }
    try {
      const dados = await fetchMyOperations(token);
      setOps(dados);
      prefill(dados, mes);
    } catch {
      setErro('Não consegui carregar agora. Tente de novo em instantes.');
    } finally {
      setCarregando(false);
    }
  }, [token, mes, prefill]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // troca de mês: repõe os campos com o que já havia naquele mês
  function selecionarMes(m: string) {
    setMes(m);
    setSalvo(false);
    if (ops) prefill(ops, m);
  }

  function setValor(slug: string, v: number | null) {
    setValores((atual) => ({ ...atual, [slug]: v }));
    setSalvo(false);
  }

  const preenchidos = Object.values(valores).filter((v) => v != null).length;

  async function salvar() {
    if (!token || !ops) return;
    const values: Record<string, number> = {};
    for (const [slug, v] of Object.entries(valores)) if (v != null && v >= 0) values[slug] = v;
    if (Object.keys(values).length === 0) {
      setErro('Preencha ao menos um número deste mês.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await saveMyOperations(token, mes, values);
      setOps(atualizado);
      prefill(atualizado, mes);
      await carregar(); // traz o painel já recalculado (indicadores de segmento)
      setSalvo(true);
    } catch {
      setErro('Não consegui salvar agora. Tente de novo em instantes.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cabecalho}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.voltar}>
          <Ionicons name="chevron-back" size={22} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Números do mês</Text>
        <View style={styles.voltar} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.corpo} keyboardShouldPersistTaps="handled">
          {carregando ? (
            <ActivityIndicator color={colors.mata} style={{ marginTop: space.section }} />
          ) : !token ? (
            <Aviso texto="Crie uma conta para informar os números do seu mês. Na demonstração eles não são salvos." />
          ) : !ops || ops.fields.length === 0 ? (
            <Aviso texto="Sua empresa ainda não tem um segmento definido. Fale com o suporte para ativar os números do mês do seu ramo." />
          ) : (
            <>
              <Animated.View entering={FadeInDown.duration(220)}>
                <Text style={styles.titulo}>Os números do seu {ops.segmentLabel?.toLowerCase() ?? 'negócio'}.</Text>
                <Text style={styles.subtitulo}>
                  Informe os números deste mês e o Pulso calcula os indicadores do seu ramo. Preencha o que tiver — o resto fica para depois.
                </Text>
              </Animated.View>

              {/* seletor de mês */}
              <Text style={styles.label}>MÊS DE REFERÊNCIA</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mesLinha}>
                {meses.map((m) => {
                  const ativo = m === mes;
                  const temDado = (ops.months.find((x) => x.month === m)?.values ?? null) != null && Object.keys(ops.months.find((x) => x.month === m)?.values ?? {}).length > 0;
                  return (
                    <Pressable key={m} onPress={() => selecionarMes(m)} style={[styles.mesChip, ativo && styles.mesChipAtivo]}>
                      <Text style={[styles.mesChipTexto, ativo && styles.mesChipTextoAtivo]}>{mesCurto(m)}</Text>
                      {temDado && <View style={[styles.mesPonto, ativo && { backgroundColor: '#06231A' }]} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.mesAtual}>{mesLabel(mes)}</Text>

              {/* campos do segmento */}
              {ops.fields.map((f, i) => (
                <Animated.View key={f.slug} entering={FadeInDown.duration(220).delay(40 + i * 20)} style={{ marginTop: space.group }}>
                  <Text style={styles.campoLabel}>{f.label}</Text>
                  <Campo field={f} value={valores[f.slug] ?? null} onChange={(v) => setValor(f.slug, v)} />
                  <Text style={styles.ajuda}>{f.description}</Text>
                </Animated.View>
              ))}

              {erro && <Text style={styles.erro}>{erro}</Text>}
              {salvo && (
                <View style={styles.okBox}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.okEscuro} />
                  <Text style={styles.okTexto}>Salvo e recalculado. Seus indicadores do mês já estão no painel.</Text>
                </View>
              )}

              <Pressable
                onPress={salvar}
                disabled={salvando}
                style={({ pressed }) => [styles.botao, (pressed || salvando) && styles.botaoOff]}
              >
                {salvando ? (
                  <View style={styles.salvandoRow}>
                    <Heartbeat color="#06231A" width={44} height={16} />
                    <Text style={styles.botaoTexto}>Calculando…</Text>
                  </View>
                ) : (
                  <Text style={styles.botaoTexto}>Salvar os números do mês</Text>
                )}
              </Pressable>
              <Text style={styles.previa}>{preenchidos} de {ops.fields.length} campos preenchidos</Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <View style={styles.avisoBox}>
      <Ionicons name="information-circle-outline" size={20} color={colors.cinza} />
      <Text style={styles.avisoTexto}>{texto}</Text>
    </View>
  );
}

/** Campo por unidade: dinheiro usa a máscara BRL; contagem/horas são inteiros. */
function Campo({ field, value, onChange }: { field: SegmentFieldJson; value: number | null; onChange: (v: number | null) => void }) {
  if (field.unit === 'cents') {
    return <MoneyInput valueCents={value} onChangeCents={onChange} placeholder="R$ 0,00" />;
  }
  const sufixo = field.unit === 'hours' ? 'horas' : undefined;
  return (
    <View style={styles.numLinha}>
      <TextInput
        style={styles.numInput}
        value={value != null ? String(value) : ''}
        onChangeText={(t) => {
          const so = t.replace(/\D/g, '');
          onChange(so ? Number(so) : null);
        }}
        placeholder="0"
        placeholderTextColor={colors.cinza}
        keyboardType="number-pad"
        inputMode="numeric"
      />
      {sufixo && <Text style={styles.numSufixo}>{sufixo}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  flex: { flex: 1 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  tituloTopo: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.tinta },
  corpo: { paddingHorizontal: 20, paddingBottom: space.block },
  titulo: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.tinta, letterSpacing: -0.4, marginTop: space.tight },
  subtitulo: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza, marginTop: space.tight },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.cinza, marginTop: space.section },
  mesLinha: { gap: 8, paddingVertical: space.tight, paddingRight: 8 },
  mesChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.linha, backgroundColor: colors.branco },
  mesChipAtivo: { backgroundColor: colors.vivo, borderColor: colors.vivo },
  mesChipTexto: { fontFamily: fonts.corpoForte, fontSize: 13, color: colors.tinta },
  mesChipTextoAtivo: { color: '#06231A' },
  mesPonto: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.vivo },
  mesAtual: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta, marginTop: 4 },
  campoLabel: { fontFamily: fonts.corpoForte, fontSize: 13.5, color: colors.tinta, marginBottom: space.tight },
  ajuda: { fontFamily: fonts.corpo, fontSize: 12, lineHeight: 17, color: colors.cinza, marginTop: 6 },
  numLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  numInput: { flex: 1, backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontFamily: fonts.display, fontSize: 20, color: colors.tinta, fontVariant: ['tabular-nums'] },
  numSufixo: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
  erro: { fontFamily: fonts.corpo, fontSize: 13, color: colors.critico, textAlign: 'center', marginTop: space.group },
  okBox: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F0FBF6', borderRadius: 12, padding: 12, marginTop: space.group },
  okTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.tinta },
  botao: { backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: space.section },
  botaoOff: { opacity: 0.5 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: '#06231A' },
  salvandoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previa: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.cinza, textAlign: 'center', marginTop: space.item, fontVariant: ['tabular-nums'] },
  avisoBox: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.branco, borderRadius: 12, borderWidth: 1, borderColor: colors.linha, padding: 16, marginTop: space.section },
  avisoTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.tinta },
});
