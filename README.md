# IVO

O conselheiro do seu negócio. O Ivo lê os dados financeiros da pequena empresa,
calcula os indicadores e avisa o dono **antes** do caixa acabar, não depois do
fechamento do mês.

| | |
| --- | --- |
| **Site** | [seuivo.com.br](https://seuivo.com.br) (a capa abre o app em modo demonstração) |
| **App no navegador** | [seuivo.com.br/app](https://seuivo.com.br/app/) |
| **Andamento do projeto** | [joaoprojetos1.github.io/Projeto-Pulso](https://joaoprojetos1.github.io/Projeto-Pulso/) (o mapa das tarefas, frente por frente) |
| **Próximos passos** | [`PROXIMOS-PASSOS.md`](PROXIMOS-PASSOS.md) |

> **Por que o repositório se chama "Projeto-Pulso":** o nome anterior do produto
> foi descartado em 28/08/2026 por não poder ser registrado como marca. O
> repositório e os nomes internos de código (`@pulso/*`, variáveis `PULSO_*`,
> serviços `pulso-api` e `pulso-site`) ficaram como estavam de propósito:
> nada disso aparece ao usuário, e renomear derrubaria a produção. Ver
> [`CLAUDE.md`](CLAUDE.md).

## O que o Ivo faz hoje

- **Lê os arquivos do negócio.** Extrato bancário (OFX, CSV, Excel e PDF do
  Inter e do Santander), folha de pagamento, maquininha e relatórios do sistema
  da empresa (gerencial, estoque, serviços, contábil).
- **Projeta o caixa em 30, 60 e 90 dias** e mostra, degrau por degrau, o que
  leva a esse número.
- **Dá um veredito do momento** (de Saudável a UTI) e avisa quando um sinal
  aparece: caixa curto, efeito tesoura, receita caindo, cliente concentrado.
- **Entende o setor.** Além dos indicadores que valem para qualquer empresa, há
  pacotes para clínica, varejo de roupa e restaurante. Quem é de outro ramo usa
  só os universais.
- **Conversa.** O Ivo IA responde em linguagem de dono, usando apenas os números
  já calculados.

Fala com qualquer dono de pequeno negócio. A prospecção começa pelas clínicas,
mas o produto não é de um setor só.

## Regra de ouro

**A IA nunca calcula.** Todo número nasce em `packages/core`, com teste. O
modelo de IA recebe os números prontos e só escreve em português claro. Quem
decide se há alerta é código, não IA.

Há uma exceção controlada: ao receber um arquivo de tipo declarado (folha,
maquininha...), a IA pode ler **só para extrair** os valores. O código confere,
o dono confirma, e só então o número entra na conta.

## Como o projeto é organizado

| Pasta | O que é |
| --- | --- |
| `packages/core` | O motor de cálculo. Indicadores, regras de alerta, diagnóstico e pacotes por segmento, puros e testados. **É o ativo do produto.** |
| `packages/tokens` | A marca: cores, fontes e o desenho do logotipo. Fonte única para app e site. |
| `apps/api` | O servidor: guarda os dados, lê os arquivos, chama o motor e fala com a IA. Não faz nenhuma conta financeira. |
| `apps/mobile` | O aplicativo (Expo). Só desenha o que o servidor manda. A mesma base gera o app no navegador. |
| `site` | O site público e a cópia publicada do app no navegador (`site/app`). |
| `fixtures` | Empresas e arquivos fictícios para teste. Dados 100% inventados. |
| `docs` | Página de andamento e documentação (leitores de arquivo, segurança, custos). |

As regras completas estão em [`CLAUDE.md`](CLAUDE.md).

## Onde roda

- **Servidor:** Render (`pulso-api`) com banco de dados Neon.
- **Site e app no navegador:** Render (`pulso-site`), nos domínios seuivo.com.br
  e meuivo.com.br. Todo push na `main` publica sozinho.
- **Página de andamento:** GitHub Pages, a partir da pasta `docs`.

Guia de publicação em [`DEPLOY.md`](DEPLOY.md).

## Rodando

```bash
pnpm install
pnpm test        # todos os testes (motor e servidor)
pnpm typecheck
```

Para subir o servidor localmente:

```bash
pnpm db          # terminal 1: sobe um Postgres local (nada para instalar)
pnpm api         # terminal 2: sobe a API em http://localhost:3000
pnpm seed        # (uma vez) cria as empresas de demonstração
```

Para ver o app no computador:

```bash
pnpm --filter @pulso/mobile web
```

O app abre em modo demonstração mesmo sem o servidor ligado.
