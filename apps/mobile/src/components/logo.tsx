/**
 * O wordmark do Pulso: "pu" + linha de batimento no lugar do "l" + "so".
 * O logo é a tese do produto: enquanto houver pulso, o negócio está vivo.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, fonts } from '@/theme';

interface Props {
  /** Altura da fonte do wordmark. */
  size?: number;
  /** Cor do texto (o batimento é sempre verde-vivo). */
  color?: string;
}

export function PulsoLogo({ size = 34, color = colors.tinta }: Props) {
  const beatWidth = size * 1.35;
  const beatHeight = size * 0.72;

  return (
    <View style={styles.row}>
      <Text style={[styles.word, { fontSize: size, color }]}>pu</Text>
      <Svg
        width={beatWidth}
        height={beatHeight}
        viewBox="0 0 118 56"
        style={{ marginHorizontal: -size * 0.06 }}
      >
        <Path
          d="M2 44 L30 44 L43 6 L58 52 L70 24 L84 44 L112 44"
          fill="none"
          stroke={colors.vivo}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={112} cy={44} r={6.5} fill={colors.vivo} />
      </Svg>
      <Text style={[styles.word, { fontSize: size, color }]}>so</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  word: {
    fontFamily: fonts.displayBlack,
    letterSpacing: -1.5,
  },
});
