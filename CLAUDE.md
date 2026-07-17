# Pulso

Assistente financeiro para pequenas empresas brasileiras. Recebe dados
financeiros, calcula indicadores e usa IA para interpretar e alertar o dono
antes do caixa acabar.

Público do MVP: clínicas médicas (nicho único). Não generalizar.

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

Cores: mata `#0E2E2A` (primário) · vivo `#23C883` (pulso, positivo) ·
papel `#F6F4EE` (fundo) · tinta `#13221F` (texto) · cinza `#5F6F6B` ·
alerta `#E39A26` · crítico `#D8503F`

O crítico só aparece em risco real de caixa. Vermelho abundante vira ruído.

Fontes: Sora (títulos e números, `tabular-nums`) · Figtree (corpo) ·
IBM Plex Mono (rótulos, datas).

## Voz do produto

Fala com o dono da clínica, não com um CFO. "Você está recebendo 46 dias
depois de atender" — nunca "seu DSO está em 46". Sem jargão, sem
condescendência, com data e número concretos.
