/**
 * Pulso core — diagnóstico de GESTÃO (o checklist do especialista).
 *
 * Um questionário curto de sim / parcial / não, organizado nos blocos do
 * material do especialista. A PONTUAÇÃO é determinística e mora aqui (o core
 * julga; o writer só redige a devolutiva a partir destes `facts`).
 *
 * Entrega valor imediato a um cliente novo SEM nenhum arquivo enviado: responde
 * 15 perguntas e recebe onde está mais frágil e o que atacar primeiro.
 *
 * Escala: sim = 1, parcial = 0,5, não = 0. Pontuação de um bloco = média das
 * respostas DADAS naquele bloco × 100 (perguntas não respondidas não contam).
 * Geral = média de todas as respostas dadas × 100.
 */

import { isSegmentId } from './index';

export type SurveyBlock = 'estrutura' | 'receita' | 'custos' | 'caixa' | 'gestao' | 'risco';
export type SurveyAnswerValue = 'sim' | 'parcial' | 'nao';

export interface SurveyQuestion {
  id: string;
  block: SurveyBlock;
  text: string;
}

export interface SurveyAnswer {
  questionId: string;
  value: SurveyAnswerValue;
  answeredOn: string; // 'YYYY-MM-DD' — as respostas ficam datadas
}

export const BLOCKS: Array<{ block: SurveyBlock; label: string; focus: string }> = [
  { block: 'estrutura', label: 'Estrutura e organização', focus: 'separar o negócio da pessoa e organizar os números' },
  { block: 'receita', label: 'Receita', focus: 'entender de onde vem o faturamento e o que puxa a venda' },
  { block: 'custos', label: 'Custos', focus: 'saber quanto custa operar e o que dá para cortar' },
  { block: 'caixa', label: 'Caixa e capital de giro', focus: 'garantir fôlego e não deixar o caixa apertar' },
  { block: 'gestao', label: 'Gestão e pessoas', focus: 'ter metas, indicadores e uma equipe alinhada' },
  { block: 'risco', label: 'Risco', focus: 'reduzir dependências e proteger o negócio' },
];

const BLOCK_LABEL: Record<SurveyBlock, string> = Object.fromEntries(BLOCKS.map((b) => [b.block, b.label])) as Record<SurveyBlock, string>;

// 13 perguntas comuns a qualquer pequeno negócio.
const BASE: SurveyQuestion[] = [
  { id: 'est_conta_separada', block: 'estrutura', text: 'Você tem conta bancária do negócio separada da conta pessoal?' },
  { id: 'est_registros', block: 'estrutura', text: 'Você registra todas as entradas e saídas em algum lugar organizado?' },
  { id: 'rec_conhece_origem', block: 'receita', text: 'Você sabe de onde vem a maior parte do seu faturamento?' },
  { id: 'rec_acompanha_mensal', block: 'receita', text: 'Você acompanha se a receita subiu ou caiu de um mês para o outro?' },
  { id: 'cus_conhece_fixos', block: 'custos', text: 'Você sabe de cor quanto gasta de custo fixo todo mês?' },
  { id: 'cus_precifica', block: 'custos', text: 'Você forma o preço sabendo quanto sobra de cada venda?' },
  { id: 'cx_reserva', block: 'caixa', text: 'Você tem uma reserva que cobre pelo menos um mês de custos?' },
  { id: 'cx_projeta', block: 'caixa', text: 'Você consegue prever se o caixa vai apertar nas próximas semanas?' },
  { id: 'cx_prazos', block: 'caixa', text: 'Você controla os prazos de receber e de pagar?' },
  { id: 'ges_metas', block: 'gestao', text: 'Você define metas e acompanha indicadores do negócio?' },
  { id: 'ges_equipe', block: 'gestao', text: 'Sua equipe sabe o que se espera dela e como está indo?' },
  { id: 'ris_inadimplencia', block: 'risco', text: 'A inadimplência dos seus clientes está sob controle?' },
  { id: 'ris_dependencia', block: 'risco', text: 'Seu negócio não depende demais de um único cliente, fornecedor ou canal?' },
];

