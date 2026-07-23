/**
 * Dossiê de uma empresa (operação). Indicadores do último snapshot, diagnóstico,
 * histórico de alertas, imports, contas previstas e consumo de IA do mês. As
 * AÇÕES (editar cota/plano, reprocessar, resetar senha) ficam atrás de uma
 * confirmação explícita e são auditadas no servidor.
 *
 * App burro: busca /admin/companies/:id e desenha. As escritas chamam as rotas
 * /admin. Nenhuma conta financeira aqui.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
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

import {
  fetchAdminCompany,
  patchAdminCompany,
  reprocessAdminCompany,
  resetSenhaUsuario,
  type AdminDossier,
} from '@/lib/api';
import { estagioCor, estagioRotulo } from '@/lib/estagio';
import { brl, dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, type Severity } from '@/theme';

export default function EmpresaDossie() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token, ehAdmin } = usePulso();

  const [d, setD] = useState<AdminDossier | null>(null);
  const [erro, setErro] = useState(false);
  const [quota, setQuota] = useState('');
  const [plano, setPlano] = useState('');
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!token || !id) return;
    setErro(false);
    try {
      const dossie = await fetchAdminCompany(token, id);
      setD(dossie);
      setQuota(String(dossie.company.chatQuota));
      setPlano(dossie.company.plan);
    } catch {
      setErro(true);
    }
  }, [token, id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvarEdicao = useCallback(async () => {
    if (!token || !id) return;
    setOcupado(true);
    setMsg(null);
    try {
      const q = Number(quota);
      await patchAdminCompany(token, id, {
        chatQuota: Number.isFinite(q) ? q : undefined,
        plan: plano.trim() || undefined,
      });
      setMsg('Alterações salvas.');
      await carregar();
    } catch {
      setMsg('Não consegui salvar.');
    } finally {
      setOcupado(false);
    }
  }, [token, id, quota, plano, carregar]);

  const reprocessar = useCallback(async () => {
    if (!token || !id) return;
    setOcupado(true);
    setMsg(null);
    setConfirmando(null);
    try {
      await reprocessAdminCompany(token, id);
      setMsg('Snapshot reprocessado com o core atual.');
      await carregar();
    } catch {
      setMsg('Não consegui reprocessar.');
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
        <ScrollView contentContainerStyle={styles.conteudo}>
          {msg && (
            <View style={styles.aviso}>
              <Text style={styles.avisoTexto}>{msg}</Text>
            </View>
          )}

          {/* cabeçalho: plano, cota, cnpj, demo */}
          <View style={styles.cartao}>
            <View style={styles.badges}>
              <Badge texto={`Plano: ${d.company.plan}`} />
              <Badge texto={`Cota: ${d.company.chatQuota}/mês`} />
              {d.company.isDemo && <Badge texto="DEMONSTRAÇÃO" destaque />}
            </View>
            <Text style={styles.subInfo}>
              {d.company.cnpj ? `CNPJ ${d.company.cnpj} · ` : ''}criada em {dataBR(String(d.company.createdAt).slice(0, 10))}
            </Text>
          </View>

          {/* diagnóstico */}
          {d.snapshot?.diagnosis ? (
            <View style={styles.cartao}>
              <Rotulo texto="DIAGNÓSTICO" />
              <View style={styles.diagLinha}>
                <View style={[styles.estagio, { borderColor: estagioCor[d.snapshot.diagnosis.stage] }]}>
                  <View style={[styles.estagioPonto, { backgroundColor: estagioCor[d.snapshot.diagnosis.stage] }]} />
                  <Text style={[styles.estagioTexto, { color: estagioCor[d.snapshot.diagnosis.stage] }]}>
                    {estagioRotulo[d.snapshot.diagnosis.stage]}
                  </Text>
                </View>
                <Text style={styles.diagData}>de {dataBR(d.snapshot.asOf)}</Text>
              </View>
              {d.snapshot.diagnosis.drivers.slice(0, 5).map((dr, i) => (
                <Text key={i} style={styles.driver}>
                  • {dr.premissa} ({estagioRotulo[dr.stage]})
                </Text>
              ))}
            </View>
          ) : (
            <View style={styles.cartao}>
              <Text style={styles.vazioTexto}>Sem snapshot calculado ainda.</Text>
            </View>
          )}

          {/* indicadores do último snapshot */}
          {d.snapshot && (
            <View style={styles.cartao}>
              <Rotulo texto={`INDICADORES · core ${d.snapshot.coreVersion}`} />
              {Object.entries(d.snapshot.indicators).map(([k, ind]) => {
                const v = (ind as { value?: unknown }).value;
                if (typeof v !== 'number' && typeof v !== 'string') return null;
                const texto = typeof v === 'number' && /Cents$|_cents$/.test(k) ? brl(v) : String(v);
                return (
                  <View key={k} style={styles.kv}>
                    <Text style={styles.kvChave}>{k}</Text>
                    <Text style={styles.kvValor}>{texto}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* alertas */}
          <View style={styles.cartao}>
            <Rotulo texto={`ALERTAS (${d.alerts.length})`} />
            {d.alerts.length === 0 ? (
              <Text style={styles.vazioTexto}>Nenhum alerta.</Text>
            ) : (
              d.alerts.slice(0, 8).map((a) => (
                <View key={a.id} style={styles.alerta}>
                  <View style={[styles.alertaPonto, { backgroundColor: severityColor[a.severity as Severity] }]} />
                  <Text style={styles.alertaRule} numberOfLines={1}>
                    {a.ruleKey}
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

          {/* imports */}
          <View style={styles.cartao}>
            <Rotulo texto={`IMPORTS (${d.imports.length})`} />
            {d.imports.length === 0 ? (
              <Text style={styles.vazioTexto}>Nenhum import.</Text>
            ) : (
              d.imports.slice(0, 6).map((im, i) => (
                <View key={i} style={styles.kv}>
                  <Text style={styles.kvChave}>
                    {im.source} · {im.rowCount} linhas
                  </Text>
                  <Text style={styles.kvValor}>{dataBR(String(im.importedAt).slice(0, 10))}</Text>
                </View>
              ))
            )}
          </View>

          {/* contas previstas */}
          {d.planned.length > 0 && (
            <View style={styles.cartao}>
              <Rotulo texto="CONTAS (PREVISTAS/REALIZADAS)" />
              {d.planned.map((p, i) => (
                <View key={i} style={styles.kv}>
                  <Text style={styles.kvChave}>
                    {p.kind === 'receivable' ? 'a receber' : 'a pagar'} · {p.status} ({p.count})
                  </Text>
                  <Text style={styles.kvValor}>{brl(p.totalCents)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* consumo de IA do mês */}
          {d.aiUsageMonth.length > 0 && (
            <View style={styles.cartao}>
              <Rotulo texto="IA NO MÊS" />
              {d.aiUsageMonth.map((u, i) => (
                <View key={i} style={styles.kv}>
                  <Text style={styles.kvChave}>
                    {u.kind} · {u.model} ({u.calls})
                  </Text>
                  <Text style={styles.kvValor}>{u.totalTokens.toLocaleString('pt-BR')} tok</Text>
                </View>
              ))}
            </View>
          )}

          {/* AÇÕES */}
          <View style={styles.cartao}>
            <Rotulo texto="AÇÕES" />

            {/* editar cota/plano */}
            <View style={styles.campoLinha}>
              <View style={styles.campo}>
                <Text style={styles.campoRotulo}>Cota chat/mês</Text>
                <TextInput
                  style={styles.input}
                  value={quota}
                  onChangeText={setQuota}
                  keyboardType="number-pad"
                  placeholder="50"
                  placeholderTextColor={colors.cinza}
                />
              </View>
              <View style={styles.campo}>
                <Text style={styles.campoRotulo}>Plano</Text>
                <TextInput
                  style={styles.input}
                  value={plano}
                  onChangeText={setPlano}
                  autoCapitalize="none"
                  placeholder="piloto"
                  placeholderTextColor={colors.cinza}
                />
              </View>
            </View>
            <Pressable
              onPress={salvarEdicao}
              disabled={ocupado}
              style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
            >
              <Text style={styles.botaoTexto}>Salvar plano e cota</Text>
            </Pressable>

            {/* reprocessar */}
            <AcaoConfirmavel
              chave="reprocess"
              rotulo="Reprocessar snapshot (core atual)"
              perigo={false}
              confirmando={confirmando}
              setConfirmando={setConfirmando}
              ocupado={ocupado}
              onConfirm={reprocessar}
            />

            {/* resetar senha por usuário */}
            {d.users.map((u) => (
              <AcaoConfirmavel
                key={u.id}
                chave={`reset-${u.id}`}
                rotulo={`Resetar senha de ${u.email}`}
                perigo
                confirmando={confirmando}
                setConfirmando={setConfirmando}
                ocupado={ocupado}
                onConfirm={() => resetarSenha(u.id, u.email)}
              />
            ))}
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

function Badge({ texto, destaque }: { texto: string; destaque?: boolean }) {
  return (
    <View style={[styles.badge, destaque && styles.badgeDestaque]}>
      <Text style={[styles.badgeTexto, destaque && styles.badgeTextoDestaque]}>{texto}</Text>
    </View>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return <Text style={styles.rotulo}>{texto}</Text>;
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

  aviso: { backgroundColor: '#F0FBF6', borderWidth: 1, borderColor: colors.vivo, borderRadius: 12, padding: 12 },
  avisoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.okEscuro },

  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { borderWidth: 1, borderColor: colors.linha, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  badgeTexto: { fontFamily: fonts.corpoMedio, fontSize: 11.5, color: colors.tinta },
  badgeDestaque: { borderColor: colors.alerta, backgroundColor: '#FDF5E9' },
  badgeTextoDestaque: { color: colors.alerta, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6 },
  subInfo: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza },

  rotulo: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.cinza },

  diagLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  estagio: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  estagioPonto: { width: 7, height: 7, borderRadius: 4 },
  estagioTexto: { fontFamily: fonts.corpoForte, fontSize: 12 },
  diagData: { fontFamily: fonts.mono, fontSize: 10, color: colors.cinza },
  driver: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.tinta },

  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
  kvChave: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, flexShrink: 1 },
  kvValor: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.tinta },

  alerta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertaPonto: { width: 8, height: 8, borderRadius: 4 },
  alertaRule: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },
  alertaData: { fontFamily: fonts.mono, fontSize: 10, color: colors.cinza },
  naoLido: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.alerta },

  campoLinha: { flexDirection: 'row', gap: 10 },
  campo: { flex: 1, gap: 4 },
  campoRotulo: { fontFamily: fonts.corpoMedio, fontSize: 12, color: colors.cinza },
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
  botao: { backgroundColor: colors.mata, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 2 },
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

  confirmaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.linha, paddingTop: 12, marginTop: 4 },
  confirmaPergunta: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.tinta },
  confirmaBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.linha },
  confirmaCancelar: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.cinza },
  confirmaOk: { backgroundColor: colors.critico, borderColor: colors.critico },
  confirmaOkTexto: { fontFamily: fonts.corpoForte, fontSize: 13, color: colors.branco },

  pressionado: { opacity: 0.7 },
});
