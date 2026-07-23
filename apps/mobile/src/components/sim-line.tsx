/**
 * Gráfico de duas curvas para a simulação "e se": a curva REAL (cheia) e a
 * SIMULADA (tracejada), na mesma escala, com a linha do zero destacada. Estático
 * de propósito (sem animação) — aqui o que importa é comparar as duas curvas e
 * as duas datas de zeragem com clareza.
 */

import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { colors } from '@/theme';

interface Props {
  /** Curva real, em centavos (um ponto por dia, do presente ao horizonte). */
  real: number[];
  /** Curva simulada, em centavos. Ausente = mostra só a real. */
  sim?: number[] | null;
  /** Índice do dia em que a real zera (para marcar o ponto). null = não zera. */
  realZeroIndex?: number | null;
  /** Índice do dia em que a simulada zera. */
  simZeroIndex?: number | null;
  width?: number;
  height?: number;
}

export function SimLine({
  real,
  sim,
  realZeroIndex,
  simZeroIndex,
  width = 320,
  height = 120,
}: Props) {
  const todos = sim && sim.length ? [...real, ...sim] : real;
  if (real.length < 2) return null;

  const min = Math.min(...todos, 0);
  const max = Math.max(...todos, 0);
  const range = max - min || 1;
  const pad = 8;
  const n = real.length;

  const x = (i: number) => pad + (i / Math.max(n - 1, 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);

  const coords = (serie: number[]) => serie.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const yZero = y(0);

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* linha do zero: cruzar isso é o caixa no vermelho */}
      <Line x1={pad} y1={yZero} x2={width - pad} y2={yZero} stroke={colors.linha} strokeWidth={1} strokeDasharray="2 4" />

      {/* curva REAL (cheia) */}
      <Polyline
        points={coords(real)}
        fill="none"
        stroke={realZeroIndex != null ? colors.critico : colors.vivo}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {realZeroIndex != null && (
        <Circle cx={x(realZeroIndex)} cy={y(real[realZeroIndex] ?? 0)} r={4} fill={colors.critico} />
      )}

      {/* curva SIMULADA (tracejada), por cima */}
      {sim && sim.length >= 2 && (
        <>
          <Polyline
            points={coords(sim)}
            fill="none"
            stroke={colors.mata}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 5"
          />
          {simZeroIndex != null && (
            <Circle cx={x(simZeroIndex)} cy={y(sim[simZeroIndex] ?? 0)} r={4} fill={colors.mata} />
          )}
        </>
      )}
    </Svg>
  );
}
