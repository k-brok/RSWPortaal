-- 020_vacatures_benodigd.sql — Voeg benodigd-aantal toe aan vacatures

ALTER TABLE vrijwilliger_vacatures
  ADD COLUMN benodigd INT NULL AFTER max_vrijwilligers;
-- benodigd: minimum aantal vrijwilligers dat gewenst is voor deze vacature
-- Geeft "Nog X benodigd!" label als bezet < benodigd
