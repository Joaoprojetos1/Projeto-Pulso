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
 * TRÊS FORMAS de transcrição, uma por destino (o destino é do CÓDIGO, não da IA):
 *   - `fixed_cost`  (folha)      → itens { rótulo, valor }            → custo fixo
 *   - `receivables` (maquininha) → itens { rótulo, valor, DATA }      → a receber previsto
 *   - `ops`         (gerencial, estoque, serviços, contábil)
 *                                → itens { CAMPO do segmento, valor, MÊS } → números do mês
 *
 * A forma `ops` só transcreve para os campos que o SEGMENTO da empresa declara no
 * core (a lista vai no prompt e é reconferida aqui): a IA não inventa métrica, e
 * campo fora da lista é descartado com aviso.
 *
 * LGPD: rótulos são GENÉRICOS (cargo/natureza), nunca nomes de pessoas. Nada de
 * texto bruto é guardado nem logado — só o par (rótulo, valor) já validado.
 */

import type { OpsUnit, SegmentField } from '@pulso/core';

import { brMoneyToCents } from '../parsers/br';
import { extractPdfText } from '../parsers/pdf-text';
import { readSpreadsheetRows } from '../parsers/spreadsheet';
import { ParseError } from '../parsers/types';
import type { TextProvider } from './provider';

/** Tipos de documento que suportam extração por IA hoje. Cresce por aqui. */
export const EXTRACTABLE_TYPES = [
  'payroll',
  'card_acquirer',
  'management',
  'services',
  'inventory',
  'accounting',
] as const;
export type ExtractableType = (typeof EXTRACTABLE_TYPES)[number];

export function isExtractable(docType: string): docType is ExtractableType {
  return (EXTRACTABLE_TYPES as readonly string[]).includes(docType);
}

/** O que a transcrição produz — e, por consequência, para onde o código a manda. */
export type ExtractionShape = 'fixed_cost' | 'receivables' | 'ops';

/** Um valor transcrito pela IA (antes da validação do código). */
interface RawExtractedItem {
  label: string;
  valueText: string;
  /** forma `ops`: slug do campo do segmento que a IA diz ser este número */
  field?: string;
  /** forma `ops`: mês de referência como aparece no documento ("08/2026", "agosto") */
  monthText?: string;
  /** forma `receivables`: data prevista como aparece ("12/09/2026") */
  dateText?: string;
}

/**
 * Um item já VALIDADO pelo código.
 *
 * `amountCents` e `quantity` são excludentes: dinheiro vem em centavos inteiros;
 * contagem/horas vêm como número inteiro (é a mesma escolha que a tabela
 * `monthly_operations` já fez em `value_num`). Só um dos dois existe por item.
 */
export interface ExtractedItem {
  label: string;
  amountCents?: number;
  quantity?: number;
  /** forma `ops`: campo do segmento onde este número vai entrar */
  field?: string;
  /** forma `ops`: mês de referência (YYYY-MM) */
  month?: string;
  /** forma `ops`: unidade declarada pelo campo (o app usa para formatar) */
  unit?: OpsUnit;
  /** forma `receivables`: data prevista do recebimento (YYYY-MM-DD) */
  dueOn?: string;
}

/** A proposta pronta para o dono confirmar. */
export interface ExtractionProposal {
  docType: ExtractableType;
  shape: ExtractionShape;
  items: ExtractedItem[];
  /** O que o código descartou (não converteu, fora da faixa) — transparência. */
  issues: string[];
  modelVersion: string;
}

/**
 * O que o CÓDIGO entrega à extração: os campos do segmento da empresa (forma
 * `ops`) e o "hoje" do negócio (faixa de datas e meses aceitáveis). A IA nunca
 * decide nada disso.
 */
export interface ExtractionContext {
  fields?: readonly SegmentField[];
  today: string; // YYYY-MM-DD
}

