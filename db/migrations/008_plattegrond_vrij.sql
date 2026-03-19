-- 008_plattegrond_vrij.sql — Vrije cel-plaatsing, snap-raster, schaal en opacity

ALTER TABLE plattegronden
  ADD COLUMN breedte      INT           NOT NULL DEFAULT 900  AFTER cel_grootte,
  ADD COLUMN hoogte       INT           NOT NULL DEFAULT 600  AFTER breedte,
  ADD COLUMN snap_grootte INT           NOT NULL DEFAULT 20   AFTER hoogte,
  ADD COLUMN schaal_meter DECIMAL(8,2)  NULL                  AFTER snap_grootte,
  ADD COLUMN bg_opacity   DECIMAL(3,2)  NOT NULL DEFAULT 0.65 AFTER schaal_meter;
