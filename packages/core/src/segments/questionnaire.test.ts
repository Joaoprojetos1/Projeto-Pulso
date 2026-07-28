import { describe, expect, it } from 'vitest';

import { questionnaireFor, scoreSurvey, type SurveyAnswer, type SurveyAnswerValue } from './questionnaire';

const answerAll = (niche: string, value: SurveyAnswerValue, on = '2026-06-30'): SurveyAnswer[] =>
  questionnaireFor(niche).map((q) => ({ questionId: q.id, value, answeredOn: on }));

describe('questionário de gestão', () => {
  it('cada segmento tem 15 perguntas (13 base + 2 específicas)', () => {
    for (const n of ['clinica', 'varejo', 'restaurante']) {
      expect(questionnaireFor(n)).toHaveLength(15);
    }
    // sem segmento, só a base
    expect(questionnaireFor(undefined)).toHaveLength(13);
  });

  it('tudo "sim" = 100; tudo "não" = 0', () => {
    expect(scoreSurvey('clinica', answerAll('clinica', 'sim')).overall).toBe(100);
    expect(scoreSurvey('clinica', answerAll('clinica', 'nao')).overall).toBe(0);
  });

  it('"parcial" vale meio ponto', () => {
    expect(scoreSurvey('varejo', answerAll('varejo', 'parcial')).overall).toBe(50);
  });

  it('só conta o que foi respondido; blocos sem resposta ficam nulos', () => {
    const r = scoreSurvey('clinica', [{ questionId: 'est_conta_separada', value: 'sim', answeredOn: '2026-06-30' }]);
    expect(r.answeredCount).toBe(1);
    expect(r.overall).toBe(100);
    expect(r.blocks.find((b) => b.block === 'estrutura')!.answered).toBe(1);
    expect(r.blocks.find((b) => b.block === 'caixa')!.score).toBeNull();
  });

  it('aponta os 2 blocos mais frágeis e as perguntas respondidas "não" neles', () => {
    // tudo "sim", menos o bloco caixa todo "não"
    const answers = questionnaireFor('clinica').map((q) => ({
      questionId: q.id,
      value: (q.block === 'caixa' ? 'nao' : 'sim') as SurveyAnswerValue,
      answeredOn: '2026-06-30',
    }));
    const r = scoreSurvey('clinica', answers);
    expect(r.blocks.find((b) => b.block === 'caixa')!.score).toBe(0);
    expect(r.weakest[0]!.block).toBe('caixa');
    expect(r.weakest).toHaveLength(2);
    // as lacunas apontam as perguntas de caixa respondidas "não"
    expect(r.weakestGaps.some((g) => g.questionId === 'cx_reserva')).toBe(true);
    expect(r.answeredOn).toBe('2026-06-30');
  });

  it('usa a resposta mais recente por pergunta (regravação idempotente)', () => {
    const r = scoreSurvey('varejo', [
      { questionId: 'cx_reserva', value: 'nao', answeredOn: '2026-05-01' },
      { questionId: 'cx_reserva', value: 'sim', answeredOn: '2026-06-01' },
    ]);
    expect(r.overall).toBe(100);
    expect(r.answeredOn).toBe('2026-06-01');
  });

  it('ignora respostas de perguntas fora do questionário do segmento', () => {
    const r = scoreSurvey('varejo', [{ questionId: 'clinica_glosa', value: 'sim', answeredOn: '2026-06-30' }]);
    expect(r.answeredCount).toBe(0);
  });
});
