-- Segmentos: números do mês + diagnóstico de gestão.
--
-- Os indicadores de segmento (clínica, varejo, restaurante) dependem de dados
-- que NÃO são lançamentos: glosa, CMV, estoque, atendimentos, horas de agenda.
-- Em vez de uma coluna por métrica (o schema incharia a cada segmento novo),
-- guardamos pares campo/valor: uma categoria (`field`, slug do campo do
-- segmento) + um valor numérico inteiro (`value_num`), que é centavos, contagem
-- OU horas conforme o campo declara no core (packages/core/segments).

CREATE TABLE monthly_operations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ref_month    DATE NOT NULL,            -- primeiro dia do mês de referência (YYYY-MM-01)
  segment      TEXT NOT NULL,            -- 'clinica' | 'varejo' | 'restaurante'
  field        TEXT NOT NULL,            -- slug do campo do segmento (ex.: 'convenio_glosas')
  value_num    BIGINT NOT NULL,          -- centavos, contagem ou horas — conforme o campo
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ref_month, field)  -- um valor por campo por mês (upsert)
);

CREATE INDEX monthly_ops_company_month ON monthly_operations (company_id, ref_month);

-- ---------------------------------------------------------------
-- Diagnóstico de gestão (o checklist do especialista). As respostas ficam
-- datadas; a pontuação é 100% determinística no core (segments/questionnaire.ts)
-- e a devolutiva é redigida pelo writer a partir dos facts.
-- ---------------------------------------------------------------
CREATE TABLE management_survey_answers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,            -- id da pergunta no core
  answer       TEXT NOT NULL CHECK (answer IN ('sim', 'parcial', 'nao')),
  answered_on  DATE NOT NULL,            -- data da resposta
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, question_id)       -- última resposta por pergunta (upsert)
);

CREATE INDEX survey_company ON management_survey_answers (company_id);
