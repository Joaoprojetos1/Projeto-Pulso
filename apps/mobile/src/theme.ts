/**
 * Tokens da marca Pulso. Fonte: CLAUDE.md + pulso-brand.
 * O app é burro: zero lógica financeira. Isto aqui é só aparência.
 */

export const colors = {
  mata: '#0E2E2A', // primário, fundos de marca
  vivo: '#23C883', // o pulso, positivo
  papel: '#F6F4EE', // fundo
  tinta: '#13221F', // texto
  cinza: '#5F6F6B', // secundário
  linha: '#DCD8CC', // bordas
  alerta: '#E39A26', // atenção
  critico: '#D8503F', // só risco real de caixa
  branco: '#FFFFFF',
  okEscuro: '#158556', // verde legível sobre fundo claro
  papelSobreMata: '#BFD2CB',
  rotuloSobreMata: '#9FB8AF',
} as const;

export const fonts = {
  display: 'Sora_700Bold',
  displayBlack: 'Sora_800ExtraBold',
  displayMedio: 'Sora_600SemiBold',
  corpo: 'Figtree_400Regular',
  corpoMedio: 'Figtree_500Medium',
  corpoForte: 'Figtree_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
} as const;

export type Severity = 'ok' | 'warn' | 'critical';

export const severityColor: Record<Severity, string> = {
  ok: colors.vivo,
  warn: colors.alerta,
  critical: colors.critico,
};

export const severityLabel: Record<Severity, string> = {
  ok: 'Tudo bem',
  warn: 'Atenção',
  critical: 'Crítico',
};
