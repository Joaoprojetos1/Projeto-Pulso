/**
 * Heartbeat — a linha de batimento em miniatura, pulsando em loop.
 *
 * A assinatura do Pulso no lugar dos "três pontinhos" genéricos de "digitando"
 * (refinamento UX A7/5): reforça que o monitor está lendo os seus números.
 * Componente pequeno e reutilizável; sem dependência nova (reanimated + svg,
 * já no projeto).
 */

import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
// mesma silhueta de ECG da marca (viewBox 0 0 34 14)
const D = 'M1 7 H7 L9 7 L10.5 3 L12 11 L13.5 7 L15 7 H20 L22 7 L23.5 4.5 L25 9.5 L26.5 7 H33';

export interface HeartbeatProps {
  color?: string;
  width?: number;
  height?: number;
}

export function Heartbeat({ color = colors.vivo, width = 42, height = 15 }: HeartbeatProps) {
  const o = useSharedValue(0.35);
  useEffect(() => {
    o.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [o]);
  const props = useAnimatedProps(() => ({ opacity: o.value }));
  return (
    <Svg width={width} height={height} viewBox="0 0 34 14">
      <AnimatedPath
        d={D}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        animatedProps={props}
      />
    </Svg>
  );
}
