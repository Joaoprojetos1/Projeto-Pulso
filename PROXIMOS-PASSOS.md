# Pulso — Próximos passos (handoff)

> Atualizado em 22/07/2026. Leia isto ao começar uma sessão nova.
> **Comece pela seção "ATUALIZAÇÃO 22/07" logo abaixo — é o estado mais recente.**
> Estado atual: tudo no ar. Servidor (Render + Neon), site
> (pulso-site.onrender.com), app Android instalável (EAS/APK), IA dos alertas
> ligada (chave Anthropic no Render), marca nova (Pulso, cinza #37373F + verde
> #23C883, Josefin Sans), comunicação GERAL (não clínica). Sem Oliveira Alves.

---

## 🆕 ATUALIZAÇÃO 22/07 — backlog itens 12–18 + decisões (handoff)

> Várias sessões rodaram em paralelo. O que segue é o estado do backlog grande
> (itens 12–18) e as decisões pendentes. Concluídos aparecem com o commit.

### ✅ Feito recentemente
- **Medição de consumo da IA** (commit `a0998cd`): tabela `ai_usage` grava CADA
  chamada à Anthropic (alerta + chat), inclusive as reprovadas pelo grounding, com
  o modelo que respondeu e os tokens. Endpoint interno `GET /admin/ai-usage`
  (agrega por empresa/tipo/modelo/mês; trava opcional por `PULSO_ADMIN_TOKEN`).
- **Modelo de IA por superfície** (commit `74e457b`): `apps/api/src/ai/models.ts`
  exporta `ALERT_MODEL` (padrão `claude-opus-4-8`) e `CHAT_MODEL` (padrão
  `claude-sonnet-4-6`), lidos de `PULSO_ALERT_MODEL` / `PULSO_CHAT_MODEL`. Alerta no
  Opus, conversa no Sonnet (mais barata). A antiga `PULSO_AI_MODEL` saiu — se estiver
  setada no Render, apagar. **Conversa fica no Sonnet por ora** (revisar após o piloto,
  com os dados do `ai_usage`).
- **Item 13 — Simulador "e se" (core + API)** (commit `df0182c`): `packages/core/src/
  simulate.ts` (puro, testado) — `simulate(snapshot, deltas)` aplica ajustes
  hipotéticos (`delayPayable | anticipateReceivable | adjustFixedCost | addPlanned`)
  a uma CÓPIA e roda o mesmo `projectCash`, devolvendo curva real, curva simulada e
  as duas datas de zeragem. Sem IA. `POST /me/simulate` no server. `projectCash`
  ganhou um parâmetro opcional e ADITIVO (`fixedCostOverrideCents`) só para modelar
  corte de custo fixo — **não muda nenhum resultado existente** (validar com o Marco).
  67 testes no core, 98 na API.
- **Item 18 — Site (calculadora + legais + preço único)** (commit `11986fd`):
  `site/calculadora.html` (efeito tesoura, cálculo simples 100% no navegador, posta
  na lista com `source:'calculadora'`), `site/privacidade.html` + `site/termos.html`
  (LGPD completa; **CNPJ/e-mail/DPO/data são placeholders `[a definir]` — revisar
  com jurídico ANTES de publicar nas lojas**), `site/precos.js` (fonte única dos
  preços, planos e FAQ preenchem via `data-preco`). `site/pagina.css` compartilhado.
- Feito por outras sessões (ver git log): motor de **diagnóstico P1–P8**, **chat com
  memória**, **recuperação de senha**, **métricas do piloto** (`/admin/pilot-metrics`),
  **histórico de alertas + lido/agido**, **cache offline** do dashboard, **cota de chat**
  (`0007_chat_quota`, `/me/chat` responde 402 ao estourar), adaptador **stub do WhatsApp**.

### 🔲 Itens do backlog que FALTAM

**Regra de ouro dos módulos nativos:** háptico, captura de imagem, biometria e o
date picker nativo são MÓDULOS NATIVOS — **não vão por OTA**, exigem **APK novo**.
O João **não quer APK novo agora** ("ainda vamos mexer"). Quando quiser, **juntar
tudo num APK só**: Firebase/FCM (push, já pendente) + `expo-haptics` (12) +
`react-native-view-shot` (15) + `expo-local-authentication` (17) + date picker (17).

- [ ] **Item 12 — Polimento de fluidez (app).** (a) `expo-haptics`: leve ao enviar
  pergunta no chat e confirmar conta; distinto (`notificationAsync` warning) ao abrir
  alerta crítico; sutil ao completar o pull-to-refresh — **nada além disso** [NATIVO→APK].
  (b) **Erros com retry inline**: no chat, mensagem que falhou fica na lista como
  "não enviada · tocar para reenviar" (reenvia sem redigitar); nas telas de dados,
  falha de rede mostra botão de retry inline, **nunca `alert()` nativo** [pode ir por OTA].
  (c) **Deep link** `/alerta/:id` no expo-router, e o handler de push já monta a URL do
  alerta — quando o push destravar, tocar na notificação cai direto no alerta [OTA].
- [ ] **Item 13 (parte APP).** Core+API já prontos (acima). Falta a UI: no detalhe da
  projeção (ou no alerta de caixa), modo "E se" com chips ("adiar maior pagamento 15d",
  "cortar R$ 1.000 de custo fixo", "antecipar maior recebível"), gráfico com as DUAS
  curvas (real cheia + simulada tracejada) e as duas datas de zeragem legendadas, botão
  "limpar", e rótulo "SIMULAÇÃO · nada foi alterado de verdade". Consome `POST /me/simulate`.
- [ ] **Item 14 — Gráfico interativo (scrubbing).** Evoluir o `PulseLine` do app:
  arrastar o dedo mostra marcador vertical + balão "data · valor". **Server:** expor a
  CURVA DIÁRIA da projeção no dashboard (o core já a calcula; o `simulate` já devolve a
  série `{day, cents}` — dá pra expor no `/me/dashboard` como pontos no Indicator, sem o
  app interpolar). Suportar 2 séries (real + simulada, casa com o 13). Acessibilidade:
  `accessibilityLabel` resumindo a projeção. Performance: reanimated, sem re-render por frame.
- [ ] **Item 15 — "Mandar pro contador" (app).** No detalhe do alerta, botão que gera
  uma imagem limpa (título, corpo, o "de onde vem esse número" completo, data, wordmark
  do Pulso + site no rodapé) via `react-native-view-shot` de um componente PRÓPRIO de
  exportação (não a tela ao vivo), e abre o share sheet nativo. Fundo papel, sem navegação.
  Na demo, a imagem carrega o selo de dados fictícios. [NATIVO→APK]
- [ ] **Item 16 — Resumo da semana.** **Server:** ao gerar um snapshot, se existir um
  anterior de ≥5 dias antes, gerar via writer (modo novo `'weekly'`, fiscalizado pelo
  grounding com os facts dos DOIS snapshots) um resumo de ≤3 frases (o que mudou em
  caixa/ciclo/receita e o que observar); gravar junto ao snapshot; fallback por template
  quando o grounding reprovar (como nos alertas). **App:** card "Sua semana" no topo do
  dashboard quando houver resumo novo (lido/não-lido controlado localmente), abrindo uma
  tela simples com o texto e as variações (setas já padronizadas).
- [ ] **Item 17 — Endurecimento pré-piloto (app).** (a) **Biometria**
  (`expo-local-authentication`): opção na Conta "Pedir biometria ao abrir" (default
  ligado quando disponível); ao voltar do background após 2 min, exige de novo; fallback
  senha; **demo nunca pede** [NATIVO→APK]. (b) **Contas completas na UI** (a API já
  suporta): date picker de data livre (mantendo os presets como atalhos) [date picker
  nativo → APK], edição de conta (valor, data, categoria, contraparte), toggle "repete
  todo mês" (campo `recurrence`). Quando a Fase 2 do motor estiver ativa, mostrar o
  impacto na projeção ("essa conta muda sua data de risco de 18/set para 30/set") usando
  o resultado do core, **nunca calculando no app**.
- [ ] **Item 18 — pendências do site (dependem do João/CEO):** revisão jurídica das
  páginas legais + preencher CNPJ, e-mail de privacidade/DPO e data de vigência (hoje
  `[a definir]`); alinhar os valores em `site/precos.js` com a cota (item 2) e o app
  quando os planos/cota forem fechados; opcional: URL limpa `/privacidade` (rewrite no
  Render) em vez de `privacidade.html`.
- [ ] **Fase 2 do motor de contas** (já listada abaixo) — pré-requisito do "impacto na
  projeção" do item 17 e alimenta o item 14. **É fórmula nova: validar desenho com o Marco.**

### 📌 Decisões pendentes (NÃO são tarefas prontas — dependem de dado/pessoa)

| Decisão | Depende de | Quando |
|---|---|---|
| Modelo definitivo do chat (Opus × Sonnet) | 2–4 semanas de `ai_usage` | Após o piloto iniciar |
| Valores finais de cota por plano | Mesmo dado + preços dos planos | Junto com a cobrança |
| Calibração dos limiares P1–P8 | Sessão de casos com o Marco | 2ª rodada, não trava |
| Prescrição por estágio (conteúdo do writer) | Mesma sessão com o Marco | idem |
| Parser do CSV real | Arquivo-modelo do Marco | **Trava o piloto** |
| FCM/Firebase para push | Config externa (Marco/conta) | Antes do piloto, se der |
| Nome da IA (Cora / Vita / Compasso / sem nome) | Decisão de marca | Antes do WhatsApp |
| Entrada por voz no chat | Validar chat por texto primeiro | Pós-piloto |
| Dark mode e SEO/conteúdo contínuo | Fôlego | Pós-piloto |
| Depoimentos no site | 2 frases reais colhidas no piloto | Pós-piloto (**nunca simular**) |

### 🤝 Coordenação (várias sessões ao mesmo tempo)
- `git pull --rebase` antes de push; **nunca `git add -A` cego** — stage só os arquivos
  que a sua sessão tocou. Se houver mudança não-sua no working tree, deixe quieta (é de
  outra sessão) e não a commite.
- Módulos nativos SÓ entram com APK novo (ver regra de ouro acima). Nunca adicionar um
  módulo nativo a um update OTA — quebra o app instalado.

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

## 🧩 Evolução do app — Contas (Previsto vs Realizado)

Spec do CEO (21/07). Decisões: construir agora como PLANEJAMENTO do dono (tudo
marcado PREVISÃO; Marco valida antes de virar "oficial"); dados salvos na CONTA de
verdade (servidor, ligado ao login); avatar do topo abre a aba Conta.

- [x] **FASE 1 — fundação (dados + cadastro). PUBLICADA (21/07).** Server: migração
  `0004_planned_entries` (camada PREVISTO **separada** de `entries`/REALIZADO — nunca
  se misturam), rotas `/me/contas` (criar/listar por visão), `/me/contas/:id/confirmar`
  (graduar: guarda `confirmed_on` = data real, para o futuro aprendizado de atraso),
  DELETE. 6 testes (61 total). App: aba **Contas** (a receber/a pagar), cadastro de
  baixo atrito (valor, cliente/fornecedor, categoria em chips, data em chips de prazo,
  natureza avulsa/recorrente), ciclo de vida na tela (prevista/venceu-confirmar?/
  aconteceu), botão graduar + excluir; avatar abre a Conta. Commits: 471bfe0 (server)
  + 9f764fc (app). OTA update group `d5ac7d7f`. E2E validado em produção.
  - Data sem seletor nativo (chips de prazo) de propósito: seletor nativo exigiria APK.
- [ ] **FASE 2 — motor (projeção + cascata).** Previsto alimenta a projeção de caixa;
  recorrência (monthly) expandida no horizonte 30/60/90; conta VENCIDA sem confirmação
  empurra a data realista (NUNCA assumir entrada que não aconteceu); recálculo em
  cascata a cada cadastro/confirmação; tudo auditável ("de onde vem esse número").
  **É a parte de fórmula nova — validar desenho com o Marco (ver decisão).**
- [ ] **FASE 3 — aprendizado (graduação).** Ao confirmar, registrar atraso do cliente
  (due_on × confirmed_on) e afinar as próximas projeções/alertas daquele cliente.
- [x] **FASE 4 — ajustes existentes. FEITA (21/07, OTA `3577cee0`).** (1) Chat
  determinístico na demo: `perguntas.ts` responde as 3 perguntas ("quando o caixa
  zera", "quem me deve", "dá pra pagar as contas do mês") com os números já
  calculados, sem IA (commit 3066bd5). (2) Tendência nos 3 indicadores do topo:
  server `buildDashboard` devolve `comparativos` (atual × anterior — Receita usa o
  mês anterior do snapshot; Ciclo/Margem usam o snapshot anterior, aparecem só com
  histórico, nunca inventam); app desenha a seta ↑/↓ verde(melhora)/laranja(piora)
  (commits 3c6145c server + 1df92fc app). Avatar já foi na Fase 1.
- Estruturar só (não construir): integrações preenchem o REALIZADO automático;
  simulação de cenários ("e se o maior cliente atrasar 15d?"); camada de padrão/sazonalidade.

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
