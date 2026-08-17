# Pulso

Assistente financeiro para pequenas empresas brasileiras. Recebe dados
financeiros, calcula indicadores e usa IA para interpretar e alertar o dono
antes do caixa acabar.

**Foco de vendas:** pequenas empresas, começando pelas clínicas (é onde o time
prospecta). Mas a **comunicação do produto (app e site) é GERAL** — fala com
qualquer dono de pequeno negócio, sem termos específicos de setor (nada de
"convênio", "paciente", "clínica" no texto). Sem nicho travado; visão de longo
prazo é PMEs em geral. Fórmula/indicador específico de setor só entra validado
pelo especialista.

## Regras inegociáveis

### 1. A IA NUNCA calcula

Todo indicador é calculado em código, em `packages/core`, com teste unitário.
O modelo recebe os números **já prontos** e só interpreta e redige.

- Dado bruto (lançamentos, extratos) **nunca** entra no prompt.
- O modelo nunca decide se deve alertar — quem decide é a regra em código.
- Se você se pegar pedindo pro modelo "analisar esses lançamentos", parou:
  o cálculo vai pro core.

Motivo: número alucinado em alerta financeiro destrói a confiança de forma
irreversível, e o especialista do projeto audita cada fórmula contra a
planilha dele.

**Exceção controlada — extração de arquivo por tipo** (decidida com o
especialista, 13/08). Como cada empresa manda o arquivo num formato diferente,
quando o dono sobe um arquivo por um **campo de TIPO declarado** (folha,
maquininha, DRE…), a IA **pode ler o arquivo apenas para EXTRAIR** os valores
daquele tipo — nunca para calcular indicador nem decidir alerta. O que a IA
extrai é **proposta**: o **código valida** (formato, faixa) e o **dono confirma**
("li R$ X de folha, confere?") **antes** de qualquer número entrar no motor.
Nenhum valor extraído alimenta o cálculo sem passar por essa peneira (código) +
confirmação (humano) — o mesmo padrão do custo fixo. Fora desse fluxo de
extração-com-confirmação, a regra acima vale integralmente.

### 2. `packages/core` é puro

Sem I/O, sem banco, sem HTTP, sem SDK de IA. Só funções: entrada tipada,
saída tipada. É o ativo do produto e o que é auditado. Testável em
milissegundos.

### 3. O app é burro

`apps/mobile` busca JSON e desenha. Zero lógica financeira, zero regra de
alerta. Se um cálculo apareceu no app, ele está no lugar errado.

Motivo: o canal pode mudar (WhatsApp, web) e o backend não pode mudar junto.

## Estrutura

```
apps/api/        API + persistência + integração com o modelo + push
apps/mobile/     Expo. Telas: login, onboarding, dashboard, chat, conta
packages/core/   Indicadores + motor de regras. Puro. Testado.
fixtures/        Dados FALSOS para teste
```

## Dados: LGPD

- **Nunca** commitar export real de cliente. Dado financeiro de empresa real.
- `fixtures/` contém apenas dados inventados, com a mesma estrutura do export
  real.
- `.env` nunca versionado.
- Sem PII em log. Sem PII em mensagem de erro.

## Indicadores do v1

Calculados em `packages/core`, todos com teste:

1. Saldo de caixa atual
2. Projeção de caixa 30/60/90d ← o principal
3. Prazo médio de recebimento (PMR)
4. Prazo médio de pagamento (PMP)
5. Ciclo de caixa (PMR + PME − PMP)
6. Necessidade de capital de giro (NCG)
7. Receita vs. mês anterior e vs. mesmo mês do ano anterior
8. Margem de contribuição
9. Custo fixo e ponto de equilíbrio
10. Inadimplência e concentração de clientes

A lista final é definida com o especialista. Não adicionar indicador sem ele.

## Motor de alertas

Cada gatilho é uma função pura em `packages/core`: recebe indicadores,
devolve alerta ou nada. O modelo só transforma o alerta em texto.

- Projeção de caixa < 60 dias
- NCG crescendo mais rápido que a receita (efeito tesoura)
- Ciclo de caixa piorou > 20% vs. média
- Receita caiu e custo fixo estável
- Margem caindo 2 meses seguidos
- 1 cliente > 30% do faturamento

## Movimentos de sócio (regra PROVISÓRIA — o especialista valida)

O dinheiro que entra/sai em nome de um **sócio** não é operação do negócio: aporte de
sócio **não é receita**, retirada **não é custo**. Mas o dinheiro **moveu** — então
segue no **caixa** (que vem do saldo do banco, não da soma de lançamentos).

Implementação que preserva o núcleo: o `core` **não muda**. A regra vive na **fronteira**
(`loadCompanySnapshot`): lançamentos classificados como `aporte`/`retirada` **não
alimentam** o motor; `pro_labore` e `nao_socio` (e sem classe) **contam** normalmente.
A lista de sócios parte do quadro societário do CNPJ + contas que o dono acrescenta; o
CÓDIGO casa o nome com a contraparte do extrato (`services/partners.ts`), o DONO
**confirma** a classificação (mesmo padrão do custo fixo) e só então o motor deixa de
contar. **Pró-labore é o caso cinzento** (remuneração do sócio que toca o negócio):
por ora **conta como custo** — a decisão final é do especialista.

## Como o dado entra: direção do produto

Documentação de direção (não é implementação agora): orienta decisões futuras de
captura de dados.

