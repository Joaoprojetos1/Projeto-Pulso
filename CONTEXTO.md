# CONTEXTO.md - Retrato do projeto Pulso

Gerado em 2026-07-22 20:51 a partir do repositorio Joaoprojetos1/Projeto-Pulso (~/Projeto-Pulso).
Documento unico para colar num chat do Claude.ai que nao tem acesso ao repositorio.

> Observacao de caminhos: **KICKOFF.md nao existe** neste repo. **docs/DESIGN.md nao existe**; o design system fica em **packages/tokens/DESIGN.md** (incluido na integra abaixo).

---

## 1. Arvore de diretorios

Saida de git ls-files, excluindo binarios (imagens, fontes, apk) e o build web em docs/app.

```
.gitattributes
.gitignore
CLAUDE.md
DEPLOY.md
PROXIMOS-PASSOS.md
README.md
apps/api/.env.example
apps/api/0002_devices.sql
apps/api/0003_auth.sql
apps/api/0004_planned_entries.sql
apps/api/0005_interest.sql
apps/api/package.json
apps/api/schema.sql
apps/api/scripts/dev-db.ts
apps/api/scripts/seed-demo.ts
apps/api/src/ai/chat.ts
apps/api/src/ai/format.ts
apps/api/src/ai/grounding.ts
apps/api/src/ai/templates.ts
apps/api/src/ai/writer.ts
apps/api/src/app.ts
apps/api/src/auth.ts
apps/api/src/db.ts
apps/api/src/http.ts
apps/api/src/index.ts
apps/api/src/migrate.ts
apps/api/src/push.ts
apps/api/src/routes/auth.ts
apps/api/src/routes/chat.ts
apps/api/src/routes/companies.ts
apps/api/src/routes/data.ts
apps/api/src/routes/devices.ts
apps/api/src/routes/interest.ts
apps/api/src/routes/planned.ts
apps/api/src/routes/snapshots.ts
apps/api/test/api.test.ts
apps/api/test/auth.test.ts
apps/api/test/chat.test.ts
apps/api/test/planned.test.ts
apps/api/test/push.test.ts
apps/api/test/writer.test.ts
apps/api/tsconfig.json
apps/api/vitest.config.ts
apps/mobile/.gitignore
apps/mobile/README.md
apps/mobile/app.json
apps/mobile/assets/expo.icon/Assets/expo-symbol 2.svg
apps/mobile/assets/expo.icon/icon.json
apps/mobile/eas.json
apps/mobile/package.json
apps/mobile/src/app/(tabs)/_layout.tsx
apps/mobile/src/app/(tabs)/chat.tsx
apps/mobile/src/app/(tabs)/conta.tsx
apps/mobile/src/app/(tabs)/contas.tsx
apps/mobile/src/app/(tabs)/index.tsx
apps/mobile/src/app/_layout.tsx
apps/mobile/src/app/alerta/[index].tsx
apps/mobile/src/app/index.tsx
apps/mobile/src/app/onboarding.tsx
apps/mobile/src/components/count-up-money.tsx
apps/mobile/src/components/logo.tsx
apps/mobile/src/components/pulse-line.tsx
apps/mobile/src/lib/acoes.ts
apps/mobile/src/lib/api.ts
apps/mobile/src/lib/demo.ts
apps/mobile/src/lib/format.ts
apps/mobile/src/lib/perguntas.ts
apps/mobile/src/lib/pulso-context.tsx
apps/mobile/src/lib/push.ts
apps/mobile/src/theme.ts
apps/mobile/theme/index.ts
apps/mobile/theme/tokens.css
apps/mobile/tsconfig.json
docs/.nojekyll
docs/andamento.html
docs/index.html
fixtures/clinica-saudavel.ts
fixtures/clinica-tesoura.ts
fixtures/fixtures.test.ts
fixtures/helpers.ts
fixtures/index.ts
fixtures/package.json
fixtures/tsconfig.json
fixtures/vitest.config.ts
package.json
packages/core/package.json
packages/core/src/index.ts
packages/core/src/indicators.test.ts
packages/core/src/indicators.ts
packages/core/src/rules.test.ts
packages/core/src/rules.ts
packages/core/src/testkit.ts
packages/core/src/types.ts
packages/core/tsconfig.json
packages/core/tsup.config.ts
packages/core/vitest.config.ts
packages/tokens/DESIGN.md
packages/tokens/design-system.html
packages/tokens/package.json
packages/tokens/src/index.ts
packages/tokens/tsconfig.json
packages/tokens/tsup.config.ts
pnpm-lock.yaml
pnpm-workspace.yaml
render.yaml
site/index.html
tsconfig.base.json
```

---

## 2. Arquivos-chave (na integra)

### `CLAUDE.md`

````md
# Pulso

Assistente financeiro para pequenas empresas brasileiras. Recebe dados
financeiros, calcula indicadores e usa IA para interpretar e alertar o dono
antes do caixa acabar.

**Foco de vendas:** pequenas empresas, comeÃ§ando pelas clÃ­nicas (Ã© onde o time
prospecta). Mas a **comunicaÃ§Ã£o do produto (app e site) Ã© GERAL** â€” fala com
qualquer dono de pequeno negÃ³cio, sem termos especÃ­ficos de setor (nada de
"convÃªnio", "paciente", "clÃ­nica" no texto). Sem nicho travado; visÃ£o de longo
prazo Ã© PMEs em geral. FÃ³rmula/indicador especÃ­fico de setor sÃ³ entra validado
pelo especialista.

## Regras inegociÃ¡veis

### 1. A IA NUNCA calcula

Todo indicador Ã© calculado em cÃ³digo, em `packages/core`, com teste unitÃ¡rio.
O modelo recebe os nÃºmeros **jÃ¡ prontos** e sÃ³ interpreta e redige.

- Dado bruto (lanÃ§amentos, extratos) **nunca** entra no prompt.
- O modelo nunca decide se deve alertar â€” quem decide Ã© a regra em cÃ³digo.
- Se vocÃª se pegar pedindo pro modelo "analisar esses lanÃ§amentos", parou:
  o cÃ¡lculo vai pro core.

Motivo: nÃºmero alucinado em alerta financeiro destrÃ³i a confianÃ§a de forma
irreversÃ­vel, e o especialista do projeto audita cada fÃ³rmula contra a
planilha dele.

### 2. `packages/core` Ã© puro

Sem I/O, sem banco, sem HTTP, sem SDK de IA. SÃ³ funÃ§Ãµes: entrada tipada,
saÃ­da tipada. Ã‰ o ativo do produto e o que Ã© auditado. TestÃ¡vel em
milissegundos.

### 3. O app Ã© burro

`apps/mobile` busca JSON e desenha. Zero lÃ³gica financeira, zero regra de
alerta. Se um cÃ¡lculo apareceu no app, ele estÃ¡ no lugar errado.

Motivo: o canal pode mudar (WhatsApp, web) e o backend nÃ£o pode mudar junto.

## Estrutura

```
apps/api/        API + persistÃªncia + integraÃ§Ã£o com o modelo + push
apps/mobile/     Expo. Telas: login, onboarding, dashboard, chat, conta
packages/core/   Indicadores + motor de regras. Puro. Testado.
fixtures/        Dados FALSOS para teste
```

## Dados: LGPD

- **Nunca** commitar export real de cliente. Dado financeiro de empresa real.
- `fixtures/` contÃ©m apenas dados inventados, com a mesma estrutura do export
  real.
- `.env` nunca versionado.
- Sem PII em log. Sem PII em mensagem de erro.

## Indicadores do v1

Calculados em `packages/core`, todos com teste:

1. Saldo de caixa atual
2. ProjeÃ§Ã£o de caixa 30/60/90d â† o principal
3. Prazo mÃ©dio de recebimento (PMR)
4. Prazo mÃ©dio de pagamento (PMP)
5. Ciclo de caixa (PMR + PME âˆ’ PMP)
6. Necessidade de capital de giro (NCG)
7. Receita vs. mÃªs anterior e vs. mesmo mÃªs do ano anterior
8. Margem de contribuiÃ§Ã£o
9. Custo fixo e ponto de equilÃ­brio
10. InadimplÃªncia e concentraÃ§Ã£o de clientes

A lista final Ã© definida com o especialista. NÃ£o adicionar indicador sem ele.

## Motor de alertas

Cada gatilho Ã© uma funÃ§Ã£o pura em `packages/core`: recebe indicadores,
devolve alerta ou nada. O modelo sÃ³ transforma o alerta em texto.

- ProjeÃ§Ã£o de caixa < 60 dias
- NCG crescendo mais rÃ¡pido que a receita (efeito tesoura)
- Ciclo de caixa piorou > 20% vs. mÃ©dia
- Receita caiu e custo fixo estÃ¡vel
- Margem caindo 2 meses seguidos
- 1 cliente > 30% do faturamento

## ConvenÃ§Ãµes

- Dinheiro em **centavos**, inteiro. Nunca float. Nunca.
- Datas em UTC no banco; exibir em America/Sao_Paulo.
- Todo indicador retorna tambÃ©m as entradas que usou (auditoria).
- Parser tolerante: o arquivo vai vir errado, com coluna a mais, com
  encoding estranho. Falhar com mensagem clara, nunca silenciosamente.

## Fora de escopo (nÃ£o implementar)

IntegraÃ§Ã£o com API de ERP Â· Open Finance Â· emissÃ£o fiscal Â· multiusuÃ¡rio Â·
segundo nicho Â· cobranÃ§a dentro do app (venda acontece no site)

## Tokens da marca

Marca **Pulso** (prÃ³pria, se sustenta sozinha). Fonte Ãºnica de verdade:
`packages/tokens/src/index.ts` â€” ver `packages/tokens/DESIGN.md` e o board
`packages/tokens/design-system.html`. App e site derivam dali; nunca escreva hex
cru na UI, use o nome semÃ¢ntico.

Cores: escuro do sistema `#37373F` (estrutura sÃ³bria) Â·
vivo `#23C883` (o pulso, positivo â€” Ãºnico ponto de cor viva) Â· papel `#F5F4F2`
(fundo) Â· tinta `#2A2A31` (texto) Â· cinza `#838993` (secundÃ¡rio) Â· linha
`#E0DEDA` Â· alerta `#E39A26` Â· crÃ­tico `#D8503F`

