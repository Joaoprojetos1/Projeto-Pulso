/**
 * A linha de pulso do cartão de caixa — a marca dentro do produto.
 * Desenha a projeção como batimento; o ponto final ("o agora do futuro") pulsa,
 * como um sinal vital vivo.
 */

import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { colors } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

interface Props {
  /** Valores em centavos, do presente ao horizonte mais distante. */
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function PulseLine({ points, width = 300, height = 56, color = colors.vivo }: Props) {
  const t = useSharedValue(0);
  // 0 = linha escondida, 1 = totalmente desenhada (traço "correndo" ao carregar)
  const desenho = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [t]);

  useEffect(() => {
    desenho.value = 0;
    desenho.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [desenho, points.length]);

  // geometria calculada antes dos hooks de animação (com guarda para poucos pontos),
  // para que a ordem dos hooks nunca mude entre renders.
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

  // comprimento total da linha (soma dos segmentos) para animar o "traço"
  let comprimento = 0;
  for (let i = 1; i < pts.length; i++) {
    comprimento += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  const comprimentoSeguro = comprimento || 1;

  const cx = pts.length ? pts[pts.length - 1]!.x : 0;
  const cy = pts.length ? pts[pts.length - 1]!.y : 0;

  const pingProps = useAnimatedProps(() => ({
    r: 4.5 + t.value * 8,
    opacity: 0.5 * (1 - t.value),
  }));

  const linhaProps = useAnimatedProps(() => ({
    strokeDashoffset: comprimentoSeguro * (1 - desenho.value),
  }));

  const pontoFinalProps = useAnimatedProps(() => ({
    opacity: desenho.value, // o ponto final só aparece quando a linha chega nele
  }));

  if (points.length < 2) return null;

  return (
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
      {/* o "ping" que expande e some, repetindo */}
      <AnimatedCircle cx={cx} cy={cy} fill={color} animatedProps={pingProps} />
      {/* o ponto sólido por cima */}
      <AnimatedCircle cx={cx} cy={cy} r={4.5} fill={color} animatedProps={pontoFinalProps} />
    </Svg>
  );
}
