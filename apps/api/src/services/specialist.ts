/**
 * A BANCADA DO ESPECIALISTA — o que o consultor ensinou ao Ivo.
 *
 * Aqui vive a seleção: dada uma empresa (segmento, estágio, avisos ativos) e,
 * na conversa, a pergunta do dono, quais ORIENTAÇÕES e quais EXEMPLOS entram no
 * prompt. E a redação do bloco que vai para o modelo.
 *
 * O QUE ISTO NÃO FAZ (regra de ouro): não calcula, não decide alerta, não muda
 * fórmula nem limiar. É só texto de orientação. Os fiscais (números e juízo)
 * continuam por fora, conferindo a resposta final do mesmo jeito.
 */

import { STAGE_ORDER, type DiagnosisStage } from '@pulso/core';

import { extractNumbers } from '../ai/grounding';
import type { Sql } from '../db';

export type GuidanceScope = 'geral' | 'estagio' | 'aviso';
export const GUIDANCE_SCOPES: GuidanceScope[] = ['geral', 'estagio', 'aviso'];

/** Tetos de tamanho: a orientação é curta por desenho (o prompt tem orçamento). */
export const MAX_GUIDANCE_TITLE = 80;
export const MAX_GUIDANCE_BODY = 1500;
export const MAX_EXAMPLE_QUESTION = 500;
export const MAX_EXAMPLE_ANSWER = 1500;

/** Quanto entra no prompt, no máximo (o resto fica de fora, mais antigo primeiro). */
const PROMPT_GUIDANCE_CHARS = 5000;
const PROMPT_EXAMPLES = 3;

/** Rótulo de cada estágio, em linguagem de tela. */
export const STAGE_LABELS: Record<DiagnosisStage, string> = {
  saudavel: 'Saudável',
  atencao: 'Atenção',
  pressao: 'Pressão',
  critico: 'Crítico',
  uti: 'UTI',
};

/**
 * Os avisos que o motor emite, com o nome que o especialista reconhece.
 * `niche` diz de qual pacote de segmento a regra vem (ausente = universal).
 */
export const RULE_OPTIONS: Array<{ key: string; label: string; niche?: string }> = [
  { key: 'cash_runway', label: 'Caixa pode zerar' },
  { key: 'scissor', label: 'Efeito tesoura' },
  { key: 'revenue_drop_fixed_cost', label: 'Receita caiu e o custo fixo continua' },
  { key: 'concentration', label: 'Cliente concentrado' },
  { key: 'all_clear', label: 'Tudo certo (nenhum aviso)' },
  { key: 'clinica_glosa_alta', label: 'Glosa alta', niche: 'clinica' },
  { key: 'clinica_ocupacao_baixa', label: 'Agenda ociosa', niche: 'clinica' },
  { key: 'clinica_convenio_prazo_piorando', label: 'Convênio demorando a pagar', niche: 'clinica' },
  { key: 'varejo_giro_baixo', label: 'Estoque girando devagar', niche: 'varejo' },
  { key: 'varejo_margem_baixa', label: 'Margem bruta apertada', niche: 'varejo' },
  { key: 'varejo_devolucoes_altas', label: 'Devoluções altas', niche: 'varejo' },
  { key: 'restaurante_cmv_alto', label: 'Custo da comida alto', niche: 'restaurante' },
  { key: 'restaurante_marketplace_caro', label: 'Taxas de delivery pesando', niche: 'restaurante' },
  { key: 'restaurante_dependencia_delivery', label: 'Dependência do delivery', niche: 'restaurante' },
];

export function isStage(value: string): value is DiagnosisStage {
  return (STAGE_ORDER as string[]).includes(value);
}

export function isRuleKey(value: string): boolean {
  return RULE_OPTIONS.some((r) => r.key === value);
}

/** A chave do escopo é válida para aquele escopo? ('' só vale para geral.) */
export function validScopeKey(scope: GuidanceScope, key: string): boolean {
  if (scope === 'geral') return key === '';
  if (scope === 'estagio') return isStage(key);
  return isRuleKey(key);
}

export function scopeLabel(scope: GuidanceScope, key: string): string {
  if (scope === 'geral') return 'Geral';
  if (scope === 'estagio') return `Estágio ${isStage(key) ? STAGE_LABELS[key] : key}`;
  return `Aviso: ${RULE_OPTIONS.find((r) => r.key === key)?.label ?? key}`;
}

