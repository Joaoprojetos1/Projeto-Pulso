/**
 * Gera docs/DADOS-NECESSARIOS.md a partir das declarações de requirements.ts /
 * sources.ts. Rode com:  npx tsx scripts/gen-dados-necessarios.ts
 *
 * O documento é para o ESPECIALISTA DE NEGÓCIO (reuniões com clientes e ERPs),
 * não para o desenvolvedor: só linguagem de negócio, nenhum nome de variável.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANONICAL_FIELDS,
  effectiveRequirement,
  indicatorRequirements,
  type CanonicalField,
} from '../src/requirements';
import { indicatorsNeedingClientSystem } from '../src/coverage';
import { fieldsRequiringClientSystem, getSource, sourcesForField } from '../src/sources';

const label = (f: CanonicalField): string => CANONICAL_FIELDS[f].label;
const sourceLabels = (f: CanonicalField): string =>
  sourcesForField(f)
    .map((id) => getSource(id)?.label ?? id)
    .join('; ') || '—';

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function requiredDescription(key: string): string {
  const eff = effectiveRequirement(key);
  const parts: string[] = eff.required.map(label);
  if (eff.anyOf.length > 0) {
    const groups = eff.anyOf.map((g) => g.map(label).join(' + '));
    parts.push(`pelo menos uma via: ${groups.join(' OU ')}`);
  }
  return parts.length ? parts.map((p) => `• ${p}`).join('<br>') : '—';
}

function whenMissingDescription(key: string): string {
  const req = indicatorRequirements().find((r) => r.key === key);
  const notes = Object.values(req?.whenMissing ?? {}).filter(Boolean) as string[];
  return notes.length ? notes.map((n) => `• ${n}`).join('<br>') : 'Sem dado, o número fica indisponível.';
}

function optionalDescription(key: string): string {
  const eff = effectiveRequirement(key);
  return eff.optional.length ? eff.optional.map((f) => `• ${label(f)}`).join('<br>') : '—';
}

// ---------------------------------------------------------------
// Montagem do documento
// ---------------------------------------------------------------

const lines: string[] = [];
const p = (s = '') => lines.push(s);

p('# Dados necessários para os indicadores do Pulso');
p();
p('> Documento gerado automaticamente das regras do motor. Não editar à mão: rode');
p('> `npx tsx scripts/gen-dados-necessarios.ts` no pacote `packages/core`.');
p();
p(
  'Este material é para as conversas com clientes e com fornecedores de sistema de gestão (ERP). ' +
    'Ele mostra, em linguagem de negócio, o que cada número precisa e onde essa informação costuma existir. ' +
    'Regra de ouro do Pulso: **o número é sempre calculado por código auditado — a inteligência artificial só ' +
    'transforma o resultado em texto, nunca inventa um valor.**',
);
p();

// ---- Tabela 1: por indicador ----
p('## 1. Por indicador');
p();
p('| Indicador | O que responde ao dono | Informações que exige | O que melhora a precisão | O que acontece quando falta |');
p('| --- | --- | --- | --- | --- |');
for (const req of indicatorRequirements()) {
  p(
    `| **${cell(nomeIndicador(req.key))}** | ${cell(req.question)} | ${cell(requiredDescription(req.key))} | ${cell(
      optionalDescription(req.key),
    )} | ${cell(whenMissingDescription(req.key))} |`,
  );
}
p();

// ---- Tabela 2: por informação ----
p('## 2. Por informação');
p();
p('Cada dado que o motor usa, quais indicadores dependem dele e em quais fontes ele costuma existir.');
p();
p('| Informação | Indicadores que dependem | Onde costuma existir |');
p('| --- | --- | --- |');
for (const field of Object.keys(CANONICAL_FIELDS) as CanonicalField[]) {
  const dependents = indicatorRequirements()
    .filter((r) => {
      const eff = effectiveRequirement(r.key);
      return eff.required.includes(field) || eff.anyOf.some((g) => g.includes(field));
    })
    .map((r) => nomeIndicador(r.key));
  p(`| **${cell(label(field))}** | ${cell(dependents.join('; ') || '—')} | ${cell(sourceLabels(field))} |`);
}
p();

// ---- Seção final: o que nenhuma fonte automática cobre ----
p('## 3. O que nenhuma fonte automática cobre hoje');
p();
p(
  'Estas informações não vêm de nenhuma fonte ampla (extrato, maquininha, nota fiscal, Open Finance). ' +
    'Elas só existem no sistema de gestão do próprio cliente ou na declaração do dono — e por isso vão ' +
    'exigir **integração dedicada com o sistema do cliente** para o Pulso escalar sem depender de digitação.',
);
p();
for (const field of fieldsRequiringClientSystem()) {
  p(`- **${label(field)}** — ${CANONICAL_FIELDS[field].description}`);
}
p();

const gaps = indicatorRequirements().flatMap((r) => (r.gaps ?? []).map((g) => ({ key: r.key, g })));
if (gaps.length > 0) {
  p('### Lacunas de cadastro (dado que ainda não existe no modelo)');
  p();
  for (const { key, g } of gaps) {
    p(`- **${nomeIndicador(key)}:** ${g.note}${g.context ? ` _(${g.context})_` : ''}`);
  }
  p();
}

const dep = indicatorsNeedingClientSystem();
p(
  `> Hoje, **${dep.count} indicadores** dependem de alguma informação que nenhuma fonte automática ampla ` +
    'fornece, listados acima. São os que mais se beneficiam de integrar o sistema de gestão do cliente.',
);
p();

// ---------------------------------------------------------------
// Nomes de negócio dos indicadores (o `key` do código nunca aparece no doc)
// ---------------------------------------------------------------
function nomeIndicador(key: string): string {
  const nomes: Record<string, string> = {
    cash_balance: 'Saldo em caixa',
    cash_projection: 'Projeção de caixa (30/60/90 dias)',
    pmr: 'Prazo médio de recebimento',
    pmp: 'Prazo médio de pagamento',
    cash_cycle: 'Ciclo de caixa',
    ncg: 'Necessidade de capital de giro',
    revenue_current: 'Faturamento do período',
    revenue_previous: 'Faturamento do período anterior',
    contribution_margin: 'Margem de contribuição',
    fixed_cost_monthly: 'Custo fixo mensal',
    customer_concentration: 'Concentração de clientes',
    break_even_revenue: 'Ponto de equilíbrio',
    delinquency_rate: 'Inadimplência da carteira',
  };
  return nomes[key] ?? key;
}

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../../../docs/DADOS-NECESSARIOS.md');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join('\n'), 'utf8');
// eslint-disable-next-line no-console
console.log(`Documento gerado em ${outPath} (${lines.length} linhas).`);