/** O modelo de extração: transcreve valores de um tipo a partir do texto do arquivo. */
export interface ExtractionModel {
  extract(
    docType: ExtractableType,
    fileText: string,
    ctx?: ExtractionContext,
  ): Promise<{ items: RawExtractedItem[]; modelVersion: string }>;
}

// ---------------------------------------------------------------
// Registro por tipo: forma, prompt e faixa de sanidade (o código, não a IA)
// ---------------------------------------------------------------

interface TypeSpec {
  shape: ExtractionShape;
  /** Instrução de TRANSCRIÇÃO (nunca cálculo) para este tipo. */
  system: string;
  /** Teto de sanidade por item em dinheiro (centavos). Fora disso, o código descarta. */
  maxCents: number;
  /** Teto de itens que aceitamos numa transcrição (controla custo e absurdo). */
  maxItems: number;
}

/** Regra comum a todos os tipos: transcrever é copiar, não calcular. */
const NAO_CALCULE =
  'Você NÃO é uma calculadora: não some, não subtraia, não converta, não arredonde, ' +
  'não invente. Copie apenas valores que ESTÃO escritos no documento. ' +
  '"valueText" é o valor EXATAMENTE como aparece (ex.: "3.500,00", "R$ 1.200,00"): ' +
  'não mude a pontuação. Se não reconhecer nada, devolva uma lista vazia. Nunca chute.';

/** Instrução comum da forma `ops`: só os campos do segmento, com mês. */
const OPS_REGRAS =
  'REGRAS:\n' +
  '1. Devolva itens { "field", "label", "valueText", "monthText" }.\n' +
  '2. "field" é OBRIGATÓRIO e tem que ser um dos códigos da lista abaixo, escrito igual. ' +
  'Número que não corresponder EXATAMENTE a um campo da lista: NÃO devolva (não force).\n' +
  '3. "monthText" é o mês de referência daquele número como aparece no documento ' +
  '(ex.: "08/2026", "agosto/2026", "2026-08"). Se o documento tiver um só período, ' +
  'repita o mesmo mês em todos os itens.\n' +
  '4. "label" é o nome da linha como aparece no documento (para o dono reconhecer).\n' +
  '5. Um item por campo e por mês. Não repita o mesmo campo no mesmo mês.\n' +
  '6. Números que não são do período (acumulado do ano, saldo de outro mês) não entram.';

