/**
 * Monta o HTML do "RESUMO PARA O CONTADOR" para virar um PDF de verdade
 * (expo-print), no lugar da imagem PNG antiga (react-native-view-shot).
 *
 * O app é burro: NÃO calcula nada. Recebe o `ResumoContador` já pronto (os
 * números vêm do servidor) e só desenha em HTML. As cores vêm do tema da marca
 * (fonte única: theme.ts). As fontes são a pilha do sistema — imprime nítido e
 * sem depender de rede no aparelho.
 */

import type { ResumoContador } from '@/components/enviar-contador';
import { brl, brlInteiro, dataBR, dias, pct, rotuloFact, valorFact } from '@/lib/format';
import { colors } from '@/theme';

/** Escapa texto para não quebrar o HTML. */
function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pequeno traçado de batimento (ECG) para carregar a marca no topo. */
const ECG = `<svg width="48" height="16" viewBox="0 0 52 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M1 9 H14 L18 3 L23 15 L28 9 H37 L40 5 L43 13 L46 9 H51"
    stroke="${colors.vivo}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function contadorHtml(r: ResumoContador): string {
  const destaqueSub = r.saudavel
    ? `Saudável · hoje em caixa ${r.saldoHoje !== null ? esc(brl(r.saldoHoje)) : '·'}`
    : `Risco de zerar em ${r.zeroOn ? esc(dataBR(r.zeroOn)) : '·'} · hoje ${
        r.saldoHoje !== null ? esc(brl(r.saldoHoje)) : '·'
      }`;

  const avisosHtml = r.alertas.length
    ? `<div class="secao">Avisos ativos · de onde vem o número</div>
       ${r.alertas
         .map(
           (a) => `<div class="aviso">
             <div class="aviso-titulo">${esc(a.titulo)}</div>
             ${Object.entries(a.facts)
               .map(
                 ([chave, valor]) => `<div class="aviso-linha">
                   <span class="aviso-chave">${esc(rotuloFact(chave))}</span>
                   <span class="aviso-valor">${esc(valorFact(chave, valor))}</span>
                 </div>`,
               )
               .join('')}
           </div>`,
         )
         .join('')}`
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
  .marca { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: ${colors.tinta}; }
  .nome { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; margin-top: 10px; }
  .data { font-size: 13px; color: ${colors.cinza}; margin-top: 2px; }
  .demo { font-size: 10px; letter-spacing: 1px; color: ${colors.alerta}; font-weight: 600; margin-top: 6px; }

  .estagio { display: inline-block; border-radius: 8px; padding: 4px 10px; font-size: 10px; letter-spacing: 1px; font-weight: 600; color: ${colors.papel}; margin-top: 12px; }

  .destaque { background: ${colors.branco}; border: 1px solid ${colors.linha}; border-radius: 14px; padding: 16px; margin-top: 12px; }
  .dest-rot { font-size: 10px; letter-spacing: 1.2px; color: ${colors.cinza}; font-weight: 600; }
  .dest-val { font-size: 32px; font-weight: 800; letter-spacing: -0.7px; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .dest-sub { font-size: 13px; color: ${colors.cinza}; margin-top: 4px; }

  .grade { display: flex; gap: 8px; margin-top: 12px; }
  .item { flex: 1; background: ${colors.branco}; border: 1px solid ${colors.linha}; border-radius: 12px; padding: 12px; }
  .item-rot { font-size: 11px; color: ${colors.cinza}; }
  .item-val { font-size: 17px; font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }

  .secao { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: ${colors.cinza}; font-weight: 600; margin-top: 18px; }
  .aviso { background: ${colors.branco}; border: 1px solid ${colors.linha}; border-radius: 12px; padding: 12px; margin-top: 8px; }
  .aviso-titulo { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  .aviso-linha { display: flex; justify-content: space-between; gap: 12px; margin-top: 2px; }
  .aviso-chave { font-size: 11.5px; color: ${colors.cinza}; }
  .aviso-valor { font-size: 11.5px; font-weight: 600; font-variant-numeric: tabular-nums; }

  .rodape { font-size: 11px; color: ${colors.cinza}; margin-top: 20px; padding-top: 14px; border-top: 1px solid ${colors.linha}; }
</style>
</head>
<body>
  <div class="topo">
    <div class="marca">Pulso</div>
    ${ECG}
  </div>
  <div class="nome">${esc(r.nome)}</div>
  <div class="data">Resumo de ${esc(dataBR(r.data))}</div>
  ${r.demo ? '<div class="demo">DEMONSTRAÇÃO · DADOS FICTÍCIOS</div>' : ''}

  ${r.estagio ? `<span class="estagio" style="background:${r.estagioCor}">${esc(r.estagio)}</span>` : ''}

  <div class="destaque">
    <div class="dest-rot">CAIXA PROJETADO · 30 DIAS</div>
    <div class="dest-val">${r.caixa30 !== null ? esc(brlInteiro(r.caixa30)) : '·'}</div>
    <div class="dest-sub">${destaqueSub}</div>
  </div>

  <div class="grade">
    <div class="item"><div class="item-rot">Dinheiro preso (ciclo)</div><div class="item-val">${
      r.ciclo !== null ? esc(dias(r.ciclo)) : '·'
    }</div></div>
    <div class="item"><div class="item-rot">O que sobra (margem)</div><div class="item-val">${
      r.margem !== null ? esc(pct(r.margem)) : '·'
    }</div></div>
    <div class="item"><div class="item-rot">Faturou no mês</div><div class="item-val">${
      r.receita !== null ? esc(brl(r.receita)) : '·'
    }</div></div>
  </div>

  ${avisosHtml}

  <div class="rodape">Números calculados pelo Pulso, nunca estimados. pulso-site.onrender.com</div>
</body>
</html>`;
}
