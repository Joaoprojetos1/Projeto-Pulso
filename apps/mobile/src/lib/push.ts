/**
 * Notificação no celular (push).
 *
 * O app pede permissão, pega o "endereço" deste aparelho (push token do Expo)
 * e o entrega ao servidor ligado à empresa. Quando o motor dispara um alerta
 * sério, o servidor manda a notificação para cá — mesmo com o app fechado.
 *
 * O app continua burro: ele não decide nada, só recebe e mostra.
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerDevice } from './api';

// Com o app aberto, mostra o aviso na tela também (não só na barra).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Prepara as notificações e registra este aparelho para a empresa.
 * Silencioso por natureza: se o dono negar a permissão ou algo falhar,
 * o app segue funcionando normalmente (só não recebe o aviso automático).
 */
export async function registrarParaAvisos(companyId: string): Promise<void> {
  try {
    // emulador/simulador não recebe push de verdade
    if (!Device.isDevice) return;

    // Android precisa de um "canal" para notificações aparecerem
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alertas', {
        name: 'Avisos do Pulso',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#23C883',
      });
    }

    const { status: existente } = await Notifications.getPermissionsAsync();
    let status = existente;
    if (existente !== 'granted') {
      const pedido = await Notifications.requestPermissionsAsync();
      status = pedido.status;
    }
    if (status !== 'granted') return;

    const pid = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      pid ? { projectId: pid } : undefined,
    );

    await registerDevice(companyId, token, Platform.OS);
  } catch {
    // nunca atrapalha o uso do app por causa de push
  }
}
