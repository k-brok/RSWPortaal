-- 009_jury_systeem.sql — Jury systeem tabellen

-- Per-editie category snapshot tables
CREATE TABLE IF NOT EXISTS editie_categorieen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  editie_id INT NOT NULL,
  template_id INT NULL,
  naam VARCHAR(100) NOT NULL,
  omschrijving TEXT,
  wegingspercentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  volgorde INT NOT NULL DEFAULT 0,
  aangemaakt_op TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (editie_id) REFERENCES edities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editie_subcategorieen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categorie_id INT NOT NULL,
  naam VARCHAR(100) NOT NULL,
  volgorde INT NOT NULL DEFAULT 0,
  FOREIGN KEY (categorie_id) REFERENCES editie_categorieen(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editie_criteria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subcategorie_id INT NOT NULL,
  naam VARCHAR(100) NOT NULL,
  omschrijving TEXT,
  max_score DECIMAL(8,2) NOT NULL DEFAULT 10,
  volgorde INT NOT NULL DEFAULT 0,
  FOREIGN KEY (subcategorie_id) REFERENCES editie_subcategorieen(id) ON DELETE CASCADE
);

-- Jury moment system
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
