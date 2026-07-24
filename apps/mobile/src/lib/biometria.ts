/**
 * Trava do app por biometria (digital / rosto).
 *
 * É opcional e mora no aparelho: o dono liga em Conta e, a partir daí, o Pulso
 * pede a digital ou o rosto ao abrir. Como é dinheiro na tela, faz sentido ter
 * essa camada extra — mas nunca é obrigatória e nunca depende do servidor.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const CHAVE = 'pulso.biometria';

/** O aparelho tem leitor de biometria E o dono já cadastrou uma? */
export async function biometriaDisponivel(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const temHardware = await LocalAuthentication.hasHardwareAsync();
    const cadastrada = await LocalAuthentication.isEnrolledAsync();
    return temHardware && cadastrada;
  } catch {
    return false;
  }
}

/** O dono ligou a trava? */
export async function biometriaLigada(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CHAVE)) === '1';
  } catch {
    return false;
  }
}

/** Liga ou desliga a trava. */
export async function definirBiometria(ligada: boolean): Promise<void> {
  try {
    if (ligada) await AsyncStorage.setItem(CHAVE, '1');
    else await AsyncStorage.removeItem(CHAVE);
  } catch {
    // preferência é conforto; nunca pode quebrar o app
  }
}

/** Pede a digital/rosto. Retorna true se liberou. */
export async function autenticar(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquear o Pulso',
      cancelLabel: 'Cancelar',
      disableDeviceFallback: false,
    });
    return r.success;
  } catch {
    return false;
  }
}