O crÃ­tico sÃ³ aparece em risco real de caixa. Vermelho abundante vira ruÃ­do. A cor
viva e as de severidade sÃ£o funÃ§Ã£o (o dono precisa distinguir "tudo bem" de "seu
caixa zera" num relance), nÃ£o estÃ©tica â€” nÃ£o remover em nome da sobriedade.

Fontes: as oficiais de tÃ­tulos sÃ£o licenciadas (comprar para uso oficial).
Substitutas em uso: **Josefin Sans** (tÃ­tulos,
geomÃ©trica fina) Â· Figtree (corpo) Â· IBM Plex Mono (rÃ³tulos, datas). NÃºmeros com
`tabular-nums`.

## Voz do produto

Fala com o dono do negÃ³cio, nÃ£o com um CFO. "VocÃª estÃ¡ recebendo 46 dias
depois de vender" â€” nunca "seu DSO estÃ¡ em 46". Sem jargÃ£o, sem
condescendÃªncia, com data e nÃºmero concretos.
````

### `KICKOFF.md`

_(arquivo nao encontrado no repositorio)_

### `packages/tokens/DESIGN.md`

````md
# Pulso â€” Design System

Marca prÃ³pria, que se sustenta sozinha. `design-system.html` Ã© o board visual
navegÃ¡vel.

## A regra da fusÃ£o

Estrutura sÃ³bria + sinal de vida legÃ­vel. O Pulso combina um **esqueleto neutro
e discreto** (cinzas, linha fina, muito respiro, tipografia geomÃ©trica) com o que
um produto financeiro precisa e uma planilha nÃ£o tem: **sinal de vida legÃ­vel**.

**Estrutura (sobriedade):** cinza escuro `#37373F` como escuro do sistema, linha
fina, muito respiro, tipografia geomÃ©trica, hairlines como divisores.

**Vida e sinal (exclusivo do Pulso):** verde-vivo `#23C883` como Ãºnico ponto de
cor, cores de severidade, a linha de batimento (no grÃ¡fico de caixa), nÃºmeros
tabulares com peso.

## Por que verde e vermelho ficam

Ã‰ usabilidade, nÃ£o estÃ©tica. O dono precisa distinguir "tudo bem" de "seu caixa
zera em setembro" num relance. Cinza sobre cinza nÃ£o faz esse trabalho num app
de alerta. A cor aqui Ã© **funÃ§Ã£o**. NÃ£o remover em nome da sobriedade.

## Fonte Ãºnica de verdade

Todos os valores vivem em `packages/tokens/src/index.ts`. App e site derivam
dali:
- App (Expo): o tema em `apps/mobile/src/theme.ts` espelha os tokens (mantendo os
  nomes que as telas jÃ¡ usam).
- Site: `site/index.html` usa as mesmas variÃ¡veis de cor/fonte.

Nunca escreva um hex cru na UI. Use o nome semÃ¢ntico (`semantic.accent`,
`severityColor.critical`).

## ConvenÃ§Ã£o de conteÃºdo (regra permanente)

**Nunca use travessÃ£o (â€”) nem meia-risca (â€“) em nenhum texto visÃ­vel**, no site ou
no app: copy, tÃ­tulo, placeholder, botÃ£o, mensagem, rÃ³tulo. Reescreva com ponto,
vÃ­rgula, dois-pontos ou parÃªnteses, ou quebre em duas frases. Motivo: consistÃªncia
de voz e leitura limpa em telas pequenas. Vale para todo texto novo, sempre.
(HÃ­fen normal, em palavras compostas como "somente-leitura", segue permitido.)

## Fontes

Duas famÃ­lias sustentam a marca: **Manrope** (grotesca sÃ³bria e encorpada) nos
tÃ­tulos e wordmark, e **Figtree** (humanista neutra) no corpo. No **site**, ficam
sÃ³ estas duas: rÃ³tulos e nÃºmeros usam Figtree (com `tabular-nums` e espaÃ§amento de
letra nos rÃ³tulos). No **app**, os dados e rÃ³tulos tÃ©cnicos ainda usam IBM Plex
Mono. A fonte de tÃ­tulos oficial pode ser licenciada no futuro; Manrope Ã© a de uso
atual. Atualizar sempre em `packages/tokens/src/index.ts` (fonte Ãºnica).

## PendÃªncias antes de material impresso/registro

- Logo do Pulso nÃ£o passou por busca no INPI (classes 35 e 42) nem checagem de
  domÃ­nio.
- A linha de batimento no board Ã© uma **aproximaÃ§Ã£o em SVG**; o vetor oficial da
  marca ainda serÃ¡ definido.
````

### `packages/tokens/src/index.ts`

````ts
/**
 * Pulso â€” design tokens.
 * Fonte ÃšNICA de verdade. App, site e docs derivam daqui.
 *
 * Regra da fusÃ£o: estrutura sÃ³bria (cinzas neutros) + cor viva e sinais
 * exclusivos do Pulso (funÃ§Ã£o, nÃ£o decoraÃ§Ã£o).
 */

export const color = {
  // --- estrutura: cinzas sÃ³brios ---
  oaEscuro: '#37373F', // dark do sistema: fundos, botÃ£o primÃ¡rio, Ã­cone
  oaClaro: '#838993', // secundÃ¡rio, rÃ³tulos
  tinta: '#2A2A31', // texto forte
  papel: '#F5F4F2', // fundo do app
  branco: '#FFFFFF',
  linha: '#E0DEDA', // bordas, hairlines

  // --- vida e sinal: exclusivo do Pulso ---
  vivo: '#23C883', // o pulso â€” Ãºnico ponto de cor viva
  vivoEscuro: '#158556', // texto positivo sobre fundo claro
  alerta: '#E39A26', // severidade mÃ©dia
  critico: '#D8503F', // risco de caixa â€” uso rarÃ­ssimo
} as const;

/** Mapa semÃ¢ntico. Use ESTES nomes na UI, nunca o hex cru. */
export const semantic = {
  bg: color.papel,
  surface: color.branco,
  surfaceInverse: color.oaEscuro,
  textPrimary: color.tinta,
  textSecondary: color.oaClaro,
  textOnDark: color.papel,
  border: color.linha,
  brand: color.oaEscuro,
  accent: color.vivo,
  positive: color.vivoEscuro,
  warning: color.alerta,
  critical: color.critico,
} as const;

/** Severidade -> cor. O motor de regras devolve a severidade; a UI mapeia aqui. */
export const severityColor = {
  ok: color.vivo,
  warn: color.alerta,
  critical: color.critico,
} as const;

export const font = {
  // Duas famÃ­lias sustentam a marca. Manrope (grotesca sobria e encorpada) nos
  // titulos, Figtree no corpo. No SITE ficam so estas duas (labels/numeros usam
  // Figtree com tabular-nums). No APP o mono segue nos dados/rotulos.
  display: 'Manrope', // titulos, wordmark
  body: 'Figtree', // corpo
  mono: 'IBM Plex Mono', // rotulos, dados, datas (so no app)
} as const;

export const weight = {
  thin: '300', // tÃ­tulos institucionais (heranÃ§a OA)
  regular: '400',
  medium: '500',
  semibold: '600', // display padrÃ£o
  bold: '700', // nÃºmeros
} as const;

/** Escala tipogrÃ¡fica (px). NÃºmeros sempre com tabular-nums. */
export const type = {
  displayXl: 34,
  displayL: 27,
  displayM: 20,
  numberHero: 30,
  body: 16,
  small: 13,
  micro: 11, // mono/rÃ³tulos
} as const;

export const radius = { sm: 2, md: 10, lg: 14, pill: 999 } as const;

/** Grid base 4. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

export type ColorToken = keyof typeof color;
export type Severity = keyof typeof severityColor;
````

### `packages/core/src/types.ts`

````ts
/**
 * Pulso core â€” tipos.
 *
 * REGRA: este pacote Ã© PURO. Sem I/O, sem banco, sem HTTP, sem SDK de IA.
 * Entrada tipada -> saÃ­da tipada. Ã‰ o ativo auditÃ¡vel do produto.
 */

/** Dinheiro SEMPRE em centavos, inteiro. Nunca float. */
export type Cents = number;

/** Data de negÃ³cio, sem hora. ISO 'YYYY-MM-DD'. */
export type IsoDate = string;

export type EntryKind = 'receivable' | 'payable';
export type CostType = 'fixed' | 'variable';

export interface Entry {
  id: string;
  kind: EntryKind;
  amountCents: Cents; // sempre positivo; o sinal vem de `kind`
  issuedOn: IsoDate; // competÃªncia â€” quando o negÃ³cio aconteceu
  dueOn: IsoDate; // quando era pra pagar/receber
  settledOn: IsoDate | null; // null = em aberto
  counterparty?: string;
  category?: string;
  costType?: CostType;
}

export interface CashBalance {
  observedOn: IsoDate;
  balanceCents: Cents;
}

/** Tudo que o core precisa saber sobre uma empresa. */
export interface CompanySnapshot {
  asOf: IsoDate;
  entries: Entry[];
  balances: CashBalance[];
  /** Custo fixo declarado no onboarding, quando nÃ£o dÃ¡ pra inferir dos lanÃ§amentos. */
  declaredFixedCostCents?: Cents;
}

/**
 * Todo indicador devolve o valor E as entradas que usou.
 *
 * Isso nÃ£o Ã© luxo: Ã© o que permite o especialista auditar contra a planilha
 * dele, e Ã© o que a tela mostra em "de onde vem esse nÃºmero". Sem `inputs`,
 * um nÃºmero contestado vira sessÃ£o de debug.
 */
export interface Indicator<T = number> {
  key: string;
  value: T | null; // null = nÃ£o hÃ¡ dado suficiente. NUNCA chutar.
  unit: 'cents' | 'days' | 'ratio' | 'date' | 'count';
  /** Os nÃºmeros crus que entraram na conta. Auditoria. */
  inputs: Record<string, number | string | null>;
  /** Janela considerada, quando aplicÃ¡vel. */
  window?: { from: IsoDate; to: IsoDate };
  /** Preenchido quando value Ã© null: por que nÃ£o deu pra calcular. */
  insufficientReason?: string;
}

export type IndicatorSet = Record<string, Indicator<any>>;

export type Severity = 'ok' | 'warn' | 'critical';

/**
 * Uma regra de alerta. Recebe indicadores, devolve fato ou nada.
 *
 * O modelo NUNCA decide se deve alertar. A regra decide; o modelo sÃ³ redige
 * a partir de `facts`.
 */
export interface AlertFact {
  ruleKey: string;
  severity: Severity;
  /** NÃºmeros determinÃ­sticos que a IA vai transformar em texto. */
  facts: Record<string, number | string | null>;
}

export type Rule = (indicators: IndicatorSet) => AlertFact | null;
````

### `packages/core/src/indicators.ts`

````ts
/**
 * Pulso core â€” indicadores.
 *
 * FunÃ§Ãµes puras. Cada uma devolve valor + inputs (auditoria).
 * Quando falta dado, devolve value:null com motivo. NUNCA estima.
 */

import type {
  Cents,
  CompanySnapshot,
  Entry,
  Indicator,
  IndicatorSet,
  IsoDate,
} from './types';

export const CORE_VERSION = '0.1.0';

// ---------------------------------------------------------------
// UtilitÃ¡rios de data (UTC puro, sem timezone â€” datas de negÃ³cio)
// ---------------------------------------------------------------

export function daysBetween(a: IsoDate, b: IsoDate): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const t = Date.parse(`${d}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const inWindow = (d: IsoDate, from: IsoDate, to: IsoDate) => d >= from && d <= to;

/** MÃ©dia ponderada por valor. Retorna null se nÃ£o houver peso. */
function weightedAvg(pairs: Array<{ value: number; weight: number }>): number | null {
  const totalWeight = pairs.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return null;
  const sum = pairs.reduce((s, p) => s + p.value * p.weight, 0);
  return sum / totalWeight;
}

// ---------------------------------------------------------------
// 01 â€” Saldo de caixa atual
// ---------------------------------------------------------------

export function cashBalance(snap: CompanySnapshot): Indicator<Cents> {
  const sorted = [...snap.balances]
    .filter((b) => b.observedOn <= snap.asOf)
    .sort((a, b) => (a.observedOn < b.observedOn ? 1 : -1));

  const latest = sorted[0];
  if (!latest) {
    return {
      key: 'cash_balance',
      value: null,
      unit: 'cents',
      inputs: {},
      insufficientReason: 'Nenhum saldo bancÃ¡rio informado.',
    };
  }

  const staleness = daysBetween(latest.observedOn, snap.asOf);

  return {
    key: 'cash_balance',
    value: latest.balanceCents,
    unit: 'cents',
    inputs: {
      observedOn: latest.observedOn,
      stalenessDays: staleness,
    },
  };
}

// ---------------------------------------------------------------
// 03 / 04 â€” Prazo mÃ©dio de recebimento e de pagamento
//
// DefiniÃ§Ã£o: mÃ©dia ponderada por valor dos dias efetivamente levados
// (settledOn - issuedOn), sobre o que foi LIQUIDADO na janela.
//
// Por que nÃ£o DSO contÃ¡bil (AR/receita*dias): para PME, o que dÃ³i Ã© o
// prazo real praticado, nÃ£o o indicador de balanÃ§o. E o dono entende
// "vocÃª estÃ¡ recebendo em 46 dias" â€” nÃ£o entende DSO.
// ---------------------------------------------------------------

function averageTerm(
  entries: Entry[],
  kind: 'receivable' | 'payable',
  from: IsoDate,
  to: IsoDate,
): { avg: number | null; count: number; volume: Cents } {
  const settled = entries.filter(
    (e) => e.kind === kind && e.settledOn !== null && inWindow(e.settledOn, from, to),
  );

  const avg = weightedAvg(
    settled.map((e) => ({
      value: daysBetween(e.issuedOn, e.settledOn as IsoDate),
      weight: e.amountCents,
    })),
  );

  return {
    avg,
    count: settled.length,
    volume: settled.reduce((s, e) => s + e.amountCents, 0),
  };
}

const MIN_SAMPLE = 3; // abaixo disso, o nÃºmero mente

export function averageReceivableDays(
  snap: CompanySnapshot,
  windowDays = 90,
): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const r = averageTerm(snap.entries, 'receivable', from, snap.asOf);

  if (r.avg === null || r.count < MIN_SAMPLE) {
    return {
      key: 'pmr',
      value: null,
      unit: 'days',
      inputs: { settledCount: r.count },
      window: { from, to: snap.asOf },
      insufficientReason: `Apenas ${r.count} recebimentos liquidados na janela (mÃ­nimo ${MIN_SAMPLE}).`,
    };
  }

  return {
    key: 'pmr',
    value: Math.round(r.avg),
    unit: 'days',
    inputs: { settledCount: r.count, settledVolumeCents: r.volume },
    window: { from, to: snap.asOf },
  };
}

export function averagePayableDays(
  snap: CompanySnapshot,
  windowDays = 90,
): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const r = averageTerm(snap.entries, 'payable', from, snap.asOf);

  if (r.avg === null || r.count < MIN_SAMPLE) {
    return {
      key: 'pmp',
      value: null,
      unit: 'days',
      inputs: { settledCount: r.count },
      window: { from, to: snap.asOf },
      insufficientReason: `Apenas ${r.count} pagamentos liquidados na janela (mÃ­nimo ${MIN_SAMPLE}).`,
    };
  }

  return {
    key: 'pmp',
    value: Math.round(r.avg),
    unit: 'days',
    inputs: { settledCount: r.count, settledVolumeCents: r.volume },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 05 â€” Ciclo de caixa
//
// Ciclo = PMR + PME - PMP
//
// NOTA DE DOMÃNIO: clÃ­nica mÃ©dica Ã© serviÃ§o, nÃ£o tem estoque.
// PME (prazo mÃ©dio de estocagem) = 0 no nicho do MVP.
// Quando entrar padaria/comÃ©rcio, PME passa a existir e esta funÃ§Ã£o muda.
// Deixado explÃ­cito de propÃ³sito â€” nÃ£o Ã© esquecimento.
// ---------------------------------------------------------------

export function cashCycle(snap: CompanySnapshot): Indicator<number> {
  const pmr = averageReceivableDays(snap);
  const pmp = averagePayableDays(snap);
  const pme = 0; // serviÃ§o: sem estoque

  if (pmr.value === null || pmp.value === null) {
    return {
      key: 'cash_cycle',
      value: null,
      unit: 'days',
      inputs: { pmr: pmr.value, pmp: pmp.value, pme },
      insufficientReason: pmr.insufficientReason ?? pmp.insufficientReason,
    };
  }

  return {
    key: 'cash_cycle',
    value: pmr.value + pme - pmp.value,
    unit: 'days',
    inputs: { pmr: pmr.value, pmp: pmp.value, pme },
  };
}

// ---------------------------------------------------------------
// 06 â€” Necessidade de capital de giro (NCG)
//
// NCG = contas a receber em aberto - contas a pagar em aberto
//
// Ã‰ quanto de dinheiro a operaÃ§Ã£o estÃ¡ consumindo pra existir.
// Quando isso cresce mais rÃ¡pido que a receita, Ã© a TESOURA: a empresa
// vende mais, lucra no papel, e some o dinheiro.
// ---------------------------------------------------------------

export function workingCapitalNeed(snap: CompanySnapshot): Indicator<Cents> {
  const open = snap.entries.filter((e) => e.settledOn === null);
  const ar = open.filter((e) => e.kind === 'receivable').reduce((s, e) => s + e.amountCents, 0);
  const ap = open.filter((e) => e.kind === 'payable').reduce((s, e) => s + e.amountCents, 0);

  return {
    key: 'ncg',
    value: ar - ap,
    unit: 'cents',
    inputs: {
      openReceivablesCents: ar,
      openPayablesCents: ap,
      openReceivablesCount: open.filter((e) => e.kind === 'receivable').length,
      openPayablesCount: open.filter((e) => e.kind === 'payable').length,
    },
  };
}

// ---------------------------------------------------------------
// 07 â€” Receita do perÃ­odo (competÃªncia)
// ---------------------------------------------------------------

export function revenueInWindow(
  snap: CompanySnapshot,
  from: IsoDate,
  to: IsoDate,
): Indicator<Cents> {
  const rows = snap.entries.filter(
    (e) => e.kind === 'receivable' && inWindow(e.issuedOn, from, to),
  );

  return {
    key: 'revenue',
    value: rows.reduce((s, e) => s + e.amountCents, 0),
    unit: 'cents',
    inputs: { entryCount: rows.length },
    window: { from, to },
  };
}

// ---------------------------------------------------------------
// 09 â€” Custo fixo mensal
// ---------------------------------------------------------------

export function monthlyFixedCost(snap: CompanySnapshot, windowDays = 90): Indicator<Cents> {
  const from = addDays(snap.asOf, -windowDays);
  const fixed = snap.entries.filter(
    (e) => e.kind === 'payable' && e.costType === 'fixed' && inWindow(e.issuedOn, from, snap.asOf),
  );

  if (fixed.length === 0) {
    if (snap.declaredFixedCostCents != null) {
      return {
        key: 'fixed_cost_monthly',
        value: snap.declaredFixedCostCents,
        unit: 'cents',
        inputs: { source: 'declared_at_onboarding' },
      };
    }
    return {
      key: 'fixed_cost_monthly',
      value: null,
      unit: 'cents',
      inputs: {},
      insufficientReason: 'Nenhum custo classificado como fixo, e nada declarado no onboarding.',
    };
  }

  const total = fixed.reduce((s, e) => s + e.amountCents, 0);
  const months = windowDays / 30;

  return {
    key: 'fixed_cost_monthly',
    value: Math.round(total / months),
    unit: 'cents',
    inputs: { source: 'derived_from_entries', totalCents: total, months, entryCount: fixed.length },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 08 â€” Margem de contribuiÃ§Ã£o
// ---------------------------------------------------------------

export function contributionMargin(snap: CompanySnapshot, windowDays = 90): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const revenue = revenueInWindow(snap, from, snap.asOf).value ?? 0;

  const variable = snap.entries
    .filter(
      (e) =>
        e.kind === 'payable' && e.costType === 'variable' && inWindow(e.issuedOn, from, snap.asOf),
    )
    .reduce((s, e) => s + e.amountCents, 0);

  if (revenue === 0) {
    return {
      key: 'contribution_margin',
      value: null,
      unit: 'ratio',
      inputs: { revenueCents: 0, variableCostCents: variable },
      window: { from, to: snap.asOf },
      insufficientReason: 'Sem receita na janela.',
    };
  }

  return {
    key: 'contribution_margin',
    value: (revenue - variable) / revenue,
    unit: 'ratio',
    inputs: { revenueCents: revenue, variableCostCents: variable },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 10 â€” ConcentraÃ§Ã£o de clientes
// ---------------------------------------------------------------

export function customerConcentration(
  snap: CompanySnapshot,
  windowDays = 180,
): Indicator<number> {
  const from = addDays(snap.asOf, -windowDays);
  const rows = snap.entries.filter(
    (e) => e.kind === 'receivable' && inWindow(e.issuedOn, from, snap.asOf) && e.counterparty,
  );

  const total = rows.reduce((s, e) => s + e.amountCents, 0);
  if (total === 0) {
    return {
      key: 'customer_concentration',
      value: null,
      unit: 'ratio',
      inputs: {},
      window: { from, to: snap.asOf },
      insufficientReason: 'Sem receita identificada por cliente na janela.',
    };
  }

  const byCustomer = new Map<string, Cents>();
  for (const e of rows) {
    const k = e.counterparty as string;
    byCustomer.set(k, (byCustomer.get(k) ?? 0) + e.amountCents);
  }

  const top = [...byCustomer.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    key: 'customer_concentration',
    value: top[1] / total,
    unit: 'ratio',
    inputs: {
      topCustomer: top[0],
      topCustomerCents: top[1],
      totalCents: total,
      customerCount: byCustomer.size,
    },
    window: { from, to: snap.asOf },
  };
}

// ---------------------------------------------------------------
// 02 â€” ProjeÃ§Ã£o de caixa (O HERÃ“I)
//
// caixa_projetado(d) = saldo_hoje
//                    + recebÃ­veis em aberto que vencem atÃ© d, ATRASADOS pelo
//                      atraso mÃ©dio real do cliente (nÃ£o pela data prometida)
//                    - pagÃ¡veis em aberto que vencem atÃ© d
//                    - custo fixo proporcional ao perÃ­odo
//
// A parte nÃ£o Ã³bvia Ã© o `atrasoRealMedio`: usar a data de vencimento
// prometida Ã© o erro clÃ¡ssico. O cliente promete 30 e paga em 46. Projetar
// pelo prometido Ã© o que faz o dono achar que tem dinheiro que nÃ£o tem.
// ---------------------------------------------------------------

export interface CashProjection {
  horizonDays: number;
  projectedCents: Cents;
  /** Primeiro dia em que a projeÃ§Ã£o fica negativa. null = nÃ£o zera no horizonte. */
  zeroOn: IsoDate | null;
}

export function projectCash(
  snap: CompanySnapshot,
  horizons: number[] = [30, 60, 90],
): Indicator<CashProjection[]> {
  const balance = cashBalance(snap);
  const fixed = monthlyFixedCost(snap);
  const pmr = averageReceivableDays(snap);

  if (balance.value === null) {
    return {
      key: 'cash_projection',
      value: null,
      unit: 'cents',
      inputs: {},
      insufficientReason: 'Sem saldo de caixa: nÃ£o hÃ¡ de onde projetar.',
    };
  }

  const open = snap.entries.filter((e) => e.settledOn === null);

  // Atraso mÃ©dio real: quanto o cliente atrasa alÃ©m do prometido.
  // Se nÃ£o dÃ¡ pra medir, assume zero (conservador para o lado do "nÃ£o invente").
  const settledR = snap.entries.filter((e) => e.kind === 'receivable' && e.settledOn);
  const avgLateness =
    weightedAvg(
      settledR.map((e) => ({
        value: daysBetween(e.dueOn, e.settledOn as IsoDate),
        weight: e.amountCents,
      })),
    ) ?? 0;
  const latenessDays = Math.max(0, Math.round(avgLateness));

  // ConstrÃ³i a curva dia a dia atÃ© o maior horizonte.
  const maxH = Math.max(...horizons);
  let running = balance.value;
  let zeroOn: IsoDate | null = null;
  const curve = new Map<number, Cents>();

  for (let d = 1; d <= maxH; d++) {
    const day = addDays(snap.asOf, d);

    for (const e of open) {
      if (e.kind === 'receivable') {
        // chega atrasado, do jeito que a vida Ã©
        if (addDays(e.dueOn, latenessDays) === day) running += e.amountCents;
      } else {
        if (e.dueOn === day) running -= e.amountCents;
      }
    }

    // custo fixo diluÃ­do por dia
    if (fixed.value !== null) running -= Math.round(fixed.value / 30);

    if (running < 0 && zeroOn === null) zeroOn = day;
    curve.set(d, running);
  }

  const value: CashProjection[] = horizons.map((h) => ({
    horizonDays: h,
    projectedCents: curve.get(h) ?? balance.value!,
    zeroOn: zeroOn && daysBetween(snap.asOf, zeroOn) <= h ? zeroOn : null,
  }));

  return {
    key: 'cash_projection',
    value,
    unit: 'cents',
    inputs: {
      openingBalanceCents: balance.value,
      avgLatenessDays: latenessDays,
      monthlyFixedCostCents: fixed.value,
      openReceivablesCount: open.filter((e) => e.kind === 'receivable').length,
      openPayablesCount: open.filter((e) => e.kind === 'payable').length,
      pmrDays: pmr.value,
      zeroOn,
    },
  };
}

// ---------------------------------------------------------------
// Orquestrador
// ---------------------------------------------------------------

export function computeAll(snap: CompanySnapshot): IndicatorSet {
  const prevFrom = addDays(snap.asOf, -60);
  const prevTo = addDays(snap.asOf, -31);
  const currFrom = addDays(snap.asOf, -30);

  return {
    cash_balance: cashBalance(snap),
    cash_projection: projectCash(snap),
    pmr: averageReceivableDays(snap),
    pmp: averagePayableDays(snap),
    cash_cycle: cashCycle(snap),
    ncg: workingCapitalNeed(snap),
    revenue_current: revenueInWindow(snap, currFrom, snap.asOf),
    revenue_previous: revenueInWindow(snap, prevFrom, prevTo),
    contribution_margin: contributionMargin(snap),
    fixed_cost_monthly: monthlyFixedCost(snap),
    customer_concentration: customerConcentration(snap),
  };
}
````

### `packages/core/src/rules.ts`

````ts
/**
 * Pulso core â€” motor de regras.
 *
 * REGRA CENTRAL: quem decide alertar Ã© o cÃ³digo, nÃ£o o modelo.
 * Cada regra recebe indicadores e devolve `facts` â€” nÃºmeros crus.
 * A camada de IA transforma `facts` em texto. SÃ³ isso.
 *
 * Se vocÃª se pegar querendo passar a decisÃ£o pro modelo ("veja se tem
 * algo preocupante aqui"), parou. Escreva a regra.
 */

import type { AlertFact, IndicatorSet, Rule } from './types';
import type { CashProjection } from './indicators';

/** Limiares em um lugar sÃ³. Ã‰ aqui que o especialista mexe. */
export const THRESHOLDS = {
  runwayCriticalDays: 60,
  cycleWorseningRatio: 0.2, // ciclo 20% pior que a mÃ©dia histÃ³rica
  concentrationRatio: 0.3, // 1 cliente > 30% do faturamento
  marginDropRatio: 0.05, // margem caiu 5 p.p.
  scissorGapRatio: 0.15, // NCG cresce 15% mais rÃ¡pido que a receita
};

// ---------------------------------------------------------------
// O caixa vai zerar
// ---------------------------------------------------------------
export const cashRunwayRule: Rule = (ind) => {
  const proj = ind.cash_projection?.value as CashProjection[] | null;
  if (!proj) return null;

  const withZero = proj.find((p) => p.zeroOn !== null);
  if (!withZero?.zeroOn) return null;

  return {
    ruleKey: 'cash_runway',
    severity: 'critical',
    facts: {
      zeroOn: withZero.zeroOn,
      openingBalanceCents: ind.cash_projection.inputs.openingBalanceCents ?? null,
      avgLatenessDays: ind.cash_projection.inputs.avgLatenessDays ?? null,
      pmrDays: ind.pmr?.value ?? null,
      pmpDays: ind.pmp?.value ?? null,
      monthlyFixedCostCents: ind.fixed_cost_monthly?.value ?? null,
    },
  };
};

// ---------------------------------------------------------------
// A TESOURA â€” a tese do produto
// A receita sobe, mas a NCG sobe mais rÃ¡pido: a empresa estÃ¡ financiando
// o prÃ³prio crescimento com dinheiro que nÃ£o tem.
// ---------------------------------------------------------------
export const scissorRule: Rule = (ind) => {
  const rc = ind.revenue_current?.value as number | null;
  const rp = ind.revenue_previous?.value as number | null;
  const ncg = ind.ncg?.value as number | null;

  if (rc === null || rp === null || ncg === null || rp === 0) return null;

  const revenueGrowth = (rc - rp) / rp;
  // NCG como proporÃ§Ã£o da receita: se cresce, cada real vendido consome mais caixa
  const ncgOverRevenue = rc === 0 ? null : ncg / rc;
  if (ncgOverRevenue === null) return null;

  // Cresceu receita E a operaÃ§Ã£o estÃ¡ consumindo caixa desproporcional
  if (revenueGrowth > 0 && ncgOverRevenue > THRESHOLDS.scissorGapRatio) {
    return {
      ruleKey: 'scissor',
      severity: 'warn',
      facts: {
        revenueGrowthRatio: revenueGrowth,
        revenueCurrentCents: rc,
        revenuePreviousCents: rp,
        ncgCents: ncg,
        ncgOverRevenue,
        pmrDays: ind.pmr?.value ?? null,
        pmpDays: ind.pmp?.value ?? null,
      },
    };
  }
  return null;
};

// ---------------------------------------------------------------
// Receita caiu e custo fixo nÃ£o â€” o exemplo literal do especialista
// ---------------------------------------------------------------
export const revenueDropFixedCostRule: Rule = (ind) => {
  const rc = ind.revenue_current?.value as number | null;
  const rp = ind.revenue_previous?.value as number | null;
  const fixed = ind.fixed_cost_monthly?.value as number | null;

  if (rc === null || rp === null || fixed === null || rp === 0) return null;

  const drop = (rp - rc) / rp;
  if (drop <= 0.05) return null;

  return {
    ruleKey: 'revenue_drop_fixed_cost',
    severity: 'warn',
    facts: {
      revenueDropRatio: drop,
      revenueCurrentCents: rc,
      revenuePreviousCents: rp,
      monthlyFixedCostCents: fixed,
      fixedCostOverRevenue: rc === 0 ? null : fixed / rc,
    },
  };
};

// ---------------------------------------------------------------
// ConcentraÃ§Ã£o de clientes
// ---------------------------------------------------------------
export const concentrationRule: Rule = (ind) => {
  const c = ind.customer_concentration?.value as number | null;
  if (c === null || c <= THRESHOLDS.concentrationRatio) return null;

  return {
    ruleKey: 'concentration',
    severity: 'warn',
    facts: {
      topCustomerShare: c,
      topCustomer: (ind.customer_concentration.inputs.topCustomer as string) ?? null,
      customerCount: (ind.customer_concentration.inputs.customerCount as number) ?? null,
    },
  };
};

// ---------------------------------------------------------------
// SilÃªncio tambÃ©m Ã© sinal.
// Se nenhuma regra disparou, o produto ainda fala. PresenÃ§a cria hÃ¡bito;
// sumir uma semana faz o cara esquecer que o Pulso existe.
// ---------------------------------------------------------------
export const allClearRule = (ind: IndicatorSet, fired: AlertFact[]): AlertFact | null => {
  if (fired.length > 0) return null;
  return {
    ruleKey: 'all_clear',
    severity: 'ok',
    facts: {
      cashBalanceCents: (ind.cash_balance?.value as number) ?? null,
      cashCycleDays: (ind.cash_cycle?.value as number) ?? null,
      revenueCurrentCents: (ind.revenue_current?.value as number) ?? null,
    },
  };
};

export const RULES: Rule[] = [
  cashRunwayRule,
  scissorRule,
  revenueDropFixedCostRule,
  concentrationRule,
];

/** Avalia tudo. Ordena por severidade: o dono vÃª o pior primeiro. */
export function evaluate(ind: IndicatorSet): AlertFact[] {
  const fired = RULES.map((r) => r(ind)).filter((f): f is AlertFact => f !== null);

  const clear = allClearRule(ind, fired);
  if (clear) return [clear];

  const order = { critical: 0, warn: 1, ok: 2 } as const;
  return fired.sort((a, b) => order[a.severity] - order[b.severity]);
}
````

### `apps/api/schema.sql`

````sql
-- Pulso â€” schema canÃ´nico
-- Regra de ouro: dinheiro SEMPRE em centavos (bigint). Nunca float, nunca numeric decimal.
-- Datas de negÃ³cio em DATE (sem hora). Timestamps de sistema em TIMESTAMPTZ.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------
-- Empresa cliente do Pulso (a clÃ­nica, a padaria)
-- ---------------------------------------------------------------
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  cnpj          TEXT,
  niche         TEXT NOT NULL DEFAULT 'clinica',   -- nicho Ãºnico no MVP
  -- Custo fixo mensal declarado no onboarding, quando nÃ£o dÃ¡ pra inferir
  declared_fixed_cost_cents BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- Cada arquivo importado. Nunca sobrescreve: importaÃ§Ã£o Ã© append.
-- Permite reprocessar tudo se uma fÃ³rmula mudar.
-- ---------------------------------------------------------------
CREATE TABLE imports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source        TEXT NOT NULL,            -- 'afya_csv', 'omie_csv', 'manual_ofx'
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  file_hash     TEXT NOT NULL,            -- evita importar 2x o mesmo arquivo
  row_count     INT NOT NULL,
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, file_hash)
);

-- ---------------------------------------------------------------
-- O CORAÃ‡ÃƒO. LanÃ§amento canÃ´nico, independente de ERP.
-- Todo parser converte pra cÃ¡. Nada alÃ©m disso entra no core.
-- ---------------------------------------------------------------
CREATE TYPE entry_kind AS ENUM ('receivable', 'payable');
CREATE TYPE cost_type  AS ENUM ('fixed', 'variable');

CREATE TABLE entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  import_id      UUID NOT NULL REFERENCES imports(id)  ON DELETE CASCADE,

  kind           entry_kind NOT NULL,
  amount_cents   BIGINT NOT NULL CHECK (amount_cents > 0),  -- sempre positivo; o sinal estÃ¡ em `kind`

  issued_on      DATE NOT NULL,     -- quando o negÃ³cio aconteceu (competÃªncia)
  due_on         DATE NOT NULL,     -- quando era pra pagar/receber
  settled_on     DATE,              -- quando efetivamente entrou/saiu. NULL = em aberto

  counterparty   TEXT,              -- cliente ou fornecedor. Alimenta concentraÃ§Ã£o.
  category       TEXT,              -- categoria do ERP, crua
  cost_type      cost_type,         -- sÃ³ para kind='payable'. Alimenta margem e ponto de equilÃ­brio.

  external_id    TEXT,              -- id no sistema de origem, pra idempotÃªncia
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX entries_company_issued ON entries (company_id, issued_on);
CREATE INDEX entries_company_due    ON entries (company_id, due_on);
CREATE INDEX entries_open           ON entries (company_id, kind) WHERE settled_on IS NULL;

-- ---------------------------------------------------------------
-- Saldo bancÃ¡rio. NÃ£o dÃ¡ pra derivar de `entries` com confianÃ§a:
-- a empresa tem dinheiro que nÃ£o veio de lanÃ§amento nenhum.
-- ---------------------------------------------------------------
CREATE TABLE cash_balances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  observed_on   DATE NOT NULL,
  balance_cents BIGINT NOT NULL,          -- pode ser negativo (cheque especial)
  UNIQUE (company_id, observed_on)
);

-- ---------------------------------------------------------------
-- Snapshot dos indicadores. Guarda o resultado E as entradas usadas.
-- Ã‰ o que permite o Marco auditar e o app mostrar "de onde vem esse nÃºmero".
-- ---------------------------------------------------------------
CREATE TABLE indicator_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  as_of         DATE NOT NULL,
  core_version  TEXT NOT NULL,            -- versÃ£o do packages/core que calculou
  payload       JSONB NOT NULL,           -- { indicator_key: { value, unit, inputs, window } }
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, as_of)
);

-- ---------------------------------------------------------------
-- Alertas. A regra dispara (cÃ³digo); a IA sÃ³ redige (text_*).
-- ---------------------------------------------------------------
CREATE TYPE severity AS ENUM ('ok', 'warn', 'critical');

CREATE TABLE alerts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_id    UUID NOT NULL REFERENCES indicator_snapshots(id) ON DELETE CASCADE,

  rule_key       TEXT NOT NULL,           -- 'cash_runway', 'scissor', 'cycle_worsening'...
  severity       severity NOT NULL,
  facts          JSONB NOT NULL,          -- nÃºmeros que a regra usou. DeterminÃ­stico.

  text_title     TEXT,                    -- redigido pela IA a partir de `facts`
  text_body      TEXT,
  model_version  TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_at      TIMESTAMPTZ,
  opened_at      TIMESTAMPTZ,             -- mÃ©trica 2 do piloto
  acted_at       TIMESTAMPTZ              -- mÃ©trica 3 do piloto
);

CREATE INDEX alerts_company_created ON alerts (company_id, created_at DESC);
````

---

## 3. Testes do core e codigo-fonte principal

### 3.1 Core - restante (packages/core/src)

### `packages/core/src/index.ts`

````ts
/**
 * @pulso/core â€” ponto de entrada pÃºblico.
 *
 * O ativo auditÃ¡vel do produto. Puro: sem I/O, sem banco, sem HTTP, sem IA.
 */

export * from './types';
export * from './indicators';
export * from './rules';
````

### `packages/core/src/testkit.ts`

````ts
/**
 * Helpers de teste. NÃƒO Ã© cÃ³digo de produÃ§Ã£o e NÃƒO Ã© exportado pelo index.
 * ConstrÃ³i `Entry`/`CompanySnapshot` com defaults sensatos para os testes
 * ficarem legÃ­veis â€” sÃ³ o que importa em cada caso aparece no teste.
 */

import type { CashBalance, CompanySnapshot, Entry } from './types';

let seq = 0;

export function entry(
  e: Partial<Entry> & Pick<Entry, 'kind' | 'amountCents'>,
): Entry {
  seq += 1;
  const issuedOn = e.issuedOn ?? '2026-05-01';
  return {
    id: e.id ?? `e${seq}`,
    kind: e.kind,
    amountCents: e.amountCents,
    issuedOn,
    dueOn: e.dueOn ?? issuedOn,
    settledOn: e.settledOn ?? null,
    counterparty: e.counterparty,
    category: e.category,
    costType: e.costType,
  };
}

export function balance(observedOn: string, balanceCents: number): CashBalance {
  return { observedOn, balanceCents };
}

export function snapshot(
  over: Partial<CompanySnapshot> & Pick<CompanySnapshot, 'asOf'>,
): CompanySnapshot {
  return {
    asOf: over.asOf,
    entries: over.entries ?? [],
    balances: over.balances ?? [],
    declaredFixedCostCents: over.declaredFixedCostCents,
  };
}
````

### `packages/core/src/indicators.test.ts`

````ts
import { describe, expect, it } from 'vitest';

import {
  cashBalance,
  averageReceivableDays,
  averagePayableDays,
  cashCycle,
  workingCapitalNeed,
  revenueInWindow,
  monthlyFixedCost,
  contributionMargin,
  customerConcentration,
  projectCash,
  type CashProjection,
} from './indicators';
import { balance, entry, snapshot } from './testkit';

// ---------------------------------------------------------------
// 01 â€” Saldo de caixa
// ---------------------------------------------------------------
describe('cashBalance', () => {
  it('caso feliz: usa o saldo mais recente atÃ© asOf', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [
        balance('2026-06-01', 500000),
        balance('2026-06-28', 800000),
      ],
    });
    const r = cashBalance(snap);
    expect(r.value).toBe(800000);
    expect(r.inputs.observedOn).toBe('2026-06-28');
    expect(r.inputs.stalenessDays).toBe(3);
  });

  it('dado insuficiente: sem nenhum saldo informado â†’ null', () => {
    const r = cashBalance(snapshot({ asOf: '2026-07-01' }));
    expect(r.value).toBeNull();
    expect(r.insufficientReason).toMatch(/Nenhum saldo/);
  });

  it('borda: ignora saldo observado depois de asOf', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [
        balance('2026-06-20', 300000),
        balance('2026-07-15', 999999), // futuro: nÃ£o pode vazar
      ],
    });
    expect(cashBalance(snap).value).toBe(300000);
  });
});

// ---------------------------------------------------------------
// 03 â€” Prazo mÃ©dio de recebimento (PMR)
// ---------------------------------------------------------------
describe('averageReceivableDays', () => {
  it('caso feliz: mÃ©dia dos dias reais levados para receber', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-31' }), // 30d
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-10' }), // 40d
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-20' }), // 50d
      ],
    });
    const r = averageReceivableDays(snap);
    expect(r.value).toBe(40);
    expect(r.inputs.settledCount).toBe(3);
  });

  it('borda: pondera pelo valor, nÃ£o conta simples', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-21' }), // 20d, peso 1
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-21' }), // 20d, peso 1
        entry({ kind: 'receivable', amountCents: 200000, issuedOn: '2026-04-05', settledOn: '2026-06-24' }), // 80d, peso 2
      ],
    });
    // simples seria 40; ponderado = (20+20+160)/4 = 50
    expect(averageReceivableDays(snap).value).toBe(50);
  });

  it('dado insuficiente: menos de 3 liquidaÃ§Ãµes â†’ null, nunca chuta', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-31' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-10' }),
      ],
    });
    const r = averageReceivableDays(snap);
    expect(r.value).toBeNull();
    expect(r.inputs.settledCount).toBe(2);
    expect(r.insufficientReason).toMatch(/mÃ­nimo 3/);
  });

  it('borda: janela vazia (nada liquidado) â†’ null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01' })], // em aberto
    });
    expect(averageReceivableDays(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 04 â€” Prazo mÃ©dio de pagamento (PMP)
// ---------------------------------------------------------------
describe('averagePayableDays', () => {
  it('caso feliz', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-11' }), // 10d
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-13' }), // 12d
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-15' }), // 14d
      ],
    });
    expect(averagePayableDays(snap).value).toBe(12);
  });

  it('dado insuficiente: menos de 3 â†’ null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-11' })],
    });
    expect(averagePayableDays(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 05 â€” Ciclo de caixa
// ---------------------------------------------------------------
describe('cashCycle', () => {
  it('caso feliz: PMR + 0 (serviÃ§o, sem estoque) âˆ’ PMP', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        // 3 recebimentos ~45d
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-15' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-15' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-06-15' }),
        // 3 pagamentos ~15d
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' }),
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' }),
        entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' }),
      ],
    });
    const r = cashCycle(snap);
    expect(r.value).toBe(45 - 15);
    expect(r.inputs.pme).toBe(0);
  });

  it('dado insuficiente: sem PMR ou sem PMP â†’ null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'payable', amountCents: 100000, issuedOn: '2026-05-01', settledOn: '2026-05-16' })],
    });
    expect(cashCycle(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 06 â€” Necessidade de capital de giro (NCG)
// ---------------------------------------------------------------
describe('workingCapitalNeed', () => {
  it('caso feliz: a receber em aberto âˆ’ a pagar em aberto', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 500000 }), // aberto
        entry({ kind: 'payable', amountCents: 200000 }), // aberto
        entry({ kind: 'receivable', amountCents: 999999, settledOn: '2026-06-01' }), // liquidado: nÃ£o conta
      ],
    });
    const r = workingCapitalNeed(snap);
    expect(r.value).toBe(300000);
    expect(r.inputs.openReceivablesCents).toBe(500000);
    expect(r.inputs.openPayablesCents).toBe(200000);
  });

  it('borda: nada em aberto â†’ 0 (nÃ£o null; Ã© um valor conhecido)', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 100000, settledOn: '2026-06-01' })],
    });
    expect(workingCapitalNeed(snap).value).toBe(0);
  });
});

// ---------------------------------------------------------------
// 07 â€” Receita na janela (competÃªncia)
// ---------------------------------------------------------------
describe('revenueInWindow', () => {
  it('caso feliz: soma recebÃ­veis por data de emissÃ£o, ignora o resto', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-06-10' }),
        entry({ kind: 'receivable', amountCents: 300000, issuedOn: '2026-06-20' }),
        entry({ kind: 'receivable', amountCents: 999999, issuedOn: '2026-04-01' }), // fora da janela
        entry({ kind: 'payable', amountCents: 999999, issuedOn: '2026-06-15' }), // pagÃ¡vel nÃ£o Ã© receita
      ],
    });
    const r = revenueInWindow(snap, '2026-06-01', '2026-06-30');
    expect(r.value).toBe(400000);
    expect(r.inputs.entryCount).toBe(2);
  });

  it('borda: janela sem lanÃ§amento â†’ 0', () => {
    const snap = snapshot({ asOf: '2026-07-01' });
    expect(revenueInWindow(snap, '2026-06-01', '2026-06-30').value).toBe(0);
  });
});

// ---------------------------------------------------------------
// 09 â€” Custo fixo mensal
// ---------------------------------------------------------------
describe('monthlyFixedCost', () => {
  it('caso feliz: deriva dos lanÃ§amentos fixos (total / meses da janela)', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'payable', amountCents: 300000, issuedOn: '2026-05-01', costType: 'fixed' }),
        entry({ kind: 'payable', amountCents: 300000, issuedOn: '2026-06-01', costType: 'fixed' }),
        entry({ kind: 'payable', amountCents: 300000, issuedOn: '2026-06-15', costType: 'fixed' }),
        entry({ kind: 'payable', amountCents: 999999, issuedOn: '2026-06-01', costType: 'variable' }), // variÃ¡vel nÃ£o entra
      ],
    });
    const r = monthlyFixedCost(snap);
    expect(r.value).toBe(300000); // 900000 / (90/30)
    expect(r.inputs.source).toBe('derived_from_entries');
  });

  it('fallback: sem lanÃ§amento fixo usa o declarado no onboarding', () => {
    const snap = snapshot({ asOf: '2026-07-01', declaredFixedCostCents: 600000 });
    const r = monthlyFixedCost(snap);
    expect(r.value).toBe(600000);
    expect(r.inputs.source).toBe('declared_at_onboarding');
  });

  it('dado insuficiente: sem fixo e sem declarado â†’ null', () => {
    const r = monthlyFixedCost(snapshot({ asOf: '2026-07-01' }));
    expect(r.value).toBeNull();
    expect(r.insufficientReason).toBeTruthy();
  });
});

// ---------------------------------------------------------------
// 08 â€” Margem de contribuiÃ§Ã£o
// ---------------------------------------------------------------
describe('contributionMargin', () => {
  it('caso feliz: (receita âˆ’ custo variÃ¡vel) / receita', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-06-10' }),
        entry({ kind: 'payable', amountCents: 40000, issuedOn: '2026-06-10', costType: 'variable' }),
        entry({ kind: 'payable', amountCents: 999999, issuedOn: '2026-06-10', costType: 'fixed' }), // fixo nÃ£o entra
      ],
    });
    expect(contributionMargin(snap).value).toBeCloseTo(0.6, 10);
  });

  it('dado insuficiente: sem receita na janela â†’ null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'payable', amountCents: 40000, issuedOn: '2026-06-10', costType: 'variable' })],
    });
    expect(contributionMargin(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 10 â€” ConcentraÃ§Ã£o de clientes
// ---------------------------------------------------------------
describe('customerConcentration', () => {
  it('caso feliz: fatia do maior cliente sobre o total', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        entry({ kind: 'receivable', amountCents: 700000, issuedOn: '2026-06-01', counterparty: 'ConvÃªnio X' }),
        entry({ kind: 'receivable', amountCents: 200000, issuedOn: '2026-06-01', counterparty: 'Particular A' }),
        entry({ kind: 'receivable', amountCents: 100000, issuedOn: '2026-06-01', counterparty: 'Particular B' }),
      ],
    });
    const r = customerConcentration(snap);
    expect(r.value).toBeCloseTo(0.7, 10);
    expect(r.inputs.topCustomer).toBe('ConvÃªnio X');
    expect(r.inputs.customerCount).toBe(3);
  });

  it('dado insuficiente: sem receita identificada por cliente â†’ null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-06-01' })], // sem counterparty
    });
    expect(customerConcentration(snap).value).toBeNull();
  });
});

// ---------------------------------------------------------------
// 02 â€” ProjeÃ§Ã£o de caixa (O HERÃ“I) â€” o teste que define o produto
// ---------------------------------------------------------------
describe('projectCash', () => {
  it('dado insuficiente: sem saldo de caixa nÃ£o hÃ¡ de onde projetar â†’ null', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [entry({ kind: 'receivable', amountCents: 500000 })],
    });
    const r = projectCash(snap);
    expect(r.value).toBeNull();
    expect(r.insufficientReason).toMatch(/Sem saldo/);
  });

  it('borda: sÃ³ saldo, sem lanÃ§amentos nem custo â†’ nÃ£o zera, projeÃ§Ã£o plana', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [balance('2026-07-01', 500000)],
    });
    const value = projectCash(snap).value as CashProjection[];
    for (const p of value) {
      expect(p.zeroOn).toBeNull();
      expect(p.projectedCents).toBe(500000);
    }
  });

  it('Dona Maria: vende mais, lucro no papel, recebe em 45d e paga Ã  vista â†’ ACUSA zeroOn', () => {
    // A tese do produto. A empresa estÃ¡ crescendo â€” R$ 30 mil a receber â€”
    // mas o dinheiro chega tarde demais e ela paga o fornecedor agora.
    const snap = snapshot({
      asOf: '2026-07-01',
      declaredFixedCostCents: 600000, // R$ 6.000/mÃªs â†’ R$ 200/dia de sangria
      balances: [balance('2026-07-01', 800000)], // R$ 8.000 hoje
      entries: [
        // histÃ³rico liquidado: o cliente promete 30 e paga 15 dias atrasado (recebe em ~45d)
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-15', dueOn: '2026-05-15', settledOn: '2026-05-30' }),
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-20', dueOn: '2026-05-20', settledOn: '2026-06-04' }),
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-25', dueOn: '2026-05-25', settledOn: '2026-06-09' }),
        // fornecedor Ã  vista: sai jÃ¡, nos prÃ³ximos dias
        entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-05' }),
        entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-10' }),
        entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-15' }),
        // a venda grande (lucro no papel): R$ 30 mil, mas chega atrasada (dueOn +15d = 04/ago)
        entry({ kind: 'receivable', amountCents: 3000000, issuedOn: '2026-06-25', dueOn: '2026-07-20' }),
      ],
    });

    const ind = projectCash(snap);
    const value = ind.value as CashProjection[];
    const at30 = value.find((p) => p.horizonDays === 30)!;

    // O ponto: mesmo com R$ 30 mil "entrando", o caixa zera antes.
    expect(at30.zeroOn).toBe('2026-07-10');
    expect(at30.projectedCents).toBeLessThan(0);

    // Auditoria: projeta pelo atraso REAL (15d), nÃ£o pela data prometida.
    expect(ind.inputs.avgLatenessDays).toBe(15);
    expect(ind.inputs.openingBalanceCents).toBe(800000);
  });
});
````

### `packages/core/src/rules.test.ts`

````ts
import { describe, expect, it } from 'vitest';

import { computeAll } from './indicators';
import { evaluate } from './rules';
import { balance, entry, snapshot } from './testkit';

// Caixa que vai zerar â€” a versÃ£o "Dona Maria" jÃ¡ disparando pelo caminho real
// (computeAll â†’ evaluate).
function donaMaria() {
  return snapshot({
    asOf: '2026-07-01',
    declaredFixedCostCents: 600000,
    balances: [balance('2026-07-01', 800000)],
    entries: [
      entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-15', dueOn: '2026-05-15', settledOn: '2026-05-30' }),
      entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-20', dueOn: '2026-05-20', settledOn: '2026-06-04' }),
      entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-25', dueOn: '2026-05-25', settledOn: '2026-06-09' }),
      entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-05' }),
      entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-10' }),
      entry({ kind: 'payable', amountCents: 400000, issuedOn: '2026-07-01', dueOn: '2026-07-15' }),
      entry({ kind: 'receivable', amountCents: 3000000, issuedOn: '2026-06-25', dueOn: '2026-07-20' }),
    ],
  });
}

describe('cashRunwayRule', () => {
  it('dispara crÃ­tico com a data em que o caixa zera', () => {
    const alerts = evaluate(computeAll(donaMaria()));
    const runway = alerts.find((a) => a.ruleKey === 'cash_runway');
    expect(runway).toBeDefined();
    expect(runway!.severity).toBe('critical');
    expect(runway!.facts.zeroOn).toBe('2026-07-10');
  });
});

describe('scissorRule (a tesoura â€” tese do produto)', () => {
  it('receita sobe mas a NCG consome caixa desproporcional â†’ warn', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      entries: [
        // mÃªs anterior (janela -60..-31): R$ 10 mil
        entry({ kind: 'receivable', amountCents: 1000000, issuedOn: '2026-05-15', settledOn: '2026-06-14' }),
        // mÃªs atual (janela -30..hoje): R$ 15 mil â†’ cresceu 50%
        entry({ kind: 'receivable', amountCents: 1500000, issuedOn: '2026-06-15', settledOn: '2026-06-30' }),
        // e uma montanha a receber em aberto (emitida fora das janelas de receita,
        // para nÃ£o inflar o mÃªs atual): a operaÃ§Ã£o estÃ¡ financiando o crescimento
        entry({ kind: 'receivable', amountCents: 500000, issuedOn: '2026-04-15', dueOn: '2026-08-01' }),
      ],
    });
    const alerts = evaluate(computeAll(snap));
    const scissor = alerts.find((a) => a.ruleKey === 'scissor');
    expect(scissor).toBeDefined();
    expect(scissor!.severity).toBe('warn');
    expect(scissor!.facts.revenueGrowthRatio).toBeCloseTo(0.5, 10);
  });
});

describe('allClearRule (silÃªncio tambÃ©m Ã© sinal)', () => {
  it('quando nada dispara, ainda fala â€” um ok, nÃ£o vazio', () => {
    const snap = snapshot({
      asOf: '2026-07-01',
      balances: [balance('2026-07-01', 500000)],
    });
    const alerts = evaluate(computeAll(snap));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ruleKey).toBe('all_clear');
    expect(alerts[0]!.severity).toBe('ok');
  });
});

describe('evaluate (ordenaÃ§Ã£o)', () => {
  it('o dono vÃª o pior primeiro: crÃ­tico antes de warn', () => {
    const snap = donaMaria();
    // adiciona receita do mÃªs anterior para tambÃ©m disparar a tesoura
    snap.entries.push(
      entry({ kind: 'receivable', amountCents: 1000000, issuedOn: '2026-05-15', dueOn: '2026-06-14', settledOn: '2026-06-29' }),
    );
    const alerts = evaluate(computeAll(snap));
    const keys = alerts.map((a) => a.ruleKey);
    expect(keys).toContain('cash_runway');
    expect(keys).toContain('scissor');
    expect(alerts[0]!.severity).toBe('critical');
  });
});
````

### 3.2 Servidor (apps/api/src) + migracoes

### `apps/api/src/ai/chat.ts`

````ts
/**
 * A conversa do Pulso.
 *
 * Mesmas regras duras da voz dos alertas:
 * - O modelo recebe APENAS o snapshot de indicadores + alertas (nÃºmeros
 *   jÃ¡ calculados pelo core) e o perfil da empresa. LanÃ§amentos e
 *   extratos NUNCA entram no prompt.
 * - O modelo nÃ£o calcula. Se a resposta pede um nÃºmero que nÃ£o estÃ¡ no
 *   contexto, ele diz que nÃ£o tem â€” e o fiscal (grounding) garante isso
 *   em cÃ³digo: resposta com nÃºmero inventado Ã© descartada.
 * - Se o modelo falhar ou inventar, entra uma resposta segura
 *   determinÃ­stica. A conversa nunca mente.
 */

import Anthropic from '@anthropic-ai/sdk';

import { checkGroundingDeep } from './grounding';
import type { CompanyProfile } from './writer';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  profile: CompanyProfile;
  asOf: string | null;
  /** payload do snapshot: { indicator_key: { value, unit, inputs, ... } } */
  indicators: unknown;
  /** alertas do snapshot: ruleKey, severity, facts e textos. */
  alerts: unknown;
}

export interface ChatReply {
  text: string;
  modelVersion: string;
}

/** Interface do modelo â€” dublÃª nos testes, Anthropic em produÃ§Ã£o. */
export interface ChatModel {
  reply(prompt: { system: string; turns: ChatTurn[] }): Promise<ChatReply>;
}

export const CHAT_FALLBACK_VERSION = 'chat-fallback-v1';

/** Sem chave de IA configurada: a conversa avisa com honestidade. */
export const NO_MODEL_REPLY =
  'A conversa inteligente ainda nÃ£o estÃ¡ ligada neste ambiente. ' +
  'Os seus alertas e indicadores continuam no painel â€” e assim que a conversa for ativada, eu respondo por aqui.';

/** Resposta reprovada no fiscal ou erro do modelo: seguro > esperto. */
export const SAFE_REPLY =
  'Essa resposta pedia um nÃºmero que eu nÃ£o tenho aqui com seguranÃ§a, e eu prefiro nÃ£o inventar. ' +
  'DÃ¡ uma olhada no painel â€” os nÃºmeros de lÃ¡ sÃ£o calculados e conferidos. Quer perguntar de outro jeito?';

/** Sem snapshot calculado ainda. */
export const NO_DATA_REPLY =
  'Ainda nÃ£o tenho os nÃºmeros da sua clÃ­nica por aqui. Assim que os dados entrarem e o primeiro cÃ¡lculo rodar, eu respondo com tudo aberto.';

const SYSTEM_BASE = `VocÃª Ã© o Pulso, o monitor de caixa de pequenas clÃ­nicas brasileiras, conversando com o DONO da clÃ­nica â€” nÃ£o com um CFO.

VocÃª recebe abaixo um retrato JÃ CALCULADO do negÃ³cio (indicadores e alertas). Seu trabalho Ã© interpretar e orientar â€” nunca calcular.

REGRAS INEGOCIÃVEIS:
1. Use APENAS nÃºmeros presentes no retrato abaixo. Se a pergunta pede um nÃºmero que nÃ£o estÃ¡ lÃ¡, diga com honestidade que nÃ£o tem esse nÃºmero e aponte o painel.
2. NÃƒO faÃ§a contas â€” nem soma, nem diferenÃ§a, nem regra de trÃªs. VocÃª pode apenas FORMATAR (centavos como reais, proporÃ§Ã£o como percentual, data por extenso).
3. VocÃª pode dar orientaÃ§Ã£o prÃ¡tica e qualitativa (ex.: negociar prazo com fornecedor, rever prazo de convÃªnio, antecipar recebÃ­vel citando que custa juros) â€” sem prometer resultado e sem aconselhamento jurÃ­dico ou de investimento.
4. PortuguÃªs do Brasil, tom de conversa, SEM jargÃ£o: "vocÃª estÃ¡ recebendo 46 dias depois de atender", nunca "seu DSO estÃ¡ em 46".
5. Respostas CURTAS: um parÃ¡grafo, ou atÃ© 3 itens numerados. O detalhe estÃ¡ no painel.
6. Se o assunto fugir do financeiro da clÃ­nica, redirecione com gentileza.`;

export function buildChatPrompt(ctx: ChatContext, turns: ChatTurn[]) {
  const retrato = JSON.stringify({
    empresa: { nome: ctx.profile.name, nicho: ctx.profile.niche },
    dataDoRetrato: ctx.asOf,
    indicadores: ctx.indicators,
    alertas: ctx.alerts,
  });

  return {
    system: `${SYSTEM_BASE}\n\nRETRATO DO NEGÃ“CIO (Ãºnica fonte de nÃºmeros):\n${retrato}`,
    turns: sanitizeTurns(turns),
  };
}

/** A conversa precisa comeÃ§ar em turno do usuÃ¡rio e alternar corretamente. */
function sanitizeTurns(turns: ChatTurn[]): ChatTurn[] {
  const recent = turns.slice(-12);
  const firstUser = recent.findIndex((t) => t.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

export async function askPulso(
  model: ChatModel | null,
  ctx: ChatContext,
  turns: ChatTurn[],
): Promise<ChatReply> {
  if (!model) return { text: NO_MODEL_REPLY, modelVersion: CHAT_FALLBACK_VERSION };

  const prompt = buildChatPrompt(ctx, turns);
  if (prompt.turns.length === 0) {
    return { text: SAFE_REPLY, modelVersion: CHAT_FALLBACK_VERSION };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    let out: ChatReply;
    try {
      out = await model.reply(prompt);
    } catch {
      return { text: SAFE_REPLY, modelVersion: CHAT_FALLBACK_VERSION };
    }

    // o fiscal: nÃºmeros da resposta tÃªm que existir no retrato
    const grounded = checkGroundingDeep(out.text, {
      indicators: ctx.indicators,
      alerts: ctx.alerts,
      asOf: ctx.asOf,
    });
    if (grounded.ok) return out;
  }

  return { text: SAFE_REPLY, modelVersion: CHAT_FALLBACK_VERSION };
}

// ---------------------------------------------------------------
// ImplementaÃ§Ã£o real â€” Anthropic
// ---------------------------------------------------------------

export class AnthropicChatModel implements ChatModel {
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : undefined);
    this.model = opts.model ?? process.env.PULSO_AI_MODEL ?? 'claude-opus-4-8';
  }

  async reply(prompt: { system: string; turns: ChatTurn[] }): Promise<ChatReply> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      system: prompt.system,
      messages: prompt.turns.map((t) => ({ role: t.role, content: t.content })),
    });

    if (res.stop_reason === 'refusal') {
      throw new Error('Modelo recusou a solicitaÃ§Ã£o.');
    }

    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    if (!text.trim()) throw new Error('Resposta vazia do modelo.');
    return { text, modelVersion: res.model };
  }
}
````

### `apps/api/src/ai/format.ts`

````ts
/**
 * FormataÃ§Ã£o de APRESENTAÃ‡ÃƒO â€” nÃ£o Ã© cÃ¡lculo financeiro.
 * Converte nÃºmeros jÃ¡ calculados pelo core em texto pt-BR
 * (centavos -> reais, ratio -> percentual, data ISO -> data por extenso).
 */

const MESES = [
  'janeiro',
  'fevereiro',
  'marÃ§o',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const brlInteiro = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const brlCentavos = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1_500_000 -> "R$ 15.000" Â· 123_456 -> "R$ 1.234,56" */
export function formatCentsBRL(cents: number): string {
  const reais = cents / 100;
  return cents % 100 === 0 ? brlInteiro.format(reais) : brlCentavos.format(reais);
}

/** '2026-07-29' -> "29 de julho" */
export function formatDateBR(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]}`;
}

/** 0.136 -> "14%" */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
````

### `apps/api/src/ai/grounding.ts`

````ts
/**
 * O fiscal de nÃºmeros: nenhum nÃºmero aparece no texto do alerta
 * se nÃ£o estiver em `facts`.
 *
 * A IA recebe nÃºmeros prontos e sÃ³ redige. Este mÃ³dulo Ã© a garantia
 * DETERMINÃSTICA disso: extrai todo nÃºmero do texto gerado e confere
 * contra o conjunto de valores permitidos derivado de `facts`
 * (centavos -> reais, ratio -> percentual arredondado, data -> dia/mÃªs/ano).
 * NÃºmero alucinado em alerta financeiro destrÃ³i a confianÃ§a â€” aqui ele
 * simplesmente nÃ£o passa.
 */

import type { AlertFact } from '@pulso/core';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EPS = 1e-6;

function addNumberVariants(allowed: Set<number>, n: number) {
  allowed.add(n);
  allowed.add(Math.abs(n));

  if (Number.isInteger(n)) {
    const abs = Math.abs(n);
    // valores grandes podem ser centavos: permite as formas em reais
    if (abs >= 1000) {
      allowed.add(abs / 100); // 1_500_000 -> 15000  ("R$ 15.000")
      allowed.add(Math.round(abs / 100));
      allowed.add(abs / 100_000); // -> 15  ("R$ 15 mil")
      allowed.add(Math.round(abs / 100_000));
      allowed.add(Math.round(abs / 10_000) / 10); // -> 52.8  ("R$ 52,8 mil")
    }
  } else {
    // nÃ£o inteiro: pode ser ratio -> formas percentuais
    const p = n * 100;
    allowed.add(p);
    allowed.add(Math.round(p));
    allowed.add(Math.floor(p));
    allowed.add(Math.ceil(p));
    allowed.add(Math.round(p * 10) / 10); // 1 casa decimal
  }
}

/** Conjunto de nÃºmeros que PODEM aparecer no texto, derivado de facts. */
export function allowedNumbersFrom(facts: AlertFact['facts']): Set<number> {
  return collectAllowedNumbers(facts);
}

/**
 * Varre QUALQUER estrutura (objeto, array, valor) e coleta os nÃºmeros
 * permitidos. Usado pelo chat, que trabalha com o snapshot inteiro de
 * indicadores em vez de um Ãºnico `facts`.
 */
export function collectAllowedNumbers(
  value: unknown,
  allowed: Set<number> = new Set(),
): Set<number> {
  if (typeof value === 'number' && Number.isFinite(value)) {
    addNumberVariants(allowed, value);
  } else if (typeof value === 'string' && ISO_DATE.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    allowed.add(y!);
    allowed.add(m!);
    allowed.add(d!);
  } else if (Array.isArray(value)) {
    for (const v of value) collectAllowedNumbers(v, allowed);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) collectAllowedNumbers(v, allowed);
  }
  return allowed;
}

