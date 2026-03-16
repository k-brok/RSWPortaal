-- 003_vereniging_afkorting.sql — Voeg afkorting toe aan verenigingen

ALTER TABLE verenigingen
  ADD COLUMN afkorting VARCHAR(10) NOT NULL DEFAULT '' AFTER naam;
