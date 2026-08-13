# Segurança e LGPD — Pulso (API)

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
