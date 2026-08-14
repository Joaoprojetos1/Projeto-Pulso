/**
 * Plugar outra IA além do Claude (item 3.7).
 *
 * Implementa o contrato `TextProvider` (provider.ts) para um segundo provedor
 * (OpenAI, via HTTP puro — SEM dependência nova) e o "adaptador fino" que liga
 * QUALQUER `TextProvider` aos modelos que o app já usa (`AlertWriterModel` e
 * `ChatModel`). A fábrica `makeAiModels` escolhe o provedor por variável de
 * ambiente, com o Claude como padrão (zero mudança quando nada é configurado).
 *
 * REGRA QUE NÃO MUDA (CLAUDE.md): os fiscais (grounding de números + fiscal de
 * juízo) ficam POR FORA, em `writeAlert`/`askPulso`. Trocar de IA NÃO afrouxa as
 * travas — o texto de qualquer provedor passa pelas MESMAS verificações. Este
 * arquivo só troca QUEM gera o texto, nunca quem confere.
 */

import Anthropic from '@anthropic-ai/sdk';

import { AnthropicChatModel, type ChatModel, type ChatReply, type ChatTurn } from './chat';
import { EXTRACT_MODEL } from './models';
import type { TextGenerationRequest, TextGenerationResult, TextProvider } from './provider';
import type { AlertText } from './templates';
import { AnthropicAlertWriter, type AlertPrompt, type AlertWriterModel, type WrittenAlert } from './writer';

/** Schema do texto do alerta (mesmo do writer): saída estruturada { title, body }. */
const ALERT_TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'body'],
  properties: {
    title: { type: 'string', description: 'Título curto do aviso, até 60 caracteres.' },
    body: { type: 'string', description: 'No máximo 2 frases, pt-BR, sem jargão.' },
  },
} as const;

// ---------------------------------------------------------------
// Provedor OpenAI — HTTP puro (fetch), sem SDK/dependência nova
// ---------------------------------------------------------------

export class OpenAiTextProvider implements TextProvider {
  readonly name = 'openai';
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private fetchFn: typeof fetch;

