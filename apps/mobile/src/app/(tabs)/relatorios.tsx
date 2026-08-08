/**
 * Aba Relatórios (item 2.9) — versão inicial.
 *
 * Aqui mora o que NÃO é o "agora" do caixa: o histórico e a leitura de fundo. Nesta
 * fatia entram o resultado do diagnóstico de gestão e o acesso ao histórico de
 * alertas. Os gráficos por indicador ao longo do tempo e o PDF entram na fatia de
 * Relatórios completa. A home fica só com os indicadores do momento.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMySurvey, type SurveyJson } from '@/lib/api';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function Relatorios() {
  const { token } = usePulso();
  const [survey, setSurvey] = useState<SurveyJson | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      setSurvey(await fetchMySurvey(token));
    } catch {
      // sem segmento/diagnóstico ainda: mostra o estado vazio
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const result = survey?.result;
  const respondido = (result?.answeredCount ?? 0) > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Relatórios</Text>
        <Text style={styles.sub}>O histórico e a leitura de fundo do seu negócio.</Text>

        {/* Diagnóstico de gestão */}
        <Text style={styles.secao}>Diagnóstico de gestão</Text>
        {carregando ? (
          <ActivityIndicator color={colors.vivo} style={{ marginTop: 12 }} />
        ) : respondido && result ? (
          <View style={styles.cartao}>
            {result.overall != null ? (
              <View style={styles.notaLinha}>
                <Text style={styles.nota}>{result.overall}</Text>
                <Text style={styles.notaDe}>de 100 na gestão</Text>
              </View>
            ) : null}
            {survey?.devolutiva ? <Text style={styles.devolutiva}>{survey.devolutiva}</Text> : null}
            {result.weakest.length > 0 ? (
              <View style={{ gap: 6, marginTop: 6 }}>
                <Text style={styles.fracoTitulo}>Onde focar</Text>
                {result.weakest.map((w) => (
                  <Text key={w.block} style={styles.fraco}>
                    • {w.label}: {w.focus}
                  </Text>
                ))}
              </View>
            ) : null}
            <Pressable onPress={() => router.push('/questionario' as Href)}>
              <Text style={styles.link}>Revisar respostas</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.cartao}>
            <Text style={styles.vazio}>
              Você ainda não respondeu o diagnóstico de gestão. São 15 perguntas rápidas que ajustam
              o que o Pulso avalia.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
              onPress={() => router.push('/questionario' as Href)}
            >
              <Text style={styles.botaoTexto}>Responder agora</Text>
            </Pressable>
          </View>
        )}

        {/* Histórico de alertas */}
        <Text style={styles.secao}>Histórico</Text>
        <Pressable
          style={({ pressed }) => [styles.cartaoLink, pressed && styles.pressionado]}
          onPress={() => router.push('/historico' as Href)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cartaoLinkTitulo}>Alertas e avisos</Text>
            <Text style={styles.cartaoLinkDesc}>Tudo que o Pulso já sinalizou, com data.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.cinza} />
        </Pressable>

        <Text style={styles.nota2}>
          Em breve: gráficos de cada indicador ao longo do tempo e um PDF para você projetar numa
          reunião com a equipe.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 20, paddingBottom: 40 },
  h1: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.corpo, fontSize: 14.5, color: colors.cinza, marginTop: 2 },
  secao: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta, marginTop: 22, marginBottom: 8 },
  cartao: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, gap: 8 },
  notaLinha: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  nota: { fontFamily: fonts.display, fontSize: 34, color: colors.mata },
  notaDe: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  devolutiva: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.tinta },
  fracoTitulo: { fontFamily: fonts.corpoMedio, fontSize: 13, color: colors.tinta },
  fraco: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza },
  link: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.mata, marginTop: 2 },
  vazio: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza },
  botao: { backgroundColor: colors.vivo, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#06231A' },
  pressionado: { opacity: 0.85 },
  cartaoLink: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16 },
  cartaoLinkTitulo: { fontFamily: fonts.corpoMedio, fontSize: 15, color: colors.tinta },
  cartaoLinkDesc: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza },
  nota2: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 19, color: colors.cinza, marginTop: 20, fontStyle: 'italic' },
});
