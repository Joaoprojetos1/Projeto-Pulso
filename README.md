# Pulso

O sinal vital do seu negócio. O Pulso avisa o dono da pequena empresa
**antes** do caixa acabar — não depois do fechamento do mês.

App + chatbot WhatsApp para controle financeiro de PMEs. MVP focado em
clínicas médicas.

📊 **[Andamento do projeto](docs/andamento.html)** — status visual das etapas.

## Como o projeto é organizado

| Pasta | O que é |
| --- | --- |
| `packages/core` | O motor de cálculo. Todos os indicadores e regras de alerta, puros e testados. **É o ativo do produto.** |
| `apps/api` | O servidor: guarda os dados, chama o motor e responde com painel e alertas. Não faz nenhuma conta. |
| `apps/mobile` | O aplicativo (Expo). Só desenha o que o servidor manda. |
| `fixtures` | Duas clínicas fictícias para teste — dados 100% inventados. |
| `docs` | Página de andamento e documentação. |

As regras completas do projeto estão em [`CLAUDE.md`](CLAUDE.md).

## Regra de ouro

**A IA nunca calcula.** Todo número nasce em `packages/core`, com teste.
O modelo de IA recebe os números prontos e só escreve o aviso em português
claro. Quem decide se alerta é código, não IA.

## Rodando

```bash
pnpm install
pnpm test        # todos os testes (motor, clínicas de teste e servidor)
pnpm typecheck
```

Para subir o servidor localmente:

```bash
pnpm db          # terminal 1: sobe um Postgres local (nada para instalar)
pnpm api         # terminal 2: sobe a API em http://localhost:3000
pnpm seed        # (uma vez) cria as clínicas de demonstração
```

## Vendo o app no celular

1. Instale o **Expo Go** no telefone (App Store / Play Store).
2. No computador: `pnpm app` — vai aparecer um código QR no terminal.
3. Aponte a câmera do celular para o código (mesma rede Wi-Fi).

O app abre com a clínica de demonstração mesmo sem o servidor ligado.
Com servidor + seed rodando (e `HOST=0.0.0.0` na API), ele busca os dados
de verdade. Se o QR não conectar (firewall), use `pnpm app -- --tunnel`.