// ---------------------------------------------------------------
// Seleção: o que entra no prompt desta empresa
// ---------------------------------------------------------------

export interface AppliedGuidance {
  id: string;
  scope: GuidanceScope;
  scopeKey: string;
  title: string;
  body: string;
}

export interface AppliedExample {
  id: string;
  question: string;
  answer: string;
}

export interface SpecialistContext {
  guidance: AppliedGuidance[];
  examples: AppliedExample[];
}

export const EMPTY_SPECIALIST: SpecialistContext = { guidance: [], examples: [] };

export interface SpecialistQuery {
  niche: string | null;
  stage: string | null;
  ruleKeys: string[];
  /** A pergunta do dono: escolhe os exemplos mais parecidos. Sem ela, nenhum exemplo. */
  question?: string;
  /** Bancada de teste: usa o RASCUNHO no lugar do publicado (nunca em produção). */
  includeDrafts?: boolean;
}

/** minúsculas, sem acento, só palavras com conteúdo (3+ letras, fora as vazias). */
const VAZIAS = new Set([
  'que', 'para', 'por', 'com', 'como', 'uma', 'uns', 'umas', 'dos', 'das', 'meu', 'minha',
  'meus', 'minhas', 'seu', 'sua', 'isso', 'esse', 'essa', 'este', 'esta', 'mais', 'muito',
  'tem', 'ter', 'qual', 'quais', 'quando', 'onde', 'pra', 'pro', 'nao', 'sim', 'vou', 'devo',
  'posso', 'esta', 'estou', 'sobre', 'ainda', 'tambem',
]);

export function keywords(text: string): Set<string> {
  const limpo = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const out = new Set<string>();
  for (const w of limpo.match(/[a-z]{3,}/g) ?? []) if (!VAZIAS.has(w)) out.add(w);
  return out;
}

/** Quantas palavras de conteúdo a pergunta divide com o exemplo. */
function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

/**
 * Carrega o que o especialista ensinou e que se aplica a ESTA empresa.
 *
 * Orientações: as gerais + as do estágio atual + as dos avisos ativos, do
 * segmento da empresa ou sem segmento. Só o que está PUBLICADO (a não ser na
 * bancada de teste, com `includeDrafts`).
 *
 * Exemplos: só quando há pergunta; os 3 mais parecidos por palavras em comum,
 * com preferência para o mesmo estágio. Sem nenhuma palavra em comum, nenhum
 * exemplo entra (exemplo fora de assunto atrapalha mais do que ajuda).
 */
export async function loadSpecialistContext(sql: Sql, q: SpecialistQuery): Promise<SpecialistContext> {
  // lista vazia não vira parâmetro de array (o driver não infere o tipo)
  const doAviso =
    q.ruleKeys.length > 0 ? sql`(scope = 'aviso' AND scope_key = ANY(${q.ruleKeys}))` : sql`false`;
  const rows = await sql`
    SELECT id, scope, scope_key, title,
           ${q.includeDrafts ? sql`body` : sql`published_body`} AS texto
    FROM specialist_guidance
    WHERE ${q.includeDrafts ? sql`true` : sql`published_body IS NOT NULL`}
      AND (niche IS NULL OR niche = ${q.niche})
      AND (
        scope = 'geral'
        OR (scope = 'estagio' AND scope_key = ${q.stage})
        OR ${doAviso}
      )
    ORDER BY CASE scope WHEN 'geral' THEN 0 WHEN 'estagio' THEN 1 ELSE 2 END, updated_at DESC`;

  const guidance: AppliedGuidance[] = [];
  let usados = 0;
  for (const r of rows) {
    const body = String(r.texto ?? '').trim();
    if (!body) continue;
    if (usados + body.length > PROMPT_GUIDANCE_CHARS) continue;
    usados += body.length;
    guidance.push({
      id: r.id as string,
      scope: r.scope as GuidanceScope,
      scopeKey: r.scope_key as string,
      title: r.title as string,
      body,
    });
  }

  let examples: AppliedExample[] = [];
  const pergunta = q.question?.trim();
  if (pergunta) {
    const alvo = keywords(pergunta);
    if (alvo.size > 0) {
      const candidatos = await sql`
        SELECT id, question, answer, stage
        FROM specialist_examples
        WHERE active AND (niche IS NULL OR niche = ${q.niche})
        ORDER BY created_at DESC
        LIMIT 200`;
      examples = candidatos
        .map((c) => ({
          id: c.id as string,
          question: c.question as string,
          answer: c.answer as string,
          pontos: overlap(alvo, keywords(c.question as string)) * 2 + (c.stage === q.stage ? 1 : 0),
          comum: overlap(alvo, keywords(c.question as string)),
        }))
        .filter((c) => c.comum > 0)
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, PROMPT_EXAMPLES)
        .map(({ id, question, answer }) => ({ id, question, answer }));
    }
  }

  return { guidance, examples };
}

