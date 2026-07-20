# Pulso — Próximos passos (handoff)

> Atualizado em 20/07/2026. Leia isto ao começar uma sessão nova.
> Estado atual: tudo no ar. Servidor (Render + Neon), site
> (pulso-site.onrender.com), app Android instalável (EAS/APK), IA dos alertas
> ligada (chave Anthropic no Render), marca nova (Pulso, cinza #37373F + verde
> #23C883, Josefin Sans), comunicação GERAL (não clínica). Sem Oliveira Alves.

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

## ⭐ PRÓXIMO PASSO: Fase B — notificação push

O coração da promessa: o aviso chegar sozinho no celular. Exige módulo nativo
(expo-notifications) → **precisa de APK novo** (não vai por OTA). Fazer junto com
o item 4 adiado da Fase A (**manter logado** / async-storage), que também só entra
com APK novo.

---

## Fase A — acabamento do app

- [x] **1. Cold-start no login** — mensagem que evolui em vez de bolinha travada.
- [ ] **2. Tela "esqueleto" no painel** — ADIADO: no fluxo atual os dados carregam
  no login, então o painel abre instantâneo; esqueleto teria pouco valor. Só vale
  se a carga passar pro painel.
- [x] **3. Estado de vazio/erro** com botão "Tentar de novo" no painel.
- [ ] **4. Manter logado** — ADIADO: precisa de módulo nativo de armazenamento
  (`@react-native-async-storage/async-storage`), que **NÃO pode ir por OTA**
  (quebraria o app instalado). Fazer junto com o **próximo APK novo**.
- [x] **5. Vida/animações** — linha de pulso (ECG) com ponto final pulsante
  (reanimated) + feedback de toque nos cartões. (Dá pra ir além depois: número
  "subindo" ao carregar, transições entre telas.)

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
