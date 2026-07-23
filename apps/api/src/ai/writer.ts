/**
 * A voz do Pulso.
 *
 * Entrada: um AlertFact (regra já decidida pelo core) + perfil da empresa.
 * Saída: { title, body } via structured output.
 *
 * REGRAS DURAS (KICKOFF, Passo 4):
 * - O prompt recebe APENAS o objeto `facts` + perfil. Nunca lançamentos,
 *   nunca extrato, nunca dado bruto.
 * - O modelo não calcula. Se `facts` não tem o número, o texto não cita
 *   o número — garantido em código pelo fiscal (grounding.ts), não por fé.
 * - O modelo não decide se alerta. Ele recebe um alerta já decidido.
 * - Máx. 2 frases no body. O detalhe está na tela, não no texto.
 *
 * Se o modelo falhar ou inventar número, entra o texto padrão
 * (templates.ts). O alerta nunca fica mudo e nunca mente.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AlertFact } from '@pulso/core';

import { checkGrounding } from './grounding';
import { TEMPLATE_VERSION, templateFor, type AlertText } from './templates';
import type { AiCallUsage, UsageSink } from './usage';

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
  /** Consumo desta chamada (só a implementação real preenche; medição). */
  usage?: AiCallUsage;
}

/** Interface do modelo — nos testes entra um dublê, em produção a Anthropic. */
export interface AlertWriterModel {
  write(prompt: AlertPrompt): Promise<WrittenAlert>;
}

const GLOSSARIO: Record<string, string> = {
  cash_runway:
    'O caixa projetado fica negativo no dia `zeroOn`. É o alerta mais grave que existe aqui.',
  scissor:
    'A receita cresceu (`revenueGrowthRatio`), mas há dinheiro demais preso a receber (`ncgCents`): a empresa vende mais e mesmo assim o caixa aperta.',
  revenue_drop_fixed_cost:
    'A receita caiu (`revenueDropRatio`) e o custo fixo mensal (`monthlyFixedCostCents`) continuou igual.',
  concentration:
    'Um único cliente (`topCustomer`) concentra `topCustomerShare` do faturamento.',
  all_clear: 'Nenhuma regra disparou. Semana tranquila — mensagem breve e leve, sem alarme.',
};

const SYSTEM_PROMPT = `Você é a voz do Pulso, o assistente financeiro de pequenas empresas brasileiras. Você escreve avisos curtos para o DONO de uma clínica — não para um CFO.

Você recebe um alerta JÁ DECIDIDO por regras de código, com os números JÁ CALCULADOS no campo "facts". Seu único trabalho é redigir.

REGRAS INEGOCIÁVEIS:
1. Use APENAS números presentes em "facts". Se um número não está lá, ele não existe para você.
2. NÃO calcule nada — nem soma, nem diferença, nem média. Você pode apenas FORMATAR: centavos como reais (150000 -> "R$ 1.500"), proporção como percentual (0.14 -> "14%"), data como dia por extenso ("2026-07-29" -> "29 de julho").
3. Você não decide se o alerta é grave — a severidade já veio decidida.
4. Português do Brasil, tom de conversa. SEM jargão: escreva "você está recebendo 46 dias depois de atender", nunca "seu DSO está em 46".
5. "body" tem NO MÁXIMO 2 frases. O detalhe fica na tela, não no texto.
6. "title" é curto e direto (até 60 caracteres), com o dado concreto quando houver.
7. Sem condescendência, sem alarmismo vazio. Data e número concretos quando existirem.

Significado de cada regra (ruleKey):
${Object.entries(GLOSSARIO)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}

Responda com o JSON { "title": ..., "body": ... }.`;

/**
 * Monta o prompt. O conteúdo do usuário é EXATAMENTE o JSON do alerta +
 * perfil — nada mais entra. Isso é testado: se alguém tentar passar dado
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

/** No máximo 2 frases (pontos dentro de números não contam). */
function bodyWithinLimit(body: string): boolean {
  const sentences = body.split(/[.!?]+(?=\s|$)/).filter((s) => s.trim().length > 0);
  return sentences.length <= 2;
}

/**
 * Redige o texto de um alerta. Com `model` null (sem chave de API),
 * ou se o modelo falhar/inventar número após 1 retry, usa o template.
 *
 * `onUsage` (opcional) recebe o consumo de CADA chamada ao modelo — inclusive
 * a que o fiscal reprova antes do retry. É só medição: não muda a decisão.
 */
export async function writeAlert(
  model: AlertWriterModel | null,
  alert: AlertFact,
  profile: CompanyProfile,
  onUsage?: UsageSink,
): Promise<WrittenAlert> {
  const fallback: WrittenAlert = { ...templateFor(alert), modelVersion: TEMPLATE_VERSION };
  if (!model) return fallback;

  const prompt = buildPrompt(alert, profile);

  for (let attempt = 0; attempt < 2; attempt++) {
    let out: WrittenAlert;
    try {
      out = await model.write(prompt);
    } catch {
      // erro de API: o SDK já fez os retries de transporte; não insistimos
      return fallback;
    }

    // a chamada aconteceu e gastou tokens: registra ANTES do veredito do fiscal
    if (out.usage) onUsage?.(out.usage);

    const grounded = checkGrounding(`${out.title}\n${out.body}`, alert.facts);
    if (grounded.ok && bodyWithinLimit(out.body)) return out;
    // reprovou no fiscal: uma segunda chance, depois template
  }

  return fallback;
}

// ---------------------------------------------------------------
// Implementação real — Anthropic, com structured output
// ---------------------------------------------------------------

const ALERT_TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string', description: 'Título curto do aviso, até 60 caracteres.' },
    body: { type: 'string', description: 'No máximo 2 frases, pt-BR, sem jargão.' },
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
      throw new Error('Modelo recusou a solicitação.');
    }

    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as AlertText;
    return {
      title: parsed.title,
      body: parsed.body,
      modelVersion: res.model,
      usage: {
        model: res.model,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
    };
  }
}
