# Leitores de arquivo (parsers) — estrutura real, mapeamento e categorização

> **Dados**: este documento foi escrito a partir de arquivos financeiros **reais**
> de clientes, mas **nada** identificável entra aqui. Os arquivos reais ficam
> **fora do repositório** (em `~/insumos-pulso/`, no `.gitignore`). Tudo abaixo é
> descrição de estrutura e regras — com exemplos **anonimizados**.

Cada leitor converte um formato de origem para o **mesmo schema canônico** do core
(`Entry` / `CashBalance`), como manda o CLAUDE.md: o core nunca sabe de onde o dado
veio. Código em `apps/api/src/parsers/`.

---

## 1. Inventário dos formatos reais

Analisamos dois negócios:

- **Restaurante** — extrato do **Banco Inter** (PDF), jan–jun/2026.
- **Loja de roupa** — extrato do **Santander** (PDF, ~6 meses) + exportações do
  **Linx Microvix** (4 relatórios).

### 1a. Extrato Inter — PDF

| Item | O que é |
|---|---|
| Formato | PDF com texto real (não é imagem). Extração de texto → linhas. |
| Agrupamento | Por dia: cabeçalho `"2 de Janeiro de 2026 Saldo do dia: R$ 800,00"`. |
| Linha de lançamento | `Tipo: "contraparte"VALORSALDO` — tudo colado. Ex.: `Pix recebido: "Cp :99999999-CLIENTE"R$ 133,34R$ 6.355,92`. |
| Valor | `R$ 1.234,56`; saída com sinal **antes** do R$: `-R$ 2.000,00`. Milhar `.`, decimal `,`. |
| Datas | Cabeçalho de dia por extenso ("2 de Janeiro de 2026"); saldo corrido em cada linha. |
| Contraparte | Entre aspas, prefixada por `Cp :NNNN-` ou `NNNN NNNN ` (removida). **O Inter nomeia** quem pagou/recebeu. |
| Ruído a descartar | "Fale com a gente", "SAC:", cabeçalho com CNPJ, "Saldo total". |
| Inconsistências | Um mês veio **triplicado** (arquivos idênticos por hash); um mês fraco tem 3 páginas. |

### 1b. Extrato Santander — PDF (o formato **sujo**)

| Item | O que é |
|---|---|
| Formato | PDF com texto, porém **quebrado**: um lançamento se espalha por até 4 linhas. |
| Estrutura | Data numa linha; descrição em 1–3 linhas (quebra "GETNET" em "G"+"ETNET"); linha final `documento+valor(+saldo)` colados. |
| Valor | Milhar `.`, decimal `,`; saída com `-` colado (`-13.954,81`). |
| Saldo | **Dois layouts**: um traz o saldo corrido em **toda** linha; o outro só no **último lançamento do dia**. |
| Contraparte | **Não existe**: PIX de cliente vem só com um número de documento (varejo de balcão). |
| Fecho | Bloco `A - Saldo de Conta Corrente ... D - Saldo Disponível Total`. |
| **Armadilha grave** | Quando o valor tem separador de milhar e vem colado no documento (`...38092.155,95`), é **impossível** saber pelo texto onde o documento acaba (`092.155,95` vs `2.155,95`). Ver estratégia em 2b. |

### 1c. Linx Microvix — 4 relatórios (HTML salvo como `.xls`)

O arquivo começa com `<html xmlns:o=...>`: é **HTML**, não XLS binário. Encoding
UTF-8. Valores BR (`18.254,66`), célula vazia = `-`, datas `DD/MM/AA` (ano de 2
dígitos).

| Relatório | Granularidade | Traz |
|---|---|---|
| **Faturamento Diário** | 1 linha por **dia** | Valor faturado + divisão por forma de pagamento (Dinheiro, Cartão, Crediário, Pix, Convênio…). Fecha com "Totais:". |
| **Movimento Diário** | 1 linha por **documento** (venda) | Valor, cliente ("CONSUMIDOR FINAL"), forma de pagamento, troca. (20 MB) |
| **Giro Médio** | 1 linha por **produto** | Estoque inicial/final, preço de custo, qtde vendida, giro. Período no cabeçalho. |
| **Registro de Inventário** | Sintético, por **linha de produto** | Saldo, subtotal de custo e de venda; fecha com "Total Geral". Nº de colunas **varia** (11–12) e desloca à esquerda. |

---

## 2. Mapeamento para o schema canônico

Campos canônicos: `entry.kind`, `entry.amount`, `entry.issuedOn` (competência),
`entry.dueOn`, `entry.settledOn` (liquidação), `entry.counterparty`,
`entry.category`, `entry.costType`, `balance.observed`.

### 2a. Extrato bancário (Inter e Santander) → canônico

