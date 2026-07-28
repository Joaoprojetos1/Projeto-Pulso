import { describe, expect, it } from 'vitest';

import { computeAll } from '../indicators';
import { evaluate } from '../rules';
import { op, snapshot } from '../testkit';
import { getSegment, listSegments, segmentCoverage, segmentRules } from './index';

// Atalhos de leitura
const ind = (snap: Parameters<typeof computeAll>[0]) => computeAll(snap);
const alerts = (snap: Parameters<typeof computeAll>[0]) => evaluate(computeAll(snap), segmentRules(snap.niche));
const alert = (snap: Parameters<typeof computeAll>[0], ruleKey: string) => alerts(snap).find((a) => a.ruleKey === ruleKey);

describe('composição núcleo + segmento', () => {
  it('empresa sem segmento roda só o núcleo (nenhum indicador de segmento)', () => {
    const set = ind(snapshot({ asOf: '2026-06-30' }));
    expect(Object.keys(set).some((k) => k.startsWith('clinica_') || k.startsWith('varejo_') || k.startsWith('restaurante_'))).toBe(false);
    // os universais continuam presentes e intocados
    expect(set.cash_projection).toBeDefined();
    expect(set.pmr).toBeDefined();
  });

  it('clínica sem números do mês: indicadores de segmento presentes, sem valor e com campo faltante', () => {
    const set = ind(snapshot({ asOf: '2026-06-30', niche: 'clinica' }));
    expect(set.clinica_taxa_glosa).toBeDefined();
    expect(set.clinica_taxa_glosa!.value).toBeNull();
    expect(set.clinica_taxa_glosa!.missing?.fields).toContain('convenio_faturamento_bruto');
  });

  it('os 3 segmentos estão registrados', () => {
    expect(listSegments().map((s) => s.id).sort()).toEqual(['clinica', 'restaurante', 'varejo']);
    expect(getSegment('padaria')).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// O TESTE QUE IMPORTA: janela real, nunca "ano cheio" com dado parcial.
// -----------------------------------------------------------------------------
describe('anualização usa a JANELA REAL (erro conhecido da planilha)', () => {
  it('clínica, 1 mês preenchido: PMR de convênio usa 30 dias, não 365 (não infla ~12x)', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'clinica',
      monthlyOps: [
        op('2026-06', 'convenio_faturamento_bruto', 10_000_000), // R$ 100.000
        op('2026-06', 'convenio_glosas', 1_000_000), // R$ 10.000 → receita convênio R$ 90.000
        op('2026-06', 'convenio_a_receber', 15_000_000), // R$ 150.000 a receber
      ],
    });
    const pmr = computeAll(snap).clinica_pmr_convenio!;
    // 150.000 ÷ (90.000 ÷ 30 dias) = 50 dias
    expect(pmr.value).toBe(50);
    expect(pmr.inputs.monthsCount).toBe(1);
    expect(pmr.inputs.diasPeriodo).toBe(30);
    // a leitura errada (ano cheio: ×365/30) daria ~608 dias — o motor NÃO faz isso
    expect(pmr.value).toBeLessThan(100);
  });

  it('varejo, 1 mês preenchido: giro anualiza ×12 pela janela real (não assume 12 meses de dado)', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'varejo',
      monthlyOps: [
        op('2026-06', 'cmv', 6_000_000), // R$ 60.000 de CMV no mês
        op('2026-06', 'estoque_final', 12_000_000), // R$ 120.000 em estoque
      ],
    });
    const giro = computeAll(snap).varejo_giro_estoque!;
    // CMV anual = 60.000 × 12 = 720.000; giro = 720.000 ÷ 120.000 = 6x
    expect(giro.value).toBe(6);
    expect(giro.inputs.monthsCount).toBe(1);
  });

  it('varejo, 2 meses: mesma taxa mensal dá o MESMO giro (a janela real se ajusta)', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'varejo',
      monthlyOps: [
        op('2026-05', 'cmv', 6_000_000),
        op('2026-06', 'cmv', 6_000_000),
        op('2026-06', 'estoque_final', 12_000_000),
      ],
    });
    const giro = computeAll(snap).varejo_giro_estoque!;
    expect(giro.value).toBe(6);
    expect(giro.inputs.monthsCount).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// Indicadores por segmento (valores e nulos estruturados)
