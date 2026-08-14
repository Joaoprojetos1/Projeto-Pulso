/**
 * Pesquisador de referência de mercado — a IA busca o número + a FONTE (item 3.6).
 *
 * Implementa `BenchmarkResearcher` (services/market.ts) usando a Anthropic com a
 * ferramenta de BUSCA NA WEB. Pede o valor típico do setor e exige a fonte (URL).
 * O CÓDIGO ainda valida a faixa e o especialista valida contra as amostras — aqui
 * a IA só faz o que faz bem: procurar e citar. Injetável (o serviço aceita um
 * pesquisador dublê nos testes).
 *
 * REGRA DE OURO: isto NUNCA calcula o caixa da empresa. Traz referência EXTERNA,
 * de mercado, sempre com origem — caixa separada dos números do cliente.
 */

import Anthropic from '@anthropic-ai/sdk';

import type { BenchmarkResearcher, ResearchTarget, ResearchedBenchmark } from '../services/market';

const MARKET_MODEL = process.env.PULSO_MARKET_MODEL ?? 'claude-sonnet-4-6';

/** Extrai o primeiro objeto JSON do texto (o modelo pode envolver em prosa). */
function extractJson(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class AnthropicMarketResearcher implements BenchmarkResearcher {
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({
      ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
      timeout: 60_000,
      maxRetries: 2,
    });
    this.model = opts.model ?? MARKET_MODEL;
  }

  async research(target: ResearchTarget): Promise<ResearchedBenchmark | null> {
    const unidade =
      target.unit === 'ratio'
        ? 'uma PROPORÇÃO decimal entre 0 e 1 (ex.: 52% = 0.52)'
        : target.unit === 'times'
          ? 'um número de VEZES por ano (ex.: 6 = seis giros)'
          : target.unit === 'days'
            ? 'um número de DIAS'
            : 'um número';

    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      // ferramenta de busca na web da Anthropic (servidor). Poucos usos por consulta.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 } as never],
      system:
        'Você pesquisa MÉDIAS DE MERCADO do Brasil para pequenos negócios. Use a busca na web ' +
        'para achar um valor típico do setor, de fonte confiável e recente. NUNCA invente: se não ' +
        'achar fonte, diga que não achou. Responda no fim SÓ com um objeto JSON.',
      messages: [
        {
          role: 'user',
          content:
            `Qual é o valor TÍPICO de mercado no Brasil para: ${target.label}?\n` +
            `Preciso de ${unidade}.\n\n` +
            'Pesquise e responda no fim com um JSON EXATO (sem texto depois):\n' +
            '{"typicalValue": <número na unidade pedida>, "rangeMin": <número|null>, "rangeMax": <número|null>, ' +
            '"source": "<nome da fonte + URL>", "asOfMonth": "<AAAA-MM|null>", "found": <true|false>}\n' +
            'Se não encontrar fonte confiável, use "found": false.',
        },
      ],
    });

    const texto = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
    const json = extractJson(texto);
    if (!json || json.found === false) return null;

    const typicalValue = typeof json.typicalValue === 'number' ? json.typicalValue : Number(json.typicalValue);
    const source = typeof json.source === 'string' ? json.source : '';
    if (!Number.isFinite(typicalValue) || !source.trim()) return null;

    const rangeMin = typeof json.rangeMin === 'number' ? json.rangeMin : null;
    const rangeMax = typeof json.rangeMax === 'number' ? json.rangeMax : null;
    return {
      typicalValue,
      range: rangeMin != null && rangeMax != null ? { min: rangeMin, max: rangeMax } : null,
      source,
      asOfMonth: typeof json.asOfMonth === 'string' && /^\d{4}-\d{2}$/.test(json.asOfMonth) ? json.asOfMonth : null,
    };
  }
}
