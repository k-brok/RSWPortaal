-- 016_deelnemers_functie.sql — PL/APL functie per deelnemer

ALTER TABLE deelnemers
  ADD COLUMN functie ENUM('PL', 'APL') NULL AFTER geboortedatum;
