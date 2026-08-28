/**
 * O wordmark do IVO: I e O geométricos, com o "V" desenhado como o check verde.
 * O check é a tese do produto: conferido, aprovado, validado.
 * Geometria canônica em packages/tokens/brand/ (não redesenhar em outro lugar).
 *
 * (O nome exportado PulsoLogo é interno, herdado; nada dele aparece ao usuário.)
 */

import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

interface Props {
  /** Altura das letras do wordmark (equivale ao antigo font-size). */
  size?: number;
  /** Cor das letras. O check é sempre o verde da marca (tom conforme o fundo). */
  color?: string;
}

/** Cores de letra que indicam fundo escuro: o check usa o verde p/ fundo escuro. */
const LETRAS_CLARAS: string[] = [colors.papel, colors.branco, colors.papelSobreMata];

export function PulsoLogo({ size = 34, color = colors.tinta }: Props) {
  const check = LETRAS_CLARAS.includes(color) ? colors.vivoSobreEscuro : colors.vivo;
  // glifo canônico: 260 de largura x 100 de altura (+ overshoot do check)
  const width = size * 2.92;
  const height = size * 1.36;

  return (
    <View>
      <Svg width={width} height={height} viewBox="-8 -20 292 136" accessibilityLabel="IVO">
        <Rect x={0} y={0} width={20} height={100} fill={color} />
        <Path
          d="M52 46 L86 88 L134 -8"
          fill="none"
          stroke={check}
          strokeWidth={20}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        <Circle cx={210} cy={50} r={40} fill="none" stroke={color} strokeWidth={20} />
      </Svg>
    </View>
  );
}
