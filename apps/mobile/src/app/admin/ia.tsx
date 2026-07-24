/**
 * IA e custos (operação). Agregados de consumo (ai_usage) por mês, modelo,
 * superfície (kind) e empresa — para achar outlier de consumo. App burro: busca
 * /admin/ai-usage e desenha. O total é em tokens (o custo em R$ depende da
 * tabela de preços do modelo, que vive fora daqui).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchAdminAiUsage, fetchAdminEconomy, type AdminAiUsageRow, type AdminEconomy } from '@/lib/api';
import { brl } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function IaCustos() {
  const { token, ehAdmin } = usePulso();
  const [linhas, setLinhas] = useState<AdminAiUsageRow[] | null>(null);
  const [eco, setEco] = useState<AdminEconomy | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchAdminAiUsage(token)
      .then((u) => vivo && setLinhas(u))
      .catch(() => vivo && setErro(true));
    fetchAdminEconomy(token)
      .then((e) => vivo && setEco(e))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [token]);

  // agrupa por mês para leitura
  const porMes = useMemo(() => {
    const mapa = new Map<string, AdminAiUsageRow[]>();
    for (const l of linhas ?? []) {
      const lista = mapa.get(l.month) ?? [];
      lista.push(l);
      mapa.set(l.month, lista);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [linhas]);

  if (!ehAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>Área restrita à operação.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>IA e custos</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        {eco && (
          <View style={styles.cartao}>
            <Text style={styles.secaoTitulo}>Economia por plano</Text>
            <Text style={styles.secaoSub}>
              {eco.avgCostCents != null
                ? `Custo médio por interação com a IA: ${brl(eco.avgCostCents)}`
                : 'Ainda sem conversas suficientes para estimar o custo por interação.'}
            </Text>
            {eco.byModel.map((m) => (
              <Text key={m.model} style={styles.kvSub}>
                {m.model}: {brl(m.avgCostCents)}/interação · {m.calls} chamadas
              </Text>
            ))}
            <View style={{ height: 6 }} />
            {eco.plans.map((p) => (
              <View key={p.id} style={styles.ecoPlano}>
                <Text style={styles.ecoNome}>
                  {p.name} · {brl(p.priceCents)}/mês · {p.chatLimit} interações
                </Text>
                <Text style={styles.ecoDetalhe}>
                  {p.costAtFullCents != null
                    ? `Se usar 100%: custo ~${brl(p.costAtFullCents)}, sobra ${brl(p.sobraCents ?? 0)}`
                    : 'Sem dados de custo ainda.'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {erro ? (
          <Text style={styles.vazioTexto}>Não consegui carregar o consumo.</Text>
        ) : linhas === null ? (
          <ActivityIndicator color={colors.mata} style={{ marginTop: 20 }} />
        ) : linhas.length === 0 ? (
          <Text style={styles.vazioTexto}>Nenhum consumo de IA registrado ainda.</Text>
        ) : (
          porMes.map(([mes, rows]) => {
            const totalMes = rows.reduce((s, r) => s + r.totalTokens, 0);
            return (
              <View key={mes} style={styles.cartao}>
                <View style={styles.mesTopo}>
                  <Text style={styles.mes}>{mes}</Text>
                  <Text style={styles.mesTotal}>{totalMes.toLocaleString('pt-BR')} tok</Text>
                </View>
                {rows
                  .slice()
                  .sort((a, b) => b.totalTokens - a.totalTokens)
                  .map((r, i) => (
                    <View key={i} style={styles.kv}>
                      <View style={styles.kvMiolo}>
                        <Text style={styles.kvChave} numberOfLines={1}>
                          {r.companyName ?? '—'}
                        </Text>
                        <Text style={styles.kvSub}>
                          {r.kind} · {r.model} · {r.calls} chamadas
                        </Text>
                      </View>
                      <Text style={styles.kvValor}>{r.totalTokens.toLocaleString('pt-BR')}</Text>
                    </View>
                  ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center' },

  conteudo: { padding: 16, gap: 12, paddingBottom: 40 },
  cartao: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 14, gap: 8 },
  secaoTitulo: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta, letterSpacing: -0.2 },
  secaoSub: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.okEscuro },
  ecoPlano: { borderTopWidth: 1, borderTopColor: colors.linha, paddingTop: 8, gap: 2 },
  ecoNome: { fontFamily: fonts.corpoForte, fontSize: 13.5, color: colors.tinta },
  ecoDetalhe: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  mesTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderBottomWidth: 1, borderBottomColor: colors.linha, paddingBottom: 8 },
  mes: { fontFamily: fonts.mono, fontSize: 13, letterSpacing: 0.5, color: colors.tinta },
  mesTotal: { fontFamily: fonts.display, fontSize: 15, color: colors.tinta },

  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  kvMiolo: { flex: 1, gap: 1 },
  kvChave: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },
  kvSub: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.2, color: colors.cinza },
  kvValor: { fontFamily: fonts.mono, fontSize: 13, color: colors.tinta },
});