const SPECS: Record<ExtractableType, TypeSpec> = {
  payroll: {
    shape: 'fixed_cost',
    system:
      'Você lê uma FOLHA DE PAGAMENTO de uma pequena empresa brasileira e TRANSCREVE os ' +
      'custos MENSAIS e recorrentes de pessoal. ' +
      NAO_CALCULE +
      '\n\nREGRAS:\n' +
      '1. Devolva uma lista de itens { "label", "valueText" }.\n' +
      '2. "label" é GENÉRICO: a natureza do custo (ex.: "Salários", "Pró-labore", ' +
      '"Encargos (INSS/FGTS)", "Vale-transporte"). NUNCA use nome de pessoa nem CPF.\n' +
      '3. Prefira linhas de TOTAL/RESUMO por natureza a repetir funcionário por funcionário. ' +
      'Se só houver linha por pessoa, agrupe por natureza no rótulo genérico e transcreva ' +
      'cada valor como um item (o dono confirma e ajusta depois — você não soma).\n' +
      '4. Ignore o que não é custo recorrente de pessoal (ex.: totais de impostos de venda).',
    maxCents: 50_000_000, // R$ 500.000/mês por item: folga; acima disso é erro de leitura
    maxItems: 40,
  },

  card_acquirer: {
    shape: 'receivables',
    system:
      'Você lê um relatório de MAQUININHA DE CARTÃO (Cielo, Stone, PagSeguro, Rede, ' +
      'Mercado Pago, SumUp…) de uma pequena empresa brasileira e TRANSCREVE a AGENDA DE ' +
      'RECEBÍVEIS: o que já foi vendido e ainda vai cair na conta. ' +
      NAO_CALCULE +
      '\n\nREGRAS:\n' +
      '1. Devolva itens { "label", "valueText", "dateText" }.\n' +
      '2. "dateText" é OBRIGATÓRIO: a data PREVISTA do crédito, como aparece ' +
      '(ex.: "12/09/2026"). Item sem data prevista não entra.\n' +
      '3. "valueText" é o valor LÍQUIDO a receber daquela data (o que cai na conta, já ' +
      'com a taxa descontada). Se o relatório só tiver o valor bruto, transcreva o bruto ' +
      'e escreva "(bruto)" no final do label — o dono corrige na confirmação.\n' +
      '4. "label" identifica a linha para o dono (ex.: "Crédito à vista", "Parcela 2/6 ' +
      'Visa", "Débito"). NUNCA transcreva número de cartão, CPF ou nome de cliente.\n' +
      '5. Só o que está PREVISTO para o futuro. O que já foi pago/creditado NÃO entra: ' +
      'isso já aparece no extrato bancário e entraria em dobro.\n' +
      '6. Uma linha por data prevista. Se o relatório já traz o total por dia, use o total ' +
      'do dia em vez de repetir venda por venda.',
    maxCents: 100_000_000, // R$ 1.000.000 num único crédito: teto de sanidade
    maxItems: 120, // uma agenda de 90 dias cabe
  },

  management: {
    shape: 'ops',
    system:
      'Você lê um RELATÓRIO GERENCIAL (faturamento, movimento, vendas do período) de uma ' +
      'pequena empresa brasileira e TRANSCREVE os números do MÊS que correspondem aos ' +
      'campos listados. ' +
      NAO_CALCULE +
      '\n\n' +
      OPS_REGRAS,
    maxCents: 500_000_000, // R$ 5.000.000 num mês: teto de sanidade
    maxItems: 40,
  },

  services: {
    shape: 'ops',
    system:
      'Você lê um RELATÓRIO DE SERVIÇOS/ATENDIMENTOS (agenda, procedimentos, ordens de ' +
      'serviço) de uma pequena empresa brasileira e TRANSCREVE os números do MÊS que ' +
      'correspondem aos campos listados. ' +
      NAO_CALCULE +
      '\n\n' +
      OPS_REGRAS,
    maxCents: 500_000_000,
    maxItems: 40,
  },

  inventory: {
    shape: 'ops',
    system:
      'Você lê um RELATÓRIO DE ESTOQUE (posição, giro, custo da mercadoria) de uma pequena ' +
      'empresa brasileira e TRANSCREVE os números do MÊS que correspondem aos campos ' +
      'listados. ' +
      NAO_CALCULE +
      '\n\n' +
      OPS_REGRAS +
      '\n7. Estoque é SALDO no fim do período: use a posição de fechamento, nunca a soma ' +
      'das entradas do mês.',
    maxCents: 500_000_000,
    maxItems: 40,
  },

  accounting: {
    shape: 'ops',
    system:
      'Você lê um documento CONTÁBIL brasileiro (DRE, balancete ou balanço) de uma pequena ' +
      'empresa e TRANSCREVE os números do MÊS que correspondem aos campos listados. ' +
      NAO_CALCULE +
      '\n\n' +
      OPS_REGRAS +
      '\n7. Use a coluna do MÊS, nunca a do acumulado do ano ("no período", não "no ano").\n' +
      '8. Valores entre parênteses ou com sinal negativo são despesas: transcreva o valor ' +
      'sem o sinal, o campo já diz que é custo.',
    maxCents: 500_000_000,
    maxItems: 40,
  },
};

export function shapeOf(docType: ExtractableType): ExtractionShape {
  return SPECS[docType].shape;
}

