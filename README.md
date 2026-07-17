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
cd apps/api
pnpm db          # sobe um Postgres local (nada para instalar)
pnpm dev         # sobe a API em http://localhost:3000
```
