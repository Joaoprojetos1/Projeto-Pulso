-- Referencia de mercado por segmento (item 3.6). A IA pesquisa a media do setor,
-- CITA a fonte e reatualiza; aqui fica o resultado VALIDADO. E uma caixa separada
-- dos numeros calculados do caixa (regra de ouro): so referencia externa, com fonte.
-- Uma linha por (segmento, indicador). typical_value na MESMA unidade do indicador.
CREATE TABLE IF NOT EXISTS market_benchmarks (
  segment       TEXT NOT NULL,
  indicator_key TEXT NOT NULL,
  typical_value DOUBLE PRECISION NOT NULL,
  range_min     DOUBLE PRECISION,
  range_max     DOUBLE PRECISION,
  direction     TEXT NOT NULL,        -- higher_is_better | lower_is_better | neutral
  source        TEXT NOT NULL,        -- de onde a IA tirou (a tela da credito)
  as_of_month   TEXT,                 -- 'YYYY-MM' de quando foi apurado
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (segment, indicator_key)
);
