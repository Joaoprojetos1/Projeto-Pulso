/**
 * Linha do tempo do caixa — o que fica no lugar do gráfico.
 *
 * Decisão do João (08/09), depois de ver a régua de 90 traços na tela: no painel
 * o dono não quer ler um gráfico, quer saber DUAS coisas — quanto tem e até
 * quando dura. Então aqui não há gráfico nenhum: um fio fino de hoje até 90
 * dias, com UM marco, o dia em que o caixa aperta. Empresa saudável mostra o fio
 * inteiro na cor do momento, sem marco algum.
 *
 * A forma da projeção (o vaivém dia a dia) não sumiu do produto: ela vive na
 * tela de detalhe, onde a ESCADA explica de onde vem o número.
 *
 * App burro: a data de risco (`zeroOn`) e os dias de fôlego (`zeroInDays`) vêm
 * calculados do core. Aqui só se decide onde cai o ponto na régua de 90 dias.
 */

import { StyleSheet, Text, View } from 'react-native';

import { dataBR, dias } from '@/lib/format';
import { colors, fonts } from '@/theme';

const HORIZONTE = 90; // a janela da projeção; é só a escala do fio

export interface LinhaTempoCaixaProps {
  zeroOn: string | null;
  zeroInDays: number | null;
  saudavel: boolean;
  /** Cor da severidade do momento (vem do diagnóstico). */
  cor: string;
}

export function LinhaTempoCaixa({ zeroOn, zeroInDays, saudavel, cor }: LinhaTempoCaixaProps) {
  const emRisco = !saudavel && zeroOn !== null;
  const frase = emRisco
    ? `Seu caixa aguenta até ${dataBR(zeroOn)}${zeroInDays !== null ? `, ${dias(zeroInDays)}` : ''}.`
    : 'Seu caixa está saudável. Sem risco à vista nos próximos 90 dias.';

  // onde o marco cai no fio. Sem dias calculados, fica no meio (nunca inventa data).
  const pct = emRisco
    ? Math.max(3, Math.min(((zeroInDays ?? HORIZONTE / 2) / HORIZONTE) * 100, 97))
    : 100;

  return (
    <View style={styles.wrap}>
      <Text style={styles.frase}>{frase}</Text>

      <View style={styles.fio}>
        {/* trecho com caixa, na cor do momento; o resto fica apagado */}
        <View style={[styles.fioCheio, { width: `${pct}%`, backgroundColor: cor }]} />
        {emRisco && <View style={[styles.marco, { left: `${pct}%`, borderColor: cor }]} />}
      </View>

      <View style={styles.pontas}>
        <Text style={styles.ponta}>hoje</Text>
        <Text style={styles.ponta}>+90 dias</Text>
      </View>

      {emRisco && (
        <View style={styles.legendaLinha}>
          <View style={{ flex: pct }} />
          <View style={[styles.legenda, pct > 60 ? styles.legendaFim : styles.legendaInicio]}>
            <Text style={styles.legendaData}>{dataBR(zeroOn)}</Text>
            <Text style={styles.legendaTexto}>aqui o caixa zera</Text>
          </View>
          <View style={{ flex: Math.max(1, 100 - pct) }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 8 },
  frase: { fontFamily: fonts.corpoForte, fontSize: 14, lineHeight: 20, color: colors.papel },

  fio: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(245,244,242,0.18)',
    justifyContent: 'center',
  },
  fioCheio: { height: 3, borderRadius: 2 },
  marco: {
    position: 'absolute',
    width: 11,
    height: 11,
    borderRadius: 6,
    marginLeft: -5.5,
    borderWidth: 3,
    backgroundColor: colors.mata,
  },

  pontas: { flexDirection: 'row', justifyContent: 'space-between' },
  ponta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4, color: colors.rotuloSobreMata },

  // a legenda do marco acompanha a posição dele, sem estourar as bordas
  legendaLinha: { flexDirection: 'row', marginTop: -2 },
  legenda: { minWidth: 110 },
  legendaInicio: { alignItems: 'flex-start', marginLeft: -8 },
  legendaFim: { alignItems: 'flex-end', marginRight: -8 },
  legendaData: { fontFamily: fonts.corpoForte, fontSize: 12.5, color: colors.papel },
  legendaTexto: { fontFamily: fonts.corpo, fontSize: 11.5, color: colors.rotuloSobreMata },
});
