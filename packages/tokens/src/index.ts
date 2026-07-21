/**
 * Pulso — design tokens.
 * Fonte ÚNICA de verdade. App, site e docs derivam daqui.
 *
 * Regra da fusão: estrutura sóbria (cinzas neutros) + cor viva e sinais
 * exclusivos do Pulso (função, não decoração).
 */

export const color = {
  // --- estrutura: cinzas sóbrios ---
  oaEscuro: '#37373F', // dark do sistema: fundos, botão primário, ícone
  oaClaro: '#838993', // secundário, rótulos
  tinta: '#2A2A31', // texto forte
  papel: '#F5F4F2', // fundo do app
  branco: '#FFFFFF',
  linha: '#E0DEDA', // bordas, hairlines

  // --- vida e sinal: exclusivo do Pulso ---
  vivo: '#23C883', // o pulso — único ponto de cor viva
  vivoEscuro: '#158556', // texto positivo sobre fundo claro
  alerta: '#E39A26', // severidade média
  critico: '#D8503F', // risco de caixa — uso raríssimo
} as const;

/** Mapa semântico. Use ESTES nomes na UI, nunca o hex cru. */
export const semantic = {
  bg: color.papel,
  surface: color.branco,
  surfaceInverse: color.oaEscuro,
  textPrimary: color.tinta,
  textSecondary: color.oaClaro,
  textOnDark: color.papel,
  border: color.linha,
  brand: color.oaEscuro,
  accent: color.vivo,
  positive: color.vivoEscuro,
  warning: color.alerta,
  critical: color.critico,
} as const;

/** Severidade -> cor. O motor de regras devolve a severidade; a UI mapeia aqui. */
export const severityColor = {
  ok: color.vivo,
  warn: color.alerta,
  critical: color.critico,
} as const;

export const font = {
  // Duas famílias sustentam a marca. Manrope (grotesca sobria e encorpada) nos
  // titulos, Figtree no corpo. No SITE ficam so estas duas (labels/numeros usam
  // Figtree com tabular-nums). No APP o mono segue nos dados/rotulos.
  display: 'Manrope', // titulos, wordmark
  body: 'Figtree', // corpo
  mono: 'IBM Plex Mono', // rotulos, dados, datas (so no app)
} as const;

export const weight = {
  thin: '300', // títulos institucionais (herança OA)
  regular: '400',
  medium: '500',
  semibold: '600', // display padrão
  bold: '700', // números
} as const;

/** Escala tipográfica (px). Números sempre com tabular-nums. */
export const type = {
  displayXl: 34,
  displayL: 27,
  displayM: 20,
  numberHero: 30,
  body: 16,
  small: 13,
  micro: 11, // mono/rótulos
} as const;

export const radius = { sm: 2, md: 10, lg: 14, pill: 999 } as const;

/** Grid base 4. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

export type ColorToken = keyof typeof color;
export type Severity = keyof typeof severityColor;
