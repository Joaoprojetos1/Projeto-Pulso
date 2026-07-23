/**
 * A voz do Pulso para o RESUMO DA SEMANA.
 *
 * Compara dois snapshots (o de agora e um de >= 5 dias antes) e redige, em
 * linguagem de dono, o que mudou (caixa, ciclo, receita) e o que observar — no
 * máximo 3 frases. Mesmas regras duras: só números dos facts, fiscalizado pelo
 * grounding; se falhar/inventar, entra o template determinístico (sempre correto).
 *
 * Reaproveita o AlertWriterModel (mesmo structured output { title, body }).
 */

import { formatCentsBRL } from './format';
import { checkGroundingDeep } from './grounding';
import type { AiCallUsage, UsageSink } from './usage';
import type { AlertPrompt, AlertWriterModel, CompanyProfile } from './writer';

export const WEEKLY_TEMPLATE_VERSION = 'weekly-template-v1';

export interface WeeklyFacts {
  cashNowCents: number | null;
  cashPrevCents: number | null;
  cashCycleNow: number | null;
  cashCyclePrev: number | null;
  revenueNowCents: number | null;
  revenuePrevCents: number | null;
  /** Dias entre os dois snapshots comparados. */
  daysBetween: number;
}

export interface WeeklyText {
  title: string;
  body: string;
  modelVersion: string;
  usage?: AiCallUsage;
}

/** Template determinístico (fallback): usa só os números dos facts, sempre correto. */
export function weeklyTemplate(f: WeeklyFacts): WeeklyText {
  const frases: string[] = [];

  if (f.cashNowCents !== null && f.cashPrevCents !== null) {
    const subiu = f.cashNowCents >= f.cashPrevCents;
    frases.push(
      `Seu caixa ${subiu ? 'melhorou' : 'apertou'} e está em ${formatCentsBRL(f.cashNowCents)}.`,
    );
  }
  if (f.cashCycleNow !== null && f.cashCyclePrev !== null && f.cashCycleNow !== f.cashCyclePrev) {
    const piorou = f.cashCycleNow > f.cashCyclePrev;
    frases.push(
      `O dinheiro está ${piorou ? 'ficando mais tempo' : 'ficando menos tempo'} preso entre vender e receber.`,
    );
  }
  if (f.revenueNowCents !== null && f.revenuePrevCents !== null) {
    const cresceu = f.revenueNowCents >= f.revenuePrevCents;
    frases.push(`A receita ${cresceu ? 'cresceu' : 'caiu'} em relação ao período anterior.`);
  }

  const body = frases.slice(0, 3).join(' ') || 'Seus números seguem estáveis nesta semana.';
  return { title: 'Sua semana', body, modelVersion: WEEKLY_TEMPLATE_VERSION };
}

const SYSTEM_PROMPT = `Você é a voz do Pulso, o assistente financeiro de pequenas empresas brasileiras. Você escreve o RESUMO DA SEMANA para o DONO do negócio.

Você recebe os números JÁ CALCULADOS de dois momentos (agora e o período anterior). Seu trabalho é redigir o que mudou.

REGRAS INEGOCIÁVEIS:
1. Use APENAS números presentes nos fatos. Pode FORMATAR (centavos como reais, dias, percentual). Não invente.
2. NÃO recalcule.
3. Português do Brasil, tom de conversa, SEM jargão.
4. NO MÁXIMO 3 frases: o que mudou (caixa, ciclo, receita) e o que observar. Sem alarmismo.
5. "title" curto (ex.: "Sua semana").

Responda com o JSON { "title": ..., "body": ... }.`;

export function buildWeeklyPrompt(facts: WeeklyFacts, profile: CompanyProfile): AlertPrompt {
  return {
    system: SYSTEM_PROMPT,
    user: JSON.stringify({ fatos: facts, empresa: { nome: profile.name, nicho: profile.niche } }),
  };
}

export async function writeWeekly(
  model: AlertWriterModel | null,
  facts: WeeklyFacts,
  profile: CompanyProfile,
  onUsage?: UsageSink,
): Promise<WeeklyText> {
  const fallback = weeklyTemplate(facts);
  if (!model) return fallback;

  const prompt = buildWeeklyPrompt(facts, profile);
  for (let attempt = 0; attempt < 2; attempt++) {
    let out;
    try {
      out = await model.write(prompt);
    } catch {
      return fallback;
    }
    if (out.usage) onUsage?.(out.usage);
    const grounded = checkGroundingDeep(`${out.title}\n${out.body}`, facts);
    if (grounded.ok) {
      return { title: out.title, body: out.body, modelVersion: out.modelVersion, usage: out.usage };
    }
  }
  return fallback;
}
