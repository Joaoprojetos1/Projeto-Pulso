# IVO — vetores canônicos da marca

Fonte única dos vetores. Tudo que vira PNG (ícones de app, favicons) é gerado
DAQUI; não desenhe a marca de novo em outro lugar.

## O wordmark

A palavra IVO com o **V desenhado como um check verde**. O I e o O são
geometria pura (barra e círculo, sem dependência de fonte). O check tem
assinatura formal própria, que o distingue de um check de sistema:

- caps retos INCLINADOS (butt cap perpendicular ao traço, não arredondado);
- a haste direita sobe ACIMA da altura das letras (overshoot);
- braço esquerdo parte da meia-altura (como check), não do topo (como V).

Verde do check: `#0F7A69` sobre fundo claro, `#3FBFA6` sobre fundo escuro
(tokens `acento` / `acentoClaro`).

## Arquivos

| Arquivo | Uso |
|---|---|
| `ivo-lockup-claro.svg` | Lockup com descritor, fundo claro |
| `ivo-lockup-escuro.svg` | Lockup com descritor, fundo escuro (transparente; usar sobre `#37373F`) |
| `ivo-marca-claro.svg` | Marca sem descritor, fundo claro |
| `ivo-marca-escuro.svg` | Marca sem descritor, fundo escuro |
| `ivo-mono-preto.svg` / `ivo-mono-branco.svg` | Monocromáticas P&B |
| `ivo-icone.svg` | Ícone do app, TODOS os tamanhos (as três letras em traço grosso) |
| `ivo-glifo-check.svg` | Glifo alternativo (check + ponto): SÓ p/ ícone monocromático temático do Android e notificação |

## Decisão do ícone pequeno (28/08/2026)

Reduzido a um check num quadrado, o ícone ficava genérico em 32/48px
(indistinguível de app de tarefas). Duas variações foram renderizadas nos
tamanhos reais: (A) as três letras em traço grosso; (B) o check com assinatura
própria + ponto ("conferido, ponto"). **A opção A venceu**: lê "IVO" até em
32px, continua sendo um check, e permite UM ícone só em todos os tamanhos.
A opção B sobrevive como `ivo-glifo-check.svg` para contextos de glifo único.

## Gerados a partir daqui

- App (Expo): `apps/mobile/assets/images/` (icon, android-icon-*, splash-icon,
  favicon). Módulo nativo: ícone novo só entra no próximo APK.
- Site: `site/icon.svg` + `site/icones/` (favicon 16/32/48, apple-touch 180,
  PWA 192/512).

O descritor nos lockups usa Manrope 600 (substituta provisória; a definitiva é
a Objektiv VF, licença pendente).
