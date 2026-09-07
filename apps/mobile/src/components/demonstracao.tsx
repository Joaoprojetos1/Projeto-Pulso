/**
 * Demonstração — o passo 6 do onboarding: "Ver o Ivo funcionando".
 *
 * Existe por uma razão de produto (decisão do especialista): precisa haver algo
 * de graça ANTES de pedir dinheiro. A pessoa já deu os dados, aqui ela vê o que
 * o Ivo faz com eles — faturamento, caixa projetado e um aviso de verdade — e só
 * depois escolhe o plano.
 *
 * Os números são os da demonstração (lib/demo.ts), 100% inventados e ROTULADOS
 * como exemplo em cima de cada bloco. Nada aqui é calculado no app: é o mesmo
 * retrato pronto que o servidor devolveria.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DEMO_DASHBOARD } from '@/lib/demo';
import { brl, dataBR } from '@/lib/format';
import { colors, fonts, space } from '@/theme';

/** Como o exemplo é apresentado por segmento (só o texto muda; os números não). */
const EXEMPLO_POR_SEGMENTO: Record<string, string> = {
  clinica: 'uma clínica parecida com a sua',
  varejo: 'uma loja parecida com a sua',
  restaurante: 'um restaurante parecido com o seu',
};

export function Demonstracao({ segmento }: { segmento?: string | null }) {
  const d = DEMO_DASHBOARD;
  const ind = d.snapshot?.indicators;
  const receita = (ind?.revenue_current?.value ?? null) as number | null;
  const receitaAnterior = (ind?.revenue_previous?.value ?? null) as number | null;
  const projecao = (ind?.cash_projection?.value ?? []) as { horizonDays: number; projectedCents: number }[];
  const trintaDias = projecao.find((p) => p.horizonDays === 30)?.projectedCents ?? null;
  const caixaHoje = (ind?.cash_balance?.value ?? null) as number | null;
  const alerta = d.alerts?.[0] ?? null;
  const diagnostico = d.diagnosis?.text ?? null;

  const variacao =
    receita != null && receitaAnterior != null && receitaAnterior > 0
      ? Math.round(((receita - receitaAnterior) / receitaAnterior) * 100)
      : null;

  const referencia = (segmento && EXEMPLO_POR_SEGMENTO[segmento]) ?? 'um negócio parecido com o seu';

  return (
    <View style={styles.wrap}>
      <Text style={styles.titulo}>É assim que o Ivo fala com você</Text>
      <Text style={styles.corpo}>
        Abaixo, o retrato de {referencia}. Os números são de exemplo — quando os seus arquivos
        entrarem, esta mesma tela passa a mostrar o seu caixa.
      </Text>

      <View style={styles.selo}>
        <Ionicons name="eye-outline" size={14} color={colors.alertaTexto} />
        <Text style={styles.seloTexto}>EXEMPLO · NÃO SÃO OS SEUS NÚMEROS</Text>
      </View>

      {/* caixa projetado — o número principal do produto */}
      <Animated.View entering={FadeInDown.duration(220)} style={styles.cartaoCaixa}>
        <Text style={styles.cartaoRotulo}>CAIXA PROJETADO · 30 DIAS</Text>
        <Text style={styles.cartaoValor}>{trintaDias != null ? brl(trintaDias) : '·'}</Text>
        {caixaHoje != null && d.snapshot?.asOf ? (
          <Text style={styles.cartaoBase}>
            Com base no saldo de {brl(caixaHoje)} informado em {dataBR(d.snapshot.asOf)}.
          </Text>
        ) : null}
        {diagnostico ? <Text style={styles.cartaoDiag}>{diagnostico.title}</Text> : null}
      </Animated.View>

      {/* faturamento do mês */}
      <Animated.View entering={FadeInDown.duration(220).delay(60)} style={styles.cartao}>
        <Text style={styles.rotulo}>FATUROU NO MÊS</Text>
        <View style={styles.linhaValor}>
          <Text style={styles.valor}>{receita != null ? brl(receita) : '·'}</Text>
          {variacao != null ? (
            <View style={styles.tendencia}>
              <Ionicons
                name={variacao >= 0 ? 'arrow-up' : 'arrow-down'}
                size={13}
                color={variacao >= 0 ? colors.okEscuro : colors.alertaTexto}
              />
              <Text style={[styles.tendenciaTexto, { color: variacao >= 0 ? colors.okEscuro : colors.alertaTexto }]}>
                {Math.abs(variacao)}% vs. mês anterior
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {/* o aviso — o coração da promessa */}
      {alerta ? (
        <Animated.View entering={FadeInDown.duration(220).delay(120)} style={styles.cartaoAviso}>
          <View style={styles.avisoTopo}>
            <Ionicons name="alert-circle" size={18} color={colors.alertaTexto} />
            <Text style={styles.avisoTitulo}>{alerta.textTitle}</Text>
          </View>
          <Text style={styles.avisoCorpo}>{alerta.textBody}</Text>
        </Animated.View>
      ) : null}

      <Text style={styles.rodape}>
        O Ivo só afirma o que os seus dados sustentam. Onde faltar informação, ele diz o que falta
        em vez de chutar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.item },
  titulo: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.tinta, letterSpacing: -0.5 },
  corpo: { fontFamily: fonts.corpo, fontSize: 15.5, lineHeight: 23, color: colors.cinza },

  selo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.alerta,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: space.tight,
  },
  seloTexto: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.8, color: colors.alertaTexto },

  cartaoCaixa: { backgroundColor: colors.mata, borderRadius: 18, padding: 20, gap: 4, marginTop: space.tight },
  cartaoRotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.rotuloSobreMata },
  cartaoValor: { fontFamily: fonts.displayBlack, fontSize: 38, color: colors.branco, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  cartaoBase: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.rotuloSobreMata },
  cartaoDiag: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.vivoSobreEscuro, marginTop: 6 },

  cartao: { backgroundColor: colors.branco, borderWidth: 1, borderColor: colors.linha, borderRadius: 14, padding: 16, gap: 4 },
  rotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  linhaValor: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  valor: { fontFamily: fonts.display, fontSize: 24, color: colors.tinta, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  tendencia: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  tendenciaTexto: { fontFamily: fonts.corpoMedio, fontSize: 12.5 },

  cartaoAviso: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderLeftWidth: 4,
    borderLeftColor: colors.alerta,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  avisoTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avisoTitulo: { flex: 1, fontFamily: fonts.corpoForte, fontSize: 15, color: colors.tinta },
  avisoCorpo: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza },

  rodape: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.cinza, marginTop: space.tight },
});
