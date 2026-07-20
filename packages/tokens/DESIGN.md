# Pulso — Design System

Marca própria, que se sustenta sozinha. `design-system.html` é o board visual
navegável.

## A regra da fusão

Estrutura sóbria + sinal de vida legível. O Pulso combina um **esqueleto neutro
e discreto** (cinzas, linha fina, muito respiro, tipografia geométrica) com o que
um produto financeiro precisa e uma planilha não tem: **sinal de vida legível**.

**Estrutura (sobriedade):** cinza escuro `#37373F` como escuro do sistema, linha
fina, muito respiro, tipografia geométrica, hairlines como divisores.

**Vida e sinal (exclusivo do Pulso):** verde-vivo `#23C883` como único ponto de
cor, cores de severidade, a linha de batimento (no gráfico de caixa), números
tabulares com peso.

## Por que verde e vermelho ficam

É usabilidade, não estética. O dono precisa distinguir "tudo bem" de "seu caixa
zera em setembro" num relance. Cinza sobre cinza não faz esse trabalho num app
de alerta. A cor aqui é **função**. Não remover em nome da sobriedade.

## Fonte única de verdade

Todos os valores vivem em `packages/tokens/src/index.ts`. App e site derivam
dali:
- App (Expo): o tema em `apps/mobile/src/theme.ts` espelha os tokens (mantendo os
  nomes que as telas já usam).
- Site: `site/index.html` usa as mesmas variáveis de cor/fonte.

Nunca escreva um hex cru na UI. Use o nome semântico (`semantic.accent`,
`severityColor.critical`).

## Fontes

As fontes oficiais de títulos são **licenciadas** — comprar para uso oficial. No
web/app, substitutas próximas: **Josefin Sans** (geométrica fina, títulos) e
**Figtree** (humanista neutra, corpo). Rótulos e dados em IBM Plex Mono.

## Pendências antes de material impresso/registro

- Logo do Pulso não passou por busca no INPI (classes 35 e 42) nem checagem de
  domínio.
- A linha de batimento no board é uma **aproximação em SVG**; o vetor oficial da
  marca ainda será definido.