/** Extrai nÃºmeros do texto, entendendo formato pt-BR (1.500,25). */
export function extractNumbers(text: string): number[] {
  const tokens = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return tokens.map((raw) => {
    let t = raw;
    // pontos como separador de milhar: 1.500 / 12.345.678
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(t)) t = t.replace(/\./g, '');
    return Number(t.replace(',', '.'));
  });
}

export interface GroundingResult {
  ok: boolean;
  /** NÃºmeros do texto que NÃƒO vieram de facts. */
  offending: number[];
}

export function checkGrounding(text: string, facts: AlertFact['facts']): GroundingResult {
  return checkAgainstAllowed(text, allowedNumbersFrom(facts));
}

/**
 * VersÃ£o do chat: confere o texto contra QUALQUER contexto (snapshot de
 * indicadores + alertas). Inteiros pequenos (0 a 12) sÃ£o liberados â€”
 * enumeraÃ§Ãµes do tipo "3 caminhos" nÃ£o sÃ£o nÃºmeros financeiros.
 */
export function checkGroundingDeep(text: string, context: unknown): GroundingResult {
  const allowed = collectAllowedNumbers(context);
  for (let i = 0; i <= 12; i++) allowed.add(i);
  return checkAgainstAllowed(text, allowed);
}

function checkAgainstAllowed(text: string, allowed: Set<number>): GroundingResult {
  const offending = extractNumbers(text).filter((n) => {
    for (const a of allowed) if (Math.abs(a - n) < EPS) return false;
    return true;
  });
  return { ok: offending.length === 0, offending };
}
````

### `apps/api/src/ai/templates.ts`

````ts
/**
 * Textos padrÃ£o por regra â€” o "reserva" determinÃ­stico da IA.
 *
 * Sempre corretos por construÃ§Ã£o: sÃ³ usam nÃºmeros de `facts`, jÃ¡ formatados.
 * Entram quando nÃ£o hÃ¡ chave de API, quando o modelo falha ou quando o
 * texto gerado reprova no fiscal de nÃºmeros. O alerta nunca fica mudo.
 */

import type { AlertFact } from '@pulso/core';

import { formatCentsBRL, formatDateBR, formatPercent } from './format';

export const TEMPLATE_VERSION = 'template-v1';

export interface AlertText {
  title: string;
  body: string;
}

export function templateFor(alert: AlertFact): AlertText {
  const f = alert.facts;

  switch (alert.ruleKey) {
    case 'cash_runway': {
      const dia = typeof f.zeroOn === 'string' ? formatDateBR(f.zeroOn) : 'breve';
      return {
        title: `Seu caixa pode zerar em ${dia}`,
        body: `No ritmo de hoje, o dinheiro em conta acaba em ${dia}. Ainda dÃ¡ tempo de agir â€” vale olhar isso agora.`,
      };
    }

    case 'scissor': {
      const pct =
        typeof f.revenueGrowthRatio === 'number' ? formatPercent(f.revenueGrowthRatio) : null;
      return {
        title: 'VocÃª vende mais, mas o dinheiro demora a chegar',
        body: pct
          ? `Sua receita cresceu ${pct} e mesmo assim o caixa aperta: hÃ¡ muito dinheiro preso a receber. Vale rever prazos com convÃªnios e fornecedores.`
          : 'Sua receita cresce e mesmo assim o caixa aperta: hÃ¡ muito dinheiro preso a receber. Vale rever prazos com convÃªnios e fornecedores.',
      };
    }

    case 'revenue_drop_fixed_cost': {
      const pct =
        typeof f.revenueDropRatio === 'number' ? formatPercent(f.revenueDropRatio) : null;
      const fixo =
        typeof f.monthlyFixedCostCents === 'number'
          ? formatCentsBRL(f.monthlyFixedCostCents)
          : null;
      return {
        title: 'Sua receita caiu e os custos continuam os mesmos',
        body:
          pct && fixo
            ? `A receita caiu ${pct} em relaÃ§Ã£o ao mÃªs anterior, e o custo fixo segue em ${fixo} por mÃªs. Hora de ver de onde dÃ¡ para aliviar.`
            : 'A receita caiu em relaÃ§Ã£o ao mÃªs anterior e o custo fixo nÃ£o acompanhou. Hora de ver de onde dÃ¡ para aliviar.',
      };
    }

    case 'concentration': {
      const quem = typeof f.topCustomer === 'string' ? f.topCustomer : 'Um Ãºnico cliente';
      const pct =
        typeof f.topCustomerShare === 'number' ? formatPercent(f.topCustomerShare) : null;
      return {
        title: 'Boa parte do seu faturamento vem de um cliente sÃ³',
        body: pct
          ? `${quem} responde por ${pct} do que vocÃª fatura. Se ele atrasar ou sair, o impacto no caixa Ã© grande.`
          : `${quem} concentra uma fatia grande do seu faturamento. Se ele atrasar ou sair, o impacto no caixa Ã© grande.`,
      };
    }

    case 'all_clear':
      return {
        title: 'Semana tranquila',
        body: 'Seus nÃºmeros seguem estÃ¡veis e nada pede atenÃ§Ã£o hoje. Continue registrando os movimentos que o Pulso segue de olho.',
      };

    default:
      return {
        title: 'Novidade nos seus nÃºmeros',
        body: 'Encontramos um ponto de atenÃ§Ã£o nos seus nÃºmeros. Abra o Pulso para ver os detalhes.',
      };
  }
}
````

### `apps/api/src/ai/writer.ts`

````ts
/**
 * A voz do Pulso.
 *
 * Entrada: um AlertFact (regra jÃ¡ decidida pelo core) + perfil da empresa.
 * SaÃ­da: { title, body } via structured output.
 *
 * REGRAS DURAS (KICKOFF, Passo 4):
 * - O prompt recebe APENAS o objeto `facts` + perfil. Nunca lanÃ§amentos,
 *   nunca extrato, nunca dado bruto.
 * - O modelo nÃ£o calcula. Se `facts` nÃ£o tem o nÃºmero, o texto nÃ£o cita
 *   o nÃºmero â€” garantido em cÃ³digo pelo fiscal (grounding.ts), nÃ£o por fÃ©.
 * - O modelo nÃ£o decide se alerta. Ele recebe um alerta jÃ¡ decidido.
 * - MÃ¡x. 2 frases no body. O detalhe estÃ¡ na tela, nÃ£o no texto.
 *
 * Se o modelo falhar ou inventar nÃºmero, entra o texto padrÃ£o
 * (templates.ts). O alerta nunca fica mudo e nunca mente.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AlertFact } from '@pulso/core';

import { checkGrounding } from './grounding';
import { TEMPLATE_VERSION, templateFor, type AlertText } from './templates';

export interface CompanyProfile {
  name: string;
  niche: string;
}

export interface AlertPrompt {
  system: string;
  user: string;
}

export interface WrittenAlert extends AlertText {
  modelVersion: string;
}

/** Interface do modelo â€” nos testes entra um dublÃª, em produÃ§Ã£o a Anthropic. */
export interface AlertWriterModel {
  write(prompt: AlertPrompt): Promise<WrittenAlert>;
}

const GLOSSARIO: Record<string, string> = {
  cash_runway:
    'O caixa projetado fica negativo no dia `zeroOn`. Ã‰ o alerta mais grave que existe aqui.',
  scissor:
    'A receita cresceu (`revenueGrowthRatio`), mas hÃ¡ dinheiro demais preso a receber (`ncgCents`): a empresa vende mais e mesmo assim o caixa aperta.',
  revenue_drop_fixed_cost:
    'A receita caiu (`revenueDropRatio`) e o custo fixo mensal (`monthlyFixedCostCents`) continuou igual.',
  concentration:
    'Um Ãºnico cliente (`topCustomer`) concentra `topCustomerShare` do faturamento.',
  all_clear: 'Nenhuma regra disparou. Semana tranquila â€” mensagem breve e leve, sem alarme.',
};

const SYSTEM_PROMPT = `VocÃª Ã© a voz do Pulso, o assistente financeiro de pequenas empresas brasileiras. VocÃª escreve avisos curtos para o DONO de uma clÃ­nica â€” nÃ£o para um CFO.

VocÃª recebe um alerta JÃ DECIDIDO por regras de cÃ³digo, com os nÃºmeros JÃ CALCULADOS no campo "facts". Seu Ãºnico trabalho Ã© redigir.

REGRAS INEGOCIÃVEIS:
1. Use APENAS nÃºmeros presentes em "facts". Se um nÃºmero nÃ£o estÃ¡ lÃ¡, ele nÃ£o existe para vocÃª.
2. NÃƒO calcule nada â€” nem soma, nem diferenÃ§a, nem mÃ©dia. VocÃª pode apenas FORMATAR: centavos como reais (150000 -> "R$ 1.500"), proporÃ§Ã£o como percentual (0.14 -> "14%"), data como dia por extenso ("2026-07-29" -> "29 de julho").
3. VocÃª nÃ£o decide se o alerta Ã© grave â€” a severidade jÃ¡ veio decidida.
4. PortuguÃªs do Brasil, tom de conversa. SEM jargÃ£o: escreva "vocÃª estÃ¡ recebendo 46 dias depois de atender", nunca "seu DSO estÃ¡ em 46".
5. "body" tem NO MÃXIMO 2 frases. O detalhe fica na tela, nÃ£o no texto.
6. "title" Ã© curto e direto (atÃ© 60 caracteres), com o dado concreto quando houver.
7. Sem condescendÃªncia, sem alarmismo vazio. Data e nÃºmero concretos quando existirem.

Significado de cada regra (ruleKey):
${Object.entries(GLOSSARIO)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

Responda com o JSON { "title": ..., "body": ... }.`;

/**
 * Monta o prompt. O conteÃºdo do usuÃ¡rio Ã© EXATAMENTE o JSON do alerta +
 * perfil â€” nada mais entra. Isso Ã© testado: se alguÃ©m tentar passar dado
 * bruto por aqui, o teste quebra.
 */
export function buildPrompt(alert: AlertFact, profile: CompanyProfile): AlertPrompt {
  return {
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      ruleKey: alert.ruleKey,
      severity: alert.severity,
      facts: alert.facts,
      empresa: { nome: profile.name, nicho: profile.niche },
    }),
  };
}

/** No mÃ¡ximo 2 frases (pontos dentro de nÃºmeros nÃ£o contam). */
function bodyWithinLimit(body: string): boolean {
  const sentences = body.split(/[.!?]+(?=\s|$)/).filter((s) => s.trim().length > 0);
  return sentences.length <= 2;
}

/**
 * Redige o texto de um alerta. Com `model` null (sem chave de API),
 * ou se o modelo falhar/inventar nÃºmero apÃ³s 1 retry, usa o template.
 */
export async function writeAlert(
  model: AlertWriterModel | null,
  alert: AlertFact,
  profile: CompanyProfile,
): Promise<WrittenAlert> {
  const fallback: WrittenAlert = { ...templateFor(alert), modelVersion: TEMPLATE_VERSION };
  if (!model) return fallback;

  const prompt = buildPrompt(alert, profile);

  for (let attempt = 0; attempt < 2; attempt++) {
    let out: WrittenAlert;
    try {
      out = await model.write(prompt);
    } catch {
      // erro de API: o SDK jÃ¡ fez os retries de transporte; nÃ£o insistimos
      return fallback;
    }

    const grounded = checkGrounding(`${out.title}\n${out.body}`, alert.facts);
    if (grounded.ok && bodyWithinLimit(out.body)) return out;
    // reprovou no fiscal: uma segunda chance, depois template
  }

  return fallback;
}

// ---------------------------------------------------------------
// ImplementaÃ§Ã£o real â€” Anthropic, com structured output
// ---------------------------------------------------------------

const ALERT_TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string', description: 'TÃ­tulo curto do aviso, atÃ© 60 caracteres.' },
    body: { type: 'string', description: 'No mÃ¡ximo 2 frases, pt-BR, sem jargÃ£o.' },
  },
} as const;

export class AnthropicAlertWriter implements AlertWriterModel {
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : undefined);
    this.model = opts.model ?? process.env.PULSO_AI_MODEL ?? 'claude-opus-4-8';
  }

  async write(prompt: AlertPrompt): Promise<WrittenAlert> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      output_config: { format: { type: 'json_schema', schema: ALERT_TEXT_SCHEMA } },
    });

    if (res.stop_reason === 'refusal') {
      throw new Error('Modelo recusou a solicitaÃ§Ã£o.');
    }

    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as AlertText;
    return { title: parsed.title, body: parsed.body, modelVersion: res.model };
  }
}
````

