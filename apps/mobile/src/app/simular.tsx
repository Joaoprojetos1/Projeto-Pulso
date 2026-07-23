/**
 * Simulador "e se" — o Pulso vira consultor interativo.
 *
 * O dono liga ajustes hipotéticos (adiar pagamento, antecipar recebível, cortar
 * custo fixo, somar um recebível) e vê a curva redesenhar com a nova data de
 * zeragem. TUDO calculado no servidor (core determinístico, sem IA); nada é
 * alterado de verdade. O app só liga os chips e desenha o que o servidor manda.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SimLine } from '@/components/sim-line';
import { sendSimulate, type SimulationDelta, type SimulationResult } from '@/lib/api';
import { dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

function addDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

interface Chip {
  id: string;
  rotulo: string;
  delta: (asOf: string) => SimulationDelta;
}

const CHIPS: Chip[] = [
  { id: 'adiarPag', rotulo: 'Adiar maior pagamento 15 dias', delta: () => ({ type: 'delayLargestPayable', days: 15 }) },
  { id: 'antRec', rotulo: 'Antecipar maior recebível 15 dias', delta: () => ({ type: 'anticipateLargestReceivable', days: 15 }) },
  { id: 'cortarFixo', rotulo: 'Cortar R$ 1.000 de custo fixo', delta: () => ({ type: 'adjustFixedCost', deltaCents: -100_000 }) },
  { id: 'addRec', rotulo: 'Somar um recebível de R$ 5.000 em 15 dias', delta: (asOf) => ({ type: 'addPlanned', kind: 'receivable', amountCents: 500_000, dueOn: addDays(asOf, 15) }) },
];

const cents = (c: SimulationResult['original']['curve']) => c.map((p) => p.cents);
const zeroIndex = (c: SimulationResult['original']) =>
  c.zeroOn ? c.curve.findIndex((p) => p.day === c.zeroOn) : null;

export default function Simular() {
  const { token, fonte, dashboard } = usePulso();
  const asOf = dashboard?.snapshot.asOf ?? new Date().toISOString().slice(0, 10);
  const demo = fonte === 'demo' || !token;

  const [ativos, setAtivos] = useState<Set<string>>(new Set());
  const [res, setRes] = useState<SimulationResult | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (demo || !token) return;
    const deltas = CHIPS.filter((c) => ativos.has(c.id)).map((c) => c.delta(asOf));
    let vivo = true;
    setCarregando(true);
    setErro(false);
    sendSimulate(token, deltas)
      .then((r) => vivo && setRes(r))
      .catch(() => vivo && setErro(true))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [ativos, token, demo, asOf]);

  const temMudanca = ativos.size > 0;
  const real = res ? cents(res.original.curve) : [];
  const sim = res && temMudanca ? cents(res.simulated.curve) : null;
  const realZero = res ? zeroIndex(res.original) : null;
  const simZero = res && temMudanca ? zeroIndex(res.simulated) : null;

  function toggle(id: string) {
    setAtivos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && styles.pressionado}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.titulo}>Teste uma decisão</Text>
        <View style={{ width: 24 }} />
      </View>

      {demo ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTexto}>
            A simulação usa os seus números de verdade. Entre com sua conta para testar cenários no
            seu caixa.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.selo}>SIMULAÇÃO · nada foi alterado de verdade</Text>
          <Text style={styles.intro}>
            Toque nos ajustes e veja o que aconteceria com o seu caixa. É o mesmo motor que calcula
            seus alertas — sem chute.
          </Text>

          <View style={styles.grafico}>
            {erro ? (
              <Text style={styles.erroTexto}>Não consegui simular agora. Tente de novo.</Text>
            ) : real.length >= 2 ? (
              <SimLine real={real} sim={sim} realZeroIndex={realZero} simZeroIndex={simZero} />
            ) : carregando ? (
              <ActivityIndicator color={colors.mata} />
            ) : (
              <Text style={styles.erroTexto}>Sem projeção para simular ainda.</Text>
            )}
            {carregando && real.length >= 2 && (
              <ActivityIndicator color={colors.mata} style={styles.spinnerCanto} />
            )}
          </View>

          {/* legenda das duas datas de zeragem */}
          {res && (
            <View style={styles.legendas}>
              <View style={styles.legItem}>
                <View style={[styles.tra, { backgroundColor: realZero != null ? colors.critico : colors.vivo }]} />
                <Text style={styles.legTexto}>
                  Hoje: {res.original.zeroOn ? `risco em ${dataBR(res.original.zeroOn)}` : 'sem risco em 90 dias'}
                </Text>
              </View>
              {temMudanca && (
                <View style={styles.legItem}>
                  <View style={[styles.tra, styles.traSim]} />
                  <Text style={styles.legTexto}>
                    Com a mudança:{' '}
                    {res.simulated.zeroOn ? `risco em ${dataBR(res.simulated.zeroOn)}` : 'sem risco em 90 dias'}
                  </Text>
                </View>
              )}
            </View>
          )}

          <Text style={styles.secao}>O que você quer testar?</Text>
          <View style={styles.chips}>
            {CHIPS.map((c) => {
              const on = ativos.has(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => toggle(c.id)}
                  style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressionado]}
                >
                  <Text style={[styles.chipTexto, on && styles.chipTextoOn]}>{c.rotulo}</Text>
                </Pressable>
              );
            })}
          </View>

          {temMudanca && (
            <Pressable onPress={() => setAtivos(new Set())} style={({ pressed }) => [styles.limpar, pressed && styles.pressionado]}>
              <Text style={styles.limparTexto}>Limpar e voltar ao real</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  titulo: { fontFamily: fonts.display, fontSize: 18, color: colors.tinta, letterSpacing: -0.3 },
  pressionado: { opacity: 0.7 },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza, textAlign: 'center' },

  scroll: { padding: 16, gap: 12 },
  selo: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.alerta },
  intro: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza },

  grafico: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 14,
    minHeight: 150,
    justifyContent: 'center',
  },
  spinnerCanto: { position: 'absolute', top: 12, right: 12 },
  erroTexto: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza, textAlign: 'center' },

  legendas: { gap: 6 },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tra: { width: 18, height: 3, borderRadius: 2 },
  traSim: { backgroundColor: colors.mata },
  legTexto: { fontFamily: fonts.corpo, fontSize: 13, color: colors.tinta },

  secao: { fontFamily: fonts.display, fontSize: 15, color: colors.tinta, marginTop: 6 },
  chips: { gap: 8 },
  chip: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  chipOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.tinta },
  chipTextoOn: { color: colors.okEscuro },

  limpar: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
  limparTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.mata, textDecorationLine: 'underline' },
});
