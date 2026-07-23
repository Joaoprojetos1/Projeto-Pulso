/**
 * MarkdownLite — renderiza **negrito** e listas simples (-, *, 1.) sem lib
 * pesada. A resposta da IA vem com markdown; sem isto, os asteriscos aparecem
 * crus no balão (refinamento UX B7). Só o essencial: negrito e listas.
 */

import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { fonts } from '@/theme';

/** Quebra o texto em pedaços, transformando **x** em Text em negrito. */
function comNegrito(texto: string, style: StyleProp<TextStyle>, boldFamily: string): ReactNode {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g);
  return partes.map((p, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(p);
    if (m) {
      return (
        <Text key={i} style={[style, { fontFamily: boldFamily }]}>
          {m[1]}
        </Text>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export interface MarkdownLiteProps {
  texto: string;
  style: StyleProp<TextStyle>;
  /** família do negrito (padrão: corpo semibold). */
  boldFamily?: string;
}

export function MarkdownLite({ texto, style, boldFamily = fonts.corpoForte }: MarkdownLiteProps) {
  const linhas = texto.split('\n');
  return (
    <View>
      {linhas.map((linha, i) => {
        const bullet = /^\s*[-*]\s+(.*)$/.exec(linha);
        const numerada = /^\s*(\d+)\.\s+(.*)$/.exec(linha);
        if (bullet) {
          return (
            <View key={i} style={styles.item}>
              <Text style={style}>{'•  '}</Text>
              <Text style={[style, styles.corpo]}>{comNegrito(bullet[1], style, boldFamily)}</Text>
            </View>
          );
        }
        if (numerada) {
          return (
            <View key={i} style={styles.item}>
              <Text style={style}>{numerada[1] + '.  '}</Text>
              <Text style={[style, styles.corpo]}>{comNegrito(numerada[2], style, boldFamily)}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={style}>
            {comNegrito(linha, style, boldFamily)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'flex-start' },
  corpo: { flex: 1 },
});
