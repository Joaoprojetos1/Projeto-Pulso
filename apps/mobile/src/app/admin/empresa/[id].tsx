/**
 * Perfil de uma empresa (operação). Cabeçalho de contato, números do negócio
 * (em R$), avisos em linguagem clara, dados enviados, uso da IA e as ações do
 * operador (editar plano/telefone, recalcular, redefinir senha, excluir).
 *
 * App burro: busca /admin/companies/:id e desenha; as escritas chamam /admin.
 * Nenhuma conta financeira aqui. Valores em R$, nunca centavos crus.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  deleteAdminCompany,
  fetchAdminCompany,
  fetchAdminPlans,
  patchAdminCompany,
  reprocessAdminCompany,
  resetSenhaUsuario,
  type AdminDossier,
  type AdminPlan,
  type SubscriptionStatus,
} from '@/lib/api';
import { brl, dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, type Severity } from '@/theme';

// título claro para cada regra (nunca a chave técnica na tela)
const TITULO_ALERTA: Record<string, string> = {
  cash_runway: 'Caixa pode zerar',
  scissor: 'Vende mais, recebe devagar',
  concentration: 'Faturamento concentrado num cliente',
  receivables_slowing: 'Recebimento mais lento',
  cycle_worsening: 'Ciclo de caixa piorou',
  revenue_drop_fixed_cost: 'Receita caiu, custo fixo igual',
  margin_falling: 'Margem caindo',
};
const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente', ativa: 'Ativa', cancelada: 'Cancelada',
};

function mascaraTel(txt: string): string {
  const d = txt.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function rs(cents: number | null): string {
  return cents === null ? 'não informado' : brl(cents);
}

export default function EmpresaDossie() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, ehAdmin } = usePulso();

  const [d, setD] = useState<AdminDossier | null>(null);
  const [erro, setErro] = useState(false);
  const [quota, setQuota] = useState('');
  const [telefone, setTelefone] = useState('');
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [statusAss, setStatusAss] = useState<SubscriptionStatus>('pendente');
  const [planos, setPlanos] = useState<AdminPlan[]>([]);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [detalhesIa, setDetalhesIa] = useState(false);
  const [excluirNome, setExcluirNome] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!token || !id) return;
    setErro(false);
    try {
      const dossie = await fetchAdminCompany(token, id);
      setD(dossie);
      setQuota('');
      setTelefone(dossie.company.phone ? mascaraTel(dossie.company.phone) : '');
      setPlanoId(dossie.company.planId);
      setStatusAss(dossie.company.subscriptionStatus);
    } catch {
      setErro(true);
    }
  }, [token, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (token) fetchAdminPlans(token).then(setPlanos).catch(() => {});
  }, [token]);

  const salvarEdicao = useCallback(async () => {
    if (!token || !id) return;
    setOcupado(true);
    setMsg(null);
    try {
      const q = quota.trim() === '' ? undefined : Number(quota);
      const tel = telefone.replace(/\D/g, '');
      await patchAdminCompany(token, id, {
        chatQuota: q !== undefined && Number.isFinite(q) ? q : undefined,
        planId: planoId ?? undefined,
        subscriptionStatus: statusAss,
        phone: tel.length >= 10 ? tel : undefined,
      });
      setMsg('Alterações salvas.');
      await carregar();
    } catch {
      setMsg('Não consegui salvar.');
    } finally {
      setOcupado(false);
    }
  }, [token, id, quota, telefone, planoId, statusAss, carregar]);

  const reprocessar = useCallback(async () => {
    if (!token || !id) return;
    setOcupado(true);
    setMsg(null);
    setConfirmando(null);
    try {
      await reprocessAdminCompany(token, id);
      setMsg('Números recalculados.');
      await carregar();
    } catch {
      setMsg('Não consegui recalcular.');
    } finally {
      setOcupado(false);
    }
  }, [token, id, carregar]);

  const resetarSenha = useCallback(
    async (userId: string, email: string) => {
      if (!token) return;
      setOcupado(true);
      setMsg(null);
      setConfirmando(null);
      try {
        await resetSenhaUsuario(token, userId);
        setMsg(`E-mail de redefinição enviado para ${email}.`);
      } catch {
        setMsg('Não consegui disparar a redefinição.');
      } finally {
        setOcupado(false);
      }
    },
    [token],
  );

  const excluir = useCallback(async () => {
    if (!token || !id || !d) return;
    setOcupado(true);
    setMsg(null);
    try {
      await deleteAdminCompany(token, id, excluirNome.trim());
      router.back(); // some da lista: volta para a operação
    } catch {
      setMsg('Não consegui excluir. Confira se o nome está exatamente igual.');
      setOcupado(false);
    }
  }, [token, id, d, excluirNome]);

  if (!ehAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>Área restrita à operação.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const responsavel = d?.users[0] ?? null;
  const wa = d?.company.phone ? `https://wa.me/55${d.company.phone}` : null;
  const podeExcluir = !!d && excluirNome.trim().toLowerCase() === d.company.name.trim().toLowerCase();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo} numberOfLines={1}>
          {d?.company.name ?? 'Empresa'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {erro ? (
        <View style={styles.centro}>
          <Text style={styles.vazioTexto}>Não consegui carregar o dossiê.</Text>
        </View>
      ) : !d ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.mata} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
          {msg && (
            <View style={styles.aviso}>
              <Text style={styles.avisoTexto}>{msg}</Text>
            </View>
          )}

          {/* cabeçalho: nome, responsável, contato, plano e status */}
          <View style={styles.cartao}>
            <Text style={styles.nome}>{d.company.name}</Text>
            {d.company.isDemo && <Text style={styles.demoTag}>DEMONSTRAÇÃO</Text>}
            {responsavel && (
              <Text style={styles.contato}>Responsável: {responsavel.email}</Text>
            )}
            <View style={styles.contatoLinha}>
              <Text style={styles.contato}>
                {d.company.phone ? mascaraTel(d.company.phone) : 'Sem telefone'}
              </Text>
              {wa && (
                <Pressable onPress={() => Linking.openURL(wa)} style={({ pressed }) => [styles.waBtn, pressed && styles.pressionado]}>
                  <Ionicons name="logo-whatsapp" size={15} color={colors.papel} />
                  <Text style={styles.waTexto}>WhatsApp</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.planoLinha}>
              <Text style={styles.planoInfo}>Plano {d.company.plan ?? 'sem plano'}</Text>
              <Text style={[styles.statusInfo, d.company.subscriptionStatus === 'ativa' && { color: colors.okEscuro }]}>
                {STATUS_LABEL[d.company.subscriptionStatus] ?? d.company.subscriptionStatus}
              </Text>
            </View>
          </View>

          {/* números do negócio — em R$, rótulos claros */}
          <View style={styles.cartao}>
            <Rotulo texto="NÚMEROS DO NEGÓCIO" />
            <Numero rotulo="Caixa informado" valor={rs(d.businessNumbers.cashCents)} />
            <Numero rotulo="Custo fixo mensal" valor={rs(d.businessNumbers.fixedCostCents)} />
            <Numero rotulo="Faturamento do mês" valor={rs(d.businessNumbers.revenueCents)} />
            <Numero rotulo="Faturamento do mês anterior" valor={rs(d.businessNumbers.revenuePreviousCents)} />
            {d.snapshot && (
              <Text style={styles.atualizado}>Atualizado em {dataBR(d.snapshot.asOf)}</Text>
            )}
          </View>

          {/* avisos, com título em linguagem clara */}
          <View style={styles.cartao}>
            <Rotulo texto={`AVISOS (${d.alerts.length})`} />
            {d.alerts.length === 0 ? (
              <Text style={styles.vazioTexto}>Nenhum aviso.</Text>
            ) : (
              d.alerts.slice(0, 8).map((a) => (
                <View key={a.id} style={styles.alerta}>
                  <View style={[styles.alertaPonto, { backgroundColor: severityColor[a.severity as Severity] }]} />
                  <Text style={styles.alertaTitulo} numberOfLines={1}>
                    {a.textTitle ?? TITULO_ALERTA[a.ruleKey] ?? 'Aviso'}
                  </Text>
                  <Text style={styles.alertaData}>{dataBR(a.createdAt.slice(0, 10))}</Text>
                  {a.actedAt ? (
                    <Ionicons name="checkmark-done" size={14} color={colors.okEscuro} />
                  ) : a.openedAt ? (
                    <Ionicons name="checkmark" size={14} color={colors.cinza} />
                  ) : (
                    <View style={styles.naoLido} />
                  )}
                </View>
              ))
            )}
          </View>

          {/* dados enviados: arquivos + caixa informado à mão */}
          <View style={styles.cartao}>
            <Rotulo texto="DADOS ENVIADOS" />
            {d.imports.length === 0 && d.cashInputs.length === 0 ? (
              <Text style={styles.vazioTexto}>Nenhum dado enviado ainda.</Text>
            ) : (
              <>
                {d.imports.slice(0, 6).map((im, i) => (
                  <View key={`imp-${i}`} style={styles.kv}>
                    <Text style={styles.kvChave}>Arquivo {im.source} · {im.rowCount} linhas</Text>
                    <Text style={styles.kvData}>{dataBR(String(im.importedAt).slice(0, 10))}</Text>
                  </View>
                ))}
                {d.cashInputs.slice(0, 8).map((c, i) => (
                  <View key={`cx-${i}`} style={styles.kv}>
                    <Text style={styles.kvChave}>Caixa informado: {brl(c.balanceCents)}</Text>
                    <Text style={styles.kvData}>{dataBR(c.observedOn)}</Text>
                  </View>
                ))}
              </>
            )}
          </View>

          {/* uso da IA: interações usadas vs limite + detalhes técnicos recolhidos */}
          <View style={styles.cartao}>
            <Rotulo texto="USO DA IA" />
            <Text style={styles.iaDestaque}>
              {d.chatUsedMonth} de {d.company.chatQuota} interações
              {d.company.plan ? ` do plano ${d.company.plan}` : ''}
            </Text>
            <View style={styles.barra}>
              <View
                style={[
                  styles.barraCheia,
                  {
                    width: `${Math.min(100, d.company.chatQuota > 0 ? (d.chatUsedMonth / d.company.chatQuota) * 100 : 0)}%`,
                    backgroundColor: d.chatUsedMonth >= d.company.chatQuota ? colors.alerta : colors.vivo,
                  },
                ]}
              />
            </View>
            {d.aiUsageMonth.length > 0 && (
              <>
                <Pressable onPress={() => setDetalhesIa((v) => !v)} style={styles.verDetalhes} hitSlop={6}>
                  <Text style={styles.verDetalhesTexto}>
                    {detalhesIa ? 'Ocultar detalhes técnicos' : 'Ver detalhes técnicos'}
                  </Text>
                  <Ionicons name={detalhesIa ? 'chevron-up' : 'chevron-down'} size={14} color={colors.cinza} />
                </Pressable>
                {detalhesIa &&
                  d.aiUsageMonth.map((u, i) => (
                    <View key={i} style={styles.kv}>
                      <Text style={styles.kvChave}>{u.kind} · {u.model} ({u.calls})</Text>
                      <Text style={styles.kvData}>{u.totalTokens.toLocaleString('pt-BR')} tok</Text>
                    </View>
                  ))}
              </>
            )}
          </View>

          {/* AÇÕES */}
          <View style={styles.cartao}>
            <Rotulo texto="AÇÕES" />

            <Text style={styles.campoRotulo}>Plano</Text>
            <View style={styles.chips}>
              {planos.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPlanoId(p.id)}
                  style={[styles.chip, planoId === p.id && styles.chipAtivo]}
                >
                  <Text style={[styles.chipTexto, planoId === p.id && styles.chipTextoAtivo]}>
                    {p.name} · {brl(p.priceCents)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.campoRotulo}>Assinatura</Text>
            <View style={styles.chips}>
              {(['pendente', 'ativa', 'cancelada'] as SubscriptionStatus[]).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setStatusAss(s)}
                  style={[styles.chip, statusAss === s && styles.chipAtivo]}
                >
                  <Text style={[styles.chipTexto, statusAss === s && styles.chipTextoAtivo]}>{STATUS_LABEL[s]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.campoRotulo}>Telefone (WhatsApp)</Text>
            <TextInput
              style={styles.input}
              value={telefone}
              onChangeText={(t) => setTelefone(mascaraTel(t))}
              keyboardType="phone-pad"
              placeholder="(11) 91234-5678"
              placeholderTextColor={colors.cinza}
              maxLength={16}
            />

            <Text style={styles.campoRotulo}>Cota de conversas por mês (vazio = usar o limite do plano)</Text>
            <TextInput
              style={styles.input}
              value={quota}
              onChangeText={setQuota}
              keyboardType="number-pad"
              placeholder="do plano"
              placeholderTextColor={colors.cinza}
            />

            <Pressable
              onPress={salvarEdicao}
              disabled={ocupado}
              style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            >
              <Text style={styles.botaoTexto}>Salvar alterações</Text>
            </Pressable>

            <AcaoConfirmavel
              chave="reprocess"
              rotulo="Recalcular os números"
              perigo={false}
              confirmando={confirmando}
              setConfirmando={setConfirmando}
              ocupado={ocupado}
              onConfirm={reprocessar}
            />

            {d.users.map((u) => (
              <AcaoConfirmavel
                key={u.id}
                chave={`reset-${u.id}`}
                rotulo="Redefinir senha do usuário"
                perigo={false}
                confirmando={confirmando}
                setConfirmando={setConfirmando}
                ocupado={ocupado}
                onConfirm={() => resetarSenha(u.id, u.email)}
              />
            ))}
          </View>

          {/* excluir cadastro — vermelho, confirmação dupla (digitar o nome) */}
          <View style={styles.cartaoPerigo}>
            <Rotulo texto="ZONA DE RISCO" />
            <Text style={styles.perigoTexto}>
              Excluir remove a empresa e todos os dados associados. Não dá para desfazer.
            </Text>
            {confirmando === 'delete' ? (
              <>
                <Text style={styles.campoRotulo}>Para confirmar, digite o nome exato: {d.company.name}</Text>
                <TextInput
                  style={styles.input}
                  value={excluirNome}
                  onChangeText={setExcluirNome}
                  placeholder={d.company.name}
                  placeholderTextColor={colors.cinza}
                  autoCapitalize="none"
                />
                <View style={styles.confirmaLinha}>
                  <Pressable
                    onPress={() => { setConfirmando(null); setExcluirNome(''); }}
                    style={({ pressed }) => [styles.confirmaBtn, pressed && styles.pressionado]}
                  >
                    <Text style={styles.confirmaCancelar}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    onPress={excluir}
                    disabled={!podeExcluir || ocupado}
                    style={({ pressed }) => [
                      styles.confirmaBtn,
                      styles.confirmaOk,
                      (!podeExcluir || ocupado) && styles.confirmaOff,
                      pressed && styles.pressionado,
                    ]}
                  >
                    <Text style={styles.confirmaOkTexto}>Excluir para sempre</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setConfirmando('delete')}
                disabled={ocupado}
                style={({ pressed }) => [styles.excluirBtn, pressed && styles.pressionado]}
              >
                <Ionicons name="trash-outline" size={16} color={colors.critico} />
                <Text style={styles.excluirTexto}>Excluir cadastro</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function AcaoConfirmavel({
  chave,
  rotulo,
  perigo,
  confirmando,
  setConfirmando,
  ocupado,
  onConfirm,
}: {
  chave: string;
  rotulo: string;
  perigo: boolean;
  confirmando: string | null;
  setConfirmando: (c: string | null) => void;
  ocupado: boolean;
  onConfirm: () => void;
}) {
  const aberto = confirmando === chave;
  if (!aberto) {
    return (
      <Pressable
        onPress={() => setConfirmando(chave)}
        disabled={ocupado}
        style={({ pressed }) => [styles.acao, pressed && styles.pressionado]}
      >
        <Text style={[styles.acaoTexto, perigo && { color: colors.critico }]}>{rotulo}</Text>
        <Ionicons name="chevron-forward" size={16} color={perigo ? colors.critico : colors.mata} />
      </Pressable>
    );
  }
  return (
    <View style={styles.confirmaLinha}>
      <Text style={styles.confirmaPergunta}>Confirmar?</Text>
      <Pressable onPress={() => setConfirmando(null)} style={({ pressed }) => [styles.confirmaBtn, pressed && styles.pressionado]}>
        <Text style={styles.confirmaCancelar}>Cancelar</Text>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        disabled={ocupado}
        style={({ pressed }) => [styles.confirmaBtn, styles.confirmaOk, pressed && styles.pressionado]}
      >
        <Text style={styles.confirmaOkTexto}>Sim</Text>
      </Pressable>
    </View>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return <Text style={styles.rotulo}>{texto}</Text>;
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.numero}>
      <Text style={styles.numeroRotulo}>{rotulo}</Text>
      <Text style={styles.numeroValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, color: colors.cinza, textAlign: 'center' },

  conteudo: { padding: 16, gap: 12, paddingBottom: 48 },
  cartao: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 14, gap: 8 },
  cartaoPerigo: { backgroundColor: colors.branco, borderWidth: 1, borderColor: 'rgba(216,80,63,0.4)', borderRadius: 14, padding: 14, gap: 8 },

  aviso: { backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 12, padding: 12 },
  avisoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.okEscuro },

  nome: { fontFamily: fonts.display, fontSize: 20, color: colors.tinta, letterSpacing: -0.4 },
  demoTag: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.alerta },
  contato: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.tinta },
  contatoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  waBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  waTexto: { fontFamily: fonts.corpoForte, fontSize: 12.5, color: colors.papel },
  planoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  planoInfo: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.tinta },
  statusInfo: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.cinza },

  rotulo: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.cinza },

  numero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  numeroRotulo: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza, flexShrink: 1 },
  numeroValor: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.tinta, fontVariant: ['tabular-nums'] },
  atualizado: { fontFamily: fonts.corpo, fontSize: 11.5, color: colors.cinza, marginTop: 2 },

  alerta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertaPonto: { width: 8, height: 8, borderRadius: 4 },
  alertaTitulo: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },
  alertaData: { fontFamily: fonts.mono, fontSize: 10, color: colors.cinza },
  naoLido: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.alerta },

  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  kvChave: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.tinta, flexShrink: 1 },
  kvData: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza },

  iaDestaque: { fontFamily: fonts.corpoForte, fontSize: 15, color: colors.tinta },
  barra: { height: 8, borderRadius: 4, backgroundColor: colors.linha, overflow: 'hidden' },
  barraCheia: { height: '100%', borderRadius: 4 },
  verDetalhes: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  verDetalhesTexto: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.cinza },

  campoRotulo: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontFamily: fonts.corpo,
    fontSize: 14,
    color: colors.tinta,
    backgroundColor: colors.papel,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: colors.papel },
  chipAtivo: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipTexto: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.cinza },
  chipTextoAtivo: { color: colors.okEscuro },
  botao: { backgroundColor: colors.mata, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  botaoTexto: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.branco },

  acao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.linha,
    paddingTop: 12,
    marginTop: 4,
  },
  acaoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.mata },

  perigoTexto: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.cinza },
  excluirBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: 'rgba(216,80,63,0.4)', borderRadius: 12, paddingVertical: 12, marginTop: 4 },
  excluirTexto: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.critico },

  confirmaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  confirmaPergunta: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.tinta },
  confirmaBtn: { flex: 1, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.linha, alignItems: 'center' },
  confirmaCancelar: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.cinza },
  confirmaOk: { backgroundColor: colors.critico, borderColor: colors.critico },
  confirmaOff: { opacity: 0.4 },
  confirmaOkTexto: { fontFamily: fonts.corpoForte, fontSize: 13, color: colors.branco },

  pressionado: { opacity: 0.7 },
});
