/**
 * Histórico de alertas — o passado deixa de sumir.
 *
 * Lista todos os alertas (todos os snapshots), com data e estado lido/não-lido.
 * Abrir um alerta dispara /opened (o dono VIU); "Fiz algo com isso" dispara
 * /acted (o dono AGIU) — sem culpa, sem modal. São as métricas do piloto.
 * No modo demonstração, nada é enviado ao servidor.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { acoesParaAlerta } from '@/lib/acoes';
import { fetchMyAlerts, markAlertActed, markAlertOpened, type AlertHistoryJson } from '@/lib/api';
import { dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, type Severity } from '@/theme';

export default function Historico() {
  const { token, fonte } = usePulso();
  const [alertas, setAlertas] = useState<AlertHistoryJson[] | null>(null);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [lidos, setLidos] = useState<Set<string>>(new Set());
  const [agidos, setAgidos] = useState<Set<string>>(new Set());

  const demo = fonte === 'demo' || !token;

  useEffect(() => {
    if (demo || !token) return;
    let vivo = true;
    fetchMyAlerts(token)
      .then((a) => vivo && setAlertas(a))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [demo, token]);

  function abrir(a: AlertHistoryJson) {
    const novo = aberto === a.id ? null : a.id;
    setAberto(novo);
    // ao abrir pela primeira vez: marca visto (servidor + local para o ponto sumir na hora)
    if (novo && !a.openedAt && !lidos.has(a.id)) {
      setLidos((s) => new Set(s).add(a.id));
      if (token) void markAlertOpened(token, a.id);
    }
  }

  function fiz(a: AlertHistoryJson) {
    setAgidos((s) => new Set(s).add(a.id));
    if (token) void markAlertActed(token, a.id);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && styles.pressionado}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.titulo}>Histórico de alertas</Text>
        <View style={{ width: 24 }} />
      </View>

      {demo ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTexto}>
            No modo demonstração o histórico não fica disponível. Entre com sua conta para acompanhar
            seus alertas ao longo do tempo.
          </Text>
        </View>
      ) : erro ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTexto}>Não consegui carregar o histórico agora. Tente de novo em instantes.</Text>
        </View>
      ) : alertas === null ? (
        <View style={styles.vazio}>
          <ActivityIndicator color={colors.mata} />
        </View>
      ) : alertas.length === 0 ? (
        <View style={styles.vazio}>
          <Text style={styles.vazioTexto}>Nenhum alerta até agora. O Pulso segue de olho no seu caixa.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {alertas.map((a) => {
            const naoLido = !a.openedAt && !lidos.has(a.id);
            const cor = severityColor[a.severity as Severity];
            const expandido = aberto === a.id;
            const agiu = !!a.actedAt || agidos.has(a.id);
            return (
              <Pressable
                key={a.id}
                onPress={() => abrir(a)}
                style={({ pressed }) => [styles.item, pressed && styles.pressionado]}
              >
                <View style={styles.itemTopo}>
                  <View style={[styles.ponto, { backgroundColor: naoLido ? cor : 'transparent', borderColor: cor }]} />
                  <View style={styles.itemMiolo}>
                    <Text style={[styles.itemTitulo, naoLido && styles.itemTituloNaoLido]}>
                      {a.textTitle ?? a.ruleKey}
                    </Text>
                    <Text style={styles.itemData}>{dataBR(a.createdAt.slice(0, 10))}</Text>
                  </View>
                  {agiu && <Ionicons name="checkmark-circle" size={18} color={colors.okEscuro} />}
                </View>

                {expandido && (
                  <Animated.View entering={FadeIn.duration(160)} style={styles.detalhe}>
                    {a.textBody ? <Text style={styles.corpo}>{a.textBody}</Text> : null}
                    <Text style={styles.oQueRotulo}>O QUE EU FAÇO?</Text>
                    {acoesParaAlerta(a).map((passo, i) => (
                      <Text key={i} style={styles.passo}>
                        • {passo}
                      </Text>
                    ))}
                    <Pressable
                      onPress={() => fiz(a)}
                      disabled={agiu}
                      style={({ pressed }) => [styles.fiz, agiu && styles.fizFeito, pressed && styles.pressionado]}
                    >
                      <Text style={[styles.fizTexto, agiu && styles.fizTextoFeito]}>
                        {agiu ? 'Você marcou que agiu ✓' : 'Fiz algo com isso'}
                      </Text>
                    </Pressable>
                  </Animated.View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
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
  titulo: { fontFamily: fonts.display, fontSize: 18, color: colors.tinta, letterSpacing: -0.3 },
  pressionado: { opacity: 0.7 },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza, textAlign: 'center' },

  lista: { padding: 16, gap: 10 },
  item: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 14,
  },
  itemTopo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ponto: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  itemMiolo: { flex: 1, gap: 2 },
  itemTitulo: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.tinta },
  itemTituloNaoLido: { fontFamily: fonts.display },
  itemData: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4, color: colors.cinza },

  detalhe: { marginTop: 12, gap: 6, borderTopWidth: 1, borderTopColor: colors.linha, paddingTop: 12 },
  corpo: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.tinta },
  oQueRotulo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.cinza, marginTop: 4 },
  passo: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.tinta },
  fiz: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.mata,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  fizTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.mata },
  fizFeito: { borderColor: colors.linha, backgroundColor: '#F0FBF6' },
  fizTextoFeito: { color: colors.okEscuro },
});
