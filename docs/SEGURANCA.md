# Segurança e LGPD — Ivo (API)

Revisão de segurança do backend (item 7.1), 13/08/2026. Registra o que foi
auditado, o que foi corrigido, o que já estava seguro e o que fica como próximo
passo. Não é auditoria externa formal — é uma varredura interna dirigida.

## Corrigido nesta revisão

- **Vazamento de cadastro por `GET /companies/:id` (ALTA).** A rota devolvia CNPJ,
  endereço e sócios de qualquer empresa **sem exigir login**. Agora exige operador
  (admin), como a `GET /companies` já exigia. O dono continua vendo os próprios
  dados por `/me/dashboard` (escopado pela empresa dele). — `routes/companies.ts`
- **Webhook do WhatsApp sem assinatura (ALTA).** Um POST forjado poderia fazer
  nosso número enviar WhatsApp para qualquer telefone e injetar mensagens na
  conversa. Agora, com o **App Secret da Meta** configurado
  (`PULSO_WHATSAPP_APP_SECRET`), o webhook confere a assinatura HMAC
  (`X-Hub-Signature-256`) sobre o corpo cru, em tempo constante, e recusa (401) o
  que não bate. — `routes/whatsapp.ts`, `channels/whatsapp.ts`
- **Comparação de segredos em tempo constante (MÉDIA).** Os segredos de webhook
  (`x-webhook-secret` da assinatura e o `verify_token` do WhatsApp) passaram a ser
  comparados com `constantTimeEqual` (hash + `timingSafeEqual`), sem vazar por
  timing nem por tamanho. — `http.ts`, `routes/subscription.ts`, `routes/whatsapp.ts`
- **Rate limit no `POST /auth/reset-password` (BAIXA).** Alinhado com login/signup/
  forgot. — `routes/auth.ts`
- **Limites de tamanho no `POST /companies`.** `name`/`cnpj`/`niche` ganharam
  `maxLength`. — `routes/companies.ts`

## Verificado e já seguro (não mexer)

- **Injeção SQL:** toda query usa o template parametrizado do postgres.js. O único
  `sql.unsafe` é o DDL das migrações (arquivo confiável), nunca dado de request.
- **Autorização das rotas `/me/*`:** sempre escopadas pela empresa do token; todo
  UPDATE/DELETE carrega `AND company_id = ...` (sem IDOR). As `/companies/:id/*` de
  dados exigem admin. O papel admin vem do banco, nunca do token do cliente.
  Não-admin em `/admin/*` recebe 404 (não revela a área).
- **Senhas e sessão:** senha com scrypt + `timingSafeEqual`; token de sessão
  guardado só como sha256; token de reset de uso único, expira em 1h e invalida as
  sessões abertas.
- **Logs / LGPD:** nenhum log traz e-mail, telefone, CNPJ ou valores — só o id
  (UUID) da empresa. Credenciais são redigidas do log. O e-mail de recuperação
  mascara o endereço e não imprime o token por padrão.
- **Erros:** 5xx devolve mensagem genérica sem stack; 4xx devolve só a mensagem de
  validação (sem PII).
- **Upload:** avatar valida os bytes mágicos (não confia no mime) e limita a 400KB;
  importação valida base64, limita o corpo e é idempotente por hash.

## LGPD e a IA — o que sai daqui e o que nunca sai (11/09/2026)

A pergunta do item 7.1 é direta: *"como assegurar que os dados não serão
divulgados, já que estamos usando uma IA?"*. A resposta honesta tem três partes.

**1. O que a IA recebe no dia a dia: números, não dados.** A regra do projeto é
que a IA nunca calcula. Na prática isso também é uma trava de privacidade: o que
vai no prompt do alerta e da conversa é o **retrato já calculado** (indicadores,
alertas, o nome e o segmento da empresa). **Lançamento, extrato e nome de cliente
nunca entram** — está no `ai/chat.ts` e é o que o CLAUDE.md proíbe mudar.

**2. A exceção: a leitura de arquivo.** Quando o dono envia folha, maquininha ou
um relatório, o **texto daquele arquivo** é enviado ao modelo para transcrição.
Esse é o único ponto do produto em que conteúdo do cliente sai da nossa máquina.
O que foi feito para reduzir o risco:
- **CPF é mascarado pelo código antes de montar o prompt** (`mascararCpf`, em
  `ai/extract.ts`): CPF escrito e sequência crua de 11 dígitos viram `[CPF]`.
  Nenhum CPF é necessário para transcrever um valor. Valor em reais e CNPJ da
  empresa não são tocados.
- A instrução ao modelo proíbe transcrever nome de pessoa: os rótulos são
  genéricos ("Salários", "Encargos"), nunca "Fulano de Tal".
- **Nada de texto bruto é guardado nem registrado em log** — do arquivo só fica o
  par (rótulo, valor) já validado pelo código.
- **Risco remanescente, declarado:** uma folha de pagamento traz NOMES de
  funcionários no corpo do arquivo, e nome não dá para detectar por regra como se
  faz com CPF. Enquanto o dono puder enviar a folha inteira, os nomes trafegam
  para o provedor de IA durante a leitura. Mitigar de verdade exige uma das
  três: orientar o envio do RESUMO por natureza em vez da folha nominal;
  processar a folha sem IA (parser próprio por layout); ou um acordo de
  tratamento com o provedor. **Decisão do João/Marco, não do código.**

**3. Quem mais toca no dado (sub-operadores, para a política de privacidade).**
Anthropic (IA), Neon (banco, região sa-east-1), Render (servidor), Resend
(e-mail) e, quando ligado, Meta (WhatsApp). A política de privacidade publicada
precisa nomear esse arranjo e dizer que existe tratamento por IA — hoje ela é
genérica demais para o que o produto faz. **Pendência de texto, não de código.**

## Próximos passos (registrados, não urgentes)

- **`POST /companies` sem login (MÉDIA).** Cria empresa órfã (sem usuário); hoje é
  usada como semente nos testes e o cadastro real é `/auth/signup`. Recomendação:
  exigir admin ou remover a rota. Não travado agora para não quebrar a suíte.
- **Assinatura HMAC obrigatória.** Hoje a conferência do webhook do WhatsApp só
  acontece **se** o App Secret estiver configurado. Ao ligar o canal em produção,
  **configurar `PULSO_WHATSAPP_APP_SECRET`** é o que fecha o buraco.
- **Rate limit distribuído.** Hoje é em memória por instância (zera no deploy).
  Suficiente para 1 instância; ao escalar, mover para um store compartilhado.
- **CORS libera `localhost` em produção.** Risco baixo (auth é Bearer, não cookie),
  mas dá para restringir só ao ambiente de dev.
- **Rate limit em rotas públicas de escrita** (`/interesse`, `/me/company/cnpj`).
