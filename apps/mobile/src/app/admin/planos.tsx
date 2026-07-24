/**
 * Gestão de planos (operação). O operador lista os planos, edita preço e limite
 * de interações, ativa/desativa e cria planos novos. App burro: chama as rotas
 * /admin/plans (auditadas no servidor). Nada é calculado aqui.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MoneyInput } from '@/components/money-input';
import { createAdminPlan, fetchAdminPlans, patchAdminPlan, type AdminPlan } from '@/lib/api';
import { brl } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function Planos() {
  const { token, ehAdmin } = usePulso();
  const [planos, setPlanos] = useState<AdminPlan[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      setPlanos(await fetchAdminPlans(token));
    } catch {
      setPlanos([]);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
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
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Planos</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        {msg && (
          <View style={styles.aviso}>
            <Text style={styles.avisoTexto}>{msg}</Text>
          </View>
        )}

        {planos === null ? (
          <ActivityIndicator color={colors.mata} style={{ marginTop: 30 }} />
        ) : (
          <>
            {planos.map((p) => (
              <PlanoCard key={p.id} plano={p} token={token!} onSalvo={(m) => { setMsg(m); void carregar(); }} />
            ))}
            <NovoPlano token={token!} onCriado={(m) => { setMsg(m); void carregar(); }} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanoCard({ plano, token, onSalvo }: { plano: AdminPlan; token: string; onSalvo: (m: string) => void }) {
  const [nome, setNome] = useState(plano.name);
  const [preco, setPreco] = useState<number | null>(plano.priceCents);
  const [limite, setLimite] = useState(String(plano.chatLimitMonthly));
  const [ativo, setAtivo] = useState(plano.active);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      const lim = Number(limite);
      await patchAdminPlan(token, plano.id, {
        name: nome.trim() || undefined,
        priceCents: preco ?? undefined,
        chatLimitMonthly: Number.isFinite(lim) ? lim : undefined,
        active: ativo,
      });
      onSalvo(`Plano ${nome} salvo.`);
    } catch {
      onSalvo('Não consegui salvar o plano.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={[styles.card, !ativo && styles.cardInativo]}>
      <View style={styles.cardTopo}>
        <Text style={styles.cardId}>{plano.id}</Text>
        <Pressable onPress={() => setAtivo((v) => !v)} style={[styles.toggle, ativo && styles.toggleOn]}>
          <Text style={[styles.toggleTexto, ativo && styles.toggleTextoOn]}>{ativo ? 'Ativo' : 'Inativo'}</Text>
        </Pressable>
      </View>

      <Text style={styles.rotulo}>Nome</Text>
      <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholderTextColor={colors.cinza} />

      <Text style={styles.rotulo}>Preço por mês</Text>
      <MoneyInput valueCents={plano.priceCents} onChangeCents={setPreco} style={styles.money} />

      <Text style={styles.rotulo}>Interações com a IA por mês</Text>
      <TextInput
        style={styles.input}
        value={limite}
        onChangeText={setLimite}
        keyboardType="number-pad"
        placeholderTextColor={colors.cinza}
      />

      <Pressable onPress={salvar} disabled={salvando} style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}>
        {salvando ? <ActivityIndicator color={colors.branco} size="small" /> : <Text style={styles.botaoTexto}>Salvar</Text>}
      </Pressable>
    </View>
  );
}

function NovoPlano({ token, onCriado }: { token: string; onCriado: (m: string) => void }) {
  const [id, setId] = useState('');
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState<number | null>(null);
  const [limite, setLimite] = useState('');
  const [criando, setCriando] = useState(false);

  const idLimpo = id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const lim = Number(limite);
  const pode = idLimpo.length > 0 && nome.trim().length > 0 && preco != null && Number.isFinite(lim) && !criando;

  async function criar() {
    if (!pode || preco == null) return;
    setCriando(true);
    try {
      await createAdminPlan(token, { id: idLimpo, name: nome.trim(), priceCents: preco, chatLimitMonthly: lim });
      setId('');
      setNome('');
      setPreco(null);
      setLimite('');
      onCriado(`Plano ${nome} criado.`);
    } catch {
      onCriado('Não consegui criar (identificador já existe?).');
    } finally {
      setCriando(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.novoTitulo}>Criar novo plano</Text>
      <Text style={styles.rotulo}>Identificador (sem espaços, ex.: basico)</Text>
      <TextInput style={styles.input} value={id} onChangeText={setId} autoCapitalize="none" placeholder="basico" placeholderTextColor={colors.cinza} />
      <Text style={styles.rotulo}>Nome</Text>
      <TextInput style={styles.input} value={nome} onChangeText={setNome} placeholder="Básico" placeholderTextColor={colors.cinza} />
      <Text style={styles.rotulo}>Preço por mês</Text>
      <MoneyInput valueCents={preco} onChangeCents={setPreco} style={styles.money} placeholder="R$ 0,00" />
      <Text style={styles.rotulo}>Interações com a IA por mês</Text>
      <TextInput style={styles.input} value={limite} onChangeText={setLimite} keyboardType="number-pad" placeholder="30" placeholderTextColor={colors.cinza} />
      <Pressable onPress={criar} disabled={!pode} style={({ pressed }) => [styles.botao, (pressed || !pode) && styles.pressionado]}>
        <Text style={styles.botaoTexto}>Criar plano</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center' },
  conteudo: { padding: 16, gap: 12, paddingBottom: 48 },

  aviso: { backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 12, padding: 12 },
  avisoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.okEscuro },

  card: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, gap: 4 },
  cardInativo: { opacity: 0.6 },
  cardTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardId: { fontFamily: fonts.mono, fontSize: 12, letterSpacing: 0.4, color: colors.cinza },
  toggle: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  toggleOn: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  toggleTexto: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza },
  toggleTextoOn: { color: colors.okEscuro },
  novoTitulo: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta, marginBottom: 4 },

  rotulo: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza, marginTop: 10 },
  input: { borderWidth: 1, borderColor: colors.linha, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontFamily: fonts.corpo, fontSize: 15, color: colors.tinta, backgroundColor: colors.papel, marginTop: 4 },
  money: { marginTop: 4, fontSize: 16, paddingVertical: 10 },

  botao: { backgroundColor: colors.mata, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  botaoTexto: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.branco },
  pressionado: { opacity: 0.7 },
});
