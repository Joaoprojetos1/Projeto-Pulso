/**
 * Apresentação do estágio do diagnóstico (saudavel..uti).
 *
 * Só aparência: o estágio é CALCULADO no core/servidor. Aqui apenas mapeamos
 * para cor e rótulo. Nenhuma regra financeira mora no app.
 */

import type { DiagnosisStage } from './api';
import { colors } from '@/theme';

export const estagioCor: Record<DiagnosisStage, string> = {
  saudavel: colors.okEscuro,
  atencao: colors.alerta,
  pressao: colors.alerta,
  critico: colors.critico,
  uti: colors.critico,
};

export const estagioRotulo: Record<DiagnosisStage, string> = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  pressao: 'Pressão',
  critico: 'Crítico',
  uti: 'UTI',
};
