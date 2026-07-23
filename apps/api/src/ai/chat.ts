/**
 * A conversa do Pulso.
 *
 * Mesmas regras duras da voz dos alertas:
 * - O modelo recebe APENAS o snapshot de indicadores + alertas (números
 *   já calculados pelo core) e o perfil da empresa. Lançamentos e
 *   extratos NUNCA entram no prompt.
 * - O modelo não calcula. Se a resposta pede um número que não está no
 *   contexto, ele diz que não tem — e o fiscal (grounding) garante isso
 *   em código: resposta com número inventado é descartada.
 * - Se o modelo falhar ou inventar, entra uma resposta segura
 *   determinística. A conversa nunca mente.
 */

import Anthropic from '@anthropic-ai/sdk';

import { checkGroundingDeep } from './grounding';
import { CHAT_MODEL } from './models';
import type { AiCallUsage, UsageSink } from './usage';
import type { CompanyProfile } from './writer';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Alerta enviado no passado, resumido para a memória da conversa. */
export interface ChatAlertSummary {
  ruleKey: string;
  severity: string;
  facts: unknown;
  title: string | null;
  body: string | null;
}

/** Diagnóstico (atual ou anterior), resumido para a memória da conversa. */
export interface ChatDiagnosisSummary {
  asOf: string | null;
  stage: string;
  facts?: unknown;
  drivers?: unknown;
  text?: { title?: string | null; body?: string | null } | null;
}

export interface ChatContext {
  profile: CompanyProfile;
  asOf: string | null;
  /** payload do snapshot: { indicator_key: { value, unit, inputs, ... } } */
  indicators: unknown;
  /** alertas do snapshot: ruleKey, severity, facts e textos. */
  alerts: unknown;
  /** (b) últimos alertas ENVIADOS, para a IA referenciar "o alerta da semana passada". */
  recentAlerts?: ChatAlertSummary[];
  /** (c) diagnóstico atual e anterior, para dizer "melhorou desde o mês passado". */
  diagnosisCurrent?: ChatDiagnosisSummary | null;
  diagnosisPrevious?: ChatDiagnosisSummary | null;
}

/** Configuração da memória (com padrões; sobrescrevível por ambiente/teste). */
export const DEFAULT_CHAT_HISTORY_N = Number(process.env.PULSO_CHAT_HISTORY_N ?? 10);
export const DEFAULT_CHAT_TOKEN_BUDGET = Number(process.env.PULSO_CHAT_TOKEN_BUDGET ?? 6000);

export interface ChatBuildOptions {
  /** Quantas mensagens da conversa considerar (padrão 10). */
  historyN?: number;
  /** Teto de tokens do contexto; acima dele corta o histórico mais antigo (padrão 6000). */
  tokenBudget?: number;
}

/** Estimativa grosseira de tokens (~4 caracteres por token). Basta para o corte. */
const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

export interface ChatReply {
  text: string;
  modelVersion: string;
  /** Consumo desta chamada (só a implementação real preenche; medição). */
  usage?: AiCallUsage;
}

/** Interface do modelo — dublê nos testes, Anthropic em produção. */
export interface ChatModel {
  reply(prompt: { system: string; turns: ChatTurn[] }): Promise<ChatReply>;
}

export const CHAT_FALLBACK_VERSION = 'chat-fallback-v1';

/** Sem chave de IA configurada: a conversa avisa com honestidade. */
export const NO_MODEL_REPLY =
  'A conversa inteligente ainda não está ligada neste ambiente. ' +
  'Os seus alertas e indicadores continuam no painel — e assim que a conversa for ativada, eu respondo por aqui.';

/** Resposta reprovada no fiscal ou erro do modelo: seguro > esperto. */
export const SAFE_REPLY =
  'Essa resposta pedia um número que eu não tenho aqui com segurança, e eu prefiro não inventar. ' +
  'Dá uma olhada no painel — os números de lá são calculados e conferidos. Quer perguntar de outro jeito?';

/** Sem snapshot calculado ainda. */
export const NO_DATA_REPLY =
  'Ainda não tenho os números da sua clínica por aqui. Assim que os dados entrarem e o primeiro cálculo rodar, eu respondo com tudo aberto.';

