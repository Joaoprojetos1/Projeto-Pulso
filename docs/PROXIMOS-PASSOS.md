# Pulso — Próximos passos

Consolidado em 13/08/2026. O que dá pra fazer, o que espera o Marco e o que
espera o João. (Feito recente: relatório e "resumo para o contador" em PDF;
arquitetura do WhatsApp; revisão de segurança/LGPD; motor lê o cadastro na
conversa; referência de mercado pesquisada pela IA.)

## Próxima frente grande (nossa)

- **Parser dos arquivos por tipo, com IA** (ponto 4 do Marco, aprovado). A pessoa
  sobe o arquivo por um campo de TIPO (folha, maquininha, DRE…); a IA lê **só para
  extrair** os valores daquele tipo → o **código confere** → o **dono confirma**
  ("li R$ X de folha, confere?") → só então entra no motor. Respeita a regra de
  ouro (nenhum número entra sem peneira + confirmação). Toca a tela do app (a
  confirmação, no padrão do custo fixo). Cada tipo alimenta uma parte do motor:
  folha → custo fixo; maquininha → recebíveis; DRE → receita/margem; extrato →
  caixa (já feito).

## Espera o Marco (especialista)

- **Referência de mercado:** a IA já pesquisa, cita a fonte e valida — falta o
  Marco **conferir os primeiros números** contra as amostras dele.
- **Regras de juízo:** o Marco revisa a calibração (o que o produto pode ou não
  afirmar).
- **Cada segmento novo:** o Marco valida os indicadores básicos antes de entrar.

## Espera o João (operacional)

- **Ligar o WhatsApp:** conta WhatsApp Business verificada na Meta + colar as chaves
  no Render (`PULSO_WHATSAPP_PHONE_ID/TOKEN/VERIFY_TOKEN/APP_SECRET`) + cadastrar o
  webhook. A engenharia já está pronta e no ar (desligada).
- **Ver a referência de mercado:** virar admin (seu e-mail em `PULSO_ADMIN_EMAILS`)
  e disparar a pesquisa, ou ligar a atualização automática
  (`PULSO_MARKET_REFRESH_DAYS`).
- **Novo nome da marca:** destrava o site e a remodelagem geral.
- **Amostras de arquivo** (folha, maquininha, DRE): ajudam a calibrar o parser.

## Bloqueado pelo rebrand (esperar o nome)

- **Site** e **nome/logo**: quando o nome for definido, remodelamos site + app +
  identidade de uma vez (não adianta refazer antes).

## Dívidas técnicas / pendências menores

- Código morto na aba Conta (sobrou de um ajuste anterior — limpar quando der).
- Endurecimentos de segurança listados em `docs/SEGURANCA.md`.
- Referência de mercado hoje cobre clínica e varejo; restaurante entra depois.
- Um APK novo, quando formos publicar o app (juntar tudo que precisa de recurso
  nativo numa build só). Hoje você testa tudo pelo `/app` no navegador.
