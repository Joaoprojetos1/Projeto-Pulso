# @pulso/api

API do Pulso: carrega dados, chama o `packages/core` (que faz TODA a conta) e
persiste o resultado. **Nenhuma conta financeira acontece aqui** — a regra de
ouro do repo vale também neste pacote.

## Rodar

```bash
pnpm db       # sobe um Postgres local em .pgdata/ (não precisa instalar nada)
pnpm migrate  # aplica o schema e as migrações
pnpm seed     # popula clínicas de demonstração
pnpm dev      # sobe a API em watch
pnpm test     # roda os testes (Vitest + Postgres embutido)
```

Copie `.env.example` para `.env` e preencha o `DATABASE_URL`. Tudo relacionado a
IA é opcional: **sem `ANTHROPIC_API_KEY`, os alertas e a conversa usam o texto
padrão determinístico** e o servidor funciona igual.

## Modelo de IA por superfície

A voz do alerta e a conversa têm exigências diferentes, então **cada uma tem o
seu próprio modelo**, definido em `src/ai/models.ts`:

| Superfície | Constante    | Variável de ambiente | Padrão              | Por quê |
|------------|--------------|----------------------|---------------------|---------|
| Alerta     | `ALERT_MODEL`| `PULSO_ALERT_MODEL`  | `claude-opus-4-8`   | Curto, crítico e raro — vale o modelo mais forte. |
| Conversa   | `CHAT_MODEL` | `PULSO_CHAT_MODEL`   | `claude-sonnet-4-6` | Mais leve e frequente — um modelo mais barato dá conta. |

- `src/ai/writer.ts` (voz do alerta) usa `ALERT_MODEL`.
- `src/ai/chat.ts` (conversa) usa `CHAT_MODEL`.

**Trocar de modelo é só mexer na variável de ambiente** — nada de editar código.
Ex.: para levar a conversa também para o Opus, defina
`PULSO_CHAT_MODEL=claude-opus-4-8` no ambiente (no Render: Environment → Add
variable → Save, rebuild, and deploy) e reimplante.

> Migração: a antiga `PULSO_AI_MODEL` (única para os dois) foi substituída por
> `PULSO_ALERT_MODEL` e `PULSO_CHAT_MODEL`. Se ela estava definida em algum
> ambiente, apague-a e configure as duas novas.

## Medição de consumo da IA

Toda chamada à Anthropic — do alerta e da conversa, **inclusive as reprovadas
pelo fiscal (grounding)** — é registrada na tabela `ai_usage` (empresa, tipo,
**modelo que respondeu**, tokens de entrada/saída, data). É só medição: não muda
em nada o comportamento da IA.

O consumo agregado por empresa, tipo, modelo e mês fica em `GET /admin/ai-usage`
(total de tokens + número de chamadas). É uma rota da área de operação: exige
**papel admin** (o guard responde 404 para quem não é), como todas as `/admin/*`.

## Deploy e operação

- **Migrações no boot.** `pnpm start` (index.ts) roda `migrate()` antes de escutar.
  As migrações são **idempotentes** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF
  NOT EXISTS`, `ON CONFLICT DO NOTHING`) e registradas em `schema_migrations` — só
  aplicam o que falta. Não há passo manual de migração no deploy.
- **Healthcheck de verdade.** `GET /health` faz um `SELECT 1`: responde `200 {ok:true}`
  quando o banco responde e `503 {ok:false}` quando não. Serve de readiness no Render.
- **Desligamento gracioso.** `SIGTERM`/`SIGINT` fecham o servidor e o pool antes de sair.
- **Cold start (Render free).** O plano gratuito hiberna após ~15 min sem tráfego,
  e a primeira visita seguinte demora ~30–50s. Há um **keepalive** que pinga o
  próprio `/health` a cada ~10 min (liga com `NODE_ENV=production` ou
  `PULSO_KEEPALIVE=1`; intervalo por `PULSO_KEEPALIVE_MS`). Isso é **paliativo** —
  a **solução definitiva é um plano pago** (sem hibernação). Um monitor externo de
  uptime batendo na URL pública também ajuda enquanto o plano for gratuito.
- **Pool do banco.** Dimensionado por `PGPOOL_MAX` (padrão 10), com `idle_timeout`
  e `connect_timeout` (falha rápido em vez de pendurar a requisição).
