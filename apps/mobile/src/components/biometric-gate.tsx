/**
 * Portão de biometria: quando o dono ligou a trava, o Pulso cobre a tela e pede
 * a digital/rosto ao abrir e sempre que o app volta do segundo plano.
 *
 * Só trança quando há sessão de verdade (logado no servidor). Na tela de entrada
 * e na demonstração não aparece. Se a biometria falhar ou o aparelho não tiver,
 * nunca prende o dono para fora — o app segue funcionando.
 */

import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, type AppStateStatus } from 'react-native';

import { autenticar, biometriaDisponivel, biometriaLigada } from '@/lib/biometria';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';
import { Heartbeat } from './heartbeat';

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { logado, fonte } = usePulso();
  const protegido = logado && fonte === 'servidor';

  const [bloqueado, setBloqueado] = useState(false);
  const [tentando, setTentando] = useState(false);
  const estadoApp = useRef<AppStateStatus>(AppState.currentState);

  // pede a biometria; libera só se passar
  async function pedir() {
    setTentando(true);
    const ok = await autenticar();
    setTentando(false);
    if (ok) setBloqueado(false);
  }

  // ao abrir (com sessão): se a trava está ligada e o aparelho tem biometria, tranca e pede
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!protegido) {
        setBloqueado(false);
        return;
      }
      if ((await biometriaLigada()) && (await biometriaDisponivel())) {
        if (!vivo) return;
        setBloqueado(true);
        await pedir();
      }
    })();
    return () => {
      vivo = false;
    };
  }, [protegido]);

  // ao voltar do segundo plano, tranca de novo
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (proximo) => {
      const voltou = estadoApp.current.match(/inactive|background/) && proximo === 'active';
      estadoApp.current = proximo;
      if (voltou && protegido && (await biometriaLigada()) && (await biometriaDisponivel())) {
        setBloqueado(true);
        await pedir();
      }
    });
    return () => sub.remove();
  }, [protegido]);

  return (
    <View style={styles.raiz}>
      {children}
      {bloqueado && (
        <View style={styles.tampa}>
          <Heartbeat width={64} height={22} />
          <Text style={styles.marca}>Pulso</Text>
          <Text style={styles.frase}>Toque para desbloquear com biometria</Text>
          <Pressable
            onPress={pedir}
            disabled={tentando}
            style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
          >
            <Text style={styles.botaoTexto}>{tentando ? 'Aguardando…' : 'Desbloquear'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
  tampa: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.mata,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  marca: { fontFamily: fonts.display, fontSize: 28, color: colors.papel, letterSpacing: -0.5 },
  frase: {
    fontFamily: fonts.corpo,
    fontSize: 14,
    color: 'rgba(245,244,242,0.7)',
    textAlign: 'center',
    marginBottom: 8,
  },
  botao: {
    backgroundColor: colors.vivo,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 32,
  },
  pressionado: { opacity: 0.7 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#06231A' },
});
