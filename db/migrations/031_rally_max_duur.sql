-- 031_rally_max_duur.sql
-- Maximale tijdsduur per patrouille voor tocht-type rally's.
-- Timer start bij de eerste scan (startpost). Na afloop worden scans geweigerd.

ALTER TABLE jurymomenten
  ADD COLUMN max_duur_minuten INT NULL DEFAULT NULL;
