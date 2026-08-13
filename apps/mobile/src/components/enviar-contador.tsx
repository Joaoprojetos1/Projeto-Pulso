/**
 * "Resumo para o contador": vira o retrato do caixa num PDF limpo e abre o
 * compartilhar do celular (WhatsApp, e-mail, salvar…). Serve pro dono passar a
 * situação pro contador sem tirar print torto.
 *
 * Os números JÁ vieram prontos do servidor (o app não calcula nada). O layout é
 * montado em HTML (lib/contador-html.ts) e o expo-print gera um .pdf de verdade,
 * com texto selecionável — melhor que a imagem PNG antiga (react-native-view-shot).
 * Este componente não desenha nada: só expõe o handle imperativo `gerar()`, que a
 * tela Conta aciona. Na web (demo) o expo-print abre o diálogo de impressão.
 */

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { toqueLeve } from '@/lib/haptic';
import { contadorHtml } from '@/lib/contador-html';

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

/**
 * Não renderiza UI: só expõe `gerar()` para montar o HTML e emitir o PDF.
 * Quem aciona é a tela Conta.
 */
export const EnviarContadorCard = forwardRef<EnviarContadorHandle, { resumo: ResumoContador }>(
  function EnviarContadorCard({ resumo }, ref) {
    const [ocupado, setOcupado] = useState(false);

    useImperativeHandle(ref, () => ({
      async gerar() {
        if (ocupado) return;
        toqueLeve();
        setOcupado(true);
        try {
          const html = contadorHtml(resumo);
          if (Platform.OS === 'web') {
            // Na web não dá para gerar arquivo local: abre o diálogo de impressão
            // do navegador (o usuário escolhe "Salvar como PDF").
            await Print.printAsync({ html });
            return;
          }
          const { uri } = await Print.printToFileAsync({ html });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              UTI: 'com.adobe.pdf',
              dialogTitle: 'Resumo para o contador',
            });
          }
        } catch {
          // impressão/compartilhamento cancelado ou indisponível: sem alarde
        } finally {
          setOcupado(false);
        }
      },
    }));

    return null;
  },
);
