/**
 * Sócios — a inteligência do motor que separa dinheiro de SÓCIO do faturamento.
 *
 * Aporte de sócio (entrada) não é faturamento; retirada (saída) não é custo — mas
 * o dinheiro segue no caixa. Aqui o dono CONFIRMA os movimentos que o Pulso achou
 * (casando o nome do sócio com a contraparte do extrato) e mantém a lista de sócios.
 *
 * App burro: mostra o que o servidor propôs e devolve o que o dono confirmou. Quem
 * casa e quem recalcula é o servidor.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addMyPartner,
  classifyPartners,
  deleteMyPartner,
  fetchMyPartners,
  fetchPartnerCandidates,
  type PartnerCandidateJson,
  type PartnerJson,
  type PartyClass,
} from '@/lib/api';
import { brl, dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

const OPCOES: Array<{ id: PartyClass; label: string; hint: string }> = [
  { id: 'aporte', label: 'Aporte', hint: 'não é faturamento' },
  { id: 'retirada', label: 'Retirada', hint: 'não é custo' },
  { id: 'pro_labore', label: 'Pró-labore', hint: 'conta como custo' },
  { id: 'nao_socio', label: 'Não é sócio', hint: 'conta normal' },
];

export default function Socios() {
  const { token, carregar } = usePulso();
  const [candidatos, setCandidatos] = useState<PartnerCandidateJson[]>([]);
  const [socios, setSocios] = useState<PartnerJson[]>([]);
  const [escolhas, setEscolhas] = useState<Record<string, PartyClass>>({});
  const [novo, setNovo] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    if (!token) return;
    try {
      const [c, s] = await Promise.all([fetchPartnerCandidates(token), fetchMyPartners(token)]);
      setCandidatos(c);
      setSocios(s);
      // pré-seleciona a sugestão do servidor por candidato
      setEscolhas((prev) => {
        const next = { ...prev };
        for (const cand of c) if (next[cand.entryId] == null) next[cand.entryId] = cand.suggestedClass;
        return next;
      });
    } catch {
      /* lista vazia é aceitável */
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function confirmar() {
    if (!token || salvando || candidatos.length === 0) return;
    setSalvando(true);
    setMsg(null);
    try {
      await classifyPartners(
        token,
        candidatos.map((c) => ({ entryId: c.entryId, class: escolhas[c.entryId] ?? c.suggestedClass })),
      );
      setMsg('Pronto. Os números foram recalculados considerando os sócios.');
      await recarregar();
      await carregar(); // atualiza o painel
    } catch {
      setMsg('Não consegui salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  async function adicionar() {
    if (!token || !novo.trim()) return;
    try {
      setSocios(await addMyPartner(token, novo.trim()));
      setNovo('');
    } catch {
      setMsg('Não consegui adicionar esse nome.');
    }
  }

  async function remover(id: string) {
    if (!token) return;
    try {
      setSocios(await deleteMyPartner(token, id));
    } catch {
      /* silencioso */
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Sócios</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Dinheiro que entra ou sai em nome de um sócio não é faturamento nem custo do negócio — mas continua no
          seu caixa. Confirme abaixo para os números ficarem certos.
        </Text>

        {msg && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>{msg}</Text>
          </View>
        )}

        {carregando ? (
          <ActivityIndicator color={colors.vivo} style={{ marginTop: 24 }} />
        ) : (
          <>
            {/* movimentos a confirmar */}
            <Text style={styles.secao}>Movimentos para conferir</Text>
            {candidatos.length === 0 ? (
              <View style={styles.vazio}>
                <Ionicons name="checkmark-circle-outline" size={24} color={colors.cinza} />
                <Text style={styles.vazioTexto}>
                  Nenhum movimento de sócio para conferir agora. Quando o Pulso encontrar uma entrada ou saída no
                  nome de um sócio, ela aparece aqui.
                </Text>
              </View>
            ) : (
              <>
                {candidatos.map((c) => (
                  <View key={c.entryId} style={styles.cartao}>
                    <View style={styles.cartaoTopo}>
                      <Text style={styles.valor}>{brl(c.amountCents)}</Text>
                      <Text style={styles.tipo}>{c.kind === 'receivable' ? 'entrada' : 'saída'}</Text>
                    </View>
                    <Text style={styles.contraparte} numberOfLines={1}>{c.counterparty}</Text>
                    <Text style={styles.meta}>
                      Parece {c.partnerName}
                      {c.date ? ` · ${dataBR(c.date)}` : ''}
                    </Text>
                    <View style={styles.opcoes}>
                      {OPCOES.map((o) => {
                        const on = (escolhas[c.entryId] ?? c.suggestedClass) === o.id;
                        return (
                          <Pressable
                            key={o.id}
                            onPress={() => setEscolhas((p) => ({ ...p, [c.entryId]: o.id }))}
                            style={[styles.opcao, on && styles.opcaoOn]}
                          >
                            <Text style={[styles.opcaoLabel, on && styles.opcaoLabelOn]}>{o.label}</Text>
                            <Text style={[styles.opcaoHint, on && styles.opcaoHintOn]}>{o.hint}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <Pressable
                  onPress={confirmar}
                  disabled={salvando}
                  style={({ pressed }) => [styles.botao, salvando && styles.botaoOff, pressed && styles.pressionado]}
                >
                  {salvando ? (
                    <ActivityIndicator color="#06231A" />
                  ) : (
                    <Text style={styles.botaoTexto}>Confirmar</Text>
                  )}
                </Pressable>
              </>
            )}

            {/* lista de sócios */}
            <Text style={[styles.secao, { marginTop: 28 }]}>Quem são os sócios</Text>
            <Text style={styles.subsecao}>
              Começamos pelo quadro do seu CNPJ. Adicione contas pessoais de onde vêm aportes (o nome pode ser
              diferente do CNPJ).
            </Text>
            <View style={styles.addLinha}>
              <TextInput
                style={styles.input}
                value={novo}
                onChangeText={setNovo}
                placeholder="Nome do sócio ou da conta"
                placeholderTextColor={colors.cinza}
                autoCapitalize="words"
                onSubmitEditing={adicionar}
              />
              <Pressable onPress={adicionar} style={({ pressed }) => [styles.addBtn, pressed && styles.pressionado]}>
                <Ionicons name="add" size={22} color="#06231A" />
              </Pressable>
            </View>
            {socios.map((s) => (
              <View key={s.id} style={styles.socio}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.socioNome}>{s.name}</Text>
                  <Text style={styles.socioMeta}>
                    {s.source === 'cnpj' ? 'Do CNPJ' : 'Adicionado por você'}
                    {s.note ? ` · ${s.note}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => remover(s.id)} hitSlop={10} accessibilityLabel="Remover sócio">
                  <Ionicons name="close" size={18} color={colors.cinza} />
                </Pressable>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  conteudo: { padding: 16, paddingBottom: 48 },
  intro: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.tinta },

  aviso: { backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 12, padding: 12, marginTop: 14 },
  avisoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.mata },

  secao: { fontFamily: fonts.displayMedio, fontSize: 16, color: colors.tinta, marginTop: 22, marginBottom: 4 },
  subsecao: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza, marginBottom: 12 },

  vazio: { alignItems: 'center', gap: 8, paddingVertical: 22 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza, textAlign: 'center', maxWidth: 280, lineHeight: 20 },

  cartao: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 14, marginBottom: 12 },
  cartaoTopo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  valor: { fontFamily: fonts.display, fontSize: 20, color: colors.tinta, fontVariant: ['tabular-nums'] },
  tipo: { fontFamily: fonts.mono, fontSize: 11, color: colors.cinza, textTransform: 'uppercase', letterSpacing: 0.5 },
  contraparte: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.tinta, marginTop: 6 },
  meta: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, marginTop: 2 },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  opcao: { borderWidth: 1.5, borderColor: colors.linha, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.papel, minWidth: 96 },
  opcaoOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  opcaoLabel: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },
  opcaoLabelOn: { color: colors.mata },
  opcaoHint: { fontFamily: fonts.corpo, fontSize: 11, color: colors.cinza, marginTop: 1 },
  opcaoHintOn: { color: colors.mata },

  botao: { backgroundColor: colors.vivo, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  botaoOff: { opacity: 0.6 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15.5, color: '#06231A' },
  pressionado: { opacity: 0.85 },

  addLinha: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.corpo, fontSize: 14, color: colors.tinta },
  addBtn: { backgroundColor: colors.vivo, borderRadius: 12, width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  socio: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 12, padding: 12, marginTop: 10 },
  socioNome: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.tinta },
  socioMeta: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza, marginTop: 2 },
});
