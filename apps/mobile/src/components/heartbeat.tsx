/**
 * Heartbeat — o check da marca em miniatura, pulsando em loop.
 *
 * A assinatura do IVO no lugar dos "três pontinhos" genéricos de "digitando":
 * reforça que o conselheiro está conferindo os seus números. Componente
 * pequeno e reutilizável; sem dependência nova (reanimated + svg, já no
 * projeto). (Nome do componente é interno, herdado da marca anterior.)
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
// o check da marca em miniatura (geometria de packages/tokens/brand, viewBox 0 0 34 22)
const D = 'M4 12 L12 21 L30 1';

export interface HeartbeatProps {
  color?: string;
  width?: number;
  height?: number;
}

export function Heartbeat({ color = colors.vivo, width = 34, height = 22 }: HeartbeatProps) {
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
    <Svg width={width} height={height} viewBox="0 0 34 22">
      <AnimatedPath
        d={D}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        animatedProps={props}
      />
    </Svg>
  );
}
