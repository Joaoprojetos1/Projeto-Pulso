# Cobertura real — o que dá para calcular com os arquivos que os clientes têm

> Sem nenhum dado identificável. Números obtidos rodando a função de cobertura do
> core (`packages/core/src/coverage.ts`) sobre os campos que **cada fonte real
> provou** fornecer (ver `docs/PARSERS.md`). Os arquivos reais estão fora do repo.

O core tem **13 indicadores universais**. "Completo" = todos os campos presentes;
"parcial" = calcula com precisão reduzida; "bloqueado" = falta campo obrigatório.

---

## 1. Indicadores universais, por cenário

### Restaurante — só o extrato Inter (banco)

**2 completos, 1 parcial, 10 bloqueados → 15% completos, 23% calculáveis.**

- ✅ **Completos**: saldo de caixa, necessidade de capital de giro (NCG).
- 🟡 **Parcial**: projeção de caixa (só saldo; sem competência/custo classificado).
- ⛔ **Bloqueados** por falta de `issuedOn` (data da venda): PMR, PMP, ciclo de
  caixa, receita atual/anterior, margem, ponto de equilíbrio, concentração de
  cliente. Inadimplência bloqueada por falta de vencimento; custo fixo por falta
  de declaração/classificação.

> **O extrato sozinho responde "quanto tenho e quando o caixa aperta", mas não
> "quanto vendi, com que margem, recebendo em quantos dias".** Isso exige a data de
> competência, que o banco não tem.

### Loja de roupa — só o extrato Santander (banco)

**2 completos, 1 parcial, 10 bloqueados → 15% completos, 23% calculáveis.**
Igual ao restaurante, e ainda **pior num ponto**: concentração de cliente fica
duplamente bloqueada, porque o Santander nem nomeia o cliente do PIX.

### Loja de roupa — extrato + Microvix (banco + ERP)

**7 completos, 1 parcial, 5 bloqueados → 54% completos, 62% calculáveis.**

O Microvix traz a **data de emissão** (competência) e **destrava**: PMR, PMP, ciclo
de caixa, receita atual e receita anterior — além dos 2 que já vinham do banco.

- ⛔ Ainda bloqueados: margem de contribuição, custo fixo, ponto de equilíbrio
  (faltam custos **classificados** fixo/variável), concentração de cliente (varejo
  de balcão não identifica), inadimplência (sem vencimento).

> **Ressalva honesta**: PMR/PMP aparecem "completos" porque os campos existem — mas
> a competência vem do ERP e a liquidação vem do banco, em **linhas diferentes**.
> Para um PMR fiel por transação é preciso **conciliar** as duas fontes (casar a
> venda do ERP com o crédito no extrato). O número já orienta; a precisão fina exige
> essa conciliação (é o mesmo tipo de conciliação que é o diferencial do Prumo, mas
> aqui entre venda e recebimento).

### Referência — ERP completo (todos os campos)

**13/13 completos → 100%.** É o teto: um export de ERP com custos classificados,
vencimentos e contraparte cobre tudo.

---

## 2. Indicadores de segmento

### Varejo de roupa (banco + Microvix) — **~3 de 5 plenos, 5/5 ao menos parciais**

| Indicador | Precisa de | Situação |
|---|---|---|
| Giro de estoque | CMV + estoque final | ✅ **completo** (Giro + Inventário) |
| Ticket médio | receita bruta + nº de vendas | ✅ **completo** (Faturamento + Movimento) |
| Margem bruta | receita + devoluções + CMV | 🟡 parcial (devolução via "troca" é proxy) |
| Devoluções | receita + devoluções | 🟡 parcial (mesmo motivo) |
| Margem operacional | + custo operacional | 🟡 parcial (custo vem do extrato, aproximado) |

O que **falta e de onde viria**: devoluções exatas (relatório de trocas/devoluções
do Microvix) e custo operacional classificado (contas a pagar do sistema, ou
classificação dos débitos do extrato).

### Restaurante (só o extrato Inter) — **0 de 5 plenos; a maioria bloqueada**

| Indicador | Precisa de | Situação |
|---|---|---|
| CMV % | insumos + receita | 🟡 parcial (aproxima por saídas de fornecedor) |
| Margem operacional | receita + insumos + custo | 🟡 parcial |
| Taxa de marketplace | taxas + faturamento delivery | ⛔ bloqueado (não está no extrato) |
| Peso do delivery | delivery + receita | ⛔ bloqueado |
| Ticket médio | receita + nº de clientes | ⛔ bloqueado (extrato não conta clientes) |

> **O restaurante precisa do próprio sistema** (PDV/ERP e/ou relatório dos apps de
> delivery) para os indicadores de segmento, exatamente como a loja de roupa precisa
> do Microvix. O extrato dá o caixa; o sistema dá a operação.

---

## 3. O que o Microvix cobre que o extrato não (conversa de integração)

Para fundamentar a conversa com o fornecedor do sistema:

| Campo | Extrato | Microvix |
|---|---|---|
| Data da **venda** (competência) | ❌ | ✅ Faturamento (emissão) |
| **Receita** por período | aproximada (entradas) | ✅ exata, com forma de pagamento |
| **Nº de vendas / ticket** | ❌ | ✅ Movimento |
| **Estoque** a custo (dinheiro parado) | ❌ | ✅ Inventário |
| **CMV / giro** | ❌ | ✅ Giro |
| À vista × a prazo (crediário/cartão) | ❌ | ✅ Faturamento (split) |
| Contraparte da venda | ❌ | ❌ (consumidor final) |
| **Contas a pagar** | parcial (saídas) | não no export atual (existe outro relatório) |

---

## Resumo

| Cenário | Indicadores universais calculáveis |
|---|---|
| Restaurante — extrato Inter | **23%** (15% completos) |
| Loja — extrato Santander | **23%** (15% completos) |
| **Loja — extrato + Microvix** | **62%** (54% completos) |
| ERP completo (referência) | 100% |

**Leitura para o negócio**: o extrato bancário liga o motor (caixa, projeção, NCG),
mas o salto de ~23% → ~62% vem de **uma fonte de operação** (o ERP). Para o varejo
já temos (Microvix). Para o restaurante, o próximo insumo é o sistema dele. E o teto
(100%, com margem/inadimplência) depende de **custos classificados e vencimentos** —
que só o ERP completo entrega.
