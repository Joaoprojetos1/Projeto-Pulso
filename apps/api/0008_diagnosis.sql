-- Diagnóstico do "momento" da empresa, gravado junto de cada snapshot.
--
-- O core (packages/core/diagnosis.ts) devolve { stage, facts, drivers,
-- transitions }; a API acrescenta o texto redigido (voz do Pulso) e guarda tudo
-- aqui. Fica no snapshot para o dashboard ler e para o histórico alimentar as
-- premissas que dependem de períodos anteriores (P3 tesoura, P4 ciclo, P5 margem).

ALTER TABLE indicator_snapshots ADD COLUMN diagnosis JSONB;