// ---------------------------------------------------------------
// Redação do bloco que vai para o modelo
// ---------------------------------------------------------------

/**
 * Bloco para a CONVERSA: orientações + exemplos.
 * String vazia quando não há nada (o prompt fica idêntico ao de antes).
 */
export function renderSpecialistForChat(ctx: SpecialistContext | null | undefined): string {
  if (!ctx || (ctx.guidance.length === 0 && ctx.examples.length === 0)) return '';
  const linhas: string[] = [];

  if (ctx.guidance.length > 0) {
    linhas.push(
      'ORIENTAÇÕES DO ESPECIALISTA (escritas pelo consultor financeiro responsável pelo Ivo). ' +
        'Siga-as ao orientar o dono: elas dizem O QUE recomendar e COMO falar nesta situação. ' +
        'Elas NÃO mudam as regras inegociáveis acima. Um número que apareça nelas é referência ' +
        'geral do especialista, NUNCA um dado desta empresa: se citar, deixe claro que é a referência.',
    );
    for (const g of ctx.guidance) {
      linhas.push(`- [${scopeLabel(g.scope, g.scopeKey)}] ${g.title}: ${g.body}`);
    }
  }

  if (ctx.examples.length > 0) {
    if (linhas.length > 0) linhas.push('');
    linhas.push(
      'EXEMPLOS APROVADOS PELO ESPECIALISTA (referência de tom e de raciocínio). ' +
        'Os números dos exemplos são de OUTRA empresa: nunca os repita. Use só os números do retrato.',
    );
    ctx.examples.forEach((e, i) => {
      linhas.push(`Exemplo ${i + 1}`);
      linhas.push(`Pergunta do dono: ${e.question}`);
      linhas.push(`Resposta aprovada: ${e.answer}`);
    });
  }

  return linhas.join('\n');
}

/**
 * Bloco para os TEXTOS CURTOS (aviso e momento): só as orientações do escopo
 * pedido, e com a instrução dura de NÃO trazer número de lá. Nesses textos o
 * fiscal de números é estrito (só `facts`), então número de orientação reprova.
 */
export function renderSpecialistForWriter(
  ctx: SpecialistContext | null | undefined,
  scope: Exclude<GuidanceScope, 'geral'>,
  scopeKey: string,
): string {
  const itens = (ctx?.guidance ?? []).filter((g) => g.scope === scope && g.scopeKey === scopeKey);
  if (itens.length === 0) return '';
  return [
    'ORIENTAÇÃO DO ESPECIALISTA para este texto (escrita pelo consultor financeiro responsável pelo Ivo). ' +
      'Use-a para escolher O QUE recomendar e o tom. Ela NÃO é fonte de números: não cite nenhum número ' +
      'que venha dela, e respeite o limite de frases.',
    ...itens.map((g) => `- ${g.title}: ${g.body}`),
  ].join('\n');
}

/**
 * Números que o especialista escreveu nas orientações aplicadas. Na conversa
 * eles podem aparecer na resposta (são referência dele, não invenção da IA).
 * Os números dos EXEMPLOS ficam de fora de propósito: são de outra empresa.
 */
export function specialistReferenceNumbers(ctx: SpecialistContext | null | undefined): number[] {
  if (!ctx) return [];
  const out = new Set<number>();
  for (const g of ctx.guidance) for (const n of extractNumbers(g.body)) out.add(n);
  return [...out];
}