// 2 perguntas específicas por segmento (total 15 por segmento).
const EXTRA: Record<'clinica' | 'varejo' | 'restaurante', SurveyQuestion[]> = {
  clinica: [
    { id: 'clinica_glosa', block: 'risco', text: 'Você acompanha e contesta as glosas dos convênios?' },
    { id: 'clinica_agenda', block: 'receita', text: 'Você acompanha a taxa de ocupação da sua agenda?' },
  ],
  varejo: [
    { id: 'varejo_estoque', block: 'custos', text: 'Você sabe quanto tem parado em estoque e o quanto ele gira?' },
    { id: 'varejo_colecao', block: 'receita', text: 'Você planeja compras e coleções olhando o que vende mais?' },
  ],
  restaurante: [
    { id: 'restaurante_ficha', block: 'custos', text: 'Você tem ficha técnica dos pratos e sabe o custo de cada um?' },
    { id: 'restaurante_delivery', block: 'risco', text: 'Você acompanha o quanto as taxas de delivery comem da sua margem?' },
  ],
};

/** O questionário do segmento (base + específicas). Sem segmento, só a base. */
export function questionnaireFor(niche: string | undefined | null): SurveyQuestion[] {
  const extra = isSegmentId(niche) ? EXTRA[niche] : [];
  return [...BASE, ...extra];
}

const POINTS: Record<SurveyAnswerValue, number> = { sim: 1, parcial: 0.5, nao: 0 };

export interface SurveyBlockScore {
  block: SurveyBlock;
  label: string;
  score: number | null; // 0-100, null se nenhuma pergunta do bloco foi respondida
  answered: number;
  total: number;
}

export interface SurveyResult {
  overall: number | null; // 0-100
  answeredCount: number;
  totalQuestions: number;
  blocks: SurveyBlockScore[];
  /** Os dois blocos mais frágeis (menor pontuação), do pior ao menos pior. */
  weakest: Array<{ block: SurveyBlock; label: string; score: number; focus: string }>;
  /** Perguntas respondidas 'não' nos blocos mais frágeis (material p/ o writer). */
  weakestGaps: Array<{ block: SurveyBlock; questionId: string; text: string }>;
  /** Data da resposta mais recente (o diagnóstico é datado). */
  answeredOn: string | null;
}

/**
 * Pontua o questionário. Determinístico e puro. Ignora respostas de perguntas
 * que não pertencem ao questionário do segmento (robusto a schema antigo).
 */
export function scoreSurvey(niche: string | undefined | null, answers: SurveyAnswer[]): SurveyResult {
  const questions = questionnaireFor(niche);
  const byId = new Map(questions.map((q) => [q.id, q]));
  // última resposta por pergunta (idempotente a regravações)
  const latest = new Map<string, SurveyAnswer>();
  for (const a of answers) {
    if (!byId.has(a.questionId)) continue;
    const prev = latest.get(a.questionId);
    if (!prev || a.answeredOn >= prev.answeredOn) latest.set(a.questionId, a);
  }

  const blocks: SurveyBlockScore[] = BLOCKS.map(({ block, label }) => {
    const qs = questions.filter((q) => q.block === block);
    const given = qs.map((q) => latest.get(q.id)).filter((a): a is SurveyAnswer => a !== undefined);
    const score = given.length ? Math.round((given.reduce((s, a) => s + POINTS[a.value], 0) / given.length) * 100) : null;
    return { block, label, score, answered: given.length, total: qs.length };
  });

  const allGiven = [...latest.values()];
  const overall = allGiven.length ? Math.round((allGiven.reduce((s, a) => s + POINTS[a.value], 0) / allGiven.length) * 100) : null;

  const weakest = blocks
    .filter((b): b is SurveyBlockScore & { score: number } => b.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((b) => ({ block: b.block, label: b.label, score: b.score, focus: BLOCKS.find((x) => x.block === b.block)!.focus }));

  const weakBlocks = new Set(weakest.map((w) => w.block));
  const weakestGaps = questions
    .filter((q) => weakBlocks.has(q.block) && latest.get(q.id)?.value === 'nao')
    .map((q) => ({ block: q.block, questionId: q.id, text: q.text }));

  const answeredOn = allGiven.length ? allGiven.map((a) => a.answeredOn).sort().at(-1)! : null;

  return {
    overall,
    answeredCount: allGiven.length,
    totalQuestions: questions.length,
    blocks,
    weakest,
    weakestGaps,
    answeredOn,
  };
}

export { BLOCK_LABEL };
