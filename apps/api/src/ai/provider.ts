/**
 * PONTO DE EXTENSÃO (item 3.7) — o provedor de geração de texto abstraído.
 *
 * Hoje a voz do Pulso usa a Anthropic (AnthropicAlertWriter / AnthropicChatModel).
 * Este arquivo declara o CONTRATO mínimo de "gerar texto a partir de um prompt",
 * de modo que outro provedor (ou uma combinação) possa ser plugado no futuro SEM
 * reescrever o writer, o diagnóstico ou o chat.
 *
 * NÃO reescreve nada agora: os modelos atuais (AlertWriterModel, ChatModel) já são
 * interfaces e continuam valendo. Um `TextProvider` é a forma canônica; um adaptador
 * fino liga qualquer provedor a esses modelos. Os FISCAIS (grounding + juízo)
 * continuam por fora, iguais para qualquer provedor — a troca de IA NÃO afrouxa as
 * travas. O texto de um provedor novo passa pelas mesmas verificações.
 */

/** Uma chamada de geração: system + user, saída em texto (ou JSON schema opcional). */
export interface TextGenerationRequest {
  system: string;
  user: string;
  /** JSON Schema quando a saída deve ser estruturada (structured output). */
  jsonSchema?: object;
  maxTokens?: number;
}

export interface TextGenerationResult {
  text: string;
  /** Identificador do modelo/versão que respondeu (para auditoria e métrica). */
  modelVersion: string;
  usage?: { model: string; inputTokens: number; outputTokens: number };
}

/**
 * O contrato de um provedor de geração de texto. A implementação atual é a
 * Anthropic; uma futura (OpenAI, Gemini, um roteador que combina provedores) só
 * precisa satisfazer isto. Nada além de "dado um prompt, devolva texto".
 */
export interface TextProvider {
  /** Nome curto do provedor (para log/métrica): 'anthropic', 'openai', ... */
  readonly name: string;
  generate(req: TextGenerationRequest): Promise<TextGenerationResult>;
}