### `apps/api/src/app.ts`

````ts
import cors from '@fastify/cors';
import fastify from 'fastify';

import type { ChatModel } from './ai/chat';
import type { AlertWriterModel } from './ai/writer';
import type { Sql } from './db';
import type { PushSender } from './push';
import { registerAuth } from './routes/auth';
import { registerChat } from './routes/chat';
import { registerCompanies } from './routes/companies';
import { registerData } from './routes/data';
import { registerDevices } from './routes/devices';
import { registerInterest } from './routes/interest';
import { registerPlanned } from './routes/planned';
import { registerSnapshots } from './routes/snapshots';

export interface AppOptions {
  logger?: boolean;
  /** Sem writer (null), os alertas usam o texto padrÃ£o determinÃ­stico. */
  alertWriter?: AlertWriterModel | null;
  /** Sem modelo (null), a conversa responde com o aviso honesto. */
  chatModel?: ChatModel | null;
  /** Sem enviador (null), nada Ã© entregue no celular (o cÃ¡lculo segue igual). */
  pushSender?: PushSender | null;
}

export function buildApp(sql: Sql, opts: AppOptions = {}) {
  const app = fastify({ logger: opts.logger ?? false });

  // o site (outra origem) chama a API do navegador; auth Ã© por Bearer, nÃ£o cookie
  app.register(cors, { origin: true });

  app.get('/health', async () => ({ ok: true }));

  registerAuth(app, sql, opts.chatModel ?? null);
  registerInterest(app, sql);
  registerPlanned(app, sql);
  registerCompanies(app, sql);
  registerData(app, sql);
  registerSnapshots(app, sql, opts.alertWriter ?? null, opts.pushSender ?? null);
  registerDevices(app, sql, opts.pushSender ?? null);
  registerChat(app, sql, opts.chatModel ?? null);

  return app;
}
````

### `apps/api/src/auth.ts`

````ts
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { Sql } from './db';
import type { CompanyRow } from './http';

/**
 * AutenticaÃ§Ã£o do dono (login de verdade).
 *
 * Senha: guardada sÃ³ como hash scrypt ('salt:derivado' em hex). Nunca em texto.
 * Token de sessÃ£o: um valor aleatÃ³rio entregue ao aparelho; no banco guardamos
 * sÃ³ o sha256 dele â€” se o banco vazar, os tokens nÃ£o servem.
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = scryptSync(password, salt, expected.length);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function newToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Descobre a empresa do dono logado a partir do cabeÃ§alho Authorization.
 * Retorna null quando nÃ£o hÃ¡ token vÃ¡lido â€” quem chama responde 401.
 */
export async function companyFromRequest(
  sql: Sql,
  req: FastifyRequest,
): Promise<CompanyRow | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  const [row] = await sql`
    SELECT c.id, c.name, c.cnpj, c.niche, c.declared_fixed_cost_cents, c.created_at
    FROM auth_tokens t
    JOIN users u     ON u.id = t.user_id
    JOIN companies c ON c.id = u.company_id
    WHERE t.token_hash = ${hashToken(token)}`;
  return (row as CompanyRow | undefined) ?? null;
}
````

### `apps/api/src/db.ts`

````ts
import postgres from 'postgres';

/**
 * ConexÃ£o com o Postgres.
 *
 * Dinheiro Ã© BIGINT em centavos no banco. O postgres.js devolveria string;
 * aqui convertemos para number com checagem de seguranÃ§a â€” se algum valor
 * estourar o inteiro seguro do JS, Ã© melhor falhar alto do que arredondar
 * dinheiro em silÃªncio.
 */
export function createSql(url: string) {
  // Bancos gerenciados (Neon e afins) exigem conexÃ£o TLS; o Postgres local de
  // dev/teste roda sem. Liga o SSL quando o host nÃ£o Ã© a prÃ³pria mÃ¡quina.
  let isLocal = false;
  try {
    const host = new URL(url).hostname;
    isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    isLocal = false;
  }

  return postgres(url, {
    ssl: isLocal ? false : 'require',
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number | bigint) => String(v),
        parse: (v: string) => {
          const n = Number(v);
          if (!Number.isSafeInteger(n)) {
            throw new Error(`Valor bigint fora do intervalo seguro do JS: ${v}`);
          }
          return n;
        },
      },
    },
  });
}

export type Sql = ReturnType<typeof createSql>;
````

### `apps/api/src/http.ts`

````ts
import type { Sql } from './db';

/** PadrÃµes de validaÃ§Ã£o compartilhados pelas rotas. */
export const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
export const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export const companyParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

export interface CompanyRow {
  id: string;
  name: string;
  cnpj: string | null;
  niche: string;
  declared_fixed_cost_cents: number | null;
  created_at: Date;
}

export async function findCompany(sql: Sql, id: string): Promise<CompanyRow | undefined> {
  const [row] = await sql`
    SELECT id, name, cnpj, niche, declared_fixed_cost_cents, created_at
    FROM companies WHERE id = ${id}`;
  return row as CompanyRow | undefined;
}

export function toCompanyJson(c: CompanyRow) {
  return {
    id: c.id,
    name: c.name,
    cnpj: c.cnpj,
    niche: c.niche,
    declaredFixedCostCents: c.declared_fixed_cost_cents,
    createdAt: c.created_at,
  };
}
````

### `apps/api/src/index.ts`

````ts
import { existsSync, readFileSync } from 'node:fs';

import { AnthropicChatModel } from './ai/chat';
import { AnthropicAlertWriter } from './ai/writer';
import { buildApp } from './app';
import { createSql } from './db';
import { migrate } from './migrate';
import { ExpoPushSender } from './push';

// conveniÃªncia de dev: carrega .env local se existir (sem sobrescrever o ambiente)
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL (veja .env.example). Para subir um banco local: pnpm db');
  process.exit(1);
}

const sql = createSql(url);
const applied = await migrate(sql);
if (applied.length) console.log(`MigraÃ§Ãµes aplicadas: ${applied.join(', ')}`);

// com ANTHROPIC_API_KEY a IA redige alertas e responde a conversa;
// sem ela, entram o texto padrÃ£o e o aviso honesto no chat
const temIA = Boolean(process.env.ANTHROPIC_API_KEY);
const alertWriter = temIA ? new AnthropicAlertWriter() : null;
const chatModel = temIA ? new AnthropicChatModel() : null;
if (!temIA) {
  console.log('ANTHROPIC_API_KEY ausente: alertas com texto padrÃ£o e conversa desligada.');
}

// entrega de push pelo serviÃ§o do Expo (nÃ£o precisa de chave)
const pushSender = new ExpoPushSender();

const app = buildApp(sql, { logger: true, alertWriter, chatModel, pushSender });
const port = Number(process.env.PORT ?? 3000);
// HOST=0.0.0.0 deixa o celular (Expo Go) acessar a API pela rede local
const host = process.env.HOST ?? '127.0.0.1';
await app.listen({ port, host });
````

### `apps/api/src/migrate.ts`

````ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSql, type Sql } from './db';

/**
 * Aplica o schema.sql uma Ãºnica vez, registrado em `schema_migrations`.
 * MigraÃ§Ã£o Ã© append-only: mudanÃ§a de schema vira um arquivo novo, nunca
 * ediÃ§Ã£o do jÃ¡ aplicado.
 */
const MIGRATIONS: Array<[name: string, file: string]> = [
  ['0001_schema', 'schema.sql'],
  ['0002_devices', '0002_devices.sql'],
  ['0003_auth', '0003_auth.sql'],
  ['0004_planned_entries', '0004_planned_entries.sql'],
  ['0005_interest', '0005_interest.sql'],
];

