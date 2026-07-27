# Dados necessários para os indicadores do Pulso

> Documento gerado automaticamente das regras do motor. Não editar à mão: rode
> `npx tsx scripts/gen-dados-necessarios.ts` no pacote `packages/core`.

Este material é para as conversas com clientes e com fornecedores de sistema de gestão (ERP). Ele mostra, em linguagem de negócio, o que cada número precisa e onde essa informação costuma existir. Regra de ouro do Pulso: **o número é sempre calculado por código auditado — a inteligência artificial só transforma o resultado em texto, nunca inventa um valor.**

## 1. Por indicador

| Indicador | O que responde ao dono | Informações que exige | O que melhora a precisão | O que acontece quando falta |
| --- | --- | --- | --- | --- |
| **Saldo em caixa** | Quanto você tem em caixa agora? | • Saldo em conta, com a data da leitura | — | • Sem o saldo em conta, não há como dizer quanto há em caixa. |
| **Projeção de caixa (30/60/90 dias)** | Como seu caixa vai evoluir nos próximos 30, 60 e 90 dias? | • Saldo em conta, com a data da leitura | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data de vencimento<br>• Data em que foi pago ou recebido<br>• Data da venda ou da compra (competência)<br>• Natureza do custo: fixo ou variável<br>• Custo fixo mensal informado pelo dono | • Sem o saldo atual, não há de onde projetar: a projeção fica indisponível.<br>• Sem os vencimentos, a projeção usa só o saldo e o custo fixo (menos precisa).<br>• Sem o histórico de pagamentos, não dá para prever o atraso real dos clientes. |
| **Prazo médio de recebimento** | Em quantos dias, em média, você recebe depois de vender? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência)<br>• Data em que foi pago ou recebido | — | • Sem a data da venda, não dá para medir quanto tempo levou até receber.<br>• Sem a data do recebimento, não dá para medir o prazo real. |
| **Prazo médio de pagamento** | Em quantos dias, em média, você paga seus fornecedores? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência)<br>• Data em que foi pago ou recebido | — | • Sem a data da compra, não dá para medir quanto tempo levou até pagar.<br>• Sem a data do pagamento, não dá para medir o prazo real. |
| **Ciclo de caixa** | Quanto tempo seu dinheiro fica preso na operação? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência)<br>• Data em que foi pago ou recebido | — | Sem dado, o número fica indisponível. |
| **Necessidade de capital de giro** | Quanto de dinheiro a operação precisa para funcionar (capital de giro)? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data em que foi pago ou recebido | — | • Sem saber o que já foi pago, não dá para separar o que ainda está em aberto. |
| **Faturamento do período** | Quanto você faturou no período mais recente? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência) | — | • Sem a data da venda, não dá para somar o faturamento do período certo. |
| **Faturamento do período anterior** | Quanto você faturou no período anterior (para comparar)? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência) | — | • Sem a data da venda, não dá para somar o faturamento do período anterior. |
| **Margem de contribuição** | Quanto sobra de cada real vendido, depois dos custos que variam com a venda? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência)<br>• Natureza do custo: fixo ou variável | — | • Sem separar custo fixo de variável, a margem sai superestimada (trata todo custo como fixo). |
| **Custo fixo mensal** | Quanto sai de custo fixo todo mês? | • pelo menos uma via: Tipo do lançamento (a receber ou a pagar) + Valor do lançamento + Data da venda ou da compra (competência) + Natureza do custo: fixo ou variável OU Custo fixo mensal informado pelo dono | — | • Sem a classificação fixo/variável, o custo fixo só existe se o dono declarar.<br>• Sem declaração, o custo fixo só existe se os lançamentos vierem classificados. |
| **Concentração de clientes** | O quanto do seu faturamento depende de um único cliente? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência)<br>• Cliente ou fornecedor do lançamento | — | • Sem identificar o cliente de cada venda, não dá para medir concentração (típico do varejo de balcão). |
| **Ponto de equilíbrio** | Quanto você precisa faturar por mês só para empatar? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data da venda ou da compra (competência)<br>• Natureza do custo: fixo ou variável | — | • Sem separar custo fixo de variável, não dá para calcular custo fixo nem margem — e o ponto de equilíbrio depende dos dois. |
| **Inadimplência da carteira** | Quanto da sua carteira a receber está atrasada e pode não entrar? | • Tipo do lançamento (a receber ou a pagar)<br>• Valor do lançamento<br>• Data em que foi pago ou recebido<br>• Data de vencimento | — | • Sem a data de vencimento, não dá para saber o que está atrasado.<br>• Sem saber o que já foi recebido, não dá para isolar a carteira em aberto. |

## 2. Por informação

