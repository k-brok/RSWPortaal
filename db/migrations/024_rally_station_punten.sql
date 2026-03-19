-- 024_rally_station_punten.sql
-- Voegt aankomstpunten toe per station (jury_subkamp_tokens) zodat elk station
-- een eigen puntwaarde kan hebben i.p.v. één globale waarde per moment.

ALTER TABLE jury_subkamp_tokens
  ADD COLUMN aankomst_punten INT NOT NULL DEFAULT 0 AFTER token;
