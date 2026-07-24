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
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { PulsoProvider } from '@/lib/pulso-context';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.papel },
          // telas entram deslizando de leve (sensação de app vivo, não estático)
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="configurar" />
        <Stack.Screen name="historico" />
        <Stack.Screen name="simular" />
        <Stack.Screen name="admin/empresa/[id]" />
        <Stack.Screen name="admin/planos" />
        <Stack.Screen name="admin/leads" />
        <Stack.Screen name="admin/ia" />
        <Stack.Screen name="admin/saude" />
        <Stack.Screen
          name="alerta/[index]"
          // o alerta sobe como um painel, deslizando de baixo
          options={{ presentation: 'modal', animation: 'slide_from_bottom', headerShown: false }}
        />
      </Stack>
    </PulsoProvider>
  );
}
