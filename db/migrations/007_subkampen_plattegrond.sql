-- 007_subkampen_plattegrond.sql — Subkampen en plattegrond editor

-- Subkampen (per editie, met optionele groep/verenigingskoppeling)
CREATE TABLE IF NOT EXISTS subkampen (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  editie_id      INT           NOT NULL,
  naam           VARCHAR(100)  NOT NULL,
  kleur          VARCHAR(7)    NOT NULL DEFAULT '#3498db',
  omschrijving   TEXT          NULL,
  groep_id       INT           NULL,
  vereniging_id  INT           NULL,
  volgorde       INT           NOT NULL DEFAULT 0,
  aangemaakt_op  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (editie_id)     REFERENCES edities(id)      ON DELETE CASCADE,
  FOREIGN KEY (groep_id)      REFERENCES groepen(id)      ON DELETE SET NULL,
  FOREIGN KEY (vereniging_id) REFERENCES verenigingen(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Plattegrond (één per editie)
-- cellen: JSON map  "rij,kolom" → { type, subkamp_id, patrouille_id, nummer }
-- type: "onbruikbaar" | "wedstrijd" | "HQ"
-- afbeelding: base64-gecodeerde achtergrondafbeelding
CREATE TABLE IF NOT EXISTS plattegronden (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  editie_id      INT           NOT NULL UNIQUE,
  rijen          INT           NOT NULL DEFAULT 10,
  kolommen       INT           NOT NULL DEFAULT 10,
  cel_grootte    INT           NOT NULL DEFAULT 60,
  cellen         JSON          NULL,
  vergrendeld    TINYINT(1)    NOT NULL DEFAULT 0,
  indeling_vast  TINYINT(1)    NOT NULL DEFAULT 0,
  gepubliceerd   TINYINT(1)    NOT NULL DEFAULT 0,
  aangemaakt_op  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  bijgewerkt_op  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (editie_id) REFERENCES edities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Afbeelding apart opgeslagen (groot, apart laden)
CREATE TABLE IF NOT EXISTS plattegrond_afbeeldingen (
  plattegrond_id INT  NOT NULL PRIMARY KEY,
  afbeelding     LONGTEXT NOT NULL,
  bijgewerkt_op  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plattegrond_id) REFERENCES plattegronden(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
