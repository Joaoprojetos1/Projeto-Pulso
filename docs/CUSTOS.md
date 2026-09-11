# Estrutura de custos do Ivo — levantamento (12/08/2026)

> Levantamento inicial para a Seção 6 da planilha de acompanhamento. Valores de
> IA vêm do próprio código (`apps/api/src/ai/prices.ts`); os demais, de consulta
> pública (ago/2026). **Confirmar/ajustar com o provedor na hora de escalar.**

## Resumo rápido

| Frente | Custo HOJE (MVP, poucos clientes) | Quando escalar |
|---|---|---|
| Banco de dados (Neon) | **R$ 0** (plano free) | ~US$ 19/mês (≈ R$ 105) no plano pago |
| Hospedagem (Render) | **R$ 0** (free, hiberna) | US$ 7/mês por serviço sempre-ligado (≈ R$ 38) |
| IA (tokens) | **centavos por operação** | ~R$ 1–3/mês por empresa ativa |
| Lojas (Apple/Google) | ~US$ 124/ano (≈ R$ 680) | fixo |
| Checkout (taxas) | por transação (ver abaixo) | % + fixo por venda |
| Desenvolvimento | próprio (sem terceirizar) | — |

## 6.1 Banco de dados — Neon
- **Hoje:** plano **free** (0,5 GB de armazenamento, 1 projeto, região sa-east-1).
  O banco atual (poucas empresas de teste) usa uma fração disso → **R$ 0**.
- **Escala:** o plano pago (Launch) fica em torno de **US$ 19/mês** quando o
  armazenamento/os recursos passarem do free. Alternativa: Postgres da própria
  Render (~US$ 6/mês o menor).

## 6.2 Tokens de IA — calculado do código

> **REVISADO EM 11/09/2026.** A tabela de preços do código dizia que o Opus custa
> US$ 15/75 por 1M de tokens — o **triplo** do preço real (US$ 5/25). Os números
> abaixo substituem os da versão de agosto, que superestimavam o custo em 3×.
> Junto, os modelos padrão subiram para a geração 5 (mesma qualidade ou melhor,
> preço igual ou menor).

Preços em `prices.ts` (tabela da Anthropic × câmbio ~R$ 5,50/US$):

| Modelo | Onde é usado | Entrada (1k tokens) | Saída (1k tokens) |
|---|---|---|---|
| **Opus 5** | alerta e diagnóstico | R$ 0,0275 | R$ 0,1375 |
| **Sonnet 5** | conversa e leitura de arquivo | R$ 0,011 | R$ 0,055 |
| Haiku 4.5 | opção mais barata (não usada) | R$ 0,0055 | R$ 0,0275 |

Custo por operação (estimativa de tamanho real):
- **1 alerta** (Opus 5, ~1,5k entrada + 0,15k saída) ≈ **R$ 0,06**.
- **1 mensagem de conversa** (Sonnet 5, ~6k entrada + 0,3k saída) ≈ **R$ 0,08**.
- **1 arquivo lido** (Sonnet 5, ~10k entrada + 0,5k saída) ≈ **R$ 0,14**.

Por **empresa ativa/mês** (recálculos + resumo semanal + ~15 conversas + alguns
arquivos) ≈ **R$ 1,50–2,50**. A **100 empresas** ≈ **R$ 150–250/mês** — algo em
torno de **1% a 2% da receita** dessas 100 assinaturas. Se um dia apertar, a
conversa cai para **Haiku** (metade do custo) mexendo só em `PULSO_CHAT_MODEL`,
sem publicar nada.

O número REAL (não estimado) está em **/admin → economia**: a API grava tokens e
modelo de cada chamada em `ai_usage` e a tela calcula o custo médio por
interação. Com uso de verdade, é esse número que vale — não esta estimativa.

## 6.3 Lojas — Apple/Google ✅ (já verificado)
- **Apple Developer:** US$ 99/ano. **Google Play:** US$ 25 (pagamento único).
  ≈ **US$ 124/ano** (~R$ 680). Nota: hoje o Android roda por APK direto (sem loja);
  publicar nas lojas é decisão à parte.

## 6.4 Hospedagem — Render
- **Hoje:** free (o serviço hiberna após ~15 min sem uso; 1ª visita demora a
  acordar — é o "erro na primeira vez" que já mitigamos no app) → **R$ 0**.
- **Escala:** plano **Starter US$ 7/mês** por serviço sempre-ligado (0,5 vCPU,
  512 MB). O site estático segue free. Total ao ligar a API sempre-on: ~R$ 38/mês.

## 6.5 / 6.7 Checkout — taxas por transação
Depende do provedor (ainda **não escolhido**). Referência **Asaas** (ago/2026):
- **Pix:** R$ 0,99/transação nos 3 primeiros meses, R$ 1,99 depois — com **100
  Pix/mês grátis** por chave/QR estático.
- **Boleto:** R$ 0,99 (3 meses) → R$ 1,99.
- **Cartão de crédito:** R$ 0,49/cobrança + **1,99%** sobre o valor (parcelado/assinatura).

Para uma assinatura mensal recebida por Pix, o custo por cobrança é praticamente
**R$ 0** (dentro da franquia dos 100/mês) — muito favorável ao modelo de assinatura.

## 6.6 Desenvolvimento
- Feito **internamente** (com Claude Code), sem terceirização. Custo externo =
  a ferramenta/assinatura de desenvolvimento + o tempo dos sócios.

## Comissão de loja (lembrete de arquitetura)
Vender **no site** (checkout web) **não** paga a comissão de 15–30% da Apple/Google.
Por isso o CLAUDE.md manda "a venda acontece no site", nunca dentro do app.
