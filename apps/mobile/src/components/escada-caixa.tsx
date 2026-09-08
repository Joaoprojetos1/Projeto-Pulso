/**
 * Escada do caixa — o "por que o caixa cai", na tela de detalhe da projeção.
 *
 * Sai do saldo de hoje, desce no que sai (contas do período e custo fixo), sobe
 * no que entra (recebíveis e contas previstas) e fecha no valor projetado. É a
 * leitura de um minuto que a régua do painel (leitura de um segundo) não dá.
 *
 * Substitui o gráfico de linha: a linha mostrava QUE o caixa cai; a escada mostra
 * POR QUE — e é sobre isso que o dono consegue agir.
 *
 * App burro: a composição inteira vem pronta do motor (core/breakdown.ts), e lá
 * um teste garante que a soma dos degraus fecha, ao centavo, com a projeção do
 * cartão. Aqui só se decide largura de barra e cor.
 */

import { StyleSheet, Text, View } from 'react-native';

import type { CashBreakdownJson, CashStepJson } from '@/lib/api';
import { brl } from '@/lib/format';
import { colors, fonts, space } from '@/theme';

/** Rótulo em linguagem de dono para cada degrau (o motor manda só a chave). */
const ROTULO: Record<CashStepJson['key'], { label: string; ajuda: (n: number) => string }> = {
  a_receber: {
    label: 'O que você tem a receber',
    ajuda: (n) => `${n} ${n === 1 ? 'recebimento' : 'recebimentos'} que caem no período`,
  },
  previstas: {
    label: 'Suas contas previstas',
    ajuda: (n) => `${n} ${n === 1 ? 'movimento previsto' : 'movimentos previstos'} que você cadastrou`,
  },
  a_pagar: {
    label: 'O que você tem a pagar',
    ajuda: (n) => `${n} ${n === 1 ? 'conta vence' : 'contas vencem'} no período`,
  },
  custo_fixo: {
    label: 'Seu custo fixo',
    ajuda: () => 'a parte do custo fixo que cai neste período',
  },
};

export function EscadaCaixa({ dados }: { dados: CashBreakdownJson }) {
  // ESCADA de verdade: cada degrau começa onde o anterior parou. Isso é só
  // posicionamento — os valores vêm todos prontos do motor.
  let corrente = dados.openingCents;
  const degraus = dados.steps.map((s) => {
    const antes = corrente;
    corrente += s.deltaCents;
    return { ...s, antes, depois: corrente };
  });

  // escala inclui o ZERO sempre: assim um caixa que vira negativo cruza a linha
  // em vez de sumir da tela.
  const valores = [dados.openingCents, dados.endingCents, ...degraus.flatMap((d) => [d.antes, d.depois])];
  const min = Math.min(0, ...valores);
  const max = Math.max(0, ...valores);
  const span = Math.max(1, max - min);
  const pos = (v: number) => ((v - min) / span) * 100;
  const zero = pos(0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.titulo}>De onde vem esse número</Text>
      <Text style={styles.subtitulo}>
        Do seu saldo de hoje até a projeção de {dados.horizonDays} dias, passo a passo.
      </Text>

      {/* saldo de partida: a base da escada */}
      <Linha
        label="Saldo de hoje"
        ajuda="o que está em conta agora"
        valor={brl(dados.openingCents)}
        barra={
          <Trilho zero={zero}>
            <View
              style={[
                styles.barra,
                styles.barraNeutra,
                { left: `${Math.min(zero, pos(dados.openingCents))}%`, width: `${Math.abs(pos(dados.openingCents) - zero)}%` },
              ]}
            />
          </Trilho>
        }
      />

      {degraus.map((d) => {
        const entra = d.deltaCents > 0;
        const meta = ROTULO[d.key];
        const inicio = Math.min(pos(d.antes), pos(d.depois));
        const fim = Math.max(pos(d.antes), pos(d.depois));
        return (
          <Linha
            key={d.key}
            label={meta.label}
            ajuda={meta.ajuda(d.count)}
            valor={`${entra ? '+' : '−'} ${brl(Math.abs(d.deltaCents))}`}
            corValor={entra ? colors.okEscuro : colors.tinta}
            barra={
              <Trilho zero={zero}>
                {/* o degrau flutua: começa onde o anterior parou */}
                <View
                  style={[
                    styles.barra,
                    {
                      left: `${inicio}%`,
                      width: `${Math.max(1.5, fim - inicio)}%`,
                      // verde só para o que ENTRA (verde é sinal, não decoração);
                      // o que sai fica em cinza, sem virar alarme
                      backgroundColor: entra ? colors.vivo : colors.cinza,
                    },
                  ]}
                />
                {/* fio pontilhado do nível anterior até o degrau, dando o "degrau" */}
                <View style={[styles.ligacao, { left: `${entra ? inicio : fim}%` }]} />
              </Trilho>
            }
          />
        );
      })}

      {/* fecho */}
      <View style={styles.divisor} />
      <Linha
        label={`Projeção em ${dados.horizonDays} dias`}
        ajuda={dados.endingCents < 0 ? 'o caixa não cobre o período' : 'o que deve sobrar'}
        valor={brl(dados.endingCents)}
        destaque
        corValor={dados.endingCents < 0 ? colors.criticoTexto : colors.tinta}
        barra={
          <Trilho zero={zero} alto>
            <View
              style={[
                styles.barra,
                styles.barraFim,
                {
                  left: `${Math.min(zero, pos(dados.endingCents))}%`,
                  width: `${Math.max(1.5, Math.abs(pos(dados.endingCents) - zero))}%`,
                  backgroundColor: dados.endingCents < 0 ? colors.critico : colors.mata,
                },
              ]}
            />
          </Trilho>
        }
      />

      {dados.steps.length === 0 && (
        <Text style={styles.vazio}>
          Ainda não há contas nem custo fixo no período: a projeção repete o seu saldo de hoje.
          Conforme os arquivos entrarem, os degraus aparecem aqui.
        </Text>
      )}
    </View>
  );
}

