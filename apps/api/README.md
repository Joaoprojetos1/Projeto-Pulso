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
(total de tokens + número de chamadas). É um endpoint interno; se
`PULSO_ADMIN_TOKEN` estiver definido no ambiente, ele passa a exigir o header
`x-admin-token` com esse valor.
