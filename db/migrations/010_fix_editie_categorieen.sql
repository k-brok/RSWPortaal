-- 010_fix_editie_categorieen.sql
-- Voegt ontbrekende kolommen toe aan editie_categorieen (indien nog niet aanwezig)

ALTER TABLE editie_categorieen
  ADD COLUMN IF NOT EXISTS omschrijving TEXT AFTER naam,
  ADD COLUMN IF NOT EXISTS wegingspercentage DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER omschrijving,
  ADD COLUMN IF NOT EXISTS volgorde INT NOT NULL DEFAULT 0 AFTER wegingspercentage,
  ADD COLUMN IF NOT EXISTS aangemaakt_op TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER volgorde;

CREATE TABLE IF NOT EXISTS jurymomenten (
  id INT AUTO_INCREMENT PRIMARY KEY,
  editie_id INT NOT NULL,
  categorie_id INT NOT NULL,
  naam VARCHAR(100),
  start_tijd DATETIME NOT NULL,
  eind_tijd DATETIME NOT NULL,
  handmatig_open TINYINT(1) NOT NULL DEFAULT 0,
  jureer_modus ENUM('numeriek','binair') NOT NULL DEFAULT 'numeriek',
  gepubliceerd TINYINT(1) NOT NULL DEFAULT 0,
  aangemaakt_op TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (editie_id) REFERENCES edities(id) ON DELETE CASCADE,
  FOREIGN KEY (categorie_id) REFERENCES editie_categorieen(id)
);

CREATE TABLE IF NOT EXISTS jury_subkamp_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jurymoment_id INT NOT NULL,
  subkamp_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  UNIQUE KEY uniq_token (token),
  UNIQUE KEY uniq_moment_sub (jurymoment_id, subkamp_id),
  FOREIGN KEY (jurymoment_id) REFERENCES jurymomenten(id) ON DELETE CASCADE,
  FOREIGN KEY (subkamp_id) REFERENCES subkampen(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jury_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jurymoment_id INT NOT NULL,
  subkamp_id INT NOT NULL,
  patrouille_id INT NOT NULL,
  criterium_id INT NOT NULL,
  score DECIMAL(8,2) NOT NULL DEFAULT 0,
  bijgewerkt_op TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_score (jurymoment_id, subkamp_id, patrouille_id, criterium_id),
  FOREIGN KEY (jurymoment_id) REFERENCES jurymomenten(id) ON DELETE CASCADE,
  FOREIGN KEY (criterium_id) REFERENCES editie_criteria(id) ON DELETE CASCADE
);
