/**
 * Detalhe da projeção de caixa. É a leitura de UM MINUTO (o painel dá a de um
 * segundo): o cartão com o número, a régua dos 90 dias em tamanho maior e a
 * ESCADA — de onde vem esse número, degrau por degrau.
 *
 * O gráfico de linha com scrubbing saiu daqui de propósito: ele mostrava QUE o
 * caixa cai; a escada mostra POR QUE, que é sobre o que o dono consegue agir.
 *
 * App burro: só desenha o que o servidor já calculou. Nenhum número nasce aqui —
 * a curva, os horizontes, a data de risco e a composição vêm do snapshot.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EscadaCaixa } from '@/components/escada-caixa';
import { LinhaTempoCaixa } from '@/components/linha-tempo-caixa';
import type { CashProjectionPoint } from '@/lib/api';
import { brl, brlInteiro, dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, space } from '@/theme';

export default function Projecao() {
  const { dashboard } = usePulso();

  const ind = dashboard?.snapshot.indicators;
  const projecao = (ind?.cash_projection?.value ?? null) as CashProjectionPoint[] | null;
  const saldoHoje = (ind?.cash_balance?.value ?? null) as number | null;
  const zeroOn = projecao?.find((p) => p.zeroOn)?.zeroOn ?? null;
  const saudavel = !zeroOn;
  const p30 = projecao?.find((p) => p.horizonDays === 30) ?? null;

  const projInputs = (ind?.cash_projection?.inputs ?? {}) as Record<string, unknown>;
  const zeroInDays = typeof projInputs.zeroInDays === 'number' ? projInputs.zeroInDays : null;

  const saldoInputs = (ind?.cash_balance?.inputs ?? {}) as Record<string, unknown>;
  const saldoObservadoEm = typeof saldoInputs.observedOn === 'string' ? saldoInputs.observedOn : null;

  const composicao = dashboard?.projectionBreakdown ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topo}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.tinta} />
        </Pressable>
        <Text style={styles.tituloTopo}>Projeção do caixa</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.conteudo}>
        <View style={styles.cartao}>
          <Text style={styles.rotulo}>CAIXA PROJETADO · 30 DIAS</Text>
          <Text style={styles.valor}>{p30 ? brlInteiro(p30.projectedCents) : '·'}</Text>
          <Text style={styles.detalhe}>
            {saldoHoje === null
              ? 'Ainda sem saldo informado.'
              : saldoObservadoEm
                ? `Estimativa a partir do saldo de ${brl(saldoHoje)}, informado em ${dataBR(saldoObservadoEm)}.`
                : `Estimativa a partir do saldo de ${brl(saldoHoje)} que você informou.`}
          </Text>

          <LinhaTempoCaixa
            zeroInDays={zeroInDays}
            zeroOn={zeroOn}
            saudavel={saudavel}
            cor={saudavel ? colors.vivoSobreEscuro : '#F0A196'}
          />
        </View>

        {composicao ? (
          <View style={styles.folha}>
            <EscadaCaixa dados={composicao} />
          </View>
        ) : (
          <Text style={styles.semDados}>
            Ainda não dá para abrir a composição: falta o saldo do caixa para o motor projetar.
          </Text>
        )}

        <Text style={styles.dica}>
          A escada abre o mesmo número em partes: o que entra, o que sai e o que o custo fixo
          consome no período.
        </Text>
      </ScrollView>
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
  tituloTopo: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 17, color: colors.tinta },
  conteudo: { padding: 16, gap: space.item, paddingBottom: space.block },
  cartao: { backgroundColor: colors.mata, borderRadius: 20, padding: 18, gap: 4 },
  rotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.rotuloSobreMata },
  valor: {
    fontFamily: fonts.displayBlack,
    fontSize: 32,
    color: colors.papel,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  detalhe: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.papelSobreMata, marginBottom: 4 },
  folha: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 18,
    padding: 18,
    marginTop: space.tight,
  },
  semDados: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza, marginTop: space.item },
  dica: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza, textAlign: 'center', marginTop: space.tight },
});
