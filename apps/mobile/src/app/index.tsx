/**
 * Porta de entrada ('/'): só decide para onde ir, sem tela própria.
 *
 * Isto RESOLVE de vez o reset de logout: a tela de boas-vindas passou a ter rota
 * própria ('/boas-vindas'), sem dividir o '/' com o painel (que é '/(tabs)'). Antes,
 * os dois disputavam o '/', então sair de dentro das abas caía no próprio painel.
 * Agora o logout manda para '/boas-vindas', que é inequívoco.
 */

import { Redirect, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { PulsoLogo } from '@/components/logo';
import { usePulso } from '@/lib/pulso-context';
import { colors } from '@/theme';

export default function Index() {
  const { logado, restaurando } = usePulso();

  // enquanto verifica a sessão salva na abertura, uma espera curta (não tela branca)
  if (restaurando) {
    return (
      <View style={styles.splash}>
        <PulsoLogo size={40} color={colors.papel} />
        <ActivityIndicator color={colors.papel} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return <Redirect href={(logado ? '/(tabs)' : '/boas-vindas') as Href} />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.mata, alignItems: 'center', justifyContent: 'center' },
});
