/**
 * Operação (overview) — a lista de todas as empresas para o operador.
 *
 * O alarme nº 1 é "tempo sem dado": o servidor já devolve ordenado por isso.
 * Empresas há 10+ dias sem import (ou que nunca importaram) ganham destaque
 * vermelho. Ferramenta de operador: a linguagem pode ser técnica.
 *
 * App burro: só busca /admin/overview e desenha. Nada é calculado aqui.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchAdminOverview, type AdminOverviewRow } from '@/lib/api';
import { estagioCor, estagioRotulo } from '@/lib/estagio';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

const ATRASO_VERMELHO = 10; // dias sem dado que acendem o alerta operacional

export default function Operacao() {
  const { token, ehAdmin } = usePulso();
  const { width } = useWindowDimensions();
  const denso = width >= 720; // no web/tablet vira tabela; no celular, cards

  const [linhas, setLinhas] = useState<AdminOverviewRow[] | null>(null);
  const [erro, setErro] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    setErro(false);
    try {
      setLinhas(await fetchAdminOverview(token));
    } catch {
      setErro(true);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = useCallback(async () => {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }, [carregar]);

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
      <ScrollView
        contentContainerStyle={styles.conteudo}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={refresh} tintColor={colors.mata} />}
      >
        <Text style={styles.titulo}>Operação</Text>
        <Text style={styles.sub}>Empresas ordenadas por mais tempo sem dado.</Text>

        <View style={styles.atalhos}>
          <Atalho icon="megaphone-outline" label="Leads" onPress={() => router.push('/admin/leads' as Href)} />
          <Atalho icon="pie-chart-outline" label="IA e custos" onPress={() => router.push('/admin/ia' as Href)} />
          <Atalho icon="pulse-outline" label="Saúde" onPress={() => router.push('/admin/saude' as Href)} />
        </View>

        {erro ? (
          <View style={styles.centro}>
            <Text style={styles.vazioTexto}>Não consegui carregar agora. Puxe para atualizar.</Text>
          </View>
        ) : linhas === null ? (
          <View style={styles.centro}>
            <ActivityIndicator color={colors.mata} />
          </View>
        ) : linhas.length === 0 ? (
          <View style={styles.centro}>
            <Text style={styles.vazioTexto}>Nenhuma empresa cadastrada ainda.</Text>
          </View>
        ) : (
          <View style={styles.lista}>
            {linhas.map((c) => (
              <Linha key={c.companyId} c={c} denso={denso} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Atalho({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.atalho, pressed && styles.pressionado]}>
      <Ionicons name={icon} size={16} color={colors.mata} />
      <Text style={styles.atalhoTexto}>{label}</Text>
    </Pressable>
  );
}

function semDadoTexto(dias: number | null): string {
  if (dias === null) return 'nunca importou';
  if (dias === 0) return 'dado de hoje';
  return dias === 1 ? 'há 1 dia sem dado' : `há ${dias} dias sem dado`;
}

function Linha({ c, denso }: { c: AdminOverviewRow; denso: boolean }) {
  const urgente = c.daysSinceImport === null || c.daysSinceImport >= ATRASO_VERMELHO;
  const corEstagio = c.stage ? estagioCor[c.stage] : colors.cinza;
  const rotuloEstagio = c.stage ? estagioRotulo[c.stage] : '—';

  return (
    <Pressable
      onPress={() => router.push(`/admin/empresa/${c.companyId}` as Href)}
      style={({ pressed }) => [
        styles.item,
        denso && styles.itemDenso,
        urgente && styles.itemUrgente,
        pressed && styles.pressionado,
      ]}
    >
      <View style={styles.itemMiolo}>
        <View style={styles.nomeLinha}>
          <Text style={styles.nome} numberOfLines={1}>
            {c.name}
          </Text>
          {c.isDemo && <Text style={styles.demo}>DEMO</Text>}
        </View>
        <Text style={[styles.semDado, urgente && styles.semDadoUrgente]}>{semDadoTexto(c.daysSinceImport)}</Text>
      </View>

      <View style={[styles.estagio, { borderColor: corEstagio }]}>
        <View style={[styles.estagioPonto, { backgroundColor: corEstagio }]} />
        <Text style={[styles.estagioTexto, { color: corEstagio }]}>{rotuloEstagio}</Text>
      </View>

      <View style={styles.metricas}>
        <Metrica valor={c.unopenedAlerts} rotulo="não lidos" alerta={c.unopenedAlerts > 0} />
        <Metrica valor={c.chatQuestionsMonth} rotulo="perguntas" />
      </View>
    </Pressable>
  );
}

function Metrica({ valor, rotulo, alerta }: { valor: number; rotulo: string; alerta?: boolean }) {
  return (
    <View style={styles.metrica}>
      <Text style={[styles.metricaValor, alerta && { color: colors.alerta }]}>{valor}</Text>
      <Text style={styles.metricaRotulo}>{rotulo}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  conteudo: { padding: 16, gap: 4, paddingBottom: 40 },
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.tinta, letterSpacing: -0.4 },
  sub: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza, marginBottom: 8 },

  atalhos: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  atalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  atalhoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.mata },

  centro: { paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center' },

  lista: { gap: 10 },
  item: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  itemDenso: { flexDirection: 'row', alignItems: 'center' },
  itemUrgente: { borderColor: colors.critico, borderWidth: 1.5 },
  itemMiolo: { flex: 1, gap: 3 },
  nomeLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nome: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.tinta, flexShrink: 1 },
  demo: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.cinza,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  semDado: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.3, color: colors.cinza },
  semDadoUrgente: { color: colors.critico },

  estagio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  estagioPonto: { width: 7, height: 7, borderRadius: 4 },
  estagioTexto: { fontFamily: fonts.corpoForte, fontSize: 11 },

  metricas: { flexDirection: 'row', gap: 18 },
  metrica: { alignItems: 'center' },
  metricaValor: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta },
  metricaRotulo: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 0.4, color: colors.cinza },

  pressionado: { opacity: 0.7 },
});
