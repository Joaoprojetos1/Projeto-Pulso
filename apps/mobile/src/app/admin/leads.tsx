/**
 * Leads (lista de espera do site). Busca simples e mudança de status
 * (novo → contatado → convertido/descartado). Toda mudança é auditada no
 * servidor. App burro: busca /admin/leads e desenha.
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchAdminLeads, patchLeadStatus, type AdminLead, type LeadStatus } from '@/lib/api';
import { dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

const STATUS: LeadStatus[] = ['novo', 'contatado', 'convertido', 'descartado'];
const STATUS_COR: Record<LeadStatus, string> = {
  novo: colors.mata,
  contatado: colors.alerta,
  convertido: colors.okEscuro,
  descartado: colors.cinza,
};

export default function Leads() {
  const { token, ehAdmin } = usePulso();
  const [busca, setBusca] = useState('');
  const [leads, setLeads] = useState<AdminLead[] | null>(null);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);

  const carregar = useCallback(
    async (q?: string) => {
      if (!token) return;
      setErro(false);
      try {
        setLeads(await fetchAdminLeads(token, q));
      } catch {
        setErro(true);
      }
    },
    [token],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mudarStatus = useCallback(
    async (id: string, status: LeadStatus) => {
      if (!token) return;
      setAberto(null);
      // otimista: reflete na hora; se falhar, recarrega
      setLeads((atual) => atual?.map((l) => (l.id === id ? { ...l, status } : l)) ?? atual);
      try {
        await patchLeadStatus(token, id, status);
      } catch {
        void carregar(busca.trim() || undefined);
      }
    },
    [token, busca, carregar],
  );

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
        <Text style={styles.tituloTopo}>Leads</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.buscaLinha}>
        <Ionicons name="search" size={16} color={colors.cinza} />
        <TextInput
          style={styles.buscaInput}
          value={busca}
          onChangeText={setBusca}
          onSubmitEditing={() => carregar(busca.trim() || undefined)}
          returnKeyType="search"
          placeholder="Buscar por nome ou e-mail"
          placeholderTextColor={colors.cinza}
          autoCapitalize="none"
        />
        {busca.length > 0 && (
          <Pressable
            onPress={() => {
              setBusca('');
              void carregar();
            }}
          >
            <Ionicons name="close-circle" size={16} color={colors.cinza} />
          </Pressable>
        )}
      </View>

      {erro ? (
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>Não consegui carregar os leads.</Text>
        </View>
      ) : leads === null ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.mata} />
        </View>
      ) : leads.length === 0 ? (
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>Nenhum lead encontrado.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {leads.map((l) => (
            <View key={l.id} style={styles.item}>
              <View style={styles.itemTopo}>
                <View style={styles.itemMiolo}>
                  <Text style={styles.nome}>{l.name ?? l.email}</Text>
                  <Text style={styles.contato}>
                    {l.email}
                    {l.phone ? ` · ${l.phone}` : ''}
                  </Text>
                  <Text style={styles.meta}>
                    {l.source ?? 'site'} · {dataBR(String(l.createdAt).slice(0, 10))}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setAberto(aberto === l.id ? null : l.id)}
                  style={[styles.statusBadge, { borderColor: STATUS_COR[l.status] }]}
                >
                  <Text style={[styles.statusTexto, { color: STATUS_COR[l.status] }]}>{l.status}</Text>
                  <Ionicons name="chevron-down" size={12} color={STATUS_COR[l.status]} />
                </Pressable>
              </View>

              {aberto === l.id && (
                <View style={styles.chips}>
                  {STATUS.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => mudarStatus(l.id, s)}
                      style={[styles.chip, l.status === s && { backgroundColor: STATUS_COR[s], borderColor: STATUS_COR[s] }]}
                    >
                      <Text style={[styles.chipTexto, l.status === s && { color: colors.branco }]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center' },

  buscaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.branco,
  },
  buscaInput: { flex: 1, fontFamily: fonts.corpo, fontSize: 14, color: colors.tinta, paddingVertical: 10 },

  lista: { padding: 16, paddingTop: 4, gap: 10 },
  item: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 14, gap: 10 },
  itemTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemMiolo: { flex: 1, gap: 2 },
  nome: { fontFamily: fonts.displayMedio, fontSize: 14.5, color: colors.tinta },
  contato: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.tinta },
  meta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.3, color: colors.cinza },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  statusTexto: { fontFamily: fonts.corpoForte, fontSize: 11 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: 1, borderTopColor: colors.linha, paddingTop: 10 },
  chip: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipTexto: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.tinta },
});
