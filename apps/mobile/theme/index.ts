/**
 * Tema do app — deriva de @pulso/tokens. Não redefina cores aqui;
 * se precisar de uma cor nova, ela nasce em packages/tokens.
 */
import { color, semantic, severityColor, font, weight, radius, space, type } from '@pulso/tokens';

export const theme = {
  color,
  semantic,
  severityColor,
  font,
  weight,
  radius,
  space,
  type,

  // Estilos de texto prontos, já com tabular-nums onde importa.
  text: {
    display: { fontFamily: font.display, fontWeight: weight.semibold as '600', color: semantic.textPrimary },
    displayThin: { fontFamily: font.display, fontWeight: weight.thin as '300', color: semantic.textPrimary },
    number: {
      fontFamily: font.display,
      fontWeight: weight.bold as '700',
      color: semantic.textPrimary,
      fontVariant: ['tabular-nums'] as const,
    },
    body: { fontFamily: font.body, fontWeight: weight.regular as '400', color: semantic.textPrimary },
    label: {
      fontFamily: font.mono,
      fontSize: type.micro,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      color: semantic.textSecondary,
    },
  },
} as const;

export type Theme = typeof theme;
