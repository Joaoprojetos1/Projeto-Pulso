/**
 * Régua do fôlego — o herói do painel.
 *
 * Em vez da curva suave que todo app financeiro tem, os 90 dias aparecem como
 * uma FITA DE DIAS: cada traço é um dia, a altura é quanto sobra naquele dia e a
 * cor vira exatamente onde o caixa acaba. O olho não precisa ler o gráfico — ele
 * vê onde a fita muda.
 *
 * Por que assim: a promessa do produto é "até quando o dinheiro dura", não "veja
 * uma curva". E a curva suave finge uma precisão de centavo que uma PROJEÇÃO não
 * tem; traços de um dia dizem a verdade sobre a granularidade.
 *
 * App burro: cada ponto vem pronto do motor (curva diária do snapshot). Aqui só
 * se decide altura em pixel e cor. Nenhum número nasce nesta tela.
 */

import { StyleSheet, Text, View } from 'react-native';

import { dataBR, dias } from '@/lib/format';
import { colors, fonts } from '@/theme';

const ALTURA_POSITIVA = 44; // banda acima da linha do zero
const ALTURA_NEGATIVA = 14; // banda abaixo (o "furo" fica visível, sem dominar)
const ALTURA_MINIMA = 2; // todo dia existe, mesmo valendo quase nada

export interface ReguaFolegoProps {
  /** Curva diária da projeção (um ponto por dia), já calculada pelo motor. */
  pontos: { day: string; cents: number }[];
  zeroOn: string | null;
  zeroInDays: number | null;
  saudavel: boolean;
  /** Cor da severidade do momento (vem do diagnóstico). */
  cor: string;
}

export function ReguaFolego({ pontos, zeroOn, zeroInDays, saudavel, cor }: ReguaFolegoProps) {
  const frase =
    saudavel || zeroOn === null
      ? 'Seu caixa está saudável. Sem risco à vista nos próximos 90 dias.'
      : `Seu caixa aguenta até ${dataBR(zeroOn)}${zeroInDays !== null ? `, ${dias(zeroInDays)}` : ''}.`;
  const fim = saudavel || zeroOn === null ? '+90 dias' : dataBR(zeroOn);

  // sem curva diária (conta nova, snapshot antigo): a barra proporcional de sempre
  if (pontos.length < 2) {
    const HORIZONTE = 90;
    const prop =
      saudavel || zeroInDays === null ? 1 : Math.max(0.06, Math.min(zeroInDays / HORIZONTE, 1));
    return (
      <View style={styles.wrap}>
        <Text style={styles.frase}>{frase}</Text>
        <View style={styles.trilha}>
          <View style={[styles.trilhaCheia, { width: `${prop * 100}%`, backgroundColor: cor }]} />
        </View>
        <Pontas inicio="hoje" fim={fim} />
      </View>
    );
  }

  const valores = pontos.map((p) => p.cents);
  const maiorPositivo = Math.max(1, ...valores.filter((v) => v > 0));
  const maiorNegativo = Math.max(1, ...valores.filter((v) => v < 0).map((v) => -v));
  // índice do primeiro dia sem caixa: é onde a fita vira
  const indiceVirada = valores.findIndex((v) => v < 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.frase}>{frase}</Text>

      <View style={styles.fita}>
        {pontos.map((p, i) => {
          const acabou = p.cents < 0;
          const altura = acabou
            ? Math.max(ALTURA_MINIMA, (-p.cents / maiorNegativo) * ALTURA_NEGATIVA)
            : Math.max(ALTURA_MINIMA, (p.cents / maiorPositivo) * ALTURA_POSITIVA);
          // marco de mês: a cada 30 dias um traço mais apagado serve de régua
          const marcoMes = i > 0 && i % 30 === 0;
          return (
            <View key={p.day} style={styles.coluna}>
              {/* metade de cima: os dias com caixa crescem para o alto */}
              <View style={styles.metadeCima}>
                {marcoMes && <View style={styles.marcoMes} />}
                {!acabou && (
                  <View
                    style={[
                      styles.traco,
                      { height: altura, backgroundColor: cor, opacity: i === 0 ? 1 : 0.9 },
                    ]}
                  />
                )}
              </View>
              {/* a linha do zero atravessa a fita inteira */}
              <View style={styles.linhaZero} />
              {/* metade de baixo: o que já é buraco */}
              <View style={styles.metadeBaixo}>
                {acabou && <View style={[styles.tracoVazio, { height: altura }]} />}
              </View>
            </View>
          );
        })}
      </View>

      {/* marca da virada, alinhada ao dia em que o caixa acaba */}
      {indiceVirada > 0 && (
        <View style={styles.marcaLinha}>
          <View style={{ flex: indiceVirada }} />
          <View style={styles.marca}>
            <Text style={styles.marcaSeta}>▲</Text>
          </View>
          <View style={{ flex: Math.max(1, pontos.length - indiceVirada - 1) }} />
        </View>
      )}

      {/* régua de tempo: os marcos que o dono usa para se situar */}
      <View style={styles.pontas}>
        <Text style={styles.ponta}>hoje</Text>
        <Text style={styles.ponta}>+30d</Text>
        <Text style={styles.ponta}>+60d</Text>
        <Text style={[styles.ponta, !saudavel && zeroOn ? styles.pontaRisco : null]}>{fim}</Text>
      </View>
    </View>
  );
}

function Pontas({ inicio, fim }: { inicio: string; fim: string }) {
  return (
    <View style={styles.pontas}>
      <Text style={styles.ponta}>{inicio}</Text>
      <Text style={styles.ponta}>{fim}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 8 },
  frase: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 19, color: colors.papelSobreMata },

  // fita de dias
  fita: { flexDirection: 'row', alignItems: 'stretch', gap: 2, height: ALTURA_POSITIVA + ALTURA_NEGATIVA + 1 },
  coluna: { flex: 1, justifyContent: 'flex-end' },
  metadeCima: { height: ALTURA_POSITIVA, justifyContent: 'flex-end' },
  // marco de 30 em 30 dias, atrás dos traços: dá noção de tempo sem poluir
  marcoMes: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(245,244,242,0.18)',
  },
  metadeBaixo: { height: ALTURA_NEGATIVA, justifyContent: 'flex-start' },
  traco: { width: '100%', borderRadius: 1 },
  // dia sem caixa: contorno vazado, não bloco cheio (é ausência, não quantidade)
  tracoVazio: {
    width: '100%',
    borderRadius: 1,
    borderWidth: 1,
    borderColor: colors.criticoSobreEscuro,
    backgroundColor: 'transparent',
  },
  linhaZero: { height: 1, backgroundColor: 'rgba(245,244,242,0.22)' },

  marcaLinha: { flexDirection: 'row', marginTop: -4 },
  marca: { alignItems: 'center', minWidth: 8 },
  marcaSeta: { fontSize: 9, color: colors.criticoSobreEscuro, lineHeight: 11 },

  pontas: { flexDirection: 'row', justifyContent: 'space-between' },
  ponta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4, color: colors.rotuloSobreMata },
  pontaRisco: { color: colors.criticoSobreEscuro },

  // fallback (sem curva diária)
  trilha: { height: 8, borderRadius: 4, backgroundColor: 'rgba(245,244,242,0.16)', overflow: 'hidden' },
  trilhaCheia: { height: 8, borderRadius: 4 },
});
