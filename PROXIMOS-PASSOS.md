# Pulso — Próximos passos (handoff)

> Atualizado em 20/07/2026. Leia isto ao começar uma sessão nova.
> Estado atual: tudo no ar. Servidor (Render + Neon), site
> (pulso-site.onrender.com), app Android instalável (EAS/APK), IA dos alertas
> ligada (chave Anthropic no Render), marca nova (Pulso, cinza #37373F + verde
> #23C883, Josefin Sans), comunicação GERAL (não clínica). Sem Oliveira Alves.

---

## 🔜 Próximos passos priorizados (20/07/2026)

1. ✅ **FLUIDEZ PUBLICADA POR OTA (20/07)** — `eas update --branch preview`,
   update group `91607898-5316-4f66-ab34-df11b60cb4d8`, runtime 0.1.0 (casa com o
   APK instalado, canal preview), commit c4dba64. O app baixa na abertura e aplica
   no reinício seguinte (abrir → fechar → abrir pra ver). Token EXPO usado foi
   pedido pra REVOGAR (expo.dev/settings/access-tokens).
2. **Destravar o PUSH (Firebase/FCM).** O push NÃO funciona no APK atual: o
   Android exige que o app esteja ligado a um projeto Firebase (FCM), e isso
   nunca foi configurado — não há `google-services.json` no projeto e o
   `getExpoPushTokenAsync` falha em silêncio (por isso `push-test` responde
   `sent:0 / nenhum aparelho registrado`). Passos: (a) João cria projeto no
   Firebase Console e adiciona o app Android `com.vetorfinancas.pulso` → baixa
   `google-services.json`; (b) subir a credencial FCM V1 pro Expo
   (`eas credentials` ou expo.dev); (c) plugar o `google-services.json` no
   projeto (app.json `android.googleServicesFile`); (d) **APK novo** (não vai por
   OTA) e reinstalar; (e) então `push-test` na Clínica Horizonte
   (id 5e330c08-9a71-4f9e-9e0a-5f909f01d099) deve chegar no celular.
3. **Site (pulso-site.onrender.com):** FEITO (commit e12d3dd) — seção de
   segurança/LGPD, FAQ antes do CTA, favicon ECG, capa de compartilhamento
   (og:png 1200x630 gerado com System.Drawing), animações de aparecer ao rolar
   (1º JS do site, respeita prefers-reduced-motion). O contato WhatsApp já estava
   ligado. **⚠️ PENDENTE do João:** confirmar o NÚMERO do WhatsApp —
   `wa.me/553194287877` tem só 8 dígitos após o DDD 31 (celular BR = 9). Se
   faltou um dígito, o único botão de contato do site leva pro vazio. Corrigir em
   todos os `wa.me/...` do site/index.html quando confirmar.
4. ✅ **SEGUNDA LEVA PUBLICADA POR OTA (20/07)** — update group
   `7cf7d0dc-38e2-44f5-b890-1a21fa969742`, commit 9a59958. Fecha quase todos os
   itens restantes do documento: alerta "O que eu faço?" com passos concretos
   (acoes.ts — texto-modelo por ruleKey usando os facts do servidor; app não
   calcula), esqueleto no painel, login não entra vazio no erro 503 (mostra erro +
   "tentar de novo" + link opcional pra demonstração), seção de avisos WhatsApp na
   Conta, e no SITE os números que contam ao entrar na tela.

### Único item do documento que FALTA (precisa de APK novo, não OTA)
- **[App] Vibração leve ao toque (expo-haptics).** É módulo NATIVO — não pode ir
  por OTA (quebraria o app instalado). Fazer JUNTO com o APK do Firebase/push, pra
  o João instalar uma vez só. NÃO adicionar `expo-haptics` num update OTA antes do
  APK ter o módulo.
- (Adiados de propósito: datas do gráfico vindas do servidor e refinamentos de IA
  no alerta — o "O que eu faço?" hoje usa texto-modelo determinístico, que é seguro
  e sempre correto.)

**Resumo do documento pulso-proximos-passos.md:** ~24 de ~25 itens FEITOS. Só
falta a vibração (agrupada com o APK do Firebase). Commits desta rodada: 5b1a304
(Onda 2), e12d3dd (site LGPD/FAQ/favicon/og/animações), 5107907 (itens finais app),
9a59958 (números no site).

---

## ✅ Fase A publicada pelo ar (20/07)

As melhorias da Fase A (itens 1, 3, 5) foram publicadas por **OTA** para o app
instalado (branch `preview`, update group `bd4d9c88-…`). O app se atualiza
sozinho na próxima abertura. Não precisou de APK novo.

> Para publicar OTA de novo: de `apps/mobile`, com login na Expo
> (`npx eas-cli login`) ou `$env:EXPO_TOKEN='...'` (token de
> expo.dev/settings/access-tokens, conta `joaoprojetos25`):
> `npx eas-cli update --branch preview --message "..."`.
> (Regra: o João cola a chave; o Claude não digita chaves secretas.)

## ✅ Fase B — notificação push (código pronto, 20/07)

O coração da promessa: o aviso chega sozinho no celular. **Código feito e testado**
(48 testes na API). Junto foi o "manter logado" (async-storage). Como usa módulos
nativos (expo-notifications, expo-device, async-storage), **precisou de APK novo**.

Infra pronta (ambos resolvidos 20/07):

1. ✅ **API no Render redeployada** — a rota `/companies/:id/devices` responde 400
   (token inválido) em produção; a migração `0002_devices` (tabela dos aparelhos)
   subiu. _Obs.: o autoDeploy não disparou sozinho nesse push; foi feito Manual
   Deploy. Vale investigar ligar autoDeploy no render.yaml para os próximos._

2. ✅ **APK novo pronto** (build EAS `1a8ffd91-…`, finalizado 20/07):
   https://expo.dev/artifacts/eas/oV4ZHsCK_5EZzn87lRNoeRbNgur1t2LJvbgUG9X5EeU.apk
   (links de artefato EAS expiram; regerar com nova build se cair). Só o APK novo
   tem push (OTA não serve para módulo nativo).

**⚠️ TESTE DO PUSH FALHOU — falta o Firebase (20/07).** O João instalou o APK,
abriu, permitiu a notificação, mas o `push-test` respondeu `sent:0 / Nenhum
aparelho registrado`. Causa confirmada no código: falta configurar o **Firebase/
FCM** (sem `google-services.json`; `getExpoPushTokenAsync` falha em silêncio no
APK standalone). Ver o passo 2 da lista priorizada no topo para destravar. O
código do push (API + app) está correto; é só a credencial que falta.

---

## Fase A — acabamento do app

- [x] **1. Cold-start no login** — mensagem que evolui em vez de bolinha travada.
- [ ] **2. Tela "esqueleto" no painel** — ADIADO: no fluxo atual os dados carregam
  no login, então o painel abre instantâneo; esqueleto teria pouco valor. Só vale
  se a carga passar pro painel.
- [x] **3. Estado de vazio/erro** com botão "Tentar de novo" no painel.
- [x] **4. Manter logado** — FEITO no APK da Fase B (async-storage). Restaura a
  sessão na abertura do app.
- [x] **5. Vida/animações** — linha de pulso (ECG) com ponto final pulsante
  (reanimated) + feedback de toque nos cartões. **Ampliado na Onda 2 (commit
  5b1a304):** número "subindo" ao carregar, linha se desenhando, transições entre
  telas, alerta como painel, chat vivo. _(à espera de publicar por OTA — passo 1)._

## Fase B — funcionalidades que faltam
- Notificação push (o aviso chegar sozinho no celular) — TRAVADO no Firebase (ver
  seção "vibração/APK novo").
- [x] **Login/autenticação de verdade — FEITO (autocadastro).** Publicado por OTA
  (update group `93548c4a`, commits c7f8124 server + 9f77f34 app). Server: tabelas
  users/auth_tokens (senha scrypt, token só como sha256), rotas /auth/signup,
  /auth/login, /auth/logout, /me/dashboard, /me/chat (isolado por usuário). App:
  tela alterna entrar/criar conta; mantém logado pelo token (AsyncStorage). Conta
  nova entra com painel vazio (sem chutar número). **Escolha do João: cliente se
  cadastra sozinho.** 55 testes no server.
  - _Obs.: como o storage mudou de 'pulso.logado' p/ 'pulso.token', quem já estava
    "logado" no app cai na tela de login após este OTA — cadastra ou usa a demo._
- Chatbot no WhatsApp — PARADO por ora (João: "deixa pra depois"; precisa conta
  WhatsApp Business + provedor Meta/Twilio).

## Fase C — depende do especialista / dados reais
- Leitor do arquivo real de um negócio (aguarda o modelo do especialista Marco).
- [x] Datas do gráfico vindas do servidor — FEITO (a legenda hoje/+Nd usa os
  horizonDays que o servidor manda, não valores fixos).
- Piloto com empresa de verdade.

## Fase D — depende do CEO / negócio
- Pagar.me (cobrança) · CNPJ + termos/privacidade · domínio próprio · logo
  oficial · premissas comerciais.

## Rápidos / opcionais
- Limpar 2 vestígios INTERNOS da Oliveira Alves (invisíveis ao usuário): nomes de
  token `oaEscuro`/`oaClaro` em `packages/tokens` e o board
  `packages/tokens/design-system.html`.
- Site: imagem de capa (og:image) + favicon com o ECG; seção de segurança/LGPD; FAQ.

---

## Como trabalhar (lembretes)
- Seguir o `CLAUDE.md` do repo (regras inegociáveis + marca + voz).
- Commit + push a cada alteração. `git pull --rebase` antes do push (pode haver
  outra sessão em paralelo); nunca `git add -A` cego — só os arquivos tocados.
- Linguagem simples com o João (não é dev). Preview do app no PC:
  `pnpm --filter @pulso/mobile web` → moldura de celular em uma página com iframe.
