-- 026_rally_aankomst_criterium.sql
-- Onderscheid tussen jury-criteria (zichtbaar in formulier) en aankomst-criteria
-- (automatisch gescoord bij aankomst, niet zichtbaar voor station-jury).
--
-- is_aankomst = 1: criterium krijgt bij scan automatisch aankomst_punten als score,
--                  wordt NIET getoond in het scoreformulier op het station.
-- is_aankomst = 0: criterium verschijnt in het scoreformulier voor de jury.

ALTER TABLE rally_station_criteria
  ADD COLUMN is_aankomst TINYINT(1) NOT NULL DEFAULT 0 AFTER aankomst_punten;
