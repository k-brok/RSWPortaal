-- 012_subkamp_jongste.sql
-- Markeer één subkamp per editie als 'jongste subkamp'.
-- Jongste patrouilles (patrouille.jongste = 1) mogen enkel in dit subkamp worden geplaatst.

ALTER TABLE subkampen
  ADD COLUMN IF NOT EXISTS is_jongste TINYINT(1) NOT NULL DEFAULT 0 AFTER vereniging_id;