const SYSTEM_BASE = `Você é o Pulso, o monitor de caixa de pequenas clínicas brasileiras, conversando com o DONO da clínica — não com um CFO.

Você recebe abaixo um retrato JÁ CALCULADO do negócio (indicadores e alertas). Seu trabalho é interpretar e orientar — nunca calcular.

REGRAS INEGOCIÁVEIS:
1. Use APENAS números presentes no retrato abaixo. Se a pergunta pede um número que não está lá, diga com honestidade que não tem esse número e aponte o painel.
2. NÃO faça contas — nem soma, nem diferença, nem regra de três. Você pode apenas FORMATAR (centavos como reais, proporção como percentual, data por extenso).
3. Você pode dar orientação prática e qualitativa (ex.: negociar prazo com fornecedor, rever prazo de convênio, antecipar recebível citando que custa juros) — sem prometer resultado e sem aconselhamento jurídico ou de investimento.
4. Português do Brasil, tom de conversa, SEM jargão: "você está recebendo 46 dias depois de atender", nunca "seu DSO está em 46".
5. Respostas CURTAS: um parágrafo, ou até 3 itens numerados. O detalhe está no painel.
6. Se o assunto fugir do financeiro da clínica, redirecione com gentileza.
7. Você TEM memória: pode retomar o que foi conversado antes, referenciar um alerta recente e comparar o diagnóstico atual com o anterior ("melhorou desde o mês passado"). Só use números que estejam no retrato.`;

export function buildChatPrompt(ctx: ChatContext, turns: ChatTurn[], opts: ChatBuildOptions = {}) {
  const historyN = opts.historyN ?? DEFAULT_CHAT_HISTORY_N;
  const tokenBudget = opts.tokenBudget ?? DEFAULT_CHAT_TOKEN_BUDGET;

  const retrato = JSON.stringify({
    empresa: { nome: ctx.profile.name, nicho: ctx.profile.niche },
    dataDoRetrato: ctx.asOf,
    indicadores: ctx.indicators,
    alertas: ctx.alerts,
    alertasRecentes: ctx.recentAlerts ?? [],
    diagnosticoAtual: ctx.diagnosisCurrent ?? null,
    diagnosticoAnterior: ctx.diagnosisPrevious ?? null,
  });
  const system = `${SYSTEM_BASE}\n\nRETRATO DO NEGÓCIO (única fonte de números):\n${retrato}`;

  // últimas N mensagens, começando num turno do usuário
  let kept = sanitizeTurns(turns, historyN);

  // teto de tokens: corta o histórico MAIS ANTIGO primeiro; nunca corta o
  // retrato (indicadores) e nunca corta a pergunta atual (a última mensagem).
  const systemTokens = estimateTokens(system);
  const turnCost = (t: ChatTurn): number => estimateTokens(t.content) + 4;
  const overBudget = () =>
    systemTokens + kept.reduce((s, t) => s + turnCost(t), 0) > tokenBudget;
  while (kept.length > 1 && overBudget()) kept = kept.slice(1);

  // após o corte, garante que ainda começa num turno do usuário
  const firstUser = kept.findIndex((t) => t.role === 'user');
  return { system, turns: firstUser === -1 ? [] : kept.slice(firstUser) };
}

/** A conversa precisa começar em turno do usuário e alternar corretamente. */
function sanitizeTurns(turns: ChatTurn[], n: number): ChatTurn[] {
  const recent = turns.slice(-n);
  const firstUser = recent.findIndex((t) => t.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

export async function askPulso(
  model: ChatModel | null,
  ctx: ChatContext,
  turns: ChatTurn[],
  onUsage?: UsageSink,
  opts?: ChatBuildOptions,
): Promise<ChatReply> {
  if (!model) return { text: NO_MODEL_REPLY, modelVersion: CHAT_FALLBACK_VERSION };

  const prompt = buildChatPrompt(ctx, turns, opts);
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

    // a chamada aconteceu e gastou tokens: registra ANTES do veredito do fiscal
    if (out.usage) onUsage?.(out.usage);

    // o fiscal: números da resposta têm que existir no retrato — inclui agora os
    // facts dos alertas recentes e dos diagnósticos que entraram na memória.
    const grounded = checkGroundingDeep(out.text, {
      indicators: ctx.indicators,
      alerts: ctx.alerts,
      recentAlerts: ctx.recentAlerts ?? null,
      diagnosisCurrent: ctx.diagnosisCurrent ?? null,
      diagnosisPrevious: ctx.diagnosisPrevious ?? null,
      asOf: ctx.asOf,
    });
    if (grounded.ok) return out;
  }

  return { text: SAFE_REPLY, modelVersion: CHAT_FALLBACK_VERSION };
}

// ---------------------------------------------------------------
// Implementação real — Anthropic
// ---------------------------------------------------------------

export class AnthropicChatModel implements ChatModel {
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : undefined);
    this.model = opts.model ?? CHAT_MODEL;
  }

  async reply(prompt: { system: string; turns: ChatTurn[] }): Promise<ChatReply> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      system: prompt.system,
      messages: prompt.turns.map((t) => ({ role: t.role, content: t.content })),
    });

    if (res.stop_reason === 'refusal') {
      throw new Error('Modelo recusou a solicitação.');
    }

    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    if (!text.trim()) throw new Error('Resposta vazia do modelo.');
    return {
      text,
      modelVersion: res.model,
      usage: {
        model: res.model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }
}
