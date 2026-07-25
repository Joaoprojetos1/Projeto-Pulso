/**
 * Barreira de erro de renderização: se uma tela quebra ao montar, mostra uma
 * tela amigável em vez do "crash branco". O erro é CAPTURADO com stack (nunca
 * engolido em silêncio) — hoje no console do aparelho (visível nos logs do
 * Expo/EAS), pronto para um Sentry no futuro.
 */

import { router } from 'expo-router';
import { Component, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PulsoLogo } from '@/components/logo';
import { colors, fonts, space } from '@/theme';

interface Props {
  children: ReactNode;
}
interface State {
  erro: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: false };

  static getDerivedStateFromError(): State {
    return { erro: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // captura com stack — é o ponto único de registro de erro de renderização
    // eslint-disable-next-line no-console
    console.error('[pulso] erro de renderização', error, info);
  }

  private tentarDeNovo = () => {
    // volta à porta de entrada (rota inequívoca) e re-renderiza
    try {
      router.replace('/');
    } catch {
      // se a navegação não estiver disponível, só re-renderiza
    }
    this.setState({ erro: false });
  };

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <View style={styles.wrap}>
        <PulsoLogo size={34} color={colors.papel} />
        <Text style={styles.titulo}>Algo saiu do lugar</Text>
        <Text style={styles.corpo}>
          Tivemos um probleminha ao montar esta tela. Toque para tentar de novo.
        </Text>
        <Pressable
          onPress={this.tentarDeNovo}
          style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
        >
          <Text style={styles.botaoTexto}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.mata,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.section,
    gap: space.group,
  },
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.papel, letterSpacing: -0.4 },
  corpo: {
    fontFamily: fonts.corpo,
    fontSize: 15,
    lineHeight: 22,
    color: colors.papelSobreMata,
    textAlign: 'center',
    maxWidth: 300,
  },
  botao: {
    backgroundColor: colors.vivo,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
    marginTop: space.tight,
  },
  pressionado: { opacity: 0.85 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: '#06231A' },
});