Cada dado que o motor usa, quais indicadores dependem dele e em quais fontes ele costuma existir.

| Informação | Indicadores que dependem | Onde costuma existir |
| --- | --- | --- |
| **Tipo do lançamento (a receber ou a pagar)** | Prazo médio de recebimento; Prazo médio de pagamento; Ciclo de caixa; Necessidade de capital de giro; Faturamento do período; Faturamento do período anterior; Margem de contribuição; Custo fixo mensal; Concentração de clientes; Ponto de equilíbrio; Inadimplência da carteira | Declaração do próprio dono; Relatório do sistema de gestão (ERP / gestão da clínica / PDV); Maquininha de cartão (adquirente); Extrato bancário (arquivo OFX ou CSV); Nota fiscal eletrônica; Open Finance (via agregador autorizado) |
| **Valor do lançamento** | Prazo médio de recebimento; Prazo médio de pagamento; Ciclo de caixa; Necessidade de capital de giro; Faturamento do período; Faturamento do período anterior; Margem de contribuição; Custo fixo mensal; Concentração de clientes; Ponto de equilíbrio; Inadimplência da carteira | Declaração do próprio dono; Extrato bancário (arquivo OFX ou CSV); Relatório do sistema de gestão (ERP / gestão da clínica / PDV); Nota fiscal eletrônica; Maquininha de cartão (adquirente); Open Finance (via agregador autorizado) |
| **Data da venda ou da compra (competência)** | Prazo médio de recebimento; Prazo médio de pagamento; Ciclo de caixa; Faturamento do período; Faturamento do período anterior; Margem de contribuição; Custo fixo mensal; Concentração de clientes; Ponto de equilíbrio | Relatório do sistema de gestão (ERP / gestão da clínica / PDV); Nota fiscal eletrônica; Maquininha de cartão (adquirente); Declaração do próprio dono |
| **Data de vencimento** | Inadimplência da carteira | Declaração do próprio dono; Relatório do sistema de gestão (ERP / gestão da clínica / PDV); Maquininha de cartão (adquirente) |
| **Data em que foi pago ou recebido** | Prazo médio de recebimento; Prazo médio de pagamento; Ciclo de caixa; Necessidade de capital de giro; Inadimplência da carteira | Extrato bancário (arquivo OFX ou CSV); Relatório do sistema de gestão (ERP / gestão da clínica / PDV); Maquininha de cartão (adquirente); Open Finance (via agregador autorizado); Declaração do próprio dono |
| **Cliente ou fornecedor do lançamento** | Concentração de clientes | Relatório do sistema de gestão (ERP / gestão da clínica / PDV); Nota fiscal eletrônica; Declaração do próprio dono; Extrato bancário (arquivo OFX ou CSV); Open Finance (via agregador autorizado) |
| **Categoria do lançamento** | — | Relatório do sistema de gestão (ERP / gestão da clínica / PDV); Extrato bancário (arquivo OFX ou CSV); Nota fiscal eletrônica; Maquininha de cartão (adquirente); Open Finance (via agregador autorizado) |
| **Natureza do custo: fixo ou variável** | Margem de contribuição; Custo fixo mensal; Ponto de equilíbrio | Declaração do próprio dono; Relatório do sistema de gestão (ERP / gestão da clínica / PDV) |
| **Saldo em conta, com a data da leitura** | Saldo em caixa; Projeção de caixa (30/60/90 dias) | Declaração do próprio dono; Extrato bancário (arquivo OFX ou CSV); Open Finance (via agregador autorizado) |
| **Custo fixo mensal informado pelo dono** | Custo fixo mensal | Declaração do próprio dono |

## 3. O que nenhuma fonte automática cobre hoje

Estas informações não vêm de nenhuma fonte ampla (extrato, maquininha, nota fiscal, Open Finance). Elas só existem no sistema de gestão do próprio cliente ou na declaração do dono — e por isso vão exigir **integração dedicada com o sistema do cliente** para o Pulso escalar sem depender de digitação.

- **Natureza do custo: fixo ou variável** — Se aquela conta é um custo fixo (que existe todo mês) ou variável (que acompanha a venda).
- **Custo fixo mensal informado pelo dono** — Quanto sai de custo fixo por mês, quando o dono declara em vez de deixar o sistema deduzir.

### Lacunas de cadastro (dado que ainda não existe no modelo)

- **Ciclo de caixa:** O prazo médio de estocagem e o custo da mercadoria não existem no cadastro de lançamentos. _(Comércio com estoque (loja, restaurante). Na clínica, sem estoque, não é necessário.)_

> Hoje, **3 indicadores** dependem de alguma informação que nenhuma fonte automática ampla fornece, listados acima. São os que mais se beneficiam de integrar o sistema de gestão do cliente.