O objetivo do produto é que o dono **não digite nada**. Informar caixa e custo
fixo à mão é uma muleta temporária para ligar o motor, não o destino. A captura
evolui em três etapas:

- **Agora: arquivo.** Extrato bancário em OFX ou CSV é a porta principal, porque
  é gratuito, universal e cobre entrada e saída. O atrito real não é o formato, é
  o cliente não saber onde achar o arquivo no banco dele; então acompanha um guia
  por banco. A entrada manual de caixa e custo fixo passa a ser alternativa,
  nunca o caminho padrão.
- **Depois: maquininha de cartão.** As APIs de adquirentes costumam ser gratuitas,
  com autorização do lojista. O dado mais valioso ali é a **agenda de recebíveis**:
  o que foi vendido e ainda não caiu. Isso é o "dinheiro preso" da tese do produto,
  e o extrato bancário nunca mostra. Extrato conta o passado; maquininha conta o
  futuro. Começar por um adquirente só.
- **Com investimento: Open Finance.** Via agregador autorizado (Pluggy, Belvo,
  Tecnospeed, Celcoin), pois acesso direto exige autorização do Banco Central.
  Tecnicamente simples, mas o piso mensal dos agregadores hoje inviabiliza no
  estágio atual. Entra quando o volume de clientes pagantes justificar.

**Consequência de arquitetura:** toda nova fonte de dado **converte para o mesmo
schema canônico de lançamentos** antes de chegar ao core. O core nunca sabe de
onde o dado veio.

## Convenções

- Dinheiro em **centavos**, inteiro. Nunca float. Nunca.
- Datas em UTC no banco; exibir em America/Sao_Paulo.
- Todo indicador retorna também as entradas que usou (auditoria).
- Parser tolerante: o arquivo vai vir errado, com coluna a mais, com
  encoding estranho. Falhar com mensagem clara, nunca silenciosamente.

## Fora de escopo (não implementar)

Integração com API de ERP · Open Finance · emissão fiscal · multiusuário ·
segundo nicho · cobrança dentro do app (venda acontece no site)

## Tokens da marca

Marca **Pulso** (própria, se sustenta sozinha). Fonte única de verdade:
`packages/tokens/src/index.ts` — ver `packages/tokens/DESIGN.md` e o board
`packages/tokens/design-system.html`. App e site derivam dali; nunca escreva hex
cru na UI, use o nome semântico.

Cores: escuro do sistema `#37373F` (estrutura sóbria) ·
vivo `#23C883` (o pulso, positivo — único ponto de cor viva) · papel `#F5F4F2`
(fundo) · tinta `#2A2A31` (texto) · cinza `#838993` (secundário) · linha
`#E0DEDA` · alerta `#E39A26` · crítico `#D8503F`

O crítico só aparece em risco real de caixa. Vermelho abundante vira ruído. A cor
viva e as de severidade são função (o dono precisa distinguir "tudo bem" de "seu
caixa zera" num relance), não estética — não remover em nome da sobriedade.

Fontes: as oficiais de títulos são licenciadas (comprar para uso oficial).
Substitutas em uso: **Josefin Sans** (títulos,
geométrica fina) · Figtree (corpo) · IBM Plex Mono (rótulos, datas). Números com
`tabular-nums`.

## Voz do produto

Fala com o dono do negócio, não com um CFO. "Você está recebendo 46 dias
depois de vender" — nunca "seu DSO está em 46". Sem jargão, sem
condescendência, com data e número concretos.

## Pontos de extensão previstos (declarados, não implementados)

Dois contratos existem no código sem implementação, de propósito, para o produto
crescer sem reescrever o núcleo. Quando forem implementados, NADA do resto muda.

- **Referência de mercado por segmento** — `packages/core/src/market-reference.ts`.
  Interface `MarketReference.benchmarkFor(segment, indicatorKey)` devolve um valor
  típico de mercado; `compareToMarket` diz se a empresa está acima/abaixo. Habilita
  "a margem média do varejo de roupa é X%, a sua está acima". Padrão =
  `NO_MARKET_REFERENCE` (nunca compara). É APRESENTAÇÃO: o core segue calculando o
  indicador da empresa; a referência só acrescenta o "em relação ao mercado". Uma
  fonte real (pesquisa própria, base setorial) implementa a interface.

- **Provedor de geração de texto** — contrato em `apps/api/src/ai/provider.ts`,
  implementações e fábrica em `apps/api/src/ai/providers.ts`. Interface
  `TextProvider.generate(request)` abstrai "dado um prompt, devolva texto". A voz
  padrão é a Anthropic (classes concretas, chat multi-turno). **JÁ PLUGÁVEL:** um
  segundo provedor (OpenAI, via HTTP puro, sem SDK) satisfaz o contrato; o
  "adaptador fino" (`alertWriterFromProvider`/`chatModelFromProvider`) liga qualquer
  `TextProvider` ao writer e ao chat. Seleção por ambiente: `PULSO_AI_PROVIDER`
  (`anthropic` padrão | `openai`) + a chave do provedor (`ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY`); sem chave, cai no texto padrão/aviso honesto. REGRA QUE NÃO
  MUDA: os fiscais (grounding de números + fiscal de juízo) ficam POR FORA do
  provedor, em `writeAlert`/`askPulso`; trocar de IA NÃO afrouxa as travas — o
  texto de qualquer provedor passa pelas mesmas verificações (testado em
  `test/providers.test.ts`).
