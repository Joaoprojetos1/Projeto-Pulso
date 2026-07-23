/**
 * A linha de pulso do cartão de caixa — a marca dentro do produto.
 * Desenha a projeção como batimento; o ponto final ("o agora do futuro") pulsa,
 * como um sinal vital vivo.
 *
 * Item 14: quando recebe `dates` (a curva diária vinda do servidor), vira
 * interativa — arrastar o dedo mostra um marcador vertical e um balão com a data
 * e o valor projetado daquele dia. Sem `dates`, continua exatamente como antes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { brl, dataBR } from '@/lib/format';
import { colors, fonts } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

interface Props {
  /** Valores em centavos, do presente ao horizonte mais distante. */
  points: number[];
  /** Datas (ISO) paralelas aos pontos. Presentes = gráfico interativo (scrubbing). */
  dates?: string[];
  width?: number;
  height?: number;
  color?: string;
}

export function PulseLine({ points, dates, width = 300, height = 56, color = colors.vivo }: Props) {
  const t = useSharedValue(0);
  const desenho = useSharedValue(0);
  const [larguraReal, setLarguraReal] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const interativo = !!dates && dates.length === points.length && points.length >= 2;

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false);
  }, [t]);

  useEffect(() => {
    desenho.value = 0;
    desenho.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [desenho, points.length]);

  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const pad = 6;

  const pts = points.map((v, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const coords = pts.map((p) => `${p.x},${p.y}`);

  let comprimento = 0;
  for (let i = 1; i < pts.length; i++) {
    comprimento += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  const comprimentoSeguro = comprimento || 1;

  const cx = pts.length ? pts[pts.length - 1]!.x : 0;
  const cy = pts.length ? pts[pts.length - 1]!.y : 0;

  const pingProps = useAnimatedProps(() => ({ r: 4.5 + t.value * 8, opacity: 0.5 * (1 - t.value) }));
  const linhaProps = useAnimatedProps(() => ({ strokeDashoffset: comprimentoSeguro * (1 - desenho.value) }));
  const pontoFinalProps = useAnimatedProps(() => ({ opacity: desenho.value }));

  // scrubbing: o toque (em pixels de tela) vira índice do dia
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interativo,
      onMoveShouldSetPanResponder: () => interativo,
      onPanResponderGrant: (e) => atualizar(e.nativeEvent.locationX),
      onPanResponderMove: (e) => atualizar(e.nativeEvent.locationX),
      onPanResponderRelease: () => setScrub(null),
      onPanResponderTerminate: () => setScrub(null),
    }),
  ).current;

  function atualizar(xTela: number) {
    if (larguraReal <= 0) return;
    const frac = Math.min(1, Math.max(0, xTela / larguraReal));
    setScrub(Math.round(frac * (points.length - 1)));
  }

  const rotulo = useMemo(() => {
    if (points.length < 2) return undefined;
    const ini = brl(points[0]!);
    const fim = brl(points[points.length - 1]!);
    return `Projeção de caixa: de ${ini} hoje a ${fim} no fim do período.`;
  }, [points]);

  if (points.length < 2) return null;

  const alvo = scrub != null ? pts[scrub] : null;
  const balaoX = scrub != null ? (scrub / (points.length - 1)) * larguraReal : 0;

  return (
    <View
      onLayout={(e) => setLarguraReal(e.nativeEvent.layout.width)}
      {...(interativo ? pan.panHandlers : {})}
      accessibilityLabel={rotulo}
      accessible
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <AnimatedPolyline
          points={coords.join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={comprimentoSeguro}
          animatedProps={linhaProps}
        />
        {scrub == null && <AnimatedCircle cx={cx} cy={cy} fill={color} animatedProps={pingProps} />}
        {scrub == null && (
          <AnimatedCircle cx={cx} cy={cy} r={4.5} fill={color} animatedProps={pontoFinalProps} />
        )}
        {/* marcador do scrubbing */}
        {alvo && (
          <>
            <Line x1={alvo.x} y1={pad} x2={alvo.x} y2={height - pad} stroke={color} strokeWidth={1} strokeDasharray="2 3" />
            <Circle cx={alvo.x} cy={alvo.y} r={5} fill={color} />
          </>
        )}
      </Svg>

      {/* balão data · valor */}
      {scrub != null && dates && (
        <View
          style={[
            styles.balao,
            { left: Math.min(Math.max(balaoX - 60, 0), Math.max(larguraReal - 120, 0)) },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.balaoData}>{dataBR(dates[scrub]!)}</Text>
          <Text style={styles.balaoValor}>{brl(points[scrub]!)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  balao: {
    position: 'absolute',
    top: -6,
    width: 120,
    backgroundColor: colors.papel,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  balaoData: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.4, color: colors.cinza },
  balaoValor: { fontFamily: fonts.displayMedio, fontSize: 13, color: colors.tinta, fontVariant: ['tabular-nums'] },
});