/** JSON Schema da transcrição (structured output). Só rótulo + texto do valor. */
function schemaFor(spec: TypeSpec) {
  const props: Record<string, unknown> = {
    label: { type: 'string', description: 'Nome da linha como aparece. Sem nome de pessoa.' },
    valueText: { type: 'string', description: 'O valor como aparece no documento (ex.: "3.500,00").' },
  };
  const required = ['label', 'valueText'];
  if (spec.shape === 'ops') {
    props.field = { type: 'string', description: 'Código do campo (exatamente como na lista).' };
    props.monthText = { type: 'string', description: 'Mês de referência como aparece (ex.: "08/2026").' };
    required.push('field', 'monthText');
  }
  if (spec.shape === 'receivables') {
    props.dateText = { type: 'string', description: 'Data prevista do crédito (ex.: "12/09/2026").' };
    required.push('dateText');
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: spec.maxItems,
        items: { type: 'object', additionalProperties: false, required, properties: props },
      },
    },
  } as const;
}

/** A lista de campos do segmento, escrita para o prompt (código → IA, nunca o contrário). */
function fieldsForPrompt(fields: readonly SegmentField[]): string {
  const unidade: Record<OpsUnit, string> = {
    cents: 'valor em reais',
    count: 'quantidade inteira',
    hours: 'horas inteiras',
  };
  return fields
    .map((f) => `- ${f.slug}: ${f.label} (${unidade[f.unit]}). ${f.description}`)
    .join('\n');
}

// ---------------------------------------------------------------
// Modelo de extração sobre um TextProvider (Anthropic/OpenAI)
// ---------------------------------------------------------------

