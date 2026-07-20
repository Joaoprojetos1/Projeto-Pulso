# Colocar o Pulso na nuvem (sem gastar nada)

Objetivo: o app funcionar sozinho na internet, sem depender do seu computador
ligado com o túnel. Duas peças gratuitas:

- **Neon** — o banco de dados (onde ficam os números). Sem cartão.
- **Render** — o servidor (o cérebro que o app consulta). Sem cartão.

> Aviso honesto do plano grátis: quando ninguém usa por uns minutos, o servidor
> "dorme". A próxima visita demora ~30 a 50 segundos pra acordar; depois fica
> rápido. O app já foi preparado pra esperar essa primeira visita sem quebrar.

Você faz os passos 1 e 2 (criar contas e copiar dois textos). O resto (ligar
tudo e povoar as clínicas de teste) eu faço quando você me passar esses textos.

---

## Passo 1 — Banco de dados no Neon

1. Entre em **https://neon.tech** e clique em **Sign up**. Pode entrar com o
   Google (a mesma conta de sempre).
2. Ele cria um projeto automático. Se perguntar, use:
   - **Project name:** `pulso`
   - **Postgres version:** a que vier (mais alta) — tanto faz.
   - **Region:** escolha os EUA (ex.: *AWS US East*). Deixe igual à do Render
     (passo 2) pra ficar rápido.
3. Na tela do projeto, procure **Connection string** (às vezes dentro de
   *Connect* ou *Dashboard*). Vai aparecer um texto começando com
   `postgresql://...` e terminando com `...neon.tech/neondb?sslmode=require`.
4. **Copie esse texto inteiro** e me mande. É a "chave" do banco.
   - ⚠️ Esse texto é uma senha. Não poste em lugar público. Me mandar aqui está ok.

Pronto o passo 1.

---

## Passo 2 — Servidor no Render

1. Entre em **https://render.com** e clique em **Get Started** / **Sign up**.
   Use a conta do **GitHub** (assim ele já enxerga o repositório do Pulso).
2. No painel, clique em **New +** → **Blueprint**.
   - "Blueprint" faz o Render ler o arquivo `render.yaml` que já está no repo e
     montar o servidor sozinho.
3. Ele vai pedir pra escolher o repositório. Selecione **Projeto-Pulso**.
   - Se não aparecer, clique em *Configure account* e dê acesso ao Render.
4. O Render lê o `render.yaml` e mostra um serviço chamado **pulso-api**.
   Ele vai perguntar o valor de duas variáveis:
   - **DATABASE_URL** → cole aqui o texto que você copiou do Neon (passo 1).
   - **ANTHROPIC_API_KEY** → deixe **em branco** por enquanto (os alertas usam o
     texto padrão; ligamos a IA depois, quando você criar a chave).
5. Clique em **Apply** / **Create**. O Render vai construir (uns 3–5 minutos na
   primeira vez). Quando terminar, aparece um endereço tipo
   **`https://pulso-api.onrender.com`**.
6. **Copie esse endereço** e me mande.

Pronto o passo 2.

---

## Passo 3 — Eu ligo o resto

Com os dois textos (a chave do Neon e o endereço do Render), eu:

1. Confiro se o servidor respondeu (abro `.../health` — tem que dizer `ok`).
2. **Povoo as clínicas de teste** no banco novo (o comando `pnpm seed` apontando
   pro Neon), pra ter o que mostrar.
3. Aponto o **app** pra esse endereço (variável `EXPO_PUBLIC_API_URL`) e gero um
   **QR novo** na página de andamento.
4. Atualizo o mapa do projeto marcando a frente "servidor/nuvem".

A partir daí o app funciona pra qualquer pessoa, a qualquer hora, sem o seu
computador ligado.
