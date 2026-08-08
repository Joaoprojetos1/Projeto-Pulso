/**
 * O fiscal de JUÍZO — o par do fiscal de números (`grounding`).
 *
 * O grounding confere se os NÚMEROS do texto são verdadeiros. Este confere se a
 * CONCLUSÃO é sustentável: detecta linguagem avaliativa (adjetivos e comparativos
 * de saúde financeira) e reprova o texto quando a afirmação correspondente NÃO
 * está autorizada pela cobertura de dados da empresa (ver `@pulso/core` claims).
 *
 * Reprovou → o writer cai no texto seguro (template ou limitação), exatamente
 * como já acontece com número inventado. A IA nunca decide o que pode afirmar; o
 * catálogo determinístico (core) decide, e este módulo só faz cumprir.
 */

import { CLAIMS, type ClaimPermission, type ClaimType } from '@pulso/core';

/** minúsculas + sem acento, para casar 'saudável' com 'saudavel'. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove marcas de acento
    .toLowerCase();
}

export interface JudgmentResult {
  ok: boolean;
  /** Cada trecho avaliativo pego, com o tipo de afirmação que ele expressa. */
  offending: Array<{ claim: ClaimType; term: string }>;
}

/**
 * Verifica um texto contra as permissões. Para cada afirmação NÃO autorizada,
 * procura no texto os termos avaliativos que a expressariam. Achou → reprova.
 *
 * `permissions` vazio (ou não informado) = sem restrição (retrocompatível: quem
 * ainda não passa permissões segue como antes).
 */
export function checkJudgment(text: string, permissions: ClaimPermission[] = []): JudgmentResult {
  const denied = new Set(permissions.filter((p) => !p.allowed).map((p) => p.type));
  if (denied.size === 0) return { ok: true, offending: [] };

  const t = normalize(text);
  const offending: JudgmentResult['offending'] = [];
  for (const spec of CLAIMS) {
    if (!denied.has(spec.type)) continue;
    for (const term of spec.evaluativeTerms) {
      if (t.includes(normalize(term))) offending.push({ claim: spec.type, term });
    }
  }
  return { ok: offending.length === 0, offending };
}

/**
 * Bloco de instrução para o PROMPT do modelo (item 2): lista explícita do que
 * PODE e do que NÃO PODE ser afirmado. A instrução é dura: sobre o não
 * autorizado, o texto reporta o dado bruto e declara a limitação, NUNCA adjetiva.
 *
 * Retorna string vazia quando não há permissões (nada a acrescentar ao prompt).
 */
export function renderClaimGuidance(permissions: ClaimPermission[] = []): string {
  if (permissions.length === 0) return '';

  const pode = permissions.filter((p) => p.allowed);
  const naoPode = permissions.filter((p) => !p.allowed);

  const linhas: string[] = [
    'AUTORIZAÇÃO DE JUÍZO (o que os dados desta empresa sustentam):',
  ];

  if (pode.length > 0) {
    linhas.push('VOCÊ PODE afirmar (há dado que sustenta):');
    for (const p of pode) linhas.push(`- ${p.label}`);
  }

  if (naoPode.length > 0) {
    linhas.push(
      'VOCÊ NÃO PODE afirmar (dado insuficiente). Sobre estes, reporte só o dado bruto e declare a limitação — NUNCA use adjetivo de estado ("bom", "saudável", "apertado", "preocupante", "estável") nem comparação:',
    );
    for (const p of naoPode) linhas.push(`- ${p.label}: ${p.reason}`);
  }

  return linhas.join('\n');
}