  constructor(opts: { apiKey: string; model?: string; baseUrl?: string; fetchFn?: typeof fetch }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? process.env.PULSO_OPENAI_MODEL ?? 'gpt-4o-mini';
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com/v1';
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async generate(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: req.maxTokens ?? 700,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    };
    // saída estruturada (quando pedida): mesmo schema que o fiscal espera
    if (req.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'resposta', strict: true, schema: req.jsonSchema },
      };
    }

    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

    const data = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    const model = data.model ?? this.model;
    return {
      text,
      modelVersion: model,
      usage: {
        model,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

// ---------------------------------------------------------------
// Provedor Anthropic — TextProvider cru (usado pela EXTRAÇÃO por tipo)
// ---------------------------------------------------------------

/**
 * A forma canônica `TextProvider` sobre a Anthropic. O alerta e o chat usam
 * classes concretas dedicadas (multi-turno, fiscais); ESTE provedor cru serve a
 * superfícies novas que só precisam de "dado um prompt, devolva texto/JSON" —
 * hoje a extração de arquivo por tipo. Structured output via output_config.
 */
export class AnthropicTextProvider implements TextProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      timeout: 60_000,
      maxRetries: 2,
    });
    this.model = opts.model ?? EXTRACT_MODEL;
  }

  async generate(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 1024,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      ...(req.jsonSchema
        ? { output_config: { format: { type: 'json_schema', schema: req.jsonSchema } } }
        : {}),
    } as never);

    if ((res as { stop_reason?: string }).stop_reason === 'refusal') {
      throw new Error('Modelo recusou a solicitação.');
    }
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    return {
      text,
      modelVersion: res.model,
      usage: { model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}

/**
 * Escolhe o provedor de texto cru por ambiente (mesma regra do makeAiModels):
 * padrão Anthropic; PULSO_AI_PROVIDER=openai troca. Sem a chave do provedor,
 * devolve null — a superfície que usa (extração) degrada com honestidade.
 */
export function makeTextProvider(env: NodeJS.ProcessEnv = process.env): TextProvider | null {
  const escolhido = (env.PULSO_AI_PROVIDER ?? 'anthropic').toLowerCase();
  if (escolhido === 'openai') {
    return env.OPENAI_API_KEY ? new OpenAiTextProvider({ apiKey: env.OPENAI_API_KEY }) : null;
  }
  return env.ANTHROPIC_API_KEY ? new AnthropicTextProvider({ apiKey: env.ANTHROPIC_API_KEY }) : null;
}

// ---------------------------------------------------------------
// Adaptador fino: qualquer TextProvider → os modelos do app
// ---------------------------------------------------------------

/** Liga um TextProvider ao writer de alertas (saída estruturada { title, body }). */
export function alertWriterFromProvider(provider: TextProvider): AlertWriterModel {
  return {
    async write(prompt: AlertPrompt): Promise<WrittenAlert> {
      const r = await provider.generate({
        system: prompt.system,
        user: prompt.user,
        jsonSchema: ALERT_TEXT_SCHEMA,
        maxTokens: 1024,
      });
      const parsed = JSON.parse(r.text) as AlertText;
      if (typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
        throw new Error('Resposta do provedor fora do formato { title, body }.');
      }
      return { title: parsed.title, body: parsed.body, modelVersion: r.modelVersion, usage: r.usage };
    },
  };
}

/**
 * Liga um TextProvider ao chat. O contrato do provedor é system+user (uma
 * mensagem), então a conversa é achatada num transcrito rotulado — o `system`
 * (que carrega o retrato calculado) segue intacto. Suficiente para plugar; o
 * caminho Anthropic padrão mantém o multi-turno nativo (melhor qualidade).
 */
export function chatModelFromProvider(provider: TextProvider): ChatModel {
  return {
    async reply(prompt: { system: string; turns: ChatTurn[] }): Promise<ChatReply> {
      const user = prompt.turns
        .map((t) => `${t.role === 'user' ? 'Dono' : 'Pulso'}: ${t.content}`)
        .join('\n\n');
      const r = await provider.generate({ system: prompt.system, user, maxTokens: 700 });
      const text = r.text.trim();
      if (!text) throw new Error('Resposta vazia do provedor.');
      return { text, modelVersion: r.modelVersion, usage: r.usage };
    },
  };
}

// ---------------------------------------------------------------
// Fábrica: escolhe o provedor por ambiente (padrão = Anthropic)
// ---------------------------------------------------------------

export interface AiModels {
  alertWriter: AlertWriterModel | null;
  chatModel: ChatModel | null;
  /** Qual provedor ficou ativo (para log). */
  provider: string;
}

/**
 * Monta os modelos de IA conforme `PULSO_AI_PROVIDER`:
 *  - ausente ou 'anthropic' → Claude nas classes concretas (chat multi-turno);
 *    liga só com ANTHROPIC_API_KEY, senão null (texto padrão + chat honesto).
 *  - 'openai' → OpenAI via adaptador; liga só com OPENAI_API_KEY, senão null.
 * Provedor desconhecido cai no seguro (null → template). Os fiscais valem igual.
 */
export function makeAiModels(env: NodeJS.ProcessEnv = process.env): AiModels {
  const escolhido = (env.PULSO_AI_PROVIDER ?? 'anthropic').toLowerCase();

  if (escolhido === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) return { alertWriter: null, chatModel: null, provider: 'openai' };
    const p = new OpenAiTextProvider({ apiKey: key });
    return { alertWriter: alertWriterFromProvider(p), chatModel: chatModelFromProvider(p), provider: 'openai' };
  }

  // padrão: Anthropic (classes concretas — chat nativo multi-turno). Passa a
  // chave explícita (mesma fonte de env) para não depender do process.env global.
  const key = env.ANTHROPIC_API_KEY;
  return {
    alertWriter: key ? new AnthropicAlertWriter({ apiKey: key }) : null,
    chatModel: key ? new AnthropicChatModel({ apiKey: key }) : null,
    provider: 'anthropic',
  };
}