export async function migrate(sql: Sql): Promise<string[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const applied: string[] = [];

  for (const [name, file] of MIGRATIONS) {
    const [exists] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name}`;
    if (exists) continue;

    const ddl = readFileSync(path.join(here, '..', file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    applied.push(name);
  }

  return applied;
}

// execuÃ§Ã£o direta: `pnpm migrate`
const runDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('src/migrate.ts');
if (runDirectly) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Defina DATABASE_URL antes de migrar (veja .env.example).');
    process.exit(1);
  }
  const sql = createSql(url);
  const applied = await migrate(sql);
  console.log(applied.length ? `MigraÃ§Ãµes aplicadas: ${applied.join(', ')}` : 'Nada a migrar.');
  await sql.end();
}
````

### `apps/api/src/push.ts`

````ts
/**
 * Entrega do aviso no celular (push).
 *
 * O cÃ¡lculo e a decisÃ£o de alertar sÃ£o do core; aqui sÃ³ ENTREGAMOS um texto
 * jÃ¡ pronto. Usa o serviÃ§o de push do Expo (https://exp.host) â€” nada de SDK,
 * sÃ³ uma chamada HTTP. Nenhum nÃºmero Ã© inventado aqui.
 */

/** Uma notificaÃ§Ã£o a enviar para um aparelho. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Dados extras (ex.: para abrir a tela do alerta ao tocar). */
  data?: Record<string, unknown>;
}

/** Resultado por mensagem, espelhando o "ticket" do Expo. */
export interface PushResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Quem sabe entregar. A API real e a de teste implementam isto. */
export interface PushSender {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}

/**
 * O token do Expo tem forma fixa: ExponentPushToken[...] ou ExpoPushToken[...].
 * Rejeitar cedo o que nÃ£o parece token evita bater no serviÃ§o Ã  toa.
 */
export function isExpoPushToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) &&
    token.endsWith(']')
  );
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Enviador de verdade: chama o serviÃ§o do Expo. Lotes de 100 (limite do Expo). */
export class ExpoPushSender implements PushSender {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const valid = messages.filter((m) => isExpoPushToken(m.to));
    if (valid.length === 0) return [];

    const results: PushResult[] = [];
    for (let i = 0; i < valid.length; i += 100) {
      const lote = valid.slice(i, i + 100).map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        sound: 'default',
        channelId: 'alertas',
        priority: 'high',
        data: m.data ?? {},
      }));

      try {
        const res = await this.fetchImpl(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(lote),
        });
        const json = (await res.json()) as { data?: Array<{ status: string; id?: string; message?: string }> };
        for (const t of json.data ?? []) {
          results.push(
            t.status === 'ok'
              ? { ok: true, id: t.id }
              : { ok: false, error: t.message ?? 'falha desconhecida' },
          );
        }
      } catch (err) {
        for (let j = 0; j < lote.length; j += 1) {
          results.push({ ok: false, error: (err as Error).message });
        }
      }
    }
    return results;
  }
}
````

### `apps/api/src/routes/auth.ts`

````ts
import type { FastifyInstance } from 'fastify';

import type { ChatModel, ChatTurn } from '../ai/chat';
import {
  companyFromRequest,
  hashPassword,
  hashToken,
  newToken,
  normalizeEmail,
  verifyPassword,
} from '../auth';
import type { Sql } from '../db';
import { toCompanyJson, type CompanyRow } from '../http';
import { replyForCompany } from './chat';
import { buildDashboard } from './snapshots';

/**
 * Login de verdade â€” o dono se cadastra e entra com e-mail e senha.
 *
 * Cada conta Ã© ligada Ã  sua empresa. As rotas /me/* usam o token para achar a
 * empresa do dono logado (isolamento: um dono sÃ³ vÃª a prÃ³pria empresa).
 */

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

interface SignupBody {
  businessName: string;
  email: string;
  password: string;
}
interface LoginBody {
  email: string;
  password: string;
}
interface ChatBody {
  messages: ChatTurn[];
}

const signupSchema = {
  type: 'object',
  required: ['businessName', 'email', 'password'],
  additionalProperties: false,
  properties: {
    businessName: { type: 'string', minLength: 1, maxLength: 120 },
    email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
    password: { type: 'string', minLength: 8, maxLength: 200 },
  },
} as const;

const loginSchema = {
  type: 'object',
  required: ['email', 'password'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', minLength: 3, maxLength: 200 },
    password: { type: 'string', minLength: 1, maxLength: 200 },
  },
} as const;

const chatBodySchema = {
  type: 'object',
  required: ['messages'],
  additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        required: ['role', 'content'],
        additionalProperties: false,
        properties: {
          role: { enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
    },
  },
} as const;

export function registerAuth(app: FastifyInstance, sql: Sql, chatModel: ChatModel | null = null) {
  // cadastro: cria a empresa (vazia) + o usuÃ¡rio + um token de sessÃ£o
  app.post<{ Body: SignupBody }>(
    '/auth/signup',
    { schema: { body: signupSchema } },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);

      const [existing] = await sql`SELECT 1 FROM users WHERE email = ${email}`;
      if (existing) {
        return reply.code(409).send({ error: 'JÃ¡ existe uma conta com esse e-mail.' });
      }

      const token = newToken();
      const passwordHash = hashPassword(req.body.password);

      try {
        const company = await sql.begin(async (tx) => {
          const [c] = await tx`
            INSERT INTO companies (name) VALUES (${req.body.businessName})
            RETURNING id, name, cnpj, niche, declared_fixed_cost_cents, created_at`;
          const [u] = await tx`
            INSERT INTO users (email, password_hash, company_id)
            VALUES (${email}, ${passwordHash}, ${c.id})
            RETURNING id`;
          await tx`INSERT INTO auth_tokens (token_hash, user_id) VALUES (${hashToken(token)}, ${u.id})`;
          return c as CompanyRow;
        });
        return reply.code(201).send({ token, email, company: toCompanyJson(company) });
      } catch (err) {
        // corrida entre dois cadastros com o mesmo e-mail: o UNIQUE segura
        if ((err as { code?: string }).code === '23505') {
          return reply.code(409).send({ error: 'JÃ¡ existe uma conta com esse e-mail.' });
        }
        throw err;
      }
    },
  );

  // entrada: confere e-mail + senha e devolve um token novo
  app.post<{ Body: LoginBody }>(
    '/auth/login',
    { schema: { body: loginSchema } },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);
      const [user] = await sql`
        SELECT u.id, u.password_hash,
               c.id AS c_id, c.name, c.cnpj, c.niche, c.declared_fixed_cost_cents, c.created_at
        FROM users u JOIN companies c ON c.id = u.company_id
        WHERE u.email = ${email}`;

      // mensagem genÃ©rica de propÃ³sito: nÃ£o revela se o e-mail existe
      if (!user || !verifyPassword(req.body.password, user.password_hash as string)) {
        return reply.code(401).send({ error: 'E-mail ou senha incorretos.' });
      }

      const token = newToken();
      await sql`INSERT INTO auth_tokens (token_hash, user_id) VALUES (${hashToken(token)}, ${user.id})`;

      const company: CompanyRow = {
        id: user.c_id as string,
        name: user.name as string,
        cnpj: (user.cnpj as string | null) ?? null,
        niche: user.niche as string,
        declared_fixed_cost_cents: (user.declared_fixed_cost_cents as number | null) ?? null,
        created_at: user.created_at as Date,
      };
      return reply.send({ token, email, company: toCompanyJson(company) });
    },
  );

  // sair: apaga o token deste aparelho (os outros seguem vÃ¡lidos)
  app.post('/auth/logout', async (req, reply) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      const token = header.slice('Bearer '.length).trim();
      if (token) await sql`DELETE FROM auth_tokens WHERE token_hash = ${hashToken(token)}`;
    }
    return reply.send({ ok: true });
  });

  // painel do dono logado (sÃ³ a prÃ³pria empresa)
  app.get('/me/dashboard', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'FaÃ§a login para ver seu painel.' });

    const dash = await buildDashboard(sql, company);
    if (!dash) {
      // conta nova, ainda sem dados: 200 com o retrato "vazio" (nÃ£o Ã© erro)
      return reply.send({ company: toCompanyJson(company), snapshot: null, alerts: [] });
    }
    return dash;
  });

  // conversa do dono logado
  app.post<{ Body: ChatBody }>(
    '/me/chat',
    { schema: { body: chatBodySchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'FaÃ§a login para conversar.' });
      return replyForCompany(sql, chatModel, company, req.body.messages);
    },
  );
}
````

### `apps/api/src/routes/chat.ts`

````ts
import type { FastifyInstance } from 'fastify';

import {
  askPulso,
  CHAT_FALLBACK_VERSION,
  NO_DATA_REPLY,
  type ChatModel,
  type ChatTurn,
} from '../ai/chat';
import type { Sql } from '../db';
import { companyParamsSchema, findCompany } from '../http';

/**
 * Conversa. A rota carrega o ÃšLTIMO snapshot (nÃºmeros jÃ¡ calculados) e
 * os alertas dele, e entrega ao modelo. LanÃ§amentos nunca saem daqui
 * para o prompt â€” a regra de ouro vale tambÃ©m na conversa.
 */

interface ChatBody {
  messages: ChatTurn[];
}

const chatBodySchema = {
  type: 'object',
  required: ['messages'],
  additionalProperties: false,
  properties: {
    messages: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        required: ['role', 'content'],
        additionalProperties: false,
        properties: {
          role: { enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 2000 },
        },
      },
    },
  },
} as const;

/**
 * Gera a resposta do Pulso para uma empresa (Ãºltimo snapshot + alertas).
 * Fonte Ãºnica usada pela rota pÃºblica e pela rota logada (/me/chat).
 */
export async function replyForCompany(
  sql: Sql,
  chatModel: ChatModel | null,
  company: { id: string; name: string; niche: string },
  messages: ChatTurn[],
): Promise<{ reply: string; modelVersion: string }> {
  const [snapshot] = await sql`
    SELECT id, as_of::text AS as_of, payload
    FROM indicator_snapshots
    WHERE company_id = ${company.id}
    ORDER BY as_of DESC
    LIMIT 1`;

  if (!snapshot) {
    return { reply: NO_DATA_REPLY, modelVersion: CHAT_FALLBACK_VERSION };
  }

  const alertRows = await sql`
    SELECT rule_key, severity::text AS severity, facts, text_title, text_body
    FROM alerts
    WHERE snapshot_id = ${snapshot.id}
    ORDER BY CASE severity::text WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END`;

  const answer = await askPulso(
    chatModel,
    {
      profile: { name: company.name, niche: company.niche },
      asOf: snapshot.as_of as string,
      indicators: snapshot.payload,
      alerts: alertRows.map((a) => ({
        ruleKey: a.rule_key,
        severity: a.severity,
        facts: a.facts,
        title: a.text_title,
        body: a.text_body,
      })),
    },
    messages,
  );

  return { reply: answer.text, modelVersion: answer.modelVersion };
}

export function registerChat(app: FastifyInstance, sql: Sql, chatModel: ChatModel | null = null) {
  app.post<{ Params: { id: string }; Body: ChatBody }>(
    '/companies/:id/chat',
    { schema: { params: companyParamsSchema, body: chatBodySchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });
      return replyForCompany(sql, chatModel, company, req.body.messages);
    },
  );
}
````

### `apps/api/src/routes/companies.ts`

````ts
import type { FastifyInstance } from 'fastify';

import type { Sql } from '../db';
import { companyParamsSchema, findCompany, toCompanyJson, type CompanyRow } from '../http';

interface CompanyBody {
  name: string;
  cnpj?: string;
  niche?: string;
  declaredFixedCostCents?: number;
}

export function registerCompanies(app: FastifyInstance, sql: Sql) {
  app.post<{ Body: CompanyBody }>(
    '/companies',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            cnpj: { type: 'string' },
            niche: { type: 'string' },
            declaredFixedCostCents: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const b = req.body;
      const [row] = await sql`
        INSERT INTO companies (name, cnpj, niche, declared_fixed_cost_cents)
        VALUES (${b.name}, ${b.cnpj ?? null}, ${b.niche ?? 'clinica'}, ${b.declaredFixedCostCents ?? null})
        RETURNING id, name, cnpj, niche, declared_fixed_cost_cents, created_at`;
      return reply.code(201).send(toCompanyJson(row as CompanyRow));
    },
  );

  app.get('/companies', async () => {
    const rows = await sql`
      SELECT id, name, cnpj, niche, declared_fixed_cost_cents, created_at
      FROM companies ORDER BY created_at LIMIT 100`;
    return { companies: rows.map((r) => toCompanyJson(r as unknown as CompanyRow)) };
  });

  app.get<{ Params: { id: string } }>(
    '/companies/:id',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });
      return toCompanyJson(company);
    },
  );
}
````

### `apps/api/src/routes/data.ts`

````ts
import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import type { Sql } from '../db';
import { companyParamsSchema, DATE_PATTERN, findCompany } from '../http';

/**
 * Entrada de dados.
 *
 * Por enquanto a importaÃ§Ã£o aceita lanÃ§amentos no formato canÃ´nico (JSON).
 * O parser de CSV do sistema da clÃ­nica entra aqui quando o export real
 * do especialista chegar â€” o formato nÃ£o Ã© inventado antes (KICKOFF, Passo 2).
 */

interface EntryPayload {
  kind: 'receivable' | 'payable';
  amountCents: number;
  issuedOn: string;
  dueOn?: string;
  settledOn?: string | null;
  counterparty?: string;
  category?: string;
  costType?: 'fixed' | 'variable';
  externalId?: string;
}

interface ImportBody {
  source?: string;
  periodStart: string;
  periodEnd: string;
  entries: EntryPayload[];
}

interface BalanceBody {
  observedOn: string;
  balanceCents: number;
}

const dateSchema = { type: 'string', pattern: DATE_PATTERN } as const;

const importBodySchema = {
  type: 'object',
  required: ['periodStart', 'periodEnd', 'entries'],
  additionalProperties: false,
  properties: {
    source: { type: 'string', minLength: 1 },
    periodStart: dateSchema,
    periodEnd: dateSchema,
    entries: {
      type: 'array',
      minItems: 1,
      maxItems: 20_000,
      items: {
        type: 'object',
        required: ['kind', 'amountCents', 'issuedOn'],
        additionalProperties: false,
        properties: {
          kind: { enum: ['receivable', 'payable'] },
          amountCents: { type: 'integer', minimum: 1 },
          issuedOn: dateSchema,
          dueOn: dateSchema,
          settledOn: { anyOf: [dateSchema, { type: 'null' }] },
          counterparty: { type: 'string' },
          category: { type: 'string' },
          costType: { enum: ['fixed', 'variable'] },
          externalId: { type: 'string' },
        },
      },
    },
  },
} as const;

export function registerData(app: FastifyInstance, sql: Sql) {
  app.post<{ Params: { id: string }; Body: ImportBody }>(
    '/companies/:id/imports',
    { schema: { params: companyParamsSchema, body: importBodySchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });

      const b = req.body;
      const fileHash = createHash('sha256').update(JSON.stringify(b.entries)).digest('hex');

      // idempotÃªncia: o mesmo arquivo nunca entra duas vezes
      const [existing] = await sql`
        SELECT id FROM imports WHERE company_id = ${company.id} AND file_hash = ${fileHash}`;
      if (existing) {
        return reply.code(200).send({
          imported: false,
          importId: existing.id,
          message: 'Este arquivo jÃ¡ foi importado antes. Nada foi duplicado.',
        });
      }

      try {
        const importId = await sql.begin(async (tx) => {
          const [imp] = await tx`
            INSERT INTO imports (company_id, source, period_start, period_end, file_hash, row_count)
            VALUES (${company.id}, ${b.source ?? 'manual_json'}, ${b.periodStart}, ${b.periodEnd},
                    ${fileHash}, ${b.entries.length})
            RETURNING id`;

          const rows = b.entries.map((e) => ({
            company_id: company.id,
            import_id: imp.id,
            kind: e.kind,
            amount_cents: e.amountCents,
            issued_on: e.issuedOn,
            due_on: e.dueOn ?? e.issuedOn,
            settled_on: e.settledOn ?? null,
            counterparty: e.counterparty ?? null,
            category: e.category ?? null,
            cost_type: e.costType ?? null,
            external_id: e.externalId ?? null,
          }));

          // lotes de 500 para nÃ£o estourar o limite de parÃ¢metros do Postgres
          for (let i = 0; i < rows.length; i += 500) {
            await tx`INSERT INTO entries ${tx(rows.slice(i, i + 500))}`;
          }
          return imp.id as string;
        });

        return reply.code(201).send({ imported: true, importId, rowCount: b.entries.length });
      } catch (err) {
        // corrida entre duas importaÃ§Ãµes iguais: o UNIQUE segura, respondemos idempotente
        if ((err as { code?: string }).code === '23505') {
          const [row] = await sql`
            SELECT id FROM imports WHERE company_id = ${company.id} AND file_hash = ${fileHash}`;
          return reply.code(200).send({
            imported: false,
            importId: row?.id ?? null,
            message: 'Este arquivo jÃ¡ foi importado antes. Nada foi duplicado.',
          });
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string }; Body: BalanceBody }>(
    '/companies/:id/balances',
    {
      schema: {
        params: companyParamsSchema,
        body: {
          type: 'object',
          required: ['observedOn', 'balanceCents'],
          additionalProperties: false,
          properties: {
            observedOn: dateSchema,
            // pode ser negativo: cheque especial
            balanceCents: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });

      const b = req.body;
      await sql`
        INSERT INTO cash_balances (company_id, observed_on, balance_cents)
        VALUES (${company.id}, ${b.observedOn}, ${b.balanceCents})
        ON CONFLICT (company_id, observed_on)
        DO UPDATE SET balance_cents = EXCLUDED.balance_cents`;

      return reply.code(201).send({ observedOn: b.observedOn, balanceCents: b.balanceCents });
    },
  );
}
````

### `apps/api/src/routes/devices.ts`

````ts
import type { FastifyInstance } from 'fastify';

import type { Sql } from '../db';
import { companyParamsSchema, findCompany } from '../http';
import { isExpoPushToken, type PushMessage, type PushSender } from '../push';

/**
 * Aparelhos que recebem o aviso.
 *
 * O app manda o "endereÃ§o" (push token do Expo) do celular do dono; guardamos
 * ligado Ã  empresa. Quando um alerta dispara (na rota de snapshots), o Pulso
 * entrega a notificaÃ§Ã£o para todos os aparelhos daquela empresa.
 */
export function registerDevices(
  app: FastifyInstance,
  sql: Sql,
  pushSender: PushSender | null = null,
) {
  // O app registra (ou reconfirma) o endereÃ§o deste celular.
  app.post<{ Params: { id: string }; Body: { token: string; platform?: string } }>(
    '/companies/:id/devices',
    {
      schema: {
        params: companyParamsSchema,
        body: {
          type: 'object',
          required: ['token'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', minLength: 1 },
            platform: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });

      const { token, platform } = req.body;
      if (!isExpoPushToken(token)) {
        return reply.code(400).send({ error: 'EndereÃ§o de push invÃ¡lido.' });
      }

      // o mesmo aparelho nunca duplica; se mudar de empresa, passa a valer a nova
      await sql`
        INSERT INTO device_tokens (company_id, token, platform)
        VALUES (${company.id}, ${token}, ${platform ?? null})
        ON CONFLICT (token)
        DO UPDATE SET company_id = EXCLUDED.company_id,
                      platform = EXCLUDED.platform,
                      last_seen_at = now()`;

      return reply.code(201).send({ registered: true });
    },
  );

  // Envio de teste: confirma na prÃ¡tica que a notificaÃ§Ã£o chega no celular.
  app.post<{ Params: { id: string } }>(
    '/companies/:id/push-test',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });
      if (!pushSender) {
        return reply.code(503).send({ error: 'Envio de push nÃ£o configurado no servidor.' });
      }

      const tokens = await sql`
        SELECT token FROM device_tokens WHERE company_id = ${company.id}`;
      if (tokens.length === 0) {
        return reply.code(200).send({ sent: 0, message: 'Nenhum aparelho registrado ainda.' });
      }

      const messages: PushMessage[] = tokens.map((t) => ({
        to: t.token as string,
        title: 'Pulso â€” teste',
        body: 'Se vocÃª recebeu isto, os avisos do Pulso estÃ£o chegando. ðŸ’š',
        data: { kind: 'test' },
      }));
      const results = await pushSender.send(messages);
      const ok = results.filter((r) => r.ok).length;

      return reply.code(200).send({ sent: ok, total: messages.length });
    },
  );
}
````

### `apps/api/src/routes/interest.ts`

````ts
import type { FastifyInstance } from 'fastify';

import { normalizeEmail } from '../auth';
import type { Sql } from '../db';

/**
 * Lista de interesse do site.
 *
 * Ponto de integraÃ§Ã£o ISOLADO: enquanto o app nÃ£o estÃ¡ publicado, o CTA do site
 * guarda sÃ³ o e-mail de quem quer ser avisado. Quando o app publicar, o site
 * troca o CTA pelos links das lojas e esta rota vira a base de aviso de
 * lanÃ§amento. Nada aqui toca dados financeiros.
 */

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

interface Body {
  email: string;
  source?: string;
}

export function registerInterest(app: FastifyInstance, sql: Sql) {
  app.post<{ Body: Body }>(
    '/interesse',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
            source: { type: 'string', maxLength: 40 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = normalizeEmail(req.body.email);
      // idempotente: o mesmo e-mail nÃ£o duplica nem dÃ¡ erro pro visitante
      await sql`
        INSERT INTO interest_emails (email, source)
        VALUES (${email}, ${req.body.source ?? 'site'})
        ON CONFLICT (email) DO NOTHING`;
      return reply.code(201).send({ ok: true });
    },
  );
}
````

### `apps/api/src/routes/planned.ts`

````ts
import type { FastifyInstance } from 'fastify';

import { companyFromRequest } from '../auth';
import type { Sql } from '../db';
import { DATE_PATTERN, UUID_PATTERN } from '../http';

/**
 * Contas PREVISTAS â€” a camada de planejamento do dono (a pagar e a receber).
 *
 * SEPARAÃ‡ÃƒO INVIOLÃVEL: aqui Ã© sÃ³ o PREVISTO. O REALIZADO (extrato, `entries`)
 * nÃ£o Ã© tocado. Uma conta sÃ³ "vira verdade" ao ser confirmada (graduaÃ§Ã£o),
 * quando guardamos a data real â€” a diferenÃ§a previstaÃ—real vai ensinar, mais
 * adiante, o atraso de cada cliente. Nada aqui altera nÃºmero auditado.
 */

interface ContaRow {
  id: string;
  kind: 'receivable' | 'payable';
  amount_cents: number;
  due_on: string;
  counterparty: string | null;
  category: string | null;
  recurrence: 'none' | 'monthly';
  status: 'prevista' | 'realizada';
  confirmed_on: string | null;
  created_at: Date;
}

const hoje = () => new Date().toISOString().slice(0, 10);

/** Estado de apresentaÃ§Ã£o: prevista | vencida (data passou, sem confirmar) | realizada. */
function statusApresentado(r: ContaRow, ref: string): 'prevista' | 'vencida' | 'realizada' {
  if (r.status === 'realizada') return 'realizada';
  return r.due_on < ref ? 'vencida' : 'prevista';
}

function toContaJson(r: ContaRow) {
  return {
    id: r.id,
    kind: r.kind,
    amountCents: r.amount_cents,
    dueOn: r.due_on,
    counterparty: r.counterparty,
    category: r.category,
    recurrence: r.recurrence,
    natureza: r.recurrence === 'monthly' ? 'recorrente' : 'avulsa',
    status: statusApresentado(r, hoje()),
    confirmedOn: r.confirmed_on,
    // TODO combinado com o CEO: enquanto nÃ£o graduada, Ã© sempre PREVISÃƒO na tela
    previsao: r.status !== 'realizada',
    createdAt: r.created_at,
  };
}

const createSchema = {
  type: 'object',
  required: ['kind', 'amountCents', 'dueOn'],
  additionalProperties: false,
  properties: {
    kind: { enum: ['receivable', 'payable'] },
    amountCents: { type: 'integer', minimum: 1 },
    dueOn: { type: 'string', pattern: DATE_PATTERN },
    counterparty: { type: 'string', maxLength: 200 },
    category: { type: 'string', maxLength: 80 },
    recurrence: { enum: ['none', 'monthly'] },
  },
} as const;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: UUID_PATTERN } },
} as const;

interface CreateBody {
  kind: 'receivable' | 'payable';
  amountCents: number;
  dueOn: string;
  counterparty?: string;
  category?: string;
  recurrence?: 'none' | 'monthly';
}

export function registerPlanned(app: FastifyInstance, sql: Sql) {
  // cadastrar uma conta prevista (a pagar ou a receber)
  app.post<{ Body: CreateBody }>(
    '/me/contas',
    { schema: { body: createSchema } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'FaÃ§a login para cadastrar contas.' });

      const b = req.body;
      const [row] = await sql`
        INSERT INTO planned_entries (company_id, kind, amount_cents, due_on, counterparty, category, recurrence)
        VALUES (${company.id}, ${b.kind}, ${b.amountCents}, ${b.dueOn},
                ${b.counterparty ?? null}, ${b.category ?? null}, ${b.recurrence ?? 'none'})
        RETURNING id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                  category, recurrence::text AS recurrence, status::text AS status,
                  confirmed_on::text AS confirmed_on, created_at`;
      return reply.code(201).send(toContaJson(row as unknown as ContaRow));
    },
  );

  // listar contas do dono; ?kind=receivable|payable filtra a visÃ£o
  app.get<{ Querystring: { kind?: string } }>('/me/contas', async (req, reply) => {
    const company = await companyFromRequest(sql, req);
    if (!company) return reply.code(401).send({ error: 'FaÃ§a login para ver suas contas.' });

    const kind = req.query.kind === 'payable' || req.query.kind === 'receivable' ? req.query.kind : null;
    const rows = kind
      ? await sql`
          SELECT id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                 category, recurrence::text AS recurrence, status::text AS status,
                 confirmed_on::text AS confirmed_on, created_at
          FROM planned_entries WHERE company_id = ${company.id} AND kind = ${kind}
          ORDER BY due_on`
      : await sql`
          SELECT id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                 category, recurrence::text AS recurrence, status::text AS status,
                 confirmed_on::text AS confirmed_on, created_at
          FROM planned_entries WHERE company_id = ${company.id}
          ORDER BY due_on`;

    return { contas: rows.map((r) => toContaJson(r as unknown as ContaRow)) };
  });

  // graduar: o dono confirma que a conta aconteceu (previsto â†’ realizado)
  app.post<{ Params: { id: string }; Body: { confirmedOn?: string } | undefined }>(
    '/me/contas/:id/confirmar',
    {
      schema: {
        params: idParams,
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: { confirmedOn: { type: 'string', pattern: DATE_PATTERN } },
        },
      },
    },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'FaÃ§a login.' });

      const quando = req.body?.confirmedOn ?? hoje();
      const [row] = await sql`
        UPDATE planned_entries
        SET status = 'realizada', confirmed_on = ${quando}
        WHERE id = ${req.params.id} AND company_id = ${company.id}
        RETURNING id, kind::text AS kind, amount_cents, due_on::text AS due_on, counterparty,
                  category, recurrence::text AS recurrence, status::text AS status,
                  confirmed_on::text AS confirmed_on, created_at`;
      if (!row) return reply.code(404).send({ error: 'Conta nÃ£o encontrada.' });
      return toContaJson(row as unknown as ContaRow);
    },
  );

  // remover uma conta prevista (cadastro de baixo atrito: dÃ¡ pra desfazer)
  app.delete<{ Params: { id: string } }>(
    '/me/contas/:id',
    { schema: { params: idParams } },
    async (req, reply) => {
      const company = await companyFromRequest(sql, req);
      if (!company) return reply.code(401).send({ error: 'FaÃ§a login.' });

      const [row] = await sql`
        DELETE FROM planned_entries
        WHERE id = ${req.params.id} AND company_id = ${company.id}
        RETURNING id`;
      if (!row) return reply.code(404).send({ error: 'Conta nÃ£o encontrada.' });
      return { ok: true, id: row.id };
    },
  );
}
````

### `apps/api/src/routes/snapshots.ts`

````ts
import { computeAll, CORE_VERSION, evaluate } from '@pulso/core';
import type { CompanySnapshot } from '@pulso/core';
import type { FastifyInstance } from 'fastify';

import { writeAlert, type AlertWriterModel } from '../ai/writer';
import type { Sql } from '../db';
import { companyParamsSchema, DATE_PATTERN, findCompany, toCompanyJson, type CompanyRow } from '../http';
import type { PushMessage, PushSender } from '../push';

/**
 * CÃ¡lculo e leitura.
 *
 * REGRA: nenhuma conta financeira aqui. Esta rota carrega dados do banco,
 * entrega ao core (computeAll + evaluate) e persiste o resultado. Se uma
 * soma de dinheiro aparecer neste arquivo, ela estÃ¡ no lugar errado.
 */

async function loadCompanySnapshot(
  sql: Sql,
  company: CompanyRow,
  asOf: string,
): Promise<CompanySnapshot> {
  const entryRows = await sql`
    SELECT id::text AS id, kind::text AS kind, amount_cents,
           issued_on::text AS issued_on, due_on::text AS due_on, settled_on::text AS settled_on,
           counterparty, category, cost_type::text AS cost_type
    FROM entries WHERE company_id = ${company.id}`;

  const balanceRows = await sql`
    SELECT observed_on::text AS observed_on, balance_cents
    FROM cash_balances WHERE company_id = ${company.id}
    ORDER BY observed_on`;

  return {
    asOf,
    entries: entryRows.map((r) => ({
      id: r.id as string,
      kind: r.kind as 'receivable' | 'payable',
      amountCents: r.amount_cents as number,
      issuedOn: r.issued_on as string,
      dueOn: r.due_on as string,
      settledOn: (r.settled_on as string | null) ?? null,
      counterparty: (r.counterparty as string | null) ?? undefined,
      category: (r.category as string | null) ?? undefined,
      costType: (r.cost_type as 'fixed' | 'variable' | null) ?? undefined,
    })),
    balances: balanceRows.map((r) => ({
      observedOn: r.observed_on as string,
      balanceCents: r.balance_cents as number,
    })),
    declaredFixedCostCents: company.declared_fixed_cost_cents ?? undefined,
  };
}

/**
 * Entrega no celular os alertas sÃ©rios (warn/critical) que ainda nÃ£o foram
 * avisados. Trava anti-spam: o mesmo tipo de alerta (rule_key) nÃ£o repete
 * em 12h. Nunca falha o snapshot â€” push Ã© entrega, nÃ£o cÃ¡lculo.
 */
/** Tipos de alerta jÃ¡ entregues nas Ãºltimas 12h. Lido ANTES de recalcular
 *  (o recÃ¡lculo apaga e recria os alertas do dia, junto do pushed_at). */
async function recentlyPushedRuleKeys(sql: Sql, companyId: string): Promise<Set<string>> {
  const rows = await sql`
    SELECT DISTINCT rule_key FROM alerts
    WHERE company_id = ${companyId} AND pushed_at IS NOT NULL AND pushed_at > now() - interval '12 hours'`;
  return new Set(rows.map((r) => r.rule_key as string));
}

async function notifyNewAlerts(
  sql: Sql,
  pushSender: PushSender,
  companyId: string,
  written: Array<{ id: string; ruleKey: string; severity: string; title: string | null; body: string | null }>,
  jaAvisado: Set<string>,
): Promise<void> {
  const serios = written.filter((a) => a.severity === 'warn' || a.severity === 'critical');
  if (serios.length === 0) return;

  const tokenRows = await sql`SELECT token FROM device_tokens WHERE company_id = ${companyId}`;
  if (tokenRows.length === 0) return;
  const tokens = tokenRows.map((r) => r.token as string);

  const aEnviar = serios.filter((a) => !jaAvisado.has(a.ruleKey));
  if (aEnviar.length === 0) return;

  const messages: PushMessage[] = [];
  for (const a of aEnviar) {
    for (const to of tokens) {
      messages.push({
        to,
        title: a.title ?? 'Pulso',
        body: a.body ?? 'HÃ¡ um sinal importante no seu caixa.',
        data: { kind: 'alert', ruleKey: a.ruleKey },
      });
    }
  }

  await pushSender.send(messages);
  const ids = aEnviar.map((a) => a.id);
  await sql`UPDATE alerts SET pushed_at = now() WHERE id = ANY(${ids})`;
}

type Payload = Record<string, { value?: unknown }> | null | undefined;

function valorInd(payload: Payload, key: string): number | null {
  const v = payload?.[key]?.value;
  return typeof v === 'number' ? v : null;
}

/**
 * Comparativo atual Ã— anterior dos indicadores de topo (Ciclo, Margem, Receita).
 * TUDO jÃ¡ foi calculado pelo core â€” aqui sÃ³ comparamos dois retratos. Receita
 * usa o mÃªs anterior do prÃ³prio snapshot; Ciclo e Margem usam o snapshot
 * anterior (aparecem sÃ³ quando jÃ¡ existe histÃ³rico â€” nunca inventamos).
 */
function montarComparativos(atual: Payload, anterior: Payload) {
  return {
    cash_cycle: { atual: valorInd(atual, 'cash_cycle'), anterior: valorInd(anterior, 'cash_cycle') },
    contribution_margin: {
      atual: valorInd(atual, 'contribution_margin'),
      anterior: valorInd(anterior, 'contribution_margin'),
    },
    revenue_current: {
      atual: valorInd(atual, 'revenue_current'),
      anterior: valorInd(atual, 'revenue_previous'),
    },
  };
}

/**
 * Monta a resposta do dashboard (Ãºltimo snapshot + alertas ordenados).
 * Retorna null quando a empresa ainda nÃ£o tem nenhum cÃ¡lculo (conta nova).
 * Fonte Ãºnica usada tanto pela rota pÃºblica quanto pela rota logada (/me).
 */
export async function buildDashboard(sql: Sql, company: CompanyRow) {
  const [snapshot] = await sql`
    SELECT id, as_of::text AS as_of, core_version, payload, computed_at
    FROM indicator_snapshots
    WHERE company_id = ${company.id}
    ORDER BY as_of DESC
    LIMIT 1`;
  if (!snapshot) return null;

  // snapshot anterior (para a tendÃªncia de Ciclo e Margem); pode nÃ£o existir
  const [anterior] = await sql`
    SELECT payload
    FROM indicator_snapshots
    WHERE company_id = ${company.id} AND as_of < ${snapshot.as_of}
    ORDER BY as_of DESC
    LIMIT 1`;

  const alertRows = await sql`
    SELECT rule_key, severity::text AS severity, facts, text_title, text_body, created_at
    FROM alerts
    WHERE snapshot_id = ${snapshot.id}
    ORDER BY CASE severity::text WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, created_at`;

  return {
    company: toCompanyJson(company),
    snapshot: {
      asOf: snapshot.as_of,
      coreVersion: snapshot.core_version,
      computedAt: snapshot.computed_at,
      indicators: snapshot.payload,
    },
    comparativos: montarComparativos(
      snapshot.payload as Payload,
      (anterior?.payload as Payload) ?? null,
    ),
    alerts: alertRows.map((a) => ({
      ruleKey: a.rule_key,
      severity: a.severity,
      facts: a.facts,
      textTitle: a.text_title,
      textBody: a.text_body,
      createdAt: a.created_at,
    })),
  };
}

export function registerSnapshots(
  app: FastifyInstance,
  sql: Sql,
  alertWriter: AlertWriterModel | null = null,
  pushSender: PushSender | null = null,
) {
  app.post<{ Params: { id: string }; Body: { asOf?: string } | undefined }>(
    '/companies/:id/snapshots',
    {
      schema: {
        params: companyParamsSchema,
        body: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: { asOf: { type: 'string', pattern: DATE_PATTERN } },
        },
      },
    },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });

      const asOf = req.body?.asOf ?? new Date().toISOString().slice(0, 10);

      // lido antes de recalcular: o recÃ¡lculo do dia apaga os alertas (e o pushed_at)
      const jaAvisado = pushSender
        ? await recentlyPushedRuleKeys(sql, company.id)
        : new Set<string>();

      const snap = await loadCompanySnapshot(sql, company, asOf);
      const indicators = computeAll(snap);
      const alerts = evaluate(indicators);

      // a voz do Pulso: a IA (ou o template) redige a partir dos facts â€”
      // e de NADA alÃ©m dos facts
      const profile = { name: company.name, niche: company.niche };
      const written = await Promise.all(
        alerts.map(async (a) => ({ alert: a, text: await writeAlert(alertWriter, a, profile) })),
      );

      const gravados: Array<{
        id: string;
        ruleKey: string;
        severity: string;
        title: string | null;
        body: string | null;
      }> = [];
      const snapshotId = await sql.begin(async (tx) => {
        const [s] = await tx`
          INSERT INTO indicator_snapshots (company_id, as_of, core_version, payload)
          VALUES (${company.id}, ${asOf}, ${CORE_VERSION}, ${tx.json(indicators as never)})
          ON CONFLICT (company_id, as_of)
          DO UPDATE SET core_version = EXCLUDED.core_version,
                        payload = EXCLUDED.payload,
                        computed_at = now()
          RETURNING id`;

        // recalcular o mesmo dia substitui os alertas daquele dia
        await tx`DELETE FROM alerts WHERE snapshot_id = ${s.id}`;
        for (const { alert: a, text } of written) {
          const [row] = await tx`
            INSERT INTO alerts (company_id, snapshot_id, rule_key, severity, facts,
                                text_title, text_body, model_version)
            VALUES (${company.id}, ${s.id}, ${a.ruleKey}, ${a.severity}, ${tx.json(a.facts as never)},
                    ${text.title}, ${text.body}, ${text.modelVersion})
            RETURNING id`;
          gravados.push({
            id: row.id as string,
            ruleKey: a.ruleKey,
            severity: a.severity,
            title: text.title,
            body: text.body,
          });
        }
        return s.id as string;
      });

      // entrega no celular (best-effort): nunca derruba o snapshot
      if (pushSender) {
        try {
          await notifyNewAlerts(sql, pushSender, company.id, gravados, jaAvisado);
        } catch (err) {
          app.log.error({ err }, 'falha ao enviar push dos alertas');
        }
      }

      return reply.code(201).send({
        snapshotId,
        asOf,
        coreVersion: CORE_VERSION,
        alerts: written.map(({ alert: a, text }) => ({
          ruleKey: a.ruleKey,
          severity: a.severity,
          facts: a.facts,
          textTitle: text.title,
          textBody: text.body,
          modelVersion: text.modelVersion,
        })),
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/companies/:id/dashboard',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });

      const dash = await buildDashboard(sql, company);
      if (!dash) {
        return reply.code(404).send({
          error: 'Nenhum cÃ¡lculo feito ainda. Importe dados e crie um snapshot primeiro.',
        });
      }
      return dash;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/companies/:id/alerts',
    { schema: { params: companyParamsSchema } },
    async (req, reply) => {
      const company = await findCompany(sql, req.params.id);
      if (!company) return reply.code(404).send({ error: 'Empresa nÃ£o encontrada.' });

      const rows = await sql`
        SELECT id, rule_key, severity::text AS severity, facts, text_title, text_body,
               created_at, pushed_at, opened_at, acted_at
        FROM alerts
        WHERE company_id = ${company.id}
        ORDER BY created_at DESC
        LIMIT 100`;

      return {
        alerts: rows.map((a) => ({
          id: a.id,
          ruleKey: a.rule_key,
          severity: a.severity,
          facts: a.facts,
          textTitle: a.text_title,
          textBody: a.text_body,
          createdAt: a.created_at,
          pushedAt: a.pushed_at,
          openedAt: a.opened_at,
          actedAt: a.acted_at,
        })),
      };
    },
  );
}
````

### `apps/api/0002_devices.sql`

````sql
-- Pulso â€” migraÃ§Ã£o 0002: aparelhos que recebem o aviso (push)
-- Onde o Pulso entrega a notificaÃ§Ã£o "seu caixa pode zerar". Um endereÃ§o
-- (push token do Expo) por aparelho. Um dono pode ter mais de um aparelho.

CREATE TABLE device_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,      -- ExponentPushToken[...]; o mesmo aparelho nunca duplica
  platform     TEXT,                      -- 'android' | 'ios' (informativo)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX device_tokens_company ON device_tokens (company_id);
````

### `apps/api/0003_auth.sql`

````sql
-- Pulso â€” migraÃ§Ã£o 0003: contas de acesso (login de verdade)
-- Cada dono se cadastra e passa a ter uma conta ligada Ã  sua empresa.
-- Senha nunca Ã© guardada em texto: sÃ³ o hash (scrypt). Token de sessÃ£o tambÃ©m
-- sÃ³ entra aqui como hash â€” o token cru vive sÃ³ no aparelho do dono.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,          -- guardado em minÃºsculas
  password_hash TEXT NOT NULL,                 -- scrypt: 'salt:derivado' (hex)
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_tokens (
  token_hash TEXT PRIMARY KEY,                 -- sha256 do token; o cru nunca Ã© guardado
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_user ON auth_tokens (user_id);
````

### `apps/api/0004_planned_entries.sql`

````sql
-- Pulso â€” migraÃ§Ã£o 0004: contas PREVISTAS (camada de planejamento do dono)
--
-- SEPARAÃ‡ÃƒO INVIOLÃVEL: esta tabela Ã© a camada PREVISTO (o que o dono planeja).
-- Ela NUNCA se mistura com `entries` (a camada REALIZADO, a verdade do extrato).
-- Uma conta prevista sÃ³ "vira verdade" ao ser confirmada (graduaÃ§Ã£o): aÃ­
-- guardamos a data real (confirmed_on) â€” a diferenÃ§a previstaÃ—real Ã© o que,
-- mais adiante, ensina o atraso de cada cliente.
--
-- Futuro: integraÃ§Ãµes (maquininha, API) preencherÃ£o o REALIZADO automaticamente.
-- O cadastro manual continua aqui, no PREVISTO. Por isso as camadas jÃ¡ nascem
-- separadas â€” a integraÃ§Ã£o pluga sem refatorar.

CREATE TYPE planned_status  AS ENUM ('prevista', 'realizada');
CREATE TYPE recurrence_kind AS ENUM ('none', 'monthly');

CREATE TABLE planned_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  kind         entry_kind NOT NULL,                 -- receivable (a receber) | payable (a pagar)
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  due_on       DATE NOT NULL,                       -- data PREVISTA
  counterparty TEXT,                                -- cliente (a receber) ou fornecedor (a pagar)
  category     TEXT,                                -- folha, fornecedor, imposto, aluguel...
  recurrence   recurrence_kind NOT NULL DEFAULT 'none',  -- avulsa = none; recorrente = monthly

  status       planned_status NOT NULL DEFAULT 'prevista',
  confirmed_on DATE,                                -- data REAL na graduaÃ§Ã£o (sÃ³ quando 'realizada')

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX planned_entries_company ON planned_entries (company_id, due_on);
````

### `apps/api/0005_interest.sql`

````sql
-- Pulso â€” migraÃ§Ã£o 0005: lista de interesse (cadastro simples do site)
-- Enquanto o app nÃ£o estÃ¡ publicado, o CTA do site coleta sÃ³ o e-mail de quem
-- quer ser avisado. Quando o app publicar, o CTA passa a apontar para as lojas
-- e esta tabela vira a base de aviso de lanÃ§amento.

CREATE TABLE interest_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,   -- guardado em minÃºsculas
  source     TEXT,                   -- de onde veio (ex.: 'site')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
````

### 3.3 App (apps/mobile/src)

### `apps/mobile/src/app/(tabs)/_layout.tsx`

````tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // troca de aba com um leve fade em vez de corte seco
        animation: 'fade',
        tabBarActiveTintColor: colors.vivo,
        tabBarInactiveTintColor: colors.cinza,
        tabBarStyle: {
          backgroundColor: colors.branco,
          borderTopColor: colors.linha,
        },
        tabBarLabelStyle: { fontFamily: fonts.corpoMedio, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.papel },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'InÃ­cio',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="contas"
        options={{
          title: 'Contas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Conversa',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="conta"
        options={{
          title: 'Conta',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
````

### `apps/mobile/src/app/(tabs)/chat.tsx`

````tsx
/**
 * Conversa. Com o servidor no ar, as respostas vÃªm da IA do Pulso â€”
 * que sÃ³ usa nÃºmeros jÃ¡ calculados e passa pelo fiscal contra nÃºmero
 * inventado. Em modo demonstraÃ§Ã£o, o app avisa com todas as letras.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { sendMyChat, type ChatTurnJson } from '@/lib/api';
import { responderDeterministico } from '@/lib/perguntas';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

interface Mensagem {
  id: string;
  de: 'voce' | 'pulso';
  texto: string;
}

// sugestÃµes de partida â€” perguntas que o Pulso sabe responder bem
const SUGESTOES = ['Quando meu caixa zera?', 'Quem me deve?', 'DÃ¡ pra pagar as contas do mÃªs?'];

/** Um pontinho que pulsa, com atraso prÃ³prio (bolha "digitandoâ€¦"). */
function Ponto({ atraso }: { atraso: number }) {
  const o = useSharedValue(0.3);
  useEffect(() => {
    o.value = withDelay(
      atraso,
      withRepeat(withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [o, atraso]);
  const estilo = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.ponto, estilo]} />;
}

/** A bolha "digitandoâ€¦" do Pulso, com trÃªs pontinhos pulsando em sequÃªncia. */
function Digitando() {
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      style={[styles.msg, styles.msgPulso, styles.digitandoBolha]}
    >
      <Ponto atraso={0} />
      <Ponto atraso={150} />
      <Ponto atraso={300} />
    </Animated.View>
  );
}

const RESPOSTA_DEMO =
  'Na demonstraÃ§Ã£o eu respondo as perguntas de caixa com os nÃºmeros do exemplo. ' +
  'Tente: "Quando meu caixa zera?", "Quem me deve?" ou "DÃ¡ pra pagar as contas do mÃªs?". ' +
  'Com sua conta ligada, eu converso sobre os seus prÃ³prios nÃºmeros.';

const RESPOSTA_ERRO =
  'NÃ£o consegui falar com o servidor agora. Tente de novo em instantes. Seus alertas continuam no painel.';

export default function Chat() {
  const { dashboard, token } = usePulso();
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: 'boas-vindas',
      de: 'pulso',
      texto: dashboard
        ? `OlÃ¡! Eu sou o Pulso, o monitor do caixa de ${dashboard.company.name}. Pergunte qualquer coisa sobre seus nÃºmeros.`
        : 'OlÃ¡! Eu sou o Pulso. Pergunte qualquer coisa sobre seus nÃºmeros.',
    },
  ]);
  const lista = useRef<FlatList<Mensagem>>(null);

  function rolar() {
    setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 60);
  }

  async function enviar(valorDireto?: string) {
    const limpo = (valorDireto ?? texto).trim();
    if (!limpo || pensando) return;
    setTexto('');

    const minhas: Mensagem[] = [...mensagens, { id: `v-${Date.now()}`, de: 'voce', texto: limpo }];
    setMensagens(minhas);
    rolar();

    // modo demonstraÃ§Ã£o (sem login): responde as perguntas determinÃ­sticas com os
    // nÃºmeros prontos do exemplo; se nÃ£o for uma delas, orienta. Nunca finge IA.
    if (!token) {
      const det = dashboard ? responderDeterministico(dashboard, limpo) : null;
      setMensagens([...minhas, { id: `p-${Date.now()}`, de: 'pulso', texto: det ?? RESPOSTA_DEMO }]);
      rolar();
      return;
    }

    setPensando(true);
    try {
      // histÃ³rico no formato do servidor (sem a mensagem de boas-vindas)
      const turns: ChatTurnJson[] = minhas
        .filter((m) => m.id !== 'boas-vindas')
        .map((m) => ({ role: m.de === 'voce' ? 'user' : 'assistant', content: m.texto }));
      const resposta = await sendMyChat(token, turns);
      setMensagens([...minhas, { id: `p-${Date.now()}`, de: 'pulso', texto: resposta }]);
    } catch {
      setMensagens([...minhas, { id: `p-${Date.now()}`, de: 'pulso', texto: RESPOSTA_ERRO }]);
    } finally {
      setPensando(false);
      rolar();
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <Text style={styles.titulo}>Conversa</Text>

        <FlatList
          ref={lista}
          data={mensagens}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.lista}
          renderItem={({ item }) => (
            <Animated.View
              entering={FadeInDown.duration(220)}
              style={[styles.msg, item.de === 'voce' ? styles.msgVoce : styles.msgPulso]}
            >
              <Text style={item.de === 'voce' ? styles.msgTextoVoce : styles.msgTextoPulso}>
                {item.texto}
              </Text>
            </Animated.View>
          )}
          ListFooterComponent={pensando ? <Digitando /> : null}
        />

        {/* sugestÃµes de partida â€” sÃ³ enquanto a conversa mal comeÃ§ou */}
        {mensagens.length <= 1 && !pensando && (
          <View style={styles.sugestoes}>
            {SUGESTOES.map((s) => (
              <Pressable
                key={s}
                style={({ pressed }) => [styles.sugestao, pressed && styles.pressionado]}
                onPress={() => enviar(s)}
              >
                <Text style={styles.sugestaoTexto}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.entrada}>
          <TextInput
            style={styles.campo}
            value={texto}
            onChangeText={setTexto}
            placeholder="Pergunte sobre seu negÃ³cioâ€¦"
            placeholderTextColor={colors.cinza}
            onSubmitEditing={() => enviar()}
            returnKeyType="send"
          />
          <Pressable
            style={({ pressed }) => [styles.enviar, pressed && styles.pressionado]}
            onPress={() => enviar()}
          >
            <Ionicons name="arrow-forward" size={18} color={colors.mata} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  wrap: { flex: 1 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    paddingHorizontal: 18,
    paddingVertical: 12,
    letterSpacing: -0.3,
  },
  lista: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  msg: { maxWidth: '86%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10 },
  msgVoce: {
    alignSelf: 'flex-end',
    backgroundColor: colors.mata,
    borderBottomRightRadius: 4,
  },
  msgPulso: {
    alignSelf: 'flex-start',
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderBottomLeftRadius: 4,
  },
  msgTextoVoce: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.papel },
  msgTextoPulso: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.tinta },
  digitandoBolha: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 14 },
  ponto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cinza },

  sugestoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  sugestao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sugestaoTexto: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.mata },

  entrada: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 6,
  },
  campo: {
    flex: 1,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.corpo,
    fontSize: 14,
    color: colors.tinta,
  },
  enviar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.vivo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressionado: { opacity: 0.8 },
});
````

### `apps/mobile/src/app/(tabs)/conta.tsx`

````tsx
/**
 * Conta. Sem checkout dentro do app â€” nem botÃ£o, nem link clicÃ¡vel de
 * pagamento (regra do KICKOFF: a assinatura acontece no site; Ã© isso que
 * mantÃ©m a comissÃ£o da loja fora do ticket).
 */

import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function Conta() {
  const { dashboard, fonte, sair } = usePulso();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titulo}>Conta</Text>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>NEGÃ“CIO</Text>
          <Text style={styles.nome}>{dashboard?.company.name ?? 'Â·'}</Text>
          <Text style={styles.detalhe}>
            {fonte === 'demo' ? 'Modo demonstraÃ§Ã£o Â· dados fictÃ­cios' : 'Conectada ao servidor do Pulso'}
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>PLANO</Text>
          <Text style={styles.nome}>Piloto</Text>
          <Text style={styles.detalhe}>
            VocÃª faz parte da turma que estÃ¡ construindo o Pulso com a gente. A assinatura, quando
            chegar, acontece no site do Pulso. Nada de pagamento por aqui.
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>AVISOS NO WHATSAPP</Text>
          <View style={styles.linhaAviso}>
            <Text style={styles.nome}>Alertas de caixa</Text>
            <View style={styles.selo}>
              <Text style={styles.seloTexto}>EM BREVE</Text>
            </View>
          </View>
          <Text style={styles.detalhe}>
            Quando o aviso pelo WhatsApp estiver ligado, os alertas sÃ©rios (como o caixa perto de
            zerar) chegam direto no seu nÃºmero, uma vez por dia. Por enquanto vocÃª acompanha tudo aqui
            no app e no painel.
          </Text>
        </View>

        <View style={styles.cartao}>
          <Text style={styles.rotulo}>SEUS DADOS</Text>
          <Text style={styles.detalhe}>
            Os lanÃ§amentos do seu negÃ³cio ficam guardados no servidor do Pulso, protegidos e usados sÃ³
            para calcular seus indicadores. Nenhum dado seu treina IA nem Ã© compartilhado.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.sair, pressed && styles.pressionado]}
          onPress={() => {
            sair();
            router.replace('/');
          }}
        >
          <Text style={styles.sairTexto}>Sair</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 18, gap: 12 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  cartao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    gap: 5,
  },
  rotulo: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2, color: colors.cinza },
  nome: { fontFamily: fonts.display, fontSize: 17, color: colors.tinta, letterSpacing: -0.2 },
  detalhe: { fontFamily: fonts.corpo, fontSize: 13.5, lineHeight: 20, color: colors.cinza },
  linhaAviso: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  selo: {
    backgroundColor: '#F0FBF6',
    borderWidth: 1,
    borderColor: colors.vivo,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  seloTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.okEscuro },

  sair: {
    borderWidth: 1.5,
    borderColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  pressionado: { opacity: 0.7 },
  sairTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
});
````

### `apps/mobile/src/app/(tabs)/contas.tsx`

````tsx
/**
 * Contas â€” a camada de PLANEJAMENTO do dono (a receber e a pagar).
 *
 * Tudo aqui Ã© PREVISÃƒO: o dono cadastra o que espera receber/pagar. Nada disto
 * Ã© o "realizado" (extrato) â€” uma conta sÃ³ vira verdade quando o dono confirma
 * que aconteceu (graduaÃ§Ã£o). O app nÃ£o calcula nada: sÃ³ cadastra e desenha.
 */

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  confirmarConta,
  criarConta,
  excluirConta,
  fetchContas,
  type ContaJson,
  type ContaKind,
} from '@/lib/api';
import { brl, dataBR } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

const CATEGORIAS: Record<ContaKind, string[]> = {
  receivable: ['convÃªnio', 'particular', 'cartÃ£o', 'outro'],
  payable: ['folha', 'fornecedor', 'imposto', 'aluguel', 'outro'],
};

const PRAZOS: Array<{ rotulo: string; dias: number }> = [
  { rotulo: 'Hoje', dias: 0 },
  { rotulo: '7 dias', dias: 7 },
  { rotulo: '15 dias', dias: 15 },
  { rotulo: '30 dias', dias: 30 },
  { rotulo: '45 dias', dias: 45 },
  { rotulo: '60 dias', dias: 60 },
];

function emIso(diasAFrente: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return d.toISOString().slice(0, 10);
}

function reaisParaCents(txt: string): number | null {
  const limpo = txt.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

const rotuloStatus: Record<ContaJson['status'], string> = {
  prevista: 'Prevista',
  vencida: 'Venceu, confirmar?',
  realizada: 'Aconteceu',
};
const corStatus: Record<ContaJson['status'], string> = {
  prevista: colors.cinza,
  vencida: colors.alerta,
  realizada: colors.okEscuro,
};

export default function Contas() {
  const { token } = usePulso();
  const [visao, setVisao] = useState<ContaKind>('receivable');
  const [contas, setContas] = useState<ContaJson[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      setContas(await fetchContas(token, visao));
    } catch {
      setErro('NÃ£o consegui carregar suas contas agora.');
    } finally {
      setCarregando(false);
    }
  }, [token, visao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // sem login (demonstraÃ§Ã£o): as contas ficam na conta de verdade
  if (!token) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.tituloSozinho}>Contas</Text>
        <View style={styles.vazio}>
          <Ionicons name="receipt-outline" size={30} color={colors.cinza} />
          <Text style={styles.vazioTexto}>
            O cadastro de contas fica guardado na sua conta. Entre ou crie a sua para comeÃ§ar a
            planejar o que tem a receber e a pagar.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>Contas</Text>
        <View style={styles.previsaoTag}>
          <Text style={styles.previsaoTagTexto}>PLANEJAMENTO Â· PREVISÃƒO</Text>
        </View>
      </View>

      {/* alternador a receber / a pagar */}
      <View style={styles.abas}>
        <Aba ativo={visao === 'receivable'} onPress={() => setVisao('receivable')} texto="A receber" />
        <Aba ativo={visao === 'payable'} onPress={() => setVisao('payable')} texto="A pagar" />
      </View>

      <ScrollView
        contentContainerStyle={styles.lista}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      >
        {mostrarForm && (
          <NovaContaForm
            visao={visao}
            token={token}
            onPronto={() => {
              setMostrarForm(false);
              void carregar();
            }}
            onCancelar={() => setMostrarForm(false)}
          />
        )}

        {!mostrarForm && (
          <Pressable
            style={({ pressed }) => [styles.novo, pressed && styles.pressionado]}
            onPress={() => setMostrarForm(true)}
          >
            <Ionicons name="add" size={18} color={colors.papel} />
            <Text style={styles.novoTexto}>
              Nova conta {visao === 'receivable' ? 'a receber' : 'a pagar'}
            </Text>
          </Pressable>
        )}

        {erro && <Text style={styles.erro}>{erro}</Text>}

        {!carregando && contas.length === 0 && !erro && (
          <Text style={styles.semContas}>
            Nada cadastrado ainda. Adicione o que vocÃª {visao === 'receivable' ? 'espera receber' : 'tem a pagar'} para o Pulso projetar seu caixa.
          </Text>
        )}

        {contas.map((c) => (
          <ContaCard key={c.id} conta={c} token={token} onMudou={carregar} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Aba({ ativo, onPress, texto }: { ativo: boolean; onPress: () => void; texto: string }) {
  return (
    <Pressable onPress={onPress} style={[styles.aba, ativo && styles.abaAtiva]}>
      <Text style={[styles.abaTexto, ativo && styles.abaTextoAtivo]}>{texto}</Text>
    </Pressable>
  );
}

function ContaCard({ conta, token, onMudou }: { conta: ContaJson; token: string; onMudou: () => void }) {
  const [ocupado, setOcupado] = useState(false);

  async function confirmar() {
    setOcupado(true);
    try {
      await confirmarConta(token, conta.id);
      onMudou();
    } catch {
      setOcupado(false);
    }
  }
  async function excluir() {
    setOcupado(true);
    try {
      await excluirConta(token, conta.id);
      onMudou();
    } catch {
      setOcupado(false);
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.card}>
      <View style={styles.cardTopo}>
        <Text style={styles.cardValor}>{brl(conta.amountCents)}</Text>
        <View style={[styles.chipStatus, { borderColor: corStatus[conta.status] }]}>
          <Text style={[styles.chipStatusTexto, { color: corStatus[conta.status] }]}>
            {rotuloStatus[conta.status]}
          </Text>
        </View>
      </View>

      <Text style={styles.cardQuem}>
        {conta.counterparty ?? (conta.kind === 'receivable' ? 'Cliente nÃ£o informado' : 'Fornecedor nÃ£o informado')}
      </Text>
      <Text style={styles.cardDetalhe}>
        {conta.status === 'realizada' && conta.confirmedOn
          ? `Confirmada em ${dataBR(conta.confirmedOn)} Â· prevista ${dataBR(conta.dueOn)}`
          : `Prevista para ${dataBR(conta.dueOn)}`}
        {conta.category ? ` Â· ${conta.category}` : ''}
        {conta.natureza === 'recorrente' ? ' Â· recorrente' : ''}
      </Text>

      {conta.status !== 'realizada' && (
        <View style={styles.cardAcoes}>
          <Pressable
            style={({ pressed }) => [styles.confirmar, pressed && styles.pressionado]}
            onPress={confirmar}
            disabled={ocupado}
          >
            {ocupado ? (
              <ActivityIndicator color={colors.papel} size="small" />
            ) : (
              <Text style={styles.confirmarTexto}>
                {conta.kind === 'receivable' ? 'Confirmar que recebi' : 'Confirmar que paguei'}
              </Text>
            )}
          </Pressable>
          <Pressable onPress={excluir} hitSlop={8} disabled={ocupado} style={styles.excluir}>
            <Ionicons name="trash-outline" size={18} color={colors.cinza} />
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

function NovaContaForm({
  visao,
  token,
  onPronto,
  onCancelar,
}: {
  visao: ContaKind;
  token: string;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const [valor, setValor] = useState('');
  const [quem, setQuem] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [prazoDias, setPrazoDias] = useState(30);
  const [recorrente, setRecorrente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cents = reaisParaCents(valor);
  const pode = cents !== null && !salvando;

  async function salvar() {
    if (cents === null) {
      setErro('Informe um valor vÃ¡lido.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await criarConta(token, {
        kind: visao,
        amountCents: cents,
        dueOn: emIso(prazoDias),
        counterparty: quem.trim() || undefined,
        category: categoria ?? undefined,
        recurrence: recorrente ? 'monthly' : 'none',
      });
      onPronto();
    } catch {
      setErro('NÃ£o consegui salvar agora. Tente de novo.');
      setSalvando(false);
    }
  }

  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.form}>
      <Text style={styles.formTitulo}>
        Nova conta {visao === 'receivable' ? 'a receber' : 'a pagar'}
      </Text>

      <Text style={styles.label}>VALOR (R$)</Text>
      <TextInput
        style={styles.input}
        value={valor}
        onChangeText={setValor}
        placeholder="0,00"
        placeholderTextColor={colors.cinza}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>{visao === 'receivable' ? 'CLIENTE' : 'FORNECEDOR'}</Text>
      <TextInput
        style={styles.input}
        value={quem}
        onChangeText={setQuem}
        placeholder={visao === 'receivable' ? 'Ex.: Unimed' : 'Ex.: Distribuidora Alfa'}
        placeholderTextColor={colors.cinza}
      />

      <Text style={styles.label}>CATEGORIA</Text>
      <View style={styles.chipsLinha}>
        {CATEGORIAS[visao].map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setCategoria((a) => (a === cat ? null : cat))}
            style={[styles.chip, categoria === cat && styles.chipAtivo]}
          >
            <Text style={[styles.chipTexto, categoria === cat && styles.chipTextoAtivo]}>{cat}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>DATA PREVISTA</Text>
      <View style={styles.chipsLinha}>
        {PRAZOS.map((p) => (
          <Pressable
            key={p.rotulo}
            onPress={() => setPrazoDias(p.dias)}
            style={[styles.chip, prazoDias === p.dias && styles.chipAtivo]}
          >
            <Text style={[styles.chipTexto, prazoDias === p.dias && styles.chipTextoAtivo]}>
              {p.rotulo}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.dataEscolhida}>Vai lanÃ§ar para {dataBR(emIso(prazoDias))}</Text>

      <Pressable style={styles.natureza} onPress={() => setRecorrente((v) => !v)}>
        <Ionicons
          name={recorrente ? 'checkbox' : 'square-outline'}
          size={20}
          color={recorrente ? colors.vivo : colors.cinza}
        />
        <Text style={styles.naturezaTexto}>
          Repete todo mÃªs (recorrente). Ex.: aluguel, folha
        </Text>
      </Pressable>

      {erro && <Text style={styles.erro}>{erro}</Text>}

      <View style={styles.formAcoes}>
        <Pressable onPress={onCancelar} style={styles.cancelar} hitSlop={6}>
          <Text style={styles.cancelarTexto}>Cancelar</Text>
        </Pressable>
        <Pressable
          onPress={salvar}
          disabled={!pode}
          style={({ pressed }) => [styles.salvar, (pressed || !pode) && styles.pressionado]}
        >
          {salvando ? (
            <ActivityIndicator color={colors.papel} size="small" />
          ) : (
            <Text style={styles.salvarTexto}>Salvar previsÃ£o</Text>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
  },
  tituloSozinho: {
    fontFamily: fonts.display,
    fontSize: 19,
    color: colors.tinta,
    letterSpacing: -0.3,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  previsaoTag: {
    backgroundColor: '#FDF3E3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previsaoTagTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.alerta },

  abas: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  aba: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.branco,
  },
  abaAtiva: { backgroundColor: colors.mata, borderColor: colors.mata },
  abaTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
  abaTextoAtivo: { color: colors.papel },

  lista: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 },

  novo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 13,
  },
  novoTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.papel },
  pressionado: { opacity: 0.85 },

  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  vazioTexto: { fontFamily: fonts.corpo, fontSize: 14, lineHeight: 21, color: colors.cinza, textAlign: 'center' },
  semContas: {
    fontFamily: fonts.corpo,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.cinza,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  erro: { fontFamily: fonts.corpo, fontSize: 13, color: colors.critico, textAlign: 'center' },

  card: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardValor: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.tinta,
    fontVariant: ['tabular-nums'],
  },
  chipStatus: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  chipStatusTexto: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.6 },
  cardQuem: { fontFamily: fonts.corpoForte, fontSize: 14, color: colors.tinta },
  cardDetalhe: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza },
  cardAcoes: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  confirmar: {
    flex: 1,
    backgroundColor: colors.vivo,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  confirmarTexto: { fontFamily: fonts.displayMedio, fontSize: 14, color: '#06231A' },
  excluir: { padding: 8 },

  form: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  formTitulo: { fontFamily: fonts.display, fontSize: 16, color: colors.tinta, marginBottom: 4 },
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: colors.cinza, marginTop: 8 },
  input: {
    backgroundColor: colors.papel,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: colors.tinta,
  },
  chipsLinha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.papel,
  },
  chipAtivo: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipTexto: { fontFamily: fonts.corpoMedio, fontSize: 12.5, color: colors.cinza },
  chipTextoAtivo: { color: colors.okEscuro },
  dataEscolhida: { fontFamily: fonts.corpo, fontSize: 12.5, color: colors.cinza, marginTop: 6 },
  natureza: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  naturezaTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 13, color: colors.tinta },
  formAcoes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  cancelar: { paddingVertical: 10, paddingHorizontal: 12 },
  cancelarTexto: { fontFamily: fonts.corpoMedio, fontSize: 14, color: colors.cinza },
  salvar: {
    backgroundColor: colors.mata,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  salvarTexto: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.papel },
});
````

### `apps/mobile/src/app/(tabs)/index.tsx`

````tsx
/**
 * Dashboard â€” o painel do dono.
 * O app nÃ£o calcula NADA: busca o JSON do servidor e desenha.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CountUpMoney } from '@/components/count-up-money';
import { PulsoLogo } from '@/components/logo';
import { PulseLine } from '@/components/pulse-line';
import type { CashProjectionPoint } from '@/lib/api';
import { brl, dataBR, dias, pct } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, type Severity } from '@/theme';

interface Tend {
  seta: string;
  pct: number;
  bom: boolean;
}

/** TendÃªncia atual Ã— anterior. `menorEhMelhor` inverte o julgamento (ex.: ciclo). */
function tendencia(
  atual: number | null | undefined,
  anterior: number | null | undefined,
  menorEhMelhor: boolean,
): Tend | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  const dif = atual - anterior;
  if (dif === 0) return { seta: 'â†’', pct: 0, bom: true };
  const pct = Math.round((Math.abs(dif) / Math.abs(anterior)) * 100);
  const subiu = dif > 0;
  return { seta: subiu ? 'â†‘' : 'â†“', pct, bom: menorEhMelhor ? !subiu : subiu };
}

export default function Dashboard() {
  const { dashboard, fonte, carregando, carregar } = usePulso();
  // qual mini-card estÃ¡ aberto mostrando "de onde vem esse nÃºmero" (null = nenhum)
  const [abertoChip, setAbertoChip] = useState<string | null>(null);

  if (!dashboard) {
    // enquanto busca sem dados ainda, mostra o "esqueleto" (nÃ£o uma tela branca)
    if (carregando) return <SkeletonDashboard />;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.vazio}>
          <PulsoLogo size={30} />
          <Text style={styles.vazioTexto}>
            Assim que seus lanÃ§amentos chegarem, o monitor liga aqui.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.tentar, pressed && styles.pressionado]}
            onPress={carregar}
          >
            <Text style={styles.tentarTexto}>Tentar de novo</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const ind = dashboard.snapshot.indicators;
  const projecao = (ind.cash_projection?.value ?? null) as CashProjectionPoint[] | null;
  const p30 = projecao?.find((p) => p.horizonDays === 30) ?? null;
  const saldoHoje = (ind.cash_balance?.value ?? null) as number | null;
  const zeroOn = projecao?.find((p) => p.zeroOn)?.zeroOn ?? null;

  const ciclo = (ind.cash_cycle?.value ?? null) as number | null;
  const margem = (ind.contribution_margin?.value ?? null) as number | null;
  const receita = (ind.revenue_current?.value ?? null) as number | null;
  const receitaAnterior = (ind.revenue_previous?.value ?? null) as number | null;

  const curva = [saldoHoje, ...(projecao ?? []).map((p) => p.projectedCents)].filter(
    (v): v is number => typeof v === 'number',
  );

  const saudavel = !zeroOn;

  // tendÃªncia (atual Ã— anterior) â€” vem pronta do servidor; o app sÃ³ desenha a seta
  const comp = dashboard.comparativos;
  const tendCiclo = tendencia(comp?.cash_cycle.atual, comp?.cash_cycle.anterior, true);
  const tendMargem = tendencia(comp?.contribution_margin.atual, comp?.contribution_margin.anterior, false);
  const tendReceita = tendencia(comp?.revenue_current.atual, comp?.revenue_current.anterior, false);

  // mini-cards: o VALOR vem pronto do servidor; a frase Ã© um texto-modelo que sÃ³
  // encaixa o nÃºmero (o app nÃ£o calcula nada â€” regra do CLAUDE.md).
  const miniCards: Array<{
    id: string;
    rotulo: string;
    tecnico?: string;
    valor: string;
    positivo?: boolean;
    tend?: Tend | null;
    explica: string;
  }> = [
    {
      id: 'ciclo',
      rotulo: 'DINHEIRO PRESO',
      tecnico: 'ciclo de caixa',
      valor: ciclo !== null ? dias(ciclo) : 'Â·',
      tend: tendCiclo,
      explica:
        ciclo !== null
          ? `VocÃª leva em mÃ©dia ${dias(ciclo)} entre atender e o dinheiro cair na conta. Quanto menor, mais folga no caixa.`
          : 'Assim que houver movimento, mostro aqui quantos dias o dinheiro fica preso entre atender e receber.',
    },
    {
      id: 'margem',
      rotulo: 'O QUE SOBRA',
      tecnico: 'margem',
      valor: margem !== null ? pct(margem) : 'Â·',
      tend: tendMargem,
      explica:
        margem !== null
          ? `De cada R$ 100 que entram, sobram cerca de R$ ${Math.round(margem * 100)} depois dos custos que variam com a venda. Ã‰ o que ajuda a pagar as contas fixas.`
          : 'A margem mostra quanto sobra de cada venda depois dos custos variÃ¡veis.',
    },
    {
      id: 'receita',
      rotulo: 'FATUROU NO MÃŠS',
      tecnico: 'receita',
      valor: receita !== null ? brl(receita) : 'Â·',
      tend: tendReceita,
      explica:
        receita !== null
          ? `Foi quanto seu negÃ³cio faturou no mÃªs (${brl(receita)}). Compare com o mÃªs anterior ao lado.`
          : 'Quanto seu negÃ³cio faturou no mÃªs.',
    },
    {
      id: 'mesAnterior',
      rotulo: 'MÃŠS ANTERIOR',
      valor: receitaAnterior !== null ? brl(receitaAnterior) : 'Â·',
      explica:
        receitaAnterior !== null
          ? `Seu faturamento no mÃªs passado foi ${brl(receitaAnterior)}. Serve de referÃªncia pra ver se vocÃª cresceu.`
          : 'O faturamento do mÃªs passado, pra comparar com o atual.',
    },
  ];
  const chipAberto = miniCards.find((c) => c.id === abertoChip) ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={carregando} onRefresh={carregar} />}
      >
        <View style={styles.topo}>
          <PulsoLogo size={26} />
          <Pressable
            onPress={() => router.push('/(tabs)/conta')}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressionado]}
            hitSlop={8}
            accessibilityLabel="Abrir minha conta"
          >
            <Text style={styles.avatarTexto}>
              {dashboard.company.name.replace(/^ClÃ­nica\s+/i, '').charAt(0)}
            </Text>
          </Pressable>
        </View>

        {fonte === 'demo' && (
          <View style={styles.selo}>
            <Text style={styles.seloTexto}>DEMONSTRAÃ‡ÃƒO Â· DADOS FICTÃCIOS</Text>
          </View>
        )}

        {/* cartÃ£o de caixa */}
        <View style={styles.cash}>
          <Text style={styles.cashRotulo}>CAIXA PROJETADO Â· 30 DIAS</Text>
          {p30 ? (
            <CountUpMoney cents={p30.projectedCents} style={styles.cashValor} />
          ) : (
            <Text style={styles.cashValor}>Â·</Text>
          )}
          <Text style={styles.cashDetalhe}>
            {saudavel ? (
              <>
                Pulso <Text style={styles.cashOk}>saudÃ¡vel</Text> Â· hoje em caixa:{' '}
                {saldoHoje !== null ? brl(saldoHoje) : 'Â·'}
              </>
            ) : (
              <>
                Risco de zerar em <Text style={styles.cashRuim}>{dataBR(zeroOn!)}</Text> Â· hoje:{' '}
                {saldoHoje !== null ? brl(saldoHoje) : 'Â·'}
              </>
            )}
          </Text>
          <PulseLine points={curva} color={saudavel ? colors.vivo : colors.critico} />
          {/* legenda do tempo sob o grÃ¡fico: horizontes que o servidor mandou */}
          {curva.length >= 2 && (
            <View style={styles.legenda}>
              {['hoje', ...(projecao ?? []).map((p) => `+${p.horizonDays}d`)]
                .slice(0, curva.length)
                .map((r) => (
                  <Text key={r} style={styles.legendaTexto}>
                    {r}
                  </Text>
                ))}
            </View>
          )}
          {!saudavel && zeroOn && (
            <View style={styles.pontoRisco}>
              <View style={styles.pontoRiscoBolha} />
              <Text style={styles.pontoRiscoTexto}>
                ponto de risco: {dataBR(zeroOn)}
              </Text>
            </View>
          )}
        </View>

        {/* chips de indicadores â€” tocÃ¡veis, abrem "de onde vem esse nÃºmero" */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
          {miniCards.map((c) => (
            <Chip
              key={c.id}
              rotulo={c.rotulo}
              tecnico={c.tecnico}
              valor={c.valor}
              tend={c.tend}
              ativo={abertoChip === c.id}
              onPress={() => setAbertoChip((atual) => (atual === c.id ? null : c.id))}
            />
          ))}
        </ScrollView>

        {chipAberto && (
          <Animated.View entering={FadeIn.duration(180)} style={styles.explica}>
            <Text style={styles.explicaRotulo}>DE ONDE VEM ESSE NÃšMERO</Text>
            <Text style={styles.explicaTexto}>{chipAberto.explica}</Text>
          </Animated.View>
        )}

        {/* alertas */}
        <Text style={styles.secao}>O que pede sua atenÃ§Ã£o</Text>
        <View style={styles.alertas}>
          {dashboard.alerts.map((a, i) => (
            <Pressable
              key={`${a.ruleKey}-${i}`}
              style={({ pressed }) => [styles.alerta, pressed && styles.pressionado]}
              onPress={() => router.push(`/alerta/${i}`)}
            >
              <View
                style={[styles.barra, { backgroundColor: severityColor[a.severity as Severity] }]}
              />
              <View style={styles.alertaMiolo}>
                <Text style={styles.alertaTitulo}>{a.textTitle ?? a.ruleKey}</Text>
                {a.textBody ? (
                  <Text style={styles.alertaCorpo} numberOfLines={2}>
                    {a.textBody}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={styles.rodape}>
          Atualizado em {dataBR(dashboard.snapshot.asOf)} Â· motor v{dashboard.snapshot.coreVersion}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Chip({
  rotulo,
  tecnico,
  valor,
  tend,
  ativo,
  onPress,
}: {
  rotulo: string;
  tecnico?: string;
  valor: string;
  tend?: Tend | null;
  ativo?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        ativo && styles.chipAtivo,
        pressed && styles.pressionado,
      ]}
    >
      <Text style={styles.chipRotulo}>{rotulo}</Text>
      {tecnico ? <Text style={styles.chipTecnico}>{tecnico}</Text> : null}
      <Text style={styles.chipValor}>{valor}</Text>
      {tend && (
        <Text style={[styles.chipTend, { color: tend.bom ? colors.okEscuro : colors.alerta }]}>
          {tend.seta} {tend.pct}% vs mÃªs passado
        </Text>
      )}
    </Pressable>
  );
}

/** Formas cinza com brilho passando, enquanto os dados nÃ£o chegam. */
function SkeletonDashboard() {
  const brilho = useSharedValue(0.4);
  useEffect(() => {
    brilho.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [brilho]);
  const estilo = useAnimatedStyle(() => ({ opacity: brilho.value }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.scroll}>
        <View style={styles.topo}>
          <PulsoLogo size={26} />
          <Animated.View style={[styles.skAvatar, estilo]} />
        </View>
        <Animated.View style={[styles.skCash, estilo]} />
        <View style={styles.skChips}>
          <Animated.View style={[styles.skChip, estilo]} />
          <Animated.View style={[styles.skChip, estilo]} />
          <Animated.View style={[styles.skChip, estilo]} />
        </View>
        <Animated.View style={[styles.skLinhaTitulo, estilo]} />
        <Animated.View style={[styles.skAlerta, estilo]} />
        <Animated.View style={[styles.skAlerta, estilo]} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { paddingBottom: 28 },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  vazioTexto: {
    fontFamily: fonts.corpo,
    fontSize: 14,
    color: colors.cinza,
    textAlign: 'center',
    lineHeight: 21,
  },
  tentar: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 26,
    alignItems: 'center',
    marginTop: 2,
  },
  tentarTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.papel },

  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.mata,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexto: { fontFamily: fonts.display, fontSize: 14, color: colors.papel },

  selo: {
    alignSelf: 'flex-start',
    marginHorizontal: 18,
    marginBottom: 8,
    backgroundColor: '#FDF3E3',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seloTexto: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, color: colors.alerta },

  cash: {
    marginHorizontal: 16,
    backgroundColor: colors.mata,
    borderRadius: 20,
    padding: 18,
    gap: 4,
  },
  cashRotulo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.rotuloSobreMata,
  },
  cashValor: {
    fontFamily: fonts.displayBlack,
    fontSize: 32,
    color: colors.papel,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  cashDetalhe: { fontFamily: fonts.corpo, fontSize: 13, color: colors.papelSobreMata },
  cashOk: { fontFamily: fonts.corpoForte, color: colors.vivo },
  cashRuim: { fontFamily: fonts.corpoForte, color: '#F0A196' },

  legenda: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  legendaTexto: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.rotuloSobreMata,
  },
  pontoRisco: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  pontoRiscoBolha: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F0A196' },
  pontoRiscoTexto: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.4,
    color: '#F0A196',
  },

  chips: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 0 },
  chip: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 8,
    minWidth: 132,
  },
  chipAtivo: { borderColor: colors.vivo, backgroundColor: '#F0FBF6' },
  chipRotulo: { fontFamily: fonts.corpoForte, fontSize: 10.5, letterSpacing: 0.2, color: colors.tinta },
  chipTecnico: { fontFamily: fonts.mono, fontSize: 8, letterSpacing: 0.6, color: colors.cinza, marginTop: 1 },
  chipValor: {
    fontFamily: fonts.display,
    fontSize: 15,
    color: colors.tinta,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  chipTend: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.2, marginTop: 3 },

  explica: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  explicaRotulo: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: colors.cinza },
  explicaTexto: { fontFamily: fonts.corpo, fontSize: 13, lineHeight: 19, color: colors.tinta },

  secao: {
    fontFamily: fonts.display,
    fontSize: 17,
    color: colors.tinta,
    paddingHorizontal: 18,
    marginTop: 6,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  alertas: { paddingHorizontal: 16, gap: 8 },
  alerta: {
    flexDirection: 'row',
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  pressionado: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  barra: { width: 7, borderRadius: 4 },
  alertaMiolo: { flex: 1, gap: 2 },
  alertaTitulo: { fontFamily: fonts.displayMedio, fontSize: 14, color: colors.tinta },
  alertaCorpo: { fontFamily: fonts.corpo, fontSize: 12.5, lineHeight: 18, color: colors.cinza },

  rodape: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.cinza,
    textAlign: 'center',
    marginTop: 20,
  },

  // esqueleto (carregando)
  skAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.linha },
  skCash: { marginHorizontal: 16, height: 150, borderRadius: 20, backgroundColor: colors.linha },
  skChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  skChip: { width: 104, height: 46, borderRadius: 12, backgroundColor: colors.linha },
  skLinhaTitulo: {
    width: 180,
    height: 18,
    borderRadius: 6,
    backgroundColor: colors.linha,
    marginHorizontal: 18,
    marginTop: 6,
    marginBottom: 12,
  },
  skAlerta: { marginHorizontal: 16, height: 64, borderRadius: 14, backgroundColor: colors.linha, marginBottom: 8 },
});
````

### `apps/mobile/src/app/_layout.tsx`

````tsx
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
} from '@expo-google-fonts/figtree';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import {
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { PulsoProvider } from '@/lib/pulso-context';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    IBMPlexMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Tocar na notificaÃ§Ã£o de alerta abre o app no painel.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as { kind?: string } | undefined;
      if (data?.kind === 'alert') router.navigate('/(tabs)');
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <PulsoProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.papel },
          // telas entram deslizando de leve (sensaÃ§Ã£o de app vivo, nÃ£o estÃ¡tico)
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="alerta/[index]"
          // o alerta sobe como um painel, deslizando de baixo
          options={{ presentation: 'modal', animation: 'slide_from_bottom', headerShown: false }}
        />
      </Stack>
    </PulsoProvider>
  );
}
````

### `apps/mobile/src/app/alerta/[index].tsx`

````tsx
/**
 * Detalhe do alerta. A alma do produto estÃ¡ aqui: TODO alerta mostra
 * "de onde vem esse nÃºmero" â€” os facts abertos, como vieram do servidor.
 * Ã‰ a auditabilidade do motor virando confianÃ§a na tela.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { acoesParaAlerta } from '@/lib/acoes';
import { rotuloFact, valorFact } from '@/lib/format';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts, severityColor, severityLabel, type Severity } from '@/theme';

export default function DetalheAlerta() {
  const { index } = useLocalSearchParams<{ index: string }>();
  const { dashboard } = usePulso();

  const alerta = dashboard?.alerts[Number(index)] ?? null;

  if (!alerta) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.vazio}>Alerta nÃ£o encontrado.</Text>
      </SafeAreaView>
    );
  }

  const sev = alerta.severity as Severity;
  const cor = severityColor[sev];
  const acoes = acoesParaAlerta(alerta);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable style={styles.fechar} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={22} color={colors.cinza} />
        </Pressable>

        <View style={[styles.badge, { backgroundColor: `${cor}1A` }]}>
          <Text style={[styles.badgeTexto, { color: cor }]}>
            {severityLabel[sev].toUpperCase()}
          </Text>
        </View>

        <Text style={styles.titulo}>{alerta.textTitle ?? alerta.ruleKey}</Text>
        {alerta.textBody ? <Text style={styles.corpo}>{alerta.textBody}</Text> : null}

        <View style={styles.porque}>
          <Text style={styles.porqueRotulo}>DE ONDE VEM ESSE NÃšMERO</Text>
          {Object.entries(alerta.facts).map(([chave, valor]) => (
            <View key={chave} style={styles.linha}>
              <Text style={styles.linhaChave}>{rotuloFact(chave)}</Text>
              <Text style={styles.linhaValor}>{valorFact(chave, valor)}</Text>
            </View>
          ))}
          <Text style={styles.porqueNota}>
            Estes sÃ£o os nÃºmeros exatos que o motor do Pulso usou. Nada Ã© estimado por IA.
          </Text>
        </View>

        {/* o que eu faÃ§o â€” passos concretos a partir dos nÃºmeros acima */}
        <View style={styles.passos}>
          <Text style={styles.passosRotulo}>O QUE EU FAÃ‡O?</Text>
          {acoes.map((passo, i) => (
            <View key={i} style={styles.passo}>
              <View style={[styles.passoBolha, { backgroundColor: cor }]}>
                <Text style={styles.passoNum}>{i + 1}</Text>
              </View>
              <Text style={styles.passoTexto}>{passo}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.pressionado]}
          onPress={() => {
            router.back();
            router.push('/(tabs)/chat');
          }}
        >
          <Text style={styles.ctaTexto}>Falar com o Pulso sobre isso</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  scroll: { padding: 22, paddingBottom: 34 },
  vazio: { fontFamily: fonts.corpo, color: colors.cinza, textAlign: 'center', marginTop: 60 },

  fechar: { alignSelf: 'flex-end', marginBottom: 4 },

  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  badgeTexto: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.2 },

  titulo: {
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 30,
    color: colors.tinta,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  corpo: { fontFamily: fonts.corpo, fontSize: 15, lineHeight: 22, color: colors.cinza },

  porque: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    marginTop: 18,
  },
  porqueRotulo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.cinza,
    marginBottom: 6,
  },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.linha,
  },
  linhaChave: { fontFamily: fonts.corpo, fontSize: 13.5, color: colors.cinza, flexShrink: 1 },
  linhaValor: {
    fontFamily: fonts.displayMedio,
    fontSize: 14,
    color: colors.tinta,
    fontVariant: ['tabular-nums'],
  },
  porqueNota: {
    fontFamily: fonts.corpo,
    fontSize: 12,
    lineHeight: 17,
    color: colors.cinza,
    marginTop: 10,
  },

  passos: {
    marginTop: 18,
    gap: 14,
  },
  passosRotulo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.cinza,
    marginBottom: 2,
  },
  passo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  passoBolha: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  passoNum: { fontFamily: fonts.displayMedio, fontSize: 12, color: colors.papel },
  passoTexto: { flex: 1, fontFamily: fonts.corpo, fontSize: 14, lineHeight: 20, color: colors.tinta },

  cta: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  pressionado: { opacity: 0.85 },
  ctaTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.papel },
});
````

### `apps/mobile/src/app/index.tsx`

````tsx
/**
 * Entrada do app: login de verdade (cadastro + entrar) com e-mail e senha.
 * Alterna entre "entrar" e "criar conta". Em caso de erro, oferece uma
 * demonstraÃ§Ã£o enquanto isso.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulsoLogo } from '@/components/logo';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

// O servidor no plano grÃ¡tis "dorme"; a 1Âª visita leva ~30-50s pra acordar.
const MENSAGENS_CARREGANDO = [
  'Ligando o monitorâ€¦',
  'Acordando o servidor. O primeiro acesso demora um poucoâ€¦',
  'Quase lÃ¡, buscando seus nÃºmerosâ€¦',
];

type Modo = 'entrar' | 'cadastrar';

export default function Login() {
  const { entrar, cadastrar, entrarDemo, carregando, erro, restaurando, logado } = usePulso();
  const [modo, setModo] = useState<Modo>('entrar');
  const [negocio, setNegocio] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [msg, setMsg] = useState(0);

  // Abertura do app: se jÃ¡ havia sessÃ£o salva, entra direto no painel.
  useEffect(() => {
    if (!restaurando && logado) router.replace('/(tabs)');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurando]);

  useEffect(() => {
    if (!carregando) {
      setMsg(0);
      return;
    }
    const t = setInterval(() => {
      setMsg((i) => Math.min(i + 1, MENSAGENS_CARREGANDO.length - 1));
    }, 4500);
    return () => clearInterval(t);
  }, [carregando]);

  if (restaurando) {
    return (
      <SafeAreaView style={[styles.safe, styles.centro]}>
        <PulsoLogo size={40} color={colors.papel} />
        <ActivityIndicator color={colors.papel} style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  const podeEnviar =
    email.trim().length > 0 &&
    senha.length > 0 &&
    (modo === 'entrar' || negocio.trim().length > 0);

  async function enviar() {
    if (!podeEnviar) return;
    const ok =
      modo === 'entrar'
        ? await entrar(email.trim(), senha)
        : await cadastrar(negocio.trim(), email.trim(), senha);
    if (ok) router.replace('/onboarding');
  }

  function verDemonstracao() {
    entrarDemo();
    router.replace('/onboarding');
  }

  const cadastrando = modo === 'cadastrar';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.hero}>
          <PulsoLogo size={44} color={colors.papel} />
          <Text style={styles.claim}>
            O sinal vital do seu negÃ³cio. O Pulso avisa <Text style={styles.claimForte}>antes</Text>{' '}
            do caixa acabar.
          </Text>
        </View>

        <View style={styles.form}>
          {cadastrando && (
            <>
              <Text style={styles.label}>NOME DO SEU NEGÃ“CIO</Text>
              <TextInput
                style={styles.input}
                value={negocio}
                onChangeText={setNegocio}
                placeholder="Ex.: ClÃ­nica Sorriso"
                placeholderTextColor={colors.cinza}
              />
            </>
          )}

          <Text style={styles.label}>E-MAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="voce@suaempresa.com.br"
            placeholderTextColor={colors.cinza}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={styles.label}>SENHA</Text>
          <TextInput
            style={styles.input}
            value={senha}
            onChangeText={setSenha}
            placeholder={cadastrando ? 'Crie uma senha (mÃ­n. 8 caracteres)' : 'â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢'}
            placeholderTextColor={colors.cinza}
            secureTextEntry
          />

          <Pressable
            style={({ pressed }) => [
              styles.botao,
              (pressed || !podeEnviar) && styles.pressionado,
            ]}
            onPress={enviar}
            disabled={carregando || !podeEnviar}
          >
            {carregando ? (
              <View style={styles.carregandoLinha}>
                <ActivityIndicator color={colors.papel} />
                <Text style={styles.botaoTexto}>{cadastrando ? 'Criandoâ€¦' : 'Entrandoâ€¦'}</Text>
              </View>
            ) : (
              <Text style={styles.botaoTexto}>{cadastrando ? 'Criar conta' : 'Entrar'}</Text>
            )}
          </Pressable>

          {/* demonstraÃ§Ã£o sempre Ã  mÃ£o, abaixo do login, pra testar sem criar conta */}
          {!carregando && (
            <Pressable
              onPress={verDemonstracao}
              style={({ pressed }) => [styles.demoBtn, pressed && styles.pressionado]}
            >
              <Text style={styles.demoBtnTexto}>Ver demonstraÃ§Ã£o (sem conta)</Text>
            </Pressable>
          )}

          {carregando ? (
            <Text style={styles.carregandoMsg}>{MENSAGENS_CARREGANDO[msg]}</Text>
          ) : erro ? (
            <Text style={styles.erroTexto}>{erro}</Text>
          ) : (
            <Pressable
              onPress={() => setModo(cadastrando ? 'entrar' : 'cadastrar')}
              hitSlop={8}
              style={styles.trocaModo}
            >
              <Text style={styles.trocaModoTexto}>
                {cadastrando ? 'JÃ¡ tenho conta. Entrar' : 'Ainda nÃ£o tem conta? Criar agora'}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.mata },
  centro: { justifyContent: 'center', alignItems: 'center' },
  wrap: { flex: 1 },
  hero: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 18,
  },
  claim: {
    fontFamily: fonts.corpo,
    fontSize: 17,
    lineHeight: 25,
    color: colors.papelSobreMata,
    maxWidth: 300,
  },
  claimForte: { fontFamily: fonts.corpoForte, color: colors.papel },
  form: {
    backgroundColor: colors.papel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 40,
    gap: 8,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.cinza,
    marginTop: 10,
  },
  input: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.corpo,
    fontSize: 16,
    color: colors.tinta,
  },
  botao: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 18,
  },
  pressionado: { opacity: 0.85 },
  botaoTexto: {
    fontFamily: fonts.displayMedio,
    fontSize: 16,
    color: colors.papel,
  },
  carregandoLinha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  carregandoMsg: {
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.okEscuro,
    textAlign: 'center',
    marginTop: 14,
  },
  trocaModo: { marginTop: 16, alignItems: 'center' },
  trocaModoTexto: { fontFamily: fonts.corpoMedio, fontSize: 13.5, color: colors.mata },
  demoBtn: {
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  demoBtnTexto: { fontFamily: fonts.displayMedio, fontSize: 15, color: colors.mata },
  erroTexto: {
    fontFamily: fonts.corpo,
    fontSize: 13,
    lineHeight: 19,
    color: colors.critico,
    textAlign: 'center',
    marginTop: 14,
  },
});
````

### `apps/mobile/src/app/onboarding.tsx`

````tsx
/**
 * Onboarding: conectar os dados do negÃ³cio.
 * O envio do arquivo real depende do modelo de exportaÃ§Ã£o do sistema da
 * clÃ­nica (a caminho). AtÃ© lÃ¡, a demonstraÃ§Ã£o mostra o produto vivo.
 */

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulsoLogo } from '@/components/logo';
import { usePulso } from '@/lib/pulso-context';
import { colors, fonts } from '@/theme';

export default function Onboarding() {
  const { fonte, dashboard } = usePulso();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <PulsoLogo size={30} />

        <View style={styles.miolo}>
          <Text style={styles.titulo}>Vamos ligar o monitor no seu caixa</Text>
          <Text style={styles.corpo}>
            O Pulso lÃª os lanÃ§amentos do sistema do seu negÃ³cio (contas a receber, a pagar e o
            saldo) e passa a vigiar seu caixa todos os dias.
          </Text>

          <View style={styles.cartao}>
            <Text style={styles.cartaoRotulo}>COMO SEUS DADOS ENTRAM</Text>
            <Text style={styles.cartaoTexto}>
              1. VocÃª exporta o arquivo do seu sistema (uma vez por semana).{'\n'}
              2. Envia aqui pelo app.{'\n'}
              3. O Pulso calcula tudo e avisa o que importa.
            </Text>
          </View>

          <View style={[styles.cartao, styles.cartaoAviso]}>
            <Text style={styles.cartaoRotulo}>NESTE PILOTO</Text>
            <Text style={styles.cartaoTexto}>
              O envio de arquivo abre em breve.{' '}
              {fonte === 'servidor'
                ? `Por ora, vocÃª estÃ¡ vendo os dados de ${dashboard?.company.name ?? 'seu negÃ³cio'} direto do servidor.`
                : 'Por ora, explore com a empresa de demonstraÃ§Ã£o. Dados 100% fictÃ­cios.'}
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.botao, pressed && styles.pressionado]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={styles.botaoTexto}>
            {fonte === 'servidor' ? 'Ver meu painel' : 'Explorar a demonstraÃ§Ã£o'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.papel },
  wrap: { flex: 1, padding: 24, paddingTop: 16 },
  miolo: { flex: 1, justifyContent: 'center', gap: 16 },
  titulo: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 33,
    color: colors.tinta,
    letterSpacing: -0.5,
  },
  corpo: {
    fontFamily: fonts.corpo,
    fontSize: 16,
    lineHeight: 24,
    color: colors.cinza,
  },
  cartao: {
    backgroundColor: colors.branco,
    borderWidth: 1,
    borderColor: colors.linha,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cartaoAviso: { borderLeftWidth: 4, borderLeftColor: colors.vivo },
  cartaoRotulo: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.cinza,
  },
  cartaoTexto: {
    fontFamily: fonts.corpo,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.tinta,
  },
  botao: {
    backgroundColor: colors.mata,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  pressionado: { opacity: 0.85 },
  botaoTexto: { fontFamily: fonts.displayMedio, fontSize: 16, color: colors.papel },
});
````

### `apps/mobile/src/components/count-up-money.tsx`

````tsx
/**
 * O nÃºmero principal "subindo" ao carregar â€” passa a sensaÃ§Ã£o de que o Pulso
 * acabou de calcular agorinha. Ã‰ sÃ³ APRESENTAÃ‡ÃƒO: recebe o valor jÃ¡ pronto
 * (em centavos, do servidor) e anima a contagem de 0 atÃ© ele. Nada Ã© calculado
 * aqui.
 */

import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { brl } from '@/lib/format';

interface Props {
  /** Valor final em centavos (jÃ¡ calculado pelo servidor). */
  cents: number;
  style?: StyleProp<TextStyle>;
  /** DuraÃ§Ã£o da contagem, em milissegundos. */
  duracao?: number;
}

// desaceleraÃ§Ã£o suave no fim (easeOutCubic)
function suavizar(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function CountUpMoney({ cents, style, duracao = 750 }: Props) {
  const [atual, setAtual] = useState(cents);
  const inicioRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    inicioRef.current = null;
    const alvo = cents;

    function passo(agora: number) {
      if (inicioRef.current === null) inicioRef.current = agora;
      const decorrido = agora - inicioRef.current;
      const p = Math.min(decorrido / duracao, 1);
      setAtual(Math.round(alvo * suavizar(p)));
      if (p < 1) rafRef.current = requestAnimationFrame(passo);
    }

    rafRef.current = requestAnimationFrame(passo);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [cents, duracao]);

  return <Text style={style}>{brl(atual)}</Text>;
}
````

### `apps/mobile/src/components/logo.tsx`

````tsx
/**
 * O wordmark do Pulso: "pu" + linha de batimento no lugar do "l" + "so".
 * O logo Ã© a tese do produto: enquanto houver pulso, o negÃ³cio estÃ¡ vivo.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, fonts } from '@/theme';

interface Props {
  /** Altura da fonte do wordmark. */
  size?: number;
  /** Cor do texto (o batimento Ã© sempre verde-vivo). */
  color?: string;
}

export function PulsoLogo({ size = 34, color = colors.tinta }: Props) {
  const beatWidth = size * 1.35;
  const beatHeight = size * 0.72;

  return (
    <View style={styles.row}>
      <Text style={[styles.word, { fontSize: size, color }]}>pu</Text>
      <Svg
        width={beatWidth}
        height={beatHeight}
        viewBox="0 0 118 56"
        style={{ marginHorizontal: -size * 0.06 }}
      >
        <Path
          d="M2 44 L30 44 L43 6 L58 52 L70 24 L84 44 L112 44"
          fill="none"
          stroke={colors.vivo}
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={112} cy={44} r={6.5} fill={colors.vivo} />
      </Svg>
      <Text style={[styles.word, { fontSize: size, color }]}>so</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  word: {
    fontFamily: fonts.displayBlack,
    letterSpacing: -1.5,
  },
});
````

### `apps/mobile/src/components/pulse-line.tsx`

````tsx
/**
 * A linha de pulso do cartÃ£o de caixa â€” a marca dentro do produto.
 * Desenha a projeÃ§Ã£o como batimento; o ponto final ("o agora do futuro") pulsa,
 * como um sinal vital vivo.
 */

import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { colors } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

interface Props {
  /** Valores em centavos, do presente ao horizonte mais distante. */
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function PulseLine({ points, width = 300, height = 56, color = colors.vivo }: Props) {
  const t = useSharedValue(0);
  // 0 = linha escondida, 1 = totalmente desenhada (traÃ§o "correndo" ao carregar)
  const desenho = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [t]);

  useEffect(() => {
    desenho.value = 0;
    desenho.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [desenho, points.length]);

  // geometria calculada antes dos hooks de animaÃ§Ã£o (com guarda para poucos pontos),
  // para que a ordem dos hooks nunca mude entre renders.
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = max - min || 1;
  const pad = 6;

  const pts = points.map((v, i) => {
    const x = pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const coords = pts.map((p) => `${p.x},${p.y}`);

  // comprimento total da linha (soma dos segmentos) para animar o "traÃ§o"
  let comprimento = 0;
  for (let i = 1; i < pts.length; i++) {
    comprimento += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  const comprimentoSeguro = comprimento || 1;

  const cx = pts.length ? pts[pts.length - 1]!.x : 0;
  const cy = pts.length ? pts[pts.length - 1]!.y : 0;

  const pingProps = useAnimatedProps(() => ({
    r: 4.5 + t.value * 8,
    opacity: 0.5 * (1 - t.value),
  }));

  const linhaProps = useAnimatedProps(() => ({
    strokeDashoffset: comprimentoSeguro * (1 - desenho.value),
  }));

  const pontoFinalProps = useAnimatedProps(() => ({
    opacity: desenho.value, // o ponto final sÃ³ aparece quando a linha chega nele
  }));

  if (points.length < 2) return null;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <AnimatedPolyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={comprimentoSeguro}
        animatedProps={linhaProps}
      />
      {/* o "ping" que expande e some, repetindo */}
      <AnimatedCircle cx={cx} cy={cy} fill={color} animatedProps={pingProps} />
      {/* o ponto sÃ³lido por cima */}
      <AnimatedCircle cx={cx} cy={cy} r={4.5} fill={color} animatedProps={pontoFinalProps} />
    </Svg>
  );
}
````

### `apps/mobile/src/lib/acoes.ts`

````ts
/**
 * "O que eu faÃ§o?" â€” prÃ³ximos passos concretos para cada alerta.
 *
 * IMPORTANTE (regra do CLAUDE.md): o app NÃƒO calcula e NÃƒO inventa nÃºmero. Aqui
 * sÃ£o sÃ³ CONSELHOS em texto-modelo por tipo de alerta, que encaixam os nÃºmeros
 * que o servidor JÃ mandou (os `facts`). Mesma ideia dos mini-cards do painel.
 */

import type { AlertJson } from './api';
import { brl, dataBR, dias, pct } from './format';

function n(facts: AlertJson['facts'], chave: string): number | null {
  const v = facts[chave];
  return typeof v === 'number' ? v : null;
}
function s(facts: AlertJson['facts'], chave: string): string | null {
  const v = facts[chave];
  return typeof v === 'string' ? v : null;
}

/** Lista de passos (jÃ¡ em portuguÃªs do dono) para o alerta. */
export function acoesParaAlerta(alerta: AlertJson): string[] {
  const f = alerta.facts;
  const passos: string[] = [];

  switch (alerta.ruleKey) {
    case 'cash_runway': {
      const zeroOn = s(f, 'zeroOn');
      const pmr = n(f, 'pmrDays');
      if (zeroOn) passos.push(`O ponto de risco Ã© ${dataBR(zeroOn)}. O melhor momento de agir Ã© antes dessa data.`);
      passos.push(
        pmr !== null
          ? `Fale com seus maiores clientes para antecipar recebimentos: hoje vocÃª recebe em mÃ©dia em ${dias(pmr)}.`
          : 'Fale com seus maiores clientes para antecipar recebimentos.',
      );
      passos.push('Segure o que der de custos nÃ£o essenciais atÃ© o caixa voltar a respirar.');
      passos.push('Se precisar, negocie prazo com fornecedores para alinhar o que entra com o que sai.');
      break;
    }
    case 'scissor': {
      const pmr = n(f, 'pmrDays');
      const pmp = n(f, 'pmpDays');
      const ncg = n(f, 'ncgCents');
      if (ncg !== null) passos.push(`Priorize cobrar o que estÃ¡ em aberto: hÃ¡ cerca de ${brl(ncg)} presos a receber.`);
      passos.push(
        pmr !== null && pmp !== null
          ? `Reveja prazos: vocÃª recebe em ${dias(pmr)} e paga em ${dias(pmp)}. Quanto mais perto, melhor pro caixa.`
          : 'Reveja os prazos de recebimento com clientes e de pagamento com fornecedores.',
      );
      passos.push('Evite ampliar as vendas a prazo sem caixa para sustentar o intervalo atÃ© receber.');
      break;
    }
    case 'concentration': {
      const cliente = s(f, 'topCustomer');
      const fatia = n(f, 'topCustomerShare');
      const quem = cliente ?? 'seu maior cliente';
      const quanto = fatia !== null ? ` (${pct(fatia)} do faturamento)` : '';
      passos.push(`Busque novos clientes para reduzir a dependÃªncia de ${quem}${quanto}.`);
      passos.push('Tenha um plano B de caixa caso esse cliente atrase ou deixe de comprar.');
      break;
    }
    default:
      passos.push('Abra a conversa e me pergunte o que fazer com esses nÃºmeros. Eu explico com base neles.');
  }

  return passos;
}
````

### `apps/mobile/src/lib/api.ts`

````ts
/**
 * Cliente da API do Pulso. O app busca JSON e desenha â€” nada mais.
 *
 * Por padrÃ£o fala com o servidor na nuvem (Render), entÃ£o o app funciona sem
 * depender de nenhum computador ligado. Para desenvolver contra um servidor
 * local, defina EXPO_PUBLIC_API_URL=http://localhost:3000 (ou o IP da mÃ¡quina).
 */

/** Servidor de produÃ§Ã£o do Pulso (Render + banco Neon). */
const CLOUD_API_URL = 'https://pulso-api-9byl.onrender.com';

export interface AlertJson {
  ruleKey: string;
  severity: 'ok' | 'warn' | 'critical';
  facts: Record<string, number | string | null>;
  textTitle: string | null;
  textBody: string | null;
}

export interface IndicatorJson {
  key: string;
  value: unknown;
  unit: string;
  inputs: Record<string, number | string | null>;
  insufficientReason?: string;
}

export interface CashProjectionPoint {
  horizonDays: number;
  projectedCents: number;
  zeroOn: string | null;
}

export interface Comparativo {
  atual: number | null;
  anterior: number | null;
}
export interface Comparativos {
  cash_cycle: Comparativo;
  contribution_margin: Comparativo;
  revenue_current: Comparativo;
}

export interface DashboardJson {
  company: { id: string; name: string; niche: string };
  snapshot: {
    asOf: string;
    coreVersion: string;
    computedAt: string;
    indicators: Record<string, IndicatorJson>;
  };
  /** TendÃªncia atual Ã— anterior dos indicadores de topo (quando hÃ¡ histÃ³rico). */
  comparativos?: Comparativos;
  alerts: AlertJson[];
}

function apiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return CLOUD_API_URL;
}

/**
 * Busca com um toque de paciÃªncia. Servidor gratuito (Render) hiberna quando
 * ninguÃ©m usa; a primeira visita pode levar ~30-50s pra acordar. EntÃ£o tenta
 * rÃ¡pido (8s, caso comum jÃ¡ acordado) e, se falhar, tenta de novo dando 60s.
 */
async function fetchWithWake(url: string, init?: RequestInit): Promise<Response> {
  const timeouts = [8000, 60000];
  let lastErr: unknown;
  for (const ms of timeouts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetchWithWake(`${apiBase()}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return (await res.json()) as T;
}

