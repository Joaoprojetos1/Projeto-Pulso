/**
 * IVO — design tokens.
 * Fonte ÚNICA de verdade. App, site e docs derivam daqui.
 *
 * Regra da marca: estrutura sóbria (cinzas neutros) + o verde do check como
 * acento e sinal (função, não decoração). Se o verde não está sinalizando
 * nada, use cinza.
 */

export const color = {
  // --- estrutura: cinzas sóbrios ---
  letras: '#37373F', // texto principal, wordmark em fundo claro, superfície escura
  descritor: '#838993', // texto secundário, rótulos, descritor da marca
  tinta: '#2A2A31', // texto forte
  papel: '#F5F4F2', // fundo do app
  branco: '#FFFFFF',
  linha: '#E0DEDA', // bordas, hairlines

  // --- acento e sinal: o check do IVO ---
  acento: '#0F7A69', // verde de marca sobre fundo CLARO: check, ação principal, positivo
  acentoClaro: '#3FBFA6', // verde de marca sobre fundo ESCURO; nunca como texto em fundo claro
  alerta: '#E39A26', // severidade média (não usar como texto pequeno em fundo claro)
  alertaTexto: '#8A5A0B', // atenção quando for TEXTO sobre fundo claro
  critico: '#D8503F', // risco de caixa — uso raríssimo
  criticoTexto: '#B23A2B', // crítico quando for TEXTO pequeno sobre fundo claro
} as const;

/** Mapa semântico. Use ESTES nomes na UI, nunca o hex cru. */
export const semantic = {
  bg: color.papel,
  surface: color.branco,
  surfaceInverse: color.letras,
  textPrimary: color.tinta,
  textSecondary: color.descritor,
  textOnDark: color.papel,
  border: color.linha,
  brand: color.letras,
  accent: color.acento,
  accentOnDark: color.acentoClaro,
  positive: color.acento,
  warning: color.alerta,
  critical: color.critico,
} as const;

/** Severidade -> cor. O motor de regras devolve a severidade; a UI mapeia aqui. */
export const severityColor = {
  ok: color.acento,
  warn: color.alerta,
  critical: color.critico,
} as const;

export const font = {
  // A fonte DEFINITIVA da marca é a Objektiv VF (ainda não licenciada).
  // Enquanto a licença não sai, a substituta provisória é a Manrope.
  // A troca é UMA linha: mude `display` aqui (e o espelho em
  // apps/mobile/src/theme.ts) quando a Objektiv VF chegar.
  display: 'Manrope', // títulos, wordmark — PROVISÓRIA (definitiva: Objektiv VF)
  body: 'Figtree', // corpo
  mono: 'IBM Plex Mono', // rótulos, dados, datas (só no app, uso interno)
} as const;

export const weight = {
  thin: '300', // títulos institucionais
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

/**
 * Escala de espaço VERTICAL (ritmo). Nomes que dizem a INTENÇÃO, não o tamanho.
 *
 * Regra que rege tudo: espaço PEQUENO dentro de um grupo, espaço GRANDE entre
 * grupos. Se dois blocos têm o mesmo espaço entre si que têm dos vizinhos, a
 * hierarquia não existe.
 */
export const space = {
  tight: 8, // entre elementos colados (rótulo e valor, ícone e texto)
  item: 12, // entre itens irmãos de uma mesma lista
  group: 16, // entre blocos relacionados dentro do mesmo grupo
  section: 32, // entre seções distintas da tela
  block: 40, // antes e depois de um bloco herói (cartão principal, folha de formulário)
} as const;

export type ColorToken = keyof typeof color;
export type Severity = keyof typeof severityColor;
