/**
 * Tema do app — marca Pulso.
 *
 * A fonte da verdade dos tokens é `@pulso/tokens` (ver packages/tokens/DESIGN.md
 * e o board em packages/tokens/design-system.html). Aqui os valores são
 * ESPELHADOS de lá com os nomes que as telas do app já usam — se um valor mudar
 * nos tokens, atualize também aqui. (Espelhamos em vez de importar para não
 * exigir configuração de monorepo no Metro; a fonte canônica continua sendo
 * @pulso/tokens.)
 *
 * O app é burro: zero lógica financeira. Isto aqui é só aparência.
 *
 * Fontes: Manrope (grotesca sobria e encorpada) nos titulos e Figtree no corpo.
 * IBM Plex Mono segue nos dados/rotulos. Fonte unica dos nomes: packages/tokens.
 */

export const colors = {
  mata: '#37373F', // escuro do sistema (era o verde-mata)
  vivo: '#23C883', // o pulso, positivo — único ponto de cor viva
  papel: '#F5F4F2', // fundo do app
  tinta: '#2A2A31', // texto forte
  cinza: '#838993', // secundário, rótulos
  linha: '#E0DEDA', // bordas, hairlines
  alerta: '#E39A26', // atenção (severidade média)
  critico: '#D8503F', // só risco real de caixa
  branco: '#FFFFFF',
  okEscuro: '#158556', // verde legível sobre fundo claro
  papelSobreMata: '#C7CBD1', // texto claro sobre o escuro do sistema
  rotuloSobreMata: '#9BA0A9', // rótulo/secundário sobre o escuro do sistema
} as const;

export const fonts = {
  display: 'Manrope_700Bold',
  displayBlack: 'Manrope_800ExtraBold', // peso mais forte para o número herói
  displayMedio: 'Manrope_600SemiBold',
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
