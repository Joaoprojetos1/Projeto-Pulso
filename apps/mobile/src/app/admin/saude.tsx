/**
 * Saúde do sistema (operação). O timestamp da última geração de snapshot em
 * destaque (é o sinal de que o motor está rodando), imports recentes, empresas
 * ativas e a versão do core. App burro: busca /admin/health e desenha.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchAdminHealth, type AdminHealth } from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

function quando(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export default function Saude() {
  const { token, ehAdmin } = usePulso();
  const [h, setH] = useState<AdminHealth | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    fetchAdminHealth(token)
      .then((r) => vivo && setH(r))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [token]);

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
        <Text style={styles.tituloTopo}>Saúde</Text>
        <View style={{ width: 24 }} />
      </View>

      {erro ? (
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>Não consegui carregar a saúde do sistema.</Text>
        </View>
      ) : !h ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.mata} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.conteudo}>
          <View style={styles.destaque}>
            <Text style={styles.destaqueRotulo}>ÚLTIMO CÁLCULO GERADO</Text>
            <Text style={styles.destaqueValor}>{quando(h.lastSnapshotAt)}</Text>
          </View>

          <Card rotulo="Imports nos últimos 7 dias" valor={String(h.importsLast7Days)} />
          <Card rotulo="Empresas ativas (30 dias)" valor={String(h.activeCompaniesLast30Days)} />
          <Card rotulo="Empresas reais (sem demo)" valor={String(h.realCompanies)} />
          <Card rotulo="Versão do core" valor={h.coreVersion} mono />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Card({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardRotulo}>{rotulo}</Text>
      <Text style={[styles.cardValor, mono && { fontFamily: fonts.mono, fontSize: 16 }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center' },

  conteudo: { padding: 16, gap: 12, paddingBottom: 40 },
  destaque: { backgroundColor: colors.mata, borderRadius: 16, padding: 20, gap: 6 },
  destaqueRotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.rotuloSobreMata },
  destaqueValor: { fontFamily: fonts.display, fontSize: 26, color: colors.branco, letterSpacing: -0.5 },

  card: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRotulo: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza, flex: 1 },
  cardValor: { fontFamily: fonts.display, fontSize: 20, color: colors.tinta },
});
