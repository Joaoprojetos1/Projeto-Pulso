/**
 * Monta o HTML do RELATÓRIO MENSAL para virar um PDF de verdade (expo-print).
 *
 * O app é burro: NÃO calcula nada aqui. Recebe o mesmo `RelatorioMensalData` que
 * o servidor já deixou pronto (montado em lib/relatorio.ts) e só o desenha em
 * HTML para o expo-print transformar num .pdf vetorial, multipágina e com texto
 * selecionável — melhor que a imagem PNG antiga do view-shot.
 *
 * As cores vêm do tema da marca (fonte única: theme.ts espelha @pulso/tokens).
 * As fontes são a pilha do sistema: no PDF o que carrega a marca é cor + layout,
 * e a pilha do sistema imprime nítida e sem depender de rede no aparelho.
 */

import type { RelatorioMensalData } from '@/components/relatorio-mensal';
import { brl, brlInteiro } from '@/lib/format';
import { colors } from '@/theme';

const HORIZONTE = 90; // a barra de fôlego vai de 0 a 90 dias

const SEV_COR: Record<'ok' | 'warn' | 'critical', string> = {
  ok: colors.vivo,
  warn: colors.alerta,
  critical: colors.critico,
};

/** '2026-07' → 'jul' para os rótulos do gráfico de barras. */
function mesCurto(m: string): string {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mm = Number(m.split('-')[1]);
  return nomes[mm - 1] ?? m;
}

