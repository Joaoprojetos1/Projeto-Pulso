import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
} from '@expo-google-fonts/figtree';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { BiometricGate } from '@/components/biometric-gate';
import { PulsoProvider, usePulso } from '@/lib/pulso-context';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Guarda de sessão — a ÚNICA autoridade de navegação por login. Vive no topo, sob
 * o provider, então enxerga qualquer rota. Sem sessão, ninguém fica numa rota
 * logada (o logout de qualquer tela cai aqui e volta à porta de entrada); com
 * sessão restaurada na abertura, sai da porta de entrada para o painel. Concentrar
 * aqui evita as corridas de redirecionamentos espalhados pelas telas.
 */
function AuthGate() {
  const { logado, restaurando } = usePulso();
  const segments = useSegments();
  const nav = useRouter();

  useEffect(() => {
    if (restaurando) return;
    const raiz = segments[0] as string | undefined; // undefined = '/', 'boas-vindas' = tela de entrada
    const naEntrada = raiz === undefined || raiz === 'boas-vindas';
    if (!logado && !naEntrada) {
      // sessão encerrada mas ainda numa rota logada: volta à porta de entrada
      nav.replace('/boas-vindas' as Href);
    } else if (logado && raiz === 'boas-vindas') {
      // logado mas parou na tela de entrada: vai para o painel
      nav.replace('/(tabs)');
    }
  }, [logado, restaurando, segments, nav]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Tocar na notificação de alerta abre o app no painel.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as { kind?: string } | undefined;
      if (data?.kind === 'alert') router.navigate('/(tabs)');
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <PulsoProvider>
      <StatusBar style="dark" />
      <BiometricGate>
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.papel },
          // telas entram deslizando de leve (sensação de app vivo, não estático)
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="boas-vindas" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="assinar" />
        <Stack.Screen name="configurar" />
        <Stack.Screen name="historico" />
        <Stack.Screen name="simular" />
        <Stack.Screen name="projecao" />
        <Stack.Screen name="admin/empresa/[id]" />
        <Stack.Screen name="admin/planos" />
        <Stack.Screen name="admin/leads" />
        <Stack.Screen name="admin/ia" />
        <Stack.Screen name="admin/saude" />
        <Stack.Screen
          name="alerta/[index]"
          // o alerta sobe como uma folha, de baixo para cima, e fecha por gesto (arrastar)
          options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true, headerShown: false }}
        />
      </Stack>
      </BiometricGate>
    </PulsoProvider>
  );
}
