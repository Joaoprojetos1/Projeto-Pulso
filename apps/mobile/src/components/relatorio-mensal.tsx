/**
 * Relatório mensal — um documento por segmento para o dono baixar e apresentar
 * numa reunião com a equipe. Capa com marca e mês, estágio + fôlego, os
 * indicadores universais e os do segmento, um gráfico de barras da série mensal,
 * os alertas do período, a leitura da IA e a pontuação do diagnóstico de gestão.
 *
 * O app é burro: TODOS os números já vieram prontos do servidor. Aqui só
 * organizamos o `RelatorioMensalData` e mandamos gerar um PDF de verdade.
 *
 * Como vira PDF: o layout é montado em HTML (lib/relatorio-html.ts) e o
 * expo-print gera um .pdf vetorial, multipágina e com texto selecionável — bem
 * melhor que a imagem PNG antiga (react-native-view-shot). Por isso este
 * componente não desenha nada na tela; ele só expõe o handle `gerar()`.
 * Na web (demo), o expo-print abre o diálogo de impressão do navegador, onde o
 * usuário escolhe "Salvar como PDF".
 */

import { forwardRef, useImperativeHandle, useState } from 'react';
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { toqueLeve } from '@/lib/haptic';
import { relatorioHtml } from '@/lib/relatorio-html';
import type { SegmentIndicatorView } from '@/lib/segmentos';

export interface RelatorioSerie {
  titulo: string;
  barras: { mes: string; valor: number }[];
}

export interface RelatorioMensalData {
  nome: string;
  mesRef: string; // já formatado: "julho 2026" ou uma data
  demo?: boolean;
  estagio: string | null;
  estagioCor: string;
  saldoHoje: number | null;
  caixa30: number | null;
  /** dias até o caixa apertar (null = não zera no horizonte → fôlego saudável). */
  folegoDias: number | null;
  universais: { rotulo: string; valor: string; tendencia: 'up' | 'down' | null }[];
  segmentoLabel: string | null;
  segmentoIndicadores: SegmentIndicatorView[];
  serie: RelatorioSerie | null;
  alertas: { titulo: string; severidade: 'ok' | 'warn' | 'critical' }[];
  leituraIA: string | null;
  gestao: { nota: number; frageis: string[] } | null;
}

export interface RelatorioMensalHandle {
  gerar: () => Promise<void>;
}

/**
 * Não renderiza UI: só expõe `gerar()` para montar o HTML e emitir o PDF.
 * Quem aciona é a aba Relatórios ("Baixar relatório do mês").
 */
export const RelatorioMensalCard = forwardRef<RelatorioMensalHandle, { data: RelatorioMensalData }>(
  function RelatorioMensalCard({ data }, ref) {
    const [ocupado, setOcupado] = useState(false);

    useImperativeHandle(ref, () => ({
      async gerar() {
        if (ocupado) return;
        toqueLeve();
        setOcupado(true);
        try {
          const html = relatorioHtml(data);
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
              dialogTitle: `Relatório do mês · ${data.nome}`,
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
