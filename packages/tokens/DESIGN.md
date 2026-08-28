# IVO — Design System

Marca própria: **IVO, conselheiro do seu negócio**. `design-system.html` é o
board visual navegável. O nome anterior (Pulso) foi descartado por
inviabilidade de registro de marca; registro de IVO já iniciado.

## Nome e nomenclatura

- Produto: **IVO** (caixa alta no wordmark; "Ivo" em texto corrido)
- Descritor: CONSELHEIRO DO SEU NEGÓCIO
- IA do chat: **Ivo IA** (aba do app: "Ivo IA")
- Como a IA se apresenta: "Eu sou o Ivo, o conselheiro do seu negócio."
- Domínio: seuivo.com.br
- Nunca usar: Pulso, IA Pulso, ou qualquer variação do nome antigo em texto visível.

## A regra da marca

Estrutura sóbria + acento com significado. O IVO combina um **esqueleto neutro
e discreto** (cinzas, linha fina, muito respiro, tipografia geométrica) com o
**check verde** do wordmark: conferido, aprovado, validado — coerente com um
produto que confere os números do negócio e aconselha.

**Estrutura (sobriedade):** cinza escuro `#37373F` (letras) como escuro do
sistema, linha fina, muito respiro, hairlines como divisores.

**Acento e sinal (o check do IVO):** verde `#0F7A69` sobre fundo claro,
`#3FBFA6` sobre fundo escuro. O verde é acento e sinal, **nunca decoração**:
aparece no check do wordmark, na ação principal e no estado positivo. Se o
verde não estiver sinalizando nada naquele ponto, use cinza.

## Cores de severidade

Verde e vermelho ficam por usabilidade, não estética. O dono precisa
distinguir "tudo bem" de "seu caixa zera em setembro" num relance. O crítico
`#D8503F` só aparece em risco real; o alerta `#E39A26` na severidade média.
Regra de contraste: quando severidade vira TEXTO sobre fundo claro, usar as
variantes de texto (`alertaTexto #8A5A0B`, `criticoTexto #B23A2B`) — os tons
cheios ficam para fundos, barras e ícones grandes (mínimo 3:1 para elemento
gráfico).

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

A fonte definitiva da marca é a **Objektiv VF** — ainda não licenciada.
Enquanto a licença não sai, a substituta provisória é a **Manrope** (títulos e
wordmark), com **Figtree** no corpo. A troca para a Objektiv VF é feita em UM
ponto: `font.display` em `packages/tokens/src/index.ts` (+ o espelho em
`apps/mobile/src/theme.ts`). Não espalhar nome de fonte pelo código.

Regras permanentes: nada de fonte monoespaçada em rótulo de interface; números
sempre com dígitos tabulares (`tabular-nums`).

## O símbolo

O wordmark é a palavra IVO com o **V desenhado como um check verde**.
Variações (todas em SVG, em `packages/tokens/brand/`): lockup com descritor
(fundo claro/escuro), marca sem descritor (fundo claro/escuro), monocromática,
ícone de app. Nos tamanhos pequenos (32/48px) o ícone usa a variação de
reconhecimento (ver brand/README.md).

## Pendências antes de material impresso

- Licenciar a Objektiv VF.
- Concluir o registro da marca IVO (já iniciado).