| Coluna de origem | Campo canônico | Cobertura |
|---|---|---|
| Valor do lançamento | `entry.amount` | **cobre** (direto) |
| Data do movimento | `entry.settledOn` | **cobre** (direto) |
| Saldo corrido / "Saldo do dia" / "Saldo A" | `balance.observed` | **cobre** (direto) |
| Sinal + descrição | `entry.kind` | **inferência** (regra) |
| Descrição | `entry.category` | **inferência** (regra determinística, ver §3) |
| Contraparte | `entry.counterparty` | Inter: inferência · Santander: **não cobre** |
| — | `entry.issuedOn` (competência) | **não cobre** — o banco só vê o dinheiro cair |
| — | `entry.dueOn` (vencimento) | **não cobre** |
| — | `entry.costType` (fixo/variável) | **não cobre** (parcial via categoria) |

> **Base caixa, não competência.** Ao virar `Entry`, usamos a data do movimento
> para `settledOn` e — por falta de melhor — também para `issuedOn`/`dueOn`. Isso é
> fiel para venda à vista (PIX na hora), mas **não** para cartão. Por isso a camada
> de fontes declara que o extrato **não** fornece `issuedOn`/`dueOn` de verdade.

### 2b. Estratégia contra a ambiguidade do Santander

Quando o saldo corrido está em **cada linha**, o valor é a **diferença de saldos**
(`saldo_atual − saldo_anterior`) — exato, dribla a ambiguidade documento×valor.
Quando o saldo só aparece no fim do dia, caímos no token de valor (melhor-esforço)
e **emitimos aviso** para valores com separador de milhar. **Para esse layout, o OFX
é a fonte recomendada** — é a razão concreta pela qual o CLAUDE.md pede OFX/CSV.

### 2c. OFX → canônico

Formato **estruturado** (padrão): sem ambiguidade. `<TRNAMT>`→amount, `<DTPOSTED>`
→settledOn, `<TRNTYPE>/<NAME>/<MEMO>`→kind+category, `<FITID>`→id, `<LEDGERBAL>`→
balance. Mesma limitação de competência do extrato (é extrato).

### 2d. Microvix (ERP) → canônico e segmento

| Relatório | Vira | Campos que **cobre** |
|---|---|---|
| Faturamento Diário | 1 receita/dia | `entry.issuedOn` (**competência — o diferencial sobre o banco**), `entry.amount`, `entry.kind`. `settledOn` só quando o dia é 100% à vista. |
| Movimento Diário | agregados/mês | nº de vendas (`atendimentos`), faturamento (**cruza exato com o Faturamento**), troca (proxy de devolução). |
| Giro Médio | insumo de segmento | CMV do período, estoque a custo (varejo). |
| Inventário | insumo de segmento | `estoque_final` a custo (o "dinheiro parado"). |

> **Não cobre**: contraparte da venda (é "consumidor final") e **contas a pagar**
> (os relatórios exportados são só de venda/estoque; o "a pagar" viria de outro
> relatório do mesmo sistema).

A camada `packages/core/src/sources.ts` foi atualizada com o que os arquivos reais
provaram (`bank_statement` e `erp_export` agora `implemented: true`).

---

## 3. Regras de categorização (determinísticas — **nunca IA**)

Código em `apps/api/src/parsers/categorize.ts`. A descrição do banco casa contra um
dicionário de padrões; onde o significado é ambíguo, a regra marca `ambiguous` em
vez de chutar. Exemplos **anonimizados**; as contagens são a frequência real que
justifica cada regra.

### Inter (restaurante)

| Padrão | Categoria | Freq. | Observação |
|---|---|---|---|
| `Pix recebido` | `venda_pix` (entra) | 1077 | receita à vista |
| `Credito domicilio cartao` / `INTER PAG` / `ANTECIPACAO` | `repasse_adquirente` (entra) | 490 | repasse da maquininha |
| `Pagamento efetuado` | `fornecedor` (sai) | 429 | boleto/título |
| `Pix enviado` | `fornecedor` (sai) | 369 | **ambíguo** (pode ser retirada) |
| `Pagamento de Convenio` | `conta_consumo` (sai) | 23 | **ambíguo** (concessionária?) |
| `Transferencia recebida` | `transferencia` | 6 | **ambíguo** (aporte? conta própria?) — não conta como receita |

### Santander (loja de roupa)

| Padrão | Categoria | `costType` | Observação |
|---|---|---|---|
| `PAGAMENTO CARTAO DE CREDITO/DEBITO` / `GETNET` | `repasse_adquirente` (entra) | — | repasse da maquininha |
| `TARIFA` / `TAR PIX` | `tarifa_bancaria` (sai) | fixo | |
| `DEBITO PAGAMENTO DE SALARIO` / `AGSAL` | `folha_salario` (sai) | fixo | |
| `DAS` / `TRIB FEDERAIS` | `imposto` (sai) | fixo | Simples / tributos |
| `DEVOLUCAO DE PIX` | `estorno` | — | inverte o sentido |
| `PIX RECEBIDO` | `venda_pix` (entra) | — | |
| `PAGAMENTO DE TITULO` / `PAGFOR PIX ... FORNEC` / `TIT` | `fornecedor` (sai) | — | |

### Candidatos a custo fixo

Custo fixo "estável" (mesmo fornecedor, valor parecido, todo mês) é um padrão
**entre** lançamentos, não de linha. Fica como candidato a ser confirmado pelo dono
(o especialista valida os limiares) — não é assumido pelo parser.
