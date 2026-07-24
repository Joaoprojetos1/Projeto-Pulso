/**
 * "Resumo para o contador": vira o retrato do caixa numa imagem limpa e abre o
 * compartilhar do celular (WhatsApp, e-mail, salvar…). Serve pro dono passar a
 * situação pro contador sem tirar print torto.
 *
 * A imagem é montada aqui a partir dos números que JÁ vieram prontos do servidor
 * (o app não calcula nada). O cartão fica fora da tela e só é capturado quando o
 * dono aciona o item na Conta (handle imperativo `gerar()`).
 */

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { Heartbeat } from '@/components/heartbeat';
import { brl, brlInteiro, dataBR, dias, pct, rotuloFact, valorFact } from '@/lib/format';
import { toqueLeve } from '@/lib/haptic';
import { colors, fonts } from '@/theme';

export interface ResumoContador {
  nome: string;
  data: string;
  saldoHoje: number | null;
  caixa30: number | null;
  zeroOn: string | null;
  saudavel: boolean;
  ciclo: number | null;
  margem: number | null;
  receita: number | null;
  estagio: string | null;
  estagioCor: string;
  /** Avisos ativos, com os facts abertos ("de onde vem esse número"). */
  alertas: Array<{ titulo: string; facts: Record<string, unknown> }>;
  /** Selo de demonstração, quando o retrato é fictício. */
  demo?: boolean;
}

export interface EnviarContadorHandle {
  gerar: () => Promise<void>;
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemRotulo}>{rotulo}</Text>
      <Text style={styles.itemValor}>{valor}</Text>
    </View>
  );
}

/**
 * Renderiza o cartão (fora da tela) e expõe `gerar()` para capturar + compartilhar.
 * Não desenha botão: quem aciona é a tela Conta.
 */
export const EnviarContadorCard = forwardRef<EnviarContadorHandle, { resumo: ResumoContador }>(
  function EnviarContadorCard({ resumo }, ref) {
    const cartaoRef = useRef<View>(null);
    const [ocupado, setOcupado] = useState(false);

    useImperativeHandle(ref, () => ({
      async gerar() {
        if (ocupado) return;
        toqueLeve();
        setOcupado(true);
        try {
          const uri = await captureRef(cartaoRef, { format: 'png', quality: 1 });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'image/png',
              dialogTitle: 'Resumo para o contador',
            });
          }
        } catch {
          // compartilhar cancelado ou indisponível: sem alarde
        } finally {
          setOcupado(false);
        }
      },
    }));

    return (
      <View style={styles.foraDaTela} pointerEvents="none">
        <View ref={cartaoRef} collapsable={false} style={styles.cartao}>
          <View style={styles.cartaoTopo}>
            <Text style={styles.cartaoMarca}>Pulso</Text>
            <Heartbeat width={44} height={15} />
          </View>
          <Text style={styles.cartaoNome} numberOfLines={1}>{resumo.nome}</Text>
          <Text style={styles.cartaoData}>Resumo de {dataBR(resumo.data)}</Text>
          {resumo.demo && <Text style={styles.demo}>DEMONSTRAÇÃO · DADOS FICTÍCIOS</Text>}

          {resumo.estagio && (
            <View style={[styles.estagio, { backgroundColor: resumo.estagioCor }]}>
              <Text style={styles.estagioTexto}>{resumo.estagio}</Text>
            </View>
          )}

          <View style={styles.destaque}>
            <Text style={styles.destaqueRotulo}>CAIXA PROJETADO · 30 DIAS</Text>
            <Text style={styles.destaqueValor}>
              {resumo.caixa30 !== null ? brlInteiro(resumo.caixa30) : '·'}
            </Text>
            <Text style={styles.destaqueSub}>
              {resumo.saudavel
                ? `Saudável · hoje em caixa ${resumo.saldoHoje !== null ? brl(resumo.saldoHoje) : '·'}`
                : `Risco de zerar em ${resumo.zeroOn ? dataBR(resumo.zeroOn) : '·'} · hoje ${resumo.saldoHoje !== null ? brl(resumo.saldoHoje) : '·'}`}
            </Text>
          </View>

          <View style={styles.grade}>
            <Item rotulo="Dinheiro preso (ciclo)" valor={resumo.ciclo !== null ? dias(resumo.ciclo) : '·'} />
            <Item rotulo="O que sobra (margem)" valor={resumo.margem !== null ? pct(resumo.margem) : '·'} />
            <Item rotulo="Faturou no mês" valor={resumo.receita !== null ? brl(resumo.receita) : '·'} />
          </View>

          {resumo.alertas.length > 0 && (
            <View style={styles.avisos}>
              <Text style={styles.avisosRotulo}>AVISOS ATIVOS · DE ONDE VEM O NÚMERO</Text>
              {resumo.alertas.map((a, i) => (
                <View key={i} style={styles.aviso}>
                  <Text style={styles.avisoTitulo}>{a.titulo}</Text>
                  {Object.entries(a.facts).map(([chave, valor]) => (
                    <View key={chave} style={styles.avisoLinha}>
                      <Text style={styles.avisoChave}>{rotuloFact(chave)}</Text>
                      <Text style={styles.avisoValor}>{valorFact(chave, valor)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.rodape}>
            Números calculados pelo Pulso, nunca estimados. pulso-site.onrender.com
          </Text>
        </View>
      </View>
    );
  },
);

const LARGURA = 360;

const styles = StyleSheet.create({
  // posiciona o cartão fora da tela; ele é renderizado (para o view-shot capturar)
  // mas o usuário nunca o vê diretamente
  foraDaTela: { position: 'absolute', left: -9999, top: 0 },
  cartao: {
    width: LARGURA,
    backgroundColor: colors.papel,
    padding: 24,
    gap: 6,
  },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cartaoMarca: { fontFamily: fonts.display, fontSize: 22, color: colors.tinta, letterSpacing: -0.4 },
  cartaoNome: { fontFamily: fonts.display, fontSize: 18, color: colors.tinta, marginTop: 8 },
  cartaoData: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  demo: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.alerta, marginTop: 4 },

  estagio: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8 },
  estagioTexto: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.papel },

  destaque: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  destaqueRotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  destaqueValor: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.tinta,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  destaqueSub: { fontFamily: fonts.corpo, fontSize: 13, color: colors.cinza, marginTop: 4 },

  grade: { flexDirection: 'row', gap: 8, marginTop: 12 },
  item: {
    flex: 1,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  itemRotulo: { fontFamily: fonts.corpo, fontSize: 11, color: colors.cinza },
  itemValor: {
    fontFamily: fonts.displayMedio,
    fontSize: 16,
    color: colors.tinta,
    fontVariant: ['tabular-nums'],
  },

  avisos: { marginTop: 12, gap: 8 },
  avisosRotulo: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.cinza },
  aviso: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    padding: 12,
    gap: 3,
  },
  avisoTitulo: { fontFamily: fonts.corpoForte, fontSize: 13, color: colors.tinta, marginBottom: 2 },
  avisoLinha: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  avisoChave: { fontFamily: fonts.corpo, fontSize: 11.5, color: colors.cinza, flexShrink: 1 },
  avisoValor: { fontFamily: fonts.displayMedio, fontSize: 11.5, color: colors.tinta, fontVariant: ['tabular-nums'] },

  rodape: { fontFamily: fonts.corpo, fontSize: 11, color: colors.cinza, marginTop: 16, lineHeight: 15 },
});
