/**
 * A voz do Pulso para o DIAGNÓSTICO (o "momento" da empresa).
 *
 * Mesmas regras duras da voz dos alertas: o modelo recebe o estágio JÁ DECIDIDO
 * pelo core + os fatos que o sustentam (drivers) e só REDIGE em linguagem de
 * dono. Não reclassifica, não inventa número. O fiscal (grounding) confere: um
 * número fora dos fatos reprova o texto. Se falhar/inventar, entra o template
 * determinístico por estágio (sempre correto, sem número).
 *
 * Reaproveita o AlertWriterModel (mesmo structured output { title, body }).
 */

import type { Diagnosis, DiagnosisStage } from '@pulso/core';

import { checkGroundingDeep } from './grounding';
import type { AiCallUsage, UsageSink } from './usage';
import type { AlertPrompt, AlertWriterModel, CompanyProfile } from './writer';

export const DIAGNOSIS_TEMPLATE_VERSION = 'diagnosis-template-v1';

export interface DiagnosisText {
  title: string;
  body: string;
  modelVersion: string;
  usage?: AiCallUsage;
}

/** Template por estágio — sem números, então nunca depende do fiscal. */
const TEMPLATE: Record<DiagnosisStage, { title: string; body: string }> = {
  saudavel: {
    title: 'Tudo sob controle',
    body: 'Seus números estão saudáveis e nada pede ação agora. Siga registrando seus movimentos que o Pulso continua de olho.',
  },
  atencao: {
    title: 'Vale um olhar',
    body: 'Apareceu um ponto de atenção nos seus números. Nada urgente, mas é melhor acompanhar de perto a partir de agora.',
  },
  pressao: {
    title: 'Seu caixa está sob pressão',
    body: 'Alguns sinais juntos estão apertando o seu caixa. Dá para agir com calma agora, antes que isso vire urgência.',
  },
  critico: {
    title: 'Situação crítica no caixa',
    body: 'O caixa está em rota de aperto sério e o tempo para reagir é curto. Priorize renegociar prazos e antecipar recebimentos.',
  },
  uti: {
    title: 'Seu caixa está em emergência',
    body: 'O caixa exige ação imediata. Foque no essencial e busque reforço de caixa agora — cada dia conta.',
  },
};

export function diagnosisTemplate(diag: Diagnosis): DiagnosisText {
  return { ...TEMPLATE[diag.stage], modelVersion: DIAGNOSIS_TEMPLATE_VERSION };
}

const SYSTEM_PROMPT = `Você é a voz do Pulso, o assistente financeiro de pequenas empresas brasileiras. Você redige o MOMENTO financeiro para o DONO do negócio — não para um CFO.

Você recebe um diagnóstico JÁ DECIDIDO por regras de código: o "estagio" e os fatos que o sustentam ("porque"). Seu único trabalho é redigir.

REGRAS INEGOCIÁVEIS:
1. Use APENAS números presentes nos fatos. Se um número não está lá, ele não existe para você. Você pode FORMATAR: centavos como reais, proporção como percentual, data como dia por extenso.
2. NÃO recalcule e NÃO reclassifique o estágio — ele já veio decidido.
3. Português do Brasil, tom de conversa, SEM jargão.
4. "body" tem NO MÁXIMO 2 frases, concreto e sem alarmismo vazio.
5. "title" é curto (até 60 caracteres) e diz o momento em linguagem de dono.

Estágios, do melhor ao pior: saudavel, atencao, pressao, critico, uti.

Responda com o JSON { "title": ..., "body": ... }.`;

export function buildDiagnosisPrompt(diag: Diagnosis, profile: CompanyProfile): AlertPrompt {
  return {
    system: SYSTEM_PROMPT,
    user: JSON.stringify({
      estagio: diag.stage,
      porque: diag.drivers.map((d) => ({ premissa: d.premissa, fatos: d.facts })),
      transicao: diag.transitions,
      empresa: { nome: profile.name, nicho: profile.niche },
    }),
  };
}

/** Números permitidos no texto: os fatos do diagnóstico + os dos drivers. */
function groundingContext(diag: Diagnosis): unknown {
  return { facts: diag.facts, drivers: diag.drivers.map((d) => d.facts) };
}

export async function writeDiagnosis(
  model: AlertWriterModel | null,
  diag: Diagnosis,
  profile: CompanyProfile,
  onUsage?: UsageSink,
): Promise<DiagnosisText> {
  const fallback = diagnosisTemplate(diag);
  if (!model) return fallback;

  const prompt = buildDiagnosisPrompt(diag, profile);
  const ctx = groundingContext(diag);

  for (let attempt = 0; attempt < 2; attempt++) {
    let out;
    try {
      out = await model.write(prompt);
    } catch {
      return fallback;
    }
    if (out.usage) onUsage?.(out.usage);

    const grounded = checkGroundingDeep(`${out.title}\n${out.body}`, ctx);
    if (grounded.ok) {
      return { title: out.title, body: out.body, modelVersion: out.modelVersion, usage: out.usage };
    }
  }

  return fallback;
}
