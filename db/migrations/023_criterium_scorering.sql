-- 023_criterium_scorering.sql — Scoreringstransformatie per criterium
-- Voegt invoertype, richting, scoreringsmethode en configuratie toe aan editie_criteria.

ALTER TABLE editie_criteria
  ADD COLUMN invoer_type       ENUM('getal','tijdmeting','checkbox','tekst') NOT NULL DEFAULT 'getal'     AFTER omschrijving,
  ADD COLUMN min_score         DECIMAL(10,3) NOT NULL DEFAULT 0                                           AFTER max_score,
  ADD COLUMN lager_is_beter    TINYINT(1)    NOT NULL DEFAULT 0                                           AFTER min_score,
  ADD COLUMN scorerings_methode ENUM('direct','drempelwaarden','groepen','normalisatie') NOT NULL DEFAULT 'direct' AFTER lager_is_beter,
  ADD COLUMN scorerings_config  JSON          NULL                                                         AFTER scorerings_methode;

-- Kopieer ook naar template_criteria voor consistentie
ALTER TABLE template_criteria
  ADD COLUMN invoer_type        ENUM('getal','tijdmeting','checkbox','tekst') NOT NULL DEFAULT 'getal'     AFTER omschrijving,
  ADD COLUMN min_score          DECIMAL(10,3) NOT NULL DEFAULT 0                                           AFTER max_score,
  ADD COLUMN lager_is_beter     TINYINT(1)    NOT NULL DEFAULT 0                                           AFTER min_score,
  ADD COLUMN scorerings_methode ENUM('direct','drempelwaarden','groepen','normalisatie') NOT NULL DEFAULT 'direct' AFTER lager_is_beter,
  ADD COLUMN scorerings_config  JSON          NULL                                                         AFTER scorerings_methode;