/** Escapa texto para não quebrar o HTML (nome da empresa, leitura da IA, rótulos). */
function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pequeno traçado de batimento (ECG) para carregar a marca no topo. */
const ECG = `<svg width="52" height="18" viewBox="0 0 52 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M1 9 H14 L18 3 L23 15 L28 9 H37 L40 5 L43 13 L46 9 H51"
    stroke="${colors.vivo}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function relatorioHtml(data: RelatorioMensalData): string {
  const saudavel = data.folegoDias === null;
  const folegoFrac = saudavel ? 1 : Math.max(0.04, Math.min(1, data.folegoDias! / HORIZONTE));
  const folegoPct = Math.round(folegoFrac * 100);
  const folegoCor = saudavel ? colors.vivo : colors.critico;

  const temSerie = !!data.serie && data.serie.barras.length > 1;
  const serieMax = temSerie ? Math.max(...data.serie!.barras.map((b) => b.valor), 1) : 1;

  const universaisHtml = data.universais.length
    ? `<div class="secao">Indicadores do caixa</div>
       <div class="grade">
         ${data.universais
           .map(
             (u) => `<div class="celula">
               <div class="cel-rot">${esc(u.rotulo)}</div>
               <div class="cel-val">${esc(u.valor)}${
                 u.tendencia ? `<span class="tend">${u.tendencia === 'up' ? '▲' : '▼'}</span>` : ''
               }</div>
             </div>`,
           )
           .join('')}
       </div>`
    : '';

  const segmentoHtml = data.segmentoIndicadores.length
    ? `<div class="secao">Indicadores do ${esc((data.segmentoLabel ?? 'segmento').toLowerCase())}</div>
       <div class="lista">
         ${data.segmentoIndicadores
           .map(
             (s) => `<div class="seg-linha">
               <span class="seg-rot">${esc(s.label)}</span>
               <span class="seg-val">${esc(s.valor)}</span>
             </div>`,
           )
           .join('')}
       </div>`
    : '';

  const graficoHtml = temSerie
    ? `<div class="secao">${esc(data.serie!.titulo)}</div>
       <div class="grafico">
         ${data.serie!.barras
           .map((b) => {
             const h = Math.max(4, Math.round((b.valor / serieMax) * 90));
             return `<div class="col">
               <div class="barra-val">${esc(brlInteiro(b.valor).replace('R$ ', ''))}</div>
               <div class="barra" style="height:${h}px"></div>
               <div class="barra-mes">${esc(mesCurto(b.mes))}</div>
             </div>`;
           })
           .join('')}
       </div>`
    : '';

  const leituraHtml = data.leituraIA
    ? `<div class="leitura">
         <div class="leitura-rot">A leitura do Pulso</div>
         <div class="leitura-txt">${esc(data.leituraIA)}</div>
       </div>`
    : '';

  const alertasHtml = data.alertas.length
    ? `<div class="secao">Avisos do período</div>
       ${data.alertas
         .map(
           (a) => `<div class="alerta">
             <span class="ponto" style="background:${SEV_COR[a.severidade]}"></span>
             <span class="alerta-txt">${esc(a.titulo)}</span>
           </div>`,
         )
         .join('')}`
    : '';

  const gestaoHtml = data.gestao
    ? `<div class="gestao">
         <div class="gestao-rot">Diagnóstico de gestão</div>
         <div class="gestao-nota">${data.gestao.nota}<span class="gestao-de"> / 100</span></div>
         ${
           data.gestao.frageis.length
             ? `<div class="gestao-fraco">Mais frágil: ${esc(data.gestao.frageis.join(' · '))}</div>`
             : ''
         }
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @page { margin: 32px; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: ${colors.tinta};
    background: ${colors.papel};
    font-size: 13px;
    line-height: 1.45;
  }
  .topo { display: flex; align-items: center; justify-content: space-between; }
  .marca { font-size: 26px; font-weight: 800; letter-spacing: -0.6px; color: ${colors.tinta}; }
  .nome { font-size: 22px; font-weight: 800; letter-spacing: -0.4px; margin-top: 14px; }
  .subcapa { font-size: 13px; color: ${colors.cinza}; margin-top: 2px; }
  .demo { font-size: 10px; letter-spacing: 1px; color: ${colors.alerta}; font-weight: 600; margin-top: 6px; }

  .estagio-linha { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
  .estagio-tag { border-radius: 8px; padding: 4px 10px; font-size: 10px; letter-spacing: 1px; font-weight: 600; color: ${colors.papel}; }
  .folego-rot { font-size: 13px; font-weight: 600; }
  .folego-fundo { height: 9px; border-radius: 5px; background: ${colors.linha}; margin-top: 7px; overflow: hidden; }
  .folego-cheio { height: 9px; border-radius: 5px; }

  .destaque { background: ${colors.branco}; border: 1px solid ${colors.linha}; border-radius: 14px; padding: 16px; margin-top: 14px; }
  .dest-rot { font-size: 10px; letter-spacing: 1.2px; color: ${colors.cinza}; font-weight: 600; }
  .dest-val { font-size: 34px; font-weight: 800; letter-spacing: -0.8px; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .dest-sub { font-size: 13px; color: ${colors.cinza}; margin-top: 4px; }

  .secao { font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase; color: ${colors.cinza}; font-weight: 600; margin-top: 20px; }
  .grade { display: flex; gap: 8px; margin-top: 8px; }
  .celula { flex: 1; background: ${colors.branco}; border: 1px solid ${colors.linha}; border-radius: 12px; padding: 12px; }
  .cel-rot { font-size: 11px; color: ${colors.cinza}; }
  .cel-val { font-size: 17px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .tend { font-size: 11px; color: ${colors.cinza}; margin-left: 4px; }

  .lista { background: ${colors.branco}; border: 1px solid ${colors.linha}; border-radius: 12px; margin-top: 8px; overflow: hidden; }
  .seg-linha { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; border-bottom: 1px solid ${colors.linha}; }
  .seg-linha:last-child { border-bottom: none; }
  .seg-rot { font-size: 13.5px; font-weight: 500; }
  .seg-val { font-size: 14.5px; font-weight: 600; font-variant-numeric: tabular-nums; }

  .grafico { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; margin-top: 12px; height: 130px; padding-top: 16px; }
  .col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; }
  .barra-val { font-size: 8.5px; color: ${colors.cinza}; }
  .barra { width: 70%; background: ${colors.vivo}; border-radius: 4px; }
  .barra-mes { font-size: 10px; color: ${colors.cinza}; }

  .leitura { background: ${colors.mata}; border-radius: 14px; padding: 16px; margin-top: 18px; }
  .leitura-rot { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: ${colors.rotuloSobreMata}; font-weight: 600; }
  .leitura-txt { font-size: 14px; line-height: 1.5; color: ${colors.papelSobreMata}; margin-top: 6px; }

  .alerta { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
  .ponto { width: 8px; height: 8px; border-radius: 4px; display: inline-block; }
  .alerta-txt { font-size: 13px; font-weight: 500; }

  .gestao { background: ${colors.branco}; border: 1px solid ${colors.linha}; border-radius: 14px; padding: 16px; margin-top: 18px; }
  .gestao-rot { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: ${colors.cinza}; font-weight: 600; }
  .gestao-nota { font-size: 32px; font-weight: 800; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .gestao-de { font-size: 15px; font-weight: 600; color: ${colors.cinza}; }
  .gestao-fraco { font-size: 13px; font-weight: 500; margin-top: 2px; }

  .rodape { font-size: 11px; color: ${colors.cinza}; margin-top: 22px; padding-top: 14px; border-top: 1px solid ${colors.linha}; }
</style>
</head>
<body>
  <div class="topo">
    <div class="marca">Pulso</div>
    ${ECG}
  </div>
  <div class="nome">${esc(data.nome)}</div>
  <div class="subcapa">Relatório do mês · ${esc(data.mesRef)}${
    data.segmentoLabel ? ` · ${esc(data.segmentoLabel)}` : ''
  }</div>
  ${data.demo ? '<div class="demo">DEMONSTRAÇÃO · DADOS FICTÍCIOS</div>' : ''}

  ${
    data.estagio
      ? `<div class="estagio-linha">
           <span class="estagio-tag" style="background:${data.estagioCor}">${esc(data.estagio)}</span>
           <span class="folego-rot">${saudavel ? 'Fôlego saudável' : `Fôlego: ${data.folegoDias} dias`}</span>
         </div>`
      : ''
  }
  <div class="folego-fundo"><div class="folego-cheio" style="width:${folegoPct}%;background:${folegoCor}"></div></div>

  <div class="destaque">
    <div class="dest-rot">CAIXA PROJETADO · 30 DIAS</div>
    <div class="dest-val">${data.caixa30 !== null ? esc(brlInteiro(data.caixa30)) : '·'}</div>
    <div class="dest-sub">Hoje em caixa: ${data.saldoHoje !== null ? esc(brl(data.saldoHoje)) : '·'}</div>
  </div>

  ${universaisHtml}
  ${segmentoHtml}
  ${graficoHtml}
  ${leituraHtml}
  ${alertasHtml}
  ${gestaoHtml}

  <div class="rodape">Números calculados pelo Pulso, nunca estimados. pulso-site.onrender.com</div>
</body>
</html>`;
}