export async function fetchCompanies(): Promise<Array<{ id: string; name: string }>> {
  const body = await getJson<{ companies: Array<{ id: string; name: string }> }>('/companies');
  return body.companies;
}

export async function fetchDashboard(companyId: string): Promise<DashboardJson> {
  return getJson<DashboardJson>(`/companies/${companyId}/dashboard`);
}

/** Registra o "endereÃ§o" (push token) deste celular para a empresa. */
export async function registerDevice(
  companyId: string,
  token: string,
  platform: string,
): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/companies/${companyId}/devices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao registrar aparelho`);
}

export interface ChatTurnJson {
  role: 'user' | 'assistant';
  content: string;
}

export async function sendChat(companyId: string, messages: ChatTurnJson[]): Promise<string> {
  const res = await fetchWithWake(`${apiBase()}/companies/${companyId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} no chat`);
  const body = (await res.json()) as { reply: string };
  return body.reply;
}

/* ----------------------- Login de verdade ----------------------- */

/** Motivo do erro de autenticaÃ§Ã£o, para a tela mostrar a mensagem certa. */
export type AuthErroTipo = 'credenciais' | 'conflito' | 'rede' | 'desconhecido';
export class AuthError extends Error {
  tipo: AuthErroTipo;
  constructor(tipo: AuthErroTipo, mensagem: string) {
    super(mensagem);
    this.tipo = tipo;
  }
}

export interface AuthResult {
  token: string;
  email: string;
  company: { id: string; name: string; niche?: string };
}

async function postAuth(path: string, body: unknown): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetchWithWake(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('rede', 'NÃ£o consegui falar com o servidor.');
  }
  if (res.ok) return (await res.json()) as AuthResult;
  if (res.status === 401) throw new AuthError('credenciais', 'E-mail ou senha incorretos.');
  if (res.status === 409) throw new AuthError('conflito', 'JÃ¡ existe uma conta com esse e-mail.');
  throw new AuthError('desconhecido', `NÃ£o deu certo agora (${res.status}).`);
}

export function authSignup(
  businessName: string,
  email: string,
  password: string,
): Promise<AuthResult> {
  return postAuth('/auth/signup', { businessName, email, password });
}

export function authLogin(email: string, password: string): Promise<AuthResult> {
  return postAuth('/auth/login', { email, password });
}

export async function authLogout(token: string): Promise<void> {
  try {
    await fetchWithWake(`${apiBase()}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    // sair Ã© local de qualquer jeito; se o servidor nÃ£o responder, tudo bem
  }
}

