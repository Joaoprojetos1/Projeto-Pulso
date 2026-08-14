/**
 * Extração de arquivo POR TIPO (exceção controlada do CLAUDE.md, decidida com o
 * especialista em 13/08).
 *
 * Cada empresa manda o arquivo num formato diferente. Quando o dono envia por um
 * TIPO declarado (folha, maquininha, DRE…), a IA lê o arquivo APENAS para
 * TRANSCREVER os valores daquele tipo — NUNCA para calcular indicador nem decidir
 * alerta. A divisão de trabalho é dura:
 *
 *   1. CÓDIGO lê o arquivo → texto (parsers/*). A IA não abre binário.
 *   2. IA TRANSCREVE: devolve { label, valueText } — o texto do valor COMO APARECE.
 *      Não soma, não converte, não inventa. Só copia o que leu.
 *   3. CÓDIGO valida: `valueText` → centavos (parser BR, à prova de sujeira) +
 *      faixa/formato. O que não converte ou sai da faixa é DESCARTADO com aviso.
 *   4. O resultado é uma PROPOSTA — o dono confirma antes de qualquer número
 *      entrar no motor (mesmo padrão do custo fixo).
 *
 * LGPD: rótulos são GENÉRICOS (cargo/natureza), nunca nomes de pessoas. Nada de
 * texto bruto é guardado nem logado — só o par (rótulo, centavos) já validado.
 */

import { brMoneyToCents } from '../parsers/br';
import { extractPdfText } from '../parsers/pdf-text';
import { readSpreadsheetRows } from '../parsers/spreadsheet';
import { ParseError } from '../parsers/types';
import type { TextProvider } from './provider';

/** Tipos de documento que suportam extração por IA hoje. Cresce por aqui. */
export const EXTRACTABLE_TYPES = ['payroll'] as const;
export type ExtractableType = (typeof EXTRACTABLE_TYPES)[number];

export function isExtractable(docType: string): docType is ExtractableType {
  return (EXTRACTABLE_TYPES as readonly string[]).includes(docType);
}

/** Um valor transcrito pela IA (antes da validação do código). */
interface RawExtractedItem {
  label: string;
  valueText: string;
}

/** Um item já VALIDADO pelo código: rótulo limpo + centavos inteiros. */
export interface ExtractedItem {
  label: string;
  amountCents: number;
}

/** A proposta pronta para o dono confirmar. */
export interface ExtractionProposal {
  docType: ExtractableType;
  items: ExtractedItem[];
  /** O que o código descartou (não converteu, fora da faixa) — transparência. */
  issues: string[];
  modelVersion: string;
}

/** O modelo de extração: transcreve valores de um tipo a partir do texto do arquivo. */
export interface ExtractionModel {
  extract(docType: ExtractableType, fileText: string): Promise<{ items: RawExtractedItem[]; modelVersion: string }>;
}

// ---------------------------------------------------------------
// Registro por tipo: prompt + faixa de sanidade (o código, não a IA)
// ---------------------------------------------------------------

interface TypeSpec {
  /** Instrução de TRANSCRIÇÃO (nunca cálculo) para este tipo. */
  system: string;
  /** Teto de sanidade por item (centavos). Fora disso, o código descarta. */
  maxCents: number;
}

const SPECS: Record<ExtractableType, TypeSpec> = {
  payroll: {
    system:
      'Você lê uma FOLHA DE PAGAMENTO de uma pequena empresa brasileira e TRANSCREVE os ' +
      'custos MENSAIS e recorrentes de pessoal. Você NÃO é uma calculadora: não some, não ' +
      'converta, não arredonde, não invente. Copie apenas valores que ESTÃO escritos no ' +
      'documento.\n\n' +
      'REGRAS:\n' +
      '1. Devolva uma lista de itens { "label", "valueText" }.\n' +
      '2. "valueText" é o valor EXATAMENTE como aparece no documento (ex.: "3.500,00", ' +
      '"R$ 1.200,00"). Não mude a pontuação.\n' +
      '3. "label" é GENÉRICO: a natureza do custo (ex.: "Salários", "Pró-labore", ' +
      '"Encargos (INSS/FGTS)", "Vale-transporte"). NUNCA use nome de pessoa nem CPF.\n' +
      '4. Prefira linhas de TOTAL/RESUMO por natureza a repetir funcionário por funcionário. ' +
      'Se só houver linha por pessoa, agrupe por natureza no rótulo genérico e transcreva ' +
      'cada valor como um item (o dono confirma e ajusta depois — você não soma).\n' +
      '5. Ignore o que não é custo recorrente de pessoal (ex.: totais de impostos de venda).\n' +
      '6. Se não reconhecer nada, devolva uma lista vazia. Nunca chute.',
    maxCents: 50_000_000, // R$ 500.000/mês por item: folga; acima disso é erro de leitura
  },
};