/** Liga qualquer TextProvider à extração (saída estruturada por forma). */
export function extractionModelFromProvider(provider: TextProvider): ExtractionModel {
  return {
    async extract(docType, fileText, ctx) {
      const spec = SPECS[docType];
      const campos = spec.shape === 'ops' ? (ctx?.fields ?? []) : [];
      if (spec.shape === 'ops' && campos.length === 0) {
        throw new ParseError('Esta empresa ainda não tem campos de segmento para preencher.');
      }
      const system =
        spec.shape === 'ops'
          ? `${spec.system}\n\nCAMPOS PERMITIDOS (use o código à esquerda em "field"):\n${fieldsForPrompt(campos)}`
          : spec.system;

      const r = await provider.generate({
        system,
        user:
          'Transcreva os itens deste arquivo (não some nada):\n\n' +
          '"""\n' +
          fileText +
          '\n"""\n\n' +
          'Responda com o JSON { "items": [ … ] }.',
        jsonSchema: schemaFor(spec),
        maxTokens: 2500,
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
        .slice(0, spec.maxItems)
        .map((x) => {
          const o = x as unknown as Record<string, unknown>;
          const item: RawExtractedItem = { label: x.label, valueText: x.valueText };
          if (typeof o.field === 'string') item.field = o.field;
          if (typeof o.monthText === 'string') item.monthText = o.monthText;
          if (typeof o.dateText === 'string') item.dateText = o.dateText;
          return item;
        });
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
 * Tira CPF do texto ANTES de ele sair daqui (LGPD).
 *
 * A extração é o único ponto do produto em que o conteúdo de um arquivo do
 * cliente chega ao modelo — e a folha de pagamento vem cheia de CPF. Nenhum CPF
 * é necessário para transcrever um valor, então ele não sai da nossa máquina:
 * o código mascara antes de montar o prompt.
 *
 * Cobre o CPF escrito (000.000.000-00) e a sequência crua de 11 dígitos. NÃO
 * toca em valor de dinheiro: no Brasil valor tem vírgula decimal, e a regra
 * exige que os 11 dígitos estejam isolados (sem vírgula/dígito colado).
 * CNPJ fica: é da empresa, não é dado pessoal, e serve de contexto.
 */
export function mascararCpf(texto: string): string {
  return texto
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')
    .replace(/(^|[^\d,.\-/])\d{11}(?![\d,.\-/])/g, '$1[CPF]');
}

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
  texto = mascararCpf(texto.trim());
  if (!texto) throw new ParseError('Não consegui ler o conteúdo do arquivo.');
  return texto.length > MAX_TEXT_CHARS ? texto.slice(0, MAX_TEXT_CHARS) : texto;
}

// ---- datas e meses: o código entende o que vier, ou descarta ----

const MESES_PT: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function semAcento(s: string): string {
  // U+0300 a U+036F = marcas de acento soltas depois do NFD (escapadas de propósito)
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function ehDataValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

/** "12/09/2026", "12-09-26", "2026-09-12" → "2026-09-12". null se não der. */
export function textoParaData(texto: string): string | null {
  const t = texto.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) {
    const [ano, mes, dia] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return ehDataValida(ano, mes, dia) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
  }
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (br) {
    const dia = Number(br[1]);
    const mes = Number(br[2]);
    let ano = Number(br[3]);
    if (ano < 100) ano += 2000;
    return ehDataValida(ano, mes, dia) ? `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}` : null;
  }
  return null;
}

/** "08/2026", "agosto/2026", "ago-26", "2026-08" → "2026-08". null se não der. */
export function textoParaMes(texto: string): string | null {
  const t = semAcento(texto.trim());
  const iso = /^(\d{4})-(\d{1,2})/.exec(t);
  if (iso) {
    const mes = Number(iso[2]);
    return mes >= 1 && mes <= 12 ? `${iso[1]}-${doisDigitos(mes)}` : null;
  }
  const numerico = /(^|[^\d])(\d{1,2})[/.-](\d{2,4})([^\d]|$)/.exec(t);
  if (numerico) {
    const mes = Number(numerico[2]);
    let ano = Number(numerico[3]);
    if (ano < 100) ano += 2000;
    if (mes >= 1 && mes <= 12 && ano >= 2000) return `${ano}-${doisDigitos(mes)}`;
  }
  const nome = /([a-z]{3,})[^a-z0-9]*(\d{2,4})/.exec(t);
  if (nome) {
    const mes = MESES_PT[nome[1]!.slice(0, 3)];
    let ano = Number(nome[2]);
    if (ano < 100) ano += 2000;
    if (mes && ano >= 2000) return `${ano}-${doisDigitos(mes)}`;
  }
  return null;
}

function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Faixa aceitável do crédito previsto: nada muito velho, nada longe demais. */
const DIAS_PASSADO = 400;
const DIAS_FUTURO = 730;
/** Faixa aceitável do mês de referência: 5 anos para trás, nunca no futuro. */
const MESES_PASSADO = 60;

/** Tetos de sanidade do que não é dinheiro. */
const MAX_COUNT = 5_000_000;
const MAX_HOURS = 100_000;

/**
 * Valida a transcrição da IA — TRABALHO DO CÓDIGO. `valueText` vira número pelo
 * parser BR (à prova de sujeira); rótulo é limpo e limitado; campo, mês e data são
 * reconferidos contra o segmento e o calendário. O que não converte ou sai da faixa
 * é DESCARTADO com um aviso legível (nunca entra torto).
 */
export function validateExtraction(
  docType: ExtractableType,
  rawItems: RawExtractedItem[],
  ctx?: ExtractionContext,
): { items: ExtractedItem[]; issues: string[] } {
  const spec = SPECS[docType];
  const hoje = ctx?.today ?? new Date().toISOString().slice(0, 10);
  const items: ExtractedItem[] = [];
  const issues: string[] = [];

  // forma `ops`: a lista de campos válidos é do CÓDIGO (o segmento da empresa)
  const porSlug = new Map<string, SegmentField>((ctx?.fields ?? []).map((f) => [f.slug, f]));
  if (spec.shape === 'ops' && porSlug.size === 0) {
    return {
      items: [],
      issues: ['Este tipo de relatório depende do segmento da empresa, que ainda não está definido.'],
    };
  }

  const mesLimiteAntigo = (() => {
    const [a, m] = hoje.split('-').map(Number) as [number, number];
    const total = a * 12 + (m - 1) - MESES_PASSADO;
    return `${Math.floor(total / 12)}-${doisDigitos((total % 12) + 1)}`;
  })();
  const mesAtual = hoje.slice(0, 7);
  const dataMin = somaDias(hoje, -DIAS_PASSADO);
  const dataMax = somaDias(hoje, DIAS_FUTURO);

  // uma linha por (campo, mês) na forma `ops`: repetição é sinal de leitura torta
  const vistos = new Set<string>();

  for (const raw of rawItems) {
    const label = raw.label.trim().slice(0, 120);
    if (!label) {
      issues.push('Um item veio sem descrição e foi ignorado.');
      continue;
    }

    // ---- campo do segmento (só forma `ops`) ----
    let campo: SegmentField | undefined;
    if (spec.shape === 'ops') {
      campo = raw.field ? porSlug.get(raw.field.trim()) : undefined;
      if (!campo) {
        issues.push(`"${label}": não corresponde a nenhum número que eu acompanho no seu segmento.`);
        continue;
      }
    }

    // ---- valor: dinheiro em centavos, o resto em número inteiro ----
    const unidade: OpsUnit = campo?.unit ?? 'cents';
    let valor: number;
    try {
      valor = unidade === 'cents' ? brMoneyToCents(raw.valueText) : Math.round(brMoneyToCents(raw.valueText) / 100);
    } catch {
      issues.push(`"${label}": não entendi o valor "${raw.valueText}" — confira no app.`);
      continue;
    }
    if (valor <= 0) {
      issues.push(`"${label}": valor zero ou negativo foi ignorado.`);
      continue;
    }
    const teto = unidade === 'cents' ? spec.maxCents : unidade === 'count' ? MAX_COUNT : MAX_HOURS;
    if (valor > teto) {
      issues.push(`"${label}": valor fora da faixa esperada foi ignorado.`);
      continue;
    }

    // ---- data prevista (forma `receivables`) ----
    let dueOn: string | undefined;
    if (spec.shape === 'receivables') {
      const d = raw.dateText ? textoParaData(raw.dateText) : null;
      if (!d) {
        issues.push(`"${label}": não entendi a data "${raw.dateText ?? ''}" — item ignorado.`);
        continue;
      }
      if (d < dataMin || d > dataMax) {
        issues.push(`"${label}": a data ${d} está fora da faixa esperada — item ignorado.`);
        continue;
      }
      dueOn = d;
    }

    // ---- mês de referência (forma `ops`) ----
    let month: string | undefined;
    if (spec.shape === 'ops') {
      const m = raw.monthText ? textoParaMes(raw.monthText) : null;
      if (!m) {
        issues.push(`"${label}": não entendi o mês "${raw.monthText ?? ''}" — item ignorado.`);
        continue;
      }
      if (m > mesAtual || m < mesLimiteAntigo) {
        issues.push(`"${label}": o mês ${m} está fora da faixa esperada — item ignorado.`);
        continue;
      }
      const chave = `${campo!.slug}@${m}`;
      if (vistos.has(chave)) {
        issues.push(`"${label}": veio repetido para ${m} e só o primeiro valeu.`);
        continue;
      }
      vistos.add(chave);
      month = m;
    }

    const item: ExtractedItem = { label };
    if (unidade === 'cents') item.amountCents = valor;
    else item.quantity = valor;
    if (campo) {
      item.field = campo.slug;
      item.unit = campo.unit;
    }
    if (month) item.month = month;
    if (dueOn) item.dueOn = dueOn;
    items.push(item);
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
  ctx?: ExtractionContext,
): Promise<ExtractionProposal> {
  const fileText = await fileToText(buf);
  const { items: raw, modelVersion } = await model.extract(docType, fileText, ctx);
  const { items, issues } = validateExtraction(docType, raw, ctx);
  return { docType, shape: SPECS[docType].shape, items, issues, modelVersion };
}
