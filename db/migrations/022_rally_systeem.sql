-- 022_rally_systeem.sql — Rally scan systeem: patrouille QR-codes + bezoeken tracking

-- Voeg rally-velden toe aan jurymomenten
ALTER TABLE jurymomenten
  ADD COLUMN rally_modus       TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN score_niveau      ENUM('subcategorie','criterium') NOT NULL DEFAULT 'criterium',
  ADD COLUMN aankomst_punten   INT NOT NULL DEFAULT 0;

-- Patrouille QR-tokens (permanent per editie, herbruikbaar per station)
CREATE TABLE patrouille_qr_tokens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  editie_id      INT NOT NULL,
  patrouille_id  INT NOT NULL,
  token          VARCHAR(64) NOT NULL UNIQUE,
  aangemaakt_op  DATETIME NOT NULL DEFAULT NOW(),
  FOREIGN KEY (editie_id)     REFERENCES edities(id)     ON DELETE CASCADE,
  FOREIGN KEY (patrouille_id) REFERENCES patrouilles(id) ON DELETE CASCADE,
  UNIQUE KEY uniek_per_editie_patrouille (editie_id, patrouille_id)
);

-- Bezoeken: registratie van patrouille aankomst per station
CREATE TABLE patrouille_bezoeken (
  id                        INT AUTO_INCREMENT PRIMARY KEY,
  jurymoment_id             INT NOT NULL,
  subkamp_id                INT NOT NULL,
  patrouille_id             INT NOT NULL,
  aankomst_tijd             DATETIME NOT NULL DEFAULT NOW(),
  vertrek_tijd              DATETIME NULL,
  status                    ENUM('aangekomen','bezig','voltooid') NOT NULL DEFAULT 'aangekomen',
  aankomst_punten_gegeven   INT NOT NULL DEFAULT 0,
  FOREIGN KEY (jurymoment_id) REFERENCES jurymomenten(id) ON DELETE CASCADE,
  FOREIGN KEY (subkamp_id)    REFERENCES subkampen(id)    ON DELETE CASCADE,
  FOREIGN KEY (patrouille_id) REFERENCES patrouilles(id)  ON DELETE CASCADE,
  UNIQUE KEY uniek_bezoek (jurymoment_id, subkamp_id, patrouille_id)
);
