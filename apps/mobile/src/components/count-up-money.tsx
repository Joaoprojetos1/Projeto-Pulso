/**
 * O número principal "subindo" ao carregar — passa a sensação de que o Pulso
 * acabou de calcular agorinha. É só APRESENTAÇÃO: recebe o valor já pronto
 * (em centavos, do servidor) e anima a contagem de 0 até ele. Nada é calculado
 * aqui.
 */

import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { brl } from '@/lib/format';

interface Props {
  /** Valor final em centavos (já calculado pelo servidor). */
  cents: number;
  style?: StyleProp<TextStyle>;
  /** Duração da contagem, em milissegundos. */
  duracao?: number;
}

// desaceleração suave no fim (easeOutCubic)
function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUpMoney({ cents, style, duracao = 750 }: Props) {
  const [atual, setAtual] = useState(cents);
  const inicioRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    inicioRef.current = null;
    const alvo = cents;

    function passo(agora: number) {
      if (inicioRef.current === null) inicioRef.current = agora;
      const decorrido = agora - inicioRef.current;
      const p = Math.min(decorrido / duracao, 1);
      setAtual(Math.round(alvo * suavizar(p)));
      if (p < 1) rafRef.current = requestAnimationFrame(passo);
    }

    rafRef.current = requestAnimationFrame(passo);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [cents, duracao]);

  return <Text style={style}>{brl(atual)}</Text>;
}
