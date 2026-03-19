-- 015_editie_inschrijving_data.sql — Startdata voor inschrijvingsfasen
-- Koppeling aan het programma-systeem: openingsdatum wordt zichtbaar op de programmapagina

ALTER TABLE edities
  ADD COLUMN voorinschrijving_start DATE NULL AFTER voorinschrijving_open,
  ADD COLUMN inschrijving_start     DATE NULL AFTER inschrijving_open;