/** JSON Schema da transcrição (structured output). Só rótulo + texto do valor. */
const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'valueText'],
        properties: {
          label: { type: 'string', description: 'Natureza do custo, genérica. Sem nome de pessoa.' },
          valueText: { type: 'string', description: 'O valor como aparece no documento (ex.: "3.500,00").' },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------
// Modelo de extração sobre um TextProvider (Anthropic/OpenAI)
// ---------------------------------------------------------------

/** Liga qualquer TextProvider à extração (saída estruturada { items:[{label,valueText}] }). */
export function extractionModelFromProvider(provider: TextProvider): ExtractionModel {
  return {
    async extract(docType, fileText) {
      const spec = SPECS[docType];
      const r = await provider.generate({
        system: spec.system,
        user:
          'Transcreva os itens deste arquivo (não some nada):\n\n' +
          '"""\n' +
          fileText +
          '\n"""\n\n' +
          'Responda com o JSON { "items": [ { "label", "valueText" } ] }.',
        jsonSchema: EXTRACTION_SCHEMA,
        maxTokens: 1500,
      });
      let parsed: { items?: unknown };
      try {
        parsed = JSON.parse(r.text) as { items?: unknown };
      } catch {
        throw new Error('Resposta da extração fora do formato JSON.');
      }
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const items: RawExtractedItem[] = rawItems
        .filter((x): x is RawExtractedItem => {
          const o = x as Record<string, unknown>;
          return typeof o?.label === 'string' && typeof o?.valueText === 'string';
        })
        .map((x) => ({ label: x.label, valueText: x.valueText }));
      return { items, modelVersion: r.modelVersion };
    },
  };
}

// ---------------------------------------------------------------
// Passo do CÓDIGO: arquivo → texto, e transcrição → itens validados
// ---------------------------------------------------------------

/** Teto do texto que vai ao modelo (controla custo/tokens; folha real é pequena). */
const MAX_TEXT_CHARS = 60_000;

/**
 * Converte o arquivo em texto — TRABALHO DO CÓDIGO. PDF pelo extrator de texto;
 * o resto (CSV/HTML/XLSX) pela leitura de planilha, achatada em linhas. A IA
 * nunca recebe o binário, só este texto.
 */
export async function fileToText(buf: Buffer): Promise<string> {
  let texto: string;
  if (buf[0] === 0x25 && buf[1] === 0x50) {
    // "%P" de %PDF
    texto = await extractPdfText(buf);
  } else {
    const { rows } = readSpreadsheetRows(buf);
    texto = rows.map((r) => r.join('\t')).join('\n');
  }
  texto = texto.trim();
  if (!texto) throw new ParseError('Não consegui ler o conteúdo do arquivo.');
  return texto.length > MAX_TEXT_CHARS ? texto.slice(0, MAX_TEXT_CHARS) : texto;
}

/**
 * Valida a transcrição da IA — TRABALHO DO CÓDIGO. `valueText` vira centavos pelo
 * parser BR (à prova de sujeira); rótulo é limpo e limitado. O que não converte ou
 * sai da faixa de sanidade é DESCARTADO com um aviso legível (nunca entra torto).
 */
export function validateExtraction(
  docType: ExtractableType,
  rawItems: RawExtractedItem[],
): { items: ExtractedItem[]; issues: string[] } {
  const spec = SPECS[docType];
  const items: ExtractedItem[] = [];
  const issues: string[] = [];

  for (const raw of rawItems) {
    const label = raw.label.trim().slice(0, 120);
    if (!label) {
      issues.push('Um item veio sem descrição e foi ignorado.');
      continue;
    }
    let cents: number;
    try {
      cents = brMoneyToCents(raw.valueText);
    } catch {
      issues.push(`"${label}": não entendi o valor "${raw.valueText}" — confira no app.`);
      continue;
    }
    if (cents <= 0) {
      issues.push(`"${label}": valor zero ou negativo foi ignorado.`);
      continue;
    }
    if (cents > spec.maxCents) {
      issues.push(`"${label}": valor fora da faixa esperada foi ignorado.`);
      continue;
    }
    items.push({ label, amountCents: cents });
  }
  return { items, issues };
}

/**
 * Fluxo completo: código lê o arquivo → IA transcreve → código valida.
 * Devolve a PROPOSTA (o dono confirma antes de entrar no motor). Nunca aplica nada.
 */
export async function extractProposal(
  model: ExtractionModel,
  docType: ExtractableType,
  buf: Buffer,
): Promise<ExtractionProposal> {
  const fileText = await fileToText(buf);
  const { items: raw, modelVersion } = await model.extract(docType, fileText);
  const { items, issues } = validateExtraction(docType, raw);
  return { docType, items, issues, modelVersion };
}