export interface MyDashboard {
  companyId: string;
  companyName: string;
  /** null = conta nova, ainda sem dados (mostra o estado de "vazio"). */
  dashboard: DashboardJson | null;
}

/** Painel do dono logado (usa o token; sÃ³ vÃª a prÃ³pria empresa). */
export async function fetchMyDashboard(token: string): Promise<MyDashboard> {
  const res = await fetchWithWake(`${apiBase()}/me/dashboard`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessÃ£o expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} no painel`);
  const body = (await res.json()) as {
    company: { id: string; name: string; niche: string };
    snapshot: DashboardJson['snapshot'] | null;
    comparativos?: Comparativos;
    alerts: AlertJson[];
  };
  const dashboard: DashboardJson | null = body.snapshot
    ? { company: body.company, snapshot: body.snapshot, comparativos: body.comparativos, alerts: body.alerts }
    : null;
  return { companyId: body.company.id, companyName: body.company.name, dashboard };
}

/** Conversa do dono logado. */
export async function sendMyChat(token: string, messages: ChatTurnJson[]): Promise<string> {
  const res = await fetchWithWake(`${apiBase()}/me/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} no chat`);
  const body = (await res.json()) as { reply: string };
  return body.reply;
}

/* --------------- Contas previstas (a pagar / a receber) --------------- */

export type ContaKind = 'receivable' | 'payable';
export type ContaStatus = 'prevista' | 'vencida' | 'realizada';
export type ContaRecorrencia = 'none' | 'monthly';

export interface ContaJson {
  id: string;
  kind: ContaKind;
  amountCents: number;
  dueOn: string;
  counterparty: string | null;
  category: string | null;
  recurrence: ContaRecorrencia;
  natureza: 'avulsa' | 'recorrente';
  status: ContaStatus;
  confirmedOn: string | null;
  /** true enquanto nÃ£o graduada â€” na tela Ã© sempre marcada "PrevisÃ£o". */
  previsao: boolean;
  createdAt: string;
}

export interface NovaConta {
  kind: ContaKind;
  amountCents: number;
  dueOn: string;
  counterparty?: string;
  category?: string;
  recurrence?: ContaRecorrencia;
}

const authHeader = (token: string) => ({ authorization: `Bearer ${token}` });

export async function fetchContas(token: string, kind?: ContaKind): Promise<ContaJson[]> {
  const q = kind ? `?kind=${kind}` : '';
  const res = await fetchWithWake(`${apiBase()}/me/contas${q}`, { headers: authHeader(token) });
  if (res.status === 401) throw new AuthError('credenciais', 'Sua sessÃ£o expirou.');
  if (!res.ok) throw new Error(`HTTP ${res.status} nas contas`);
  const body = (await res.json()) as { contas: ContaJson[] };
  return body.contas;
}

export async function criarConta(token: string, conta: NovaConta): Promise<ContaJson> {
  const res = await fetchWithWake(`${apiBase()}/me/contas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(conta),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao cadastrar conta`);
  return (await res.json()) as ContaJson;
}

/** GraduaÃ§Ã£o: o dono confirma que a conta aconteceu (previsto â†’ realizado). */
export async function confirmarConta(
  token: string,
  id: string,
  confirmedOn?: string,
): Promise<ContaJson> {
  const res = await fetchWithWake(`${apiBase()}/me/contas/${id}/confirmar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(confirmedOn ? { confirmedOn } : {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao confirmar conta`);
  return (await res.json()) as ContaJson;
}

export async function excluirConta(token: string, id: string): Promise<void> {
  const res = await fetchWithWake(`${apiBase()}/me/contas/${id}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao excluir conta`);
}
````

### `apps/mobile/src/lib/demo.ts`

````ts
/**
 * Dados de DEMONSTRAÃ‡ÃƒO â€” a ClÃ­nica Horizonte, 100% inventada (a mesma
 * das fixtures do servidor). Entram quando o servidor nÃ£o estÃ¡ no ar,
 * sempre rotulados como demonstraÃ§Ã£o na tela.
 *
 * Nenhum nÃºmero aqui foi calculado pelo app: Ã© um retrato pronto, no
 * mesmo formato que o servidor devolve.
 */

import type { DashboardJson } from './api';

export const DEMO_DASHBOARD: DashboardJson = {
  company: { id: 'demo', name: 'ClÃ­nica Horizonte', niche: 'clinica' },
  snapshot: {
    asOf: '2026-07-15',
    coreVersion: '0.1.0',
    computedAt: '2026-07-15T12:00:00Z',
    indicators: {
      cash_balance: {
        key: 'cash_balance',
        value: 2_130_000,
        unit: 'cents',
        inputs: { observedOn: '2026-07-14', stalenessDays: 1 },
      },
      cash_projection: {
        key: 'cash_projection',
        value: [
          { horizonDays: 30, projectedCents: -840_000, zeroOn: '2026-07-29' },
          { horizonDays: 60, projectedCents: -3_060_000, zeroOn: '2026-07-29' },
          { horizonDays: 90, projectedCents: -5_280_000, zeroOn: '2026-07-29' },
        ],
        unit: 'cents',
        inputs: {
          openingBalanceCents: 2_130_000,
          avgLatenessDays: 12,
          monthlyFixedCostCents: 3_420_000,
          zeroOn: '2026-07-29',
        },
      },
      pmr: { key: 'pmr', value: 46, unit: 'days', inputs: { settledCount: 22 } },
      pmp: { key: 'pmp', value: 0, unit: 'days', inputs: { settledCount: 18 } },
      cash_cycle: { key: 'cash_cycle', value: 46, unit: 'days', inputs: { pmr: 46, pmp: 0, pme: 0 } },
      ncg: {
        key: 'ncg',
        value: 5_280_000,
        unit: 'cents',
        inputs: { openReceivablesCents: 5_280_000, openPayablesCents: 0 },
      },
      revenue_current: {
        key: 'revenue_current',
        value: 6_680_000,
        unit: 'cents',
        inputs: { entryCount: 3 },
      },
      revenue_previous: {
        key: 'revenue_previous',
        value: 5_880_000,
        unit: 'cents',
        inputs: { entryCount: 3 },
      },
      contribution_margin: {
        key: 'contribution_margin',
        value: 0.75,
        unit: 'ratio',
        inputs: { revenueCents: 6_680_000, variableCostCents: 1_670_000 },
      },
      fixed_cost_monthly: {
        key: 'fixed_cost_monthly',
        value: 3_420_000,
        unit: 'cents',
        inputs: { source: 'derived_from_entries' },
      },
      customer_concentration: {
        key: 'customer_concentration',
        value: 0.486,
        unit: 'ratio',
        inputs: { topCustomer: 'Unimed Regional', customerCount: 6 },
      },
    },
  },
  // tendÃªncia do exemplo (atual Ã— anterior) â€” fictÃ­cia, como o resto da demonstraÃ§Ã£o
  comparativos: {
    cash_cycle: { atual: 46, anterior: 40 }, // piorou: leva mais dias pra receber
    contribution_margin: { atual: 0.75, anterior: 0.8 }, // margem caiu
    revenue_current: { atual: 6_680_000, anterior: 5_880_000 }, // receita subiu
  },
  alerts: [
    {
      ruleKey: 'cash_runway',
      severity: 'critical',
      facts: {
        zeroOn: '2026-07-29',
        openingBalanceCents: 2_130_000,
        avgLatenessDays: 12,
        pmrDays: 46,
        pmpDays: 0,
        monthlyFixedCostCents: 3_420_000,
      },
      textTitle: 'Seu caixa pode zerar em 29 de julho',
      textBody:
        'No ritmo de hoje, o dinheiro em conta acaba em 29 de julho. Ainda dÃ¡ tempo de agir. Vale olhar isso agora.',
    },
    {
      ruleKey: 'scissor',
      severity: 'warn',
      facts: {
        revenueGrowthRatio: 0.136,
        revenueCurrentCents: 6_680_000,
        revenuePreviousCents: 5_880_000,
        ncgCents: 5_280_000,
        ncgOverRevenue: 0.79,
        pmrDays: 46,
        pmpDays: 0,
      },
      textTitle: 'VocÃª vende mais, mas o dinheiro demora a chegar',
      textBody:
        'Sua receita cresceu 14% e mesmo assim o caixa aperta: hÃ¡ muito dinheiro preso a receber. Vale rever prazos com clientes e fornecedores.',
    },
    {
      ruleKey: 'concentration',
      severity: 'warn',
      facts: { topCustomerShare: 0.486, topCustomer: 'Unimed Regional', customerCount: 6 },
      textTitle: 'Boa parte do seu faturamento vem de um cliente sÃ³',
      textBody:
        'Unimed Regional responde por 49% do que vocÃª fatura. Se ele atrasar ou sair, o impacto no caixa Ã© grande.',
    },
  ],
};
````

### `apps/mobile/src/lib/format.ts`

````ts
/**
 * FormataÃ§Ã£o de APRESENTAÃ‡ÃƒO (pt-BR). NÃ£o Ã© cÃ¡lculo: o app sÃ³ desenha
 * nÃºmeros que o servidor jÃ¡ calculou.
 */

const MESES = [
  'janeiro',
  'fevereiro',
  'marÃ§o',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function brl(cents: number): string {
  const negativo = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const centavos = abs % 100;
  const milhar = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const base = centavos === 0 ? `R$ ${milhar}` : `R$ ${milhar},${String(centavos).padStart(2, '0')}`;
  return negativo ? `âˆ’${base}` : base;
}

export function dataBR(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)} de ${MESES[Number(m) - 1]}`;
}

export function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function dias(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`;
}

/** RÃ³tulos pt-BR para as chaves de `facts` â€” a seÃ§Ã£o "de onde vem esse nÃºmero". */
const ROTULOS: Record<string, string> = {
  zeroOn: 'O caixa zera em',
  openingBalanceCents: 'Caixa hoje',
  cashBalanceCents: 'Caixa hoje',
  avgLatenessDays: 'Atraso mÃ©dio dos clientes',
  pmrDays: 'Recebimento mÃ©dio',
  pmpDays: 'Pagamento mÃ©dio',
  cashCycleDays: 'Ciclo de caixa',
  monthlyFixedCostCents: 'Custo fixo mensal',
  revenueGrowthRatio: 'Crescimento da receita',
  revenueDropRatio: 'Queda da receita',
  revenueCurrentCents: 'Receita do mÃªs',
  revenuePreviousCents: 'Receita do mÃªs anterior',
  ncgCents: 'Dinheiro preso na operaÃ§Ã£o',
  ncgOverRevenue: 'Preso em relaÃ§Ã£o Ã  receita',
  fixedCostOverRevenue: 'Custo fixo sobre a receita',
  topCustomer: 'Maior cliente',
  topCustomerShare: 'Fatia do maior cliente',
  customerCount: 'Clientes identificados',
};

export function rotuloFact(key: string): string {
  return ROTULOS[key] ?? key;
}

export function valorFact(key: string, value: unknown): string {
  if (value === null || value === undefined) return 'Â·';
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? dataBR(value) : value;
  }
  if (typeof value !== 'number') return String(value);
  if (/Cents$/.test(key)) return brl(value);
  if (/(Ratio|Share|OverRevenue)$/i.test(key)) return pct(value);
  if (/Days$/.test(key)) return dias(value);
  if (/Count$/.test(key)) return String(value);
  return String(value);
}
````

### `apps/mobile/src/lib/perguntas.ts`

````ts
/**
 * Respostas DETERMINÃSTICAS do chat (sem IA).
 *
 * As trÃªs perguntas de partida tÃªm resposta certa a partir dos nÃºmeros que o
 * motor JÃ calculou â€” entÃ£o nÃ£o precisam de IA generativa. Isto vale na
 * demonstraÃ§Ã£o (onde nÃ£o hÃ¡ servidor) e serve de rede de seguranÃ§a. Segue a
 * regra de ouro: o app NÃƒO calcula nada novo, sÃ³ lÃª o que veio pronto e redige.
 */

import type { CashProjectionPoint, DashboardJson } from './api';
import { brl, dataBR, pct } from './format';

function semAcento(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[Ì€-Í¯]/g, ''); // remove os acentos (marcas combinantes)
}

function contem(texto: string, termos: string[]): boolean {
  return termos.some((t) => texto.includes(t));
}

function num(dash: DashboardJson, key: string): number | null {
  const v = dash.snapshot.indicators[key]?.value;
  return typeof v === 'number' ? v : null;
}

function projecao(dash: DashboardJson): CashProjectionPoint[] {
  const v = dash.snapshot.indicators.cash_projection?.value;
  return Array.isArray(v) ? (v as CashProjectionPoint[]) : [];
}

function zeroOn(dash: DashboardJson): string | null {
  return projecao(dash).find((p) => p.zeroOn)?.zeroOn ?? null;
}

/**
 * Tenta responder a pergunta com os nÃºmeros prontos. Devolve o texto, ou null
 * se a pergunta nÃ£o Ã© uma das determinÃ­sticas (aÃ­ o chamador dÃ¡ outra resposta).
 */
export function responderDeterministico(dash: DashboardJson, pergunta: string): string | null {
  const q = semAcento(pergunta);
  const saldo = num(dash, 'cash_balance');

  // 1) "Quando meu caixa zera?"
  if (contem(q, ['zera', 'zerar', 'acaba', 'acabar', 'quando o caixa', 'quando meu caixa'])) {
    const z = zeroOn(dash);
    if (z) {
      const base = `No ritmo de hoje, seu caixa pode zerar em ${dataBR(z)}.`;
      return saldo !== null ? `${base} Hoje vocÃª tem ${brl(saldo)} em caixa.` : base;
    }
    return 'Pelo cÃ¡lculo de agora, seu caixa nÃ£o zera dentro dos prÃ³ximos 90 dias. EstÃ¡ saudÃ¡vel.';
  }

  // 2) "Quem me deve?" (concentraÃ§Ã£o / a receber)
  if (contem(q, ['quem me deve', 'quem me devem', 'me deve', 'a receber', 'concentr', 'maior cliente'])) {
    const share = num(dash, 'customer_concentration');
    const conc = dash.snapshot.indicators.customer_concentration?.inputs ?? {};
    const cliente = typeof conc.topCustomer === 'string' ? conc.topCustomer : null;
    const aReceber = num(dash, 'ncg');
    const partes: string[] = [];
    if (aReceber !== null) partes.push(`VocÃª tem cerca de ${brl(aReceber)} a receber.`);
    if (cliente && share !== null) {
      partes.push(`O maior peso Ã© ${cliente}, com ${pct(share)} do seu faturamento. Se ele atrasar, o caixa sente.`);
    }
    return partes.length ? partes.join(' ') : null;
  }

  // 3) "DÃ¡ pra pagar as contas do mÃªs?"
  if (contem(q, ['pagar as contas', 'pagar o mes', 'fecho o mes', 'fechar o mes', 'da pra pagar', 'consigo pagar', 'pagar tudo'])) {
    const z = zeroOn(dash);
    const custoFixo = num(dash, 'fixed_cost_monthly');
    const p30 = projecao(dash).find((p) => p.horizonDays === 30)?.projectedCents ?? null;
    if (z) {
      const base = `No ritmo de hoje o mÃªs aperta: seu caixa pode zerar em ${dataBR(z)}.`;
      return custoFixo !== null
        ? `${base} O custo fixo do mÃªs Ã© ${brl(custoFixo)}. Vale antecipar recebimentos ou segurar gastos nÃ£o essenciais.`
        : base;
    }
    if (p30 !== null && p30 >= 0) {
      return `Pelo cÃ¡lculo de agora, o mÃªs fecha no positivo: a projeÃ§Ã£o para 30 dias Ã© ${brl(p30)}.`;
    }
    return 'Pelo cÃ¡lculo de agora, o mÃªs fica apertado. Olhe o painel para ver de onde vem o aperto.';
  }

  return null;
}
````

### `apps/mobile/src/lib/pulso-context.tsx`

````tsx
/**
 * Estado global do app: o painel carregado, de onde ele veio (servidor de
 * verdade ou demonstraÃ§Ã£o), a sessÃ£o do dono (login de verdade) e se ele
 * continua logado.
 *
 * Login de verdade: o dono se cadastra/entra, recebemos um token, guardamos no
 * aparelho e usamos nas rotas /me. O app segue burro â€” sÃ³ busca e desenha.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  authLogin,
  authLogout,
  authSignup,
  AuthError,
  fetchMyDashboard,
  type DashboardJson,
} from './api';
import { DEMO_DASHBOARD } from './demo';
import { registrarParaAvisos } from './push';

export type Fonte = 'servidor' | 'demo';

const CHAVE_TOKEN = 'pulso.token';

interface PulsoState {
  dashboard: DashboardJson | null;
  fonte: Fonte | null;
  companyId: string | null;
  /** Token da sessÃ£o (rotas /me). Null em demonstraÃ§Ã£o. */
  token: string | null;
  carregando: boolean;
  /** Mensagem de erro da Ãºltima tentativa (login/carga), ou null. */
  erro: string | null;
  /** Enquanto verifica se havia sessÃ£o salva (abertura do app). */
  restaurando: boolean;
  /** O dono jÃ¡ entrou. */
  logado: boolean;
  /** Cria a conta (autocadastro). Retorna true se entrou. */
  cadastrar: (businessName: string, email: string, password: string) => Promise<boolean>;
  /** Entra com e-mail e senha. Retorna true se entrou. */
  entrar: (email: string, password: string) => Promise<boolean>;
  /** Recarrega o painel do dono logado (pull-to-refresh / tentar de novo). */
  carregar: () => Promise<boolean>;
  /** Entra no modo demonstraÃ§Ã£o (dados fictÃ­cios rotulados). */
  entrarDemo: () => void;
  sair: () => void;
}

const Ctx = createContext<PulsoState | null>(null);

export function PulsoProvider({ children }: { children: ReactNode }) {
  const [dashboard, setDashboard] = useState<DashboardJson | null>(null);
  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const [logado, setLogado] = useState(false);

  // ref para o carregar() sempre enxergar o token atual sem recriar a funÃ§Ã£o
  const tokenRef = useRef<string | null>(null);
  const guardarToken = useCallback(async (t: string) => {
    tokenRef.current = t;
    setToken(t);
    await AsyncStorage.setItem(CHAVE_TOKEN, t);
  }, []);

  const limparSessao = useCallback(async () => {
    tokenRef.current = null;
    setToken(null);
    setDashboard(null);
    setFonte(null);
    setCompanyId(null);
    setLogado(false);
    await AsyncStorage.removeItem(CHAVE_TOKEN);
  }, []);

  /** Busca o painel do dono logado. Usa o token guardado (ou o passado). */
  const carregar = useCallback(async (tok?: string): Promise<boolean> => {
    const t = tok ?? tokenRef.current;
    if (!t) return false;
    setCarregando(true);
    setErro(null);
    try {
      const { dashboard: dash, companyId: id } = await fetchMyDashboard(t);
      setDashboard(dash);
      setCompanyId(id);
      setFonte('servidor');
      setLogado(true);
      // registra este celular para receber os avisos (silencioso se falhar)
      void registrarParaAvisos(id);
      return true;
    } catch (e) {
      if (e instanceof AuthError && e.tipo === 'credenciais') {
        await limparSessao();
        setErro('Sua sessÃ£o expirou. Entre de novo.');
      } else {
        setErro('NÃ£o consegui falar com o servidor agora.');
      }
      return false;
    } finally {
      setCarregando(false);
    }
  }, [limparSessao]);

  const entrar = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await authLogin(email, password);
        await guardarToken(r.token);
        return await carregar(r.token);
      } catch (e) {
        setErro(e instanceof AuthError ? e.message : 'NÃ£o consegui entrar agora.');
        setCarregando(false);
        return false;
      }
    },
    [carregar, guardarToken],
  );

  const cadastrar = useCallback(
    async (businessName: string, email: string, password: string): Promise<boolean> => {
      setCarregando(true);
      setErro(null);
      try {
        const r = await authSignup(businessName, email, password);
        await guardarToken(r.token);
        return await carregar(r.token);
      } catch (e) {
        setErro(e instanceof AuthError ? e.message : 'NÃ£o consegui criar a conta agora.');
        setCarregando(false);
        return false;
      }
    },
    [carregar, guardarToken],
  );

  const entrarDemo = useCallback(() => {
    setDashboard(DEMO_DASHBOARD);
    setFonte('demo');
    setCompanyId(null);
    setErro(null);
    setLogado(true);
  }, []);

  const sair = useCallback(() => {
    const t = tokenRef.current;
    if (t) void authLogout(t);
    void limparSessao();
  }, [limparSessao]);

  // abertura do app: se havia token salvo, entra direto (mantÃ©m logado)
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const salvo = await AsyncStorage.getItem(CHAVE_TOKEN);
        if (vivo && salvo) {
          tokenRef.current = salvo;
          setToken(salvo);
          await carregar(salvo);
        }
      } catch {
        // sem sessÃ£o salva: segue para a tela de login normalmente
      } finally {
        if (vivo) setRestaurando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [carregar]);

  const value = useMemo(
    () => ({
      dashboard,
      fonte,
      companyId,
      token,
      carregando,
      erro,
      restaurando,
      logado,
      cadastrar,
      entrar,
      carregar: () => carregar(),
      entrarDemo,
      sair,
    }),
    [
      dashboard,
      fonte,
      companyId,
      token,
      carregando,
      erro,
      restaurando,
      logado,
      cadastrar,
      entrar,
      carregar,
      entrarDemo,
      sair,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePulso(): PulsoState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePulso precisa estar dentro de <PulsoProvider>');
  return ctx;
}
````

### `apps/mobile/src/lib/push.ts`

````ts
/**
 * NotificaÃ§Ã£o no celular (push).
 *
 * O app pede permissÃ£o, pega o "endereÃ§o" deste aparelho (push token do Expo)
 * e o entrega ao servidor ligado Ã  empresa. Quando o motor dispara um alerta
 * sÃ©rio, o servidor manda a notificaÃ§Ã£o para cÃ¡ â€” mesmo com o app fechado.
 *
 * O app continua burro: ele nÃ£o decide nada, sÃ³ recebe e mostra.
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerDevice } from './api';

// Com o app aberto, mostra o aviso na tela tambÃ©m (nÃ£o sÃ³ na barra).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Prepara as notificaÃ§Ãµes e registra este aparelho para a empresa.
 * Silencioso por natureza: se o dono negar a permissÃ£o ou algo falhar,
 * o app segue funcionando normalmente (sÃ³ nÃ£o recebe o aviso automÃ¡tico).
 */
export async function registrarParaAvisos(companyId: string): Promise<void> {
  try {
    // emulador/simulador nÃ£o recebe push de verdade
    if (!Device.isDevice) return;

    // Android precisa de um "canal" para notificaÃ§Ãµes aparecerem
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('alertas', {
        name: 'Avisos do Pulso',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#23C883',
      });
    }

    const { status: existente } = await Notifications.getPermissionsAsync();
    let status = existente;
    if (existente !== 'granted') {
      const pedido = await Notifications.requestPermissionsAsync();
      status = pedido.status;
    }
    if (status !== 'granted') return;

    const pid = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      pid ? { projectId: pid } : undefined,
    );

    await registerDevice(companyId, token, Platform.OS);
  } catch {
    // nunca atrapalha o uso do app por causa de push
  }
}
````

### `apps/mobile/src/theme.ts`

````ts
/**
 * Tema do app â€” marca Pulso.
 *
 * A fonte da verdade dos tokens Ã© `@pulso/tokens` (ver packages/tokens/DESIGN.md
 * e o board em packages/tokens/design-system.html). Aqui os valores sÃ£o
 * ESPELHADOS de lÃ¡ com os nomes que as telas do app jÃ¡ usam â€” se um valor mudar
 * nos tokens, atualize tambÃ©m aqui. (Espelhamos em vez de importar para nÃ£o
 * exigir configuraÃ§Ã£o de monorepo no Metro; a fonte canÃ´nica continua sendo
 * @pulso/tokens.)
 *
 * O app Ã© burro: zero lÃ³gica financeira. Isto aqui Ã© sÃ³ aparÃªncia.
 *
 * Fontes: Manrope (grotesca sobria e encorpada) nos titulos e Figtree no corpo.
 * IBM Plex Mono segue nos dados/rotulos. Fonte unica dos nomes: packages/tokens.
 */

export const colors = {
  mata: '#37373F', // escuro do sistema (era o verde-mata)
  vivo: '#23C883', // o pulso, positivo â€” Ãºnico ponto de cor viva
  papel: '#F5F4F2', // fundo do app
  tinta: '#2A2A31', // texto forte
  cinza: '#838993', // secundÃ¡rio, rÃ³tulos
  linha: '#E0DEDA', // bordas, hairlines
  alerta: '#E39A26', // atenÃ§Ã£o (severidade mÃ©dia)
  critico: '#D8503F', // sÃ³ risco real de caixa
  branco: '#FFFFFF',
  okEscuro: '#158556', // verde legÃ­vel sobre fundo claro
  papelSobreMata: '#C7CBD1', // texto claro sobre o escuro do sistema
  rotuloSobreMata: '#9BA0A9', // rÃ³tulo/secundÃ¡rio sobre o escuro do sistema
} as const;

export const fonts = {
  display: 'Manrope_700Bold',
  displayBlack: 'Manrope_800ExtraBold', // peso mais forte para o nÃºmero herÃ³i
  displayMedio: 'Manrope_600SemiBold',
  corpo: 'Figtree_400Regular',
  corpoMedio: 'Figtree_500Medium',
  corpoForte: 'Figtree_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
} as const;

export type Severity = 'ok' | 'warn' | 'critical';

export const severityColor: Record<Severity, string> = {
  ok: colors.vivo,
  warn: colors.alerta,
  critical: colors.critico,
};

export const severityLabel: Record<Severity, string> = {
  ok: 'Tudo bem',
  warn: 'AtenÃ§Ã£o',
  critical: 'CrÃ­tico',
};
````



---

## 4. Resumo: o que funciona de verdade x o que ainda e esqueleto/TODO

_(Escrito a mao, com base no estado real do codigo acima. Data: 2026-07-22.)_

### Funcionando de verdade (implementado e testado, no ar)
- **Motor (packages/core):** puro e tipado. Indicadores: saldo de caixa, projecao 30/60/90 com data de zerar (usando o atraso real dos clientes), PMR/PMP, ciclo de caixa, NCG, receita atual x mes anterior, margem de contribuicao, concentracao de clientes. Regras de alerta: cash_runway (caixa vai zerar), scissor (efeito tesoura), concentration, all_clear. Coberto por indicators.test.ts e rules.test.ts. Regra inegociavel respeitada: a IA nunca calcula, so o core.
- **Servidor (apps/api):** Fastify 5 + postgres.js (sem ORM), no ar 24h no Render + banco Neon. Rotas: companies, imports (idempotente por hash de arquivo), balances, snapshots (roda o core, grava, dispara push), dashboard (inclui comparativos atual x anterior), alerts, chat, devices (push), auth (signup/login/logout + /me/dashboard + /me/chat), contas previstas (/me/contas + confirmar/graduar + delete), interesse (lista de espera do site) e CORS ligado. Migracoes 0001 a 0005. 61 testes com Postgres real (embedded-postgres).
- **Camada de IA (apps/api/src/ai):** writer (structured output, modelo claude-opus-4-8), grounding (fiscal determinístico: numero fora dos facts reprova o texto), templates (fallback por regra, sempre correto), chat (askPulso, grounded). Ligada em producao (chave Anthropic no Render).
- **App (apps/mobile, Expo SDK 54):** login de verdade (autocadastro com email+senha, mantem logado por token no AsyncStorage); dashboard (numeros, projecao, chips com tendencia, "de onde vem esse numero"); tela de Contas (a pagar e a receber PREVISTAS: cadastro de baixo atrito, ciclo prevista/vencida/realizada, confirmar/graduar); chat (IA quando logado, respostas deterministicas na demonstracao); alerta com passos concretos; onboarding; conta. Demonstracao (Clinica Horizonte, ficticia) sempre acessivel na tela de entrada. Design atual: fonte Manrope, rotulos em linguagem de dono, verde so como sinal. Roda no celular (APK Android) e no navegador (web export hospedado em docs/app). Atualiza por OTA (EAS Update).
- **Site (site/index.html):** landing publicada (Render Static Site), enxugada, com planos (R$97/R$147/R$197), seguranca/LGPD, FAQ e lista de espera que posta em POST /interesse.

### Pronto no codigo, mas bloqueado por configuracao externa
- **Notificacao push:** todo o codigo (tabela device_tokens + envio via servico do Expo no servidor; registro do token no app) esta pronto e testado. NAO entrega ainda porque falta configurar o Firebase/FCM no app Android (precisa google-services.json + credencial FCM V1 no EAS + APK novo). Sem isso, getExpoPushTokenAsync falha em silencio no APK standalone.

### Esqueleto / parcial / TODO (nao implementado)
- **Fase 2 do motor de Contas** (a conta PREVISTA empurrando a projecao de caixa; recorrencia mensal expandida no horizonte; conta vencida-sem-confirmacao projetando o atraso; cascata de recalculo). NAO implementado: e formula nova e, pela regra do projeto, so entra validada pelo especialista (Marco). Hoje as contas previstas sao so cadastro + graduacao (guardam due_on e confirmed_on), sem alimentar o motor.
- **Fase 3 - aprendizado de atraso por cliente** (a partir de due_on x confirmed_on): TODO.
- **Leitor de arquivo real (CSV do sistema da clinica):** a rota de import aceita lancamentos em JSON canonico; o parser do formato real aguarda o arquivo-modelo do especialista.
- **Indicadores restantes** (ponto de equilibrio, inadimplencia, ano contra ano): TODO (so entram validados).
- **Autenticacao:** existe email+senha+token, mas sem recuperacao de senha nem verificacao de email.
- **WhatsApp** (chatbot + alertas): nao iniciado; depende de conta WhatsApp Business + provedor (Meta/Twilio).
- **Pagamento/cobranca:** nao existe. Os planos aparecem no site, mas o checkout/pagamento (e a assinatura dentro do app) nao foram construidos.
- **Backup e monitoramento do servidor:** TODO.
- **Publicacao nas lojas (App Store / Google Play):** nao feito (hoje so APK preview via EAS + versao web).
- **Piloto com clinica real:** nao iniciado.

### Como as pecas se ligam (fluxo de um numero)
dados -> packages/core calcula indicadores + alertas (facts) -> apps/api grava e pede a IA para REDIGIR (nunca calcular) -> apps/mobile busca o JSON pronto e desenha, sempre mostrando "de onde vem esse numero".
