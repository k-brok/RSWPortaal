-- 011_plattegrond_def_cel.sql
-- Sla de standaard celafmeting (in raster-eenheden) op per plattegrond

ALTER TABLE plattegronden
  ADD COLUMN def_cel_w INT NOT NULL DEFAULT 3 AFTER snap_grootte,
  ADD COLUMN def_cel_h INT NOT NULL DEFAULT 4 AFTER def_cel_w;
