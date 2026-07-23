/**
 * MoneyInput — campo de dinheiro com máscara BRL em tempo real.
 *
 * Refinamento UX A2: o dono não sabia se digitou 10 mil ou 100 mil. Aqui o valor
 * é agrupado por milhar enquanto digita (34200 → R$ 34.200), aceita centavos com
 * vírgula (34200,50 → R$ 34.200,50) e normaliza para 2 casas ao sair do campo.
 *
 * REGRA DO PROJETO: dinheiro é sempre centavo inteiro; a conversão é por STRING,
 * nunca parseFloat. `onChangeCents` devolve os centavos (ou null se vazio).
 */

import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

function agrupaMilhar(digitos: string): string {
  const limpo = digitos.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return limpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Texto digitado → "R$ 34.200,50" (agrupa milhar; máx 2 casas; opcional negativo). */
function formata(raw: string, permiteNegativo: boolean): string {
  const negativo = permiteNegativo && raw.trim().startsWith('-');
  const soValidos = raw.replace(/[^\d,]/g, '');
  const primeiraVirgula = soValidos.indexOf(',');
  let corpo: string;
  if (primeiraVirgula !== -1) {
    const inteiro = soValidos.slice(0, primeiraVirgula);
    const dec = soValidos.slice(primeiraVirgula + 1).replace(/,/g, '').slice(0, 2);
    corpo = agrupaMilhar(inteiro) + ',' + dec;
  } else {
    corpo = agrupaMilhar(soValidos);
  }
  if (!corpo || corpo === ',') return negativo ? '-' : '';
  return (negativo ? '-R$ ' : 'R$ ') + corpo;
}

/** "R$ 34.200,50" → 3420050 centavos (por string). null se vazio. */
export function textoParaCents(texto: string, permiteNegativo = false): number | null {
  const negativo = permiteNegativo && texto.trim().startsWith('-');
  const limpo = texto.replace(/[^\d,]/g, '');
  if (!limpo) return null;
  const [inteiro, decRaw = ''] = limpo.split(',');
  const dec = (decRaw + '00').slice(0, 2);
  const cents = Number((inteiro || '0').replace(/\D/g, '')) * 100 + Number(dec || '0');
  return negativo ? -cents : cents;
}

function centsParaTexto(cents: number, permiteNegativo: boolean): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const c = String(abs % 100).padStart(2, '0');
  const corpo = agrupaMilhar(String(reais)) + ',' + c;
  return (neg && permiteNegativo ? '-R$ ' : 'R$ ') + corpo;
}

export interface MoneyInputProps {
  /** valor inicial em centavos (para pré-preencher). */
  valueCents?: number | null;
  onChangeCents: (cents: number | null) => void;
  placeholder?: string;
  permiteNegativo?: boolean;
  style?: StyleProp<TextStyle>;
}

export function MoneyInput({
  valueCents = null,
  onChangeCents,
  placeholder = 'R$ 0,00',
  permiteNegativo = false,
  style,
}: MoneyInputProps) {
  const [texto, setTexto] = useState(() =>
    valueCents != null ? centsParaTexto(valueCents, permiteNegativo) : '',
  );

  // pré-preenche uma vez quando chega um valor inicial (ex.: /me/setup)
  useEffect(() => {
    if (valueCents != null && texto === '') {
      setTexto(centsParaTexto(valueCents, permiteNegativo));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueCents]);

  function aoDigitar(v: string) {
    const formatado = formata(v, permiteNegativo);
    setTexto(formatado);
    onChangeCents(textoParaCents(formatado, permiteNegativo));
  }

  function aoSair() {
    const cents = textoParaCents(texto, permiteNegativo);
    setTexto(cents == null ? '' : centsParaTexto(cents, permiteNegativo));
  }

  return (
    <TextInput
      style={[styles.input, style]}
      value={texto}
      onChangeText={aoDigitar}
      onBlur={aoSair}
      placeholder={placeholder}
      placeholderTextColor={colors.cinza}
      keyboardType="decimal-pad"
      inputMode="decimal"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.tinta,
    fontVariant: ['tabular-nums'],
  },
});
