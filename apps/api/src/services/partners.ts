/**
 * Casador de SÓCIO ↔ contraparte do lançamento (código puro, testável).
 *
 * O extrato traz a contraparte como texto ("PIX JOAO M CASTRO", "TED DE MARIA
 * SOUZA"). Aqui decidimos, sem IA, se aquele texto corresponde a um sócio da lista
 * (quadro societário do CNPJ + contas que o dono acrescentou). É só uma PROPOSTA:
 * o dono confirma a classificação antes de qualquer efeito no motor.
 *
 * Conservador de propósito: exige o PRIMEIRO e o ÚLTIMO nome do sócio presentes na
 * contraparte (nome com 2+ partes). Um sócio de nome único exige aparição integral.
 * Falso positivo é barrado pela confirmação do dono; falso negativo, pelo dono
 * cadastrar a conta à mão.
 */

/** Palavras que não distinguem uma pessoa (ligação e ruído de extrato). */
const STOPWORDS = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E',
  'PIX', 'TED', 'DOC', 'TEF', 'TRANSF', 'TRANSFERENCIA', 'ENVIO', 'RECEBIDO',
  'PAGAMENTO', 'PGTO', 'DEP', 'DEPOSITO', 'CREDITO', 'DEBITO', 'LTDA', 'ME', 'EPP',
]);

/** MAIÚSCULAS, sem acento, só letras/espaços, espaços colapsados. */
export function normalizePartnerName(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos (marcas combinantes)
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ') // fora letra vira espaço (números, pontuação)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens significativos de um nome já normalizado (>=2 letras, sem stopword). */
export function significantTokens(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** A contraparte (já normalizada) contém a palavra inteira `token`? */
function containsWord(haystackNorm: string, token: string): boolean {
  return new RegExp(`(?:^| )${token}(?: |$)`).test(haystackNorm);
}

/**
 * O texto da contraparte corresponde a este nome de sócio?
 * - nome com 2+ partes: exige a PRIMEIRA e a ÚLTIMA presentes como palavra;
 * - nome de parte única: exige essa palavra presente (raro; ex.: apelido cadastrado).
 * Retorna false para entradas vazias.
 */
export function counterpartyMatchesName(counterparty: string, partnerNormalized: string): boolean {
  const alvo = normalizePartnerName(counterparty);
  if (!alvo) return false;
  const tokens = significantTokens(partnerNormalized);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return containsWord(alvo, tokens[0]!);
  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  return containsWord(alvo, first) && containsWord(alvo, last);
}

export interface PartnerRef {
  id: string;
  name: string;
  normalizedName: string;
}

/** O primeiro sócio da lista que casa com a contraparte (ou null). */
export function matchPartner(counterparty: string | null | undefined, partners: PartnerRef[]): PartnerRef | null {
  if (!counterparty) return null;
  for (const p of partners) {
    if (counterpartyMatchesName(counterparty, p.normalizedName)) return p;
  }
  return null;
}

/**
 * Classe sugerida a partir da natureza do lançamento (o dono confirma/corrige):
 * entrada de sócio → aporte; saída → retirada. Pró-labore é escolha do dono.
 */
export function suggestedClass(kind: 'receivable' | 'payable'): 'aporte' | 'retirada' {
  return kind === 'receivable' ? 'aporte' : 'retirada';
}

/** Classes válidas de classificação de um lançamento em relação aos sócios. */
export const PARTY_CLASSES = ['aporte', 'retirada', 'pro_labore', 'nao_socio'] as const;
export type PartyClass = (typeof PARTY_CLASSES)[number];

/** As classes que FICAM DE FORA do motor (não contam como receita/custo). */
export const EXCLUDED_PARTY_CLASSES: PartyClass[] = ['aporte', 'retirada'];
