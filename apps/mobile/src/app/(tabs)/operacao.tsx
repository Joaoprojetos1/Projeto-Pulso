/**
 * Operação (overview) — a lista de todas as empresas para o operador, com os
 * números do negócio no topo (assinantes, receita, pendentes, IA no mês).
 *
 * App burro: busca /admin/overview e desenha. Nada é calculado aqui. Os valores
 * de dinheiro vêm em centavos e são formatados em R$ (nunca centavos crus).
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchAdminOverview, type AdminOverviewRow, type AdminSummary } from '@/lib/api';
import { brl } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

const PARADO = 10; // dias sem dado a partir dos quais a bolinha fica amarela

type Filtro = 'todos' | 'assinantes' | 'pendentes' | 'sem_dados';

export default function Operacao() {
  const { token, ehAdmin } = usePulso();
  const { width } = useWindowDimensions();
  const denso = width >= 720;

  const [linhas, setLinhas] = useState<AdminOverviewRow[] | null>(null);
  const [resumo, setResumo] = useState<AdminSummary | null>(null);
  const [erro, setErro] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const carregar = useCallback(async () => {
    if (!token) return;
    setErro(false);
    try {
      const { companies, summary } = await fetchAdminOverview(token);
      setLinhas(companies);
      setResumo(summary);
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

  const filtradas = useMemo(() => {
    if (!linhas) return [];
    const q = busca.trim().toLowerCase();
    return linhas.filter((c) => {
      const casaBusca =
        q.length === 0 ||
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q.replace(/\D/g, ''));
      const semDados = c.daysSinceData === null || c.daysSinceData >= PARADO;
      const casaFiltro =
        filtro === 'todos' ||
        (filtro === 'assinantes' && c.subscriptionStatus === 'ativa') ||
        (filtro === 'pendentes' && c.subscriptionStatus === 'pendente') ||
        (filtro === 'sem_dados' && semDados);
      return casaBusca && casaFiltro;
    });
  }, [linhas, busca, filtro]);

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
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={refresh} tintColor={colors.mata} />}
      >
        <Text style={styles.titulo}>Operação</Text>

        {/* números do negócio de uma olhada — tocáveis, levam à lista filtrada */}
        {resumo && (
          <View style={styles.kpis}>
            <Kpi
              rotulo="Assinantes ativos"
              valor={String(resumo.activeSubscribers)}
              onPress={() => setFiltro('assinantes')}
              ativo={filtro === 'assinantes'}
            />
            <Kpi
              rotulo="Receita mensal"
              valor={brl(resumo.monthlyRevenueCents)}
              onPress={() => setFiltro('assinantes')}
              ativo={filtro === 'assinantes'}
            />
            <Kpi
              rotulo="Pendentes"
              valor={String(resumo.pendingPayment)}
              onPress={() => setFiltro('pendentes')}
              ativo={filtro === 'pendentes'}
              alerta={resumo.pendingPayment > 0}
            />
            <Kpi
              rotulo="IA no mês"
              valor={String(resumo.aiInteractionsMonth)}
              onPress={() => router.push('/admin/ia' as Href)}
            />
          </View>
        )}

        <View style={styles.atalhos}>
          <Atalho icon="pricetags-outline" label="Planos" onPress={() => router.push('/admin/planos' as Href)} />
          <Atalho icon="megaphone-outline" label="Leads" onPress={() => router.push('/admin/leads' as Href)} />
          <Atalho icon="pie-chart-outline" label="IA e custos" onPress={() => router.push('/admin/ia' as Href)} />
          <Atalho icon="pulse-outline" label="Saúde" onPress={() => router.push('/admin/saude' as Href)} />
        </View>

        {/* busca por nome ou telefone */}
        <View style={styles.buscaLinha}>
          <Ionicons name="search" size={16} color={colors.cinza} />
          <TextInput
            style={styles.buscaInput}
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por nome ou telefone"
            placeholderTextColor={colors.cinza}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {busca.length > 0 && (
            <Pressable onPress={() => setBusca('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.cinza} />
            </Pressable>
          )}
        </View>

        {/* filtros rápidos */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtros} contentContainerStyle={styles.filtrosConteudo}>
          <FiltroChip label="Todos" ativo={filtro === 'todos'} onPress={() => setFiltro('todos')} />
          <FiltroChip label="Assinantes" ativo={filtro === 'assinantes'} onPress={() => setFiltro('assinantes')} />
          <FiltroChip label="Pendentes" ativo={filtro === 'pendentes'} onPress={() => setFiltro('pendentes')} />
          <FiltroChip label="Sem dados" ativo={filtro === 'sem_dados'} onPress={() => setFiltro('sem_dados')} />
        </ScrollView>

        {erro ? (
          <View style={styles.centro}>
            <Text style={styles.vazioTexto}>Não consegui carregar agora. Puxe para atualizar.</Text>
          </View>
        ) : linhas === null ? (
          <View style={styles.centro}>
            <ActivityIndicator color={colors.mata} />
          </View>
        ) : filtradas.length === 0 ? (
          <View style={styles.centro}>
            <Text style={styles.vazioTexto}>Nenhuma empresa nesse filtro.</Text>
          </View>
        ) : (
          <View style={styles.lista}>
            {filtradas.map((c) => (
              <Linha key={c.companyId} c={c} denso={denso} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({
  rotulo,
  valor,
  onPress,
  ativo,
  alerta,
}: {
  rotulo: string;
  valor: string;
  onPress: () => void;
  ativo?: boolean;
  alerta?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.kpi, ativo && styles.kpiAtivo, pressed && styles.pressionado]}
    >
      <Text style={[styles.kpiValor, alerta && { color: colors.alerta }]} numberOfLines={1}>
        {valor}
      </Text>
      <Text style={styles.kpiRotulo}>{rotulo}</Text>
    </Pressable>
  );
}

function FiltroChip({ label, ativo, onPress }: { label: string; ativo: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filtroChip, ativo && styles.filtroChipAtivo]}>
      <Text style={[styles.filtroChipTexto, ativo && styles.filtroChipTextoAtivo]}>{label}</Text>
    </Pressable>
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
  if (dias === null) return 'nunca enviou dados';
  if (dias === 0) return 'dado de hoje';
  return dias === 1 ? 'sem dados há 1 dia' : `sem dados há ${dias} dias`;
}

function Linha({ c, denso }: { c: AdminOverviewRow; denso: boolean }) {
  // bolinha de status dos dados: verde = já enviou (recente), amarelo = nunca/parado
  const temDadoRecente = c.daysSinceData !== null && c.daysSinceData < PARADO;
  const corPonto = temDadoRecente ? colors.okEscuro : colors.alerta;

  return (
    <Pressable
      onPress={() => router.push(`/admin/empresa/${c.companyId}` as Href)}
      style={({ pressed }) => [styles.item, denso && styles.itemDenso, pressed && styles.pressionado]}
    >
      <View style={styles.itemMiolo}>
        <View style={styles.nomeLinha}>
          <Text style={styles.nome} numberOfLines={1}>
            {c.name}
          </Text>
          {c.isDemo && <Text style={styles.demo}>DEMO</Text>}
        </View>
        <View style={styles.statusLinha}>
          <View style={[styles.ponto, { backgroundColor: corPonto }]} />
          <Text style={styles.semDado}>{semDadoTexto(c.daysSinceData)}</Text>
        </View>
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
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.tinta, letterSpacing: -0.4, marginBottom: 10 },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpi: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 2,
  },
  kpiAtivo: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  kpiValor: { fontFamily: fonts.display, fontSize: 20, color: colors.tinta, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  kpiRotulo: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza },

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

  buscaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  buscaInput: { flex: 1, fontFamily: fonts.corpo, fontSize: 15, color: colors.tinta, padding: 0 },

  filtros: { flexGrow: 0, marginBottom: 12 },
  filtrosConteudo: { gap: 8, paddingRight: 8 },
  filtroChip: {
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: colors.branco,
  },
  filtroChipAtivo: { backgroundColor: colors.mata, borderColor: colors.mata },
  filtroChipTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.cinza },
  filtroChipTextoAtivo: { color: colors.papel },

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
  itemMiolo: { flex: 1, gap: 4 },
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
  statusLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  semDado: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },

  metricas: { flexDirection: 'row', gap: 18 },
  metrica: { alignItems: 'center' },
  metricaValor: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta },
  metricaRotulo: { fontFamily: fonts.mono, fontSize: 8.5, letterSpacing: 0.4, color: colors.cinza },

  pressionado: { opacity: 0.7 },
});
