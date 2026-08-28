/**
 * Tema do app — marca IVO.
 *
 * A fonte da verdade dos tokens é `@pulso/tokens` (nome interno do pacote; ver
 * packages/tokens/DESIGN.md e o board em packages/tokens/design-system.html).
 * Aqui os valores são ESPELHADOS de lá com os nomes que as telas do app já
 * usam — se um valor mudar nos tokens, atualize também aqui. (Espelhamos em
 * vez de importar para não exigir configuração de monorepo no Metro; a fonte
 * canônica continua sendo @pulso/tokens.)
 *
 * O app é burro: zero lógica financeira. Isto aqui é só aparência.
 *
 * Fontes: a DEFINITIVA da marca é a Objektiv VF (ainda não licenciada).
 * Manrope é a substituta PROVISÓRIA. A troca é feita SÓ AQUI (nomes de
 * família abaixo) + packages/tokens/src/index.ts, uma linha em cada.
 */

export const colors = {
  mata: '#37373F', // escuro do sistema (letras da marca; nome antigo mantido p/ as telas)
  vivo: '#0F7A69', // acento verde do IVO sobre fundo CLARO (check, ação, positivo)
  vivoSobreEscuro: '#3FBFA6', // acento verde sobre fundo ESCURO; nunca texto em fundo claro
  papel: '#F5F4F2', // fundo do app
  tinta: '#2A2A31', // texto forte
  cinza: '#838993', // secundário, rótulos, descritor
  linha: '#E0DEDA', // bordas, hairlines
  alerta: '#E39A26', // atenção (severidade média) — NÃO usar como texto em fundo claro
  alertaTexto: '#8A5A0B', // atenção quando for TEXTO sobre fundo claro
  critico: '#D8503F', // só risco real de caixa
  criticoTexto: '#B23A2B', // crítico quando for TEXTO pequeno sobre fundo claro
  criticoSobreEscuro: '#FF9C8A', // crítico como texto sobre o escuro do sistema
  branco: '#FFFFFF',
  okEscuro: '#0F7A69', // igual ao acento: verde legível sobre fundo claro
  papelSobreMata: '#C7CBD1', // texto claro sobre o escuro do sistema
  rotuloSobreMata: '#A5AAB3', // rótulo/secundário sobre o escuro do sistema (AA)
} as const;

export const fonts = {
  display: 'Manrope_700Bold',
  displayBlack: 'Manrope_800ExtraBold', // peso mais forte para o número herói
  displayMedio: 'Manrope_600SemiBold',
  corpo: 'Figtree_400Regular',
  corpoMedio: 'Figtree_500Medium',
  corpoForte: 'Figtree_600SemiBold',
  // `mono` NÃO é mais monoespaçada: rótulos/tags em IBM Plex Mono tinham "cara de
  // IA" (refinamento UX A9). Repontada para Manrope semibold — o nome do token
  // fica para não mexer em toda tela; os números seguem alinhados por tabular-nums
  // (fontVariant, independente da família). IBM Plex Mono só p/ uso interno/dev.
  mono: 'Manrope_600SemiBold',
} as const;

/**
 * Escala de espaço VERTICAL (ritmo). Espelhada de packages/tokens. Nomes de
 * INTENÇÃO: use ESTES na UI, nunca um número avulso.
 *
 * Regra: espaço PEQUENO dentro de um grupo, espaço GRANDE entre grupos. Se dois
 * blocos têm o mesmo espaço entre si que têm dos vizinhos, a hierarquia some.
 */
export const space = {
  tight: 8, // rótulo e valor, ícone e texto (elementos colados)
  item: 12, // itens irmãos de uma mesma lista
  group: 16, // blocos relacionados dentro do mesmo grupo
  section: 32, // seções distintas da tela
  block: 40, // antes/depois de um bloco herói (cartão principal, folha de formulário)
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
