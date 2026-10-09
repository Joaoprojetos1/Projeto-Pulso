# IVO: próximos passos

Atualizado em 08/10/2026. Leia isto ao começar uma sessão nova, junto com o
[`CLAUDE.md`](CLAUDE.md). O mapa completo, tarefa por tarefa, está na
[página de andamento](https://joaoprojetos1.github.io/Projeto-Pulso/)
(fonte: `docs/andamento.html`). As versões anteriores deste arquivo (julho e
agosto) estão no histórico do git.

## Onde estamos

Tudo no ar: site em seuivo.com.br, app no navegador em seuivo.com.br/app,
servidor no Render (`pulso-api`) com banco Neon, IA ligada. O último trabalho
de produto foi em 23/09 (ajustes do site e CNPJ).

O código não é mais o gargalo. Das 21 tarefas abertas no mapa, a maioria espera
uma decisão ou uma pessoa, não programação.

## 1. Voltar a ter um caminho de compra (decisão do CEO)

Os planos e as perguntas frequentes saíram do site em 18/09. Hoje a página
termina num formulário de contato e num botão de WhatsApp.

- **Definir os planos** (nomes, preços, o que cada um inclui). O HTML da seção
  antiga está guardado em `rascunhos/planos-faq.html`; os valores vivem em
  `site/precos.js` e na tabela `plans` do servidor.
- **Escolher o meio de pagamento** (Asaas, Pagar.me ou Stripe). O servidor já
  tem a porta pronta (`POST /webhooks/subscription`, protegida por
  `PULSO_WEBHOOK_SECRET`); falta só o adaptador do provedor escolhido.
- **Desligar o modo de teste de assinatura** quando a cobrança real existir.
  Hoje ele está ligado: ativa o plano na hora, sem cobrar.

## 2. O que espera o especialista (Marco)

Nenhum destes itens trava o produto de funcionar, mas todos travam dizer que
ele está calibrado.

**Desde 08/10 ele tem a bancada do especialista** (app → aba Operação →
"Bancada do especialista", ou direto em seuivo.com.br/app/admin/especialista).
Ali ele escreve o que o Ivo deve recomendar, testa com os números de uma
empresa e publica, sem passar por código. Isso cobre os textos da IA (item 5).
Os itens 1 a 4 ainda dependem de código e são as próximas fatias da bancada,
nesta ordem: limiares do diagnóstico com prévia do efeito, depois as perguntas
do diagnóstico de gestão e as médias de mercado.

Para ele usar: precisa de conta no app com papel admin (ver item 3) e do
servidor sempre ligado. A bancada ainda não foi usada com a IA de verdade por
ninguém; o primeiro uso dele é também o primeiro teste em produção.

1. **Limiares do diagnóstico e prescrição por estágio.** As réguas de Saudável
   a UTI são premissas (`PREMISSA_V1` em `packages/core/src/diagnosis.ts`). A
   forma combinada de calibrar é uma sessão de casos: 6 a 8 empresas fictícias,
   o Ivo dá o veredito e o Marco concorda ou corrige.
2. **Regras de juízo** (`packages/core/src/claims.ts`): o que o produto pode ou
   não afirmar com os dados que tem.
3. **Referência de mercado.** A IA pesquisa a média do setor e guarda com a
   fonte. Falta conferir os primeiros números contra as amostras dele. Hoje
   cobre clínica e varejo.
4. **As 15 perguntas do diagnóstico de gestão.** Revisar o conteúdo. Defeito
   conhecido: as perguntas de setor não filtram pelo segmento escolhido (a 15ª
   é de delivery mesmo para varejo).
5. **Textos da IA** e **auditoria final das fórmulas** contra a planilha dele.
6. **Fonte do site.** O site usa uma letra serifada nos títulos (Newsreader) e
   o app segue com Manrope. É um desvio de identidade que ele ainda não viu.
7. **Pró-labore:** hoje conta como custo. A decisão final é dele.

## 3. O que espera o João (operacional)

- **Render sempre ligado** (US$ 7/mês). No plano gratuito o servidor hiberna e o
  primeiro toque demora de 30 a 50 segundos. É a causa da lentidão apontada no
  teste de fluxo.
- **WhatsApp:** conta WhatsApp Business verificada na Meta, depois as variáveis
  `PULSO_WHATSAPP_PHONE_ID`, `PULSO_WHATSAPP_TOKEN` e
  `PULSO_WHATSAPP_VERIFY_TOKEN` no Render e o cadastro do webhook
  (`/webhooks/whatsapp`). O canal está construído e desligado; a tela do app
  abre sozinha quando houver credencial.
- **Aplicativo instalável novo (APK).** O de julho tinha o nome antigo e o link
  expirou. O próximo junta tudo que só entra em versão instalável: nome e ícone
  do Ivo, aviso automático (Firebase), envio de arquivo pelo celular, biometria
  e relatório em PDF nativo. Precisa de um token da Expo.
- **Administradores:** quem estiver em `PULSO_ADMIN_EMAILS` vira admin ao
  entrar. Conferir se o e-mail do Marco está lá e se ele já criou a conta.
- **Arquivos reais de mais empresas** para calibrar folha, maquininha e
  relatórios. Os leitores de extrato já foram conferidos contra dois casos
  reais. Dado real nunca entra no repositório.
- **Limpar as contas de teste** deixadas em produção (`*@teste.pulso`), pelo
  painel de operação.
- **Rodapé do site:** a razão social contém "Oliveira Alves". Foi publicada por
  ser a identificação legal de quem vende; dá para deixar só o CNPJ.

## 4. O piloto

Nenhuma empresa real usa o Ivo ainda. É a frente com mais valor e a única em
zero. Ela precisa de: servidor sempre ligado, uma empresa disposta, os arquivos
de um mês fechado dela, e alguém acompanhando (o painel de operação mostra o
dossiê de cada empresa).

## 5. Código que dá para fazer sem esperar ninguém

- Filtrar as perguntas de setor do diagnóstico pelo segmento escolhido.
- Distribuição visual da segunda tela do app (ficou sem direção no teste).
- Referência de mercado para restaurante.
- Endurecimentos listados em [`docs/SEGURANCA.md`](docs/SEGURANCA.md).
- O app continua claro e o site ficou escuro. Se incomodar: escurecer o app ou
  levar o site para um meio-termo.

## Como trabalhar (lembretes)

- Seguir o `CLAUDE.md` (regras inegociáveis, marca e voz). Ele pode mudar: reler
  no início da sessão.
- Commit e push a cada entrega, direto na `main`. `git pull --rebase` antes do
  push e nunca `git add -A` cego: só os arquivos tocados.
- **A cada entrega, atualizar `docs/andamento.html`** (marcar a tarefa na frente
  certa, somar o contador, acrescentar ao diário) e este arquivo. Foi o que
  ficou sem ser feito entre agosto e outubro.
- Publicar o app no navegador: exportar o web e copiar para `site/app`
  (`git add -f site/app`).
- DNS do seuivo.com.br: mexer só no registro A da raiz e no CNAME do `www`. Os
  registros MX, TXT, `mail` e `webmail` são do e-mail e não se toca.
- Arquivo com acento não se reescreve com `Get-Content` no PowerShell 5.1
  (corrompe). Usar a ferramenta de edição ou `[IO.File]::ReadAllText`.
- Linguagem simples com o João, que não é desenvolvedor.
