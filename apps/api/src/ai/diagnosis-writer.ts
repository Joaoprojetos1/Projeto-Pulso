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

import { getClaim, type ClaimPermission, type Diagnosis, type DiagnosisStage } from '@pulso/core';

import { checkGroundingDeep } from './grounding';
import { checkJudgment, renderClaimGuidance } from './judgment';
import type { AiCallUsage, UsageSink } from './usage';
import type { AlertPrompt, AlertWriterModel, CompanyProfile } from './writer';

export const DIAGNOSIS_TEMPLATE_VERSION = 'diagnosis-template-v1';
/** Texto de limitação: quando os dados não autorizam ler a saúde do caixa. */
export const DIAGNOSIS_LIMITATION_VERSION = 'diagnosis-limitation-v1';

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

/**
 * A causa do bug relatado: o core computa um estágio ("saudável") mesmo quando
 * os dados não bastam, e o texto adjetiva. Quando o juízo de saúde do caixa NÃO
 * está autorizado, NÃO adjetivamos o estágio — reportamos a limitação e o que
 * fazer, de forma determinística. É item 2 (nunca adjetivar sem autorização)
 * levado ao próprio "momento" da empresa.
 */
export function diagnosisLimitation(perm: ClaimPermission): DiagnosisText {
  const acao = getClaim('cash_health').action;
  return {
    title: 'Ainda não dá para ler o seu caixa',
    body: `${perm.reason} ${acao}`,
    modelVersion: DIAGNOSIS_LIMITATION_VERSION,
  };
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

export function buildDiagnosisPrompt(
  diag: Diagnosis,
  profile: CompanyProfile,
  permissions: ClaimPermission[] = [],
): AlertPrompt {
  const guidance = renderClaimGuidance(permissions);
  return {
    system: guidance ? `${SYSTEM_PROMPT}\n\n${guidance}` : SYSTEM_PROMPT,
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

export interface DiagnosisWriterLog {
  warn: (obj: unknown, msg?: string) => void;
}

export async function writeDiagnosis(
  model: AlertWriterModel | null,
  diag: Diagnosis,
  profile: CompanyProfile,
  onUsage?: UsageSink,
  permissions: ClaimPermission[] = [],
  log?: DiagnosisWriterLog,
): Promise<DiagnosisText> {
  // O "momento" da empresa É um juízo de saúde do caixa. Se a cobertura não o
  // autoriza, nem a IA nem o template confiante entram: reportamos a limitação.
  const saude = permissions.find((p) => p.type === 'cash_health');
  if (saude && !saude.allowed) return diagnosisLimitation(saude);

  const fallback = diagnosisTemplate(diag);
  if (!model) return fallback;

  const prompt = buildDiagnosisPrompt(diag, profile, permissions);
  const ctx = groundingContext(diag);

  for (let attempt = 0; attempt < 2; attempt++) {
    let out;
    try {
      out = await model.write(prompt);
    } catch {
      return fallback;
    }
    if (out.usage) onUsage?.(out.usage);

    const texto = `${out.title}\n${out.body}`;
    const grounded = checkGroundingDeep(texto, ctx);
    // rede de segurança: mesmo com a saúde autorizada, não deixa a IA comparar
    // períodos ou adjetivar a operação sem cobertura (outros claims).
    const judged = checkJudgment(texto, permissions);
    if (grounded.ok && judged.ok) {
      return { title: out.title, body: out.body, modelVersion: out.modelVersion, usage: out.usage };
    }
    if (!judged.ok) {
      log?.warn(
        { stage: diag.stage, claims: judged.offending.map((o) => o.claim) },
        'diagnóstico da IA reprovado pelo fiscal de juízo; usando texto padrão',
      );
    }
  }

  return fallback;
}
