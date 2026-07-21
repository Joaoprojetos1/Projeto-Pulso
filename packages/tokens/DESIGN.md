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

## Convenção de conteúdo (regra permanente)

**Nunca use travessão (—) nem meia-risca (–) em nenhum texto visível**, no site ou
no app: copy, título, placeholder, botão, mensagem, rótulo. Reescreva com ponto,
vírgula, dois-pontos ou parênteses, ou quebre em duas frases. Motivo: consistência
de voz e leitura limpa em telas pequenas. Vale para todo texto novo, sempre.
(Hífen normal, em palavras compostas como "somente-leitura", segue permitido.)

## Fontes

Duas famílias sustentam a marca: **Manrope** (grotesca sóbria e encorpada) nos
títulos e wordmark, e **Figtree** (humanista neutra) no corpo. No **site**, ficam
só estas duas: rótulos e números usam Figtree (com `tabular-nums` e espaçamento de
letra nos rótulos). No **app**, os dados e rótulos técnicos ainda usam IBM Plex
Mono. A fonte de títulos oficial pode ser licenciada no futuro; Manrope é a de uso
atual. Atualizar sempre em `packages/tokens/src/index.ts` (fonte única).

## Pendências antes de material impresso/registro

- Logo do Pulso não passou por busca no INPI (classes 35 e 42) nem checagem de
  domínio.
- A linha de batimento no board é uma **aproximação em SVG**; o vetor oficial da
  marca ainda será definido.
