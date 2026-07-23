-- Resumo da semana, gravado junto do snapshot.
--
-- Quando um snapshot novo é gerado e existe um anterior de >= 5 dias, o writer
-- (modo 'weekly', fiscalizado pelo grounding com os facts dos DOIS snapshots)
-- redige um resumo curto do que mudou. Guardamos aqui, junto do cálculo, com as
-- variações (para o app desenhar as setas) e o texto.

ALTER TABLE indicator_snapshots ADD COLUMN weekly_summary JSONB;