/**
 * Trilho de um degrau: o espaço onde a barra flutua. A linha do zero só aparece
 * quando o zero está DENTRO da escala (caixa que vira negativo) — em empresa
 * saudável ela seria só ruído na borda.
 */
function Trilho({ zero, alto, children }: { zero: number; alto?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.trilho, alto && styles.trilhoAlto]}>
      {zero > 1 && zero < 99 && <View style={[styles.linhaZero, { left: `${zero}%` }]} />}
      {children}
    </View>
  );
}

function Linha({
  label,
  ajuda,
  valor,
  barra,
  destaque,
  corValor,
}: {
  label: string;
  ajuda: string;
  valor: string;
  barra: React.ReactNode;
  destaque?: boolean;
  corValor?: string;
}) {
  return (
    <View style={styles.linha}>
      <View style={styles.linhaTopo}>
        <Text style={[styles.linhaLabel, destaque && styles.linhaLabelForte]}>{label}</Text>
        <Text style={[styles.linhaValor, destaque && styles.linhaValorForte, corValor ? { color: corValor } : null]}>
          {valor}
        </Text>
      </View>
      {barra}
      <Text style={styles.linhaAjuda}>{ajuda}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.item },
  titulo: { fontFamily: fonts.display, fontSize: 18, color: colors.tinta, letterSpacing: -0.3 },
  subtitulo: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza, marginTop: -6 },

  linha: { gap: 5, marginTop: space.tight },
  linhaTopo: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  linhaLabel: { flex: 1, fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.tinta },
  linhaLabelForte: { fontFamily: fonts.displayMedio, fontSize: 15 },
  linhaValor: { fontFamily: fonts.displayMedio, fontSize: 14.5, color: colors.tinta, fontVariant: ['tabular-nums'] },
  linhaValorForte: { fontSize: 18 },
  linhaAjuda: { fontFamily: fonts.corpo, fontSize: 12, color: colors.cinza },

  trilho: { height: 14, justifyContent: 'center' },
  trilhoAlto: { height: 18 },
  barra: { position: 'absolute', height: 12, borderRadius: 3 },
  barraNeutra: { backgroundColor: colors.cinza, opacity: 0.55 },
  barraFim: { height: 16, borderRadius: 4 },
  // fio fino que liga o nível anterior ao degrau (o "espelho" do degrau)
  ligacao: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.linha },
  linhaZero: { position: 'absolute', top: -2, bottom: -2, width: 1, backgroundColor: colors.cinza, opacity: 0.5 },

  divisor: { height: 1, backgroundColor: colors.linha, marginTop: space.item },
  vazio: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.cinza, marginTop: space.item },
});
