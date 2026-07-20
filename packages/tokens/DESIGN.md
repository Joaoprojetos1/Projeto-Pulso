# Pulso × Oliveira Alves — Design System

Marca própria (Pulso), endossada pela casa **Oliveira Alves — Soluções
Empresariais**. `design-system.html` é o board visual navegável.

## A regra da fusão

Mesclar não é apagar. O Pulso herda o **esqueleto sóbrio** da Oliveira Alves
e acrescenta o que um produto financeiro precisa e uma consultoria não: **sinal
de vida legível**.

**Herdado da Oliveira Alves (estrutura):** cinza escuro `#37373F` como dark do
sistema, linha fina, muito respiro, tipografia geométrica, monograma OA como
endossante, hairlines como divisores.

**Exclusivo do Pulso (vida e sinal):** verde-vivo `#23C883` como único ponto de
cor, cores de severidade, a linha de batimento (no "l" e no gráfico de caixa),
números tabulares com peso.

## Por que verde e vermelho ficam

É usabilidade, não estética. O dono precisa distinguir "tudo bem" de "seu caixa
zera em setembro" num relance. Cinza sobre cinza não faz esse trabalho num app
de alerta. A cor aqui é **função**. Não remover em nome da sobriedade.

## Fonte única de verdade

Todos os valores vivem em `packages/tokens/src/index.ts`. App e site derivam
dali:
- App (Expo): `apps/mobile/theme/index.ts`
- Site: `apps/mobile/theme/tokens.css`

Nunca escreva um hex cru na UI. Use o nome semântico (`semantic.accent`,
`severityColor.critical`).

## Fontes

Objektiv VF (títulos) e Myriad Pro (apoio) são as do manual OA — **licenciadas**.
Comprar para uso oficial. No web, substitutas próximas: Josefin Sans (geométrica
fina) e Figtree (humanista neutra).

## Pendências antes de material impresso/registro

- Logo do Pulso não passou por busca no INPI (classes 35 e 42) nem checagem de
  domínio.
- O monograma OA e a linha de batimento no board são **aproximações em SVG**.
  O vetor oficial do OA sai do manual do CEO.
