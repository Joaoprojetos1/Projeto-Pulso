# Pulso — Próximos passos (handoff)

> Atualizado em 20/07/2026. Leia isto ao começar uma sessão nova.
> Estado atual: tudo no ar. Servidor (Render + Neon), site
> (pulso-site.onrender.com), app Android instalável (EAS/APK), IA dos alertas
> ligada (chave Anthropic no Render), marca nova (Pulso, cinza #37373F + verde
> #23C883, Josefin Sans), comunicação GERAL (não clínica). Sem Oliveira Alves.

---

## 🔜 Próximos passos priorizados (20/07/2026)

1. **PUBLICAR a fluidez do app por OTA.** O código da Onda 2 (animações/fluidez)
   já está no main (commit `5b1a304`, tsc + build web OK) mas **ainda não foi
   publicado** — o app instalado só verá depois do `eas update`. Precisa do
   EXPO_TOKEN do João (ele cola; o Claude não digita chave). Comando, de
   `apps/mobile`: `$env:EXPO_TOKEN='...'; npx eas-cli update --branch preview
   --message "fluidez Onda 2"`. Depois o João revoga o token.
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
3. **Site (pulso-site.onrender.com), Ondas 0–3:** ligar o contato do WhatsApp
   (wa.me — confirmar o número, celular BR tem 9 dígitos após o DDD), seção de
   segurança/LGPD, FAQ antes do CTA, capa de compartilhamento (og:image) +
   favicon ECG, e animações de rolagem (hoje o site não tem JS). Auto-deploya no
   mesmo push.
4. **App — itens que dependem do servidor/IA (⚠️):** botão "O que eu faço?" no
   alerta entregar próximos passos concretos redigidos pela IA (não o app
   inventando); datas do gráfico vindas do servidor. Ficam pra depois.

**Já FEITO nesta rodada (20/07, commit 5b1a304):** Onda 2 completa — transições
entre telas, alerta subindo como painel, count-up no número principal, linha do
gráfico se desenhando, mini-cards tocáveis ("de onde vem esse número"), legenda
de tempo + ponto de risco no gráfico, chat vivo ("digitando…" animado, bolhas
suaves, 3 sugestões). Onda 0 (cor da barra, nome da clínica) já estava certa.

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
- Notificação push (o aviso chegar sozinho no celular) — coração da promessa.
- Login/autenticação de verdade (cada empresa com sua conta).
- Chatbot no WhatsApp (número de teste agora; oficial no lançamento).

## Fase C — depende do especialista / dados reais
- Leitor do arquivo real de um negócio (aguarda o modelo do especialista).
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