// -----------------------------------------------------------------------------
describe('clínica', () => {
  const base = () =>
    snapshot({
      asOf: '2026-06-30',
      niche: 'clinica',
      monthlyOps: [
        op('2026-06', 'convenio_faturamento_bruto', 10_000_000),
        op('2026-06', 'convenio_glosas', 2_000_000), // 20% de glosa
        op('2026-06', 'convenio_atendimentos', 400),
        op('2026-06', 'particular_receita', 3_000_000),
        op('2026-06', 'particular_atendimentos', 100),
        op('2026-06', 'agenda_horas_disponiveis', 200),
        op('2026-06', 'agenda_horas_ocupadas', 80), // 40% ocupação
        op('2026-06', 'custo_operacional', 8_000_000),
      ],
    });

  it('taxa de glosa = glosas ÷ faturamento bruto', () => {
    expect(computeAll(base()).clinica_taxa_glosa!.value).toBeCloseTo(0.2, 5);
  });

  it('ticket de convênio e particular', () => {
    const set = computeAll(base());
    // receita convênio = 8.000.000 ÷ 400 = 20.000 cents
    expect(set.clinica_ticket_convenio!.value).toBe(20_000);
    // particular = 3.000.000 ÷ 100 = 30.000 cents
    expect(set.clinica_ticket_particular!.value).toBe(30_000);
  });

  it('glosa ≥ 15% dispara warn; ≥ 25% dispara critical', () => {
    expect(alert(base(), 'clinica_glosa_alta')?.severity).toBe('warn');
    const alto = snapshot({
      asOf: '2026-06-30',
      niche: 'clinica',
      monthlyOps: [op('2026-06', 'convenio_faturamento_bruto', 10_000_000), op('2026-06', 'convenio_glosas', 3_000_000)],
    });
    expect(alert(alto, 'clinica_glosa_alta')?.severity).toBe('critical');
  });

  it('ocupação abaixo de 50% dispara alerta', () => {
    expect(alert(base(), 'clinica_ocupacao_baixa')?.severity).toBe('warn');
  });

  it('prazo de convênio piorando 20%+ vs. a própria média dispara alerta', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'clinica',
      monthlyOps: [
        // meses estáveis (~50 dias) e o último dispara (~100 dias)
        op('2026-03', 'convenio_faturamento_bruto', 10_000_000), op('2026-03', 'convenio_glosas', 1_000_000), op('2026-03', 'convenio_a_receber', 15_000_000),
        op('2026-04', 'convenio_faturamento_bruto', 10_000_000), op('2026-04', 'convenio_glosas', 1_000_000), op('2026-04', 'convenio_a_receber', 15_000_000),
        op('2026-05', 'convenio_faturamento_bruto', 10_000_000), op('2026-05', 'convenio_glosas', 1_000_000), op('2026-05', 'convenio_a_receber', 15_000_000),
        op('2026-06', 'convenio_faturamento_bruto', 10_000_000), op('2026-06', 'convenio_glosas', 1_000_000), op('2026-06', 'convenio_a_receber', 30_000_000),
      ],
    });
    expect(alert(snap, 'clinica_convenio_prazo_piorando')?.severity).toBe('warn');
  });
});

describe('varejo', () => {
  it('margem bruta = (receita líquida − CMV) ÷ receita líquida', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'varejo',
      monthlyOps: [op('2026-06', 'receita_bruta', 10_000_000), op('2026-06', 'devolucoes', 0), op('2026-06', 'cmv', 5_500_000)],
    });
    expect(computeAll(snap).varejo_margem_bruta!.value).toBeCloseTo(0.45, 5);
    // margem < 40% → alerta
    expect(alert(snap, 'varejo_margem_baixa')).toBeUndefined();
  });

  it('giro < 2 e devoluções > 8% disparam alertas', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'varejo',
      monthlyOps: [
        op('2026-06', 'cmv', 1_000_000),
        op('2026-06', 'estoque_final', 12_000_000), // giro = 12/12 = 1x < 2
        op('2026-06', 'receita_bruta', 10_000_000),
        op('2026-06', 'devolucoes', 1_000_000), // 10% > 8%
      ],
    });
    expect(alert(snap, 'varejo_giro_baixo')?.severity).toBe('warn');
    expect(alert(snap, 'varejo_devolucoes_altas')?.severity).toBe('warn');
  });
});

describe('restaurante', () => {
  it('CMV ≥ 35% warn, ≥ 45% crítico', () => {
    const warn = snapshot({ asOf: '2026-06-30', niche: 'restaurante', monthlyOps: [op('2026-06', 'insumos', 4_000_000), op('2026-06', 'receita_liquida', 10_000_000)] });
    expect(alert(warn, 'restaurante_cmv_alto')?.severity).toBe('warn');
    const crit = snapshot({ asOf: '2026-06-30', niche: 'restaurante', monthlyOps: [op('2026-06', 'insumos', 4_600_000), op('2026-06', 'receita_liquida', 10_000_000)] });
    expect(alert(crit, 'restaurante_cmv_alto')?.severity).toBe('critical');
  });

  it('dependência de delivery só dispara com delivery > 60% E margem operacional caindo', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'restaurante',
      monthlyOps: [
        op('2026-05', 'receita_liquida', 10_000_000), op('2026-05', 'insumos', 3_000_000), op('2026-05', 'custo_operacional', 5_000_000), // margem 0,20
        op('2026-06', 'receita_liquida', 10_000_000), op('2026-06', 'insumos', 3_500_000), op('2026-06', 'custo_operacional', 5_000_000), // margem 0,15 (caindo)
        op('2026-06', 'faturamento_delivery', 7_000_000), // 70% da receita
      ],
    });
    expect(alert(snap, 'restaurante_dependencia_delivery')?.severity).toBe('warn');
  });

  it('delivery alto mas margem estável NÃO dispara', () => {
    const snap = snapshot({
      asOf: '2026-06-30',
      niche: 'restaurante',
      monthlyOps: [
        op('2026-05', 'receita_liquida', 10_000_000), op('2026-05', 'insumos', 3_000_000), op('2026-05', 'custo_operacional', 5_000_000),
        op('2026-06', 'receita_liquida', 10_000_000), op('2026-06', 'insumos', 3_000_000), op('2026-06', 'custo_operacional', 5_000_000), // margem igual
        op('2026-06', 'faturamento_delivery', 7_000_000),
      ],
    });
    expect(alert(snap, 'restaurante_dependencia_delivery')).toBeUndefined();
  });
});

describe('cobertura de segmento', () => {
  it('sem números do mês, tudo bloqueado; com os campos, completo', () => {
    const vazio = segmentCoverage('clinica', new Set());
    expect(vazio.every((c) => c.status === 'blocked')).toBe(true);
    const glosaOk = segmentCoverage('clinica', new Set(['convenio_faturamento_bruto', 'convenio_glosas']));
    expect(glosaOk.find((c) => c.key === 'clinica_taxa_glosa')!.status).toBe('complete');
  });
});
