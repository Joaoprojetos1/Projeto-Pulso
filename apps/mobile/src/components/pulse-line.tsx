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

interface Props {
  /** Valores em centavos, do presente ao horizonte mais distante. */
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function PulseLine({ points, width = 300, height = 56, color = colors.vivo }: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [t]);

  const pingProps = useAnimatedProps(() => ({
    r: 4.5 + t.value * 8,
    opacity: 0.5 * (1 - t.value),
  }));

  if (points.length < 2) return null;

  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const pad = 6;

  const coords = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });

  const last = coords[coords.length - 1]!.split(',');
  const cx = Number(last[0]);
  const cy = Number(last[1]);

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* o "ping" que expande e some, repetindo */}
      <AnimatedCircle cx={cx} cy={cy} fill={color} animatedProps={pingProps} />
      {/* o ponto sólido por cima */}
      <Circle cx={cx} cy={cy} r={4.5} fill={color} />
    </Svg>
  );
}
