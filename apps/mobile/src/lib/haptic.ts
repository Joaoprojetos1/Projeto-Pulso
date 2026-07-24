/**
 * Vibração leve (háptico). Um toque físico sutil confirma ações importantes —
 * o dono sente que "aconteceu" sem precisar olhar.
 *
 * Seguro por natureza: não faz nada na web nem em quem não tem o motor de
 * vibração, e nunca deixa um erro de háptico atrapalhar a ação de verdade.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Toque leve — confirmação comum (abrir alerta, tocar num botão principal). */
export function toqueLeve(): void {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Toque de sucesso — algo foi concluído (graduar conta, salvar, marcar feito). */
export function toqueSucesso(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Toque de aviso — atenção a algo sério (erro, ação que falhou). */
export function toqueAviso(): void {
  if (Platform.OS === 'web') return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
